import { findMainWorktreePath } from '../../fleet-registry.mjs';
import { withIssueLock } from '../../issue-mutator-lock.mjs';
import { getProjectDir } from '../../paths.mjs';

const processTails = new Map();

function assertClaimInput({ key, issue } = {}) {
  if (typeof key !== 'string' || key.trim() === '') {
    throw new TypeError('estimation-record-claim:key');
  }
  if (issue !== undefined && (!Number.isInteger(issue) || issue <= 0)) {
    throw new TypeError('estimation-record-claim:issue');
  }
}

// Pure-core fallback. It makes concurrent calls in one agent process share the
// same logical transaction even when the caller injects an in-memory record
// store and therefore has no filesystem-backed production adapter.
export async function withProcessRecordClaim({ key } = {}, fn) {
  assertClaimInput({ key });
  if (typeof fn !== 'function') throw new TypeError('estimation-record-claim:fn');

  const previous = processTails.get(key) ?? Promise.resolve();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const tail = previous.catch(() => {}).then(() => gate);
  processTails.set(key, tail);
  await previous.catch(() => {});
  try {
    return await fn();
  } finally {
    release();
    if (processTails.get(key) === tail) processTails.delete(key);
  }
}

// Production claim. The authority issue is the serialization boundary and the
// lock is anchored to the main worktree, so sibling linked worktrees and local
// processes cannot race the GitHub read-decide-append-readback transaction.
// GitHub comments remain the durable record; this lock is only the atomic claim
// around creation.
export async function withCrossProcessRecordClaim(
  { key, issue, projectDir = getProjectDir() } = {},
  fn,
  deps = {}
) {
  assertClaimInput({ key, issue });
  if (typeof fn !== 'function') throw new TypeError('estimation-record-claim:fn');
  const findMain = deps.findMainWorktreePath ?? findMainWorktreePath;
  const lock = deps.withIssueLock ?? withIssueLock;
  const mainProjectDir = findMain(projectDir);
  return withProcessRecordClaim({ key }, () =>
    lock(
      {
        issue,
        verb: `estimation-record:${key}`,
        projDir: mainProjectDir,
        timeoutMs: 500,
        retries: 240,
      },
      fn
    )
  );
}

export function runLogicalRecordClaim(deps, { key, issue }, fn) {
  const claim = deps?.withLogicalRecordClaim ?? withProcessRecordClaim;
  return claim({ key, issue }, fn);
}
