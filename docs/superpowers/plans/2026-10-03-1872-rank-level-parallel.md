# Issue #1872 Authorized Rank-Level Admission Implementation Plan

> Implement inline in the owned linked worktree. No additional workers or consumer changes in this source stage.

**Goal:** Admit authentic authorized equal-rank epic stories while every lower rank has strictly completed Done, preserving sequential compatibility and child-specific delivery gates.

**Architecture:** A separate immutable rank-wave authority and body publication pointer feed one pure fail-closed policy. A clone-wide parent admission lock serializes authority and lifecycle mutations before existing child locks. Existing host-backed authorization provenance verifies bounded exact source context; execution binding remains phase-aware.

**Baseline:** `171c7d93866f67b58effa635be5ae737f54ef9eb`.

**Accepted design:** `docs/superpowers/specs/2026-10-03-1872-rank-level-parallel-design.md`, SHA256 `3ad25cfed0936e0c66326ab96a35a9f541063c8951f44ebe261b679ea7e4635a`. Root accepted this exact draft after story_145's independent read-only check reported no remaining actionable findings. These are actual design reviews, not implementation approval or delivery evidence.

**Stack:** Node ESM, node:test, existing GitHub body transactions and authorization source validators.

## Scope

Implement the shared authorized rank-wave admission, provenance, isolation, publication recovery and serialization described in the exact accepted design. Native hook repair and reviewer protocol changes remain separate. Consumer installation follows reviewed source delivery through its owning issue.

## Plan Metadata

- Priority: P0
- Size: L
- Estimate: 16 hours
- Labels: Existing issue labels remain authoritative.

## Story Intent

- **Beneficiary:** Epic orchestrators delivering independent stories.
- **Capability:** Run an explicitly authorized rank level in isolated child worktrees while enforcing every lower-rank completion barrier.
- **Need:** The installed sequential WIP gate refuses a second same-rank child even when the maintainer explicitly authorized independent parallel delivery.
- **Value or failure prevented:** Reduce delivery time without admitting unfinished dependencies, sharing authority identities, or weakening review and verification.

## Required pre-implementation evidence

1. Publish this plan and accepted design dispositions through governed issue-body operations.
2. Post the source-grounded deep dive as an actual issue comment, mirror it through the registered action, and complete it through the sanctioned deep-dive resource.
3. Finish Refine with the registered Refine action, preserving L/16h/P0/rank 1 unless detailed estimation warrants revision. Enter Plan through its registered action.
4. Create authentic detailed Plan estimation input and AI forecast through `plan-estimate`. Assess story intent against all seven semantic questions. Obtain actual plan review and execute `plan-approve` with existing authority; never fabricate reviewer provenance.
5. Fresh Explain and registered Promote must permit Plan to Develop before source edits.

## Task 1: Characterize strict rank policy with failing tests

Files:

- Create `scripts/tests/unit/task-tracker/lib/epic-rank-wave-policy.test.mjs`.
- Modify `scripts/tests/unit/task-tracker/lib/epic-r4p-orchestration.test.mjs` and `epic-children-gate-blocked.test.mjs` for public admission seams.
- Create `scripts/task-tracker/lib/epic-rank-wave-policy.mjs` only after the regression fails for the intended missing behavior.

Write table-driven cases for every lower board state, CLOSED/NOT_PLANNED, CLOSED with board Review, unknown disposition, pending recovery and missing observations. Prove strict COMPLETED+CLOSED+actual Done success separately. Exercise all target ranks in an opted-in epic, including a rank without a concurrency grant and lower Backlog/R4P. Preserve existing sequential fixtures verbatim and verify no authority retains current budget and ordering.

Implement the pure evaluator returning stable typed codes, blockers and remediation. Freeze graph IDs/ranks/sorted blocker IDs/validated refinement identity while excluding lifecycle progress. Reject duplicate children, partial membership, unreadable graph and changed refinement/dependency data. Tests assert behavior, not a mirror of internal branches.

Run the new unit file red, implement the smallest evaluator, then run it green and the existing focused vc:1 suite.

## Task 2: Immutable authority and bounded human scope

