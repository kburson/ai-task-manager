// @story #1266

import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { hostname } from 'node:os';
import path from 'node:path';

export const STATE_SCHEMA = 'aitm.co-review/v1';
export const EVENT_SCHEMA = 'aitm.co-review-event/v1';

export class ProtocolError extends Error {
  constructor(code, detail = '', { exitCode = 1, next = '' } = {}) {
    super(
      `co-review:${code}${detail ? `: ${detail}` : ''}; no state changed${
        next ? `; next: ${next}` : ''
      }`
    );
    this.name = 'ProtocolError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

function fail(code, detail, options) {
  throw new ProtocolError(code, detail, options);
}

function git(cwd, args, options = {}) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: options.buffer ? null : 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
  } catch (error) {
    if (options.allowFailure) return null;
    const detail = error.stderr?.toString().trim() || args.join(' ');
    fail(options.code ?? 'git', detail);
  }
}

function repositoryRoot(cwd) {
  const value = git(cwd, ['rev-parse', '--show-toplevel'], { code: 'not-a-repository' }).trim();
  return realpathSync(value);
}

function relativePath(root, candidate, label) {
  const absolute = path.resolve(root, candidate);
  const relative = path.relative(root, absolute);
  if (
    !relative ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    fail('path-outside-repository', `${label}=${candidate}`);
  }
  return { absolute, relative: relative.split(path.sep).join('/') };
}

function protocolPaths(root, dir) {
  const resolved = relativePath(root, dir, 'dir');
  return {
    ...resolved,
    state: path.join(resolved.absolute, 'state.json'),
    events: path.join(resolved.absolute, 'events.jsonl'),
    lock: path.join(resolved.absolute, '.co-review-lock'),
  };
}

function digestBuffer(buffer) {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

function digestFile(root, candidate, label = 'artifact') {
  const resolved = relativePath(root, candidate, label);
  if (!existsSync(resolved.absolute) || !statSync(resolved.absolute).isFile()) {
    fail('missing-artifact', `${label}=${candidate}`);
  }
  return { path: resolved.relative, sha256: digestBuffer(readFileSync(resolved.absolute)) };
}

function assertIgnored(root, runtime) {
  const ignored = git(root, ['check-ignore', '--quiet', '--', runtime.relative], {
    allowFailure: true,
  });
  if (ignored === null) fail('runtime-not-ignored', runtime.relative);
  const tracked = git(root, ['ls-files', '--error-unmatch', '--', runtime.relative], {
    allowFailure: true,
  });
  if (tracked !== null) fail('runtime-tracked', runtime.relative);
}

function assertTrackedArtifact(root, artifact) {
  const resolved = relativePath(root, artifact, 'artifact');
  if (!existsSync(resolved.absolute) || !statSync(resolved.absolute).isFile()) {
    fail('missing-artifact', resolved.relative);
  }
  if (
    git(root, ['ls-files', '--error-unmatch', '--', resolved.relative], { allowFailure: true }) ===
    null
  ) {
    fail('artifact-untracked', resolved.relative);
  }
  const worktree = readFileSync(resolved.absolute);
  const index = git(root, ['show', `:${resolved.relative}`], {
    buffer: true,
    code: 'artifact-index',
  });
  const head = git(root, ['show', `HEAD:${resolved.relative}`], {
    buffer: true,
    code: 'artifact-head',
  });
  if (!worktree.equals(index) || !index.equals(head)) fail('artifact-drift', resolved.relative);
  return {
    path: resolved.relative,
    commit: git(root, ['rev-parse', 'HEAD']).trim(),
    blob: git(root, ['rev-parse', `HEAD:${resolved.relative}`]).trim(),
    sha256: digestBuffer(worktree),
  };
}

function exactReachableCommit(root, revision) {
  const commit = git(root, ['rev-parse', '--verify', `${revision}^{commit}`], {
    allowFailure: true,
  });
  if (commit === null) fail('git-commit', String(revision));
  const exact = commit.trim();
  if (git(root, ['merge-base', '--is-ancestor', exact, 'HEAD'], { allowFailure: true }) === null) {
    fail('git-commit-unreachable', exact);
  }
  return exact;
}

function assertCommitArtifact(root, commit, artifact) {
  const bytes = git(root, ['show', `${commit}:${artifact.path}`], {
    buffer: true,
    allowFailure: true,
  });
  if (bytes === null) fail('commit-missing-artifact', `${commit}:${artifact.path}`);
  if (!bytes.equals(readFileSync(path.join(root, artifact.path)))) {
    fail('artifact-drift', `${commit}:${artifact.path}`);
  }
  return git(root, ['rev-parse', `${commit}:${artifact.path}`]).trim();
}

function readLockOwner(lock) {
  try {
    return readFileSync(path.join(lock, 'owner.json'), 'utf8').trim();
  } catch {
    return 'lock-owner-unavailable';
  }
}

function withMutex(paths, actor, command, operation) {
  mkdirSync(paths.absolute, { recursive: true });
  try {
    mkdirSync(paths.lock);
  } catch (error) {
    if (error.code === 'EEXIST') fail('locked', readLockOwner(paths.lock));
    throw error;
  }
  const ownerPath = path.join(paths.lock, 'owner.json');
  writeFileSync(
    ownerPath,
    `${JSON.stringify({ actor, command, pid: process.pid, host: hostname(), at: new Date().toISOString() })}\n`,
    { flag: 'wx' }
  );
  try {
    return operation();
  } finally {
    try {
      unlinkSync(ownerPath);
      rmdirSync(paths.lock);
    } catch {
      // Preserve cleanup evidence; a later command will refuse the surviving lock.
    }
  }
}

function atomicStateWrite(paths, state) {
  const temporary = path.join(paths.absolute, `.state-${process.pid}-${Date.now()}.json`);
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { flag: 'wx' });
  renameSync(temporary, paths.state);
  return state;
}

