// @story #2073 — observations of exact effects; never an authorization capability.
import { performance } from 'node:perf_hooks';
import { pexec } from '../../gh/lib/gh-client.mjs';
import { fieldIdFor } from '../project-fields.mjs';
import { parseIssueFieldDb } from '../issue-field-db.mjs';

const identity =
  '__typename ... on ProjectV2Item{id project{id} content{__typename ... on Issue{id number repository{nameWithOwner}}}';
const common = 'field{... on ProjectV2FieldCommon{id}}';
const values =
  'fieldValues(first:100){nodes{__typename ... on ProjectV2ItemFieldValueCommon{id ' +
  common +
  '} ... on ProjectV2ItemFieldNumberValue{number} ... on ProjectV2ItemFieldSingleSelectValue{name optionId} ' +
  ['Label', 'Milestone', 'PullRequest', 'Repository', 'Reviewer', 'User']
    .map((type) => '... on ProjectV2ItemField' + type + 'Value{' + common + '}')
    .join(' ') +
  ' ... on ProjectV2ItemIssueFieldValue{' +
  common +
  '}} pageInfo{hasNextPage endCursor}}';
const definitions =
  'fields(first:100){nodes{... on ProjectV2FieldCommon{id dataType project{id}} ... on ProjectV2SingleSelectField{options{id name}}} pageInfo{hasNextPage endCursor}}';
const BINDING = `query TargetBinding($owner:String!,$repo:String!,$number:Int!,$item:ID!){repository(owner:$owner,name:$repo){issue(number:$number){id number repository{nameWithOwner}}} node(id:$item){${identity}}}}`;
const PROJECT = `query TargetProjectValues($item:ID!,$project:ID!){node(id:$item){${identity} ${values}}} project:node(id:$project){__typename ... on ProjectV2{id ${definitions}}}}`;
const VALUE_PAGE = `query TargetProjectValuePage($item:ID!,$after:String!){node(id:$item){${identity} ${values.replace('first:100', 'first:100,after:$after')}}}}`;
const DEFINITION_PAGE = `query TargetProjectDefinitions($project:ID!,$after:String!){node(id:$project){__typename ... on ProjectV2{id ${definitions.replace('first:100', 'first:100,after:$after')}}}}`;
const BODY =
  'query TargetBodyFields($issue:ID!){node(id:$issue){__typename ... on Issue{id number repository{nameWithOwner} body}}}';
