// @story #2052
import { createHash } from 'node:crypto';
import { observeContent } from './native-observation.mjs';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';

const budgets = new WeakMap();
const types = {
  NUMBER: 'Number',
  TEXT: 'Text',
  DATE: 'Date',
  SINGLE_SELECT: 'SingleSelect',
  ITERATION: 'Iteration',
};
const field = 'field{... on ProjectV2FieldCommon{id dataType project{id}}}';
const history =
  'lastEditedAt includesCreatedEdit userContentEdits(first:1){totalCount nodes{id editedAt deletedAt} pageInfo{hasNextPage}}';
const document = `query StoryCacheSnapshot($issue:ID!,$item:ID!,$commentsAfter:String,$assigneesAfter:String,$fieldsAfter:String,$readComments:Boolean!,$readAssignees:Boolean!,$readFields:Boolean!){
 issue:node(id:$issue){__typename ... on Issue{id number url repository{nameWithOwner} title body ${history}
 comments(first:100,after:$commentsAfter)@include(if:$readComments){totalCount nodes{__typename id body ${history} author{login} createdAt updatedAt url issue{id}} pageInfo{hasNextPage endCursor}}
 assignees(first:100,after:$assigneesAfter)@include(if:$readAssignees){totalCount nodes{id login} pageInfo{hasNextPage endCursor}}}}
 item:node(id:$item){__typename ... on ProjectV2Item{id isArchived project{id} content{__typename ... on Issue{id}}
 fieldValues(first:100,after:$fieldsAfter)@include(if:$readFields){totalCount nodes{__typename
 ... on ProjectV2ItemFieldValueCommon{id ${field}}
 ... on ProjectV2ItemFieldNumberValue{number} ... on ProjectV2ItemFieldTextValue{text} ... on ProjectV2ItemFieldDateValue{date}
 ... on ProjectV2ItemFieldSingleSelectValue{name optionId} ... on ProjectV2ItemFieldIterationValue{iterationId}
 ${['Label', 'Milestone', 'PullRequest', 'Repository', 'Reviewer', 'User'].map((t) => `... on ProjectV2ItemField${t}Value{${field}}`).join(' ')}
 ... on ProjectV2ItemIssueFieldValue{${field}}} pageInfo{hasNextPage endCursor}}}}}`;
