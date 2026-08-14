#!/usr/bin/env node
// @story #841
// #841 — the PROVEN "Agent Review Passed" box. On a passing Agent Review Gate
// the review verb ticks the box AND appends the gate's own run-evidence marker
// (`aitm-verified gate="agent-review" ts sha="sandbox" validators result=pass`).
// The box thereby CARRIES execution proof, so the mutate write survives the
// body-proof stack as a sanctioned `evidenceStamp` WITHOUT `allowUnverifiedTicks`.
//
// Coverage:
//   - stampAgentReviewPassed ticks the box and appends a well-formed marker.
//   - the marker records the validators that ran + result=pass + sha=sandbox.
//   - re-stamping replaces (not stacks) the prior agent-review marker.
//   - the newly-stamped body passes findCheckboxesTickedWithoutProof (box now
//     carries proof) AND findStructurallyIncompleteIntroducedProof (ts + sandbox).

import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  buildAgentReviewEvidenceMarker,
  stampAgentReviewPassed,
} from '../../../../../task-tracker/lib/agent-review/review-gate.mjs';
import {
  findCheckboxesTickedWithoutProof,
  findStructurallyIncompleteIntroducedProof,
} from '../../../../../task-tracker/lib/body-invariants.mjs';

const TS = '2026-07-16T12:00:00.000Z';

const BASE = [
  '## Definition of Done',
  '',
  '### Lifecycle (auto-ticked at Review/Close)',
  '',
  '- [ ] Agent Review Passed',
  '- [ ] Final Review Passed',
  '',
].join('\n');

test('buildAgentReviewEvidenceMarker carries gate/ts/sha/validators/result', () => {
  const marker = buildAgentReviewEvidenceMarker({ ts: TS, validators: ['V1', 'V2', 'V3'] });
  assert.match(marker, /^<!-- aitm-verified /);
  assert.match(marker, /gate="agent-review"/);
  assert.match(marker, new RegExp(`ts="${TS}"`));
  assert.match(marker, /sha="sandbox"/);
  assert.match(marker, /validators="V1,V2,V3"/);
  assert.match(marker, /result="pass"/);
});

test('stampAgentReviewPassed ticks the box and appends the marker', () => {
  const out = stampAgentReviewPassed(BASE, { ts: TS, validators: ['V1', 'V2'] });
  const line = out.split('\n').find((l) => l.includes('Agent Review Passed'));
  assert.ok(line.startsWith('- [x] Agent Review Passed '), `ticked+marked: ${line}`);
  assert.match(line, /gate="agent-review"/);
  assert.match(line, /validators="V1,V2"/);
  // Other lifecycle boxes untouched.
  assert.ok(out.includes('- [ ] Final Review Passed'));
});

test('re-stamp replaces the prior agent-review marker instead of stacking', () => {
  const first = stampAgentReviewPassed(BASE, { ts: TS, validators: ['V1'] });
  const second = stampAgentReviewPassed(first, {
    ts: '2026-07-16T13:00:00.000Z',
    validators: ['V1', 'V2', 'V3'],
  });
  const line = second.split('\n').find((l) => l.includes('Agent Review Passed'));
  const markerCount = (line.match(/gate="agent-review"/g) || []).length;
  assert.equal(markerCount, 1, `exactly one agent-review marker: ${line}`);
  assert.match(line, /validators="V1,V2,V3"/);
  assert.match(line, /ts="2026-07-16T13:00:00.000Z"/);
});

test('stamped body survives the body-proof stack (proof present + structurally complete)', () => {
  const out = stampAgentReviewPassed(BASE, { ts: TS, validators: ['V1', 'V2'] });
  // The newly-ticked box carries proof, so the checkbox-proof guard is clean
  // even without allowUnverifiedTicks.
  assert.deepEqual(findCheckboxesTickedWithoutProof(BASE, out), []);
  // The introduced marker is structurally complete (ts present, sha=sandbox).
  assert.deepEqual(findStructurallyIncompleteIntroducedProof(BASE, out), []);
});

test('missing box → noop (old-template bodies stamp to unchanged)', () => {
  const noBox =
    '## Definition of Done\n\n### Lifecycle (auto-ticked at Review/Close)\n\n- [ ] Final Review Passed\n';
  const out = stampAgentReviewPassed(noBox, { ts: TS, validators: ['V1'] });
  assert.equal(out, noBox);
});
