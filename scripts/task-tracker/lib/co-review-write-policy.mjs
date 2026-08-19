import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

import { findMainWorktreePath } from '../fleet-registry.mjs';
import { closedBindingsPath, coReviewIndexPath, occupancyPath } from '../paths.mjs';
import {
  hasLiveReviewerClaim,
  readProtocolIndex,
  resolveReviewerGrant,
} from '../../review/lib/index.mjs';

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
  const suffix = [];
  let cursor = path.resolve(target);
  while (!existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error(`no existing ancestor for ${target}`);
    suffix.unshift(path.basename(cursor));
    cursor = parent;
  }
  return path.join(realpathSync(cursor), ...suffix);
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
  const authorityFiles = input.authorityFiles || [
    occupancyPath(main),
    coReviewIndexPath(main),
    closedBindingsPath(main),
  ];
  let canonicalTargets;
  let authority;
  try {
    canonicalTargets = targets.map(canonicalTarget);
    authority = new Set(
      authorityFiles.flatMap((file) => [path.resolve(file), canonicalTarget(path.resolve(file))])
    );
  } catch (error) {
    return deny(`co-review target canonicalization failed: ${error.message}`);
  }
  if (
    targets.some((target, index) => authority.has(target) || authority.has(canonicalTargets[index]))
  ) {
    return deny(
      'co-review authority files are immutable to guarded tools',
      'co-review-authority-file'
    );
  }

  const worktreeRows = Object.values(rows).filter(
    (row) => path.resolve(row.worktree) === worktreePath
  );
  let protocolTarget;
  try {
    protocolTarget = targets.some((target, index) =>
      worktreeRows.some(
        (row) =>
          inside(path.resolve(row.dir), target) ||
          inside(canonicalTarget(path.resolve(row.dir)), canonicalTargets[index])
      )
    );
  } catch (error) {
    return deny(`co-review protocol canonicalization failed: ${error.message}`);
  }
  const visibleReviewerClaim = worktreeRows.some(
    (row) =>
      row.lifecycle === 'active' &&
      hasLiveReviewerClaim({ row, statusProtocol: input.statusProtocol })
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
      const exactPending = path.resolve(grant.pendingReviewPath);
      if (
        targets.some(
          (target) => path.resolve(target) !== exactPending || canonicalTarget(target) !== expected
        )
      ) {
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
