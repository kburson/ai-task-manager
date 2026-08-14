// @story #526
// #526 AC5 (remediation pilot for #516 AC5) — the uniform-convention
// documentation comment in phase-events.mjs is present and complete.
//
// #516 AC5 requires a comment that documents: (a) the uniform
// `<state>:<past-tense>` convention, (b) review now carries its own completion
// (`review:approved`), (c) done's two moments are `issue:wrap` / `issue:closed`
// with `issue:wrap` as the intentional bare-verb exception, and (d) the ad-hoc
// `review` / `review-ready` rows are deliberately deferred (not forgotten).
// This grep test pins each clause so the rationale can't be silently dropped in
// a future edit of the canonical table.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = readFileSync(
  fileURLToPath(new URL('../../../../task-tracker/phase-events.mjs', import.meta.url)),
  'utf8'
);

test('documents the uniform <state>:<past-tense> convention', () => {
  assert.match(SRC, /UNIFORM VOCABULARY/);
  assert.match(SRC, /<state>:<past-tense/);
});

test('documents review carrying its own completion (review:approved)', () => {
  assert.match(SRC, /review:approved/);
  assert.match(SRC, /review is a TRUE entry\/exit pair/i);
});

test('documents done two moments with issue:wrap as the bare-verb exception', () => {
  assert.match(SRC, /issue:wrap/);
  assert.match(SRC, /issue:closed/);
  assert.match(SRC, /bare-verb exception/i);
});

test('documents the deliberately deferred ad-hoc review / review-ready rows', () => {
  assert.match(SRC, /DEFERRED \(#516, not forgotten\)/);
  assert.match(SRC, /review-ready/);
});
