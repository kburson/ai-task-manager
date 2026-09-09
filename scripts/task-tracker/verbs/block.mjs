// `block` verb — add GitHub native dependencies to an issue as a set union.
//
// CLI: /task block [#N] --by <M>[,<P>...]

import { pexec } from '../../gh/lib/gh-client.mjs';

import { reconcileDependencyDisposition } from '../lib/dependency-disposition.mjs';
import { convergeBlockedBySet, readNativeDependencies } from '../lib/native-dependencies.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { loadState } from '../state.mjs';

export function parseByList(raw) {
  if (raw == null) return [];
  const out = new Set();
  for (const tok of String(raw).split(',')) {
    const n = Number(tok.trim().replace(/^#/, ''));
    if (Number.isInteger(n) && n > 0) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

export function resolveTargetIssue({ rest, activeIssue }) {
  for (const tok of rest) {
    const match = String(tok).match(/^#?(\d+)$/);
    if (match) return Number(match[1]);
  }
  if (activeIssue) {
    const match = String(activeIssue).match(/^#?(\d+)$/);
    if (match) return Number(match[1]);
  }
  return null;
}

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
    refs: parseByList(by),
    byProvided: by !== null,
  };
}

async function defaultValidateIssue({ issueNumber, repo }) {
  try {
    const { stdout } = await pexec(
      'gh',
      ['issue', 'view', String(issueNumber), '-R', repo, '--json', 'number,state'],
      { timeout: GH_API_TIMEOUT_MS }
    );
    const parsed = JSON.parse(stdout);
    return {
      exists: parsed?.number === issueNumber,
      state: typeof parsed?.state === 'string' ? parsed.state.toUpperCase() : null,
    };
  } catch {
    return { exists: false, state: null };
  }
}

async function defaultPostComment({ issueNumber, repo, body }) {
  await pexec('gh', ['issue', 'comment', String(issueNumber), '-R', repo, '--body', body], {
    timeout: GH_API_TIMEOUT_MS,
  });
}

function canonicalRequested(refs, target) {
  if (!Array.isArray(refs) || refs.length === 0) {
    throw new Error(
      'block: --by is required and must list at least one positive integer issue number'
    );
  }
  if (refs.some((ref) => !Number.isSafeInteger(ref) || ref <= 0)) {
    throw new Error('block: --by contains an invalid issue number');
  }
  const requested = [...new Set(refs)].sort((left, right) => left - right);
  if (requested.includes(target)) throw new Error(`block: cannot block #${target} on itself`);
  return requested;
}

export async function runBlock({ target, refs, cfg, deps = {} } = {}) {
  if (!Number.isSafeInteger(target) || target <= 0) {
    throw new Error('block: no target issue (bind via /task #N or pass a positional)');
  }
  if (!cfg?.repo) throw new Error('block: cfg.repo is required');
  const requested = canonicalRequested(refs, target);
  const validateIssue = deps.validateIssue || defaultValidateIssue;
  for (const issueNumber of requested) {
    const observed = await validateIssue({ issueNumber, repo: cfg.repo });
    if (!observed?.exists) throw new Error(`block: blocker #${issueNumber} does not exist`);
  }

  const readDependencies = deps.readNativeDependencies || readNativeDependencies;
  const before = await readDependencies({
    issueNumber: target,
    repo: cfg.repo,
    deps: deps.nativeDependencies,
  });
  const desired = [...new Set([...before.blockedBy, ...requested])].sort(
    (left, right) => left - right
  );
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
  for (const ref of convergence.added) {
    await postComment({
      issueNumber: target,
      repo: cfg.repo,
      body: `### 🔒 Native dependency #${ref} added`,
    });
  }
  const status = convergence.added.length ? 'added' : 'idempotent';
  console.log(
    status === 'added'
      ? `[task-tracker] ✓ #${target} blocked by ${convergence.added.map((ref) => `#${ref}`).join(', ')}`
      : `[task-tracker] ✓ #${target} native blockers already converged`
  );
  return {
    status,
    target,
    requested,
    added: convergence.added,
    remaining: convergence.desired,
    projection,
  };
}

export async function verbBlock(ctx) {
  const { cfg, statePath, rest } = ctx;
  const state = loadState(statePath);
  const { target, refs } = parseArgs(rest, state.active || null);
  if (!target) {
    console.error('Usage: /task block [#N] --by <M>[,<P>...]');
    process.exit(2);
  }
  if (!refs.length) {
    console.error('block: --by is required (e.g. --by 247 or --by 247,249)');
    process.exit(2);
  }
  try {
    await runBlock({ target, refs, cfg, deps: ctx.deps });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
