<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-9ddf3402cca15836099b1605404469d7"
role: "reviewer"
turn: 3
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-11-05-2153-current-plan-approval.md"
artifact_commit: "8a844dc26fc76b24f87ab532e9664574c8c67f22"
artifact_blob: "ee90a9f94167d5001fe44e3808ae68ad4b823288"
artifact_digest: "sha256:261446144953460c6cd237170f229b7688039f3dbde993f93a9b29eca3964d1a"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:8e885e611129d4b258f33753eb3a968c9f46761f665119ec7a841d482a683b39"
  identity_source: "runtime"
started_at: "2026-11-05T07:06:50.811Z"
submitted_at: "2026-11-05T07:13:49.613Z"
finding_ids: ["R3-F001","R3-F002","R3-F003","R3-F004"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Reviewed the plan (blob `ee90a9f9`) against the accepted spec, which carries the normative dispatch and convergence section accepted at turn 2, and against the baseline code. All named files to modify or extend exist: `review-gate.mjs`, `review-agent-validation.mjs`, `required-comments.test.mjs`, `plan-approve.test.mjs`, `plan-approve-core.test.mjs` and `plan-transition-authority.test.mjs`. The integration directory already holds `*.test.mjs` files without the `.integration` infix, so the proposed new file name is consistent. The two-task split, the Task 1 interfaces (`evaluateCurrentScopeAdmission`, the closed record, the marker field, `currentEvidence` mutually exclusive with `repairEvidence`) and the Review Focus items line up with the spec. Estimate and sequencing are reasonable.

The plan does not carry forward several obligations the spec made normative in its "Normative dispatch and convergence requirements" section. These are exactly the items accepted as the resolution of R1-F001 to R1-F004. One of them (the status name) directly contradicts the spec. Because the plan is the implementer's checklist, the omitted items are likely to be skipped.

## Findings

### R3-F001 — Required: Task 2 drops the strict-parser contract and contradicts the spec's status names

Severity: P2. Spec lines 101-103 require:

- the whole verb to reject unknown flags (including `--current-scop`), duplicate flags, duplicate issue arguments, and `--current-scope` with `--repair-from-evidence`, using usage exit 2 before plan-approve reads or writes;
- dispatch before `automaticModernEligible`, waived reconstruction and the Plan-only wrong-state precheck;
- tests that spy on `evaluateModernPlanTransitionEvidence` and the waived-reconstruction ports and prove neither is called for a `not-required` candidate;
- stable outcomes `approved-current-scope`/0, `already-approved-current-scope`/0 and `current-scope-refused`/15, with post-write validation or readback failure never returning 0.

Task 2 says only "reject both true", "flag conflicts" and "Wire current admission before ordinary/repair route selection". Its Interfaces bullet names the idempotent outcome `already-approved`, which is the existing ordinary-route status handled at `plan-approve.mjs:790` and in `formatPlanApproveOutcome`, and it promises only "a nonzero exit" for refusal. Reusing `already-approved` merges the two lanes in CLI output and in any status-based caller, which the spec's distinct status was meant to prevent.

### R3-F002 — Required: the integration and consumer steps omit the resident-Review convergence and audit-form negatives

Severity: P2. Spec line 105 requires both consumers (resident pass reuse and required-comments) to prove two negatives:

- an ordinary or waiver audit at the same timestamp does not satisfy a digest-bearing marker;
- a current-form audit does not satisfy a digestless marker.

The current matcher (`required-comments.mjs:64-71`) accepts any canonical audit at the marker `ts`, so the first negative is the real regression risk. Task 2's consumer step tests post-write drift and "legacy behavior unchanged" but neither negative.

Spec line 107 requires the public integration test to run the actual resident Review path, including pass reuse, required-comments and body normalization. It must succeed directly or after at most one same-source re-approval, keep scope identity stable on the second pass, and treat a non-converging cycle as failure. Any normalization fix beyond a bounded sequencing correction goes back to review. Task 2's integration step asserts only "approval/audit success and unchanged source, visits and Test evidence"; it never runs Review. This was the central reason for R1-F002 and is the property the #2147 activation depends on.

### R3-F003 — Required: the trunk-provenance and pinned #2147 fixture tests are missing

Severity: P3. Spec line 109 says trunk SHA is approval-time provenance and requires two tests: a producer retry after live-trunk movement yields a new digest and timestamp at the same HEAD, and Review accepts without requiring live trunk to stay fixed. Task 2 lists "trunk" only among fresh-base races, which is a different case from the retry rule and the Review-side rule. Spec line 111 requires a fixture pinning the real #2147 comments (authority 6620373277 with `createdAt == updatedAt == 2026-11-04T01:51:50Z`; completion 6620377056 at `2026-11-04T01:52:06Z`) plus a changed-`updatedAt` refusal. Task 1 has only generic "altered timestamps" cases. Without the pinned pair, nothing proves the admission reader accepts the incident it exists to unblock.

### R3-F004 — Optional: add the new test files to the verification commands for every touched suite

Severity: P3. Task 2's verification commands omit the resident Review and review-context tests it says to extend, and the existing marker and audit unit suites that Task 1 modifies. List them explicitly, so the Develop-phase targeted run and the reviewer's exact-head check cover every changed consumer.

## Required changes

1. (R3-F001) In Task 2, add explicit steps and tests for:
   - strict whole-verb parsing, with usage exit 2 before plan-approve reads or writes, for unknown, typo, duplicate and conflicting flags and duplicate issue arguments;
   - dispatch ordering before `automaticModernEligible`, waived reconstruction and the wrong-state precheck;
   - spies proving `evaluateModernPlanTransitionEvidence` and waived reconstruction are never called on the current lane.

   Rename the idempotent outcome to `already-approved-current-scope`, and specify the exit codes 0/0/15 together with the rule that a post-write failure never exits 0.
2. (R3-F002) In Task 2:
   - add the two audit-form negatives to both the resident pass-reuse and required-comments test steps;
   - extend the integration step to run the real resident Review path (pass reuse, required-comments, normalization) after final Test stamping, asserting success directly or after at most one same-source re-approval, with stable scope identity on the second pass;
   - add the spec's stop condition: a broader normalization change returns to review.
3. (R3-F003) Add the trunk retry test (same HEAD, moved trunk, new digest and timestamp) and the Review-side test that trunk is not required to be live. In Task 1, add the pinned #2147 comment-pair fixture and its changed-`updatedAt` refusal.

## Optional suggestions

1. (R3-F004) Expand the verification command blocks to name every extended test file: marker and audit suites, resident Review, review-context, and required-comments.

## Decision

revisions-requested
