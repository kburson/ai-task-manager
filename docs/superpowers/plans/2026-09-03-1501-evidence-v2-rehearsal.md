# #1501 Frozen-history rehearsal implementation plan

## Goal

Provide a repeatable, manifest-governed rehearsal that copies stable source commits into independent Git storage, runs the evidence-v2 delivery/close/reopen retry matrix through recorded transport, retains a non-production report, and disposes only manifest-owned sandbox artifacts. The resulting rollout handoff remains gated by separate human authorization.

## Steps

1. Add failing CLI and slow tests for double-observed capture, dirty/moving refusal, independent object storage, recorded-only execution, protected before/after reports, report retention, rerun, and disposal containment/refusal.
2. Implement canonical capture/run/report manifest validation and path ownership in `rehearsal-manifest.mjs`, then expose it through `rehearse-evidence-v2.mjs` subcommands.
3. Reuse the existing recorded provider, public evidence services, cycle close fault harness, binding-generation checks, and Git sandbox helpers for the matrix. Keep all executable identities synthetic and every report `productionEvidenceEligible: false`.
4. Add operator and rollout guides covering pinned runtime/source inputs, preview digests, retries, rollback to paused v2, and the separate production go gate.
5. Run targeted CLI/slow tests, lint, formatting, full unit/integration tests, and slow tests; stamp exact-SHA AC evidence before Review.

## Safety boundary

The tests create their own local repositories and bare remotes. The implementation reads supplied sources but never writes them. #1490, #1488, #1485, #1226, their issue records, branches, bindings, receipts and worktrees remain unchanged. No generated preview or rehearsal record authorizes production enrollment or recovery.
