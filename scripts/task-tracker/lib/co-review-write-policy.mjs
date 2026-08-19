import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

import { findMainWorktreePath } from '../fleet-registry.mjs';
import { coReviewIndexPath, occupancyPath } from '../paths.mjs';
import { readProtocolIndex, resolveReviewerGrant } from '../../review/lib/index.mjs';

function inside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

function targetAbsolute(target, projectDir) {
  return path.isAbsolute(target) ? path.resolve(target) : path.resolve(projectDir, target);
}

function canonicalPending(grant) {
  const dir = realpathSync(grant.dir);
  return path.join(dir, path.basename(grant.pendingReviewPath));
}

function canonicalTarget(target) {
  if (existsSync(target)) return realpathSync(target);
  const parent = realpathSync(path.dirname(target));
  return path.join(parent, path.basename(target));
}

function deny(reason, code = 'co-review-write-denied') {
  return { decision: 'deny', reason, code };
}

export function evaluateCoReviewWrite(input) {
  const projectDir = path.resolve(input.projectDir || process.cwd());
  const worktreePath = path.resolve(input.worktreePath || projectDir);
  const main = findMainWorktreePath(projectDir);
  const indexFile = input.indexFile || coReviewIndexPath(main);
  const readIndex = input.readIndex || readProtocolIndex;
  let rows;
  try {
    rows = readIndex(indexFile);
  } catch (error) {
    return deny(
      `co-review authority is unreadable: ${error.message}`,
      'co-review-authority-unreadable'
    );
  }
  const targets = (input.targets || []).map((target) => targetAbsolute(target, projectDir));
  const authority = new Set([
    path.resolve(occupancyPath(main)),
    path.resolve(coReviewIndexPath(main)),
  ]);
  if (targets.some((target) => authority.has(target))) {
    return deny(
      'co-review authority files are immutable to guarded tools',
      'co-review-authority-file'
    );
  }

  const worktreeRows = Object.values(rows).filter(
    (row) => path.resolve(row.worktree) === worktreePath
  );
  const protocolTarget = targets.some((target) =>
    worktreeRows.some((row) => inside(path.resolve(row.dir), target))
  );
  const visibleReviewerClaim = worktreeRows.some(
    (row) => row.lifecycle === 'active' && row.claimedRole === 'reviewer' && row.claimedSid
  );

  let grant;
  try {
    grant = (input.resolveGrant || resolveReviewerGrant)({
      indexFile,
      worktreePath,
      provider: input.provider,
      sid: input.sid,
      statusProtocol: input.statusProtocol,
    });
  } catch (error) {
    return deny(
      `co-review grant could not be validated: ${error.message}`,
      'co-review-grant-invalid'
    );
  }

  if (input.parseError) return deny(`mutation target parsing failed: ${input.parseError.message}`);
  if (grant) {
    if (input.toolName === 'Bash' && targets.length === 0 && !input.ambiguousMutation) {
      return { decision: 'not-applicable', reason: 'reviewer-bash-read-only' };
    }
    if (input.ambiguousMutation || targets.length === 0) {
      return deny('reviewer mutation destinations are incomplete or ambiguous');
    }
    let expected;
    try {
      expected = canonicalPending(grant);
      if (targets.some((target) => canonicalTarget(target) !== expected)) {
        return deny('reviewer may write only the exact session-bound pending review artifact');
      }
    } catch (error) {
      return deny(`reviewer target canonicalization failed: ${error.message}`);
    }
    return { decision: 'allow', reason: 'session-bound-pending-review', grant };
  }

  const mutationAttempt =
    targets.length > 0 ||
    input.ambiguousMutation ||
    ['Edit', 'Write', 'NotebookEdit', 'apply_patch'].includes(input.toolName);
  if (visibleReviewerClaim && mutationAttempt) {
    return deny('an active reviewer claim belongs to a different provider session');
  }
  if (protocolTarget) {
    return deny('co-review protocol files are immutable without the exact reviewer grant');
  }
  return { decision: 'not-applicable', reason: 'no-co-review-authority-context' };
}
