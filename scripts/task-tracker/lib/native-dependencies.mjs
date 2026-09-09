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

function repositoryIdentity(node, relation) {
  const declared = node?.repository?.nameWithOwner;
  let fromUrl = null;
  if (node?.url != null) {
    try {
      const parts = new URL(node.url).pathname.split('/').filter(Boolean);
      if (parts.length !== 4 || parts[2] !== 'issues' || Number(parts[3]) !== node?.number) {
        fail(`${relation}-identity`);
      }
      fromUrl = `${decodeURIComponent(parts[0])}/${decodeURIComponent(parts[1])}`;
    } catch (error) {
      if (String(error?.message || '').startsWith('native-dependencies:')) throw error;
      fail(`${relation}-identity`);
    }
  }
  if (!declared && !fromUrl) fail(`${relation}-identity`);
  if (declared && fromUrl && declared !== fromUrl) fail(`${relation}-identity`);
  return declared || fromUrl;
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
    const observedRepo = repositoryIdentity(node, relation);
    if (observedRepo !== repo) fail(`${relation}-repository`);
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
      ['issue', 'view', String(issueNumber), '-R', repo, '--json', 'blockedBy,blocking'],
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
  await run('gh', ['issue', 'edit', String(issueNumber), '-R', repo, flag, String(canonicalRef)], {
    timeout: GH_API_TIMEOUT_MS,
  });
}

function sameRefs(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function convergeBlockedBySet({
  issueNumber,
  repo,
  desired,
  operation,
  refs,
  deps = {},
} = {}) {
  assertIssueInput(issueNumber, repo);
  if (operation !== undefined && !['union', 'subtract', 'clear'].includes(operation)) {
    fail('operation');
  }
  if (operation !== undefined && desired !== undefined) fail('operation-shape');
  const requested = operation === undefined ? null : canonicalRefs(refs || [], { issueNumber });
  if (operation === 'clear' && requested.length) fail('operation-shape');
  if (operation === undefined) canonicalRefs(desired, { issueNumber });
  const read = deps.readNativeDependencies || readNativeDependencies;
  const edit = deps.editDependency || editNativeDependency;
  const before = await read({ issueNumber, repo, deps: deps.nativeRead });
  const existing = canonicalRefs(before?.blockedBy, { issueNumber });
  const requestedSet = new Set(requested || []);
  const canonicalDesired =
    operation === 'union'
      ? canonicalRefs([...existing, ...requested], { issueNumber })
      : operation === 'subtract'
        ? existing.filter((ref) => !requestedSet.has(ref))
        : operation === 'clear'
          ? []
          : canonicalRefs(desired, { issueNumber });
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
