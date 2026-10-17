# #2017 — Audited Develop to Test resume recovery

Already authorized bounded defect repair. Final acceptance and upstream lifecycle closure remain approval deferred.

## Story Intent

- **Beneficiary:** delivery operator overseeing issue review
- **Capability:** recover an authenticated redundant lifecycle resume
- **Need:** it prevents truthful review of verified work
- **Value or failure prevented:** delivery can continue without inventing time or weakening timing integrity

## Scope and sequence

1. Reproduce the genuine shared zero-work triple through the existing recovery helper: develop:completed, resumed, test:started, physically adjacent with identical whole-second timestamps, matching canonical UUID transition marker, unchanged absolute word/full-word cursors, blank credited duration cells and a=0/i=0 durable seconds. Require no actor identity. Preserve Unknown totals and every unrelated byte.
2. Extend recoverRedundantSameSecondReengagement in scripts/task-tracker/lib/heal-timing-departure.mjs for this one exact sibling shape. Keep the existing demotion path and its predicates unchanged. Add no fabricated departure, reconstruction, waiver, normal-runtime replacement or telemetry framework.
3. Add meaningful coverage in scripts/tests/unit/task-tracker/lib/heal-timing-departure-repair.test.mjs for valid recovery; transition mismatch, missing, duplicated and malformed markers; credit in any row; actor tags; cursor drift and missing cursor; timestamp drift; intervening lines; and wrong neighboring events. Exercise existing dry-run/apply/readback and timing validation. Update supported help only as needed.
4. Accept the established --allow-foreign-worktree routing flag in standalone CLI strict known-flag admission. It changes no row, actor, cursor, credit, timestamp or adjacency predicates. Keep unknown flags refused. Prove ordinary dry-run/apply invocation without ad hoc imports or hidden subprocess mutation wrappers.
5. Run focused repair, CLI and validator tests, plus appropriate lint/format. Distinct Astra6/high reviews exact commit. Verify all normal packaged files against frozen source and integrity hashes. Report genuine issue/session/branch and supported dry-run/apply commands. No acceptance/Done claim.

## Plan Metadata

- Priority: P1
- Size: S
- Estimate: 3 hours (2 base WBS plus converged repository execution cost)
- Labels: bug

Registered issue: [#2017](https://github.com/kburson/ai-task-manager/issues/2017)

Verification command: node --test scripts/tests/unit/task-tracker/lib/heal-timing-departure-repair.test.mjs scripts/tests/unit/task-tracker/maintenance/heal-timing-departure-cli.test.mjs scripts/tests/unit/task-tracker/lib/agent-review/validators/timing-log-sequence-shared-projection.test.mjs
