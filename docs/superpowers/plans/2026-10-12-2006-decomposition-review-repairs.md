# Repair current decomposition admission and recovery composition — #2006

> **For agentic workers:** Continue inline under the existing #1908 executing-plans final fix pass. Use test-driven-development and verification-before-completion; no new implementer/reviewer seats and no second whole-branch review.

**Goal:** Repair the six final-review gaps without weakening current authority, recovery or completion gates.

**Architecture:** Preserve the strict kernel and real provider collection. Add a narrow exact-bound local planning target classifier, make effect and lifecycle consumers choose the appropriate existing capability, and remove Estimate effects from genuinely unchanged writers. Preserve original guard/schema/concurrency contracts.

**Tech Stack:** Node ESM, native Node tests, existing fixture provider ports and configured complete CI/Test provider. No new dependency.

**Spec:** docs/superpowers/specs/2026-10-11-1908-reestimate-decomposition-design.md at acb725feafc26e31bccfd18b96e9b5e517137397, immutable SHA256 3aa7382fdb05c1151d95fb0a74745b0ecf610671086db5e22545682e1ac554d4.

## Story Intent

- **Beneficiary:** workspace operator
- **Capability:** prepare decomposition and continue only with current truthful authority
- **Need:** unsupported early allowances and stale unchanged paths can bypass or obstruct recovery
- **Value or failure prevented:** product effects remain fenced and concurrent estimate revisions are preserved

## Global Constraints

- Preserve accepted #1908 plan/spec bytes, previous delivered child ancestry and codex/1908-draft.
- No new thresholds, waiver route, caller allow decision or global serialization claim.
- Current five-second remote/six-second total hook budgets and no retry storm remain.
- Exact-bound planning targets may prepare recovery; ordinary documents, product builds and mixed source effects remain scoped effects.
- Source/ownership/state/Test/review/delivery/Close requirements stay conjunctive.
- No production change before its focused real-seam test fails for the reported behavior.
- Keep AITM_TEST_CEILING_MS=9007199254740991 until #1908 is complete.

## Review Focus

1. Mixed planning and product patch targets must never inherit preparation permission; Task1.
2. Completed epic document publication differs from parent product implementation; Task1.
3. Optional absent plan differs from declared unreadable plan, including a fresh-body kind transaction; Task2.
4. Plan-to-Develop promotion must use current materialized planning readiness while later completion still requires terminal children; Task2.
5. A 10→25 external change after the first unchanged comparison must survive ordinary metadata effects and final fresh-body mutation; Task3.

### Task 1: Restore correct native effect and preparation admission

#### Story Intent

- **Beneficiary:** workspace operator
- **Capability:** author bounded recovery plans while product effects require fresh admission
- **Need:** native build and edit allowances currently choose incomplete or wrong effect capabilities
- **Value or failure prevented:** recovery remains usable without allowing oversized product generation

#### Delivery

**Files:** activity-guard.mjs, source-edit-gate.mjs, lib/decomposition-activity.mjs; create lib/decomposition-local-targets.mjs if shared classification is needed; new integration decomposition-review-fixes.test.mjs and bounded helpers.

**Interfaces:** Consume actual resolved targets, current issue and validated exact-binding match. Produce an existing activity value only; never an allow decision. Both native hooks call the same classifier before early allowances. Mixed product targets retain scoped implementation. RUN_BUILD uses scoped implementation; separately classified read-only verification remains unchanged.

- [ ] Add real native build-hook cases for npm run build, tsc, cargo build and go build under mandatory/pending/unavailable authority; assert block before generated output. Add exact-bound issue-specific plan/spec edit and patch cases, wrong-issue and mixed source controls, and completion-ready epic document versus product controls.

```js
test('restricted story can prepare its bound decomposition plan without permitting product edits', async () => {
  const f = await hookFixture(25);
  try {
    const result = await runHook(
      f.payload('docs/superpowers/plans/2026-10-12-107-recovery.md'),
      f.deps
    );
    assert.equal(result.decision, 'allow');
    assert.equal((await runHook(f.payload('src/product.mjs'), f.deps)).decision, 'block');
  } finally {
    f.native.close();
  }
});
```

- [ ] Run the new integration entrypoint; verify real failures from current missing admission/preparation, not incomplete mocks.
- [ ] Implement shared target-derived classification. Eligible preparation requires nonempty all-document targets under issue-specific docs/superpowers/plans or specs Markdown paths and exact binding. Keep original lifecycle/artifact/ownership checks. Mark supported product-generating RUN_BUILD as recognized and select scoped implementation.

```js
export function decompositionTargetActivity({ activity, targets, issue, exactBinding }) {
  if (!exactBinding || !targets.length) return activity;
  const planningPath = new RegExp(
    '^docs/superpowers/(?:plans|specs)/[0-9]{4}-[0-9]{2}-[0-9]{2}-' + issue + '-[^/]+\\.md$'
  );
  return targets.every(
    (target) => target.activity === 'WRITE_DOCS' && planningPath.test(target.relative)
  )
    ? 'decomposition-prepare'
    : activity;
}
```

