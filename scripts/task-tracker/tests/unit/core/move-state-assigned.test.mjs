// @story #526 #1206 #1211
// Ready for Planning enter posts a canonical timing row via the move-state
// phase-pair emission.
//
// move-state.mjs (the `PHASE_EVENTS[stateArg]?.enter` branch) builds the
// entry row from the descriptor `{state, phase:'enter'}` for every forward
// state. This test pins the R4P descriptor → event resolution that move-state
// relies on: if PHASE_EVENTS loses the R4P entry or buildRow stops deriving its slug, the row
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
  assert.equal(target.stateArg, 'ready-for-plan');
  assert.deepEqual(target.legacyStateAliases, ['state']);

  const from = parseMoveStateArgs(argv('1206', 'refine', '--from', 'on-deck'));
  assert.equal(from.fromOverride, 'ready-for-plan');
  assert.deepEqual(from.legacyStateAliases, ['--from']);
  assert.equal(
    legacyStateAliasWarning('state'),
    '[aitm] deprecated state alias; use "ready-for-plan".'
  );
});

test('historical last-known-state values read as R4P and writers stay canonical', () => {
  const historical = '<!-- aitm-last-known-state state="on-deck" ts="2026-08-11T00:00:00Z" -->';
  assert.equal(readLastKnownState(historical).state, 'ready-for-plan');
  const rewritten = writeLastKnownState(historical, 'on-deck');
  assert.match(rewritten, /state="ready-for-plan"/);
  assert.doesNotMatch(rewritten, /state="on-deck"/);
});

test('R4P enter descriptor resolves to the ready-for-plan:started event', () => {
  assert.ok(PHASE_EVENTS['ready-for-plan']?.enter, 'PHASE_EVENTS.ready-for-plan.enter must exist');
  assert.deepEqual(resolvePhaseEvent({ state: 'ready-for-plan', phase: 'enter' }), {
    event: 'ready-for-plan:started',
    description: 'refinement complete — ready for planning',
  });
});

test('move-state R4P enter renders a ready-for-plan:started timing row', () => {
  // Mirror the buildRow call move-state.mjs makes for a forward `enter` move
  // (state = the destination column, phase = 'enter', honest 0/0 deltas).
  const row = buildRow({
    ts: new Date().toISOString(),
    phase: { state: 'ready-for-plan', phase: 'enter' },
    activeMin: 0,
    idleMin: 0,
    deltaWords: 0,
    wordMarker: 0,
  });
  assert.ok(
    row.includes('| ready-for-plan:started |'),
    `R4P enter must render the ready-for-plan:started slug; got: ${row}`
  );
  assert.ok(
    row.includes('refinement complete — ready for planning'),
    `R4P enter must render its description; got: ${row}`
  );
});