function eventFor(state, type, at) {
  return {
    schema: EVENT_SCHEMA,
    protocolId: state.protocolId,
    revision: state.revision,
    type,
    at,
    lifecycle: state.lifecycle,
    currentRole: state.currentRole,
    round: state.round,
    reviewTurnsUsed: state.reviewTurnsUsed,
    maxReviewTurns: state.maxReviewTurns,
    remainingReviewTurns: state.remainingReviewTurns,
  };
}

function appendEvent(paths, state, type, at = state.updatedAt) {
  appendFileSync(paths.events, `${JSON.stringify(eventFor(state, type, at))}\n`);
}

function validateState(state) {
  if (
    state?.schema !== STATE_SCHEMA ||
    !Number.isInteger(state.revision) ||
    state.revision < 1 ||
    !['active', 'accepted', 'intervention-required'].includes(state.lifecycle) ||
    !Number.isInteger(state.reviewTurnsUsed) ||
    !Number.isInteger(state.maxReviewTurns) ||
    state.reviewTurnsUsed < 0 ||
    state.maxReviewTurns < 1 ||
    state.remainingReviewTurns !== state.maxReviewTurns - state.reviewTurnsUsed
  ) {
    fail('invalid-state', 'schema or budget invariant');
  }
  return state;
}

function sameInitialization(state, desired) {
  return JSON.stringify(state.initialization) === JSON.stringify(desired);
}

export function readProtocol({ cwd = process.cwd(), dir }) {
  const root = repositoryRoot(cwd);
  const paths = protocolPaths(root, dir);
  if (!existsSync(paths.state)) fail('not-initialized', paths.relative);
  try {
    return validateState(JSON.parse(readFileSync(paths.state, 'utf8')));
  } catch (error) {
    if (error instanceof ProtocolError) throw error;
    fail('invalid-state', error.message);
  }
}

