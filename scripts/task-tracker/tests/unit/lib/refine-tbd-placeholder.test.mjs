// @story #450
// #450/#892 — refine→plan gate keeps the AC stub refusal while Plan Metadata
// becomes a Plan→Develop concern.
//
// Acceptance criteria:
//   1. Guard returns ok:false when AC placeholder is present
//   2. Guard ignores the retired Plan Metadata placeholder text
//   3. Guard returns ok:true when the AC placeholder is absent
//   4. Guard returns ok:true when toState is not 'plan'
//   5. Guard returns ok:true when ctx is falsy
//   6. runRefine throws when AC placeholder is in body
//   7. runRefine permits the retired Plan Metadata placeholder text
//   8. runPromote returns refine-stub-placeholder-refused when AC placeholder blocks

import assert from 'node:assert/strict';

import {
  refineExitStubPlaceholderGuard,
  STUB_AC_PLACEHOLDER,
  GUARD_ID,
} from '../../../lib/refine-exit-stub-placeholder-guard.mjs';
import { runRefine } from '../../../verbs/refine.mjs';
import { runPromote } from '../../../verbs/promote.mjs';

const baseCfg = { repo: 'owner/repo', projectId: 'PVT_FAKE' };

function bodyWithMarkers({ state = 'refine', extras = '' } = {}) {
  return [
    `<!-- aitm-last-known-state: ${state} -->`,
    `<!-- aitm-last-known-state-ts: 2026-05-10T00:00:00Z -->`,
    '',
    '## Issue',
    '',
    'Substantive body text.',
    '',
    '## Acceptance Criteria',
    '',
    '- [ ] Real AC item.',
    '',
    '## Plan Metadata',
    '',
    'Priority: P2-High | Size: S | Estimate: 2h | Rank: 1',
    '',
    extras,
  ]
    .join('\n')
    .trim();
}

function bodyWithACPlaceholder(state = 'refine') {
  return [
    `<!-- aitm-last-known-state: ${state} -->`,
    `<!-- aitm-last-known-state-ts: 2026-05-10T00:00:00Z -->`,
    '',
    '## Acceptance Criteria',
    '',
    `- [ ] ${STUB_AC_PLACEHOLDER}`,
    '',
    '## Plan Metadata',
    '',
    'Priority: P2-High | Size: S | Estimate: 2h | Rank: 1',
  ].join('\n');
}

const RETIRED_PLAN_PLACEHOLDER = '_TBD — set Size, Estimate, Priority, and Rank at Refine._';

function bodyWithRetiredPlanPlaceholderMention(state = 'refine') {
  return [
    `<!-- aitm-last-known-state: ${state} -->`,
    `<!-- aitm-last-known-state-ts: 2026-05-10T00:00:00Z -->`,
    '',
    '## Issue',
    '',
    `Historical prose quotes ${RETIRED_PLAN_PLACEHOLDER}`,
    '',
    '## Acceptance Criteria',
    '',
    '- [ ] Real AC item.',
    '',
    '## Plan Metadata',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Guard unit tests
// ---------------------------------------------------------------------------

// AC #1 — guard rejects AC placeholder
{
  const result = await refineExitStubPlaceholderGuard.run({
    toState: 'plan',
    body: bodyWithACPlaceholder(),
  });
  assert.equal(result.ok, false, 'AC #1: ok should be false for AC placeholder');
  assert.ok(Array.isArray(result.blockers), 'AC #1: blockers should be array');
  assert.ok(result.blockers.length > 0, 'AC #1: blockers should be non-empty');
  assert.ok(
    result.reason.includes('stub AC placeholder'),
    'AC #1: reason should mention stub AC placeholder'
  );
}

// AC #2 — guard ignores the retired Plan Metadata placeholder text
{
  const result = await refineExitStubPlaceholderGuard.run({
    toState: 'plan',
    body: bodyWithRetiredPlanPlaceholderMention(),
  });
  assert.equal(result.ok, true, 'AC #2: Plan Metadata is no longer a Refine-exit concern');
}

// AC #3 — guard passes substantive body
{
  const result = await refineExitStubPlaceholderGuard.run({
    toState: 'plan',
    body: bodyWithMarkers(),
  });
  assert.equal(result.ok, true, 'AC #3: ok should be true for clean body');
}

// AC #4 — guard skips check when toState is not 'plan'
{
  const result = await refineExitStubPlaceholderGuard.run({
    toState: 'develop',
    body: bodyWithACPlaceholder(),
  });
  assert.equal(result.ok, true, 'AC #4: ok should be true when toState is not plan');
}

// AC #5 — guard skips check when ctx is falsy
{
  const result = await refineExitStubPlaceholderGuard.run(null);
  assert.equal(result.ok, true, 'AC #5: ok should be true when ctx is null');
}

// ---------------------------------------------------------------------------
// runRefine defense-in-depth tests
// ---------------------------------------------------------------------------

function makeRefineDeps(bodyOverride) {
  return {
    assertBound: () => {},
    fetchBody: async () => bodyOverride,
    tetherIssueToProject: async () => ({ itemId: 'PVTI_FAKE' }),
    moveState: async () => ({ status: 'ok' }),
    mutateBody: async ({ mutate }) => {
      mutate(bodyOverride);
      return { status: 'ok' };
    },
  };
}

// AC #6 — runRefine throws on AC placeholder
{
  const acBody = bodyWithACPlaceholder('refine');
  const deps = makeRefineDeps(acBody);
  try {
    await runRefine({
      args: { issueNumber: 7, size: 'S', estimate: 2, priority: 'p2', reason: 'test' },
      cfg: baseCfg,
      deps,
    });
    assert.fail('AC #6: runRefine should have thrown for AC placeholder');
  } catch (err) {
    assert.ok(
      err.message.includes('stub AC placeholder'),
      `AC #6: error should mention stub AC placeholder, got: ${err.message}`
    );
  }
}

// AC #7 — runRefine permits the retired Plan Metadata placeholder text
{
  const planBody = bodyWithRetiredPlanPlaceholderMention('refine');
  const deps = makeRefineDeps(planBody);
  const result = await runRefine({
    args: { issueNumber: 7, size: 'S', estimate: 2, priority: 'p2', reason: 'test' },
    cfg: baseCfg,
    deps,
  });
  assert.equal(result.status, 'refined');
}

// ---------------------------------------------------------------------------
// runPromote refine→plan gate tests
// ---------------------------------------------------------------------------

function makePromoteDeps(body) {
  return {
    assertBound: () => {},
    fetchIssueBody: async () => ({ body }),
    getLiveState: async () => 'refine',
  };
}

function bodyWithRefineCompleteMarker(base) {
  return `${base}\n<!-- aitm-refine-complete: 2026-05-10T00:00:00Z -->`;
}

// AC #8 — runPromote returns refine-stub-placeholder-refused for AC placeholder
{
  const body = bodyWithRefineCompleteMarker(bodyWithACPlaceholder('refine'));
  const deps = makePromoteDeps(body);
  const result = await runPromote({
    issueNumber: 8,
    cfg: baseCfg,
    deps,
  });
  assert.equal(
    result.status,
    'refine-stub-placeholder-refused',
    `AC #8: expected refine-stub-placeholder-refused, got ${result.status}`
  );
}
