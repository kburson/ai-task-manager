# #1861 focused test repair ledger

These are serial, per-file diagnostic receipts, not an aggregate TIA, cloud, or completion receipt. Instrumented and pattern-only runs 53, 68 and 70 are excluded. Earlier partial-pattern receipts also require full-file confirmation. Final canonical TIA and exact-head cloud evidence remain pending.

## Causes addressed in batches 64-80

- Durable fixtures now use canonical actor state and admitted isolated runtime roots. Legacy raw state and arbitrary scratch roots cannot represent the new reader contract.
- Foreign-root gate refusal remains intact; normal approval policy is covered by the first four gate scenarios.
- Test-entry contention now uses a genuine second OS process with ownership proof removed. Dead legacy locks preserve their bytes for registered recovery.
- Rehearsal permissions retain actual ancestor metadata observations without opening sibling file access. File, network, subprocess and production-target denial assertions remain.
- Commit-trail handler used raw global active state; canonical actor-aware loadState restores reporting. This consumer hunk must be included in the C2 handoff.
- R4P freeze fixtures carry validated journal schemas and digest identities. Capture activation applies only to newly created synthetic repositories. Historical evidence artifacts were not restamped.
- Close fixtures now have their own Git identity; nested physical roots use realpath on macOS.

## Latest focused receipts

