# #1664 Functional DoD Projection and Ready-Only Persistence Implementation Plan

> **For agentic workers:** Execute each checked step with RED/GREEN tests and an independent review checkpoint. This plan is an issue-local authority revision of accepted #1558 WBS Task 12; it does not alter the accepted specification or other WBS children.

**Goal:** Evaluate derived Functional DoD as a pure, ordered projection and persist it only from fresh, fully ready execution authority.

**Architecture:** One projector computes the current acs-then-checkboxes body transform and versioned normalization intent without I/O. An execution-only helper, called under the existing lifecycle lock, refreshes the complete decision, recomputes inside each versioned body write, reads back actual evidence, and refuses drift before any later effect. Existing independent stampers stay intact.

**Tech stack:** Node.js ESM, GitHub-backed `mutateIssueBody`, `node:test`, AITM's `aitm.action-decision/v2` contract.

**Spec:** `docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md`; accepted WBS `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-hydration-wbs-r3.md`, Task 12; baseline implementation plan `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-replacement.md`, Task 5.

## Global Constraints

- Preserve the accepted WBS Scope and three #1664 acceptance criteria; no CLI explanation or downstream per-action adapter becomes ready in this child.
- The closed normalizer is `functional-dod-derived/v1`; retain `derive:all-acceptance-criteria-ticked` and `derive:all-non-self-non-lifecycle-checkboxes-ticked`.
- V2 decision intent contains `{key,derivationRule,stamp,tick}` only; `derivationRule` is `derive-acs/v1` or `derive-checkboxes/v1`. The existing `derive:all-acceptance-criteria-ticked` and `derive:all-non-self-non-lifecycle-checkboxes-ticked` strings remain evidence-marker `cmd` values, not decision-record enums. Hash `{normalizerId,decisions}` for `decisionDigest`; hash normalized input separately. Exclude timestamps, SHA stamps, and rendered marker bytes; do not introduce a projected-body digest.
- Explanation gets only the pure projector. Only the ready-only execution helper supplies literal `evidenceStamp: true` to the existing versioned writer. Keep other sanctioned stamping callers intact.
- Existing lock, fresh authority, mutation order, exit behavior, Node compatibility, and action-decision preservation constraints remain binding.

## Story Intent

- **Beneficiary:** lifecycle executor
- **Capability:** inspect derived Functional DoD without writing and persist it only after current readiness is established
- **Need:** today's derive-and-rescan path writes before a complete readiness decision and can scan stale body data after a failed refresh
- **Value or failure prevented:** explanation stays read-only, and a failed or drifted normalization cannot authorize progression

## Implementation Tasks

### Task 12: Project Functional DoD and persist it only after readiness

#### Story Intent

- **Beneficiary:** lifecycle executor
- **Capability:** inspect derived Functional DoD without writing and persist it only after current readiness is established
- **Need:** today's derive-and-rescan path writes before a complete readiness decision and can scan stale body data after a failed refresh
- **Value or failure prevented:** explanation stays read-only, and a failed or drifted normalization cannot authorize progression

#### Unit A — Pure ordered projection (8 h)

**Files:** Create `scripts/task-tracker/lib/functional-dod-project.mjs` and `scripts/tests/unit/task-tracker/lib/functional-dod-project.test.mjs`; modify `scripts/task-tracker/lib/functional-dod-derive.mjs` only to share the pure transform while retaining its sanctioned legacy writer until call-site migration.

**Interface:** `projectFunctionalDod({ body, head, evaluatedAt }) -> { body, normalization: null | { normalizerId, inputDigest, decisions, decisionDigest, disposition } }`. Each decision has the exact v2 shape `{key,derivationRule,stamp,tick}`. The projected `body` is for evaluation within this invocation, never an executable authorization token. `normalizerId` is `functional-dod-derived/v1`; `disposition` is `persist-on-execute`.

- [ ] **A1 — Write RED projector tests.** Use existing Functional DoD fixtures with all ACs checked, an incomplete AC, marker-present/box-unticked acs and checkboxes, already complete body, and unrelated missing requirements. At fixed HEAD/time compare projected bytes with the current `deriveAndStampFunctionalDod` transform. Assert `decisions.map(({key,derivationRule}) => [key,derivationRule])` is `[['acs','derive-acs/v1'],['checkboxes','derive-checkboxes/v1']]` when both change, while stamped marker `cmd` values remain the legacy derivation strings.
- [ ] **A2 — Run RED.** `node --test scripts/tests/unit/task-tracker/lib/functional-dod-project.test.mjs` must fail for the missing pure export or an expected content mismatch, not fixture syntax.
- [ ] **A3 — Implement the projector.** Parse base `items`, `acsItem`, and `cbItem` once. Keep their original checked/marker flags while deriving acs against `next`, then derive checkboxes against the acs-updated `next`. Emit only actual stamp/tick decisions in that order, using `derivationRule: 'derive-acs/v1'` or `'derive-checkboxes/v1'`. Use the existing `stampEvidenceMarker`, `deriveAcsStatus`, and `deriveCheckboxesStatus` rules; their evidence-marker `cmd` strings stay unchanged. Compute `inputDigest` from normalized observed input; compute `decisionDigest` as the canonical hash of `{normalizerId,decisions}` and no other fields.
- [ ] **A4 — Run GREEN and stability checks.** The same body/head evaluated at two times has equal decisions and `decisionDigest`; applying the projection then projecting again returns `normalization:null`. Changed HEAD still requires fresh evaluation even when intent digest is equal. Run the projector test and affected `functional-dod-derive` tests, then commit with `[#1664]` attribution.

