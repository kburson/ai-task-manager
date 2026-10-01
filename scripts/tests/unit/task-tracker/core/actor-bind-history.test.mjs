// @story #1857
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRow } from '../../../../task-tracker/gh-timing-comment.mjs';
import { timingActorKey } from '../../../../task-tracker/lib/timing-actor.mjs';
import {
  resolveBindEvent,
  shouldSuppressActiveBindEvent,
  assertPairedReengagement,
  detectUnmarkedDepartureGap,
} from '../../../../task-tracker/lib/bind-event.mjs';
const a = timingActorKey({ provider: 'codex', sid: 'fixture-bind-a' });
const b = timingActorKey({ provider: 'codex', sid: 'fixture-bind-b' });
function row(actorKey, event) {
  return buildRow({
    ts: new Date().toISOString(),
    actorKey,
    event,
    activeSec: 0,
    idleSec: 0,
    wordMarker: 0,
    fullWordMarker: 0,
  });
}
test('another actor history cannot turn a first genuine bind into resume or suppress it', () => {
  const timingBody = row(b, 'start');
  assert.equal(
    resolveBindEvent({ actorKey: a, timingBody, hasTimingHistory: true, readStatus: 'found' }),
    'start'
  );
  assert.equal(
    shouldSuppressActiveBindEvent({
      actorKey: a,
      timingBody,
      readStatus: 'found',
      nowTs: new Date().toISOString(),
      proposedEvent: 'start',
    }),
    false
  );
  assert.equal(assertPairedReengagement(timingBody, 'resumed', { actorKey: a }).ok, false);
});
test('own paused history pairs independently of another currently working actor', () => {
  const timingBody = [row(a, 'start'), row(a, 'pause:other'), row(b, 'start')].join('\n');
  assert.equal(resolveBindEvent({ actorKey: a, timingBody, readStatus: 'found' }), 'resumed');
  assert.equal(assertPairedReengagement(timingBody, 'resumed', { actorKey: a }).ok, true);
  assert.equal(
    shouldSuppressActiveBindEvent({
      actorKey: a,
      timingBody,
      readStatus: 'found',
      nowTs: new Date().toISOString(),
      proposedEvent: 'resumed',
    }),
    false
  );
});

test('actor history cannot authorize a fabricated historical departure for an unobserved gap', () => {
  const timingBody = row(a, 'start');
  assert.equal(
    detectUnmarkedDepartureGap(timingBody, new Date(Date.now() + 9 * 3600000).toISOString()),
    null
  );
});