| File | Exit | Actual log |
| --- | ---: | --- |
| scripts/tests/integration/task-tracker/core/self-bind-resume.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-2/0000.log |
| scripts/tests/integration/task-tracker/delivery-real-1784.integration.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-47/0001.log |
| scripts/tests/integration/task-tracker/lib/absolute-word-markers.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-2/0004.log |
| scripts/tests/integration/task-tracker/lib/action-capture.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-5/0001.log |
| scripts/tests/integration/task-tracker/lib/action-close-normalization.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused/0005.log |
| scripts/tests/integration/task-tracker/lib/action-close-package.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused/0010.log |
| scripts/tests/integration/task-tracker/lib/action-parity.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-10/0002.log |
| scripts/tests/integration/task-tracker/lib/action-resume-parity.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-3/0003.log |
| scripts/tests/integration/task-tracker/lib/action-review-reviewed-scope.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused/0006.log |
| scripts/tests/integration/task-tracker/lib/action-review.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-3/0005.log |
| scripts/tests/integration/task-tracker/lib/action-session-promote.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-5/0000.log |
| scripts/tests/integration/task-tracker/lib/actor-flush-isolation.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-3/0000.log |
| scripts/tests/integration/task-tracker/lib/assignee-guard.integration.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-43/0001.log |
| scripts/tests/integration/task-tracker/lib/bash-guard-worktree-binding.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-55/0000.log |
| scripts/tests/integration/task-tracker/lib/bound-worktree-state.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-45/0000.log |
| scripts/tests/integration/task-tracker/lib/chore-mode-contract.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-2/0001.log |
| scripts/tests/integration/task-tracker/lib/chore-mode-verb.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-3/0002.log |
| scripts/tests/integration/task-tracker/lib/commit-ownership-message-sources.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-49/0000.log |
| scripts/tests/integration/task-tracker/lib/coverage-cache-unpark.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-45/0002.log |
| scripts/tests/integration/task-tracker/lib/coverage-source-edit-gate.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-48/0000.log |
| scripts/tests/integration/task-tracker/lib/cross-worktree-bind-resume.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-8/0003.log |
| scripts/tests/integration/task-tracker/lib/discover-promote-aged-bucket.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-5/0003.log |
| scripts/tests/integration/task-tracker/lib/downstream-package-boundary.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-6/0006.log |
| scripts/tests/integration/task-tracker/lib/estimation/record-claim.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-5/0004.log |
| scripts/tests/integration/task-tracker/lib/evidence-v2/binding-generation.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-5/0002.log |
| scripts/tests/integration/task-tracker/lib/evidence-v2/cli-contract.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-73/0000.log |
| scripts/tests/integration/task-tracker/lib/evidence-v2/isolation.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-71/0001.log |
| scripts/tests/integration/task-tracker/lib/evidence-v2/rehearsal-cli.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-69/0002.log |
| scripts/tests/integration/task-tracker/lib/fleet-registry-gc.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-4/0003.log |
| scripts/tests/integration/task-tracker/lib/fleet-registry.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-4/0002.log |
| scripts/tests/integration/task-tracker/lib/gh-command-policy.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-7/0007.log |
| scripts/tests/integration/task-tracker/lib/guidance-admission.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-4/0001.log |
| scripts/tests/integration/task-tracker/lib/guidance-authority-cost.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-60/0001.log |
| scripts/tests/integration/task-tracker/lib/guidance-capture-lifecycle.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-75/0000.log |
| scripts/tests/integration/task-tracker/lib/guidance-preslim-report.test.mjs | 1 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-78/0001.log |
| scripts/tests/integration/task-tracker/lib/guidance-recertification-capture.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-75/0001.log |
| scripts/tests/integration/task-tracker/lib/hook-session-start.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-7/0008.log |
| scripts/tests/integration/task-tracker/lib/interruption-word-markers.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-6/0004.log |
| scripts/tests/integration/task-tracker/lib/issue-lock-pid-liveness.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-39/0002.log |
| scripts/tests/integration/task-tracker/lib/lock-env-leak-regression.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-50/0000.log |
| scripts/tests/integration/task-tracker/lib/move-state-lock.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-49/0001.log |
| scripts/tests/integration/task-tracker/lib/new-switch-marker-order.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-6/0003.log |
| scripts/tests/integration/task-tracker/lib/ownership-boundaries.integration.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-45/0001.log |
| scripts/tests/integration/task-tracker/lib/package-delivery-attribution-exception-smoke.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-44/0000.log |
| scripts/tests/integration/task-tracker/lib/package-delivery-waiver-smoke.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-44/0001.log |
| scripts/tests/integration/task-tracker/lib/package-workflow-exception-smoke.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-44/0002.log |
| scripts/tests/integration/task-tracker/lib/pr1866-review-regressions.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-3/0001.log |
| scripts/tests/integration/task-tracker/lib/resume-auto-gap-activity.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-3/0007.log |
| scripts/tests/integration/task-tracker/lib/resume-fleet-refresh.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-3/0006.log |
| scripts/tests/integration/task-tracker/lib/resume-fresh-bind-no-switch.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-6/0000.log |
| scripts/tests/integration/task-tracker/lib/resume-seed.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-6/0001.log |
| scripts/tests/integration/task-tracker/lib/runtime-batch-recovery.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-15/0003.log |
| scripts/tests/integration/task-tracker/lib/runtime-coordinator-recovery.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-15/0005.log |
| scripts/tests/integration/task-tracker/lib/runtime-initialization-crash.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-15/0007.log |
| scripts/tests/integration/task-tracker/lib/runtime-initialize.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-15/0008.log |
| scripts/tests/integration/task-tracker/lib/runtime-migration-successor-timing.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-42/0001.log |
| scripts/tests/integration/task-tracker/lib/runtime-migration-transaction.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-42/0000.log |
| scripts/tests/integration/task-tracker/lib/runtime-operation-recovery.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-15/0006.log |
| scripts/tests/integration/task-tracker/lib/runtime-orchestrator-writer.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-8/0005.log |
| scripts/tests/integration/task-tracker/lib/runtime-publication-validation.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-15/0009.log |
| scripts/tests/integration/task-tracker/lib/runtime-test-worktree.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused/0000.log |
| scripts/tests/integration/task-tracker/lib/source-edit-gate-workflow-policy.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-7/0004.log |
| scripts/tests/integration/task-tracker/lib/source-edit-gate.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused/0001.log |
| scripts/tests/integration/task-tracker/lib/state-mutator-concurrency.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-50/0001.log |
| scripts/tests/integration/task-tracker/lib/switch-verb-noop.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-6/0002.log |
| scripts/tests/integration/task-tracker/lib/terminal-review-handoff.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-8/0001.log |
| scripts/tests/integration/task-tracker/lib/test-verb-entry-interlock.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-66/0000.log |
| scripts/tests/integration/task-tracker/lib/timing-concurrency.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-48/0001.log |
| scripts/tests/integration/task-tracker/lib/timing-degraded-write-visibility.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-8/0000.log |
| scripts/tests/integration/task-tracker/lib/tracked-templates.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-47/0004.log |
| scripts/tests/integration/task-tracker/lib/two-sessions-different-issues.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-39/0000.log |
| scripts/tests/integration/task-tracker/lib/two-sessions-same-issue.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-39/0001.log |
| scripts/tests/integration/task-tracker/lib/verb-start-resume-stop.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-54/0000.log |
| scripts/tests/integration/task-tracker/lib/verifier-cache-durable-head.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-23/0000.log |
| scripts/tests/integration/task-tracker/lib/worktree-binding-lifecycle.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-9/0001.log |
| scripts/tests/integration/task-tracker/verbs/approve-full-auto-unified.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-9/0000.log |
| scripts/tests/integration/task-tracker/verbs/bind.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-7/0003.log |
| scripts/tests/integration/task-tracker/verbs/github-record-approval-close-gates.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-7/0006.log |
| scripts/tests/integration/task-tracker/verbs/new-from-plan.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-50/0002.log |
| scripts/tests/slow/task-tracker/core/fleet-registry-concurrent.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-60/0000.log |
| scripts/tests/slow/task-tracker/core/packaged-doctor-consumer.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-45/0007.log |
| scripts/tests/slow/task-tracker/core/packaged-tail-profile-consumer.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-44/0004.log |
| scripts/tests/slow/task-tracker/lib/ac-evidence-gate.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-59/0000.log |
| scripts/tests/slow/task-tracker/lib/action-capture-integration.test.mjs | 1 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-81/0000.log |
| scripts/tests/slow/task-tracker/lib/chore-mode-activity-guard.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-52/0003.log |
| scripts/tests/slow/task-tracker/lib/cli.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-61/0001.log |
| scripts/tests/slow/task-tracker/lib/commit-trail-handler.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-74/0000.log |
| scripts/tests/slow/task-tracker/lib/coverage-orchestrator-lock.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-57/0000.log |
| scripts/tests/slow/task-tracker/lib/dirty-review-promote-false-success.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-62/0002.log |
| scripts/tests/slow/task-tracker/lib/dirty-workspace-gate.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-65/0000.log |
| scripts/tests/slow/task-tracker/lib/discover-autosave.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-46/0001.log |
| scripts/tests/slow/task-tracker/lib/ensure-wave-parent.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-67/0000.log |
| scripts/tests/slow/task-tracker/lib/gates.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-64/0000.log |
| scripts/tests/slow/task-tracker/lib/lifecycle.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-78/0000.log |
| scripts/tests/slow/task-tracker/lib/log-issue-time.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-62/0001.log |
| scripts/tests/slow/task-tracker/lib/move-state-approval-gate.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-52/0001.log |
| scripts/tests/slow/task-tracker/lib/move-state-gate.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-52/0000.log |
| scripts/tests/slow/task-tracker/lib/move-state.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-76/0001.log |
| scripts/tests/slow/task-tracker/lib/proof-gate-reconciliation.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-52/0002.log |
| scripts/tests/slow/task-tracker/lib/ready-for-plan-live-migration.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-74/0001.log |
| scripts/tests/slow/task-tracker/lib/review-approval-prompt.test.mjs | 1 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-81/0001.log |
| scripts/tests/slow/task-tracker/lib/verb-preflight-wiring.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-51/0001.log |
| scripts/tests/slow/task-tracker/lib/worktree-seed-integration.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-57/0002.log |
| scripts/tests/slow/task-tracker/verbs/coverage-close.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-79/0000.log |
| scripts/tests/slow/task-tracker/verbs/promote-verb.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-45/0005.log |
| scripts/tests/slow/task-tracker/verbs/recovery-path-independence.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-54/0004.log |
| scripts/tests/slow/task-tracker/verbs/state-marker-single-writer.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-55/0001.log |
| scripts/tests/slow/task-tracker/verbs/verb-test-remove-worktree.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-54/0003.log |
| scripts/tests/unit/providers/parity.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-33/0004.log |
| scripts/tests/unit/task-tracker/characterization/orchestrators.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-36/0003.log |
| scripts/tests/unit/task-tracker/core/actor-word-cursor.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-15/0000.log |
| scripts/tests/unit/task-tracker/core/close-emission-order.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-18/0000.log |
| scripts/tests/unit/task-tracker/core/coverage-heal-timing-starts.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-15/0002.log |
| scripts/tests/unit/task-tracker/core/full-auto-close-doctrine.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-25/0004.log |
| scripts/tests/unit/task-tracker/core/heal-timing-log-command.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-33/0002.log |
| scripts/tests/unit/task-tracker/core/state-project-dir.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-17/0001.log |
| scripts/tests/unit/task-tracker/core/word-marker-advance.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-15/0001.log |
| scripts/tests/unit/task-tracker/gh/move-state-host-returns.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-41/0000.log |
| scripts/tests/unit/task-tracker/gh/review-in-place.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-41/0001.log |
| scripts/tests/unit/task-tracker/lib/action-authority-cost.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-9/0004.log |
| scripts/tests/unit/task-tracker/lib/actor-queue-isolation.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-10/0001.log |
| scripts/tests/unit/task-tracker/lib/actor-state-isolation.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-11/0000.log |
| scripts/tests/unit/task-tracker/lib/agent-review/approve-agent-review-complete.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-11/0004.log |
| scripts/tests/unit/task-tracker/lib/assignment-lock.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-12/0000.log |
| scripts/tests/unit/task-tracker/lib/auto-mode.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-11/0003.log |
| scripts/tests/unit/task-tracker/lib/bind-context.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-11/0002.log |
| scripts/tests/unit/task-tracker/lib/bind-reseed-e2e.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-45/0004.log |
| scripts/tests/unit/task-tracker/lib/bound-state-session-authoritative.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-14/0001.log |
| scripts/tests/unit/task-tracker/lib/bound-worktree-project-dir.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-24/0003.log |
| scripts/tests/unit/task-tracker/lib/close-cross-close.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-37/0000.log |
| scripts/tests/unit/task-tracker/lib/close-drain.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-14/0000.log |
| scripts/tests/unit/task-tracker/lib/close-repair.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-40/0000.log |
| scripts/tests/unit/task-tracker/lib/consecutive-promotes-no-reconcile.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-29/0001.log |
| scripts/tests/unit/task-tracker/lib/coverage-approve.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-13/0001.log |
| scripts/tests/unit/task-tracker/lib/coverage-block.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-12/0001.log |
| scripts/tests/unit/task-tracker/lib/coverage-reconcile.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-24/0000.log |
| scripts/tests/unit/task-tracker/lib/coverage-review.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-13/0000.log |
| scripts/tests/unit/task-tracker/lib/coverage-supersede.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-12/0005.log |
| scripts/tests/unit/task-tracker/lib/coverage-unblock.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-12/0002.log |
| scripts/tests/unit/task-tracker/lib/coverage-verb-preflight.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-13/0002.log |
| scripts/tests/unit/task-tracker/lib/discover-cancel.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-16/0001.log |
| scripts/tests/unit/task-tracker/lib/executable-entrypoint-classification.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-3/0008.log |
| scripts/tests/unit/task-tracker/lib/flock-contention.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-38/0001.log |
| scripts/tests/unit/task-tracker/lib/guidance-candidate-measurement.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-80/0001.log |
| scripts/tests/unit/task-tracker/lib/guidance-characterization.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-80/0002.log |
| scripts/tests/unit/task-tracker/lib/issue-lock-reentrancy.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-26/0005.log |
| scripts/tests/unit/task-tracker/lib/locks.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-38/0000.log |
| scripts/tests/unit/task-tracker/lib/move-state-internal-gate.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-32/0001.log |
| scripts/tests/unit/task-tracker/lib/move-state/move-state-core.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-36/0000.log |
| scripts/tests/unit/task-tracker/lib/move-state/move-state-idempotent.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-36/0001.log |
| scripts/tests/unit/task-tracker/lib/occupancy.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-26/0004.log |
| scripts/tests/unit/task-tracker/lib/on-ask.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-33/0001.log |
| scripts/tests/unit/task-tracker/lib/on-stop.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-32/0003.log |
| scripts/tests/unit/task-tracker/lib/paths.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-26/0003.log |
| scripts/tests/unit/task-tracker/lib/queue.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-27/0000.log |
| scripts/tests/unit/task-tracker/lib/reconcile-no-drift-seed.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-26/0002.log |
| scripts/tests/unit/task-tracker/lib/reconcile-sentinel-drift.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-35/0002.log |
| scripts/tests/unit/task-tracker/lib/refine-tbd-placeholder.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-24/0001.log |
| scripts/tests/unit/task-tracker/lib/review-verb-timing-order.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-28/0000.log |
| scripts/tests/unit/task-tracker/lib/save-plan.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-26/0000.log |
| scripts/tests/unit/task-tracker/lib/scratch-dir.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-31/0002.log |
| scripts/tests/unit/task-tracker/lib/seed-kanban-cache.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-24/0002.log |
| scripts/tests/unit/task-tracker/lib/session-state.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-33/0000.log |
| scripts/tests/unit/task-tracker/lib/state-engine-policy-characterization.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-36/0002.log |
| scripts/tests/unit/task-tracker/lib/state.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-35/0000.log |
| scripts/tests/unit/task-tracker/lib/test-407-binding-survives.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-26/0001.log |
| scripts/tests/unit/task-tracker/lib/test-verb-injection.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-29/0000.log |
| scripts/tests/unit/task-tracker/lib/timing-queue-retention.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-27/0001.log |
| scripts/tests/unit/task-tracker/lib/verb-pipeline-enforcement.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-32/0000.log |
| scripts/tests/unit/task-tracker/lib/verb-preflight.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-35/0001.log |
| scripts/tests/unit/task-tracker/lib/verifier-cache.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-23/0001.log |
| scripts/tests/unit/task-tracker/lib/word-counter-full-expansion.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-30/0002.log |
| scripts/tests/unit/task-tracker/lib/word-counter-grok.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-30/0001.log |
| scripts/tests/unit/task-tracker/lib/word-counter.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-30/0000.log |
| scripts/tests/unit/task-tracker/lib/word-marker-compaction.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-30/0003.log |
| scripts/tests/unit/task-tracker/maintenance/heal-timing-interval-cli.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-33/0003.log |
| scripts/tests/unit/task-tracker/verbs/approve-core.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-25/0000.log |
| scripts/tests/unit/task-tracker/verbs/approve-full-auto-detect.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-25/0001.log |
| scripts/tests/unit/task-tracker/verbs/approve-review-notes.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-25/0002.log |
| scripts/tests/unit/task-tracker/verbs/approve-timing-boundary.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-25/0003.log |
| scripts/tests/unit/task-tracker/verbs/check-verb-migration.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-21/0000.log |
| scripts/tests/unit/task-tracker/verbs/close-converge-audit-emission.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-37/0002.log |
| scripts/tests/unit/task-tracker/verbs/close-incorporated.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-40/0001.log |
| scripts/tests/unit/task-tracker/verbs/close-reconcile-lifecycle.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-37/0003.log |
| scripts/tests/unit/task-tracker/verbs/close-strip-labels.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-37/0001.log |
| scripts/tests/unit/task-tracker/verbs/coverage-ac-stamp.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-19/0004.log |
| scripts/tests/unit/task-tracker/verbs/coverage-check-verb.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-19/0006.log |
| scripts/tests/unit/task-tracker/verbs/coverage-commit-trace.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-20/0001.log |
| scripts/tests/unit/task-tracker/verbs/coverage-dod-stamp.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-19/0005.log |
| scripts/tests/unit/task-tracker/verbs/coverage-fleet.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-19/0000.log |
| scripts/tests/unit/task-tracker/verbs/coverage-kind.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-18/0001.log |
| scripts/tests/unit/task-tracker/verbs/coverage-mirror-deep-dive.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-19/0001.log |
| scripts/tests/unit/task-tracker/verbs/coverage-promote.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-20/0002.log |
| scripts/tests/unit/task-tracker/verbs/coverage-update.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-20/0000.log |
| scripts/tests/unit/task-tracker/verbs/dod-stamp-state-gate.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-23/0002.log |
| scripts/tests/unit/task-tracker/verbs/ensure-checked.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-19/0002.log |
| scripts/tests/unit/task-tracker/verbs/ensure-unchecked.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-19/0003.log |
| scripts/tests/unit/task-tracker/verbs/move-inprocess-parity.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-41/0002.log |
| scripts/tests/unit/task-tracker/verbs/promote-discuss-refusal.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-23/0003.log |
| scripts/tests/unit/task-tracker/verbs/promote-review-close-agent-review-gate.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-23/0005.log |
| scripts/tests/unit/task-tracker/verbs/promote-test-delegation.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-22/0003.log |
| scripts/tests/unit/task-tracker/verbs/promote-test-to-review-gate.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-22/0002.log |
| scripts/tests/unit/task-tracker/verbs/pull-next-verb.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-41/0003.log |
| scripts/tests/unit/task-tracker/verbs/refine-stage-completion.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-23/0004.log |
| scripts/tests/unit/task-tracker/verbs/reject.test.mjs | 0 | .superpowers/sdd/2026-10-02-1861-runtime-kernel/test-repair-focused-21/0002.log |

