# #2039 plan SAR round 2

Requested/used reviewer: `gpt-6-astra` / `high`, same persistent native reviewer. Exact formatted input: `plan.r1.md`, SHA256 `30637d3af07270cea3037a8c141298f1af055003fabf93f76a96f88b480c9158`. The reviewer reread the revised plan and inspected native record-envelope and Plan approval/forecast authority implementations. Prior F1–F7 dispositions remain present.

## Findings and dispositions

### P1 F8 — Locally derived rubric records must not invent cloud grants

The newly explicit evidence schema still said to use existing envelope validators for local derivations without addressing `aitm.record/v1`'s mandatory authority `{actor,epoch,grantId}`. The actual `createAitmRecordEnvelope` validator enforces this grant, and the spec forbids presenting derived-local evidence as cloud authority.

**Disposition:** Specified an explicit `aitm.local-derived-record/v1` wrapper retaining valid record identity, payload hash, predecessor/supersession and model provenance without a cloud authority field. Use the existing `createRecordId`, `hashRecordPayload` and payload semantic validators. Observed/imported real envelopes remain byte-preserved and validated with their real grants; no legacy schema is weakened.

### P1 F9 — A full timing-comment digest changes on every later append

The first receipt schema bound only the full timing resource digest. Comparing that old digest with the current log would invalidate all earlier completed visits after the next transition, contradicting the required two-transition behavior.

**Disposition:** Distinguish `resourceDigest` observed at publication from immutable `eventIds`/`eventsDigest` for that transition. Later reads validate the specific event subset and retain the old receipt; ordinary append changes the full digest only. Corrected/deleted old event subsets require reconciliation, while real measured work remains visible. Added explicit two-transition and altered-history tests.

### P1 F10 — Candidate body approval could deadlock pre-Status gates

The existing Plan-approved guard reads `ctx.body`; the planned-estimate guard loads current remote forecast/board projections; `verifyPlanTransitionAuthorityScope` independently fetches the cloud body. With approval/forecast changes staged until the one final post-Status body write, leaving these inputs unchanged would refuse every legitimate transition or tempt an unsafe local-as-published shortcut.

**Disposition:** Named the exact approval/forecast modules and defined separate candidate and published observations. Native provenance validates the staged approval and scope first; required comment/field effects actually publish and verify before Status; the existing authority comment binds the approved candidate scope/fingerprint and real transition. Scope validation uses the admitted frozen candidate plus baseline-equality proof inside the coordinator. Legacy reads remain supported. Final materialization rechecks scope. Synthetic local markers, stale approval/trunk/forecast and unconfirmed prerequisite effects still refuse. This changes observation ordering explicitly; it does not waive approval or fabricate an intermediate published body.

### P2 F11 — Shared interface details were inconsistent

The revised Task 12 code imported `storyCachePath` without listing that export in Task 2; staging's task signature omitted body/publication fields promised by the shared contract; Task 10 described guard reads before the snapshot they should consume. Pagination budgets also needed an invocation scope rather than accidental reset per reader.

**Disposition:** Added the export, aligned staging result fields, made snapshot/admission inputs explicit and shared the same snapshot budget across preflight/final/recovery readers. Corrected stale above/below references and a missing list delimiter. These are document/interface fixes, not product changes.

## Result

**Revise.** F8–F11 are addressed in formatted `plan.r2.md`, SHA256 `94520939e2e126d51a21f75385bbdc86c8f2d766e6f7b40482999d4587b0bd44`. No tests, network calls, lifecycle actions or Git commands were executed by this reviewer. Numerical workflow budgets remain acceptance targets awaiting actual implementation. Terminal full-document reread follows.
