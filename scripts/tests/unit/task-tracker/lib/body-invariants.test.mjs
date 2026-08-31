// @story #361
// Tests for lib/body-invariants.mjs — INVARIANT_MARKER_PATTERNS and
// findLostMarkers(base, next).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  INVARIANT_MARKER_PATTERNS,
  MarkerAdvanceError,
  findLostMarkers,
  findNewMalformedVerifiedCmds,
  findAcsWithoutVerifierOrInvalidTag,
  validateMarkerAdvances,
} from '../../../../task-tracker/lib/body-invariants.mjs';
import { renderBodyLedgerHead } from '../../../../task-tracker/lib/resident-action-ledger-codec.mjs';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const HASH_C = `sha256:${'c'.repeat(64)}`;

function inlineHead({ visit = 'review:1', phase = 'intent', attemptId = 1, hash = HASH_A } = {}) {
  return renderBodyLedgerHead({
    mode: 'inline',
    visit,
    commit: `10:${hash}`,
    definition: HASH_B,
    audit: `10:${hash}`,
    actions: { review: { commentId: '10', hash, attemptId, phase } },
  });
}

function spillHead({ visit = 'review:1', headHash = HASH_C } = {}) {
  return renderBodyLedgerHead({
    mode: 'spill',
    visit,
    commit: `11:${HASH_B}`,
    audit: `11:${HASH_B}`,
    head: `20:${headHash}`,
  });
}

test('INVARIANT_MARKER_PATTERNS includes the canonical invariant marker set', () => {
  const names = INVARIANT_MARKER_PATTERNS.map((p) => p.name);
  // Spot-check the markers #361 was filed for.
  for (const required of [
    'aitm-fields',
    'aitm-body-version',
    'aitm-stage-rollup',
    'aitm-refine-complete',
    'aitm-plan-approved',
    'aitm-epic-orchestration-plan',
    'aitm-deep-dive-posted',
    'aitm-deep-dive-complete',
    'aitm-last-known-state',
    'aitm-last-known-state-ts',
    'aitm-entered-<stage>',
  ]) {
    assert.ok(names.includes(required), `missing pattern: ${required}`);
  }
  assert.equal(
    INVARIANT_MARKER_PATTERNS.find((pattern) => pattern.name === 'aitm-resident-action-ledger-head')
      ?.kind,
    'advance'
  );
});

test('resident-action ledger advance is narrow and phase monotonic', () => {
  const base = inlineHead();
  const waiting = inlineHead({ phase: 'waiting', hash: HASH_B });
  assert.doesNotThrow(() =>
    validateMarkerAdvances(base, waiting, {
      allowMarkerAdvance: ['aitm-resident-action-ledger-head'],
    })
  );
  assert.throws(
    () => validateMarkerAdvances(waiting, base, { allowMarkerAdvance: [] }),
    (error) => error instanceof MarkerAdvanceError && error.reason === 'unauthorized'
  );
  assert.throws(
    () =>
      validateMarkerAdvances(waiting, base, {
        allowMarkerAdvance: ['aitm-resident-action-ledger-head'],
      }),
    (error) => error instanceof MarkerAdvanceError && error.reason === 'phase-regression'
  );
});

test('same-visit spill to inline is refused but new-visit reset is permitted', () => {
  const spilled = spillHead();
  assert.throws(
    () =>
      validateMarkerAdvances(spilled, inlineHead(), {
        allowMarkerAdvance: ['aitm-resident-action-ledger-head'],
      }),
    (error) => error instanceof MarkerAdvanceError && error.reason === 'spill-regression'
  );
  assert.doesNotThrow(() =>
    validateMarkerAdvances(spilled, inlineHead({ visit: 'review:2' }), {
      allowMarkerAdvance: ['aitm-resident-action-ledger-head'],
    })
  );
});

test('same-visit inline to spill and spill to spill are permitted', () => {
  assert.doesNotThrow(() =>
    validateMarkerAdvances(inlineHead(), spillHead(), {
      allowMarkerAdvance: ['aitm-resident-action-ledger-head'],
    })
  );
  assert.doesNotThrow(() =>
    validateMarkerAdvances(spillHead(), spillHead({ headHash: HASH_A }), {
      allowMarkerAdvance: ['aitm-resident-action-ledger-head'],
    })
  );
});

