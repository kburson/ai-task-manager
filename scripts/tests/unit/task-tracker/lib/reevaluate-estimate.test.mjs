#!/usr/bin/env node
// @story #34
import { strict as assert } from 'node:assert';
import {
  parseDeepDiveSignals,
  scoreSignals,
  bucketSize,
  reevaluateEstimate,
  buildAuditCommentBody,
  AUDIT_HEADER,
  ESTIMATE_HOURS,
  SIZE_BUCKETS,
} from '../../../../task-tracker/lib/reevaluate-estimate.mjs';

// Bucket boundaries — score on the upper edge of one tier must NOT spill into the next.
{
  for (const b of SIZE_BUCKETS) {
    if (b.max === Infinity) continue;
    assert.equal(bucketSize(b.max), b.size, `score ${b.max} should bucket as ${b.size}`);
    assert.notEqual(
      bucketSize(b.max + 0.01),
      b.size,
      `score ${b.max + 0.01} should escape ${b.size}`
    );
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

// buildAuditCommentBody — auto-apply path (single-tier jump).
{
  const result = reevaluateEstimate(
    `## Deep-Dive Analysis
### Files to edit
- a.mjs
- b.mjs
- c.mjs
- d.mjs
### Step-by-step plan
1. one
2. two
3. three
4. four
5. five
6. six
### Identified risks
- r1
`,
    { size: 'M', estimate: 8 }
  );
  const body = buildAuditCommentBody(result);
  assert.ok(body.startsWith(AUDIT_HEADER), 'header line first');
  assert.ok(!/HUMAN ATTENTION/.test(body), 'auto-apply path has no human-attention banner');
  assert.match(body, /\| Size \| M \| L \|/, 'size before/after row');
  assert.match(body, /\| Estimate \(h\) \| 8 \| 16 \|/, 'estimate before/after row');
  assert.match(body, /Deep dive surfaced/, 'rationale line present');
}

// buildAuditCommentBody — ≥2-tier path (human attention required, no mutation).
{
  const result = reevaluateEstimate(
    `## Deep-Dive Analysis
### Files to edit
- a.mjs
- b.mjs
- c.mjs
- d.mjs
- e.mjs
### Step-by-step plan
1. one
2. two
3. three
4. four
5. five
6. six
7. seven
8. eight
9. nine
10. ten
### Identified risks
- r1
- r2
- r3
- r4
- r5
`,
    { size: 'XS', estimate: 1.5 }
  );
  assert.equal(result.requiresHuman, true, 'fixture must trip the 2-tier gate');
  const body = buildAuditCommentBody(result);
  assert.ok(body.startsWith(AUDIT_HEADER));
  assert.match(body, /⚠ \*\*HUMAN ATTENTION\*\*/, 'human-attention banner present');
  assert.match(body, /\| Size \| XS \|/, 'before-size XS in table');
}

// Fence-aware extractSection: a fenced `## Foo` line inside the deep-dive must NOT
// terminate the section. Regression for #91 (#13 hit this in production).
{
  const body = `## Deep-Dive Analysis

\`\`\`
## Dependency Map (validated 2026-05-12)
ignored fenced heading
\`\`\`

### Files to edit
- a.mjs
- b.mjs

### Step-by-step plan
1. one
2. two
3. three
4. four

### Identified risks
- r1
- r2
`;
  const sig = parseDeepDiveSignals(body);
  assert.equal(sig.files, 2, 'fenced ## must not truncate deep-dive before Files section');
  assert.equal(sig.steps, 4, 'fenced ## must not truncate deep-dive before Step-by-step plan');
  assert.equal(sig.risks, 2, 'fenced ## must not truncate deep-dive before Identified risks');
}

// Tilde-fence variant — same protection.
{
  const body = `## Deep-Dive Analysis

~~~
## fake heading
~~~

### Files to edit
- one.mjs
`;
  const sig = parseDeepDiveSignals(body);
  assert.equal(sig.files, 1, 'tilde-fenced ## must not truncate deep-dive');
}

// Regression: a fenced `### Files to edit` must NOT match as the section start.
// The real later heading should win.
{
  const body = `## Deep-Dive Analysis

\`\`\`
### Files to edit
- not-real.mjs
\`\`\`

### Files to edit
- real.mjs
- also-real.mjs
`;
  const sig = parseDeepDiveSignals(body);
  assert.equal(sig.files, 2, 'real heading should win over fenced look-alike');
}

// Regression: fence-free deep-dive bodies extract identically (golden snapshot).
{
  const body = `## Deep-Dive Analysis (2026-05-09)

### Files to edit

- a.mjs
- b.mjs
- c.mjs

### Step-by-step plan

1. one
2. two

### Identified risks

- r1
`;
  const sig = parseDeepDiveSignals(body);
  assert.deepEqual(sig, { files: 3, steps: 2, risks: 1, deps: 0 });
}

console.log('reevaluate-estimate.test.mjs: all passed');