export function initializeProtocol({
  cwd = process.cwd(),
  dir,
  artifact,
  owner,
  reviewer,
  maxReviewTurns,
  importReview,
  reviewOf,
}) {
  if (!dir || !artifact || !String(owner || '').trim() || !String(reviewer || '').trim()) {
    fail('usage', 'dir, artifact, owner, and reviewer are required', { exitCode: 2 });
  }
  if (owner === reviewer) fail('roles-not-distinct', owner);
  if (!Number.isInteger(maxReviewTurns) || maxReviewTurns < 1) {
    fail('max-turns', String(maxReviewTurns), { exitCode: 2 });
  }
  if (Boolean(importReview) !== Boolean(reviewOf)) {
    fail('import-pair', '--import-review and --review-of are required together', { exitCode: 2 });
  }

  const root = repositoryRoot(cwd);
  const paths = protocolPaths(root, dir);
  assertIgnored(root, paths);
  const artifactRecord = assertTrackedArtifact(root, artifact);
  let importedReview = null;
  let importedCommit = null;
  if (importReview) {
    importedReview = digestFile(root, importReview, 'import-review');
    const importAbsolute = path.resolve(root, importedReview.path);
    if (!importAbsolute.startsWith(`${paths.absolute}${path.sep}`)) {
      fail('import-outside-runtime', importedReview.path);
    }
    importedCommit = exactReachableCommit(root, reviewOf);
    artifactRecord.blob = assertCommitArtifact(root, importedCommit, artifactRecord);
  }

  const initialization = {
    runtimeDir: paths.relative,
    artifact: artifactRecord.path,
    owner: String(owner).trim(),
    reviewer: String(reviewer).trim(),
    maxReviewTurns,
    importedReview,
    reviewOf: importedCommit,
  };

  return withMutex(paths, 'system', 'init', () => {
    if (existsSync(paths.state)) {
      const existing = readProtocol({ cwd: root, dir: paths.relative });
      if (sameInitialization(existing, initialization)) return existing;
      fail('already-initialized', paths.relative);
    }
    if (existsSync(paths.events)) fail('orphaned-events', paths.relative);
    const at = new Date().toISOString();
    const imported = Boolean(importedReview);
    const state = validateState({
      schema: STATE_SCHEMA,
      protocolId: randomUUID(),
      repositoryRoot: root,
      worktree: root,
      branch: git(root, ['branch', '--show-current']).trim(),
      revision: 1,
      lifecycle: 'active',
      roles: { owner: initialization.owner, reviewer: initialization.reviewer },
      currentRole: 'owner',
      turnState: 'available',
      round: imported ? 2 : 1,
      claim: null,
      artifact: artifactRecord,
      reviewTurnsUsed: imported ? 1 : 0,
      maxReviewTurns,
      remainingReviewTurns: maxReviewTurns - (imported ? 1 : 0),
      lastHandoff: imported
        ? {
            from: 'reviewer',
            to: 'owner',
            at,
            decision: 'changes-requested',
            commit: importedCommit,
            artifacts: { review: importedReview },
            imported: true,
          }
        : null,
      immutableArtifacts: imported ? { [importedReview.path]: importedReview } : {},
      initialization,
      createdAt: at,
      updatedAt: at,
    });
    const type = imported ? 'init-import' : 'init';
    writeFileSync(paths.events, `${JSON.stringify(eventFor(state, type, at))}\n`, { flag: 'wx' });
    return atomicStateWrite(paths, state);
  });
}

