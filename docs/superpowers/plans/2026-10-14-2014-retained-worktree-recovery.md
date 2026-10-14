<!-- cspell:ignore AIVC -->

# Retained completed-child worktree recovery — #2014

## Scope

One registered `epic-wave restore-worktree` action restores a missing checkout for a strict completed-Done direct child. Reuse authenticated immutable wave history and the physical common-directory admission lock. No caller paths, branches, shell commands, identities or lifecycle states. Existing Prepare/Show/Record behavior stays intact.

## Context

The human approved this bounded design October 14, 2026. Completed AIVC peers retain branches but their checkout directories disappeared. Downstream guarded shell restoration is refused and native successor restore lacks archived attachments. The historical recording parent and genuine current restoring parent may differ. Authenticate each in its own context and preserve retained child identities and grants. This upstream repair does not establish downstream admission or replace its admitted runtime.

## Story Intent

- **Beneficiary:** delivery operator overseeing epics
- **Capability:** safely restore retained completed child checkouts
- **Need:** missing directories block authenticated wave continuation
- **Value or failure prevented:** completed work remains accessible without losing refs or weakening ownership and lifecycle safeguards

## Acceptance Criteria

Recovery authenticates current parent, immutable history and recording-time source. Require direct membership, same rank, strict Done, authoritative unchanged child location, existing branch at exact expectedHead and expectedHead ancestry in current parent source. Refuse filesystem/claim/registration uncertainty. Preserve refs and uncertain effects. Verify clean exact physical read-back; exact existing checkout is idempotent. Deliver independent Astra 6/high review and an exact-source package with SHA256, integrity and complete inventory byte comparison.

## Plan Metadata

- Priority: P1
- Size: M
- Estimate: 7.5 hours (adaptive Plan convergence from 6 base human hours)
- Labels: bug

## Implementation Tasks

### Task 1: Authenticate and restore the retained checkout

Files: scripts/task-tracker/verbs/epic-wave.mjs; scripts/task-tracker/lib/command-surface/catalog.mjs; new scripts/task-tracker/lib/epic-rank-wave-restore-worktree.mjs; recovery-only observations in scripts/task-tracker/lib/epic-rank-wave-runtime.mjs. Reuse/export historical verification in scripts/task-tracker/lib/epic-rank-wave-store.mjs and authoritative location parsing.

1. Add failing closed-selector and real-Git recovery tests, proving the operation is absent before implementation.
2. Accept exactly schema, rank, child, retainedDigest and expectedHead. Under existing lock, authenticate genuine current parent ownership, role, timer, session/generation, repository and physical tuple. Validate complete immutable history and selected retained source at recording time. Historical grants remain historical even if expired or superseded; recovery never renews them.
3. Derive destination/branch/commonDir solely from selected retained binding plus current issue location. Require current direct child of same rank and strict completed-Done. Refuse relocation, stale registration, branch checked out elsewhere or active/conflicting claims.
4. Validate canonical non-symlink owned destination ancestry and absent/clean exact matching checkout. Verify existing branch exact head, source ancestry and complete refs; recheck live authority and physical state before effect.
5. Execute one bounded argument-array Git worktree add of the existing branch with scrubbed Git redirection environment. No force, branch creation/reset, registration prune/repair or cleanup.
6. Read back exact clean tuple/head and refs. Return restored/already-restored only on proof; return typed refusal before effects, indeterminate after failed or uncertain attempted effects, retaining evidence.
7. Cover selector/history/source tampering, wrong role/parent/session/generation/repository, unrelated child/rank/reopened, head/source/location drift, symlink/path/claim/registration conflicts, races, failure/timeout/uncertain read-back and ambient Git redirection.

Tests: scripts/tests/integration/task-tracker/lib/epic-rank-wave-restore-worktree.test.mjs; scripts/tests/unit/task-tracker/verbs/epic-wave.test.mjs. Run existing epic-wave routes/runtime regression files as declared on the issue.

### Task 2: Exact-source recovery package evidence

Derive the normal npm package from a clean accepted commit. Record authentic distinct Astra 6/high review, source SHA, artifact SHA256 and SHA512 integrity, complete inventory byte comparisons, CLI help and recovery tests. Keep disposable archives/manifests in project scratch. Package evidence is separate from delivery and native admission. Do not introduce a packaging framework.

## Review Focus

Historical source verification must not depend on the current restoring parent matching the recorded parent. Missing stale registrations refuse rather than prune. Non-cooperating filesystem writers may race despite admission locking: recheck and preserve uncertainty. Parent/session/branch/source drift before effect prevents recovery. An exact restored checkout must still satisfy all current authority.

## Dependency Map

Depends on: none. Blocks: downstream AIVC physical recovery and separately governed parent adoption. No siblings or parallel implementation workers. Preserve independent #25 chain and paused #7 author.
