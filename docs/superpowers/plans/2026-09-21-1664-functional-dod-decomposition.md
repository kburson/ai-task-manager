# #1664 Functional DoD Decomposition Plan

This is the Plan-exit decomposition of the approved issue-local [#1664 implementation plan](2026-09-21-1664-functional-dod-projection.md). The converged human forecast is 24.5h/XL, so accepted #1558 WBS Task 12's 24h split threshold applies. These two serial children preserve the approved scope, three acceptance criteria, closed v2 decision contract, and root verification. No downstream action adapter or explanation command is introduced.

## Story Intent

- **Beneficiary:** lifecycle executor
- **Capability:** inspect derived Functional DoD without writing and persist it only after current readiness is established
- **Need:** the current derive-and-rescan path can write before complete readiness and reuse stale data after failed refresh
- **Value or failure prevented:** explanation remains read-only and failed or drifted normalization cannot authorize progression

## Implementation Tasks

### Task 1: Project Functional DoD as pure ordered intent

#### Story Intent

- **Beneficiary:** lifecycle executor
- **Capability:** inspect the same ordered derived Functional DoD changes that execution would consider without performing writes
- **Need:** the current derivation is embedded in an effectful body mutation and cannot safely serve explanation
- **Value or failure prevented:** explanation can disclose pending normalization while remaining read-only

#### Scope

Create `scripts/task-tracker/lib/functional-dod-project.mjs` and `scripts/tests/unit/task-tracker/lib/functional-dod-project.test.mjs`. Refactor `scripts/task-tracker/lib/functional-dod-derive.mjs` only enough to share the pure transform while retaining its sanctioned legacy writer until Task 2 migrates call sites.

Use real DoD fixtures. Parse base items and derived keys once; retain base checked/evidence flags while applying acs and then checkboxes against progressively updated next body. Preserve existing evidence-marker `cmd` values, but emit only changed v2 `{key,derivationRule,stamp,tick}` decisions using `derive-acs/v1` and `derive-checkboxes/v1`. Return the projected body and `functional-dod-derived/v1` normalization intent. Hash observed normalized input separately; hash canonical `{normalizerId,decisions}` for decision identity, excluding timestamps and rendered marker bytes. Fixed-time output must match the legacy transform byte-for-byte. Same input at two times has equal intent; projecting the result again is idempotent. A changed HEAD requires a fresh projection even with equal intent digest.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/functional-dod-project.test.mjs scripts/tests/unit/task-tracker/lib/review-derived-dod.test.mjs
```

### Task 2: Persist Functional DoD only after current readiness

#### Story Intent

- **Beneficiary:** lifecycle executor
- **Capability:** persist pending Functional DoD normalization only after fresh complete readiness and verified readback
- **Need:** pre-readiness writes, versioned retries, and stale refresh fallback can otherwise authorize a later effect from obsolete evidence
- **Value or failure prevented:** failed writes, drifted authority, and failed readback stop progression without hiding normalization that already persisted

#### Scope

Depends on Task 1 and begins only after its integration into #1664. Create `scripts/task-tracker/lib/action-decision/normalization.mjs` and `scripts/tests/integration/task-tracker/lib/action-normalization.test.mjs`. Migrate only derived-DoD seams in `scripts/task-tracker/lib/review-derive-rescan.mjs`, `scripts/task-tracker/verbs/promote.mjs`, `scripts/task-tracker/verbs/review.mjs`, and `scripts/task-tracker/verbs/close.mjs`; update the review-rescan and directly affected verb tests. Keep independent sanctioned stamping callers intact.

RED tests cover ready, blocked, indeterminate, version conflict, changed HEAD with equal intent digest, failed write/readback, wrong execution provenance, and a later failed transition. Under the existing lock, refresh complete authority against the pure projection. The versioned write callback recomputes projection and readiness on every fresh base with current execution HEAD/time; blocked or indeterminate retry aborts before any write or later effect. Only the helper supplies literal `evidenceStamp: true`; prove the same proof-introducing write without it is refused. Explanation receives no writer. Read back actual stamps, ticks, HEAD, and timestamp and revalidate remaining authority. No explanation-time body or marker bytes are executable authority. Empty post-write decisions are idempotent. Replace failed-refresh stale-body fallback and close catch-and-continue with `normalization-persist-failed`, `normalization-readback-failed`, or `normalization-authority-drift` refusal. Preserve truthful reporting when normalization persisted but a later transition failed.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/functional-dod-project.test.mjs scripts/tests/integration/task-tracker/lib/action-normalization.test.mjs scripts/tests/unit/task-tracker/lib/review-derive-rescan.test.mjs
```

Both children also run the standard `npm test`, `npm run test:slow`, `npm run lint`, and `npm run format:check` gates before merge. Merge Task 1 into the nested #1664 epic before starting Task 2; close #1664 and merge it into #1558 only after both children are Done and aggregate acceptance is verified.
