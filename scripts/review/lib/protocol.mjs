// @story #1266

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

import {
  assertArchiveDestinationAbsent,
  deriveRecoveryArchiveDir,
  inspectArchive,
  resolveArchiveDestination,
} from './archive.mjs';
import { planAbsoluteBudget, planContinuationBudget } from './budget.mjs';
import { REAL_REPOSITORY_BOUNDARY } from './repository-boundary.mjs';
import { resolveRuntimeRoot, RuntimeRootError } from './runtime-root.mjs';

export const STATE_SCHEMA = 'aitm.co-review/v1';
export const EVENT_SCHEMA = 'aitm.co-review-event/v1';
const SNAPSHOT_MAX_ATTEMPTS = 5;
const SNAPSHOT_RETRY_DELAY_MS = 10;
const SNAPSHOT_WAIT_SIGNAL = new Int32Array(new SharedArrayBuffer(4));

export function shellArgument(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(text)) return text;
  return `'${text.replaceAll("'", `'\"'\"'`)}'`;
}

export function renderCliCommand(argv) {
  return `npx aitm co-review ${argv.map(shellArgument).join(' ')}`;
}

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

function repositoryCall(code, detail, operation) {
  try {
    return operation();
  } catch (error) {
    if (error instanceof ProtocolError) throw error;
    fail(code, error.stderr?.toString().trim() || detail);
  }
}

function repositoryRoot(cwd, repository) {
  return repositoryCall('not-a-repository', String(cwd), () => repository.repositoryRoot(cwd));
}

function protocolRoot(cwd, dir, repository) {
  try {
    return resolveRuntimeRoot({ cwd, dir, repository }).root;
  } catch (error) {
    if (error instanceof RuntimeRootError) fail(error.code, error.detail);
    throw error;
  }
}

