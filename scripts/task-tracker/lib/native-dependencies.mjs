import { pexec } from '../../gh/lib/gh-client.mjs';
import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';

function fail(category, detail = '') {
  throw new Error(`native-dependencies:${category}${detail ? `: ${detail}` : ''}`);
}

function assertIssueInput(issueNumber, repo) {
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) fail('issue');
  if (typeof repo !== 'string' || !/^[^/]+\/[^/]+$/.test(repo)) fail('repository');
}

function canonicalRefs(refs, { issueNumber } = {}) {
  if (!Array.isArray(refs)) fail('refs');
  const normalized = refs.map(Number);
  if (normalized.some((ref) => !Number.isSafeInteger(ref) || ref <= 0)) fail('ref');
  if (normalized.some((ref) => ref === issueNumber)) fail('self');
  return [...new Set(normalized)].sort((left, right) => left - right);
}

export function normalizeDependencyConnection(
  connection,
  { repo, issueNumber, relation = 'dependency' } = {}
) {
  assertIssueInput(issueNumber, repo);
  if (!connection || !Array.isArray(connection.nodes)) fail(`${relation}-connection`);
  if (!Number.isSafeInteger(connection.totalCount) || connection.totalCount < 0) {
    fail(`${relation}-count`);
  }
  if (connection.pageInfo?.hasNextPage === true) fail(`${relation}-incomplete`);
  if (connection.nodes.length !== connection.totalCount) fail(`${relation}-incomplete`);

  const refs = connection.nodes.map((node) => {
    if (!Number.isSafeInteger(node?.number) || node.number <= 0) fail(`${relation}-node`);
    const observedRepo = node.repository?.nameWithOwner;
    if (observedRepo && observedRepo !== repo) fail(`${relation}-repository`);
    if (node.number === issueNumber) fail(`${relation}-self`);
    return node.number;
  });
  if (new Set(refs).size !== refs.length) fail(`${relation}-duplicate`);
  return refs.sort((left, right) => left - right);
}

export async function readNativeDependencies({ issueNumber, repo, deps = {} } = {}) {
  assertIssueInput(issueNumber, repo);
  const run = deps.pexec || pexec;
  let parsed;
  try {
    const { stdout } = await run(
      'gh',
      [
        'issue',
        'view',
        String(issueNumber),
        '-R',
        repo,
        '--json',
        'blockedBy,blocking',
      ],
      { timeout: GH_API_TIMEOUT_MS }
    );
    parsed = JSON.parse(stdout);
  } catch (error) {
    fail('read', error.message);
  }
  return {
    blockedBy: normalizeDependencyConnection(parsed?.blockedBy, {
      repo,
      issueNumber,
      relation: 'blockedBy',
    }),
    blocking: normalizeDependencyConnection(parsed?.blocking, {
      repo,
      issueNumber,
      relation: 'blocking',
    }),
  };
}

export async function editNativeDependency({ issueNumber, ref, repo, operation, deps = {} } = {}) {
  assertIssueInput(issueNumber, repo);
  const [canonicalRef] = canonicalRefs([ref], { issueNumber });
  if (!['add', 'remove'].includes(operation)) fail('operation');
  const flag = operation === 'add' ? '--add-blocked-by' : '--remove-blocked-by';
  const run = deps.pexec || pexec;
  await run(
    'gh',
    ['issue', 'edit', String(issueNumber), '-R', repo, flag, String(canonicalRef)],
    { timeout: GH_API_TIMEOUT_MS }
  );
}

function sameRefs(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function convergeBlockedBySet({ issueNumber, repo, desired, deps = {} } = {}) {
  assertIssueInput(issueNumber, repo);
  const canonicalDesired = canonicalRefs(desired, { issueNumber });
  const read = deps.readNativeDependencies || readNativeDependencies;
  const edit = deps.editDependency || editNativeDependency;
  const before = await read({ issueNumber, repo, deps: deps.nativeRead });
  const existing = canonicalRefs(before?.blockedBy, { issueNumber });
  const desiredSet = new Set(canonicalDesired);
  const existingSet = new Set(existing);
  const removed = existing.filter((ref) => !desiredSet.has(ref));
  const added = canonicalDesired.filter((ref) => !existingSet.has(ref));

  for (const ref of removed) {
    await edit({ issueNumber, ref, repo, operation: 'remove', deps: deps.nativeEdit });
  }
  for (const ref of added) {
    await edit({ issueNumber, ref, repo, operation: 'add', deps: deps.nativeEdit });
  }

  const after = await read({ issueNumber, repo, deps: deps.nativeRead });
  const observed = canonicalRefs(after?.blockedBy, { issueNumber });
  if (!sameRefs(observed, canonicalDesired)) {
    fail(
      'readback',
      `expected ${canonicalDesired.map((ref) => `#${ref}`).join(',') || 'empty'}; observed ${observed.map((ref) => `#${ref}`).join(',') || 'empty'}`
    );
  }
  return {
    status: added.length || removed.length ? 'updated' : 'idempotent',
    existing,
    desired: canonicalDesired,
    added,
    removed,
  };
}