Files:

- Create `scripts/task-tracker/lib/epic-rank-wave-authority.mjs`.
- Create `scripts/task-tracker/lib/epic-rank-wave-source.mjs`.
- Create corresponding unit tests under `scripts/tests/unit/task-tracker/lib/`.
- Reuse the current authorization source and workflow-exception authority modules; discover their exact exported production seams before edits.

Start with failing envelope/revision tests: complete scope, exact proposal digest, expiry boundary, explicit non-expiring record, latest revision revoked/expired with no older resurrection, duplicate ID with conflicting bytes and unreadable newer revision. Implement closed record schema and deterministic canonical digest.

Then write source tests using the existing host-backed loader: genuine direct full scope; ordered exact prior human scope plus clarification; labeled acceptance of an exact displayed proposal; unambiguous yes; verified host repository/epic linkage. Reject missing exact hashes, unrelated broad intent, agent relay, ambiguous alternatives, quoted injection, reordered messages, over-eight context and contradictory later human scope. Retain exact referenced messages and source hashes; no new permission phrase is imposed on existing authentic authorization.

Run new tests red/green and existing provenance validator tests to preserve compatibility.

## Task 3: Physical isolation and phase-aware binding

Files:

- Create `scripts/task-tracker/lib/epic-rank-wave-bindings.mjs` and unit tests.
- Reuse `occupancy.mjs`, native active binding state, and `issue-worktree-location.mjs` observations; location sid alone is never proof.

Fail first on shared physical roots, symlink aliases, detached/same branches, foreign clone, shared implementation sessions, parent implementation identity and generation mismatch. Verify Git common directory and real physical paths using sanitized discovery. Freeze authenticated physical lineage for all members.

Add end-to-end observation fixtures: R4P target and Plan/Develop require genuine current child occupancy; Test/Review permits only existing sanctioned parent orchestration handoff; strictly completed peer keeps authenticated lineage without live occupancy. A peer completing and releasing its worker must not deadlock a later member. Refresh requires exact prior digest, one changed generation and positive old-claim discharge, with unchanged physical scope. Reject overlap or silently substituted generations.

Run unit tests red/green and existing occupancy/location suites.

## Task 4: One physical parent admission lock

Files:

- Create `scripts/task-tracker/lib/epic-admission-lock.mjs` and focused unit tests.
- Create `scripts/tests/integration/task-tracker/lib/epic-rank-wave-lock.test.mjs` using repository-owned scratch helpers.

Create a real temporary Git repository with two linked worktrees and independent child branches. Prove both resolve the same physical common-directory lock and concurrent callbacks serialize. Test genuine competing processes, bounded timeout, refusal on unknown owner, and no forced eviction of a live lock. Explicit lock context allows nested calls without re-acquisition but cannot authorize another invocation.

Implement parent-before-child ordering. Keep worktree-local issue locks separate. Add a race test where revoke/record competes with Plan-to-Develop and the winning later action re-reads current authority. Run this integration red/green before lifecycle integration.

## Task 5: Registered publication, resume and refresh

Files:

- Create `scripts/task-tracker/lib/epic-rank-wave-store.mjs`.
- Create `scripts/task-tracker/verbs/epic-wave.mjs`.
- Modify canonical command routing/catalog/entrypoints, task dispatch and `verbs/help-data.mjs`.
- Extend only the registered action's scoped protected body-marker transaction and `epic-orchestration-plan.mjs` schema-2 reading.
- Create `scripts/tests/integration/task-tracker/lib/epic-rank-wave-recovery.test.mjs` and verb unit tests.

Implement prepare/show read-only first. Record/revoke/refresh/resume require genuine parent orchestration authority and the common lock. Record appends one immutable authentic GitHub comment, reconciles its exact schema-2 body pointer and verifies read-back. Existing schema-1 accepted documents remain immutable; only the current governed parent contract is reconciled.

Write failure-injection tests before mutations: comment succeeds/body fails; body succeeds/read-back fails; comment outcome unknown; exact same-operation resume; repeated resume is idempotent; graph drift, newer revocation, expiry, tamper and changed body contract refuse. Resume uses the exact already-existing comment/record/source and cannot post another authorization or invent a new ID. Unknown write outcome remains indeterminate under the original operation ID.

