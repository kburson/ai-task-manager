#!/usr/bin/env node
// @story #841
// #841 — the review verb honors intentionally-waived ACs. An AC label bearing
// an `aitm-ac-waived` marker is neither flagged nor un-ticked by the AC-evidence
// audit (`review.mjs` skips it via `if (isAcWaived(cb.label)) continue;`), the
// legitimate half of the reverted #840 reimplemented fresh. This locks the
// predicate contract the audit branches on: the checkbox parser keeps the
// trailing marker in `cb.label` (`m[2].trim()`), so the label fed to isAcWaived
// carries the marker verbatim.
//
// Coverage:
//   - a waived AC label (checked or unchecked source line → same label text) is
//     recognized as waived.
//   - a plain AC label is NOT waived.
//   - `aitm-ac-waived` and the `invalid — non-demonstrable` opt-out are DISTINCT
//     tags: a non-demonstrable label is not mistaken for waived (each has its own
//     honored branch in the audit loop).

import { strict as assert } from 'node:assert';
import test from 'node:test';
import { isAcWaived } from '../../../lib/issue-kind.mjs';
import { NON_DEMONSTRABLE_TAG_RE } from '../../../lib/body-invariants.mjs';

// The parser sets cb.label = the text after `- [ ] ` / `- [x] `, trimmed, WITH
// any trailing HTML-comment marker intact. Reproduce that exact shape here.
function labelOf(line) {
  return line.replace(/^- \[[ x]\]\s+/, '').trim();
}

test('a waived AC label is recognized as waived (checked and unchecked yield same label)', () => {
  const checked = labelOf('- [x] Migration verified on remote #823 <!-- aitm-ac-waived -->');
  const unchecked = labelOf('- [ ] Migration verified on remote #823 <!-- aitm-ac-waived -->');
  assert.equal(checked, unchecked);
  assert.ok(isAcWaived(checked));
  assert.ok(isAcWaived(unchecked));
});

test('a waiver may carry a rationale tail and still match', () => {
  const label = labelOf(
    '- [ ] Not gate-verifiable <!-- aitm-ac-waived reason="remote GitHub state" -->'
  );
  assert.ok(isAcWaived(label));
});

test('a plain AC label is not waived', () => {
  const label = labelOf('- [ ] A criterion with automated evidence');
  assert.equal(isAcWaived(label), false);
});

test('non-demonstrable and waived are distinct opt-outs', () => {
  const nonDemo = labelOf(
    '- [x] Manual step, verified by inspection <!-- aitm-non-demonstrable -->'
  );
  // The non-demonstrable label is honored by its OWN branch, not the waived one.
  assert.ok(NON_DEMONSTRABLE_TAG_RE.test(nonDemo));
  assert.equal(isAcWaived(nonDemo), false);

  const waived = labelOf('- [x] Migration on #823 <!-- aitm-ac-waived -->');
  assert.ok(isAcWaived(waived));
  assert.equal(NON_DEMONSTRABLE_TAG_RE.test(waived), false);
});
