# Test Auto-Tick Branch Provenance Implementation Plan

> **For implementation:** Execute test-first with an independent review before delivery.

**Goal:** Make Test auto-tick bind provenance-bearing proof to the exact tested commit while retaining sentinel compatibility for callers without a commit.

**Architecture:** Thread an optional validated SHA through `autoTickVerified` and pass Test's already verified commit into both auto-tick folds. Leave reachability policy and sandbox verification unchanged.

---

## Task 1: Add optional exact-SHA evidence writing

**Files:**

- Modify: `scripts/task-tracker/lib/auto-tick-verified.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/auto-tick-verified.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/auto-tick-functional-vc-list.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/evidence-branch-reachability.test.mjs`

1. Add failing tests for an explicit exact SHA across AC, VC, and Functional auto-ticks.
2. Add a failing provenance-bearing AC case that is incomplete with `sandbox` and complete/reachable with the explicit SHA.
3. Add a failing malformed-SHA case.
4. Add the optional validated SHA parameter while preserving sentinel defaults.
5. Run focused tests and commit with `[#1344]`.

## Task 2: Wire Test's verified commit through both folds

**Files:**

- Modify: `scripts/task-tracker/verbs/test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/test-sha-drift-gate.test.mjs`
- Modify if needed: `scripts/tests/unit/task-tracker/verbs/test-verb-sandbox-worktree-path.test.mjs`

1. Add a failing source/wiring test proving both `autoTickVerified` calls receive the exact `sha`.
2. Pass `sha` into the pre-write and fresh-base calls.
3. Prove SHA drift still refuses before proof publication.
4. Run focused tests and commit with `[#1344]`.

## Task 3: Review, verify, integrate, and recover #1343

1. Run focused tests, lint, format, fast, and slow suites.
2. Run independent whole-delta review and correct all Important findings.
3. Move #1344 through Test and Review, merge, and close it through governed workflows.
4. Resume #1343 and rerun its governed Test recovery without direct marker edits.
