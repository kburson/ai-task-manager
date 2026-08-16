// @story #1266

import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { hostname } from 'node:os';
import path from 'node:path';

import { resolveArchiveDestination } from './archive.mjs';
import { planAbsoluteBudget, planContinuationBudget } from './budget.mjs';

export const STATE_SCHEMA = 'aitm.co-review/v1';
export const EVENT_SCHEMA = 'aitm.co-review-event/v1';

export class ProtocolError extends Error {
  constructor(code, detail = '', { exitCode = 1, next = '' } = {}) {
    super(
      `co-review:${code}${detail ? `:${detail}` : ''}; no state changed${
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
  let existing = absolute;
  const suffix = [];
  while (!existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) fail('path-resolution', `${label}=${candidate}`);
    suffix.unshift(path.basename(existing));
    existing = parent;
  }
  const physical = path.resolve(realpathSync(existing), ...suffix);
  const physicalRelative = path.relative(root, physical);
  if (
    !physicalRelative ||
    physicalRelative === '..' ||
    physicalRelative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(physicalRelative)
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
  if (!existsSync(resolved.absolute)) {
    fail('missing-artifact', `${label}=${candidate}`);
  }
  if (!lstatSync(resolved.absolute).isFile()) fail(`${label}-not-regular`, resolved.relative);
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
  if (!existsSync(resolved.absolute)) {
    fail('missing-artifact', resolved.relative);
  }
  if (!lstatSync(resolved.absolute).isFile()) fail('artifact-not-regular', resolved.relative);
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
  return validateState(JSON.parse(readFileSync(paths.state, 'utf8')));
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
    ...(state.supplements === undefined
      ? {}
      : { supplements: supplementProjection(state.supplements) }),
  };
}

function appendEvent(paths, state, type, at = state.updatedAt, details = {}) {
  appendFileSync(paths.events, `${JSON.stringify({ ...eventFor(state, type, at), ...details })}\n`);
}

function supplementProjection(supplements) {
  return supplements.map(
    ({ id, path: supplementPath, sha256, registeredBy, registeredAt, targetRound, status }) => ({
      id,
      path: supplementPath,
      sha256,
      registeredBy,
      registeredAt,
      targetRound,
      status,
    })
  );
}

function safeSupplementIdSuffix(id) {
  const suffix = Number(id.slice(2));
  return Number.isSafeInteger(suffix) && suffix >= 1 && suffix < Number.MAX_SAFE_INTEGER
    ? suffix
    : null;
}

function validateState(state) {
  if (
    state?.schema !== STATE_SCHEMA ||
    !Number.isInteger(state.revision) ||
    state.revision < 1 ||
    !Number.isInteger(state.round) ||
    state.round < 1 ||
    !['active', 'accepted', 'intervention-required'].includes(state.lifecycle) ||
    !Number.isInteger(state.reviewTurnsUsed) ||
    !Number.isInteger(state.maxReviewTurns) ||
    state.reviewTurnsUsed < 0 ||
    state.maxReviewTurns < 0 ||
    state.remainingReviewTurns < 0 ||
    state.remainingReviewTurns !== state.maxReviewTurns - state.reviewTurnsUsed
  ) {
    fail('invalid-state', 'schema, round, or budget invariant');
  }
  if (state.supplements !== undefined) {
    if (!Array.isArray(state.supplements)) fail('invalid-state', 'supplements must be an array');
    const ids = new Set();
    for (const supplement of state.supplements) {
      if (
        !supplement ||
        !/^S-\d+$/.test(supplement.id) ||
        safeSupplementIdSuffix(supplement.id) === null ||
        ids.has(supplement.id) ||
        typeof supplement.path !== 'string' ||
        !/^sha256:[a-f0-9]{64}$/.test(supplement.sha256) ||
        typeof supplement.registeredBy !== 'string' ||
        !supplement.registeredBy.trim() ||
        typeof supplement.registeredAt !== 'string' ||
        Number.isNaN(Date.parse(supplement.registeredAt)) ||
        !Number.isInteger(supplement.targetRound) ||
        supplement.targetRound < 1 ||
        !['pending', 'frozen', 'consumed'].includes(supplement.status)
      ) {
        fail('invalid-state', 'supplement invariant');
      }
      ids.add(supplement.id);
    }
  }
  return state;
}

function eventIntegrity(paths, state) {
  let events;
  try {
    const lines = readFileSync(paths.events, 'utf8')
      .split('\n')
      .filter((line) => line.trim());
    events = lines.map((line) => JSON.parse(line));
  } catch (error) {
    return [`events-unreadable: ${error.message}`];
  }
  const errors = [];
  if (events.length !== state.revision) {
    errors.push(`event-count: expected ${state.revision}, actual ${events.length}`);
  }
  const allowedTypes = new Set([
    'init',
    'init-import',
    'claim',
    'owner-handoff',
    'reviewer-handoff',
    'continue',
    'budget-adjustment',
    'supplement',
    'human-good-enough',
  ]);
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const expectedRevision = index + 1;
    if (event.schema !== EVENT_SCHEMA) {
      errors.push(`event-schema revision ${expectedRevision}: ${String(event.schema)}`);
    }
    if (event.protocolId !== state.protocolId) {
      errors.push(`event-protocol revision ${expectedRevision}: ${String(event.protocolId)}`);
    }
    if (event.revision !== expectedRevision) {
      errors.push(`event-revision: expected ${expectedRevision}, actual ${String(event.revision)}`);
    }
    if (!allowedTypes.has(event.type)) {
      errors.push(`event-type revision ${expectedRevision}: ${String(event.type)}`);
    }
  }
  const last = events.at(-1);
  if (last?.revision === state.revision) {
    for (const field of [
      'lifecycle',
      'currentRole',
      'round',
      'reviewTurnsUsed',
      'maxReviewTurns',
      'remainingReviewTurns',
    ]) {
      if (last[field] !== state[field]) {
        errors.push(
          `event-projection ${field}: expected ${String(state[field])}, actual ${String(last[field])}`
        );
      }
    }
    const expectedSupplements =
      state.supplements === undefined ? undefined : supplementProjection(state.supplements);
    if (JSON.stringify(last.supplements) !== JSON.stringify(expectedSupplements)) {
      errors.push('event-projection supplements: state differs from last event');
    }
  }
  return errors;
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
  archiveDir,
}) {
  const normalizedOwner = String(owner || '').trim();
  const normalizedReviewer = String(reviewer || '').trim();
  if (!dir || !artifact || !normalizedOwner || !normalizedReviewer) {
    fail('usage', 'dir, artifact, owner, and reviewer are required', { exitCode: 2 });
  }
  if (normalizedOwner === normalizedReviewer) fail('roles-not-distinct', normalizedOwner);
  if (!Number.isInteger(maxReviewTurns) || maxReviewTurns < 1) {
    fail('max-turns', String(maxReviewTurns), { exitCode: 2 });
  }
  if (Boolean(importReview) !== Boolean(reviewOf)) {
    fail('import-pair', '--import-review and --review-of are required together', { exitCode: 2 });
  }
  if (importReview && maxReviewTurns === 1) {
    fail('import-exhausts-budget', 'imported R1 requires --max-turns >= 2', { exitCode: 2 });
  }

  const root = repositoryRoot(cwd);
  const paths = protocolPaths(root, dir);
  assertIgnored(root, paths);
  const archive = archiveDir
    ? resolveArchiveDestination({ cwd: root, archiveDir, runtimeDir: paths.relative })
    : null;
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
    artifactSha256: artifactRecord.sha256,
    owner: normalizedOwner,
    reviewer: normalizedReviewer,
    maxReviewTurns,
    importedReview,
    reviewOf: importedCommit,
    ...(archive ? { archiveDir: archive.relative } : {}),
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
  const paths = protocolPaths(root, options.dir);
  const errors = eventIntegrity(paths, state);
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
  for (const supplement of state.supplements ?? []) {
    if (supplement.status === 'consumed') continue;
    try {
      const actual = digestFile(root, supplement.path, 'recorded-supplement');
      if (actual.sha256 !== supplement.sha256) {
        errors.push(
          `supplement-drift ${supplement.path}: expected ${supplement.sha256}, actual ${actual.sha256}`
        );
      }
    } catch (error) {
      errors.push(`supplement-drift ${supplement.path}: ${error.code ?? error.message}`);
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
  const integrity = { ok: errors.length === 0, errors };
  const activeSupplements = (state.supplements ?? []).filter(
    (supplement) => supplement.status === 'pending' || supplement.status === 'frozen'
  );
  return { ...state, activeSupplements, integrity, nextAction: nextAction(state, integrity) };
}

function nextAction(state, integrity) {
  if (!integrity.ok) return 'preserve protocol files and escalate integrity drift to the human';
  if (state.lifecycle === 'accepted') return 'stop; protocol accepted';
  if (state.lifecycle === 'intervention-required') {
    return `npx aitm co-review continue --dir ${state.initialization.runtimeDir} --max-turns <N> [--focus <file>]`;
  }
  const actor = state.roles[state.currentRole];
  if (state.turnState === 'available') {
    return `npx aitm co-review claim --dir ${state.initialization.runtimeDir} --actor ${actor}`;
  }
  return `${state.currentRole} ${actor} holds round ${state.round}; complete the role artifact and run npx aitm co-review help handoff`;
}

function assertIntegrity(options) {
  const status = statusProtocol(options);
  if (!status.integrity.ok) fail('integrity', status.integrity.errors.join('; '));
  return readProtocol(options);
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

function exchangeArtifact(root, paths, candidate, label, disallowed = []) {
  const artifact = digestFile(root, candidate, label);
  const absolute = path.resolve(root, artifact.path);
  const runtime = realpathSync(paths.absolute);
  const physical = realpathSync(absolute);
  if (!physical.startsWith(`${runtime}${path.sep}`)) {
    fail(`${label}-outside-runtime`, artifact.path);
  }
  const reserved = new Set([
    paths.state,
    paths.events,
    paths.lock,
    ...disallowed.map((value) => path.resolve(root, value)),
  ]);
  if (reserved.has(absolute)) fail(`${label}-path-conflict`, artifact.path);
  return artifact;
}

function frozenSupplements(state) {
  return (state.supplements ?? []).filter((supplement) => supplement.status === 'frozen');
}

function supplementAcknowledgments(markdown, required) {
  const requiredIds = new Set(required.map((supplement) => supplement.id));
  const seen = new Set();
  for (const match of markdown.matchAll(/\[supplement:(S-\d+)\]/g)) {
    const id = match[1];
    if (seen.has(id)) fail('duplicate-supplement', id);
    if (!requiredIds.has(id)) fail('unknown-supplement', id);
    seen.add(id);
  }
  for (const id of requiredIds) {
    if (!seen.has(id)) fail('missing-supplement', id);
  }
}

function nextSupplementId(supplements) {
  const highest = supplements.reduce(
    (maximum, supplement) => Math.max(maximum, safeSupplementIdSuffix(supplement.id)),
    0
  );
  return `S-${String(highest + 1).padStart(3, '0')}`;
}

export function registerSupplement({ cwd = process.cwd(), dir, file, humanLogin }) {
  const registeredBy = String(humanLogin || '').trim();
  if (!registeredBy)
    fail('github-login', 'non-blank authenticated login required', { exitCode: 2 });
  const root = repositoryRoot(cwd);
  const paths = protocolPaths(root, dir);
  return withMutex(paths, registeredBy, 'supplement', () => {
    const current = readProtocol({ cwd: root, dir: paths.relative });
    if (current.lifecycle !== 'intervention-required') {
      fail('supplement-state', current.lifecycle);
    }
    const resolved = relativePath(root, file, 'supplement');
    if (existsSync(resolved.absolute) && lstatSync(resolved.absolute).isSymbolicLink()) {
      fail('supplement-symlink', resolved.relative);
    }
    const artifact = exchangeArtifact(root, paths, file, 'supplement');
    const existing = (current.supplements ?? []).find(
      (supplement) => supplement.path === artifact.path
    );
    if (existing) {
      if (existing.sha256 === artifact.sha256) {
        assertIntegrity({ cwd: root, dir: paths.relative });
        return readProtocol({ cwd: root, dir: paths.relative });
      }
      fail('supplement-conflict', artifact.path);
    }
    const state = assertIntegrity({ cwd: root, dir: paths.relative });
    const at = new Date().toISOString();
    const supplement = {
      id: nextSupplementId(state.supplements ?? []),
      path: artifact.path,
      sha256: artifact.sha256,
      registeredBy,
      registeredAt: at,
      targetRound: state.round + 1,
      status: 'pending',
    };
    const next = validateState({
      ...state,
      integrity: undefined,
      nextAction: undefined,
      revision: state.revision + 1,
      supplements: [...(state.supplements ?? []), supplement],
      updatedAt: at,
    });
    appendEvent(paths, next, 'supplement', at, { supplement });
    return atomicStateWrite(paths, next);
  });
}

function uniqueFindingIds(markdown, label) {
  const ids = [...markdown.matchAll(/\[finding:([A-Za-z0-9][A-Za-z0-9._-]*)\]/g)].map(
    (match) => match[1]
  );
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) fail('duplicate-finding', `${label}:${id}`);
    seen.add(id);
  }
  return ids;
}

function validateResponse(root, reviewArtifact, responseArtifact) {
  if (!reviewArtifact) return;
  const review = readFileSync(path.resolve(root, reviewArtifact.path), 'utf8');
  const response = readFileSync(path.resolve(root, responseArtifact.path), 'utf8');
  const reviewIds = uniqueFindingIds(review, 'review');
  const responseFindingIds = uniqueFindingIds(response, 'response');
  for (const id of responseFindingIds) {
    if (!reviewIds.includes(id)) fail('unknown-finding', id);
  }
  const responseMatches = [
    ...response.matchAll(/\[finding:([A-Za-z0-9][A-Za-z0-9._-]*)\]\s*\[disposition:([^\]\n]+)\]/g),
  ];
  const responseIds = responseMatches.map((match) => match[1]);
  const seen = new Set();
  for (const id of responseIds) {
    if (seen.has(id)) fail('duplicate-disposition', id);
    seen.add(id);
    if (!reviewIds.includes(id)) fail('unknown-finding', id);
  }
  for (const id of reviewIds) {
    if (!seen.has(id)) fail('missing-disposition', id);
  }
  for (let index = 0; index < responseMatches.length; index += 1) {
    const match = responseMatches[index];
    const id = match[1];
    const disposition = match[2].trim();
    const allowed = new Set(['accepted', 'accepted-with-modification', 'rejected', 'deferred']);
    if (!allowed.has(disposition)) fail('unknown-disposition', `${id}:${disposition}`);
    const start = match.index;
    const end = responseMatches[index + 1]?.index ?? response.length;
    const block = response.slice(start, end);
    if (disposition === 'rejected' && !/\[evidence:[^\]\n]+\]/.test(block)) {
      fail('rejected-without-evidence', id);
    }
    if (disposition === 'deferred') {
      if (!/\[follow-up:#\d+\]/.test(block)) fail('deferred-without-follow-up', id);
      if (!/\[safe-boundary:[^\]\n]+\]/.test(block)) fail('deferred-without-boundary', id);
    }
  }
}

function committedOwnerArtifact(root, state, artifact, revision) {
  const resolved = relativePath(root, artifact, 'artifact');
  if (resolved.relative !== state.artifact.path) {
    fail('wrong-artifact', `${resolved.relative}; expected ${state.artifact.path}`);
  }
  const commit = exactReachableCommit(root, revision);
  const head = git(root, ['rev-parse', 'HEAD']).trim();
  if (commit !== head) fail('commit-not-head', `${commit}; HEAD=${head}`);
  const branch = git(root, ['branch', '--show-current']).trim();
  if (branch !== state.branch) fail('branch-drift', `${branch}; expected ${state.branch}`);
  const committed = git(root, ['show', `${commit}:${resolved.relative}`], {
    buffer: true,
    allowFailure: true,
  });
  if (committed === null) fail('commit-missing-artifact', `${commit}:${resolved.relative}`);
  const worktree = readFileSync(resolved.absolute);
  const index = git(root, ['show', `:${resolved.relative}`], { buffer: true });
  if (!worktree.equals(committed)) fail('artifact-drift', resolved.relative);
  if (!index.equals(committed)) fail('index-drift', resolved.relative);
  return {
    path: resolved.relative,
    commit,
    blob: git(root, ['rev-parse', `${commit}:${resolved.relative}`]).trim(),
    sha256: digestBuffer(committed),
  };
}

export function handoffOwner({
  cwd = process.cwd(),
  dir,
  actor,
  response,
  artifact,
  commit,
  answers,
  message,
}) {
  const root = repositoryRoot(cwd);
  const paths = protocolPaths(root, dir);
  return withMutex(paths, actor, 'owner-handoff', () => {
    const state = assertIntegrity({ cwd: root, dir: paths.relative });
    if (state.lifecycle !== 'active') fail('terminal', state.lifecycle);
    if (state.roles.owner !== actor || state.currentRole !== 'owner') {
      fail('wrong-role', `${actor}; expected owner ${state.roles.owner}`);
    }
    if (state.turnState !== 'claimed' || state.claim?.actor !== actor) {
      fail('unclaimed', 'owner');
    }
    if (!String(message || '').trim()) fail('message-required', 'owner handoff');
    const precedingReview = state.lastHandoff?.artifacts?.review ?? null;
    if (precedingReview && !answers) fail('answers-required', precedingReview.path);
    if (!precedingReview && answers) fail('unexpected-answers', answers);
    let answeredReview = null;
    if (precedingReview) {
      answeredReview = digestFile(root, answers, 'answers');
      if (
        answeredReview.path !== precedingReview.path ||
        answeredReview.sha256 !== precedingReview.sha256
      ) {
        fail('answers-mismatch', answeredReview.path);
      }
    }
    const responseArtifact = exchangeArtifact(root, paths, response, 'response', [
      state.artifact.path,
      ...(answeredReview ? [answeredReview.path] : []),
    ]);
    if (state.immutableArtifacts?.[responseArtifact.path]) {
      fail('response-already-used', responseArtifact.path);
    }
    validateResponse(root, answeredReview, responseArtifact);
    const artifactRecord = committedOwnerArtifact(root, state, artifact, commit);
    const at = new Date().toISOString();
    const artifacts = {
      response: responseArtifact,
      ...(answeredReview ? { answeredReview } : {}),
    };
    const lifecycle = state.remainingReviewTurns === 0 ? 'intervention-required' : 'active';
    const currentRole = lifecycle === 'active' ? 'reviewer' : null;
    const lastHandoff = {
      from: 'owner',
      to: currentRole,
      at,
      message: String(message).trim(),
      commit: artifactRecord.commit,
      artifact: artifactRecord,
      artifacts,
    };
    const next = validateState({
      ...state,
      integrity: undefined,
      revision: state.revision + 1,
      lifecycle,
      currentRole,
      turnState: lifecycle === 'active' ? 'available' : null,
      round: state.round + 1,
      claim: null,
      artifact: artifactRecord,
      lastHandoff,
      immutableArtifacts: {
        ...(state.immutableArtifacts ?? {}),
        [responseArtifact.path]: responseArtifact,
      },
      updatedAt: at,
    });
    appendEvent(paths, next, 'owner-handoff', at, { handoff: lastHandoff });
    return atomicStateWrite(paths, next);
  });
}

export function handoffReviewer({
  cwd = process.cwd(),
  dir,
  actor,
  review,
  reviewOf,
  decision,
  summary,
  message,
}) {
  const root = repositoryRoot(cwd);
  const paths = protocolPaths(root, dir);
  return withMutex(paths, actor, 'reviewer-handoff', () => {
    const state = assertIntegrity({ cwd: root, dir: paths.relative });
    if (state.lifecycle !== 'active') fail('terminal', state.lifecycle);
    if (state.roles.reviewer !== actor || state.currentRole !== 'reviewer') {
      fail('wrong-role', `${actor}; expected reviewer ${state.roles.reviewer}`);
    }
    if (state.turnState !== 'claimed' || state.claim?.actor !== actor) {
      fail('unclaimed', 'reviewer');
    }
    if (!String(message || '').trim()) fail('message-required', 'reviewer handoff');
    if (!['accepted', 'changes-requested'].includes(decision)) {
      fail('decision', String(decision));
    }
    const ownerHandoff = state.lastHandoff;
    if (ownerHandoff?.from !== 'owner' || !ownerHandoff.commit) {
      fail('missing-owner-handoff', state.round);
    }
    const exactReviewOf = exactReachableCommit(root, reviewOf);
    if (exactReviewOf !== ownerHandoff.commit) {
      fail('review-of', `${exactReviewOf}; expected ${ownerHandoff.commit}`);
    }
    if (state.reviewTurnsUsed >= state.maxReviewTurns) {
      fail('budget-exhausted', `${state.reviewTurnsUsed}/${state.maxReviewTurns}`);
    }
    const reviewArtifact = exchangeArtifact(root, paths, review, 'review', [
      state.artifact.path,
      ...Object.keys(state.immutableArtifacts ?? {}),
    ]);
    if (state.immutableArtifacts?.[reviewArtifact.path]) {
      fail('review-already-used', reviewArtifact.path);
    }
    const reviewText = readFileSync(path.resolve(root, reviewArtifact.path), 'utf8');
    supplementAcknowledgments(reviewText, frozenSupplements(state));
    uniqueFindingIds(reviewText, 'review');
    const reviewTurnsUsed = state.reviewTurnsUsed + 1;
    const remainingReviewTurns = state.maxReviewTurns - reviewTurnsUsed;
    const finalChanges = decision === 'changes-requested' && remainingReviewTurns === 0;
    if (summary && !finalChanges) fail('unexpected-summary', decision);
    let summaryArtifact = null;
    if (summary) {
      summaryArtifact = exchangeArtifact(root, paths, summary, 'summary', [
        state.artifact.path,
        reviewArtifact.path,
        ...Object.keys(state.immutableArtifacts ?? {}),
      ]);
    }
    const at = new Date().toISOString();
    const lifecycle = decision === 'accepted' ? 'accepted' : 'active';
    const currentRole = lifecycle === 'active' ? 'owner' : null;
    const turnState = lifecycle === 'active' ? 'available' : null;
    const artifacts = {
      review: reviewArtifact,
      ...(summaryArtifact ? { summary: summaryArtifact } : {}),
    };
    const lastHandoff = {
      from: 'reviewer',
      to: currentRole,
      at,
      message: String(message).trim(),
      commit: exactReviewOf,
      decision,
      artifacts,
    };
    const immutableArtifacts = {
      ...(state.immutableArtifacts ?? {}),
      [reviewArtifact.path]: reviewArtifact,
      ...(summaryArtifact ? { [summaryArtifact.path]: summaryArtifact } : {}),
    };
    const next = validateState({
      ...state,
      integrity: undefined,
      revision: state.revision + 1,
      lifecycle,
      currentRole,
      turnState,
      round: state.round + 1,
      claim: null,
      reviewTurnsUsed,
      remainingReviewTurns,
      lastHandoff,
      immutableArtifacts,
      ...(state.supplements
        ? {
            supplements: state.supplements.map((supplement) =>
              supplement.status === 'frozen' ? { ...supplement, status: 'consumed' } : supplement
            ),
          }
        : {}),
      updatedAt: at,
    });
    appendEvent(paths, next, 'reviewer-handoff', at, { handoff: lastHandoff });
    return atomicStateWrite(paths, next);
  });
}

export function setMaxReviewTurns({ cwd = process.cwd(), dir, requestedMax, humanLogin }) {
  const approvedBy = String(humanLogin || '').trim();
  if (!approvedBy) fail('github-login', 'non-blank authenticated login required', { exitCode: 2 });
  if (!Number.isInteger(requestedMax) || requestedMax < 0) {
    fail('max-turns', String(requestedMax), { exitCode: 2 });
  }
  const root = repositoryRoot(cwd);
  const paths = protocolPaths(root, dir);
  return withMutex(paths, approvedBy, 'set-max-turns', () => {
    const state = assertIntegrity({ cwd: root, dir: paths.relative });
    if (state.lifecycle !== 'active') fail('set-max-turns-state', state.lifecycle);
    let adjustment;
    try {
      adjustment = {
        ...planAbsoluteBudget(state, requestedMax, state.currentRole),
        approvedBy,
      };
    } catch (error) {
      if (error instanceof RangeError) fail('max-turns', error.message, { exitCode: 2 });
      throw error;
    }
    if (adjustment.effectiveMax === state.maxReviewTurns) {
      return readProtocol({ cwd: root, dir: paths.relative });
    }
    const at = new Date().toISOString();
    const next = validateState({
      ...state,
      integrity: undefined,
      nextAction: undefined,
      revision: state.revision + 1,
      maxReviewTurns: adjustment.effectiveMax,
      remainingReviewTurns: adjustment.remainingReviewTurns,
      updatedAt: at,
    });
    appendEvent(paths, next, 'budget-adjustment', at, { adjustment });
    return atomicStateWrite(paths, next);
  });
}

export function continueProtocol({
  cwd = process.cwd(),
  dir,
  maxReviewTurns,
  additionalTurns,
  humanLogin,
  focus,
}) {
  const approvedBy = String(humanLogin || '').trim();
  if (!approvedBy) {
    fail('github-login', 'non-blank authenticated login required', { exitCode: 2 });
  }
  const root = repositoryRoot(cwd);
  const paths = protocolPaths(root, dir);
  return withMutex(paths, approvedBy, 'continue', () => {
    const state = assertIntegrity({ cwd: root, dir: paths.relative });
    if (state.lifecycle !== 'intervention-required') {
      fail('continue-state', state.lifecycle);
    }
    const resumeRole =
      state.lastHandoff?.from === 'reviewer'
        ? 'owner'
        : state.lastHandoff?.from === 'owner'
          ? 'reviewer'
          : null;
    if (!resumeRole) fail('continue-role', 'last handoff must be owner or reviewer');
    let budget;
    try {
      budget = planContinuationBudget(state, { resumeRole, maxReviewTurns, additionalTurns });
    } catch (error) {
      if (error instanceof RangeError) fail('continue-budget', error.message, { exitCode: 2 });
      throw error;
    }
    let focusArtifact = null;
    if (focus) {
      focusArtifact = exchangeArtifact(root, paths, focus, 'focus', [
        state.artifact.path,
        ...Object.keys(state.immutableArtifacts ?? {}),
      ]);
    }
    const at = new Date().toISOString();
    const continuation = {
      at,
      approvedBy,
      resumeRole,
      priorMax: budget.priorMax,
      requestedMax: budget.requestedMax,
      effectiveMax: budget.effectiveMax,
      ...(additionalTurns === undefined ? {} : { additionalTurns }),
      ...(focusArtifact ? { focus: focusArtifact } : {}),
    };
    const next = validateState({
      ...state,
      integrity: undefined,
      revision: state.revision + 1,
      lifecycle: 'active',
      currentRole: resumeRole,
      turnState: 'available',
      claim: null,
      maxReviewTurns: budget.effectiveMax,
      remainingReviewTurns: budget.remainingReviewTurns,
      continuation,
      ...(state.supplements
        ? {
            supplements: state.supplements.map((supplement) =>
              supplement.status === 'pending' ? { ...supplement, status: 'frozen' } : supplement
            ),
          }
        : {}),
      immutableArtifacts: {
        ...(state.immutableArtifacts ?? {}),
        ...(focusArtifact ? { [focusArtifact.path]: focusArtifact } : {}),
      },
      updatedAt: at,
    });
    appendEvent(paths, next, 'continue', at, { continuation });
    return atomicStateWrite(paths, next);
  });
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
