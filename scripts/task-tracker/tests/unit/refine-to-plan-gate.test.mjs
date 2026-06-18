#!/usr/bin/env node
// @story #147
// Unit tests for scripts/task-tracker/lib/refine-to-plan-gate.mjs.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { gateRefineToPlan } from '../../lib/refine-to-plan-gate.mjs';

const cfg = { repo: 'o/r', projectId: 'PROJ_1' };

function makeDeps({ values = {}, labels = ['bug'], children = [], body = '' } = {}) {
  return {
    loadProjectFieldDefs: () => [],
    projectValuesForIssue: async () => values,
    fetchLabels: async () => labels,
    fetchEpicChildren: async () => children,
    fetchBody: async () => body,
  };
}

test('all fields + labels present, no children → ok', async () => {
  const deps = makeDeps({
    values: {
      priority: 'P1',
      rank: 5,
      size: 'S',
      estimate: 4,
      startTime: '2026-05-16 10:00 -07',
    },
    labels: ['epic-107', 'backend'],
  });
  const r = await gateRefineToPlan({ cfg, issueNumber: 147, deps });
  assert.equal(r.ok, true);
  assert.deepEqual(r.blockers, []);
});

test('missing rank → blocker names rank', async () => {
  const deps = makeDeps({
    values: { priority: 'P1', startTime: '2026-05-16 10:00 -07' },
    labels: ['x'],
  });
  const r = await gateRefineToPlan({ cfg, issueNumber: 147, deps });
  assert.equal(r.ok, false);
  assert.ok(r.blockers.some((b) => /rank/i.test(b)));
});

test('empty labels → blocker', async () => {
  const deps = makeDeps({
    values: { rank: 1, startTime: '2026-05-16 10:00 -07' },
    labels: [],
  });
  const r = await gateRefineToPlan({ cfg, issueNumber: 147, deps });
  assert.equal(r.ok, false);
  assert.ok(r.blockers.some((b) => /label/i.test(b)));
});

test('missing startTime → blocker', async () => {
  const deps = makeDeps({
    values: { rank: 1 },
    labels: ['x'],
  });
  const r = await gateRefineToPlan({ cfg, issueNumber: 147, deps });
  assert.equal(r.ok, false);
  assert.ok(r.blockers.some((b) => /start time/i.test(b)));
});

test('#245 — epic whose child is in backlog now PASSES (child-not-at-refine check removed)', async () => {
  const deps = makeDeps({
    values: { rank: 1, startTime: '2026-05-16 10:00 -07' },
    labels: ['x'],
    children: [
      { number: 200, state: 'refine' },
      { number: 201, state: 'backlog' },
    ],
  });
  const r = await gateRefineToPlan({ cfg, issueNumber: 107, deps });
  assert.equal(r.ok, true);
  assert.deepEqual(r.blockers, []);
  assert.ok(!r.blockers.some((b) => /refine-exit-children-not-at-refine/.test(b)));
});

test('#245 — kept checks still fire: missing rank yields refine-exit-missing even for an epic', async () => {
  const deps = makeDeps({
    values: { startTime: '2026-05-16 10:00 -07' },
    labels: ['x'],
    children: [{ number: 201, state: 'backlog' }],
  });
  const r = await gateRefineToPlan({ cfg, issueNumber: 107, deps });
  assert.equal(r.ok, false);
  assert.ok(r.blockers.some((b) => /^refine-exit-missing/.test(b) && /rank/i.test(b)));
});

test('compound CLI command in AC marker → refine-exit-forbidden-command blocker', async () => {
  const deps = makeDeps({
    values: { rank: 1, startTime: '2026-05-16 10:00 -07' },
    labels: ['x'],
    body: `## Acceptance Criteria

- [ ] AC. <!-- aitm-verified-by: \`npm run lint && npm test\` -->
`,
  });
  const r = await gateRefineToPlan({ cfg, issueNumber: 147, deps });
  assert.equal(r.ok, false);
  assert.ok(r.blockers.some((b) => /refine-exit-forbidden-command/.test(b)));
});

test('multiple missing fields produces multiple blockers', async () => {
  const deps = makeDeps({ values: {}, labels: [] });
  const r = await gateRefineToPlan({ cfg, issueNumber: 147, deps });
  assert.equal(r.ok, false);
  assert.ok(r.blockers.length >= 3);
});
