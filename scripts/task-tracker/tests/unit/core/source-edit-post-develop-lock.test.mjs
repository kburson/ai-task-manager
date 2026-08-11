#!/usr/bin/env node
// @story #805
// #805 — fail-closed post-develop WRITE_CODE lock in `decideSourceEdit`.
//
// Reproducing regression test for the jailbreak hole: a `test`-state WRITE_CODE
// edit (e.g. editing a `*.test.mjs` regression test out-of-band to make it pass)
// was ALLOWED because `decideSourceEdit` had no rule for post-develop states —
// `PRE_DEVELOP_STATES` blocked backlog/assigned/refine/plan/unknown, `develop`
// gated on deep-dive markers, and every later state (`test`/`review`/`done`) fell
// through to `{decision:'allow'}`. This drove the demonstrated #801 jailbreak.
//
// The fix classifies the edit with the shared activity matrix (`classifyEdit` +
// `isAllowed`) for post-develop states and refuses any edit whose activity class
// is not permitted by `STATE_MATRIX[state]`, naming the sanctioned
// `demote → fix → iteration → commit → finalization → re-Test` loop. Docs edits that
// the matrix permits (e.g. WRITE_DOCS in `review`) still pass. Fail-closed:
// `unknown`/unresolvable state stays in `PRE_DEVELOP_STATES` and is refused.
//
// <!-- aitm-defect-repro-test: scripts/task-tracker/tests/unit/source-edit-post-develop-lock.test.mjs -->

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { decideSourceEdit } from '../../../source-edit-gate.mjs';

const PROJECT_DIR = '/tmp/aitm-805-project';
const SOURCE = 'src/foo.mjs'; // classifyEdit → WRITE_CODE
const REGRESSION = 'scripts/task-tracker/tests/unit/close-flush-timing.test.mjs'; // WRITE_CODE
const DOC = 'docs/guides/workflow.md'; // classifyEdit → WRITE_DOCS

function edit(state, filePath = SOURCE) {
  return decideSourceEdit({
    toolName: 'Edit',
    filePath,
    projectDir: PROJECT_DIR,
    boundIssue: '#805',
    choreModeActive: false,
    issueState: state,
    hasPostedMarker: true,
    hasCompleteMarker: true,
  });
}

// (1) The jailbreak: a WRITE_CODE edit in `test` is refused, and the refusal
//     message names the sanctioned remediation loop.
test('#805: WRITE_CODE edit in test state is refused with remediation-loop message', () => {
  const r = edit('test', REGRESSION);
  assert.equal(r.decision, 'block', 'test-state WRITE_CODE must be blocked');
  assert.equal(r.code, 'source-edit-post-develop-lock');
  assert.match(
    r.reason,
    /demote → fix → iteration → commit → finalization → re-Test/,
    'refusal must name the stage-aware remediation and required re-Test loop'
  );
});

// (2) The honest demote target: the same edit in `develop` (markers present) is
//     allowed. This is what the operator must do instead of the jailbreak.
test('#805: same WRITE_CODE edit is allowed in develop (the honest demote target)', () => {
  const r = edit('develop', REGRESSION);
  assert.equal(r.decision, 'allow', 'develop + markers must allow WRITE_CODE');
  assert.equal(r.reason, 'state-and-markers-ok');
});

// (3) `review` and `done` are evaluated the same way — source WRITE_CODE refused.
test('#805: WRITE_CODE edits in review and done are refused', () => {
  for (const state of ['review', 'done']) {
    const r = edit(state, SOURCE);
    assert.equal(r.decision, 'block', `${state} WRITE_CODE must be blocked`);
    assert.equal(r.code, 'source-edit-post-develop-lock', `${state} block code`);
  }
});

// (4) A docs edit the matrix permits (WRITE_DOCS in `review`) still passes — the
//     lock is class-aware, not a blanket post-develop freeze.
test('#805: WRITE_DOCS edit in review is allowed (matrix permits it)', () => {
  const r = edit('review', DOC);
  assert.equal(r.decision, 'allow', 'review WRITE_DOCS must be allowed');
});

// (5) Fail-closed: an unresolvable/unknown state refuses rather than allows.
test('#805: unresolvable state fails closed (refused)', () => {
  const r = edit('unknown', SOURCE);
  assert.equal(r.decision, 'block', 'unknown state must fail closed');
});
