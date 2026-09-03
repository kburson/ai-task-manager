# #1500 Evidence v2 Enrollment Implementation Plan

## Goal

Ship an opt-in evidence v2 command path that can inspect legacy issue history through immutable tool/source/authority/provider roots, produce a canonical digest-bound migration proposal, and enroll only after the proposal and installed runtime capability are revalidated under the designated authority. Existing issues remain on v1 unless they carry the protected v2 projection marker.

## Implementation

1. Add failing unit tests for production execution-context validation, protocol selection, canonical migration proposals, stale-plan refusal, and runtime capability/entry inventory checks.
2. Implement `migration.mjs`, `runtime-capabilities.mjs`, `entry-guard.mjs`, and `enrollment.mjs`. Inspection receives read-only ports; enrollment reinspects before its first write, preserves raw legacy bytes by digest/reference, records explicit unknowns, and writes the protected projection last.
3. Add dispatcher-level tests for `evidence inspect`, `evidence enroll`, and `reopen`, including separate trusted tool/source roots, foreign-host refusal, incomplete inventory refusal, malformed marker refusal, and zero writes from inspection.
4. Wire the verbs into runtime preflight, dispatcher, routing, command catalog, help data, executable inventory, and the shared workflow/rule documentation. Keep the common protocol selector as the sole v1/v2 discriminator.
5. Run the targeted suites, help/catalog checks, lint, formatting, full tests, and slow tests. Stamp each acceptance criterion from its declared verifier, then move through Test and Review on the accepted exact SHA.

## Safety boundary

All tests use synthetic rehearsal identities and recorded or in-memory transports. This issue will not enroll, reopen, mutate, clean, reset, rebase, push, or otherwise change #1490, #1488, #1485, #1226, their branches/worktrees, or `cloud-test-automation`.

## SHA comparison audit

Every touched SHA comparison will be classified in the final handoff as an observation, concurrency precondition, Git-sensitive recipe input, v1-only legacy contract, or prohibited work-identity join. V2 eligibility depends on content-addressed subject and record identities; a SHA can remain an observed or guarded transport input but cannot serve as the durable evidence join.
