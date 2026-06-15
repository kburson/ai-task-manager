#!/usr/bin/env node
// Unit tests for scripts/task-tracker/lib/refine-estimate-comment.mjs (#134).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  findRefineEstimateComment,
  ensureRefineEstimateComment,
  appendPlannedEstimate,
  repopulateEmptyPlannedAppendix,
  planPlannedEstimateGate,
  buildPlannedAppendix,
  hasPlannedAppendix,
  hasEmptyPlannedAppendix,
  PLANNED_ESTIMATE_HEADER,
} from '../lib/refine-estimate-comment.mjs';

const cfg = { repo: 'o/r' };

const baseComment = (n) =>
  `<!-- aitm-refined-estimate: ${n} -->\n### 🛠 Refine estimate\n\nInitial sizing.\n`;

const emptyAppendixComment = (n) =>
  `${baseComment(n)}\n${PLANNED_ESTIMATE_HEADER}\n\n| Field | Refine | Plan | Δ |\n|---|---|---|---|\n| Size | — | — | 0 |\n| Estimate (h) | — | — | n/a |\n\n_no rationale supplied_\n`;

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

test('buildPlannedAppendix rejects scalar planned/current', () => {
  assert.throws(
    () => buildPlannedAppendix({ planned: 4, current: 4 }),
    /buildPlannedAppendix: 'planned' must be \{ size\?, estimate\? \} — got number \(4\)/
  );
  assert.throws(
    () => buildPlannedAppendix({ planned: { size: 'M', estimate: 4 }, current: 4 }),
    /buildPlannedAppendix: 'current' must be \{ size\?, estimate\? \} — got number \(4\)/
  );
});

test('buildPlannedAppendix rejects null and arrays', () => {
  assert.throws(
    () => buildPlannedAppendix({ planned: null, current: { size: 'M' } }),
    /'planned' must be \{ size\?, estimate\? \} — got null/
  );
  assert.throws(
    () => buildPlannedAppendix({ planned: { size: 'M' }, current: ['M', 4] }),
    /'current' must be \{ size\?, estimate\? \} — got array/
  );
});

test('buildPlannedAppendix rejects empty object with no size or estimate', () => {
  assert.throws(
    () => buildPlannedAppendix({ planned: {}, current: { size: 'M' } }),
    /'planned' must define at least one of 'size' or 'estimate'/
  );
});

test('appendPlannedEstimate rejects scalar planned/current before any I/O', async () => {
  await assert.rejects(
    appendPlannedEstimate({
      cfg,
      issueNumber: 191,
      planned: 4,
      current: 4,
      deps: {
        listComments: async () => {
          throw new Error('should not be called');
        },
        patchComment: async () => {
          throw new Error('should not be called');
        },
      },
    }),
    /appendPlannedEstimate: 'planned' must be \{ size\?, estimate\? \} — got number \(4\)/
  );
});

test('appendPlannedEstimate rejects null planned', async () => {
  await assert.rejects(
    appendPlannedEstimate({
      cfg,
      issueNumber: 191,
      planned: null,
      current: { size: 'M' },
      deps: { listComments: async () => [], patchComment: async () => {} },
    }),
    /'planned' must be \{ size\?, estimate\? \} — got null/
  );
});

test('appendPlannedEstimate still works with valid { size, estimate } objects', async () => {
  const patchCalls = [];
  const r = await appendPlannedEstimate({
    cfg,
    issueNumber: 191,
    planned: { size: 'L', estimate: 8 },
    current: { size: 'M', estimate: 4 },
    rationale: 'risk grew',
    deps: {
      listComments: async () => [{ id: 'IC_V', body: baseComment(191) }],
      patchComment: async ({ commentId, body }) => {
        patchCalls.push({ commentId, body });
      },
    },
  });
  assert.equal(r.status, 'appended');
  assert.equal(patchCalls.length, 1);
  assert.match(patchCalls[0].body, /\| Size \| M \| L \| M→L \|/);
});