- [ ] Re-run native cases and existing hook/target composition. Adjust the precise matcher only through real bound targets, never broad docs/scratch aliases. Commit [#2006].

Run: `node --test scripts/tests/integration/task-tracker/lib/decomposition-review-fixes.test.mjs`

### Task 2: Correct typed recovery and pending projection parity

#### Story Intent

- **Beneficiary:** workspace operator
- **Capability:** receive the correct planning completion and pending recovery decision
- **Need:** epic promotion and ordinary kind changes currently demand the wrong readiness inputs and pending display hides intent
- **Value or failure prevented:** valid recovery is usable and unconfirmed values are not represented as actual publication

#### Delivery

**Files:** action-decision/decomposition.mjs, evaluate.mjs, session.mjs; decomposition-plan-exit-guard.mjs, verbs/kind.mjs; decomposition-records.mjs; new unit/integration repair entrypoints.

**Interfaces:** observeDecompositionForAction consumes the effective current lifecycle state supplied by the real evaluator. assertGovernedDecompositionRecovery defaults to strict plan requirements; kind selects optional-plan recovery internally. Declared unavailable plans still fail. Visible pending output separately identifies proposed intended values while retaining actual assessment values.

- [ ] Add real evaluateAction/Explain tests for current Plan epic with reviewed R4P children, completion refusal before terminal delivery and success afterward. Add actual kind transaction with genuine absent optional plan and an unreadable declared-plan control. Add pending rendering with actual10h and proposed25h.

```js
assert.equal(current.input.epicReadiness.planning, true);
assert.equal(current.input.epicReadiness.completion, false);
assert.equal(planPromotion.result.status, 'ready');
assert.match(pendingBody, /Estimate: published 10h/);
assert.match(pendingBody, /Pending intended estimate: proposed 25h/);
```

- [ ] Watch each new behavioral assertion fail against current production.
- [ ] Pass canonicalState from evaluate and normalized observed board state from session into the decomposition observer. For an epic's Plan promotion, require observed planning readiness and current projection instead of completion capability. Retain pending/unavailable fences and scoped completion for actual completion assertions.
- [ ] Add internal requirePlan=true default to recovery guard; kind uses requirePlan=false on its initial and fresh-base validations. Allow observed genuinely absent plan only in that route; preserve source/scope/ownership checks and post-kind reassessment.
- [ ] Render bounded pending intended estimate/size separately through replaceDecompositionRecords; retain records/schema and actual value line. Run new and existing recovery/decision/record suites and commit [#2006].

Run: `node --test scripts/tests/unit/task-tracker/lib/decomposition-review-fixes.test.mjs scripts/tests/integration/task-tracker/lib/decomposition-review-fixes.test.mjs`

### Task 3: Preserve concurrent fields in unchanged writer paths

#### Story Intent

- **Beneficiary:** workspace operator
- **Capability:** preserve a concurrent estimate revision during ordinary metadata work
- **Need:** unchanged paths currently replay captured values into later fresh resources
- **Value or failure prevented:** a newer 25h estimate is not silently replaced by old10h outside publication

#### Delivery

**Files:** gh/lib/project-tether.mjs, lib/decomposition-migration-writer.mjs, verbs/refine.mjs; bounded real writer fixtures and new unit repair entrypoint; measured package inventory metadata and current recovery guidance only as actually needed.

**Interfaces:** An unchanged result owns no semantic Estimate effect. Ordinary fields may proceed, but fresh Estimate/Size remain preserved or changed authority causes a typed refusal. Changed registered revisions retain their existing publication owner, effect confirmation and rollback behavior.

- [ ] For each real writer, start board/body10h, change current board or fresh mutation body to25h during ordinary metadata effects, and assert no raw Estimate write, preserved25h, and no false unchanged/refinement completion assertion.

```js
assert.equal(result.status, 'unchanged');
assert.equal(currentBodyFields.estimate, 25);
assert.equal(estimateEffectCount, 0);
```

- [ ] Verify the real old paths overwrite25h or falsely report convergence before patching.
- [ ] Tether unchanged raw arguments omit size/estimate. Migration ordinary body updates override only non-estimate keys when no revision is being published. Refine unchanged body mutation preserves/refuses a changed live Estimate/Size before rationale/snapshot completion; perform comparisons outside best-effort cache-warning catch. Initial and changed published paths keep explicit intended overrides through their owner.
- [ ] Re-run writer failure/retry/supersession suites. Update only measured named package additions for this plan/helper; verify refusal/guidance inventories without adding invented vocabulary. Commit [#2006].
- [ ] Complete targeted repair aggregate, all required lint/format and exact-head configured cloud CI/native Test. Deliver this approved standalone prerequisite through native exact-head trunk delivery, preserve the worktree, and close #2006 with truthful Full-Auto provenance. Integrate its verified trunk commit into the preserved #1908 branch without rewriting delivered child ancestry. Resume proof #1992 and renew its final evidence at the repaired head; no second whole-branch review.

Run: `node --test scripts/tests/unit/task-tracker/lib/decomposition-review-fixes.test.mjs`
Run: `npm run lint:action-refusals`
Run: `npm run lint:guidance-release`
Run: `npm run lint:story-tags`
Run: `npm run lint:line-cap`

## Self-review and verification boundaries

The six findings map to these three bounded units. Task1 maps native early allowances/mixed targets, Task2 current readiness and optional source distinctions, Task3 real effect freshness. No new threshold or capability is introduced. The plan adds no reviewer seat: it is execution collateral for the one existing final fix pass. New tests use provider-effect doubles only; final guards remain real. Local targeted logs and configured exact-head CI/Test receipts establish execution, not this plan. Root #1908 delivery remains pending until all children, and this standalone prerequisite reach Done.
