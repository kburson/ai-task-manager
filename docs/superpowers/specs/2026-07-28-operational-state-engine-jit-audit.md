# Operational State-Engine JIT Audit

- **Story:** #1006
- **Parent:** #1005
- **Entry tree:** `5add5b0`
- **Post-defect tree:** `d4317d2`
- **Entry milestone:** #1012 Closed/Done; policy-convergence and repository
  suites passed on the post-#1036 tree.

## Contract

This audit covers operational mechanisms after policy convergence. It does not
reopen lifecycle, timing-event, or command-surface policy ownership. A required
grandchild needs a concrete duplicated decision or dependency inversion, a
narrow expected owner, and existing regression evidence. Correctness defects
block #1006 and are driven to Done before refactor grandchildren continue.
Optional cleanup is independent Backlog work and cannot hold #1005 open.

## Current Policy Queries

- Lifecycle identities, executable edges, history projections, and action
  eligibility come from `scripts/task-tracker/lib/lifecycle-policy/`.
- Timing vocabulary and accounting classification come from
  `scripts/task-tracker/lib/timing-events/`.
- Functional evidence declarations and execution proofs come from
  `proof-marker.mjs`, `functional-dod-evidence.mjs`, and
  `evidence-markers.mjs`.
- Issue kind comes from the progress-scoped queries in `issue-kind.mjs`.
- Trunk identity comes from `trunk-ref.mjs`; the worktree close lane injects
  the explicit remote-trunk policy from `full-auto-merge.mjs`.
- Epic-child state and close disposition come from the normalized descriptors
  returned by `wave-admission.mjs`.
- Agent review execution comes from the validator registry and
  `review-gate.mjs`.

## Evidence Disposition Matrix