## Repair continuation, batches 87 onward

Action capture batch 87 passed all five integration cases, including eight concurrent children producing exactly eight complete ordered records. Batch 86 was diagnostic only and exposed coordinator contention before begin/complete publication; no diagnostic trace remains in source. Production publication retries now occur only before entry to the record callback, never after entry or around a child request. Commit-trail actor-state and capture-consumer changes require C2 handoff.

Create-issue and guidance-release-refusal passed batch 88. Worktree-isolation passed batch 90; action-capture library passed batch 89. Guidance recertification batch 88 still refused obsolete replay at the initial-fixture digest, requiring updated exact negative assertions. Activity-guard batch 91 hit the diagnostic 120-second ceiling; single-case batch 93 passed and is diagnostic only. Batch 95 uses the repository 600-second per-file timeout, with offline default GitHub reads. Hook-handler batch 94 has 16/19 passing cases; remaining three need the queue envelope reader. No aggregate TIA green or completion claim.

Batch 96: hook-handler passed all 19 cases. Fixtures now seed actor state and provider-mirror transcripts, read the canonical queue envelope, exercise genuine offline queuing, and retain Unknown prior-session time rather than fabricating wall-time engagement. Batch 97: activity-guard passed all 38 cases; genuine migrated roots preserve legacy-fallback compatibility cases and exact linked-worktree ownership checks. A real scratch-symlink fallback bypass was fixed in artifact-write-policy.mjs; C2 handoff must include this consumer hunk. Missing required state has its own typed-refusal case, distinct from a valid empty ledger. Batch 98 guidance release passed all 12 cases: immutable #1866 capture is regenerated byte-for-byte from its actual recorded source commit in a disposable checkout, with unchanged committed and live-source integrity checks. This is historical regression evidence, not current-candidate release certification. Recertification/help and fresh aggregate TIA remain outstanding.

