#!/usr/bin/env node
// @story #121
// Tests for #121: plan-approve auto-collapses the Deep-Dive Analysis appendix
// into a <details> block on the success path.
//
// Covers:
//   1. Wrap on first approval: <details>/<summary> bracket the Deep-Dive section.
//   2. Idempotency: second invocation does not double-wrap or re-edit body.
//   3. No-op when issue has no Deep-Dive Analysis section.
//   4. Summary text matches the contract string.

import { strict as assert } from 'node:assert';
import { runPlanApprove } from '../../../verbs/plan-approve.mjs';
import { DEEP_DIVE_DETAILS_SUMMARY, wrapDeepDiveInDetails } from '../../../lib/markers.mjs';

const cfg = { repo: 'o/r' };
const FIXED_TS = '2026-05-16T00:00:00Z';

function makeDeps(initialBody, state = 'plan') {
  const calls = { writes: [] };
  let body = initialBody;
  return {
    calls,
    deps: {
      env: {},
      fetchIssueBody: async () => body,
      // #295 — closure form.
      mutateIssueBody: async ({ mutate }) => {
        const before = body;
        const next = mutate(before);
        if (next === before) return { status: 'no-op', attempts: 1 };
        calls.writes.push(next);
        body = next;
        return { status: 'ok', attempts: 1 };
      },
      getBoardState: async () => state,
      nowIso: () => FIXED_TS,
    },
    getBody: () => body,
  };
}

const BODY_WITH_DEEP_DIVE = `## Scope

Body content.

## Acceptance Criteria

- [x] done

## Pickup Directive — MANDATORY, DO NOT SKIP
> Follow: \`.ai-task-manager/templates/pickup-directive.md\`

---

## Deep-Dive Analysis (Refine stage)
<!-- aitm-deep-dive-complete: 2026-05-16T00:00:00Z -->

### Current state

Some prose.

### Plan

1. Step one.
2. Step two.

<!-- aitm-fields: {"schema":1,"values":{"size":"M"}} -->
`;

const BODY_WITHOUT_DEEP_DIVE = `## Scope

Plain body.

## Acceptance Criteria

- [x] done

<!-- aitm-fields: {"schema":1,"values":{"size":"S"}} -->
`;

// 1. Wrap on first approval.
{
  const { deps, getBody } = makeDeps(BODY_WITH_DEEP_DIVE);
  const r = await runPlanApprove({ issueNumber: 121, cfg, deps });
  assert.equal(r.status, 'approved');
  const out = getBody();
  assert.match(out, /<details>\s*\n<summary>/);
  assert.ok(out.includes(DEEP_DIVE_DETAILS_SUMMARY), 'summary text must match contract constant');
  const detailsIdx = out.indexOf('<details>');
  const headingIdx = out.indexOf('## Deep-Dive Analysis');
  const closeIdx = out.indexOf('</details>');
  assert.ok(detailsIdx >= 0 && detailsIdx < headingIdx, '<details> opens before heading');
  assert.ok(closeIdx > headingIdx, '</details> closes after heading');
  // Field-DB still present and after the </details>.
  const fieldsIdx = out.indexOf('<!-- aitm-fields:');
  assert.ok(fieldsIdx > closeIdx, 'field-DB stays after </details>');
}

// 2. Idempotency — direct helper does not double-wrap.
{
  const once = wrapDeepDiveInDetails(BODY_WITH_DEEP_DIVE);
  const twice = wrapDeepDiveInDetails(once);
  assert.equal(twice, once, 'wrap is idempotent');
  // Count opens — must be exactly one.
  const opens = (twice.match(/<details>/g) || []).length;
  assert.equal(opens, 1, 'exactly one <details> after re-wrap');
}

// 3. No-op when no Deep-Dive Analysis section.
{
  const { deps, getBody } = makeDeps(BODY_WITHOUT_DEEP_DIVE);
  const r = await runPlanApprove({ issueNumber: 121, cfg, deps });
  assert.equal(r.status, 'approved');
  const out = getBody();
  assert.ok(!out.includes('<details>'), 'no <details> added when no deep-dive');
  assert.ok(hasMarker(out), 'plan-approved marker still inserted');
}

// 4. Summary text contract.
{
  assert.equal(
    DEEP_DIVE_DETAILS_SUMMARY,
    'Deep-Dive Analysis (collapsed on plan approval — expand if revisiting scope)'
  );
  const wrapped = wrapDeepDiveInDetails(BODY_WITH_DEEP_DIVE);
  assert.ok(
    wrapped.includes(`<summary>${DEEP_DIVE_DETAILS_SUMMARY}`),
    'summary line contains contract string'
  );
}

function hasMarker(s) {
  return /<!--\s*aitm-plan-approved(?: ts="|:)/.test(s);
}

console.log('plan-approve-collapse: ok');
