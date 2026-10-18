// @story #1990 — one invocation owns fresh remote bytes; no admission cache.
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { pexec } from '../../gh/lib/gh-client.mjs';
import { mapSubIssueNodes } from '../../gh/lib/wave-admission.mjs';
import { parseIssueKind } from './issue-kind.mjs';
import { fieldIdFor } from '../project-fields.mjs';
import { readDeepDiveSignals } from './deep-dive.mjs';
import { normalizeStateId } from './lifecycle-policy/index.mjs';
import { canonicalDecompositionJson } from './decomposition-assessment.mjs';
import { collectDecompositionAuthority } from './decomposition-authority.mjs';
import { sessionNetworkSkipped } from './verb-preflight.mjs';

const fieldIdentity = 'field{... on ProjectV2FieldCommon{id name}}';
const computedFieldTypes = ['Label', 'Milestone', 'PullRequest', 'Repository', 'Reviewer', 'User']
  .map((type) => '... on ProjectV2ItemField' + type + 'Value{' + fieldIdentity + '}')
  .join(' ');
const fields =
  'fieldValues(first:100){nodes{__typename ... on ProjectV2ItemFieldValueCommon{id ' +
  fieldIdentity +
  '} ... on ProjectV2ItemFieldNumberValue{number} ... on ProjectV2ItemFieldSingleSelectValue{name} ' +
  computedFieldTypes +
  ' ... on ProjectV2ItemIssueFieldValue{' +
  fieldIdentity +
  '}} pageInfo{hasNextPage endCursor}}';
const projectItems =
  'projectItems(first:50){nodes{id project{id} fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{name}} ' +
  fields +
  '} pageInfo{hasNextPage endCursor}}';
const comments =
  'comments(first:100){nodes{__typename id databaseId body createdAt updatedAt url author{login} issue{number repository{nameWithOwner}}} pageInfo{hasNextPage endCursor}}';
const subIssues =
  'subIssues(first:50){nodes{id number title body state stateReason labels(first:100){nodes{id name} pageInfo{hasNextPage endCursor}} blockedBy(first:100){nodes{id number} pageInfo{hasNextPage endCursor}} ' +
  projectItems +
  '} pageInfo{hasNextPage endCursor}}';
const hash = (value) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : canonicalDecompositionJson(value))
    .digest('hex');
const observed = (value) => ({ status: 'observed', value, revision: null, digest: hash(value) });