Batch 98 recertification passed all current negative replay checks after naming the actual protected initial-fixture identity refusal. Fresh canonical selection covers 923 files from 243 actual changed paths relative to the recovered WIP snapshot, with no lane escalation. Final aggregate selected execution has not started yet.

Batch 98 completed: release, recertification and full agentic-help all passed. Batch 99 completed after extracting fixture helpers for the 800-line cap: activity-guard, review-approval and close coverage all passed. Full `npm run lint` passed after the extraction; scoped changed-file format passed and `git diff --check` passed. Whole-candidate format still fails inherited unformatted WIP and the intentionally malformed protected private runtime JSON, which remains unchanged. The historical-failure focused map is now empty; that is not an aggregate receipt. Fresh final canonical TIA uses 923 individual files, no lane escalation, and repository runner per-file timeout/maxBuffer/no-retry policy, serially in the isolated candidate clone. Results are in `tia-results-repaired`; no aggregate green claim before completion.

Final selected run remains in progress against the immutable clone synchronization snapshot. It exposed one additional `action-parity.test.mjs` provenance failure: the preserved `action-authority-cost.json` correctly hashes the original collector at trunk baseline 171c7d93866f67b58effa635be5ae737f54ef9eb, while the explicitly isolated current collector differs. The native test now checks archived helper bytes at that exact commit; fresh current collector counts, request identities, readiness, resource mappings and ceilings remain asserted unchanged. The archive was not rewritten. This native-only change has not yet been synchronized to the running clone or reverified; final delta TIA must cover it after the current serial run. Governed `issue-body` added the split successor test to VC1 and returned verified body version 36, without checking any criterion.

