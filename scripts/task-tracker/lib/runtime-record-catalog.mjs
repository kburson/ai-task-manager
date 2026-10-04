// @story #1857
// Pure source classification. The planner owns physical identity, trust and copying.
import { validateTimingQueue } from '../queue.mjs';
import { validateActorTimingState } from './actor-timing-state.mjs';
import { validateWordCursor } from '../word-counter.mjs';
import { validateReadyForPlanMigrationJournal } from './ready-for-plan-migration.mjs';
import { timingActorKey } from './timing-actor.mjs';
import { parseTimingRow } from './timing-row-reader.mjs';
import { validateClosedBindingLedger } from './worktree-binding-lifecycle.mjs';
import { isCacheEligible, cacheKey } from './verifier-cache.mjs';
import { validatePendingAskMarker } from './pending-ask-record.mjs';
import { validateActorFlushJournal } from './actor-flush-journal.mjs';

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const instant = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const nullable = (check) => (value) => value === null || check(value);
const number = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const text = (value) => typeof value === 'string';
const issue = (value) =>
  (typeof value === 'string' && /^#?[1-9][0-9]*$/.test(value)) ||
  (Number.isSafeInteger(value) && value > 0);
const bindingIssue = (value) => issue(value) || value === 'discover' || value === 'plan';
const optionalFields = (value, fields) =>
  object(value) &&
  Object.entries(fields).every(([key, check]) => value[key] === undefined || check(value[key]));

function stateRecord(value) {
  return optionalFields(value, {
    schema: (schema) => schema === 'aitm.runtime-state/v1',
    active: nullable(bindingIssue),
    lastActive: nullable(bindingIssue),
    entryStartTs: nullable(instant),
    pausedAtTs: nullable(instant),
    wordsAtEntryStart: number,
    fullWordsAtEntryStart: number,
    totalActiveMinutes: nullable(number),
    lastWordMarker: number,
    lastFullWordMarker: number,
    paused: (flag) => typeof flag === 'boolean',
    choreMode: (mode) =>
      object(mode) &&
      typeof mode.active === 'boolean' &&
      optionalFields(mode, {
        since: nullable(instant),
        previousIssue: nullable(issue),
        reason: nullable(text),
      }),
    choreModeLog: (rows) =>
      Array.isArray(rows) &&
      rows.every(
        (row) =>
          object(row) &&
          row.event === 'on' &&
          nullable(instant)(row.ts) &&
          nullable(text)(row.reason) &&
          nullable(issue)(row.previousIssue)
      ),
  });
}

function queueRecord(value) {
  return validateTimingQueue(value).every(
    ({ event }) =>
      event.kind === 'timing' &&
      issue(event.issue) &&
      typeof event.row === 'string' &&
      parseTimingRow(event.row) !== null &&
      (event.queuedAt === undefined || instant(event.queuedAt))
  );
}

function bindingRecord(value) {
  return optionalFields(value, {
    schema: () => false,
    issue: nullable(bindingIssue),
    entryStartTs: nullable(instant),
    wordsAtStart: number,
    boundAt: instant,
    worktreeResolvedAt: instant,
    worktreePath: text,
    worktreeBranch: text,
    kanbanState: text,
    closedAt: instant,
    bindingGenerationId: text,
    cycleId: text,
  });
}

function occupancyRecord(value) {
  return (
    object(value) &&
    Object.entries(value).every(
      ([key, row]) =>
        /^[1-9][0-9]*$/.test(key) &&
        object(row) &&
        String(row.issue) === key &&
        ['sid', 'provider', 'worktreePath'].every(
          (field) => text(row[field]) && row[field].length > 0
        ) &&
        instant(row.boundAt) &&
        instant(row.lastHeartbeatAt) &&
        (row.bindingGenerationId === undefined ||
          /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
            row.bindingGenerationId
          ))
    )
  );
}

function fleetRecord(value) {
  return (
    object(value) &&
    Object.entries(value).every(
      ([key, row]) =>
        issue(key) &&
        object(row) &&
        text(row.worktreePath) &&
        text(row.branch) &&
        instant(row.startedAt) &&
        (row.kind === undefined || ['main', 'worktree'].includes(row.kind)) &&
        ['active', 'paused', 'stopped', 'completed', 'closed'].includes(row.status)
    )
  );
}

function gateRecord(value, sid) {
  return (
    object(value) &&
    value.schema === undefined &&
    value.sessionId === sid &&
    nullable(text)(value.lastPromptedParent) &&
    instant(value.updatedAt) &&
    object(value.gates) &&
    Object.keys(value.gates).sort().join(',') ===
      'analysisToDevelopment,pullRequestReview,reviewToDone' &&
    Object.values(value.gates).every((flag) => flag === null || typeof flag === 'boolean')
  );
}

function cacheRecord(value) {
  return (
    object(value) &&
    value.version === 1 &&
    object(value.entries) &&
    Object.entries(value.entries).every(
      ([key, entry]) =>
        object(entry) &&
        typeof entry.cmd === 'string' &&
        isCacheEligible(entry.cmd) &&
        /^[a-f0-9]{40}$/.test(entry.sha || '') &&
        key === cacheKey(entry.cmd, entry.sha) &&
        entry.exit === 0 &&
        instant(entry.ts)
    )
  );
}