const computedTypes = new Set(
  ['Label', 'Milestone', 'PullRequest', 'Repository', 'Reviewer', 'User']
    .map((type) => 'ProjectV2ItemField' + type + 'Value')
    .concat('ProjectV2ItemIssueFieldValue')
);
const valueTypes = new Set([
  ...computedTypes,
  ...['Date', 'Iteration', 'Number', 'SingleSelect', 'Text'].map(
    (type) => 'ProjectV2ItemField' + type + 'Value'
  ),
]);
const sizes = ['XS', 'S', 'M', 'L', 'XL'];
const fail = (reason) => {
  throw new Error('target-observation:' + reason);
};
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
function scalar(value, kind) {
  if (value === null) return null;
  if (kind === 'estimate' && typeof value === 'number' && Number.isFinite(value) && value >= 0)
    return value;
  if (kind === 'size' && sizes.includes(value)) return value;
  fail('invalid-' + kind);
}
function strictBodyValues(body) {
  const markers = [
    ...body.matchAll(/<!--\s*(?:aitm-fields\b|ai-task-manager:fields:[A-Za-z-]*)/gi),
  ];
  const current = markers.filter((m) => /aitm-fields\b/i.test(m[0]));
  let start, end, json;
  if (current.length === 1 && markers.length === 1) {
    const block = body.slice(current[0].index).match(/^<!--\s*aitm-fields:\s*([^]*?)-->/);
    if (!block) fail('body-block');
    start = current[0].index;
    end = start + block[0].length;
    json = block[1];
  } else if (
    current.length === 0 &&
    markers.length === 2 &&
    /fields:start/.test(markers[0][0]) &&
    /fields:end/.test(markers[1][0])
  ) {
    start = markers[0].index;
    const block = body
      .slice(start)
      .match(
        /^<!--\s*ai-task-manager:fields:start\s*-->\s*```json\s*([^]*?)\s*```\s*<!--\s*ai-task-manager:fields:end\s*-->/
      );
    if (!block) fail('body-block');
    end = start + block[0].length;
    json = block[1];
  } else fail('body-block-inventory');
  let raw;
  try {
    raw = JSON.parse(json);
  } catch {
    fail('body-json');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('body-object');
  const fields = Object.hasOwn(raw, 'values') ? raw.values : raw;
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) fail('body-values');
  const parsed = parseIssueFieldDb(body);
  if (
    !parsed.ok ||
    parsed.end !== end ||
    parsed.start > start ||
    body.slice(parsed.start, start).trim()
  )
    fail('body-block-range');
  return {
    estimate: scalar(Object.hasOwn(fields, 'estimate') ? fields.estimate : null, 'estimate'),
    size: scalar(Object.hasOwn(fields, 'size') ? fields.size : null, 'size'),
  };
}
async function defaultGraphql({ query, variables, timeout, maxResponseBytes }) {
  const args = [];
  for (const [key, value] of Object.entries(variables))
    args.push(typeof value === 'number' || value === null ? '-F' : '-f', key + '=' + value);
  return JSON.parse(
    (
      await pexec('gh', ['api', 'graphql', '-f', 'query=' + query, ...args], {
        timeout,
        maxBuffer: maxResponseBytes,
      })
    ).stdout
  );
}
export async function createFieldEffectReaders({
  subject,
  cfg,
  graphql = defaultGraphql,
  now = () => performance.now(),
  limits = {},
}) {
  const cap = { maxPages: 3, timeoutMs: 30000, maxResponseBytes: 4194304 };
  for (const key of Object.keys(limits))
    if (
      !Object.hasOwn(cap, key) ||
      !Number.isInteger(limits[key]) ||
      limits[key] <= 0 ||
      limits[key] > cap[key]
    )
      fail('limits');
  const policy = { ...cap, ...limits };
  if (
    !subject ||
    subject.repository !== String(cfg.repo).toLowerCase() ||
    subject.projectId !== cfg.projectId ||
    !Number.isInteger(subject.issue) ||
    subject.issue <= 0 ||
    !nonempty(subject.projectItemId) ||
    !nonempty(subject.projectId) ||
    !/^[\w.-]+\/[\w.-]+$/.test(subject.repository)
  )
    fail('subject');
  const estimateId = fieldIdFor(cfg, 'estimate'),
    sizeId = fieldIdFor(cfg, 'size');
  if (!nonempty(estimateId) || !nonempty(sizeId) || estimateId === sizeId)
    fail('definition-configuration');
  const [owner, repo] = subject.repository.split('/');
  const scope = () => {
    const deadline = now() + policy.timeoutMs;
    return async (query, variables) => {
      const timeout = Math.floor(deadline - now());
      if (timeout <= 0) fail('deadline');
      let timer;
      try {
        const result = await Promise.race([
          Promise.resolve().then(() =>
            graphql({ query, variables, timeout, maxResponseBytes: policy.maxResponseBytes })
          ),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('target-observation:deadline')), timeout);
          }),
        ]);
        if (now() > deadline) fail('deadline');
        if (!result || result.errors?.length || !result.data) fail('provider-response');
        if (Buffer.byteLength(JSON.stringify(result)) > policy.maxResponseBytes)
          fail('response-limit');
        return structuredClone(result.data);
      } finally {
        clearTimeout(timer);
      }
    };
  };
  const issueIdentity = (issue, id) => {
    if (
      !issue ||
      !nonempty(issue.id) ||
      (id !== undefined && issue.id !== id) ||
      issue.number !== subject.issue ||
      issue.repository?.nameWithOwner?.toLowerCase() !== subject.repository
    )
      fail('issue-binding');
  };
  const itemIdentity = (item, issueId) => {
    if (
      item?.__typename !== 'ProjectV2Item' ||
      item.id !== subject.projectItemId ||
      item.project?.id !== subject.projectId ||
      item.content?.__typename !== 'Issue'
    )
      fail('item-binding');
    issueIdentity(item.content, issueId);
  };
  const binding = await scope()(BINDING, {
    owner,
    repo,
    number: subject.issue,
    item: subject.projectItemId,
  });
  issueIdentity(binding.repository?.issue);
  const issueId = binding.repository.issue.id;
  itemIdentity(binding.node, issueId);
  const complete = async (connection, fetchPage, category) => {
    const nodes = [],
      seenCursors = new Set();
    let current = connection;
    for (let page = 0; page < policy.maxPages; page++) {
      if (!Array.isArray(current?.nodes) || typeof current.pageInfo?.hasNextPage !== 'boolean')
        fail(category + '-incomplete');
      nodes.push(...current.nodes);
      if (!current.pageInfo.hasNextPage) return nodes;
      const cursor = current.pageInfo.endCursor;
      if (
        !current.nodes.length ||
        !nonempty(cursor) ||
        seenCursors.has(cursor) ||
        page + 1 >= policy.maxPages
      )
        fail(category + '-continuation');
      seenCursors.add(cursor);
      current = await fetchPage(cursor);
    }
    fail(category + '-overflow');
  };
  function projectIdentity(project) {
    if (project?.__typename !== 'ProjectV2' || project.id !== subject.projectId)
      fail('project-binding');
  }
  return {
    async readProjectValues() {
      const request = scope();
      const first = await request(PROJECT, {
        item: subject.projectItemId,
        project: subject.projectId,
      });
      itemIdentity(first.node, issueId);
      projectIdentity(first.project);
      const entries = await complete(
        first.node.fieldValues,
        async (after) => {
          const page = await request(VALUE_PAGE, { item: subject.projectItemId, after });
          itemIdentity(page.node, issueId);
          return page.node.fieldValues;
        },
        'values'
      );
      const defs = await complete(
        first.project.fields,
        async (after) => {
          const page = await request(DEFINITION_PAGE, { project: subject.projectId, after });
          projectIdentity(page.node);
          return page.node.fields;
        },
        'definitions'
      );
      const definitionIds = new Set();
      for (const def of defs) {
        if (
          !nonempty(def?.id) ||
          definitionIds.has(def.id) ||
          def.project?.id !== subject.projectId
        )
          fail('definition-identity');
        definitionIds.add(def.id);
      }
      const estimateDef = defs.find((def) => def.id === estimateId),
        sizeDef = defs.find((def) => def.id === sizeId);
      if (
        estimateDef?.dataType !== 'NUMBER' ||
        sizeDef?.dataType !== 'SINGLE_SELECT' ||
        !Array.isArray(sizeDef.options)
      )
        fail('definition-type');
      const optionIds = new Set(),
        optionNames = new Set();
      for (const option of sizeDef.options) {
        if (
          !nonempty(option?.id) ||
          !nonempty(option.name) ||
          optionIds.has(option.id) ||
          optionNames.has(option.name)
        )
          fail('definition-options');
        optionIds.add(option.id);
        optionNames.add(option.name);
      }
      const valueIds = new Set(),
        fieldsSeen = new Set();
      for (const entry of entries) {
        if (
          !valueTypes.has(entry?.__typename) ||
          (!computedTypes.has(entry.__typename) && !nonempty(entry.id))
        )
          fail('value-type');
        if (
          !nonempty(entry?.field?.id) ||
          fieldsSeen.has(entry.field.id) ||
          !nonempty(entry.__typename)
        )
          fail('value-identity');
        fieldsSeen.add(entry.field.id);
        if (entry.id !== undefined) {
          if (!nonempty(entry.id) || valueIds.has(entry.id)) fail('value-identity');
          valueIds.add(entry.id);
        }
      }
      const number = entries.find((entry) => entry.field.id === estimateId),
        select = entries.find((entry) => entry.field.id === sizeId);
      if (
        number &&
        (number.__typename !== 'ProjectV2ItemFieldNumberValue' || !Object.hasOwn(number, 'number'))
      )
        fail('estimate-type');
      let size = null;
      if (select) {
        if (
          select.__typename !== 'ProjectV2ItemFieldSingleSelectValue' ||
          !Object.hasOwn(select, 'optionId') ||
          !Object.hasOwn(select, 'name')
        )
          fail('size-type');
        if (select.optionId !== null || select.name !== null) {
          if (
            !sizeDef.options.some(
              (option) => option.id === select.optionId && option.name === select.name
            )
          )
            fail('size-option');
          size = scalar(select.name, 'size');
        }
      }
      return { estimate: number ? scalar(number.number, 'estimate') : null, size };
    },
    async readBodyFields() {
      const data = await scope()(BODY, { issue: issueId });
      if (data.node?.__typename !== 'Issue' || typeof data.node.body !== 'string')
        fail('body-identity');
      issueIdentity(data.node, issueId);
      return strictBodyValues(data.node.body);
    },
  };
}