The fresh aggregate also selected `codex-word-marker-lifecycle.integration.test.mjs`, which failed at `saveState` because its real Git fixture was never activated. Its native fixture now awaits `createActivatedRuntimeRootFixture` before actor/state operations; code and assertions are otherwise retained. Scoped ESLint and format checks passed, but the executable recheck remains queued until the immutable aggregate run finishes. No live runtime activation occurred.

`guidance-admission.test.mjs` exposed stale `admission-surface.json` static-import metadata for the repaired commit-trail hook: the actual AST now includes `./state.mjs`. The native inventory entry was regenerated from Acorn import declarations only, preserving command classification, admission gates and exception semantics. The same run passed all 17 operational/refusal cases and failed only the exact import census. Native metadata recheck remains queued until the immutable aggregate finishes.

### Canonical TIA repair preparation: different-issue overlap

Actual serial TIA index193 failed the existing overlap assertion in `two-sessions-different-issues.test.mjs`. Each worker resolves its durable timing-lock path before entry, and an uncoordinated 200ms hold does not guarantee overlapping entry after independent startup. Prepared a test-only IPC barrier inside the real per-issue lock callback: both workers must enter before either is released. An accidental global lock fails the bounded barrier. Same-issue worker mode and serialization assertions are unchanged. Scoped ESLint/Prettier pass; executable repair verification is pending until the immutable serial TIA run ends.