function descriptor(relative, family, scope, validate) {
  return {
    destination: relative,
    family,
    scope,
    validate: (bytes) => {
      try {
        if (!Buffer.isBuffer(bytes)) return false;
        return (
          validate(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))) === true
        );
      } catch {
        return false;
      }
    },
  };
}

export function classifyRuntimeRecord({ relative, kind, actorIdentity } = {}) {
  if (
    typeof relative !== 'string' ||
    relative.startsWith('/') ||
    relative.split('/').some((part) => !part || part === '.' || part === '..')
  )
    return null;
  if (kind !== 'volatile-runtime') return null;
  const known = {
    'migrations/ready-for-plan-migration.json': [
      'ready-for-plan-journal',
      'shared',
      (value) => validateReadyForPlanMigrationJournal(value) === value,
    ],
    'state/task-tracker-state.json': ['state', 'local', stateRecord],
    'state/task-tracker-queue.json': ['queue', 'local', queueRecord],
    'fleet/task-fleet.json': ['fleet', 'shared', fleetRecord],
    'fleet/occupancy.json': ['occupancy', 'shared', occupancyRecord],
    'fleet/closed-bindings.json': [
      'closed-bindings',
      'shared',
      (value) => validateClosedBindingLedger(value) === value,
    ],
    'fleet/orchestrator.lock': [
      'orchestrator-lock',
      'shared',
      (value) =>
        object(value) &&
        (value.schema === undefined ||
          (value.schema === 'aitm.orchestrator-lock/v1' &&
            object(value.owner) &&
            value.owner.actor === timingActorKey(value.owner))) &&
        issue(value.epic) &&
        instant(value.startedAt) &&
        number(value.ttlMs) &&
        value.ttlMs > 0,
    ],
    'cache/verifier-results.json': ['verifier-cache', 'local', cacheRecord],
  }[relative];
  if (known) return descriptor(relative, ...known);
  if (/^locks\/hook-event-[a-f0-9]{64}\.stamp$/.test(relative))
    return {
      destination: relative,
      family: 'hook-idempotency',
      scope: 'shared',
      validate: (bytes) => Buffer.isBuffer(bytes) && bytes.length === 0,
    };
  const draft = relative.match(/^draft-branch\/([1-9][0-9]*)\.json$/);
  if (draft)
    return descriptor(
      relative,
      'draft-branch-journal',
      'local',
      (value) =>
        object(value) &&
        value.schema === undefined &&
        String(value.issue) === draft[1] &&
        typeof value.sessionId === 'string' &&
        /^[A-Za-z0-9._-]+$/.test(value.sessionId) &&
        typeof value.worktree === 'string' &&
        value.worktree.startsWith('/') &&
        /^[a-f0-9]{40}$/.test(value.head || '') &&
        typeof value.branch === 'string' &&
        value.branch.length > 0
    );
  let match = relative.match(/^gates\/task-tracker\.session\.([A-Za-z0-9._-]+)\.json$/);
  if (match) return descriptor(relative, 'gates', 'local', (value) => gateRecord(value, match[1]));
  match = relative.match(/^sessions\/([A-Za-z0-9._-]+)\/active-task\.json$/);
  if (match) return descriptor(relative, 'sessions', 'local', bindingRecord);
  match = relative.match(/^sessions\/([A-Za-z0-9._-]+)\/pending-ask\.json$/);
  if (match) {
    const sid = match[1];
    return descriptor(
      relative,
      'sessions',
      'local',
      (value) =>
        actorIdentity?.sid === sid && validatePendingAskMarker(value, actorIdentity) === value
    );
  }
  match = relative.match(
    /^sessions\/([A-Za-z0-9._-]+)\/timing\/([a-f0-9]{64})\.json\.flush\.json$/
  );
  if (match) {
    const [, sid, actor] = match;
    return descriptor(relative, 'sessions', 'local', (value) => {
      if (value.sid !== sid || value.actor !== 'v1:' + actor) return false;
      return validateActorFlushJournal(value, { provider: value.provider, sid }) === value;
    });
  }
  match = relative.match(/^sessions\/([A-Za-z0-9._-]+)\/timing\/([a-f0-9]{64})\.json$/);
  if (match) {
    const [, sid, actor] = match;
    return descriptor(relative, 'sessions', 'local', (value) => {
      if (value.sid !== sid || value.actor !== 'v1:' + actor) return false;
      return validateActorTimingState(value, { provider: value.provider, sid }) === value;
    });
  }
  match = relative.match(/^app\/([A-Za-z0-9._-]+)\/session-tracking\/([A-Za-z0-9._-]+)\.json$/);
  if (match) {
    const [, provider, sid] = match;
    return descriptor(relative, 'provider-mirror', 'local', (value) => {
      validateWordCursor(value, { provider, sid });
      return true;
    });
  }
  return null;
}
