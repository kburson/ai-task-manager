# #2055 — author dispositions for independent round 1

The GPT-6.1 Sol / medium reviewer found no actionable defects. Its recommendation to require a fully verified store generation is accepted and remains explicit in the public module comment and implementation audit. Its independently executed verifier passed 77/77; the author additionally ran the selected 391/391 regressions, full lint and format checks. No independent rerun of the author's RED evidence is claimed.

## Boundaries considered by the reviewer

1. **Manifest and payload validation:** accepted boundary. The store validates complete manifests and referenced bytes; retention is a pure policy, not a second persistence validator. Missing policy evidence still refuses. The operational cost of violating the documented caller precondition is an invalid cleanup decision; later consumers must keep the verified-store boundary.
2. **Settlement, export and reassignment authority:** accepted boundary. The result grants none. Dirty data, retained journals and events stay protected; native claims and explicit transfer acknowledgement belong to the owning later slices. No authorization is inferred from `allowed`.
3. **Future cleanup/publisher wiring:** accepted boundary. The audited current runtime migration and cleanup implementation does not destroy `.tmp/gh`. Adding it to migration inventory would expand authority unnecessarily. Subsequent coordinator/writer tasks must consume this safeguard before introducing destructive operations. This child does not claim whole-epic activation.
4. **External directory deletion or worktree destruction:** accepted specification limitation. The owner selected project-local `.tmp/gh`; arbitrary manual deletion cannot be made crash recovery by this policy. No additional body store is introduced.
5. **Accepted #2054 internals:** accepted boundary. Existing actual store integration and root-safety tests were rerun as part of the 391-test selection. Its persistence interface is unchanged; no new defect was observed that would justify reopening the predecessor.
6. **Live lifecycle, binding and timing authority:** author-owned. Native Plan, estimate reconciliation, approval and Develop admission succeeded in the actual app-bound worktree. A genuine pause after quota recovery closed the current interval with Unknown activity retained; the earlier refused pause is not retroactively claimed. Native exact-head Test, orchestrator Review, approval and Close remain pending at this checkpoint.
7. **Aggregate merge readiness:** accepted boundary. PR #2081 remains a draft aggregate; native child acceptance on its parent branch is distinct from final delivery after all 32 children. No root acceptance or merge is claimed.

## Conservative policy ruling

Retain confirmed batch journals and nonempty event arrays until explicit owner settlement, even if no dirty key remains or cursors match. This favors retained recovery evidence over automatic reclamation. Its cost is potentially requiring explicit settlement before a clean refresh; it does not permit silent loss of unpublished intent. No Minor findings were deferred.

## Integration round 2 and native recovery dispositions

A fresh GPT-6.1 Sol / medium reviewer independently reviewed base 9af7350e3e7450abba1e6073c40bcd0fee4aeee4 through non-rewriting merge 3552a35df5e4713006cc0e4bfee3899368f6026d. Its complete report is retained in the adjacent round-2 file. It found no actionable Critical, Important or Minor issue and independently passed 561 offline tests. Every integrated prerequisite file matches native-delivered #2082 trunk 7b27ed149e48fd28c8da6e8a1544df52de10fea3. Retention source and the accepted plan, estimates, ranks and dependencies remain unchanged.

The reviewer explicitly left five boundaries to their owners:

1. **Live repair and remote source:** accepted separation of authority. The author performed the actual native update, fresh standalone dry-run and one apply; the handler returned healed after exact canonical read-back. Immutable originals, candidate, manifest and stdout are retained in 2055-actor-recovery. Offline artifact review is separate from current remote authority. No fabricated historical endpoint is claimed.
2. **Fresh final-head CI and native lifecycle:** accepted as mandatory subsequent gates. The previous 9af receipt was invalidated by native rework admission, along with twelve proof items. Fresh CI and native Test/Review/approval/Close are required; #2082's delivery does not satisfy #2055 acceptance.
3. **Future cleanup/publisher wiring and ownership settlement:** accepted pinned-slice boundary. This integration adds no such wiring or authority. Later writer, coordinator and handoff children retain those responsibilities; this is not a silent waiver of epic acceptance.
4. **Arbitrary external deletion or worktree destruction:** accepted specification limitation, matching round 1. Project-local preservation policy cannot turn arbitrary manual destruction into a recovery guarantee. No additional cloud/body store is introduced.
5. **Previously accepted persistence internals and whole-epic activation:** accepted boundary. The reviewer reran actual storage, package, timing and migration compatibility tests without replacing predecessor acceptance. #2054 remains Done; all remaining epic children and root gates remain mandatory.

No finding was deferred or dismissed. The live recovery's original actor contribution remains Unknown; known engagement was unchanged at 4,763,608 ms across the appended record, all four timing field projections remain null, and no incomplete actor remains in the candidate. These facts resolve the orphan evidence shape; they do not pre-tick native lifecycle gates.

## Recovery evidence round 3

The same independent reviewer verified the actual retained native archive and copies offline, reproduced the exact candidate, recomputed unchanged measured intervals and Unknown projections, and found no actionable issue. Its full round-3 report is committed verbatim. The five explicitly declined authority boundaries are ruled on as follows:

1. **Fresh remote canonical contents:** accepted distinction. The actual apply command exited zero and reported healed after the native handler's exact read-back; its output is retained. Disk copies do not establish later remote contents. Native Test and Review must independently acquire their current authority.
2. **Execution history and admission:** author-owned observed execution. The real native update returned success; the first unsupported router alias exited 2 before dispatch; the owned standalone dry-run and apply each exited zero. Source and transcript preserve direct-guidance admission and the per-issue lock path. One declared apply was invoked. Complete physical HTTP mutation count and hidden transport behavior remain unproven; no broader claim is made.
3. **Issue-body lifecycle authority:** accepted evidence limit. Native recovery fetched the canonical issue and validated its current markers, retaining issueBodySha 0c6b62a0371b48bfb8c7eee25797abe00ba65b9c7a347fc70c316f59ca59a94b. The archive does not contain that issue-body payload. The reviewer's supplied offline markers are explicitly not a substitute for fresh native authority.
4. **Prerequisite delivery and current state:** author-owned native receipts. Native provider delivery independently verified the exact #2082 source-to-trunk mapping and equivalent delta; Close exited zero, followed by a live CLOSED/Done read-back. These performed observations are separate from the offline review. No historical or cumulative-inclusion receipt was fabricated.
5. **Final-head CI and native completion:** accepted mandatory future gates. All code and these review rounds/dispositions must be committed before final-head CI and fresh native Test. The orchestrator then owns Review, approval and Close against the parent branch. No approval or Done is inferred from the evidence review.

All three #2055 review rounds and both #2082 review rounds are retained. No Critical, Important or Minor finding is left unresolved. The evidence review does not waive any remaining child or root gate.

## Capture coverage correction

Source inspection after the recovery found that the standalone native entrypoint does not bootstrap the gh capture wrapper. The author had retained AITM_GRAPHQL_USAGE=1 but omitted the wrapper PATH for the original dry-run and apply. Original request capture coverage and costs are unverified; stdout, immutable timing archive and native authority outcomes remain retained, but do not substitute for raw GraphQL telemetry. No lost observation or cost was synthesized. A correctly wrapped read-only native check subsequently returned already-canonical, inserted zero and the exact archived candidate hash. No mutation was replayed. Future standalone native entrypoints use the full explicit capture launch. This limitation must accompany any traffic window spanning those operations; no complete physical request coverage or savings claim is justified.
