// `unblock` verb — subtract GitHub native dependencies from an issue.
//
// CLI: /task unblock [#N] [--by <M>[,<P>...]]
// Without --by, every current dependency is removed.

import { pexec } from '../../gh/lib/gh-client.mjs';

import { reconcileDependencyDisposition } from '../lib/dependency-disposition.mjs';
import { convergeBlockedBySet, readNativeDependencies } from '../lib/native-dependencies.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { loadState } from '../state.mjs';
import { parseByList, resolveTargetIssue } from './block.mjs';

export function parseArgs(rest, activeIssue) {
  let by = null;
  const positional = [];
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === '--by') by = rest[++index] ?? '';
    else positional.push(token);
  }
  return {
    target: resolveTargetIssue({ rest: positional, activeIssue }),
    refs: by === null ? null : parseByList(by),
    byProvided: by !== null,
  };
}

async function defaultPostComment({ issueNumber, repo, body }) {
  await pexec('gh', ['issue', 'comment', String(issueNumber), '-R', repo, '--body', body], {
    timeout: GH_API_TIMEOUT_MS,
  });
}

function canonicalRequested(refs) {
  if (refs === null) return null;
  if (!Array.isArray(refs) || refs.some((ref) => !Number.isSafeInteger(ref) || ref <= 0)) {
    throw new Error('unblock: --by contains an invalid issue number');
  }
  return [...new Set(refs)].sort((left, right) => left - right);
}

export async function runUnblock({ target, refs, cfg, deps = {} } = {}) {
  if (!Number.isSafeInteger(target) || target <= 0) {
    throw new Error('unblock: no target issue (bind via /task #N or pass a positional)');
  }
  if (!cfg?.repo) throw new Error('unblock: cfg.repo is required');
  const requested = canonicalRequested(refs);
  const readDependencies = deps.readNativeDependencies || readNativeDependencies;
  const before = await readDependencies({
    issueNumber: target,
    repo: cfg.repo,
    deps: deps.nativeDependencies,
  });
  const requestedSet = requested === null ? null : new Set(requested);
  const desired =
    requestedSet === null
      ? []
      : before.blockedBy.filter((issueNumber) => !requestedSet.has(issueNumber));
  const converge = deps.convergeBlockedBySet || convergeBlockedBySet;
  const convergence = await converge({
    issueNumber: target,
    repo: cfg.repo,
    desired,
    deps: deps.nativeDependencies,
  });
  const reconcile = deps.reconcileDependencyDisposition || reconcileDependencyDisposition;
  const projection = await reconcile({
    issueNumber: target,
    cfg,
    deps: deps.dependencyDisposition,
  });

  const postComment = deps.postComment || defaultPostComment;
  for (const ref of convergence.removed) {
    await postComment({
      issueNumber: target,
      repo: cfg.repo,
      body: `### 🔓 Native dependency #${ref} removed`,
    });
  }
  const status = convergence.removed.length ? 'removed' : 'idempotent';
  console.log(
    status === 'removed'
      ? `[task-tracker] ✓ #${target} removed native blockers ${convergence.removed.map((ref) => `#${ref}`).join(', ')}`
      : `[task-tracker] ✓ #${target} has no matching native blockers to remove`
  );
  return {
    status,
    target,
    requested,
    removed: convergence.removed,
    remaining: convergence.desired,
    cleared: convergence.desired.length === 0,
    projection,
  };
}

export async function verbUnblock(ctx) {
  const { cfg, statePath, rest } = ctx;
  const state = loadState(statePath);
  const { target, refs, byProvided } = parseArgs(rest, state.active || null);
  if (!target) {
    console.error('Usage: /task unblock [#N] [--by <M>[,<P>...]]');
    process.exit(2);
  }
  if (byProvided && (!refs || refs.length === 0)) {
    console.error('unblock: --by requires at least one positive integer issue number');
    process.exit(2);
  }
  try {
    await runUnblock({ target, refs: byProvided ? refs : null, cfg, deps: ctx.deps });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
