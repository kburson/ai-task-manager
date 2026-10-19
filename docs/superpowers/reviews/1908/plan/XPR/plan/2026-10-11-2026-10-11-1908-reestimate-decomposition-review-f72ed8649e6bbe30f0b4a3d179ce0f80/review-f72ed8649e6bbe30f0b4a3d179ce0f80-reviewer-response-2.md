<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-f72ed8649e6bbe30f0b4a3d179ce0f80"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-10-11-1908-reestimate-decomposition.md"
artifact_commit: "0fa38c7c17a8705b137a959b5ca2321556af1854"
artifact_blob: "0067d080abebbc9ced6f1907e1008210f1c9f890"
artifact_digest: "sha256:80974708da66e471a11ba16888b159c417c4076ceac48aa58fbb5512fb221ff5"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:988367240c76a33f0b2d1184b0071fc99132abcbbb7a5499d433590d5a3b6525"
  identity_source: "runtime"
started_at: "2026-10-11T15:23:06.515Z"
submitted_at: "2026-10-11T15:38:51.556Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I re-reviewed the revised plan (`0fa38c7c`) against my turn-1 findings, the author's response, the accepted spec and the source. All eight turn-1 required changes are substantively addressed:

1. **Addenda folded into task sections.** Each `### Task N` section now carries a bound-scope subsection that names the owned files, steps, `Run:` verifiers and root-section citations. Those citations are bound into scope identity. The author reports that production `buildSplitProposals` renders seven valid children. This matches how `extractPlanTasks` bounds sections (`decomposition-policy.mjs:83-85`), because the new `####` subsections stay inside each task.
2. **Epic readiness.** The plan adds a closed `epicReadiness` observation and a six-row status→capability table with pending precedence. Planning-ready and completion-ready are separate boundaries. Readiness is collected through the existing `evaluateMaterializedWbsReadiness`, which I confirmed exists (`scripts/task-tracker/lib/decomposition-delivery-readiness.mjs:141`).
3. **Marker protection.** Both decomposition markers are `kind: 'advance'`, protected by a private branded capability. Name-only `allowMarkerAdvance` cannot authorize, the check still runs under `allowMarkerLoss`, and forged-advance, deletion and name-only tests are assigned. This fits the existing `validateMarkerAdvances` seam (`body-invariants.mjs:309-326`, `issue-body-mutate.mjs:124-128`).
4. **`decompose-check`.** Task 6 now owns it. Its existing coverage is in `decomposition-plan-exit-gate.test.mjs`, which is already in Task 6's `Run:` line. `coverage-promote.test.mjs` was also added.
5. **Shared inventories.** Tasks 5 and 6 are serialized and each wave owns the inventories. The lint gates and `action-parity` now appear in the owning tasks' verifiers.
6. **Hook freshness.** The hook-freshness budget is pinned: one combined snapshot, 5s/6s deadlines, two continuation pages, no retries, typed `indeterminate` on failure, and no admission cache.
7. **Census.** The census now spans all of `scripts/` and classifies both `scripts/migrate/` callers.
8. **Sizes.** The size labels and the 52h total are corrected.

The optional suggestions were also adopted.

Two new issues remain. One was exposed by the now-explicit capability table; the other is a verifier gap in the marker-protection change.

## Findings

