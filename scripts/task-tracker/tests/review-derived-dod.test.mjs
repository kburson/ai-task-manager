// #315 — Regression: a body where every AC is ticked and every non-self
// pre-close checkbox is ticked but `dod:functional:acs` and
// `dod:functional:checkboxes` are unticked-and-unstamped must pass the
// review gate after the auto-stamp pass.
//
// Pre-#315: review.mjs ran `uncheckedPreCloseCheckboxes` against the raw
// body, found the two derived boxes unticked, and refused promotion —
// even though close.mjs would derive+stamp them moments later. The fix
// extracts the derive pass into `deriveAndStampFunctionalDod` and calls
// it from review.mjs before the parity scan, so both paths see the same
// post-derivation state.
//
// This test exercises the helper directly with mocked fetch/push deps
// (same dep-injection pattern as functional-dod-evidence.test.mjs and
// versioned-issue-write.test.mjs), then runs the close-gate scanner
// against the mutated body to assert the gate passes.

import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveAndStampFunctionalDod } from '../lib/functional-dod-derive.mjs';
import { uncheckedPreCloseCheckboxes } from '../close-gate.mjs';
import { findEvidenceMarker, parseFunctionalDodKeys } from '../lib/functional-dod-evidence.mjs';

function fixtureBody() {
  // 7 ACs all ticked; pre-close DoD with derived keys unstamped+unticked;
  // stampable keys already stamped+ticked (so the only blockers are the
  // two derived keys). Lifecycle section present but unticked — those
  // items are excluded by uncheckedPreCloseCheckboxes anyway.
  return [
    '<!-- aitm-body-version: 7 -->',
    '## Acceptance Criteria',
    '',
    '- [x] AC1',
    '- [x] AC2',
    '- [x] AC3',
    '- [x] AC4',
    '- [x] AC5',
    '- [x] AC6',
    '- [x] AC7',
    '',
    '## Definition of Done',
    '',
    '#### Functional (verified at Test)',
    '',
    '- [x] All automated tests pass <!-- aitm-verified-by: `npm test` --> <!-- dod:functional:tests --> <!-- aitm-dod-evidence:tests cmd=`npm test` sha=abc123 ts=2026-06-05T00:00:00Z exit=0 -->',
    '- [x] Lint and format checks pass <!-- aitm-verified-by: `npm run lint` --> <!-- dod:functional:lint --> <!-- aitm-dod-evidence:lint cmd=`npm run lint` sha=abc123 ts=2026-06-05T00:00:00Z exit=0 -->',
    '- [x] All changes committed <!-- aitm-verified-by: `git log --grep #315` --> <!-- dod:functional:commits --> <!-- aitm-dod-evidence:commits cmd=`git log --grep #315` sha=abc123 ts=2026-06-05T00:00:00Z exit=0 -->',
    '- [ ] Acceptance criteria met <!-- dod:functional:acs -->',
    '- [ ] Issue body checkboxes ticked <!-- dod:functional:checkboxes -->',
    '',
    '#### Lifecycle (auto-ticked at Review/Close)',
    '',
    '- [ ] Passed final human review',
    '- [ ] Story closed and moved to Done',
    '- [ ] Timing data flushed to issue',
    '',
  ].join('\n');
}

test('#315 — review derived-DoD auto-stamp pass unblocks the gate', async () => {
  let stored = fixtureBody();
  const fetchBody = async () => stored;
  const pushBody = async (_repo, _num, body) => {
    stored = body;
  };

  // Pre-condition: gate refuses (the two derived boxes are unticked).
  const preUnticked = uncheckedPreCloseCheckboxes(stored);
  assert.ok(
    preUnticked.length >= 2,
    `pre-derive gate must surface at least the 2 derived-key boxes — saw ${preUnticked.length}`
  );
  assert.ok(
    preUnticked.some((l) => /Acceptance criteria met/.test(l)),
    'pre-derive: acs box reported by gate'
  );
  assert.ok(
    preUnticked.some((l) => /Issue body checkboxes ticked/.test(l)),
    'pre-derive: checkboxes box reported by gate'
  );

  // Act: run the helper (same call review.mjs and close.mjs make).
  const result = await deriveAndStampFunctionalDod({
    issueNumber: 315,
    repo: 'owner/repo',
    sha: 'cafe123',
    ts: '2026-06-05T01:00:00Z',
    deps: { fetchBody, pushBody },
  });
  assert.equal(result.status, 'ok', 'mutateIssueBody status=ok');

  // Post-condition 1: both derived markers stamped.
  const acsMarker = findEvidenceMarker(stored, 'acs');
  const cbMarker = findEvidenceMarker(stored, 'checkboxes');
  assert.ok(acsMarker, 'acs evidence marker stamped');
  assert.ok(cbMarker, 'checkboxes evidence marker stamped');
  assert.equal(acsMarker.sha, 'cafe123');
  assert.equal(cbMarker.sha, 'cafe123');

  // Post-condition 2: both derived boxes ticked.
  const items = parseFunctionalDodKeys(stored);
  const byKey = Object.fromEntries(items.map((it) => [it.key, it]));
  assert.equal(byKey.acs.checked, true, 'acs box ticked after derive');
  assert.equal(byKey.checkboxes.checked, true, 'checkboxes box ticked after derive');

  // Post-condition 3: gate passes — no unticked pre-close boxes remain.
  const postUnticked = uncheckedPreCloseCheckboxes(stored);
  assert.deepEqual(
    postUnticked,
    [],
    `gate must accept after derive — still unticked: ${JSON.stringify(postUnticked)}`
  );
});
