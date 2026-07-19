// @story #889
// AC↔child bijection report (#889, parent epic #883).
//
// Two drift modes, one pass: an AC with no child, and a child with no AC. These
// tests pin both directions, the single-pass requirement, and the distinction
// that keeps the report readable — never-declared is not the same as
// declared-and-drifted.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  parseAcChildRefs,
  parseAcChildMap,
  bijectionReport,
  formatBijectionReport,
} from '../../lib/epic-ac-child-bijection.mjs';

// Shaped after #860, the one epic on the board that actually declares a mapping.
function mappedBody(acLines) {
  return [
    '<!-- aitm-issue-kind kind="epic" -->',
    '',
    '## Acceptance Criteria',
    '',
    ...acLines,
    '',
  ].join('\n');
}

const AC_C1 = '- [x] **C1 · #872** — Canonical `discoverTestFiles()` module: one recursive walker';
const AC_C2 = '- [x] **C2 · #873** — Lane taxonomy (**supersedes #862**)';
const AC_UNMAPPED = '- [ ] Both drift directions are reported in a single run';

function child(number) {
  return { number, rank: number, state: 'done', closeReason: 'completed' };
}

// ---------------------------------------------------------------------------
// AC1 — name any epic AC that maps to no child.
// ---------------------------------------------------------------------------

test('AC1: an AC with no child is named', () => {
  const r = bijectionReport({
    body: mappedBody([AC_C1, AC_UNMAPPED]),
    children: [child(872)],
  });
  assert.equal(r.ok, false);
  assert.equal(r.unmappedAcs.length, 1);
  assert.match(r.unmappedAcs[0].label, /single run/);
  const text = formatBijectionReport(r, { issueNumber: 860 });
  assert.match(text, /single run/);
  assert.match(text, /promise, no vehicle/);
});

// ---------------------------------------------------------------------------
// AC2 — name any child that maps back to no AC.
// ---------------------------------------------------------------------------

