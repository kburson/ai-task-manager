# #1818 acceptance reconciliation for #1839

The approved amendment replaces the original independently scheduled organic workload with a controlled disposable workload. It retains the real 60-minute overlap, two-worktree traffic, pre-run declaration, participant enrollment, coverage and cleanup gates. Original Tasks 1–4 remain the basis of the instrumentation contract; #1839 adds observed evidence and the #1817 planning handoff.

This matrix records evidence ownership. It does not tick parent acceptance boxes or assert that lifecycle review has occurred.

| Parent criterion | Owning deliverable and verification |
| --- | --- |
| Inventory direct, covered, opaque and uncovered GraphQL paths | #1835 inventory and contract; inventory regression suite; frozen `declaration.json` selects the opaque shim boundary for the controlled comparison. |
| Observe timing, attribution, known points and explicit unknown costs | #1837 collection; #1839 native-dispatch attribution corrections; collection/dispatch suites and saved query/mutation smoke. |
| Concurrent metadata storage under the Git common directory | #1836 storage; storage fixtures exercise linked worktrees, writers in separate processes and duplicates; baseline run/manifest identities supply the live shared-root sample. |
| Preserve behavior and exclude payloads/secrets | #1837 collection and action-capture parity suites; strict observation schema; report and saved smoke contain metadata only. |
| Offline reports, peaks, operations, stages, graphs and limits | #1838 report and graph renderer; report fixtures and the #1839 saved report. |
| Failure, disabled, unsupported and partial-storage cases | #1836/#1837 failure fixtures and #1838 comparison gates; #1839 preliminary qualification cases. |
| Reuse interception without requiring payload capture or issue binding | #1837 usage-only collection fixtures and both action-capture suites. |
| Measured creation-to-planning baseline with overlapping worktrees | #1839 frozen declaration/preflight, actual run, smoke and saved report; `node scripts/maintenance/verify-1839-baseline.mjs`. |
| Shared-root reachability and manifest rules | #1836 enrollment/storage fixtures; #1837 launcher/descendant fixtures; #1839 actual participant identities and declaration matching. |

## Enforced baseline boundary

The parent's governed Verification Commands were updated to use the strict exact-head cloud verifier for full tests and the saved #1839 baseline verifier for VC5. Native evidence-marker backfill attached `vc:5` to the previously unverified baseline criterion (body version 41). Its legacy non-demonstrable annotation remains in the historical line; the added verifier citation supplies executable proof, and the root command remains mandatory at Test. No unverified tick is used.

The saved verifier returns nonzero when the interval or actual overlap is short, a participant lacks traffic/enrollment, a workflow is missing/unsuccessful, candidate coverage is preliminary, the workload denominator differs from preflight, or smoke cost/cleanup proof is inconsistent. Regression fixtures cover these failures. A preliminary report therefore cannot pass the declared parent verification command or be accepted as final baseline evidence. Parent advancement also requires its native child-completion and epic-reconciliation gates; this document does not waive them.

Full tests are verified through `node scripts/maintenance/verify-ci-receipts.mjs`, with genuine GitHub run/artifact provenance for the exact clean source SHA and complete unit, integration and slow inventories. Targeted local suites cover the changed code. No full local suite or fabricated review evidence is substituted.

## Interpretation for #1817

The accepted report, qualification and handoff must disclose controlled selection, raw totals, completed workflow denominator, normalized volume, collector uptime versus command activity, opaque requests and unknown costs. This baseline can guide scoped volume priorities. It cannot establish total point rankings, organic fleet usage or optimization savings where those are unmeasured. A future optimization comparison must rerun the declared workload with matched version/configuration/participant controls and adequate instrumentation for its chosen signal.

Scratch resource removal is a subsequent human-directed cleanup step. The saved evidence and offline verification have no ongoing dependency on the scratch clone, repository, Project or issue URLs. The retained optional live tests skip until a new disposable environment is explicitly configured.