The canonical serial run completed all923 selected files:917 passed,6 failed. All647 selected unit files passed; failures are action-parity, codex-word-marker-lifecycle, guidance-admission, different-issue overlap, concurrent action-capture, and coverage-close-gates. The last close test depended on invoking local trunk; native repair gives that case its own Git/trunk fixture and real attributed commit, strengthening to exact ok=true. Scoped lint/format passed; executable repair checks pending. Original results remain immutable under tia-results-repaired. Batch100-diagnostic adds stack output only in the isolated clone to diagnose recurrent capture contention; it is not certification evidence.

### Confirmed writer-release race

Batch101 diagnostic reproduced capture contention twice with exact stacks at acquireWriterLease.release, after the action operation returned. Batch104 focused regression reproduces that release refusal with a real child holding the coordinator while the original callback returns; its message assertion accounts for Node IPC handle argument. Batch103 is an invalid intermediate regression check (IPC assertion failed) and is not green evidence. Only writer-lease release opts into3 seconds of monotonic exclusive coordinator admission waiting. The existing prepared owner is published exclusively once admission succeeds; no competing owner removal or age takeover, callback replay, or external request retry occurs. Other acquisition sites retain immediate typed refusal. Batch105 release regression and complete5-case capture suite pass; remaining repaired files in progress.

### Final repair verification checkpoint

Batch105 passed all8 files (six original failures, deterministic release regression, same-issue serialization). The final canonical delta TIA completed905 selected files with0 failures and process exit0. The19 earlier selected files outside this delta also passed; their original receipts remain separate. No full local lane was invoked. Full npm run lint passed (33872ms); latest8 repair-path Prettier checks and git diff --check passed. Whole-candidate format remains red on inherited unformatted WIP and deliberately malformed protected private runtime JSON; no blanket formatting or runtime/source cleanup occurred. Cloud/clean-head receipts and delivery are not claimed. Native and clone3731-file hashes both match the final synchronized snapshot. Only the original stagedR100 remains; cspell, equals file, protected snapshot and original draft are verified preserved. Final evidence: test-repair-final-receipt.json, tia-results-release/results.json, original tia-results-repaired/results.json, focused105-repaired results. #1861 remains Develop and incomplete; no AC/DoD stamps, commit, PR, CI, Review or closure occurred.