function fail(reason) {
  throw Object.assign(new Error(`Story snapshot unavailable: ${reason}`), {
    code: 'STORY_SNAPSHOT_UNAVAILABLE',
    reason,
  });
}
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const id = (v) => typeof v === 'string' && v.length > 0 && !/[\s\p{Cc}]/u.test(v);
const hash = (v) => createHash('sha256').update(v, 'utf8').digest('hex');
function freeze(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    for (const child of Object.values(v)) freeze(child);
    Object.freeze(v);
  }
  return v;
}
/** One invocation token; callers share it across preflight, final census and recovery. */
export function createStoryReadBudget(limits = {}) {
  if (!object(limits) || Object.keys(limits).some((k) => !['maxPages', 'maxBytes'].includes(k)))
    fail('budget-limits');
  const { maxPages = 10, maxBytes = 4194304 } = limits;
  if (
    !Number.isSafeInteger(maxPages) ||
    maxPages < 1 ||
    maxPages > 10 ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > 4194304
  )
    fail('budget-limits');
  const token = Object.freeze({});
  budgets.set(token, {
    maxPages,
    maxBytes,
    pages: 0,
    bytes: 0,
    busy: false,
    failed: false,
    scope: null,
  });
  return token;
}
function configuration(fields) {
  if (!Array.isArray(fields)) fail('field-configuration');
  const seen = new Set();
  return fields
    .map((f) => {
      if (!object(f) || !id(f.fieldId) || !Object.hasOwn(types, f.type) || seen.has(f.fieldId))
        fail('field-configuration');
      seen.add(f.fieldId);
      return { fieldId: f.fieldId, type: f.type };
    })
    .sort((a, b) => a.fieldId.localeCompare(b.fieldId));
}
function target(issue, item, identity) {
  if (
    !object(issue) ||
    issue.__typename !== 'Issue' ||
    issue.id !== identity.issueNodeId ||
    issue.number !== identity.issueNumber ||
    issue.repository?.nameWithOwner?.toLowerCase() !== identity.repository
  )
    fail('issue-identity');
  if (
    issue.url !== `https://${identity.host}/${identity.repository}/issues/${identity.issueNumber}`
  ) {
    // GitHub may preserve owner/name capitalization in its canonical URL.
    if (
      typeof issue.url !== 'string' ||
      issue.url.toLowerCase() !==
        `https://${identity.host}/${identity.repository}/issues/${identity.issueNumber}`
    )
      fail('issue-host');
  }
  if (
    !object(item) ||
    item.__typename !== 'ProjectV2Item' ||
    item.id !== identity.projectItemId ||
    item.isArchived !== false ||
    item.project?.id !== identity.projectId ||
    item.content?.__typename !== 'Issue' ||
    item.content?.id !== identity.issueNodeId
  )
    fail('item-membership');
  if (typeof issue.title !== 'string' || !issue.title.isWellFormed()) fail('title-unreadable');
}
function connectionState() {
  return { total: null, nodes: [], ids: new Set(), cursors: new Set(), after: null, done: false };
}
function ingest(state, connection, key) {
  if (
    !object(connection) ||
    !Number.isSafeInteger(connection.totalCount) ||
    connection.totalCount < 0 ||
    !Array.isArray(connection.nodes) ||
    connection.nodes.length > 100 ||
    !object(connection.pageInfo) ||
    typeof connection.pageInfo.hasNextPage !== 'boolean'
  )
    fail(`connection-${key}`);
  if (state.total !== null && state.total !== connection.totalCount) fail(`count-drift-${key}`);
  state.total = connection.totalCount;
  for (const node of connection.nodes) {
    const identity = key === 'fields' ? node?.field?.id : node?.id;
    if (!object(node) || !id(identity) || state.ids.has(identity))
      fail(`duplicate-or-unreadable-${key}`);
    state.ids.add(identity);
    state.nodes.push(node);
  }
  const { hasNextPage, endCursor } = connection.pageInfo;
  if (state.nodes.length > state.total) fail(`count-overflow-${key}`);
  if (hasNextPage) {
    if (
      !connection.nodes.length ||
      state.nodes.length >= state.total ||
      !id(endCursor) ||
      state.cursors.has(endCursor)
    )
      fail(`cursor-${key}`);
    state.cursors.add(endCursor);
    state.after = endCursor;
  } else {
    if (endCursor !== null && !id(endCursor)) fail(`terminal-cursor-${key}`);
    if (state.nodes.length !== state.total) fail(`incomplete-${key}`);
    state.done = true;
  }
}
function fieldValues(nodes, configured, identity) {
  const byField = new Map();
  const valueIds = new Set();
  const known = new Set([
    ...Object.values(types).map((t) => `ProjectV2ItemField${t}Value`),
    ...['Label', 'Milestone', 'PullRequest', 'Repository', 'Reviewer', 'User'].map(
      (t) => `ProjectV2ItemField${t}Value`
    ),
    'ProjectV2ItemIssueFieldValue',
  ]);
  for (const n of nodes) {
    if (
      !known.has(n.__typename) ||
      n.field?.project?.id !== identity.projectId ||
      !id(n.field?.dataType)
    )
      fail('field-identity');
    if (n.id !== undefined && (!id(n.id) || valueIds.has(n.id))) fail('field-value-identity');
    if (n.id !== undefined) valueIds.add(n.id);
    byField.set(n.field.id, n);
  }
  return configured.map(({ fieldId, type }) => {
    const n = byField.get(fieldId);
    let value = { state: 'absent' };
    if (n) {
      if (n.__typename !== `ProjectV2ItemField${types[type]}Value` || n.field.dataType !== type)
        fail('field-type');
      if (type === 'SINGLE_SELECT') {
        if (n.optionId === null && n.name === null) value = null;
        else if (id(n.optionId) && typeof n.name === 'string')
          value = { optionId: n.optionId, name: n.name };
        else fail('select-value');
      } else {
        const prop = { NUMBER: 'number', TEXT: 'text', DATE: 'date', ITERATION: 'iterationId' }[
          type
        ];
        value = n[prop];
        if (value !== null) {
          if (
            type === 'NUMBER'
              ? typeof value !== 'number' || !Number.isFinite(value)
              : typeof value !== 'string' || !value.isWellFormed()
          )
            fail('field-value');
          if (type === 'ITERATION' && !id(value)) fail('iteration-value');
          if (
            type === 'DATE' &&
            (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
              !Number.isFinite(Date.parse(value)) ||
              new Date(value).toISOString().slice(0, 10) !== value)
          )
            fail('date-value');
        }
      }
    }
    return { itemId: identity.projectItemId, fieldId, type, value };
  });
}
/** Complete bounded current census, never an atomic provider transaction or write capability. */
export async function readStorySnapshot({ identity, transport, budget } = {}) {
  const state = budgets.get(budget);
  if (!state || state.busy || state.failed) fail('budget-unavailable');
  state.busy = true;
  try {
    // Reuse the predecessor's canonical identity validation without granting an observation.
    const seed = {
      id: identity?.issueNodeId,
      body: '',
      lastEditedAt: null,
      includesCreatedEdit: false,
      userContentEdits: { totalCount: 0, nodes: [] },
    };
    const subject = observeContent({ identity, node: seed, body: '' }).identity;
    if (!object(transport) || typeof transport.query !== 'function') fail('transport');
    const query = transport.query.bind(transport);
    const configured = configuration(transport.fields);
    const scope = canonicalRecordJson({ identity: subject, configured });
    if (state.scope !== null && state.scope !== scope) fail('budget-scope');
    state.scope = scope;
    const states = {
      comments: connectionState(),
      assignees: connectionState(),
      fields: connectionState(),
    };
    let anchor, body, title;
    while (Object.values(states).some((s) => !s.done)) {
      if (state.pages >= state.maxPages || state.bytes >= state.maxBytes) fail('budget-exhausted');
      const pending = Object.keys(states).filter((k) => !states[k].done);
      const selected = state.pages === 0 || anchor === undefined ? pending : pending.slice(0, 1);
      const variables = {
        issue: subject.issueNodeId,
        item: subject.projectItemId,
        commentsAfter: states.comments.after,
        assigneesAfter: states.assignees.after,
        fieldsAfter: states.fields.after,
        readComments: selected.includes('comments'),
        readAssignees: selected.includes('assignees'),
        readFields: selected.includes('fields'),
      };
      state.pages++;
      const raw = await query({
        document,
        variables,
        maxResponseBytes: state.maxBytes - state.bytes,
      });
      if (typeof raw !== 'string' || !raw.isWellFormed()) fail('raw-response');
      state.bytes += Buffer.byteLength(raw, 'utf8');
      if (state.bytes > state.maxBytes) fail('byte-budget');
      let result;
      try {
        result = JSON.parse(raw);
      } catch {
        fail('response-json');
      }
      if (
        !object(result) ||
        (Object.hasOwn(result, 'errors') &&
          (!Array.isArray(result.errors) || result.errors.length)) ||
        !object(result.data)
      )
        fail('partial-response');
      const { issue, item } = result.data;
      target(issue, item, subject);
      const observation = observeContent({ identity: subject, node: issue, body: issue.body });
      const fingerprint = canonicalRecordJson({
        title: issue.title,
        digest: observation.digest,
        revision: observation.revision,
      });
      if (anchor !== undefined && anchor !== fingerprint) fail('issue-drift');
      anchor = fingerprint;
      body = observation;
      title = issue.title;
      for (const key of selected)
        ingest(states[key], key === 'fields' ? item.fieldValues : issue[key], key);
    }
    const resources = { [body.key]: body };
    for (const n of states.comments.nodes) {
      if (
        n.__typename !== 'IssueComment' ||
        n.id === subject.issueNodeId ||
        n.issue?.id !== subject.issueNodeId ||
        !(n.author === null || (object(n.author) && id(n.author.login))) ||
        !['createdAt', 'updatedAt'].every(
          (k) => typeof n[k] === 'string' && Number.isFinite(Date.parse(n[k]))
        ) ||
        typeof n.url !== 'string' ||
        !n.url
          .toLowerCase()
          .startsWith(
            `https://${subject.host}/${subject.repository}/issues/${subject.issueNumber}#issuecomment-`
          )
      )
        fail('comment-source');
      const observed = observeContent({ identity: subject, node: n, body: n.body });
      resources[observed.key] = {
        ...observed,
        source: { author: n.author, createdAt: n.createdAt, updatedAt: n.updatedAt, url: n.url },
      };
    }
    const logins = new Set();
    for (const n of states.assignees.nodes) {
      if (!id(n.login) || logins.has(n.login.toLowerCase())) fail('assignee');
      logins.add(n.login.toLowerCase());
    }
    const fields = fieldValues(states.fields.nodes, configured, subject);
    return freeze({
      identity: subject,
      title,
      titleDigest: hash(title),
      resources,
      inventory: states.comments.nodes.map((n) => n.id).sort(),
      assignees: [...logins].sort(),
      fields,
      fieldsDigest: hash(
        canonicalRecordJson({ canonicalizationVersion: 'aitm.canonical-json/v1', fields })
      ),
      complete: true,
      coverage: {
        dispatches: state.pages,
        bytes: state.bytes,
        measurement: 'returned-utf8-json',
        atomic: false,
      },
    });
  } catch (error) {
    state.failed = true;
    if (error.code === 'STORY_SNAPSHOT_UNAVAILABLE') throw error;
    throw Object.assign(
      new Error('Story snapshot unavailable: observation-or-transport', { cause: error }),
      { code: 'STORY_SNAPSHOT_UNAVAILABLE', reason: 'observation-or-transport' }
    );
  } finally {
    state.busy = false;
  }
}
