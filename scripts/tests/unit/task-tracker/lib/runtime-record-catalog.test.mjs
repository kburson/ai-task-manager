// @story #1857
import { initializeFixtureActor } from '../../../helpers/fixture-actor.mjs';
initializeFixtureActor(import.meta.url);
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRuntimeRecord } from '../../../../task-tracker/lib/runtime-record-catalog.mjs';
import { timingActorKey } from '../../../../task-tracker/lib/timing-actor.mjs';

const identity = { provider: 'codex', sid: 'catalog-actor' };
const actor = timingActorKey(identity);
const bytes = (value) => Buffer.from(JSON.stringify(value));
const classify = (relative) => classifyRuntimeRecord({ relative, kind: 'volatile-runtime' });

test('pending question catalog requires exact private actor provenance and preserves paused evidence', () => {
  const relative = 'sessions/' + identity.sid + '/pending-ask.json';
  const record = {
    schema: 'aitm.pending-ask/v1',
    actor,
    sessionId: identity.sid,
    issue: '#1857',
    pausedAt: '2026-10-01T00:00:00Z',
    resumeRow: null,
  };
  const selected = classifyRuntimeRecord({
    relative,
    kind: 'volatile-runtime',
    actorIdentity: identity,
  });
  assert.ok(selected);
  assert.equal(selected.validate(bytes(record)), true);
  assert.equal(selected.validate(bytes({ ...record, sessionId: 'other' })), false);
  assert.equal(selected.validate(bytes({ ...record, resumeRow: '| invalid |' })), false);
  assert.equal(classify(relative).validate(bytes(record)), false);
});

test('catalog preserves terminal binding, verifier, draft and orchestration records with typed entries', () => {
  const timestamp = '2026-10-01T00:00:00Z';
  const sha = 'a'.repeat(40);
  const fixtures = [
    [
      'fleet/closed-bindings.json',
      { schema: 1, sessions: { 'catalog-actor': { '#1857': { closedAt: timestamp } } } },
      { schema: 1, sessions: { actor: { '#1857': { closedAt: 'invalid' } } } },
    ],
    [
      'cache/verifier-results.json',
      {
        version: 1,
        entries: { ['npm test ' + sha]: { cmd: 'npm test', sha, exit: 0, ts: timestamp } },
      },
      { version: 2, entries: {} },
    ],
    [
      'draft-branch/1857.json',
      {
        issue: 1857,
        sessionId: 'catalog-actor',
        worktree: '/fixture',
        head: sha,
        branch: 'codex/1857',
      },
      {
        issue: 1,
        sessionId: 'catalog-actor',
        worktree: '/fixture',
        head: sha,
        branch: 'codex/1857',
      },
    ],
    [
      'fleet/orchestrator.lock',
      { epic: '#1857', startedAt: timestamp, ttlMs: 1000 },
      { epic: '#1857', startedAt: timestamp, ttlMs: -1 },
    ],
  ];
  for (const [relative, valid, invalid] of fixtures) {
    const entry = classify(relative);
    assert.ok(entry, relative);
    assert.equal(entry.validate(bytes(valid)), true, relative);
    assert.equal(entry.validate(bytes(invalid)), false, relative);
  }
});

test('hook stamps are exact empty bytes and unknown locks remain explicit blockers', () => {
  const stamp = classify('locks/hook-event-' + 'b'.repeat(64) + '.stamp');
  assert.ok(stamp);
  assert.equal(stamp.scope, 'shared');
  assert.equal(stamp.validate(Buffer.alloc(0)), true);
  assert.equal(stamp.validate(Buffer.from('grant')), false);
  assert.equal(classify('locks/unknown.lock'), null);
});

test('JSON catalog rejects invalid UTF-8 rather than silently replacing bytes', () => {
  const input = Buffer.concat([
    Buffer.from('{"genuineExtension":"'),
    Buffer.from([255]),
    Buffer.from('"}'),
  ]);
  assert.equal(classify('state/task-tracker-state.json').validate(input), false);
});

