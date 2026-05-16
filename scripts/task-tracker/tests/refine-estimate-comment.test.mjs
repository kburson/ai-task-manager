#!/usr/bin/env node
// Unit tests for scripts/task-tracker/lib/refine-estimate-comment.mjs (#134).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  findRefineEstimateComment,
  ensureRefineEstimateComment,
  appendPlannedEstimate,
  planPlannedEstimateGate,
  buildPlannedAppendix,
  hasPlannedAppendix,
  PLANNED_ESTIMATE_HEADER,
} from '../lib/refine-estimate-comment.mjs';

const cfg = { repo: 'o/r' };

const baseComment = (n) =>
  `<!-- aitm-refined-estimate: ${n} -->\n### 🛠 Refine estimate\n\nInitial sizing.\n`;

test('hasPlannedAppendix detects header', () => {
  assert.equal(hasPlannedAppendix('### Planned Estimate'), true);
  assert.equal(hasPlannedAppendix('## something\n### Planned Estimate\n'), true);
  assert.equal(hasPlannedAppendix('no header here'), false);
});

test('buildPlannedAppendix records delta=0 explicitly', () => {
  const out = buildPlannedAppendix({
    planned: { size: 'M', estimate: 4 },
    current: { size: 'M', estimate: 4 },
    rationale: 'no drift after deep-dive',
  });
  assert.match(out, /### Planned Estimate/);
  assert.match(out, /\| Size \| M \| M \| 0 \|/);
  assert.match(out, /\| Estimate \(h\) \| 4 \| 4 \| 0 \|/);
  assert.match(out, /no drift after deep-dive/);
});

test('buildPlannedAppendix records non-zero delta with sign', () => {
  const out = buildPlannedAppendix({
    planned: { size: 'L', estimate: 8 },
    current: { size: 'M', estimate: 4 },
    rationale: 'three new risks surfaced',
  });
  assert.match(out, /\| Size \| M \| L \| M→L \|/);
  assert.match(out, /\| Estimate \(h\) \| 4 \| 8 \| \+4 \|/);
});

test('buildPlannedAppendix uses placeholder rationale when blank', () => {
  const out = buildPlannedAppendix({
    planned: { size: 'S', estimate: 2 },
    current: { size: 'S', estimate: 2 },
  });
  assert.match(out, /_no rationale supplied_/);
});

test('findRefineEstimateComment matches the issue-number marker', async () => {
  const listComments = async () => [
    { id: 'IC_99', body: 'unrelated comment' },
    { id: 'IC_100', body: `${baseComment(133)}` },
    { id: 'IC_101', body: `${baseComment(134)}` },
  ];
  const r = await findRefineEstimateComment({
    cfg,
    issueNumber: 134,
    deps: { listComments },
  });
  assert.equal(r.id, 'IC_101');
  assert.equal(r.hasPlannedAppendix, false);
});

test('findRefineEstimateComment also matches the legacy aitm-groom-estimate marker', async () => {
  const listComments = async () => [
    { id: 'IC_OLD', body: '<!-- aitm-groom-estimate: 99 -->\n### 🛠 Refine estimate\n' },
  ];
  const r = await findRefineEstimateComment({
    cfg,
    issueNumber: 99,
    deps: { listComments },
  });
  assert.equal(r.id, 'IC_OLD');
});

test('findRefineEstimateComment returns null when no comment matches', async () => {
  const listComments = async () => [{ id: 'IC_1', body: 'irrelevant' }];
  const r = await findRefineEstimateComment({
    cfg,
    issueNumber: 134,
    deps: { listComments },
  });
  assert.equal(r, null);
});

test('ensureRefineEstimateComment is the same as findRefineEstimateComment', async () => {
  const listComments = async () => [{ id: 'IC_A', body: baseComment(134) }];
  const r = await ensureRefineEstimateComment({
    cfg,
    issueNumber: 134,
    deps: { listComments },
  });
  assert.equal(r.id, 'IC_A');
});

test('appendPlannedEstimate PATCHes the comment when no appendix is present', async () => {
  const patchCalls = [];
  const r = await appendPlannedEstimate({
    cfg,
    issueNumber: 134,
    planned: { size: 'M', estimate: 4 },
    current: { size: 'M', estimate: 4 },
    rationale: 'no drift',
    deps: {
      listComments: async () => [{ id: 'IC_X', body: baseComment(134) }],
      patchComment: async ({ commentId, body }) => {
        patchCalls.push({ commentId, body });
      },
    },
  });
  assert.equal(r.status, 'appended');
  assert.equal(r.commentId, 'IC_X');
  assert.equal(patchCalls.length, 1);
  assert.match(patchCalls[0].body, /### Planned Estimate/);
  assert.match(patchCalls[0].body, /aitm-refined-estimate: 134/);
});

test('appendPlannedEstimate is idempotent — duplicate when appendix already present', async () => {
  const patchCalls = [];
  const r = await appendPlannedEstimate({
    cfg,
    issueNumber: 134,
    planned: { size: 'M', estimate: 4 },
    current: { size: 'M', estimate: 4 },
    deps: {
      listComments: async () => [
        { id: 'IC_Y', body: `${baseComment(134)}\n${PLANNED_ESTIMATE_HEADER}\n\n…\n` },
      ],
      patchComment: async ({ commentId, body }) => {
        patchCalls.push({ commentId, body });
      },
    },
  });
  assert.equal(r.status, 'duplicate');
  assert.equal(patchCalls.length, 0);
});

test('appendPlannedEstimate returns no-refine-comment when missing', async () => {
  const r = await appendPlannedEstimate({
    cfg,
    issueNumber: 134,
    planned: { size: 'M', estimate: 4 },
    current: { size: 'M', estimate: 4 },
    deps: {
      listComments: async () => [],
      patchComment: async () => {
        throw new Error('should not patch');
      },
    },
  });
  assert.equal(r.status, 'no-refine-comment');
});

test('appendPlannedEstimate captures PATCH failure', async () => {
  const r = await appendPlannedEstimate({
    cfg,
    issueNumber: 134,
    planned: { size: 'M', estimate: 4 },
    current: { size: 'M', estimate: 4 },
    deps: {
      listComments: async () => [{ id: 'IC_Z', body: baseComment(134) }],
      patchComment: async () => {
        throw new Error('rate limited');
      },
    },
  });
  assert.equal(r.status, 'patch-failed');
  assert.match(r.error, /rate limited/);
});

test('planPlannedEstimateGate refuses when comment missing', async () => {
  const r = await planPlannedEstimateGate({
    cfg,
    issueNumber: 134,
    deps: { listComments: async () => [] },
  });
  assert.equal(r.ok, false);
  assert.ok(r.blockers[0].startsWith('planned-estimate-missing-comment'));
});

test('planPlannedEstimateGate refuses when appendix missing', async () => {
  const r = await planPlannedEstimateGate({
    cfg,
    issueNumber: 134,
    deps: { listComments: async () => [{ id: 'IC_M', body: baseComment(134) }] },
  });
  assert.equal(r.ok, false);
  assert.ok(r.blockers[0].startsWith('planned-estimate-appendix-missing'));
});

test('planPlannedEstimateGate accepts when comment + appendix present', async () => {
  const r = await planPlannedEstimateGate({
    cfg,
    issueNumber: 134,
    deps: {
      listComments: async () => [
        { id: 'IC_OK', body: `${baseComment(134)}\n${PLANNED_ESTIMATE_HEADER}\n` },
      ],
    },
  });
  assert.equal(r.ok, true);
  assert.equal(r.commentId, 'IC_OK');
});

test('planPlannedEstimateGate captures listComments failure', async () => {
  const r = await planPlannedEstimateGate({
    cfg,
    issueNumber: 134,
    deps: {
      listComments: async () => {
        throw new Error('boom');
      },
    },
  });
  assert.equal(r.ok, false);
  assert.ok(r.blockers[0].startsWith('planned-estimate-fetch-failed'));
});

console.log('All refine-estimate-comment tests defined.');