test('inline marker and final-body limits accept the boundary and refuse overflow', () => {
  const marker = inlineHead({ visit: 'review:2' });
  const atMarkerLimit = marker.replace('-->', `${' '.repeat(8192 - marker.length)}-->`);
  const overMarkerLimit = atMarkerLimit.replace('-->', ' -->');
  assert.equal(atMarkerLimit.length, 8192);
  assert.doesNotThrow(() =>
    validateMarkerAdvances('', atMarkerLimit, {
      allowMarkerAdvance: ['aitm-resident-action-ledger-head'],
    })
  );
  assert.throws(
    () =>
      validateMarkerAdvances('', overMarkerLimit, {
        allowMarkerAdvance: ['aitm-resident-action-ledger-head'],
      }),
    (error) => error instanceof MarkerAdvanceError && error.reason === 'inline-budget'
  );

  const atBodyLimit = `${'x'.repeat(57344 - marker.length)}${marker}`;
  assert.equal(atBodyLimit.length, 57344);
  assert.doesNotThrow(() =>
    validateMarkerAdvances('', atBodyLimit, {
      allowMarkerAdvance: ['aitm-resident-action-ledger-head'],
    })
  );
  assert.throws(
    () =>
      validateMarkerAdvances('', `x${atBodyLimit}`, {
        allowMarkerAdvance: ['aitm-resident-action-ledger-head'],
      }),
    (error) => error instanceof MarkerAdvanceError && error.reason === 'inline-budget'
  );
});

test('findLostMarkers treats the advancing ledger marker as presence-only', () => {
  assert.deepEqual(
    findLostMarkers(inlineHead(), inlineHead({ phase: 'waiting', hash: HASH_B })),
    []
  );
  assert.deepEqual(findLostMarkers(inlineHead(), ''), ['aitm-resident-action-ledger-head']);
});

test('findLostMarkers returns empty list when next preserves all markers', () => {
  const base =
    '## AC\n<!-- aitm-fields: {} -->\n<!-- aitm-body-version: 3 -->\n<!-- aitm-entered-refine: 2026-06-08T00:00:00Z -->\n';
  const next = base; // unchanged
  assert.deepEqual(findLostMarkers(base, next), []);
});

test('findLostMarkers reports no loss when last-known-state pair collapses to the new single marker (#378)', () => {
  const base =
    '## AC\n<!-- aitm-last-known-state: develop -->\n<!-- aitm-last-known-state-ts: 2026-06-01T10:00:00Z -->\n';
  const next = '## AC\n<!-- aitm-last-known-state state="review" ts="2026-06-01T12:00:00Z" -->\n';
  // Both the state and the ts invariants must still be "found" in the new
  // single marker — the pair→single conversion is loss-free.
  assert.deepEqual(findLostMarkers(base, next), []);
});

test('findLostMarkers still reports loss when the new single last-known-state marker is dropped entirely (#378)', () => {
  const base = '## AC\n<!-- aitm-last-known-state state="review" ts="2026-06-01T12:00:00Z" -->\n';
  const next = '## AC\nno markers here\n';
  const lost = findLostMarkers(base, next);
  assert.ok(lost.includes('aitm-last-known-state'), 'state invariant lost');
  assert.ok(lost.includes('aitm-last-known-state-ts'), 'ts invariant lost');
});

test('findLostMarkers reports a single-kind marker by name when dropped', () => {
  const base = '## AC\n<!-- aitm-fields: {"size":"M"} -->\n<!-- aitm-body-version: 5 -->\n';
  const next = '## AC\n<!-- aitm-body-version: 5 -->\n';
  assert.deepEqual(findLostMarkers(base, next), ['aitm-fields']);
});

test('findLostMarkers protects the durable epic orchestration plan', () => {
  const marker = `<!-- aitm-epic-orchestration-plan schema="1" digest="${'a'.repeat(64)}" payload="e30" -->`;
  assert.deepEqual(findLostMarkers(marker, ''), ['aitm-epic-orchestration-plan']);
});

