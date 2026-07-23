// @story #526
// #526 AC2 (remediation pilot for #516 AC2) — on-deck enter posts an
// `on-deck:started` timing row via the move-state phase-pair emission.
//
// move-state.mjs (the `PHASE_EVENTS[stateArg]?.enter` branch) builds the
// entry row from the descriptor `{state, phase:'enter'}` for every forward
// state, including `on-deck`. Before #516 there was no on-deck phase event, so
// the move into On Deck logged nothing. This test pins the descriptor →
// `on-deck:started` row resolution that move-state relies on: if PHASE_EVENTS
// loses the on-deck enter entry or buildRow stops deriving its slug, the row
// move-state posts would silently regress to empty again.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PHASE_EVENTS, resolvePhaseEvent } from '../../../phase-events.mjs';
import { buildRow } from '../../../gh-timing-comment.mjs';

test('on-deck enter descriptor resolves to the on-deck:started event', () => {
  assert.ok(PHASE_EVENTS['on-deck']?.enter, 'PHASE_EVENTS.on-deck.enter must exist');
  assert.deepEqual(resolvePhaseEvent({ state: 'on-deck', phase: 'enter' }), {
    event: 'on-deck:started',
    description: 'queued on deck',
  });
});

test('move-state on-deck enter renders an on-deck:started timing row', () => {
  // Mirror the buildRow call move-state.mjs makes for a forward `enter` move
  // (state = the destination column, phase = 'enter', honest 0/0 deltas).
  const row = buildRow({
    ts: new Date().toISOString(),
    phase: { state: 'on-deck', phase: 'enter' },
    activeMin: 0,
    idleMin: 0,
    deltaWords: 0,
    wordMarker: 0,
  });
  assert.ok(
    row.includes('| on-deck:started |'),
    `on-deck enter must render the on-deck:started slug; got: ${row}`
  );
  assert.ok(
    row.includes('queued on deck'),
    `on-deck enter must render its description; got: ${row}`
  );
});
