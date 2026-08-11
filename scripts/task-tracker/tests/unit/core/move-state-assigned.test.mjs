// @story #526 #1206
// Assigned enter posts an `assigned:started` timing row via the move-state
// phase-pair emission.
//
// move-state.mjs (the `PHASE_EVENTS[stateArg]?.enter` branch) builds the
// entry row from the descriptor `{state, phase:'enter'}` for every forward
// state, including `assigned`. This test pins the descriptor →
// `assigned:started` row resolution that move-state relies on: if PHASE_EVENTS
// loses the assigned enter entry or buildRow stops deriving its slug, the row
// move-state posts would silently regress to empty again.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PHASE_EVENTS, resolvePhaseEvent } from '../../../phase-events.mjs';
import { buildRow, readLastKnownState, writeLastKnownState } from '../../../gh-timing-comment.mjs';
import { parseMoveStateArgs, legacyStateAliasWarning } from '../../../lib/move-state/policy.mjs';

function argv(...args) {
  return ['node', 'move-state.mjs', ...args];
}

test('legacy on-deck target and --from tokens canonicalize with a deterministic warning', () => {
  const target = parseMoveStateArgs(argv('1206', 'on-deck'));
  assert.equal(target.error, null);
  assert.equal(target.stateArg, 'assigned');
  assert.deepEqual(target.legacyStateAliases, ['state']);

  const from = parseMoveStateArgs(argv('1206', 'refine', '--from', 'on-deck'));
  assert.equal(from.fromOverride, 'assigned');
  assert.deepEqual(from.legacyStateAliases, ['--from']);
  assert.equal(
    legacyStateAliasWarning('state'),
    '[aitm] deprecated state alias "on-deck"; use "assigned".'
  );
});

test('historical last-known-state values read as Assigned and writers stay canonical', () => {
  const historical = '<!-- aitm-last-known-state state="on-deck" ts="2026-08-11T00:00:00Z" -->';
  assert.equal(readLastKnownState(historical).state, 'assigned');
  const rewritten = writeLastKnownState(historical, 'on-deck');
  assert.match(rewritten, /state="assigned"/);
  assert.doesNotMatch(rewritten, /state="on-deck"/);
});

test('assigned enter descriptor resolves to the assigned:started event', () => {
  assert.ok(PHASE_EVENTS.assigned?.enter, 'PHASE_EVENTS.assigned.enter must exist');
  assert.deepEqual(resolvePhaseEvent({ state: 'assigned', phase: 'enter' }), {
    event: 'assigned:started',
    description: 'assigned and ready to work',
  });
});

test('move-state assigned enter renders an assigned:started timing row', () => {
  // Mirror the buildRow call move-state.mjs makes for a forward `enter` move
  // (state = the destination column, phase = 'enter', honest 0/0 deltas).
  const row = buildRow({
    ts: new Date().toISOString(),
    phase: { state: 'assigned', phase: 'enter' },
    activeMin: 0,
    idleMin: 0,
    deltaWords: 0,
    wordMarker: 0,
  });
  assert.ok(
    row.includes('| assigned:started |'),
    `assigned enter must render the assigned:started slug; got: ${row}`
  );
  assert.ok(
    row.includes('assigned and ready to work'),
    `assigned enter must render its description; got: ${row}`
  );
});