test('findLostMarkers reports each lost aitm-entered-<stage> individually', () => {
  const base =
    '## AC\n<!-- aitm-entered-backlog: 2026-06-01T00:00:00Z -->\n<!-- aitm-entered-refine: 2026-06-02T00:00:00Z -->\n<!-- aitm-entered-plan: 2026-06-03T00:00:00Z -->\n';
  // Drop refine and plan; keep backlog.
  const next = '## AC\n<!-- aitm-entered-backlog: 2026-06-01T00:00:00Z -->\n';
  const lost = findLostMarkers(base, next);
  assert.deepEqual(lost.sort(), ['aitm-entered-plan', 'aitm-entered-refine']);
});

test('#1206: historical second-stage marker bytes remain append-only audit residue', () => {
  const historical = '<!-- aitm-entered-on-deck ts="2026-06-01T00:00:00Z" -->\n';
  assert.deepEqual(findLostMarkers(historical, ''), ['aitm-entered-on-deck']);
  const canonical = '<!-- aitm-entered-assigned ts="2026-06-01T00:00:00Z" -->\n';
  assert.deepEqual(findLostMarkers(historical, canonical), ['aitm-entered-on-deck']);
  assert.deepEqual(findLostMarkers(historical, historical + canonical), []);
});

test('findLostMarkers reports multiple single-kind markers when several drop', () => {
  const base =
    '## AC\n<!-- aitm-fields: {} -->\n<!-- aitm-body-version: 1 -->\n<!-- aitm-stage-rollup: refine=1 -->\n<!-- aitm-plan-approved: 2026-06-01 -->\n';
  const next = '## AC\n<!-- aitm-fields: {} -->\n'; // drops three
  const lost = findLostMarkers(base, next);
  assert.deepEqual(lost.sort(), ['aitm-body-version', 'aitm-plan-approved', 'aitm-stage-rollup']);
});

test('findLostMarkers tolerates empty/null base/next without throwing', () => {
  assert.deepEqual(findLostMarkers('', ''), []);
  assert.deepEqual(findLostMarkers(null, null), []);
  assert.deepEqual(findLostMarkers(undefined, undefined), []);
});

test('findLostMarkers ignores markers that were never in base', () => {
  const base = '## AC\n';
  const next = '## AC\n<!-- aitm-fields: {} -->\n';
  assert.deepEqual(findLostMarkers(base, next), []);
});

// #423 — findNewMalformedVerifiedCmds(before, after)
test('findNewMalformedVerifiedCmds flags a newly-introduced malformed declaration', () => {
  const before = '- [ ] alpha\n';
  const after =
    '- [ ] alpha <!-- aitm-verified cmd="`gh issue view <child>` returned CLOSED" -->\n';
  const offenders = findNewMalformedVerifiedCmds(before, after);
  assert.equal(offenders.length, 1, 'the new malformed declaration is flagged');
  assert.match(offenders[0].reason, /placeholder/, 'reason names the placeholder defect');
});

test('findNewMalformedVerifiedCmds passes a newly-introduced well-formed declaration', () => {
  const before = '- [ ] alpha\n';
  const after = '- [ ] alpha <!-- aitm-verified cmd="`npm run lint` `npm run format:check`" -->\n';
  assert.deepEqual(
    findNewMalformedVerifiedCmds(before, after),
    [],
    'a real backticked command declaration is not flagged'
  );
});

test('findNewMalformedVerifiedCmds does not flag a pre-existing malformed declaration', () => {
  const malformed = '- [x] gamma <!-- aitm-verified cmd="`run <thing>` done" -->';
  const before = `${malformed}\n`;
  // An unrelated edit elsewhere; the malformed marker is carried through verbatim.
  const after = `${malformed}\n- [ ] delta\n`;
  assert.deepEqual(
    findNewMalformedVerifiedCmds(before, after),
    [],
    'pre-existing corruption carried unchanged never blocks an unrelated edit'
  );
});

// #678 — findAcsWithoutVerifierOrInvalidTag's malformed-verifier branch
test('findAcsWithoutVerifierOrInvalidTag flags a {tbd}-sentinel verifier as malformed-verifier', () => {
  const body = [
    '## Acceptance Criteria',
    '- [ ] alpha <!-- aitm-verified cmd="`{tbd}`" -->',
    '## Definition of Done',
  ].join('\n');
  const offenders = findAcsWithoutVerifierOrInvalidTag(body);
  assert.equal(offenders.length, 1, 'the sentinel-verifier AC is flagged');
  assert.equal(offenders[0].label, 'alpha');
  assert.match(
    offenders[0].reason,
    /^malformed-verifier:/,
    'reason uses the malformed-verifier prefix'
  );
});