test('planPlannedEstimateGate refuses an all-em-dash data row', async () => {
  const degenerate = `${baseComment(191)}\n${PLANNED_ESTIMATE_HEADER}\n\n| Field | Refine | Plan | Δ |\n|---|---|---|---|\n| Size | — | — | 0 |\n| Estimate (h) | — | — | n/a |\n\n_no rationale supplied_\n`;
  const r = await planPlannedEstimateGate({
    cfg,
    issueNumber: 191,
    deps: { listComments: async () => [{ id: 'IC_EMPTY', body: degenerate }] },
  });
  assert.equal(r.ok, false);
  assert.ok(r.blockers[0].startsWith('planned-estimate-empty-table'));
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

// ── AC8 (#171): repopulateEmptyPlannedAppendix healer ──────────────────────

test('repopulateEmptyPlannedAppendix rebuilds an all-em-dash appendix in place', async () => {
  const patchCalls = [];
  const r = await repopulateEmptyPlannedAppendix({
    cfg,
    issueNumber: 191,
    planned: { size: 'M', estimate: 4 },
    current: { size: 'M', estimate: 4 },
    rationale: 'healed: concrete values',
    deps: {
      listComments: async () => [{ id: 'IC_E', body: emptyAppendixComment(191) }],
      patchComment: async ({ commentId, body }) => {
        patchCalls.push({ commentId, body });
      },
    },
  });
  assert.equal(r.status, 'repopulated');
  assert.equal(r.commentId, 'IC_E');
  assert.equal(patchCalls.length, 1);
  // The healed body must no longer be empty and must carry exactly one header.
  assert.equal(hasEmptyPlannedAppendix(patchCalls[0].body), false);
  assert.equal(patchCalls[0].body.match(/### Planned Estimate/g).length, 1);
  assert.match(patchCalls[0].body, /\| Size \| M \| M \| 0 \|/);
  assert.match(patchCalls[0].body, /healed: concrete values/);
});

test('repopulateEmptyPlannedAppendix leaves a non-empty appendix untouched', async () => {
  const patchCalls = [];
  const nonEmpty = `${baseComment(191)}\n${PLANNED_ESTIMATE_HEADER}\n\n| Field | Refine | Plan | Δ |\n|---|---|---|---|\n| Size | M | L | M→L |\n| Estimate (h) | 4 | 8 | +4 |\n\nreal rationale\n`;
  const r = await repopulateEmptyPlannedAppendix({
    cfg,
    issueNumber: 191,
    planned: { size: 'M', estimate: 4 },
    current: { size: 'M', estimate: 4 },
    deps: {
      listComments: async () => [{ id: 'IC_NE', body: nonEmpty }],
      patchComment: async ({ commentId, body }) => {
        patchCalls.push({ commentId, body });
      },
    },
  });
  assert.equal(r.status, 'not-empty');
  assert.equal(patchCalls.length, 0);
});

test('repopulateEmptyPlannedAppendix reports no-appendix when none present', async () => {
  const r = await repopulateEmptyPlannedAppendix({
    cfg,
    issueNumber: 191,
    planned: { size: 'M', estimate: 4 },
    current: { size: 'M', estimate: 4 },
    deps: {
      listComments: async () => [{ id: 'IC_NA', body: baseComment(191) }],
      patchComment: async () => {
        throw new Error('should not patch');
      },
    },
  });
  assert.equal(r.status, 'no-appendix');
});

test('repopulateEmptyPlannedAppendix reports no-refine-comment when missing', async () => {
  const r = await repopulateEmptyPlannedAppendix({
    cfg,
    issueNumber: 191,
    planned: { size: 'M', estimate: 4 },
    current: { size: 'M', estimate: 4 },
    deps: { listComments: async () => [], patchComment: async () => {} },
  });
  assert.equal(r.status, 'no-refine-comment');
});

console.log('All refine-estimate-comment tests defined.');
