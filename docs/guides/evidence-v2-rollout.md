# Evidence v2 rollout handoff

Rehearsal is a prerequisite for a production proposal. It is never production authority. Prepare this handoff from a successful `inspect` response and obtain a separate explicit human go decision before any live inspection, enrollment, recovery, push, merge, reset, rebase, or cleanup.

## Required pinned inputs

- Runtime root, exact Git SHA, and runtime digest from `pinnedRuntime`.
- Per-issue ref, commit OID, and tree OID from `sourceRefs`.
- Per-issue read-only proposal digest from `previewDigests`.
- Retained report path and digest.
- Confirmation that every protected issue record, receipt, binding, branch, and worktree still matches its captured fingerprint.
- Reconciliation of any deferred #1490 scope before recovery.

## Production proposal template

```text
Runtime SHA: <inspect.pinnedRuntime.sha>
Runtime digest: <inspect.pinnedRuntime.digest>
Sources: <inspect.sourceRefs>
Read-only preview digests: <inspect.previewDigests>
Rehearsal report: <retained path and digest>
Production evidence eligible: false
Requested live operation: <one bounded operation>
Expected effects: <issue/body/provider/Git effects>
Retry identity: <operation ID and immutable inputs>
Rollback: pause evidence v2 and retain the latest valid generation
Human go gate: PENDING
```

## Retry and rollback

Retry with the same immutable inputs and operation identity only after read-back establishes whether the prior effect committed. If the live source, runtime digest, provider snapshot, binding generation, or enrollment preview changes, stop and create a fresh preview. Never reuse the rehearsal report as a production receipt.

Rollback means leaving evidence v2 paused, preserving every production record and latest valid binding generation, and retaining the failed operation evidence for diagnosis. Cleanup is a separately verified effect and must not remove a worktree, branch, receipt, or record that contains unique work.

## Human go gate

The final approver must review the exact live preview, effects, retry identity, and rollback plan. Record that approval separately from the rehearsal. Without it, the only permitted actions are read-only comparison, another recorded rehearsal, or disposal of manifest-owned rehearsal artifacts.
