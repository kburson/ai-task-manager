# Refine Rank Preservation Implementation Plan

> **For agentic workers:** Execute natively with superpowers:executing-plans. Independent GPT-6.1 Sol / medium exact-source review follows verification.

**Goal:** Preserve existing rank on omission while retaining exact publication retry identity.

**Architecture:** Keep runRefine's publication key unchanged. Conditionally include rank in body refresh input and override keys. Exercise actual publication and snapshot validation with provider I/O fixtures.

**Tech Stack:** Node.js ESM, node:test, existing estimation publication fixtures.

**Spec:** [Design](2026-10-23-2091-rank-preservation-design.md) and live #2091.

## Global Constraints

- Product edits only in `scripts/task-tracker/verbs/refine.mjs`.
- Omitted-rank operation key stays null; never derive it from persisted rank.
- Keep snapshot required rank and genuine absent-rank refusal.
- No policy changes, overrides, cleanup, source activation, or native Test/Review/Close.
- Preserve complete raw failures and successes. Commit source and collateral separately with `[#2091]`.

## Review Focus

- Omitted rank preserves fresh body rank in changed publication.
- Explicit rank updates body and board consistently.
- Unchanged Estimate/Size still preserves rank and validates snapshot.
- Pending exact retry retains operation ID and null-rank intent.
- Truly absent rank fails snapshot validation without promotion.

### Task 1: Regression-protected body refresh

**Files:** Modify `scripts/tests/unit/task-tracker/gh/lib/project-tether-publication.cases.mjs` and `scripts/task-tracker/verbs/refine.mjs`. Run importing harness `scripts/tests/unit/task-tracker/gh/lib/project-tether.test.mjs`.

**Interface:** `runRefine({args,cfg,deps})` consumes optional rank and fresh body I/O. The existing publication writer owns field/rationale effects. Enable `fetchLabels` to execute the real snapshot contract.

- [x] Add real-publication cases for all five Review Focus conditions. Use persisted rank 3 and replacement 7. Assert snapshot validity, field values, legal promotion count and operation identity.
- [x] Run harness against unchanged production and retain full RED output/exit. Confirm failures at `refinement-snapshot:field-rank`.
- [x] Supply `...(rankNum != null ? { rank: rankNum } : {})` to body refresh. Append rank to override keys only under that condition. Keep the publication key unchanged.
- [x] Run harness, all four declared Refine files, `npm test`, `npm run test:slow`, `npm run lint`, and `npm run format:check`; retain raw results.
- [x] Obtain fresh independent source review, retain full report and rulings, repair verified findings.
- [x] Commit source/tests and native commit trace. Commit complete evidence, record hashes and byte lengths, pause natively and report CODE_COMPLETE pending root acceptance.

Verification limit: all commands ran, but the full slow suite and exact isolated reproduction are red due to capture-fixture stderr diagnostics under the required telemetry flag. That is retained for root acceptance; no all-tests-green claim or native acceptance is made.

Completion clarification requested by root artifact review: source and original evidence commits, their native traces and the original Pause/CODE_COMPLETE report were completed. Canonical slow follow-up also passed without code changes. These checked implementation steps do not claim native acceptance, Test, Review, approval, Close, source adoption or release; those remain root-owned.
