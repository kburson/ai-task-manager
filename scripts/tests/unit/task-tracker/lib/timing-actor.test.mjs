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

test('current interval evidence survives row edits without inventing a historical start', () => {
  const actor = timingActorKey({ provider: 'codex', sid: 'current-session' });
  const row =
    '| 2026-10-01 00:01:00 +00:00 | pause | | | | 40 | current |' +
    timingActorMarker(actor) +
    ' <!-- aitm-engagement:v1 start=1790812800000 end=1790812860000 active=unknown wstart=28 wend=40 fstart=unknown fend=unknown -->';
  const edited = replaceTimingRowCell(row, 7, ' waiting ');
  assert.deepEqual(parseTimingRow(edited).engagement, {
    startMs: 1790812800000,
    endMs: 1790812860000,
    activeEstimateSec: null,
    wordStart: 28,
    wordEnd: 40,
    fullWordStart: null,
    fullWordEnd: null,
  });
  assert.equal(parseTimingRow(edited).actorKey, actor);
});

test('malformed or orphan interval evidence refuses rather than becoming ordinary text', () => {
  const base = '| 2026-10-01 00:01:00 +00:00 | pause | | | | 40 | current |';
  const actor = timingActorMarker({ provider: 'codex', sid: 'current-session' });
  for (const marker of [
    ' <!-- aitm-engagement:v1 start=20 end=10 active=unknown wstart=0 wend=40 fstart=unknown fend=unknown -->',
    ' <!-- aitm-engagement:v1 start=10 end=20 active=20 wstart=0 wend=40 fstart=unknown fend=unknown -->',
    ' <!-- aitm-engagement:v2 start=10 end=20 active=unknown wstart=0 wend=40 fstart=unknown fend=unknown -->',
    ' <!-- aitm-engagement:v1 start=10 end=20 active=unknown wstart=-1 wend=40 fstart=unknown fend=unknown -->',
  ])
    assert.throws(() => parseTimingRow(base + actor + marker), { code: 'TIMING_ACTOR_INVALID' });
  assert.throws(
    () =>
      parseTimingRow(
        base +
          ' <!-- aitm-engagement:v1 start=10 end=20 active=unknown wstart=0 wend=40 fstart=unknown fend=unknown -->'
      ),
    { code: 'TIMING_ACTOR_INVALID' }
  );
});

test('current evidence derives words from own endpoints and rejects row cursor disagreement', () => {
  const actor = timingActorMarker({ provider: 'codex', sid: 'current-session' });
  const prefix = '| 2026-10-01 00:01:00 +00:00 | pause | | | | 40 | work | 100 |' + actor;
  const evidence =
    ' <!-- aitm-engagement:v1 start=1790812800000 end=1790812860000 active=unknown wstart=28 wend=40 fstart=80 fend=100 -->';
  assert.deepEqual(parseTimingRow(prefix + evidence).engagement, {
    startMs: 1790812800000,
    endMs: 1790812860000,
    activeEstimateSec: null,
    wordStart: 28,
    wordEnd: 40,
    fullWordStart: 80,
    fullWordEnd: 100,
  });
  assert.throws(() => parseTimingRow(prefix.replace('| 40 |', '| 41 |') + evidence), {
    code: 'TIMING_ACTOR_INVALID',
  });
  assert.throws(() => parseTimingRow(prefix + evidence.replace('wstart=28', 'wstart=42')), {
    code: 'TIMING_ACTOR_INVALID',
  });
});
