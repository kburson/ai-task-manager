#!/usr/bin/env node
// Unit tests for scripts/task-tracker/lib/refine-to-plan-gate.mjs.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { gateRefineToPlan } from '../lib/refine-to-plan-gate.mjs';

const cfg = { repo: 'o/r', projectId: 'PROJ_1' };

function makeDeps({ values = {}, labels = ['bug'], children = [] } = {}) {
  return {
    loadProjectFieldDefs: () => [],
    projectValuesForIssue: async () => values,
    fetchLabels: async () => labels,
    fetchEpicChildren: async () => children,
  };
}

test('all fields + labels present, no children → ok', async () => {
  const deps = makeDeps({
    values: { priority: 'P1', sequence: 5, size: 'S', estimate: 4, startTime: '2026-05-16 10:00 -07' },
    labels: ['epic-107', 'backend'],
  });
  const r = await gateRefineToPlan({ cfg, issueNumber: 147, deps });
  assert.equal(r.ok, true);
  assert.deepEqual(r.blockers, []);
});

test('missing sequence → blocker names sequence', async () => {
  const deps = makeDeps({
    values: { priority: 'P1', startTime: '2026-05-16 10:00 -07' },
    labels: ['x'],
  });
  const r = await gateRefineToPlan({ cfg, issueNumber: 147, deps });
  assert.equal(r.ok, false);
  assert.ok(r.blockers.some((b) => /sequence/i.test(b)));
});

test('empty labels → blocker', async () => {
  const deps = makeDeps({
    values: { sequence: 1, startTime: '2026-05-16 10:00 -07' },
    labels: [],
  });
  const r = await gateRefineToPlan({ cfg, issueNumber: 147, deps });
  assert.equal(r.ok, false);
  assert.ok(r.blockers.some((b) => /label/i.test(b)));
});

test('missing startTime → blocker', async () => {
  const deps = makeDeps({
    values: { sequence: 1 },
    labels: ['x'],
  });
  const r = await gateRefineToPlan({ cfg, issueNumber: 147, deps });
  assert.equal(r.ok, false);
  assert.ok(r.blockers.some((b) => /start time/i.test(b)));
});

test('epic with backlog child → blocker names child', async () => {
  const deps = makeDeps({
    values: { sequence: 1, startTime: '2026-05-16 10:00 -07' },
    labels: ['x'],
    children: [
      { number: 200, state: 'refine' },
      { number: 201, state: 'backlog' },
    ],
  });
  const r = await gateRefineToPlan({ cfg, issueNumber: 107, deps });
  assert.equal(r.ok, false);
  const childBlocker = r.blockers.find((b) => /children-not-at-refine/.test(b));
  assert.ok(childBlocker);
  assert.match(childBlocker, /#201/);
  assert.doesNotMatch(childBlocker, /#200/);
});

test('epic with past-refine child (plan/develop/etc.) → blocker; children must not lead parent', async () => {
  const deps = makeDeps({
    values: { sequence: 1, startTime: '2026-05-16 10:00 -07' },
    labels: ['x'],
    children: [
      { number: 300, state: 'refine' },
      { number: 301, state: 'plan' },
      { number: 302, state: 'develop' },
      { number: 303, state: 'done' },
    ],
  });
  const r = await gateRefineToPlan({ cfg, issueNumber: 107, deps });
  assert.equal(r.ok, false);
  const blk = r.blockers.find((b) => /children-not-at-refine/.test(b));
  assert.ok(blk);
  assert.match(blk, /#301/);
  assert.match(blk, /#302/);
  assert.match(blk, /#303/);
  assert.doesNotMatch(blk, /#300/);
});

test('epic with all children at refine → ok', async () => {
  const deps = makeDeps({
    values: { sequence: 1, startTime: '2026-05-16 10:00 -07' },
    labels: ['x'],
    children: [
      { number: 400, state: 'refine' },
      { number: 401, state: 'refine' },
    ],
  });
  const r = await gateRefineToPlan({ cfg, issueNumber: 107, deps });
  assert.equal(r.ok, true);
  assert.deepEqual(r.blockers, []);
});

test('non-epic (no children) skips child check', async () => {
  const deps = makeDeps({
    values: { sequence: 1, startTime: '2026-05-16 10:00 -07' },
    labels: ['x'],
    children: [],
  });
  const r = await gateRefineToPlan({ cfg, issueNumber: 999, deps });
  assert.equal(r.ok, true);
});

test('multiple missing fields produces multiple blockers', async () => {
  const deps = makeDeps({ values: {}, labels: [] });
  const r = await gateRefineToPlan({ cfg, issueNumber: 147, deps });
  assert.equal(r.ok, false);
  assert.ok(r.blockers.length >= 3);
});