Test all verbs' help/routing and role checks, malformed input, current actor/session, and body invariant preservation. No input boolean or raw marker is authority.

## Task 6: Shared direct Plan, Explain and pull-next policy

Files:

- Modify `scripts/task-tracker/lib/epic-children-gate.mjs` and `scripts/gh/lib/wave-admission.mjs`.
- Modify `scripts/task-tracker/verbs/promote.mjs` and `pull-next.mjs`.
- Modify `scripts/task-tracker/lib/action-decision/observations.mjs` and `action-decision/promote.mjs` with the registered guard observation seam; `verbs/explain.mjs` remains read-only.
- Extend `scripts/tests/unit/task-tracker/verbs/pull-next-verb.test.mjs`, `verb-plan-promote.test.mjs`, `scripts/tests/unit/task-tracker/lib/action-decision-v2.test.mjs` and `scripts/tests/integration/task-tracker/lib/guidance-explain.test.mjs`.

Remove authorized-mode active-sibling shortcuts by routing observations through the shared evaluator; preserve legacy sequential paths. Authorized candidate selection uses rank then issue ID, while ungranted opted-in ranks retain strict lower Done plus sequential budget. Explicitly preserve actual board state separately from CLOSED rather than using coercion for the strict rule.

Acquire common parent lock before child lock in the outer direct Promote wrapper and pull-next. Pass verified lock context into nested pure runners; never acquire parent beneath child. Revalidate at R4P-to-Plan and Plan-to-Develop, retaining all existing story/forecast/dependency/ownership gates. Explain consumes the same observations read-only and never converts its snapshot into execution authority.

Run identical-snapshot parity fixtures through direct Plan, direct Promote, pull-next and Explain public seams; assert typed ready/refusal equality and zero Explain side effects. Run fixtures for ready, revoked, stale, missing, wrong-rank, unresolved dependency and isolation collision. Add end-to-end first-peer Done, worker-to-orchestrator handoff and exact refresh scenarios while another peer continues. Run vc:1 and vc:2 plus new integration suites.

## Task 7: Documentation and source delivery

Document exact registered input schemas, authority source context, recovery, phase-aware refresh, strict barriers and refusals in relevant workflow guides. Add the new meaningful test commands to the issue's root verifiers through a governed transaction before claiming AC coverage. No checkbox is pre-ticked.

Run affected Develop/TIA checks, all focused tests, real-worktree concurrency tests, `npm test`, `npm run test:slow`, `npm run lint`, `npm run format:check`, and `git diff --check`. Fix failures, then commit WIP with `[#1872]`, push the owned branch and create a PR with `Refs #1872`. Attach the PR and report exact SHA, verification evidence and pending boundaries to the controller.

Controller owns Test, exact-head green CI and the single independent Claude Opus 5.5 high PR diff review. Failed review returns to Develop through the registered route. No merge/close or AIPR consensus is done by this child.

## Task 8: Reviewed package and actual consumer admission

After source CI and independent PR review pass, build the exact reviewed AITM tarball and preserve source SHA/package digest. Consumer vendored dependency and lock/integrity replacement belongs to the governed consumer owning issue. Verify installed help/runtime resolve that package, then prepare/record genuine #107 rank-2 authority from the user's existing authentic bounded context and physically isolated #140/#144/#145 bindings. Execute actual registered wave admission and strict lower-Done conformance. This installed rehearsal is delivery evidence; fixtures alone do not complete the feature.

This step remains pending until its required ownership and reviewed artifact exist. Report pending tarball/consumer/admission work explicitly rather than calling source code completion feature completion.

## Review disposition

The independent plan check identified test layout and explicit direct Plan/Explain coverage gaps. Both are addressed above. The accepted spec remains byte-for-byte preserved; its conceptual recovery filename resolves to the canonical `scripts/tests/integration/task-tracker/lib/epic-rank-wave-recovery.test.mjs` path in this plan.
