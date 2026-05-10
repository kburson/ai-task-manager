#!/usr/bin/env node
// Unit tests for scripts/task-tracker/verbs/analyze.mjs (runAnalyze).
//
// Covers the six AC scenarios:
//   1. Missing required field (size empty) -> refusal with field-required blocker
//   2. Missing required body section -> refusal with body-section-required blocker
//   3. Wave-admission blocker (lower-Sequence sibling in development)
//   4. Cascade-grooming blocker (epic with sub-issue still in backlog)
//   5. Solo issue (no parent epic) bypasses wave + cascade gates
//   6. Same-wave newcomer does not block; passing case calls move-state

import { strict as assert } from 'node:assert';
import { runAnalyze } from '../verbs/analyze.mjs';

const cfg = { repo: 'o/r', projectId: 'P' };

const FULL_BODY = [
  '## Acceptance Criteria',
  '- [ ] something',
  '',
  '### Definition of Done',
  '- [ ] done',
  '',
  '## Pickup Directive',
  'pickup',
  '',
  '<!-- ai-task-manager:fields:start -->',
  '<!-- ai-task-manager:fields:end -->',
].join('\n');

function makeDeps(overrides = {}) {
  return {
    fetchIssueContext: async () => ({
      title: 'Some issue',
      body: FULL_BODY,
      labels: ['feature'],
      parentEpicNumber: null,
      isEpic: false,
    }),
    fetchSubIssueStates: async () => [],
    resolveFieldValues: async () => ({
      estimate: 2, size: 'M', priority: 'P1', sequence: 3,
    }),
    admit: async () => ({ ok: true, blockers: [] }),
    moveState: async () => 0,
    ...overrides,
  };
}

// 1. Missing required field (size empty)
{
  const deps = makeDeps({
    resolveFieldValues: async () => ({
      estimate: 2, size: null, priority: 'P1', sequence: 3,
    }),
  });
  const r = await runAnalyze({ issueNumber: 100, cfg, deps });
  assert.equal(r.ok, false, 'missing size should refuse');
  assert.ok(r.blockers.some(b => b.kind === 'field-required' && /size/.test(b.message)),
    `expected field-required size blocker, got ${JSON.stringify(r.blockers)}`);
}

// 2. Missing required body section (no Acceptance Criteria)
{
  const deps = makeDeps({
    fetchIssueContext: async () => ({
      title: 'Some issue',
      body: '## Pickup Directive\n\n<!-- ai-task-manager:fields:start -->\n',
      labels: ['feature'],
      parentEpicNumber: null,
      isEpic: false,
    }),
  });
  const r = await runAnalyze({ issueNumber: 101, cfg, deps });
  assert.equal(r.ok, false, 'missing body sections should refuse');
  assert.ok(r.blockers.some(b => b.kind === 'body-section-required' && /Acceptance Criteria/.test(b.message)),
    `expected body-section-required AC, got ${JSON.stringify(r.blockers)}`);
}

// 3. Wave-admission blocker: lower-Sequence sibling in-flight
{
  const deps = makeDeps({
    fetchIssueContext: async () => ({
      title: 'Sub issue',
      body: FULL_BODY,
      labels: ['feature'],
      parentEpicNumber: 41,
      isEpic: false,
    }),
    admit: async () => ({
      ok: false,
      blockers: [{ issue: 47, sequence: 1, state: 'development' }],
    }),
  });
  const r = await runAnalyze({ issueNumber: 102, cfg, deps });
  assert.equal(r.ok, false, 'wave-admission lower-seq sibling should refuse');
  assert.ok(r.blockers.some(b => b.kind === 'wave-admission' && /#47/.test(b.message)),
    `expected wave-admission blocker, got ${JSON.stringify(r.blockers)}`);
}

// 4. Cascade-grooming: epic with sub-issue in backlog
{
  const deps = makeDeps({
    fetchIssueContext: async () => ({
      title: 'EPIC: do the thing',
      body: FULL_BODY,
      labels: ['epic'],
      parentEpicNumber: null,
      isEpic: true,
    }),
    fetchSubIssueStates: async () => [
      { number: 200, state: 'groom' },
      { number: 201, state: 'backlog' },
    ],
  });
  const r = await runAnalyze({ issueNumber: 41, cfg, deps });
  assert.equal(r.ok, false, 'cascade-grooming with backlog sub should refuse');
  assert.ok(r.blockers.some(b => b.kind === 'cascade-grooming' && /#201/.test(b.message)),
    `expected cascade-grooming blocker for #201, got ${JSON.stringify(r.blockers)}`);
  // Sibling already in groom should NOT be a blocker.
  assert.ok(!r.blockers.some(b => /#200/.test(b.message)),
    `#200 (groom) should not block, got ${JSON.stringify(r.blockers)}`);
}

// 5. Solo issue (no parent) bypasses wave + cascade gates and passes
{
  let moveCalled = 0;
  const deps = makeDeps({
    moveState: async () => { moveCalled++; return 0; },
  });
  const r = await runAnalyze({ issueNumber: 103, cfg, deps });
  assert.equal(r.ok, true, `solo issue should pass: ${JSON.stringify(r.blockers)}`);
  assert.equal(r.blockers.length, 0);
  assert.equal(moveCalled, 1, 'move-state should be invoked on success');
}

// 6. Same-wave newcomer does not block; passing case calls move-state
{
  let moveCalled = 0;
  const deps = makeDeps({
    fetchIssueContext: async () => ({
      title: 'Sub issue',
      body: FULL_BODY,
      labels: ['feature'],
      parentEpicNumber: 41,
      isEpic: false,
    }),
    // admit() with same-Sequence sibling returns ok=true (newcomer rule)
    admit: async () => ({ ok: true, blockers: [] }),
    moveState: async () => { moveCalled++; return 0; },
  });
  const r = await runAnalyze({ issueNumber: 104, cfg, deps });
  assert.equal(r.ok, true, `same-wave newcomer should pass: ${JSON.stringify(r.blockers)}`);
  assert.equal(moveCalled, 1);
}

// 7. move-state non-zero exit propagates as refusal
{
  const deps = makeDeps({
    moveState: async () => 7,
  });
  const r = await runAnalyze({ issueNumber: 105, cfg, deps });
  assert.equal(r.ok, false);
  assert.ok(r.blockers.some(b => b.kind === 'move-state'),
    `expected move-state blocker, got ${JSON.stringify(r.blockers)}`);
}

console.log('analyze-gate.test.mjs: all passed');