1. **Revising Scope/AC is restricted as a "scoped-deliverable", which blocks the spec's own recovery lane and ordinary epic refinement.** The "Remote no-commit effects and completion boundary" section, which Task 5 cites as scope, says governed body operations must "identify substantive Scope/AC/deliverable changes and new deliverable/completion evidence". It says unknown purposes are "restricted scoped-deliverable", and the recovery exemption covers only package-owned history/checkpoint and registered estimate publication. The new capability table withholds scoped-deliverable from `must-decompose`, `pending` and `indeterminate`. It also withholds it from `epic-readiness-required` until `completion` is true. Two consequences follow:
   - (a) A `must-decompose` story cannot narrow its own Scope/AC through `npx aitm issue-body`. Yet the spec's recovery is "genuine scope/estimate revision uses existing commands" (spec §Waivers) and allows "regular spec/decomposition Markdown" (spec §Continuation). Scope revision is planning, not delivery. It also cannot be used as a bypass: it changes `scopeDigest`, which forces reassessment, and an estimate of 24 or more keeps the flag until a truthful re-estimate is published.
   - (b) Every epic, converted or pre-existing, gets `epic-readiness-required`, and `completion` is false until its children are terminal. As written, ordinary epic Refine/Plan edits to the epic's own Scope/AC/WBS are denied. Spec line 208 says existing epics "retain their ordinary readiness behavior rather than acquiring a new aggregate-size violation". This would be a new restriction on every epic in the repository, and on #1908 itself during its remaining Plan work.

2. **Task 2 modifies `body-invariants.mjs` and `issue-body-mutate.mjs`, which every body writer depends on, but its verifiers skip their existing suites.** Task 2's bound scope says "Extend body-invariants.test.mjs", but its only `Run:` line is `decomposition-authority.test.mjs decomposition-projection.test.mjs`. Changing the signatures of `validateMarkerAdvances`/`validateAdvance` and of the `mutateIssueBody` forwarding path affects the existing advance consumer, `resident-action-ledger-write.mjs:188` (`allowMarkerAdvance: ['aitm-resident-action-ledger-head']`). Its tests live in `scripts/tests/unit/task-tracker/lib/body-invariants.test.mjs:73-174` and `state-action-resume.test.mjs:159`. The general mutation contract is covered by `mutate-issue-body.test.mjs` and `mutate-issue-body-marker-loss.test.mjs`. None of these is in the child's `Run:` lines. `verify-develop` runs only test files changed vs HEAD, so a regression in the untouched ledger or marker-loss suites would first surface at Test.

## Required changes

1. In "Remote no-commit effects and completion boundary" and Task 5's bound scope, separate scope revision from deliverable/completion evidence:
   - Governed edits to the issue's own User Story/Scope/AC/Plan Metadata/WBS are a scope-revision lane. They are permitted under `decomposition-prepare` (or ordinary lifecycle gates) for every status, and they always trigger reassessment through the changed `scopeDigest`.
   - Only new deliverable content and completion evidence require scoped-deliverable or scoped-completion.

   Add Task 5 admission fixtures for each of these:
   - a `must-decompose` story narrowing its Scope/AC through `issue-body`: allowed, reassessed, still `must-decompose` while the estimate is 24 or more;
   - an epic in Refine/Plan with `planning=false` editing its Scope/AC: allowed;
   - a `must-decompose` audit/research issue posting a new deliverable: refused.
2. Add the existing marker-contract suites to Task 2's `Run:` lines: `scripts/tests/unit/task-tracker/lib/body-invariants.test.mjs`, `mutate-issue-body.test.mjs`, `mutate-issue-body-marker-loss.test.mjs` and `state-action-resume.test.mjs`. Also list `lib/issue-body-mutate.mjs` in Task 2's Files line, so the child file set and the bound-scope prose agree.

## Optional suggestions

1. The `epic-readiness-required` row says `planning` true "permits parent orchestration/Develop preparation", but the closed capability vocabulary (inspect/checkpoint/decomposition-prepare/governed-decomposition/scoped-implementation/scoped-deliverable/scoped-completion) has no matching name. State that Plan-exit/Develop entry reads `epicReadiness.planning` directly, or add a named capability, so Tasks 1 and 6 don't each invent one.
2. Task 7 now has eight `Run:` commands, and `split-plan` assigns child `vc:1…8` by position. "The three original Run commands … are exactly parent vc:1, vc:2 and vc:3" is accurate, but those are the child's `vc:6–8`. Saying so explicitly would prevent mis-citation during hydration.

## Decision

revisions-requested