export function statusProtocol(options) {
  const state = readProtocol(options);
  const root = repositoryRoot(options.cwd ?? process.cwd());
  const errors = [];
  for (const artifact of Object.values(state.immutableArtifacts ?? {})) {
    try {
      const actual = digestFile(root, artifact.path, 'recorded-artifact');
      if (actual.sha256 !== artifact.sha256) {
        errors.push(
          `artifact-drift ${artifact.path}: expected ${artifact.sha256}, actual ${actual.sha256}`
        );
      }
    } catch (error) {
      errors.push(`${error.code ?? 'artifact-error'} ${artifact.path}: ${error.message}`);
    }
  }
  if (state.lifecycle === 'active' && state.currentRole === 'reviewer') {
    try {
      const worktree = digestFile(root, state.artifact.path, 'authoritative-artifact');
      if (worktree.sha256 !== state.artifact.sha256) {
        errors.push(`artifact-drift ${state.artifact.path}: owner handoff changed`);
      }
      const head = git(root, ['rev-parse', 'HEAD']).trim();
      if (head !== state.artifact.commit) {
        errors.push(`branch-drift: expected ${state.artifact.commit}, actual ${head}`);
      }
      const index = git(root, ['show', `:${state.artifact.path}`], { buffer: true });
      if (digestBuffer(index) !== state.artifact.sha256) {
        errors.push(`index-drift ${state.artifact.path}`);
      }
    } catch (error) {
      errors.push(`${error.code ?? 'git-integrity'}: ${error.message}`);
    }
  }
  return { ...state, integrity: { ok: errors.length === 0, errors } };
}

function assertIntegrity(options) {
  const status = statusProtocol(options);
  if (!status.integrity.ok) fail('integrity', status.integrity.errors.join('; '));
  return status;
}

export function claimTurn({ cwd = process.cwd(), dir, actor }) {
  const root = repositoryRoot(cwd);
  const paths = protocolPaths(root, dir);
  return withMutex(paths, actor, 'claim', () => {
    const state = assertIntegrity({ cwd: root, dir: paths.relative });
    const role = Object.entries(state.roles).find(([, identity]) => identity === actor)?.[0];
    if (!role) fail('unknown-actor', String(actor));
    if (state.lifecycle !== 'active') fail('terminal', state.lifecycle);
    if (state.currentRole !== role) {
      fail('wrong-role', `${actor} maps to ${role}; current role is ${state.currentRole}`);
    }
    if (state.turnState === 'claimed' && state.claim?.actor === actor)
      return readProtocol({ cwd: root, dir: paths.relative });
    if (state.turnState !== 'available') fail('not-available', state.turnState);
    const at = new Date().toISOString();
    const next = validateState({
      ...state,
      integrity: undefined,
      revision: state.revision + 1,
      turnState: 'claimed',
      claim: { role, actor, pid: process.pid, host: hostname(), at },
      updatedAt: at,
    });
    appendEvent(paths, next, 'claim', at);
    return atomicStateWrite(paths, next);
  });
}

export function handoffOwner() {
  fail('not-implemented', 'owner handoff');
}

export function handoffReviewer() {
  fail('not-implemented', 'reviewer handoff');
}

export function continueProtocol() {
  fail('not-implemented', 'continue');
}

export async function waitForTurn({
  cwd = process.cwd(),
  dir,
  actor,
  timeoutSeconds = 55,
  pollMilliseconds = 250,
}) {
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 0 || timeoutSeconds > 60) {
    fail('timeout', String(timeoutSeconds), { exitCode: 2 });
  }
  if (!Number.isFinite(pollMilliseconds) || pollMilliseconds <= 0) {
    fail('poll-interval', String(pollMilliseconds), { exitCode: 2 });
  }
  const first = statusProtocol({ cwd, dir });
  const role = Object.entries(first.roles).find(([, identity]) => identity === actor)?.[0];
  if (!role) fail('unknown-actor', String(actor), { exitCode: 2 });
  const deadline = Date.now() + timeoutSeconds * 1000;
  let state = first;
  while (true) {
    if (!state.integrity.ok) fail('integrity', state.integrity.errors.join('; '));
    if (state.lifecycle !== 'active') return { status: state.lifecycle, state };
    if (state.currentRole === role && state.turnState === 'available') {
      return { status: 'available', state };
    }
    if (Date.now() >= deadline) return { status: 'timeout', state };
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(pollMilliseconds, Math.max(1, deadline - Date.now())))
    );
    state = statusProtocol({ cwd, dir });
  }
}