export async function collectHookDecompositionSnapshot({ issue, cfg, projectDir, deps = {} }) {
  if (sessionNetworkSkipped()) throw new Error('authority-read-skipped');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(cfg.repo ?? '') || !cfg.projectId)
    throw new Error('configured authority missing');
  const started = performance.now();
  const remoteDeadline = started + 5000;
  const totalDeadline = started + 6000;
  const [owner, name] = cfg.repo.split('/');
  const query =
    'query {viewer{login} repository(owner:' +
    JSON.stringify(owner) +
    ',name:' +
    JSON.stringify(name) +
    '){issue(number:' +
    issue +
    '){id number body assignees(first:100){nodes{login}} ' +
    projectItems +
    ' ' +
    comments +
    ' ' +
    subIssues +
    '}}}';
  const remote = async (request) => {
    const remaining = Math.floor(remoteDeadline - performance.now());
    if (remaining <= 0) throw new Error('remote-deadline');
    const execute =
      deps.graphql ??
      (async ({ query, timeout }) =>
        JSON.parse(
          (
            await pexec('gh', ['api', 'graphql', '-f', 'query=' + query], {
              timeout,
              maxBuffer: 4 * 1024 * 1024,
            })
          ).stdout
        ));
    let timer;
    let result;
    try {
      result = await Promise.race([
        execute({ ...request, timeout: remaining }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('remote-deadline')), remaining);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    if (performance.now() > remoteDeadline) throw new Error('remote-deadline');
    if (!result || result.errors?.length) throw new Error('provider-response');
    return result;
  };
  const response = structuredClone(await remote({ query }));
  async function complete(connection, fetchPage, resource) {
    if (!Array.isArray(connection?.nodes) || typeof connection.pageInfo?.hasNextPage !== 'boolean')
      throw new Error(resource + ' incomplete');
    const nodes = [...connection.nodes];
    const seenCursors = new Set();
    let info = connection.pageInfo;
    for (let page = 0; info.hasNextPage; page++) {
      const cursor = info.endCursor;
      if (page >= 2 || typeof cursor !== 'string' || !cursor || seenCursors.has(cursor))
        throw new Error(resource + ' continuation overflow');
      seenCursors.add(cursor);
      const next = await fetchPage(cursor);
      if (!Array.isArray(next?.nodes) || typeof next.pageInfo?.hasNextPage !== 'boolean')
        throw new Error(resource + ' continuation incomplete');
      nodes.push(...next.nodes);
      info = next.pageInfo;
    }
    const ids = nodes.map((node) => node.id ?? node.field?.id);
    if (ids.some((id) => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length)
      throw new Error(resource + ' duplicate or missing identity');
    return { nodes, pageInfo: { hasNextPage: false, endCursor: null } };
  }
  const repoPrefix =
    'repository(owner:' +
    JSON.stringify(owner) +
    ',name:' +
    JSON.stringify(name) +
    '){issue(number:' +
    issue +
    '){number ';
  const issuePage = async (selection) => {
    const result = await remote({ query: 'query {' + repoPrefix + selection + '}}}' });
    if (result.data?.repository?.issue?.number !== issue) throw new Error('mixed issue page');
    return result.data.repository.issue;
  };
  const node = response.data?.repository?.issue;
  if (node?.number !== issue || typeof node.body !== 'string')
    throw new Error('issue snapshot incomplete');
  node.projectItems = await complete(
    node.projectItems,
    async (cursor) =>
      (
        await issuePage(
          projectItems.replace('first:50', 'first:50,after:' + JSON.stringify(cursor))
        )
      ).projectItems,
    'project-membership'
  );
  const connection = node.projectItems;
  if (
    node?.number !== issue ||
    typeof node.body !== 'string' ||
    !Array.isArray(connection?.nodes) ||
    connection.pageInfo?.hasNextPage !== false
  )
    throw new Error('issue/project snapshot incomplete');
  const items = connection.nodes.filter((item) => item.project?.id === cfg.projectId);
  if (items.length !== 1 || typeof items[0].id !== 'string')
    throw new Error('configured membership unavailable');
  const item = items[0];
  item.fieldValues = await complete(
    item.fieldValues,
    async (cursor) => {
      const result = await remote({
        query:
          'query {node(id:' +
          JSON.stringify(item.id) +
          '){... on ProjectV2Item{' +
          fields.replace('first:100', 'first:100,after:' + JSON.stringify(cursor)) +
          '}}}',
      });
      return result.data?.node?.fieldValues;
    },
    'project-fields'
  );
  node.comments = await complete(
    node.comments,
    async (cursor) =>
      (await issuePage(comments.replace('first:100', 'first:100,after:' + JSON.stringify(cursor))))
        .comments,
    'forecast-comments'
  );
  let children = [];
  if (parseIssueKind(node.body) === 'epic') {
    node.subIssues = await complete(
      node.subIssues,
      async (cursor) =>
        (
          await issuePage(
            subIssues.replace(
              'subIssues(first:50)',
              'subIssues(first:50,after:' + JSON.stringify(cursor) + ')'
            )
          )
        ).subIssues,
      'children'
    );
    for (const child of node.subIssues.nodes) {
      const childPage = async (selection) => {
        const result = await remote({
          query:
            'query {node(id:' + JSON.stringify(child.id) + '){... on Issue{id ' + selection + '}}}',
        });
        if (result.data?.node?.id !== child.id) throw new Error('mixed child page');
        return result.data.node;
      };
      child.projectItems = await complete(
        child.projectItems,
        async (cursor) =>
          (
            await childPage(
              projectItems.replace('first:50', 'first:50,after:' + JSON.stringify(cursor))
            )
          ).projectItems,
        'child-membership'
      );
      const matches = child.projectItems.nodes.filter(
        (entry) => entry.project?.id === cfg.projectId
      );
      if (matches.length !== 1) throw new Error('child membership unavailable');
      const selected = matches[0];
      selected.fieldValues = await complete(
        selected.fieldValues,
        async (cursor) => {
          const result = await remote({
            query:
              'query {node(id:' +
              JSON.stringify(selected.id) +
              '){... on ProjectV2Item{' +
              fields.replace('first:100', 'first:100,after:' + JSON.stringify(cursor)) +
              '}}}',
          });
          return result.data?.node?.fieldValues;
        },
        'child-fields'
      );
      const labels = 'labels(first:100){nodes{id name} pageInfo{hasNextPage endCursor}}';
      child.labels = await complete(
        child.labels,
        async (cursor) =>
          (
            await childPage(
              labels.replace('first:100', 'first:100,after:' + JSON.stringify(cursor))
            )
          ).labels,
        'child-labels'
      );
      const dependencies = 'blockedBy(first:100){nodes{id number} pageInfo{hasNextPage endCursor}}';
      child.blockedBy = await complete(
        child.blockedBy,
        async (cursor) =>
          (
            await childPage(
              dependencies.replace('first:100', 'first:100,after:' + JSON.stringify(cursor))
            )
          ).blockedBy,
        'child-dependencies'
      );
    }
    children = mapSubIssueNodes(node.subIssues.nodes, cfg).map((child, index) => ({
      ...child,
      blockedBy: node.subIssues.nodes[index].blockedBy.nodes.map((dependency) => dependency.number),
    }));
  }
  const value = (key) => {
    const matches = item.fieldValues.nodes.filter(
      (field) => field.field?.id === (key === 'status' ? cfg.kanbanFieldId : fieldIdFor(cfg, key))
    );
    if (matches.length > 1) throw new Error('duplicate field');
    return matches[0]?.number ?? matches[0]?.name ?? null;
  };
  const subject = {
    repository: cfg.repo.toLowerCase(),
    issue,
    projectId: cfg.projectId,
    projectItemId: item.id,
  };
  const collection = collectDecompositionAuthority({
    subject,
    cfg,
    projectDir,
    deps: {
      readIssue: async () => observed({ number: issue, body: node.body }),
      readProject: async () =>
        observed({
          projectId: cfg.projectId,
          projectItemId: item.id,
          estimate: value('estimate'),
          size: value('size'),
          children,
        }),
      forecast: { graphql: async () => response },
      readPlanAtCommit:
        deps.readPlanAtCommit ??
        (async ({ planCommit, planPath }) => {
          const timeout = Math.floor(totalDeadline - performance.now());
          if (timeout <= 0) throw new Error('local-plan-deadline');
          return (
            await pexec('git', ['show', planCommit + ':' + planPath], {
              cwd: projectDir,
              timeout,
              maxBuffer: 1024 * 1024,
            })
          ).stdout;
        }),
    },
  });
  let totalTimer;
  let current;
  try {
    const remaining = Math.floor(totalDeadline - performance.now());
    if (remaining <= 0) throw new Error('total-deadline');
    current = await Promise.race([
      collection,
      new Promise((_, reject) => {
        totalTimer = setTimeout(() => reject(new Error('total-deadline')), remaining);
      }),
    ]);
  } finally {
    clearTimeout(totalTimer);
  }
  if (performance.now() > totalDeadline) throw new Error('total-deadline');
  const flags = readDeepDiveSignals(node.body);
  if (!Array.isArray(node.assignees?.nodes) || typeof response.data?.viewer?.login !== 'string')
    throw new Error('ownership unavailable');
  return {
    subject,
    current,
    signals: {
      state: normalizeStateId(cfg.kanbanFieldId ? value('status') : item.fieldValueByName?.name),
      body: node.body,
      hasPostedMarker: flags.hasPosted,
      hasCompleteMarker: flags.hasComplete,
      assignees: node.assignees.nodes.map((owner) => owner.login),
      currentUser: response.data.viewer.login,
      source: 'fresh-combined-snapshot',
    },
  };
}
