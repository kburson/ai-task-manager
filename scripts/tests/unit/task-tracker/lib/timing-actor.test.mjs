// @story #1857
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  timingActorKey,
  timingActorMarker,
  readTimingActor,
} from '../../../../task-tracker/lib/timing-actor.mjs';
import {
  parseTimingRow,
  replaceTimingRowCell,
  ensureTimingRowFullMarkerCell,
} from '../../../../task-tracker/lib/timing-row-reader.mjs';

test('opaque versioned timing keys preserve exact provider/session distinction', () => {
  const actor = { provider: 'codex', sid: 'session-one' };
  const key = timingActorKey(actor);
  assert.match(key, /^v1:[a-f0-9]{64}$/);
  assert.equal(key, timingActorKey(actor));
  assert.notEqual(key, timingActorKey({ ...actor, sid: 'session-two' }));
  assert.notEqual(key, timingActorKey({ ...actor, provider: 'claude' }));
  assert.ok(!timingActorMarker(actor).includes(actor.sid));
  for (const identity of [
    {},
    { provider: 'codex', sid: 'default' },
    { provider: 'bad value', sid: 'one' },
    { provider: 'codex', sid: '../escape' },
  ])
    assert.throws(() => timingActorKey(identity), { code: 'TIMING_ACTOR_INVALID' });
});

test('actor attribution survives lexical row edits alongside exact seconds', () => {
  const actor = { provider: 'codex', sid: 'session-one' };
  const row =
    '| 2026-10-01 00:00:00 +00:00 | start | | | | 10 | work |' +
    timingActorMarker(actor) +
    ' <!-- row-sec: a=10 i=0 -->';
  const edited = replaceTimingRowCell(ensureTimingRowFullMarkerCell(row), 7, ' updated ');
  assert.equal(parseTimingRow(edited).actorKey, timingActorKey(actor));
  assert.equal(readTimingActor(edited).key, timingActorKey(actor));
  assert.ok(edited.endsWith('<!-- row-sec: a=10 i=0 -->'));
  const legacy = '| 2026-10-01 00:00:00 +00:00 | start | | | | 10 | old |';
  assert.equal(readTimingActor(legacy), null);
  assert.equal(replaceTimingRowCell(legacy, 7, ' old '), legacy);
  for (const malformed of [
    ' <!-- aitm-actor:v1 key=bad -->',
    timingActorMarker(actor).repeat(2),
    ' <!-- aitm-actor:v9 key=bad -->',
  ])
    assert.throws(() => parseTimingRow(legacy + malformed), { code: 'TIMING_ACTOR_INVALID' });
});

test('actual fallback sentinel and coerced identity fields are refused', () => {
  for (const actor of [
    { provider: 'codex', sid: 'default-session' },
    { provider: 123, sid: 'real' },
    { provider: 'codex', sid: 123 },
  ])
    assert.throws(() => timingActorKey(actor), { code: 'TIMING_ACTOR_INVALID' });
});
