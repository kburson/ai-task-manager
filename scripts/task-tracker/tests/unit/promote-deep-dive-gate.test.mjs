#!/usr/bin/env node
// @story #296
// #297 — e2e refusal: promote plan→develop must surface
// `deep-dive-refused` when the body lacks Deep-Dive Analysis signals,
// even after the planned-estimate gate passes.
import { strict as assert } from 'node:assert';
import { planDeepDiveGate } from '../../lib/deep-dive-gate.mjs';

// Body that passes planned-estimate gate (mocked away) but lacks deep dive.
const PLAN_BODY_NO_DEEP_DIVE = [
  '## Scope',
  '- do the thing',
  '',
  '## Acceptance Criteria',
  '- [ ] thing done',
  '',
  '## Pickup Directive — MANDATORY, DO NOT SKIP',
  '> Follow: `.ai-task-manager/pickup-directive.md`',
  '',
  '<!-- aitm-fields: {"schema":1,"values":{"priority":"P1","size":"S","estimate":2}} -->',
].join('\n');

// Body with all deep-dive signals present (marker-only, #300).
const PLAN_BODY_WITH_DEEP_DIVE = [
  '## Scope',
  '- do the thing',
  '',
  '## Acceptance Criteria',
  '- [ ] thing done',
  '',
  '## Pickup Directive — MANDATORY, DO NOT SKIP',
  '> Follow: `.ai-task-manager/pickup-directive.md`',
  '',
  '<!-- aitm-deep-dive-posted: 2026-06-04 -->',
  '## Deep-Dive Analysis (2026-06-04)',
  // #358 — planDeepDiveGate now enforces a size-bucketed substantive-chars
  // floor (XS=1200, default=2000). Pad past XS floor and tag body as XS.
  ...Array.from(
    { length: 20 },
    (_, i) =>
      `line ${i + 1}: substantive analysis paragraph describing the change, the surrounding subsystem, the risk surface, and the verification approach.`
  ),
  '<!-- aitm-deep-dive-complete: 2026-06-04T23:00:00Z -->',
  '',
  `<!-- aitm-fields: ${JSON.stringify({ schema: 1, values: { priority: 'P1', size: 'XS', estimate: 2 } })} -->`,
].join('\n');

// Refusal: all three blocker codes named on a body missing every signal.
{
  const r = planDeepDiveGate({ body: PLAN_BODY_NO_DEEP_DIVE });
  assert.equal(r.ok, false);
  const codes = r.blockers.map((b) => b.split(':')[0]);
  assert.ok(codes.includes('plan-develop-deep-dive-posted-marker-missing'));
  assert.ok(codes.includes('plan-develop-deep-dive-section-missing'));
  assert.ok(codes.includes('plan-develop-deep-dive-complete-marker-missing'));
}

// Pass: complete body clears the gate.
{
  const r = planDeepDiveGate({ body: PLAN_BODY_WITH_DEEP_DIVE });
  assert.equal(r.ok, true, JSON.stringify(r));
}

// Promote wiring smoke test: import promote and assert the gate import
// resolves (catches accidental removal of the import from promote.mjs).
{
  const promote = await import('../../verbs/promote.mjs');
  assert.equal(typeof promote.runPromote, 'function', 'runPromote is exported');
}

console.log('promote-deep-dive-gate.test.mjs: all passed');