test('findAcsWithoutVerifierOrInvalidTag distinguishes malformed-verifier from no-verifier and test-all-verifier', () => {
  const body = [
    '## Acceptance Criteria',
    '- [ ] alpha <!-- aitm-verified cmd="`{tbd}`" -->',
    '- [ ] beta',
    '- [ ] gamma <!-- aitm-verified cmd="`npm run test:all`" -->',
    '- [ ] delta <!-- aitm-verified cmd="`node --test scripts/tests/unit/task-tracker/body-invariants.test.mjs`" -->',
    '## Definition of Done',
  ].join('\n');
  const offenders = findAcsWithoutVerifierOrInvalidTag(body);
  const byLabel = Object.fromEntries(offenders.map((o) => [o.label, o.reason]));
  assert.match(
    byLabel.alpha,
    /^malformed-verifier:/,
    'alpha has a declared but malformed verifier'
  );
  assert.equal(byLabel.beta, 'no-verifier', 'beta has no verifier at all');
  assert.equal(byLabel.gamma, 'test-all-verifier', 'gamma only binds the regression floor');
  assert.ok(!('delta' in byLabel), 'delta has a real targeted verifier and is not flagged');
});

// #670-shaped regression: a verifier-less narrative AC line (no cmd markers
// at all) must still be classified `no-verifier`, not accidentally swept
// into the new malformed-verifier branch.
test('findAcsWithoutVerifierOrInvalidTag classifies a #670-shaped verifier-less AC as no-verifier', () => {
  const body = [
    '## Acceptance Criteria',
    '- [ ] The beta-report label prefix is replaced, not duplicated, when the workflow reruns',
    '## Definition of Done',
  ].join('\n');
  const offenders = findAcsWithoutVerifierOrInvalidTag(body);
  assert.equal(offenders.length, 1);
  assert.equal(
    offenders[0].reason,
    'no-verifier',
    'no cmd declared at all is no-verifier, not malformed-verifier'
  );
});

test('findAcsWithoutVerifierOrInvalidTag honors the invalid — non-demonstrable opt-out over a sentinel verifier', () => {
  const body = [
    '## Acceptance Criteria',
    '- [ ] alpha — tagged `invalid — non-demonstrable` <!-- aitm-non-demonstrable --> <!-- aitm-verified cmd="`{tbd}`" -->',
    '## Definition of Done',
  ].join('\n');
  assert.deepEqual(
    findAcsWithoutVerifierOrInvalidTag(body),
    [],
    'the honest opt-out tag short-circuits before the malformed cmd is even inspected'
  );
});

// #688 AC1 — a per-AC `aitm-ac-waived` marker (the no-commit lane waiver from
// #494/#500) is a third honest opt-out: an AC carrying only that marker, with
// no verifier and no invalid-tag, must NOT be reported.
test('findAcsWithoutVerifierOrInvalidTag treats aitm-ac-waived as a valid opt-out', () => {
  const body = [
    '## Acceptance Criteria',
    '- [ ] alpha ships findings, not testable code <!-- aitm-ac-waived -->',
    '## Definition of Done',
  ].join('\n');
  assert.deepEqual(
    findAcsWithoutVerifierOrInvalidTag(body),
    [],
    'a waived AC is exempt from the demonstrable-verifier requirement'
  );
});

// #688 AC2 — the two pre-existing exemptions still behave exactly as before:
// an `aitm-verified cmd="…"` AC and an `invalid — non-demonstrable` AC both
// pass unchanged after the waiver skip is added.
test('findAcsWithoutVerifierOrInvalidTag still passes verified-cmd and invalid-tag ACs (no regression)', () => {
  const body = [
    '## Acceptance Criteria',
    '- [ ] alpha <!-- aitm-verified cmd="`node --test scripts/tests/unit/task-tracker/body-invariants.test.mjs`" -->',
    '- [ ] beta — tagged `invalid — non-demonstrable` <!-- aitm-non-demonstrable -->',
    '## Definition of Done',
  ].join('\n');
  assert.deepEqual(
    findAcsWithoutVerifierOrInvalidTag(body),
    [],
    'the verified-cmd and invalid-tag exemptions are untouched by the new waiver skip'
  );
});
