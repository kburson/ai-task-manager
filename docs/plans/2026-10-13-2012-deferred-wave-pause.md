# #2012 deferred wave-completion pause repair

## Scope

Preserve the owner's authorization to finish the current numeric rank wave when a later message schedules a pause after completion. Immediate withdrawal remains effective. A deferred stop does not authorize subsequent waves. Product changes are limited to native rank-wave source grammar and source-loader regressions.

## Context

Source base 2fd90eb3f84f442e0329783943ed432b45d25473 preserves accepted #2008 graph adoption, #2009 reviewed Scope normalization and their review history. The exact subsequent instruction "when wave 4 is complete I need you to pause. I will start a fresh chat session to continue #2" is currently classified as immediate contradiction. The original exact source and every later human remain subject to native loading, chronology and hash verification.

## Story Intent

- **Beneficiary:** rank-wave owner
- **Capability:** finish the authorized wave before a scheduled completion pause
- **Need:** a future stop instruction currently revokes active execution immediately
- **Value or failure prevented:** the approved work can finish while the pause prevents unapproved later execution

## Acceptance Criteria

- The exact completion-conditional pause preserves the prior authorization during a native loader rescan.
- Immediate pause/stop/revoke and mixed/adversarial reversals still refuse matching authority.
- The future stop cannot grant permission itself or extend authority to a later wave.

## Plan Metadata

- Priority: P1
- Size: S
- Estimate: 1.5 human hours, subject to registered detailed forecast convergence.
- Source base: 2fd90eb3f84f442e0329783943ed432b45d25473.
- Review: new exact-source independent Astra review and Root admission before any adoption.
- Workflow: explicit Full-Auto Plan provenance; no human approval marker is claimed.

## Implementation Tasks

### Task 1: Preserve the completion condition while evaluating later withdrawal

#### Story Intent

- **Beneficiary:** rank-wave owner
- **Capability:** finish the authorized wave before a scheduled completion pause
- **Need:** a future stop instruction currently revokes active execution immediately
- **Value or failure prevented:** the approved work can finish while the pause prevents unapproved later execution

#### Files

- Modify scripts/task-tracker/lib/epic-rank-wave-source.mjs only within conditional contradiction classification.
- Add scripts/tests/unit/task-tracker/lib/epic-rank-wave-source-deferred-pause.test.mjs using a test-owned native transcript, real loader and verifier.
- Keep exact source schema, hashes, identity, transcript cutoff and complete later-human scans unchanged.

#### Steps

1. Run existing source tests as baseline after genuine issue binding.
2. Add RED for the exact human phrase and loader output, plus scoped completion variants and immediate/mixed/adversarial negatives.
3. Recognize a tightly bounded completion condition attached to pause/stop. Continue evaluating every other verb and clause.
4. Prove no standalone/later-wave authority, unchanged source hash/chronology refusal and late human rescanning.
5. Run affected tests, standard fast suite, lint and formatting. Preserve truthful full-slow/canonical lifecycle limitations if pending.
6. Commit/push tracked source and verification report; build a clean exact-commit immutable tarball and verify SRI/module bytes. Stop normally for distinct Astra re-review.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/epic-rank-wave-source.test.mjs scripts/tests/unit/task-tracker/lib/epic-rank-wave-source-deferred-pause.test.mjs
npm test
npm run test:slow
npm run lint
npm run format:check
git log --oneline -1
```

## Exclusions

No installed runtime, source transcript/hash/cutoff, wave grant, binding/provider identity, global peer-review runtime, unrelated timing software, #2009 lifecycle, consumer adoption, Task Review/Close or cloud merge changes.