test('AC2: a child cited by no AC is named', () => {
  const r = bijectionReport({
    body: mappedBody([AC_C1]),
    children: [child(872), child(999)],
  });
  assert.equal(r.ok, false);
  assert.deepEqual(
    r.unmappedChildren.map((c) => c.number),
    [999]
  );
  const text = formatBijectionReport(r, { issueNumber: 860 });
  assert.match(text, /#999/);
  assert.match(text, /work nobody promised/);
  assert.doesNotMatch(text, /#872/);
});

// ---------------------------------------------------------------------------
// AC3 — a total, bidirectional mapping passes clean.
// ---------------------------------------------------------------------------

test('AC3: a total mapping passes clean and renders nothing', () => {
  const r = bijectionReport({
    body: mappedBody([AC_C1, AC_C2]),
    children: [child(872), child(873)],
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.unmappedAcs, []);
  assert.deepEqual(r.unmappedChildren, []);
  // A clean report printing nothing is what makes the noisy one worth reading.
  assert.equal(formatBijectionReport(r, { issueNumber: 860 }), null);
});

test('AC3: an issue with no AC section at all is not reported as drift', () => {
  const r = bijectionReport({ body: '## Scope\n\nno ACs here\n', children: [] });
  assert.equal(r.ok, true);
  assert.deepEqual(parseAcChildMap('## Scope\n\nnope\n'), []);
});

// ---------------------------------------------------------------------------
// AC4 — both directions in a single run, not fail-fast.
// ---------------------------------------------------------------------------

test('AC4: both drift directions are reported in one pass', () => {
  // The motivating shape: one decomposition edit added child #999 and reworded
  // an AC. Fail-fast would surface half of that and make the operator run the
  // same investigation twice.
  const r = bijectionReport({
    body: mappedBody([AC_C1, AC_UNMAPPED]),
    children: [child(872), child(999)],
  });
  assert.equal(r.unmappedAcs.length, 1);
  assert.equal(r.unmappedChildren.length, 1);
  const text = formatBijectionReport(r, { issueNumber: 860 });
  assert.match(text, /single run/);
  assert.match(text, /#999/);
  assert.match(text, /not total/);
});

// ---------------------------------------------------------------------------
// AC5 — a mid-flight defect child is detected as unmapped.
// ---------------------------------------------------------------------------

test('AC5: a defect child added after decomposition is detected as unmapped', () => {
  // Decomposition was total at the time it was written; #901 joined later.
  const before = bijectionReport({
    body: mappedBody([AC_C1, AC_C2]),
    children: [child(872), child(873)],
  });
  assert.equal(before.ok, true);

  const after = bijectionReport({
    body: mappedBody([AC_C1, AC_C2]),
    children: [child(872), child(873), child(901)],
  });
  assert.equal(after.ok, false);
  assert.deepEqual(
    after.unmappedChildren.map((c) => c.number),
    [901]
  );
  // No AC drifted — only the child side fired.
  assert.deepEqual(after.unmappedAcs, []);
});

// ---------------------------------------------------------------------------
// Parse narrowness — the reliability argument.
// ---------------------------------------------------------------------------

test('bold lead is parsed; a bare #N in AC prose is NOT', () => {
  // #860's real C2 text contains "(**supersedes #862**)". Binding an AC to an
  // issue it merely mentions would report clean on a rotted mapping, which is
  // the one failure mode that makes the whole check worthless.
  assert.deepEqual(parseAcChildRefs('**C1 · #872** — walker'), [872]);
  assert.deepEqual(parseAcChildRefs('**#872** — Cn-less form is accepted'), [872]);
  assert.deepEqual(parseAcChildRefs('plain text mentioning #862 in passing'), []);
  assert.deepEqual(parseAcChildRefs('- [ ] no refs at all'), []);
});

test('a bolded prose mention is NOT a mapping — the bold span must LEAD with the ref', () => {
  // #860's real C2 line is `**C2 · #873** — Lane taxonomy (**supersedes #862**)`.
  // Both are bold, but only the first is a mapping. The regex anchors `#N` to
  // the start of the bold span (after an optional `Cn ·`), so `**supersedes
  // #862**` does not bind. Pinned because "bolded" was the obvious-but-wrong
  // rule, and getting it wrong here means reporting clean on a rotted mapping.
  assert.deepEqual(parseAcChildRefs(AC_C2), [873]);
  assert.deepEqual(parseAcChildRefs('**supersedes #862**'), []);
  assert.deepEqual(parseAcChildRefs('**see also #862 and #863**'), []);
});

test('parseAcChildMap reports tick state, label and refs per AC in body order', () => {
  const acs = parseAcChildMap(mappedBody([AC_C1, AC_UNMAPPED]));
  assert.equal(acs.length, 2);
  assert.equal(acs[0].checked, true);
  assert.deepEqual(acs[0].children, [872]);
  assert.equal(acs[1].checked, false);
  assert.deepEqual(acs[1].children, []);
  // Markers are stripped from the label, as in `ac-strike.mjs`.
  const withMarker = parseAcChildMap(
    mappedBody(['- [ ] **C1 · #872** — thing <!-- aitm-verified vc-list="vc:1" -->'])
  );
  assert.doesNotMatch(withMarker[0].label, /aitm-verified/);
});

// ---------------------------------------------------------------------------
// never-declared vs declared-and-drifted.
// ---------------------------------------------------------------------------

test('an epic that declares no mapping is reported distinctly, not as total collapse', () => {
  // #883's real shape: ACs carry only `vc-list` markers. A naive report would
  // emit "6 unmapped ACs, 6 unmapped children" — true, and indistinguishable
  // from catastrophe.
  const r = bijectionReport({
    body: mappedBody([
      '- [ ] An epic is refused Review→Done <!-- aitm-verified vc-list="vc:5" -->',
      '- [ ] The bijection check names offenders <!-- aitm-verified vc-list="vc:6" -->',
    ]),
    children: [child(888), child(889)],
  });
  assert.equal(r.declared, false);
  const text = formatBijectionReport(r, { issueNumber: 883 });
  assert.match(text, /no `\*\*Cn · #NNN\*\*` mapping declared/);
  // It must NOT enumerate every AC and child as if each were an individual defect.
  assert.doesNotMatch(text, /promise, no vehicle/);
  assert.doesNotMatch(text, /work nobody promised/);
});

test('declared is true as soon as any single AC carries a mapping', () => {
  const r = bijectionReport({
    body: mappedBody([AC_C1, AC_UNMAPPED]),
    children: [child(872)],
  });
  assert.equal(r.declared, true);
  assert.match(formatBijectionReport(r, { issueNumber: 860 }), /not total/);
});

// ---------------------------------------------------------------------------
// Wiring — advisory, and surfaced where it is actionable.
// ---------------------------------------------------------------------------

test('the report is wired into epic-reconcile and cannot break the stamp', () => {
  const src = readFileSync(new URL('../../verbs/epic-reconcile.mjs', import.meta.url), 'utf8');
  assert.match(src, /formatBijectionReport/);
  // Printed AFTER the success line — the stamp is #887's contract and this must
  // not gate it.
  const stampIdx = src.indexOf('AC-reconciled: epic goals re-read');
  const reportIdx = src.indexOf('formatBijectionReport(');
  assert.ok(stampIdx > 0 && reportIdx > stampIdx, 'report must print after the stamp succeeds');
  // Swallowed failure: an advisory that can break the stamp it advises is a gate
  // wearing a report's clothes.
  assert.match(src, /bijection report unavailable/);
});

test('the module registers no state-machine guard — it refuses nothing', () => {
  const review = readFileSync(new URL('../../states/review.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(review, /bijection/i);
});