test('catalog preserves supported nullable chore audit and stopped legacy fleet observations', () => {
  const state = { choreModeLog: [{ event: 'on', reason: null, ts: null, previousIssue: null }] };
  assert.equal(classify('state/task-tracker-state.json').validate(bytes(state)), true);
  const fleet = {
    '#1857': {
      worktreePath: '/fixture',
      branch: 'codex/1857',
      startedAt: '2026-10-01T00:00:00Z',
      status: 'stopped',
    },
  };
  assert.equal(classify('fleet/task-fleet.json').validate(bytes(fleet)), true);
  const gate = {
    schema: 'unknown/v2',
    sessionId: identity.sid,
    lastPromptedParent: null,
    gates: { analysisToDevelopment: null, pullRequestReview: false, reviewToDone: true },
    updatedAt: '2026-10-01T00:00:00Z',
  };
  assert.equal(
    classify('gates/task-tracker.session.catalog-actor.json').validate(bytes(gate)),
    false
  );
});

test('catalog supports legacy and actor queue generations without changing their bytes', () => {
  const row = '| 2026-10-01 00:00:00 +00:00 | pause | 0 | 0 | 0 | 0 | done |';
  const event = { kind: 'timing', issue: '#1857', row, queuedAt: '2026-10-01T00:00:00Z' };
  for (const value of [
    [event],
    { schema: 'aitm.timing-queue/v1', items: [{ id: 'queue-one', event }] },
  ]) {
    const input = bytes(value),
      original = Buffer.from(input);
    assert.equal(classify('state/task-tracker-queue.json').validate(input), true);
    assert.deepEqual(input, original);
  }
  for (const value of [{ schema: 'unknown/v2', items: [] }, [{ kind: 'grant' }], [null]])
    assert.equal(classify('state/task-tracker-queue.json').validate(bytes(value)), false);
});

test('catalog binds versioned actor records to the exact session and opaque actor filename', () => {
  const relative = 'sessions/' + identity.sid + '/timing/' + actor.slice(3) + '.json';
  const record = {
    schema: 'aitm.actor-timing-state/v1',
    actor,
    ...identity,
    state: { active: '#1857', entryStartTs: '2026-10-01T00:00:00Z' },
  };
  assert.equal(classify(relative).validate(bytes(record)), true);
  assert.equal(classify(relative).validate(bytes({ ...record, sid: 'other' })), false);
  assert.equal(classify(relative).validate(bytes({ ...record, schema: 'unknown/v2' })), false);
});

test('catalog validates gate and occupancy entries rather than accepting arbitrary objects', () => {
  const gate = classify('gates/task-tracker.session.catalog-actor.json');
  assert.equal(
    gate.validate(
      bytes({
        sessionId: identity.sid,
        lastPromptedParent: null,
        gates: { analysisToDevelopment: null, pullRequestReview: false, reviewToDone: true },
        updatedAt: '2026-10-01T00:00:00Z',
      })
    ),
    true
  );
  assert.equal(
    gate.validate(bytes({ sessionId: identity.sid, gates: { reviewToDone: 'false' } })),
    false
  );
  const occupancy = classify('fleet/occupancy.json');
  assert.equal(occupancy.scope, 'shared');
  assert.equal(occupancy.validate(bytes({})), true);
  assert.equal(occupancy.validate(bytes({ 1857: { issue: 1857 } })), false);
});

test('unknown files and explicit unsupported schemas remain unclassified or invalid', () => {
  assert.equal(classify('unexpected.json'), null);
  assert.equal(classify('../state/task-tracker-state.json'), null);
  assert.equal(
    classify('state/task-tracker-state.json').validate(bytes({ schema: 'unknown/v2' })),
    false
  );
  assert.equal(
    classify('state/task-tracker-state.json').validate(
      bytes({ active: '#1857', entryStartTs: 'invalid' })
    ),
    false
  );
  assert.equal(
    classify('state/task-tracker-state.json').validate(
      bytes({
        active: '#1857',
        entryStartTs: '2026-10-01T00:00:00Z',
        genuineExtension: { audit: true },
      })
    ),
    true
  );
});
