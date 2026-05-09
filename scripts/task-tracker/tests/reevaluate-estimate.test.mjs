#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import {
  parseDeepDiveSignals,
  scoreSignals,
  bucketSize,
  reevaluateEstimate,
  ESTIMATE_HOURS,
  SIZE_BUCKETS,
} from '../lib/reevaluate-estimate.mjs';

// Bucket boundaries — score on the upper edge of one tier must NOT spill into the next.
{
  for (const b of SIZE_BUCKETS) {
    if (b.max === Infinity) continue;
    assert.equal(bucketSize(b.max), b.size, `score ${b.max} should bucket as ${b.size}`);
    assert.notEqual(bucketSize(b.max + 0.01), b.size, `score ${b.max + 0.01} should escape ${b.size}`);
  }
}

// Empty / missing sections → all signals 0 → XS.
{
  const result = reevaluateEstimate('', {});
  assert.deepEqual(result.signals, { files: 0, steps: 0, risks: 0, deps: 0 });
  assert.equal(result.score, 0);
  assert.equal(result.size, 'XS');
  assert.equal(result.estimate, ESTIMATE_HOURS.XS);
}

// Body with no Deep-Dive section but with sub-sections at the top level — still 0 signals.
{
  const body = `## Scope\n\nDoes a thing.\n`;
  const sig = parseDeepDiveSignals(body);
  assert.deepEqual(sig, { files: 0, steps: 0, risks: 0, deps: 0 });
}

// Realistic Deep-Dive content — exercises every counter.
{
  const body = `
## Deep-Dive Analysis (2026-05-09)

### Files to edit

- a.mjs
- b.mjs
- c.mjs

### Step-by-step plan

1. Step one.
2. Step two.
3. Step three.
4. Step four.

### Identified risks

- Risk A
- Risk B

## Dependency Map

Depends on: #11 (reason), #12 (reason)
Blocks: none
`;
  const sig = parseDeepDiveSignals(body);
  assert.deepEqual(sig, { files: 3, steps: 4, risks: 2, deps: 2 });
  // score = 4 + 1.5*3 + 2 + 0.5*2 = 11.5 → M
  assert.equal(scoreSignals(sig), 11.5);
  assert.equal(bucketSize(11.5), 'M');

  // Compare against current values that match — should be no-op.
  const noop = reevaluateEstimate(body, { size: 'M', estimate: ESTIMATE_HOURS.M });
  assert.equal(noop.changed, false);
  assert.equal(noop.requiresHuman, false);

  // Compare against an XS current — 3-tier jump → requiresHuman = true.
  const jump = reevaluateEstimate(body, { size: 'XS', estimate: 0.5 });
  assert.equal(jump.changed, true);
  assert.equal(jump.tierJump, 2);
  assert.equal(jump.requiresHuman, true);
}

// Dependency Map "none" → 0 deps even if # tokens appear elsewhere.
{
  const body = `
## Deep-Dive Analysis

### Step-by-step plan

1. Only step.

## Dependency Map

Depends on: none
Blocks: #99
`;
  const sig = parseDeepDiveSignals(body);
  assert.equal(sig.deps, 0);
}

// Estimate equality is float-tolerant.
{
  const body = `
## Deep-Dive Analysis

### Step-by-step plan
1. one
`;
  const r = reevaluateEstimate(body, { size: 'XS', estimate: ESTIMATE_HOURS.XS + 0.0000001 });
  assert.equal(r.changed, false);
}

// Estimate change with same size still counts as changed.
{
  const body = `
## Deep-Dive Analysis

### Step-by-step plan
1. one
`;
  const r = reevaluateEstimate(body, { size: 'XS', estimate: 1 });
  assert.equal(r.size, 'XS');
  assert.equal(r.estimateChanged, true);
  assert.equal(r.changed, true);
}

// Bad input types — handled, not thrown.
{
  const r = reevaluateEstimate(undefined, {});
  assert.equal(r.size, 'XS');
}

console.log('reevaluate-estimate.test.mjs: all passed');