function assertRecordedRoot(state, root) {
  for (const [label, candidate] of [
    ['repositoryRoot', state.repositoryRoot],
    ['worktree', state.worktree],
  ]) {
    try {
      if (realpathSync(candidate) !== root) fail('repository-identity', `${label}=${candidate}`);
    } catch (error) {
      if (error instanceof ProtocolError) throw error;
      fail('repository-identity', `${label}=${candidate}`);
    }
  }
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

function assertIgnored(root, runtime, repository) {
  const status = repositoryCall('git', runtime.relative, () =>
    repository.runtimeStatus(root, runtime.relative)
  );
  if (!status.ignored) fail('runtime-not-ignored', runtime.relative);
  if (status.tracked) fail('runtime-tracked', runtime.relative);
}

function assertTrackedArtifact(root, artifact, repository) {
  const resolved = relativePath(root, artifact, 'artifact');
  if (!existsSync(resolved.absolute)) {
    fail('missing-artifact', resolved.relative);
  }
  if (!lstatSync(resolved.absolute).isFile()) fail('artifact-not-regular', resolved.relative);
  const runtime = repositoryCall('git', resolved.relative, () =>
    repository.runtimeStatus(root, resolved.relative)
  );
  if (!runtime.tracked) {
    fail('artifact-untracked', resolved.relative);
  }
  const observed = repositoryCall('artifact-index', resolved.relative, () =>
    repository.trackedArtifact(root, resolved.relative)
  );
  const { worktree, index, head } = observed;
  if (!worktree.equals(index) || !index.equals(head)) fail('artifact-drift', resolved.relative);
  return {
    path: resolved.relative,
    commit: observed.commit,
    blob: observed.blob,
    sha256: digestBuffer(worktree),
  };
}

function exactReachableCommit(root, revision, repository) {
  const observed = repositoryCall('git', String(revision), () =>
    repository.resolveReachableCommit(root, revision)
  );
  if (observed.commit === null) fail('git-commit', String(revision));
  if (!observed.reachable) fail('git-commit-unreachable', observed.commit);
  return observed.commit;
}

function assertCommitArtifact(root, commit, artifact, repository) {
  const observed = repositoryCall('git', `${commit}:${artifact.path}`, () =>
    repository.committedArtifact(root, commit, artifact.path)
  );
  if (observed === null) fail('commit-missing-artifact', `${commit}:${artifact.path}`);
  if (!observed.bytes.equals(readFileSync(path.join(root, artifact.path)))) {
    fail('artifact-drift', `${commit}:${artifact.path}`);
  }
  return observed.blob;
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

function readEventRecords(paths) {
  return readFileSync(paths.events, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function eventIntegrity(paths, state) {
  let events;
  try {
    events = readEventRecords(paths);
  } catch (error) {
    return { events: [], errors: [`events-unreadable: ${error.message}`] };
  }
  return eventIntegrityForRecords(events, state);
}

function eventIntegrityForRecords(events, state) {
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
  errors.push(...eventProjectionErrors(events, state));
  return { events, errors };
}

function eventProjectionErrors(events, state, { requireEvent = false } = {}) {
  const event = events[state.revision - 1];
  if (event?.revision !== state.revision) {
    return requireEvent
      ? [`event-projection revision ${state.revision}: corresponding event unavailable`]
      : [];
  }
  const errors = [];
  for (const field of [
    'lifecycle',
    'currentRole',
    'round',
    'reviewTurnsUsed',
    'maxReviewTurns',
    'remainingReviewTurns',
  ]) {
    if (event[field] !== state[field]) {
      errors.push(
        `event-projection ${field}: expected ${String(state[field])}, actual ${String(event[field])}`
      );
    }
  }
  const expectedSupplements =
    state.supplements === undefined ? undefined : supplementProjection(state.supplements);
  if (JSON.stringify(event.supplements) !== JSON.stringify(expectedSupplements)) {
    errors.push('event-projection supplements: state differs from corresponding event');
  }
  if (JSON.stringify(event.acceptance) !== JSON.stringify(state.acceptance)) {
    errors.push('event-projection acceptance: state differs from corresponding event');
  }
  return errors;
}

function mutationLockPresent(paths) {
  try {
    return lstatSync(paths.lock).isDirectory();
  } catch {
    return false;
  }
}

function validForwardEventLead(state, events, errors) {
  return (
    errors.length === 1 &&
    errors[0] === `event-count: expected ${state.revision}, actual ${events.length}` &&
    events.length > state.revision
  );
}

function validBackwardEventLag(state, events, errors) {
  return (
    errors.length === 1 &&
    errors[0] === `event-count: expected ${state.revision}, actual ${events.length}` &&
    events.length < state.revision
  );
}

function snapshotConsistency(input = {}) {
  const maxAttempts = input.maxAttempts ?? SNAPSHOT_MAX_ATTEMPTS;
  const delayMilliseconds = input.delayMilliseconds ?? SNAPSHOT_RETRY_DELAY_MS;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
    throw new TypeError('co-review: snapshot consistency maxAttempts must be 1..20');
  }
  if (!Number.isFinite(delayMilliseconds) || delayMilliseconds < 0 || delayMilliseconds > 100) {
    throw new TypeError('co-review: snapshot consistency delayMilliseconds must be 0..100');
  }
  const wait =
    input.wait ??
    ((milliseconds) => {
      if (milliseconds > 0) Atomics.wait(SNAPSHOT_WAIT_SIGNAL, 0, 0, milliseconds);
    });
  if (typeof wait !== 'function') {
    throw new TypeError('co-review: snapshot consistency wait must be a function');
  }
  const afterStateRead = input.afterStateRead;
  if (afterStateRead !== undefined && typeof afterStateRead !== 'function') {
    throw new TypeError('co-review: snapshot consistency afterStateRead must be a function');
  }
  const afterEventRead = input.afterEventRead;
  if (afterEventRead !== undefined && typeof afterEventRead !== 'function') {
    throw new TypeError('co-review: snapshot consistency afterEventRead must be a function');
  }
  const beforeStateRead = input.beforeStateRead;
  if (beforeStateRead !== undefined && typeof beforeStateRead !== 'function') {
    throw new TypeError('co-review: snapshot consistency beforeStateRead must be a function');
  }
  return {
    maxAttempts,
    delayMilliseconds,
    wait,
    beforeStateRead,
    afterStateRead,
    afterEventRead,
  };
}

function readStatusSnapshot({ cwd, dir, repository, consistency }) {
  const root = protocolRoot(cwd, dir, repository);
  const paths = protocolPaths(root, dir);
  const retry = snapshotConsistency(consistency);
  let pendingState;
  for (let attempt = 1; ; attempt += 1) {
    retry.beforeStateRead?.({ attempt, paths });
    const lockedBefore = mutationLockPresent(paths);
    const state = readProtocol({ cwd: root, dir: paths.relative, repository });
    retry.afterStateRead?.({ attempt, state, paths });
    const observed = eventIntegrity(paths, state);
    retry.afterEventRead?.({ attempt, state, events: observed.events, paths });
    const lockedAfter = mutationLockPresent(paths);
    if (pendingState) {
      const pending = eventIntegrityForRecords(observed.events, pendingState);
      if (
        pending.errors.length > 0 &&
        !validForwardEventLead(pendingState, pending.events, pending.errors)
      ) {
        return { root, paths, state: pendingState, ...pending };
      }
      pendingState = undefined;
    }
    const eventLead = validForwardEventLead(state, observed.events, observed.errors);
    if (eventLead) {
      const confirmedState = readProtocol({ cwd: root, dir: paths.relative, repository });
      const confirmed = eventIntegrityForRecords(observed.events, confirmedState);
      if (confirmed.errors.length === 0) {
        return { root, paths, state: confirmedState, ...confirmed };
      }
      if (confirmedState.revision > state.revision) {
        const confirmationForward = validForwardEventLead(
          confirmedState,
          confirmed.events,
          confirmed.errors
        );
        if (confirmationForward && attempt < retry.maxAttempts) continue;
        if (
          validBackwardEventLag(confirmedState, confirmed.events, confirmed.errors) &&
          attempt < retry.maxAttempts
        ) {
          pendingState = confirmedState;
          continue;
        }
        return { root, paths, state: confirmedState, ...confirmed };
      }
    }
    const singleEventLead = observed.events.length === state.revision + 1;
    if (
      !eventLead ||
      !singleEventLead ||
      (!lockedBefore && !lockedAfter) ||
      attempt >= retry.maxAttempts
    ) {
      return { root, paths, state, ...observed };
    }
    retry.wait(retry.delayMilliseconds, {
      attempt,
      state,
      events: observed.events,
      paths,
    });
  }
}

function sameInitialization(state, desired) {
  return JSON.stringify(state.initialization) === JSON.stringify(desired);
}

export function readProtocol({ cwd = process.cwd(), dir, repository = REAL_REPOSITORY_BOUNDARY }) {
  const root = protocolRoot(cwd, dir, repository);
  const paths = protocolPaths(root, dir);
  if (!existsSync(paths.state)) fail('not-initialized', paths.relative);
  try {
    const state = validateState(JSON.parse(readFileSync(paths.state, 'utf8')));
    assertRecordedRoot(state, root);
    return state;
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
  repository = REAL_REPOSITORY_BOUNDARY,
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

  const root = repositoryRoot(cwd, repository);
  const paths = protocolPaths(root, dir);
  assertIgnored(root, paths, repository);
  const archive = archiveDir
    ? resolveArchiveDestination({
        cwd: root,
        archiveDir,
        runtimeDir: paths.relative,
        repository,
      })
    : null;
  const artifactRecord = assertTrackedArtifact(root, artifact, repository);
  let importedReview = null;
  let importedCommit = null;
  if (importReview) {
    importedReview = digestFile(root, importReview, 'import-review');
    const importAbsolute = path.resolve(root, importedReview.path);
    if (!importAbsolute.startsWith(`${paths.absolute}${path.sep}`)) {
      fail('import-outside-runtime', importedReview.path);
    }
    importedCommit = exactReachableCommit(root, reviewOf, repository);
    artifactRecord.blob = assertCommitArtifact(root, importedCommit, artifactRecord, repository);
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
    ...(archive ? { archiveDir: archive.lexicalRelative } : {}),
  };

  return withMutex(paths, 'system', 'init', () => {
    if (existsSync(paths.state)) {
      const existing = readProtocol({ cwd: root, dir: paths.relative, repository });
      if (sameInitialization(existing, initialization)) return existing;
      fail('already-initialized', paths.relative);
    }
    if (existsSync(paths.events)) fail('orphaned-events', paths.relative);
    if (archive) assertArchiveDestinationAbsent(archive);
    const at = new Date().toISOString();
    const imported = Boolean(importedReview);
    const state = validateState({
      schema: STATE_SCHEMA,
      protocolId: randomUUID(),
      repositoryRoot: root,
      worktree: root,
      branch: repositoryCall('git', 'repository identity', () => repository.identity(root)).branch,
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
  const repository = options.repository ?? REAL_REPOSITORY_BOUNDARY;
  const {
    root,
    state,
    events: snapshotEvents,
    errors,
  } = readStatusSnapshot({
    cwd: options.cwd ?? process.cwd(),
    dir: options.dir,
    repository,
    consistency: options.consistency,
  });
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
      const identity = repositoryCall('git-integrity', 'repository identity', () =>
        repository.identity(root)
      );
      if (identity.head !== state.artifact.commit) {
        errors.push(`branch-drift: expected ${state.artifact.commit}, actual ${identity.head}`);
      }
      const observed = repositoryCall('git-integrity', state.artifact.path, () =>
        repository.trackedArtifact(root, state.artifact.path)
      );
      if (digestBuffer(observed.index) !== state.artifact.sha256) {
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
  const events = errors.length === 0 ? snapshotEvents : [];
  const latestBudgetEvent = events.findLast((event) => event.adjustment || event.continuation);
  const latestBudgetAdjustment =
    latestBudgetEvent?.adjustment ?? latestBudgetEvent?.continuation ?? null;
  const lastReviewer = events.findLast((event) => event.type === 'reviewer-handoff');
  const lastOwner = events.findLast((event) => event.type === 'owner-handoff');
  let unresolvedFindingIds = [];
  if (lastReviewer?.handoff?.decision === 'changes-requested') {
    try {
      const reviewPath = lastReviewer.handoff.artifacts?.review?.path;
      if (reviewPath) {
        unresolvedFindingIds = uniqueFindingIds(
          readFileSync(path.resolve(root, reviewPath), 'utf8'),
          'review'
        );
      }
    } catch {
      unresolvedFindingIds = [];
    }
  }
  const closingOwnerComplete = Boolean(
    state.lifecycle === 'intervention-required' &&
    events.at(-1)?.type === 'owner-handoff' &&
    events.at(-1)?.handoff?.artifacts?.answeredReview
  );
  const terminalEvidence = {
    reviewerReview: lastReviewer?.handoff?.artifacts?.review ?? null,
    ownerResponse: lastOwner?.handoff?.artifacts?.response ?? null,
  };
  let archive = { destination: null, completion: 'unknown' };
  if (state.lifecycle === 'accepted' && state.initialization?.archiveDir && integrity.ok) {
    const configured = state.initialization.archiveDir;
    try {
      const configuredInspection = inspectArchive({
        root,
        state,
        events,
        archiveDir: configured,
        repository,
      });
      if (configuredInspection.status !== 'conflict') {
        archive = {
          destination: configured,
          completion:
            configuredInspection.status === 'complete'
              ? 'complete-and-identical'
              : configuredInspection.status,
        };
      } else {
        const recovery = deriveRecoveryArchiveDir(configured, state.protocolId);
        try {
          const recoveryInspection = inspectArchive({
            root,
            state,
            events,
            archiveDir: recovery,
            repository,
          });
          if (recoveryInspection.status === 'absent' || recoveryInspection.status === 'complete') {
            archive = {
              destination: recovery,
              configuredDestination: configured,
              completion:
                recoveryInspection.status === 'complete'
                  ? 'complete-and-identical'
                  : recoveryInspection.status,
              recovery: true,
            };
          } else {
            archive = {
              destination: configured,
              completion: 'conflict',
              errors: [...configuredInspection.errors, ...recoveryInspection.errors],
            };
          }
        } catch (recoveryError) {
          archive = {
            destination: configured,
            completion: 'conflict',
            errors: [...configuredInspection.errors, recoveryError.message],
          };
        }
      }
    } catch (configuredError) {
      archive = {
        destination: configured,
        completion: 'conflict',
        errors: [configuredError.message],
      };
    }
  } else if (state.initialization?.archiveDir) {
    archive = { destination: state.initialization.archiveDir, completion: 'not-applicable' };
  }
  const baseNextAction = nextAction(state, integrity);
  const runtimeDir = path.resolve(state.repositoryRoot, state.initialization.runtimeDir);
  let availableActions = [{ kind: 'next', command: baseNextAction }];
  let decoratedNextAction = baseNextAction;
  if (state.lifecycle === 'intervention-required' && integrity.ok) {
    const continueCommand = `npx aitm co-review continue --dir ${shellArgument(runtimeDir)} --max-turns <N> [--focus <file>]`;
    availableActions = [
      { kind: 'continue', command: continueCommand },
      ...(closingOwnerComplete
        ? [
            {
              kind: 'finalize-good-enough',
              command: `npx aitm co-review finalize --dir ${shellArgument(runtimeDir)} --good-enough${
                state.initialization.archiveDir
                  ? ` --archive-dir ${shellArgument(state.initialization.archiveDir)}`
                  : ' --archive-dir <tracked-repo-path>'
              }`,
            },
          ]
        : []),
      { kind: 'no-action', command: null },
    ];
    decoratedNextAction = continueCommand;
  } else if (
    state.lifecycle === 'accepted' &&
    integrity.ok &&
    (archive.completion === 'absent' ||
      (!state.initialization?.archiveDir && archive.completion === 'unknown'))
  ) {
    decoratedNextAction = `npx aitm co-review finalize --dir ${shellArgument(runtimeDir)}${
      archive.destination
        ? ` --archive-dir ${shellArgument(archive.destination)}`
        : ' --archive-dir <tracked-repo-path>'
    }`;
    availableActions = [{ kind: 'finalize', command: decoratedNextAction }];
  }
  return {
    ...state,
    activeSupplements,
    integrity,
    decisionBasis:
      state.acceptance?.basis ??
      (events.at(-1)?.type === 'reviewer-handoff' && events.at(-1)?.handoff?.decision === 'accepted'
        ? 'reviewer-consensus'
        : events.at(-1)?.type === 'human-good-enough'
          ? 'human-good-enough'
          : null),
    archive,
    latestBudgetAdjustment,
    terminalEvidence,
    unresolvedFindingIds,
    closingOwnerComplete,
    availableActions,
    nextAction: decoratedNextAction,
  };
}

function nextAction(state, integrity) {
  const runtimeDir = path.resolve(state.repositoryRoot, state.initialization.runtimeDir);
  if (!integrity.ok) return 'preserve protocol files and escalate integrity drift to the human';
  if (state.lifecycle === 'accepted') return 'stop; protocol accepted';
  if (state.lifecycle === 'intervention-required') {
    return `npx aitm co-review continue --dir ${shellArgument(runtimeDir)} --max-turns <N> [--focus <file>]`;
  }
  const actor = state.roles[state.currentRole];
  if (state.turnState === 'available') {
    return `npx aitm co-review claim --dir ${shellArgument(runtimeDir)} --actor ${shellArgument(actor)}`;
  }
  return `${state.currentRole} ${actor} holds round ${state.round}; complete the role artifact and run npx aitm co-review help handoff`;
}

function assertIntegrity(options) {
  const status = statusProtocol(options);
  if (!status.integrity.ok) fail('integrity', status.integrity.errors.join('; '));
  return readProtocol(options);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function validatedArchiveSnapshot({
  cwd = process.cwd(),
  dir,
  repository = REAL_REPOSITORY_BOUNDARY,
} = {}) {
  const root = protocolRoot(cwd, dir, repository);
  const paths = protocolPaths(root, dir);
  const state = assertIntegrity({ cwd: root, dir: paths.relative, repository });
  let events;
  try {
    events = readFileSync(paths.events, 'utf8')
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  } catch (error) {
    fail('events-unreadable', error.message);
  }
  const terminal = events.at(-1);
  const reviewerConsensus =
    terminal?.type === 'reviewer-handoff' && terminal?.handoff?.decision === 'accepted';
  const humanGoodEnough = terminal?.type === 'human-good-enough';
  if (state.lifecycle !== 'accepted' || (!reviewerConsensus && !humanGoodEnough)) {
    fail('archive-ineligible', `${state.lifecycle}:${terminal?.type ?? 'no-events'}`);
  }
  return deepFreeze(structuredClone({ root, state, events }));
}

export function claimTurn({
  cwd = process.cwd(),
  dir,
  actor,
  repository = REAL_REPOSITORY_BOUNDARY,
}) {
  const root = protocolRoot(cwd, dir, repository);
  const paths = protocolPaths(root, dir);
  return withMutex(paths, actor, 'claim', () => {
    const state = assertIntegrity({ cwd: root, dir: paths.relative, repository });
    const role = Object.entries(state.roles).find(([, identity]) => identity === actor)?.[0];
    if (!role) fail('unknown-actor', String(actor));
    if (state.lifecycle !== 'active') fail('terminal', state.lifecycle);
    if (state.currentRole !== role) {
      fail('wrong-role', `${actor} maps to ${role}; current role is ${state.currentRole}`);
    }
    if (state.turnState === 'claimed' && state.claim?.actor === actor)
      return readProtocol({ cwd: root, dir: paths.relative, repository });
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
  const lock = realpathSync(paths.lock);
  if (
    absolute === paths.lock ||
    absolute.startsWith(`${paths.lock}${path.sep}`) ||
    physical === lock ||
    physical.startsWith(`${lock}${path.sep}`)
  ) {
    fail(`${label}-path-conflict`, artifact.path);
  }
  const reservedPaths = [
    paths.state,
    paths.events,
    paths.lock,
    ...disallowed.map((value) => path.resolve(root, value)),
  ];
  const reserved = new Set(reservedPaths);
  const physicalReserved = new Set(
    reservedPaths
      .filter((reservedPath) => existsSync(reservedPath))
      .map((reservedPath) => realpathSync(reservedPath))
  );
  if (reserved.has(absolute) || physicalReserved.has(physical)) {
    fail(`${label}-path-conflict`, artifact.path);
  }
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

export function registerSupplement({
  cwd = process.cwd(),
  dir,
  file,
  humanLogin,
  repository = REAL_REPOSITORY_BOUNDARY,
}) {
  const registeredBy = String(humanLogin || '').trim();
  if (!registeredBy)
    fail('github-login', 'non-blank authenticated login required', { exitCode: 2 });
  const root = protocolRoot(cwd, dir, repository);
  const paths = protocolPaths(root, dir);
  return withMutex(paths, registeredBy, 'supplement', () => {
    const current = readProtocol({ cwd: root, dir: paths.relative, repository });
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
        assertIntegrity({ cwd: root, dir: paths.relative, repository });
        return readProtocol({ cwd: root, dir: paths.relative, repository });
      }
      fail('supplement-conflict', artifact.path);
    }
    const state = assertIntegrity({ cwd: root, dir: paths.relative, repository });
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

function committedOwnerArtifact(root, state, artifact, revision, repository) {
  const resolved = relativePath(root, artifact, 'artifact');
  if (resolved.relative !== state.artifact.path) {
    fail('wrong-artifact', `${resolved.relative}; expected ${state.artifact.path}`);
  }
  const commit = exactReachableCommit(root, revision, repository);
  const identity = repositoryCall('git', 'repository identity', () => repository.identity(root));
  if (commit !== identity.head) fail('commit-not-head', `${commit}; HEAD=${identity.head}`);
  if (identity.branch !== state.branch) {
    fail('branch-drift', `${identity.branch}; expected ${state.branch}`);
  }
  const committed = repositoryCall('git', `${commit}:${resolved.relative}`, () =>
    repository.committedArtifact(root, commit, resolved.relative)
  );
  if (committed === null) fail('commit-missing-artifact', `${commit}:${resolved.relative}`);
  const observed = repositoryCall('git', resolved.relative, () =>
    repository.trackedArtifact(root, resolved.relative)
  );
  if (!observed.worktree.equals(committed.bytes)) fail('artifact-drift', resolved.relative);
  if (!observed.index.equals(committed.bytes)) fail('index-drift', resolved.relative);
  return {
    path: resolved.relative,
    commit,
    blob: committed.blob,
    sha256: digestBuffer(committed.bytes),
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
  repository = REAL_REPOSITORY_BOUNDARY,
}) {
  const root = protocolRoot(cwd, dir, repository);
  const paths = protocolPaths(root, dir);
  return withMutex(paths, actor, 'owner-handoff', () => {
    const state = assertIntegrity({ cwd: root, dir: paths.relative, repository });
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
    const artifactRecord = committedOwnerArtifact(root, state, artifact, commit, repository);
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
  repository = REAL_REPOSITORY_BOUNDARY,
}) {
  const root = protocolRoot(cwd, dir, repository);
  const paths = protocolPaths(root, dir);
  return withMutex(paths, actor, 'reviewer-handoff', () => {
    const state = assertIntegrity({ cwd: root, dir: paths.relative, repository });
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
    const exactReviewOf = exactReachableCommit(root, reviewOf, repository);
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
    const acceptance =
      decision === 'accepted'
        ? { basis: 'reviewer-consensus', at, reviewer: state.roles.reviewer }
        : undefined;
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
      ...(acceptance ? { acceptance } : {}),
      ...(state.supplements
        ? {
            supplements: state.supplements.map((supplement) =>
              supplement.status === 'frozen' ? { ...supplement, status: 'consumed' } : supplement
            ),
          }
        : {}),
      updatedAt: at,
    });
    appendEvent(paths, next, 'reviewer-handoff', at, {
      handoff: lastHandoff,
      ...(acceptance ? { acceptance } : {}),
    });
    return atomicStateWrite(paths, next);
  });
}

function assertGoodEnoughEvidence(state, events) {
  if (state.lifecycle !== 'intervention-required') {
    fail('good-enough-state', state.lifecycle);
  }
  const ownerEvent = events.at(-1);
  let reviewerEvent = null;
  for (let index = events.length - 2; index >= 0; index -= 1) {
    if (events[index]?.type === 'reviewer-handoff') {
      reviewerEvent = events[index];
      break;
    }
  }
  const ownerHandoff = ownerEvent?.handoff;
  const reviewerHandoff = reviewerEvent?.handoff;
  if (
    ownerEvent?.type !== 'owner-handoff' ||
    ownerEvent.lifecycle !== 'intervention-required' ||
    ownerHandoff?.from !== 'owner' ||
    !ownerHandoff.artifacts?.response ||
    !ownerHandoff.artifacts?.answeredReview ||
    reviewerEvent?.type !== 'reviewer-handoff' ||
    reviewerHandoff?.decision !== 'changes-requested' ||
    !reviewerHandoff.artifacts?.review ||
    ownerHandoff.artifacts.answeredReview.path !== reviewerHandoff.artifacts.review.path ||
    ownerHandoff.artifacts.answeredReview.sha256 !== reviewerHandoff.artifacts.review.sha256 ||
    state.reviewTurnsUsed !== state.maxReviewTurns ||
    state.remainingReviewTurns !== 0
  ) {
    fail('good-enough-evidence', 'author-completed two-sided evidence pair required');
  }
}

function acceptedGoodEnoughState(state, acceptance) {
  return validateState({
    ...state,
    integrity: undefined,
    nextAction: undefined,
    revision: state.revision + 1,
    lifecycle: 'accepted',
    acceptance,
    updatedAt: acceptance.at,
  });
}

export function prepareGoodEnoughSnapshot({
  cwd = process.cwd(),
  dir,
  humanLogin,
  repository = REAL_REPOSITORY_BOUNDARY,
} = {}) {
  const approvedBy = String(humanLogin || '').trim();
  if (!approvedBy) fail('github-login', 'non-blank authenticated login required', { exitCode: 2 });
  const root = protocolRoot(cwd, dir, repository);
  const paths = protocolPaths(root, dir);
  const state = assertIntegrity({ cwd: root, dir: paths.relative, repository });
  const events = readEventRecords(paths);
  assertGoodEnoughEvidence(state, events);
  const acceptance = {
    basis: 'human-good-enough',
    at: new Date().toISOString(),
    approvedBy,
  };
  const accepted = acceptedGoodEnoughState(state, acceptance);
  const terminal = { ...eventFor(accepted, 'human-good-enough', acceptance.at), acceptance };
  return deepFreeze({
    root,
    state: accepted,
    events: [...events, terminal],
    expectedRevision: state.revision,
    acceptance,
  });
}

export function acceptGoodEnough({
  cwd = process.cwd(),
  dir,
  humanLogin,
  expectedRevision,
  acceptedAt,
  repository = REAL_REPOSITORY_BOUNDARY,
}) {
  const approvedBy = String(humanLogin || '').trim();
  if (!approvedBy) fail('github-login', 'non-blank authenticated login required', { exitCode: 2 });
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    fail('revision', String(expectedRevision), { exitCode: 2 });
  }
  const root = protocolRoot(cwd, dir, repository);
  const paths = protocolPaths(root, dir);
  return withMutex(paths, approvedBy, 'human-good-enough', () => {
    const state = assertIntegrity({ cwd: root, dir: paths.relative, repository });
    if (state.revision !== expectedRevision) {
      fail('revision', `${expectedRevision}; current ${state.revision}`);
    }
    const events = readEventRecords(paths);
    assertGoodEnoughEvidence(state, events);
    const at = acceptedAt ?? new Date().toISOString();
    if (Number.isNaN(Date.parse(at))) fail('acceptance-time', String(at));
    const acceptance = { basis: 'human-good-enough', at, approvedBy };
    const next = acceptedGoodEnoughState(state, acceptance);
    appendEvent(paths, next, 'human-good-enough', at, { acceptance });
    return atomicStateWrite(paths, next);
  });
}

export function setMaxReviewTurns({
  cwd = process.cwd(),
  dir,
  requestedMax,
  humanLogin,
  repository = REAL_REPOSITORY_BOUNDARY,
}) {
  const approvedBy = String(humanLogin || '').trim();
  if (!approvedBy) fail('github-login', 'non-blank authenticated login required', { exitCode: 2 });
  if (!Number.isInteger(requestedMax) || requestedMax < 0) {
    fail('max-turns', String(requestedMax), { exitCode: 2 });
  }
  const root = protocolRoot(cwd, dir, repository);
  const paths = protocolPaths(root, dir);
  return withMutex(paths, approvedBy, 'set-max-turns', () => {
    const state = assertIntegrity({ cwd: root, dir: paths.relative, repository });
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
      return readProtocol({ cwd: root, dir: paths.relative, repository });
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
  repository = REAL_REPOSITORY_BOUNDARY,
}) {
  const approvedBy = String(humanLogin || '').trim();
  if (!approvedBy) {
    fail('github-login', 'non-blank authenticated login required', { exitCode: 2 });
  }
  const root = protocolRoot(cwd, dir, repository);
  const paths = protocolPaths(root, dir);
  return withMutex(paths, approvedBy, 'continue', () => {
    const state = assertIntegrity({ cwd: root, dir: paths.relative, repository });
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
  repository = REAL_REPOSITORY_BOUNDARY,
  consistency,
}) {
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 0 || timeoutSeconds > 60) {
    fail('timeout', String(timeoutSeconds), { exitCode: 2 });
  }
  if (!Number.isFinite(pollMilliseconds) || pollMilliseconds <= 0) {
    fail('poll-interval', String(pollMilliseconds), { exitCode: 2 });
  }
  const first = statusProtocol({ cwd, dir, repository, consistency });
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
    state = statusProtocol({ cwd, dir, repository, consistency });
  }
}