| Input | Audit area                     | Concrete modules and coupling path                                                                                                                                       | Current owner or query                                                                | Regression evidence                                                                      | Disposition                                           |
| ----- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| #819  | Lifecycle DoD migration        | `heal-lifecycle-dod.mjs` CLI delegates to `lib/heal-lifecycle-dod.mjs`, which consumes canonical labels from `lifecycle-dod.mjs`                                         | `LIFECYCLE_LABELS`, `LIFECYCLE_LABEL_ALIASES`, and the pure healer                    | `heal-lifecycle-dod.test.mjs`                                                            | Already clean                                         |
| #899  | Issue-kind body migration      | `verbs/kind.mjs` writes the kind marker, filters the template, and reconciles the live Functional section                                                                | `parseIssueKind`, `reconcileDodForKind`, `locateFunctionalSection`                    | `dod-kind-heal.test.mjs`, `kind-aware-dod.test.mjs`                                      | Already clean                                         |
| #902  | DoD verifier reconciliation    | `dod-stamp.mjs` runs declared commands and delegates the atomic proof-plus-VC update to `functional-dod-evidence.mjs`                                                    | `stampEvidenceAndReconcile` and `insertVerificationCommands`                          | `dod-stamp-vc-reconcile.test.mjs`                                                        | Already clean                                         |
| #921  | Epic fan-out mutation          | `create-issue.mjs` invokes the pure duplicate classifier before GitHub creation; the guard owns title normalization and sibling similarity only                          | `evaluateDuplicateChild`, `defaultFetchOpenChildren`                                  | `duplicate-child-guard.test.mjs`                                                         | Already clean                                         |
| #927  | Trunk-reference resolution     | Close gates, epic branch tools, sync, and merge-back resolve after a best-effort fetch through one module                                                                | `resolveTrunkRef`, `resolveTrunkRefSync`, `fetchTrunk`                                | `trunk-ref.test.mjs`, `trunk-ref.integration.test.mjs`, `commits-on-trunk-gate.test.mjs` | Already clean                                         |
| #932  | Demotion proof cleanup         | `demote.mjs` moves the board before its body mutation; if that mutation fails, `reconcile accept-live` must finish the interrupted proof invalidation                    | `invalidateEvidence` is shared by demote and its narrow accept-live recovery          | `verbs/demote.test.mjs`; `tests/unit/verbs/reconcile-verb.test.mjs`                      | Blocking defect resolved by #1037                     |
| #947  | Closed-child reconciliation    | `wave-admission.mjs` converts GitHub-closed children to operational `done` once; epic admission and close guards consume the normalized descriptor                       | `mapSubIssueNodes`, `defaultFetchSiblings`                                            | `wave-admission.test.mjs`, `epic-children-gate-core.test.mjs`                            | Already clean                                         |
| #952  | Test verifier migration        | `verbs/test.mjs` performs one pre-sandbox migration through the lane-split helper, then parses the live Verification Commands again                                      | `migrateTestsLaneSplit`                                                               | `test-verb-lane-split-migration.test.mjs`                                                | Already clean                                         |
| #953  | Issue-kind parser boundary     | Superseded by #963; the old unanchored-body approach is no longer the production read path                                                                               | Progress-scoped `parseIssueKind`                                                      | `issue-kind.test.mjs`                                                                    | Already clean, superseded                             |
| #963  | Issue-kind section parser      | `issue-kind.mjs` isolates `## AITM Progress Markers` before parsing kind and delivery markers; all kind consumers delegate to it                                         | `progressMarkersSection`, `parseIssueKind`, `isNoCommitKind`, `isTestlessKind`        | `issue-kind.test.mjs`, `audit-lane-e2e-494.test.mjs`                                     | Already clean                                         |
| #968  | Review-to-Done trunk read      | Move-state guard execution detects a linked worktree and injects the pure close-lane remote-trunk resolver into close gates                                              | `resolveCloseTrunkRef`, `makeCloseTrunkRefResolver`                                   | `move-state-worktree-trunk-ref.test.mjs`                                                 | Already clean                                         |
| #972  | Timing-writer sequencing       | The writer asks `bind-event.mjs` whether an interruption is open and uses timing-event policy for departure classification; Markdown row lexical reads remain duplicated | `lastOpenInterruption`, `classifyTimingEvent`, and the timing-event emission query    | `timing-departure-guard.test.mjs`                                                        | Targeted refactor: shared timing-row reader           |
| #981  | Interrupted-session timing     | Resume/bind resolution, writer suppression, and Agent Review all parse the same Timing Log rows; event policy is shared but row extraction is not                        | `resolveBindEvent`, `detectUnmarkedDepartureGap`, timing-event queries                | `bind-event.test.mjs`, `gh-timing-comment.test.mjs`, `timing-log-sequence.test.mjs`      | Targeted refactor: shared timing-row reader           |
| #983  | Terminated-agent recovery      | `hook-handler.mjs` imports the suspicious-gap threshold through an Agent Review validator even though the validator re-exports it from the lower-level bind module       | `SUSPICIOUS_GAP_SEC` currently owned by `bind-event.mjs`                              | `hook-session-start.test.mjs`, `timing-log-sequence.test.mjs`                            | Targeted refactor: recovery-policy dependency         |
| #984  | Agent-review forensics         | Body and Timing Log forensic checks are registered pure validators; the review orchestrator only supplies context and aggregates results                                 | validator `registry.runAll`, `body-sections.validate`, `timing-log-sequence.validate` | `body-sections.test.mjs`, `timing-log-sequence.test.mjs`                                 | Already clean                                         |
| #994  | Marker normalization           | V6 must preserve review-failure blocks but independently scans the same start/end delimiters owned by `review-gate.mjs`                                                  | No shared block-boundary query exists                                                 | `v6-marker-organization.test.mjs`                                                        | Targeted refactor: shared review-failure block parser |
| #1003 | Timing-log healing             | The healer correctly owns historical rewrite policy, but it carries another Markdown Timing Log event/timestamp reader beside writer, bind, and validator readers        | `healTimingLog` plus timing-event accounting queries                                  | `heal-timing-log.test.mjs`                                                               | Targeted refactor: shared timing-row reader           |
| #1004 | Review-failure parser boundary | `review-gate.mjs` line-anchors failure-block detection, while V6 duplicates equivalent delimiter regexes to keep the same block opaque                                   | `stampReviewFailed`, `clearReviewFailed`, `hasReviewFailed`                           | `review-gate.test.mjs`                                                                   | Targeted refactor: shared review-failure block parser |

