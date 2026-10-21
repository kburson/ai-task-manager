// @story #2040
import { createHash } from 'node:crypto';

function unavailable(reason) {
  throw Object.assign(new Error(`Story observation unavailable: ${reason}`), {
    code: 'STORY_OBSERVATION_UNAVAILABLE',
    reason,
  });
}
function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function identifier(value) {
  return typeof value === 'string' && value.length > 0 && !/[\s\p{Cc}]/u.test(value);
}
function canonicalIdentity(identity) {
  if (!object(identity)) unavailable('identity-missing');
  const { host, repository, issueNumber, issueNodeId, projectId, projectItemId } = identity;
  if (
    typeof host !== 'string' ||
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host) ||
    host.includes('..')
  )
    unavailable('host-invalid');
  if (
    typeof repository !== 'string' ||
    !/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(repository) ||
    repository.split('/').some((part) => part === '.' || part === '..')
  )
    unavailable('repository-invalid');
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) unavailable('issue-number-invalid');
  if (![issueNodeId, projectId, projectItemId].every(identifier))
    unavailable('identity-node-missing');
  return Object.freeze({
    host: host.toLowerCase(),
    repository: repository.toLowerCase(),
    issueNumber,
    issueNodeId,
    projectId,
    projectItemId,
  });
}
function timestamp(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
  )
    return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  const normalized = value.replace(
    /(?:\.(\d{1,3}))?Z$/,
    (_, fraction = '') => `.${fraction.padEnd(3, '0')}Z`
  );
  return new Date(parsed).toISOString() === normalized ? parsed : null;
}
function observeRevision(node) {
  const history = node.userContentEdits;
  if (
    !object(history) ||
    !Number.isSafeInteger(history.totalCount) ||
    history.totalCount < 0 ||
    !Array.isArray(history.nodes) ||
    typeof node.includesCreatedEdit !== 'boolean'
  )
    unavailable('history-incomplete');
  if (Object.hasOwn(history, 'pageInfo')) {
    if (
      !object(history.pageInfo) ||
      typeof history.pageInfo.hasNextPage !== 'boolean' ||
      history.pageInfo.hasNextPage !== history.totalCount > history.nodes.length
    )
      unavailable('history-page-incomplete');
  }
  if (history.totalCount === 0) {
    if (
      history.nodes.length !== 0 ||
      node.lastEditedAt !== null ||
      node.includesCreatedEdit !== false
    )
      unavailable('unedited-inconsistent');
    return Object.freeze({
      mode: 'unedited',
      editId: null,
      editedAt: null,
      lastEditedAt: null,
      deletedAt: null,
    });
  }
  // A bounded first:1 observation can have older history. Never traverse it or
  // derive a revision from counts, and never select a surviving older edit.
  if (history.nodes.length !== 1) unavailable('latest-edit-ambiguous');
  const latest = history.nodes[0];
  if (!object(latest) || !identifier(latest.id)) unavailable('latest-edit-missing');
  const edited = timestamp(latest.editedAt);
  const last = timestamp(node.lastEditedAt);
  if (edited === null || last === null || edited !== last)
    unavailable('latest-timestamp-inconsistent');
  if (latest.deletedAt !== null) unavailable('latest-edit-unavailable');
  return Object.freeze({
    mode: 'edited',
    editId: latest.id,
    editedAt: latest.editedAt,
    lastEditedAt: node.lastEditedAt,
    deletedAt: null,
  });
}

/** Observe supplied current GitHub content without network or publication authority. */
export function observeContent({ identity, node, body } = {}) {
  const target = canonicalIdentity(identity);
  if (!object(node) || !identifier(node.id)) unavailable('resource-missing');
  if (typeof body !== 'string' || (Object.hasOwn(node, 'body') && node.body !== body))
    unavailable('content-incomplete');
  const kind = node.id === target.issueNodeId ? 'issue' : 'comment';
  if (
    node.__typename !== undefined &&
    node.__typename !== (kind === 'issue' ? 'Issue' : 'IssueComment')
  )
    unavailable('resource-kind-inconsistent');
  return Object.freeze({
    identity: target,
    key: `${kind}:${node.id}`,
    kind,
    body,
    digest: createHash('sha256').update(body, 'utf8').digest('hex'),
    revision: observeRevision(node),
    ownership: 'read-only',
    provenance: Object.freeze({
      observedAt: new Date().toISOString(),
      source: 'github-current',
      complete: true,
    }),
  });
}

// @story #2053 — share the unchanged strict parser with snapshot comparison.
export { timestamp as parseNativeContentTimestamp };