#### Unit B — Ready-only persistence and call-site parity (10 h)

**Files:** Create `scripts/task-tracker/lib/action-decision/normalization.mjs` and `scripts/tests/integration/task-tracker/lib/action-normalization.test.mjs`; modify `scripts/task-tracker/lib/review-derive-rescan.mjs`, `scripts/task-tracker/verbs/promote.mjs`, `scripts/task-tracker/verbs/review.mjs`, and `scripts/task-tracker/verbs/close.mjs` only at their derived-DoD seam; update `scripts/tests/unit/task-tracker/lib/review-derive-rescan.test.mjs` and directly affected verb fixtures.

**Interface:** `persistReadyNormalizations({ decision, refreshAndEvaluate, mutateBody, readBack }) -> { decision, persisted, warnings }`. `refreshAndEvaluate` observes current authority and returns a complete validated decision over the projected body. `mutateBody` is the injected versioned write adapter; the helper, not its caller, passes `evidenceStamp:true`. `readBack` returns current body plus actual execution HEAD/provenance. A blocked or indeterminate refreshed decision performs no write.

- [ ] **B1 — Write RED integration tests.** Exercise ready, blocked, indeterminate, version conflict with changed body, changed HEAD with unchanged intent digest, write failure, readback failure, wrong execution provenance, and later transition failure. Instrument the injected writer in an outer ledger; explanation cannot reach it. Assert a companion write without `evidenceStamp:true` is refused by the existing proof-introduction guard.
- [ ] **B2 — Run RED.** `node --test scripts/tests/integration/task-tracker/lib/action-normalization.test.mjs scripts/tests/unit/task-tracker/lib/review-derive-rescan.test.mjs` must fail for the absent persistence seam or stale fallback, not test setup.
- [ ] **B3 — Implement ready-only persistence.** Under the existing lock, refresh and evaluate all required guards with the projected body. Recompute both projection and complete readiness on each fresh base inside the versioned mutation callback; a blocked/indeterminate retry aborts with no write and no later effect. Project afresh using the execution HEAD/timestamp; never persist explanation-time marker bytes or use explanation timestamps, projected-body byte equality, or an equal intent digest as readback authority. Write with literal `evidenceStamp:true` only after ready. Read back actual stamps/ticks and their execution HEAD/timestamp, then revalidate remaining authority before any subsequent effect. An empty post-write decision set is idempotent success. Emit `normalization-persist-failed`, `normalization-readback-failed`, or `normalization-authority-drift` for the corresponding failure; never return stale body as permission.
- [ ] **B4 — Migrate and verify call sites.** Replace pre-readiness derive/rescan uses in promote/review/close with the shared pure projection plus ready-only execution helper while preserving lock and exit order. Invert `review-derive-rescan`'s failed-refresh fallback test: a failed live read cannot return the caller's stale `scanBody` as authorization. Replace close's derived-DoD catch-and-continue for this pipeline with the named persist/readback/drift refusal, stopping all subsequent effects. Keep unrelated sanctioned stamping paths. Verify truthful `persisted` reporting if a later transition fails, and no unrelated box, approval, or test evidence changes.
- [ ] **B5 — Run GREEN, broad verification, and commit.** Run the root VC5 command, affected verb suites, `npm test`, `npm run test:slow`, `npm run lint`, `npm run format:check`, and `git diff --check`. Commit with `[#1664]` attribution. Obtain independent code review before the governed exact-SHA Test sandbox.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/functional-dod-project.test.mjs scripts/tests/integration/task-tracker/lib/action-normalization.test.mjs scripts/tests/unit/task-tracker/lib/review-derive-rescan.test.mjs
```

**Acceptance:** The three root #1664 criteria remain the sole issue acceptance criteria. Explanation and execution use the same pure ordered projection; explanation discloses `persist-on-execute` pending writes without performing them. Conflict and readback failures stop effects; intent identity excludes timestamps and rendered bytes while actual execution provenance is checked.