## Required Findings

### D1 — Demotion recovery can preserve stale verification proof

`demote.mjs` commits the board transition before the body write that both
records Develop and calls `invalidateEvidence`. A crash or GitHub write failure
between those steps leaves a live-board/recorded-body drift. The prescribed
`reconcile accept-live` path rewrites last-known and entry markers but initializes
`stripped` to an empty array and never calls `invalidateEvidence`. It can
therefore certify live Develop while stale AC, Verification Command, Functional
DoD, and Agent Review proof remains in the issue body.

Required defect outcome: the supported accept-live recovery path must apply the
same idempotent proof invalidation when reconciliation moves the recorded state
backward to Develop, report what it stripped, and preserve proof on unrelated
forward/external reconciliations.

Resolution: #1037 is Closed/Done and squash-integrated at `d4317d2` on both
`trunk` and `feature/epic/1005`. Its focused reconcile and ordinary demote
regressions cover both Test/Review-to-Develop recovery sources plus
proof-preserving forward and unrelated reconciliation shapes. This cleared the
blocker on #1006.

### R1 — Shared Timing Log row reader

Production row parsing is repeated in `gh-timing-comment.mjs`,
`bind-event.mjs`, `agent-review/validators/timing-log-sequence.mjs`, and
`heal-timing-log.mjs`. The modules share timing-event policy but independently
split Markdown cells, read event slugs, and parse timestamps. Issues `#972`,
`#981`, and `#1003` show that writer, recovery, validation, and healing must
agree.

Expected owner: a new dependency-light lexical row-reader module below the
existing policy-aware `lib/timing-rows.mjs`. The existing module and the writer,
bind resolver, validator, and healer consume the lexical reader while retaining
their distinct arithmetic, sequence, emission, and healing decisions.

### R2 — Recovery-gap policy dependency direction

`hook-handler.mjs` imports `SUSPICIOUS_GAP_SEC` from an Agent Review validator.
That validator immediately imports and re-exports the constant from
`bind-event.mjs`. The runtime hook therefore depends upward on a review adapter
for a leaf timing-recovery policy it already owns indirectly.

Expected owner: the operational bind/recovery leaf. The hook and validator
consume it directly; no threshold or recovery behavior changes.

### R3 — Shared review-failure block boundary parser

`review-gate.mjs` and `v6-marker-organization.mjs` each define line-anchored
start/end delimiter regexes and scanning loops for the opaque
`aitm-review-failed` block. #994 and #1004 demonstrate that normalization and
gate mutation fail together when those boundaries drift.

Expected owner: a dependency-light marker-block helper consumed by both the
review gate and V6 normalizer. Review-failure content, formatting, and lifecycle
semantics remain owned by `review-gate.mjs`.

## Other Audit Areas

State-move orchestration is already split into transition planning, guard
execution, mutation, reconciliation, and post-commit stages. These mechanisms
consume lifecycle queries instead of owning topology. Guard bootstrap registers
state-owned guards once, and the registry evaluates them without embedding
transition tables. Epic fan-out, closed-child normalization, trunk reads,
issue-kind migration, DoD proof invalidation, and Test migration each have a
single current owner and focused regression coverage.

## Defects and Optional Cleanup

- Blocking correctness defects: D1 was resolved and closed by #1037 at
  `d4317d2`; no blocking correctness defect remains open.
- Optional cleanup: none required. Large operational files alone are not a
  finding without duplicated decisions or an inverted dependency.

## Delivery Order

1. Resolve D1 before starting any refactor grandchild — completed by #1037 at
   `d4317d2`.
2. Extract the shared Timing Log row reader.
3. Repair the recovery-gap dependency direction after the timing reader settles.
4. Extract the shared review-failure block boundary parser.
5. Re-run the #1006 audit verifier and all focused child regressions.

Each required finding becomes a sequential #1006 grandchild with this document
and `docs/superpowers/plans/2026-07-27-state-engine-refactoring-epic.md` as
immutable provenance.
