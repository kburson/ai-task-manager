<!-- cspell:disable -->

# Independent whole-branch #1861 review

Reviewed head: ec1298af3571ce98b2d82100d22e20f393b2b2eb
Base: 171c7d93866f67b58effa635be5ae737f54ef9eb
PR: [#1871](https://github.com/kburson/ai-task-manager/pull/1871)
Reviewer: GPT-6.1 Sol, xhigh, fresh context, collaboration final_code_review.

Assessment: Not ready to merge. Four Important defects remain. Exact-head cloud CI passed, but its tests do not cover the identified boundaries. Genuine-host positive admission and governed Test ingestion remain unproved and unwaived.

This completes the existing review. The repository hook rejected the reviewer's scratch-file patch payload. The parent retained the complete returned report here with inline code formatting normalized; no findings or limitations are omitted.

## Scope and evidence

I reviewed the entire committed branch's relevant implementation in manageable passes, including the earlier kernel/prerequisites, empty-main publication/recovery, linked-v2 admission/recovery, registered bootstrap, batch compatibility, census and Node 24/26 label repair. Source inspection used pinned Git blobs and diffs, not native mixed WIP or the candidate directory's archived Git HEAD.

I read the required repository/task/reviewer instructions, both #1861 specifications, the revised empty-runtime Plan, current AC/contract handoff, execution record, review request, manifest and focused evidence index. The accepted one-story Plan remains 20.5h/rank 1; this review does not reopen its approval or decomposition.

I inspected the complete changed runtime implementation modules, relevant routing/admission, validator, packaging/guidance and fixture changes, principal contract/crash suites and compatibility/test diffs. Historical documentary evidence was inspected through the focused index and relevant subsets; I do not claim to have reexecuted the historical transcript corpus.

Executed evidence: retained [cloud run37172144479](https://github.com/kburson/ai-task-manager/actions/runs/37172144479) completed successfully at the exact reviewed head. Format/lint passed; all 941 unit, 253 integration and 55 slow files passed; Node 24/26 package compatibility and guidance cache budget passed; guidance publication gate was skipped, with no publication result inferred.

I verified retained raw-log sizes and hashes against .scratch/gh/1861-final-cloud-log-proof.json:

- Fast: 239553 bytes, SHA-256 a177c45e41f9d0263568d3d55dbda81eefc59497da000a77135ad9c4028d763e.
- Slow: 23950 bytes, SHA-256 1a90dd487f25e68e258b6398e2461a8abd0662219baa0a470e2cec4243cbeda5.

These are file census counts. CI is not a Test receipt. Earlier failed evidence remains historical evidence.

Static evidence: all four findings below derive from pinned control flow and durable-state ordering. I ran no candidate code or tests and claim no executed reproducer for these findings.

No source, index, HEAD, branch, worktree, binding, timer, lifecycle or public record was changed. No ai-peer-review, subagents or local full suites were used.

## Strengths

- Batch journals retain complete ordered before/after payloads, physical roots, generations and before identities before member publication. Recovery checks the complete recorded conflict set, and ordinary reads recheck batch admission.
- Empty-main activation has distinct closed schemas and four fixed records. Planning/apply validate all-root absence and protected ancestor/staging evidence without fabricating migration-v1 authority.
- Linked-v2 proof binds the physical root, operation UUID, exact approved digest and predecessor owners. Its ordinary reader explicitly fences unfinished recovery claims after active local control.
- Registered bootstrap parsing is bounded and remains reachable when ordinary guidance/binding/control admission is unavailable.
- Real SIGKILL tests verify signals and live/foreign/replacement/competing-owner refusal. Census and catalog prerequisites have dedicated contracts.
- Documentation packaging and historical capture provenance were repaired consistently. Archived replay is tied to its original source rather than represented as current operational acceptance.

## Findings

### Critical

None established. Important findings are material correctness and acceptance defects; no observed production data loss or demonstrated security exploit is claimed.

### I1 — Linked recovery creates an invalid predecessor chain after an unclaimed receipt

Locations: scripts/task-tracker/lib/runtime-initialization-recovery.mjs:77–89 and 118–126; runtime-activation-admission.mjs:285–304.

Trigger: R1 publishes its complete exclusive 000000.json linked-v2 recovery receipt, then is SIGKILLed before the owned journal. The original journal remains unchanged. After exact R1 death and coordinator recovery, R2 resumes.

Evidence:

1. The receipt embeds the original journal/digest at recovery lines85–89; owned journal publication occurs later at126.
2. Admission accepts this as unclaimed if the journal still equals the latest predecessor digest, at300–304; accumulated owner history includes R1.
3. R2 advances previousReceipt at63–72 but embeds the original journal again at85–86. Its owned journal receives original/R1/R2 history at118–126.
4. The next predecessor must contain original/R1 history and reference000000.json at admission285–290. R2's embedded journal has only the original owner and no receipt. The implementation creates a history its validator rejects.

Consequence: A conflict-free crash with complete protected evidence becomes unrecoverable through supported linked-v2 inspection/resume/read admission. R2 may publish the outcome, but final admission or later inspection fails RUNTIME_CONTROL_INVALID.

Missing boundary: runtime-linked-empty-crash.test.mjs:206–229 kills at after-initialization-recovery-claim; the v2 hook is at recovery127–128, after owned journal publication, missing the admitted unclaimed gap.

Minimum remedy: Reconcile the exact unclaimed predecessor before appending another owner/receipt, or encode and validate the legal transition. Preserve root/UUID/digest binding and exact death/conflict checks. Add a real kill after exclusive receipt publication and before owned-journal publication, successful exact later recovery, complete owner history, readable completion, competing/live/conflict refusal.

Classification: High-confidence static contradiction, no executed reproduction claimed.

### I2 — Recovery cannot finish after durably removing its coordinator

Locations: scripts/task-tracker/lib/runtime-migration-lock.mjs:389–391; retry refusal354–358; runtime-empty-recovery.mjs:133–171.

Trigger: Dead coordinator recovery publishes a prepared receipt, unlinks/fsyncs its coordinator, then is SIGKILLed before receipt completion.

Evidence: Durable ordering is prepared claim, exact lock recheck, unlink, directory fsync, complete receipt. Retry refuses absent coordinators before using the protected prepared receipt. Empty resume rejects any recovery group whose latest receipt remains prepared at169–171.

Consequence: The supported route disappears at a durable crash boundary. For unfinished empty initialization, a prepared receipt permanently blocks resume despite retaining prior lock snapshot/digest, plan/transaction and owner. Editing/deleting evidence or recreating a lock bypasses the protocol. Shared helper also serves operation recovery.

Missing boundary: runtime-coordinator-recovery.test.mjs:162–200 and runtime-empty-crash.test.mjs:242–249 kill after claim/before unlink. Writer-lease recovery already supports exact prepared-receipt/absent-owner completion at migration-lock485–500.

Minimum remedy: Complete using exact protected receipt when original lock is provably absent, sequence/predecessor valid, relevant owners authenticated/confirmed dead. Refuse foreign/replacement/live owners and unresolved competing claims. Add registered-route real kill between fsync and completion, repeated recovery/conflict cases, and prove empty resume becomes possible only after valid completion.

Classification: High-confidence static ordering defect, no executed reproduction claimed.

### I3 — Nested synchronous Promise misuse releases the actual coordinator

Locations: scripts/task-tracker/lib/runtime-migration-lock.mjs:689–700,313–328,616–634; public runtime-writer.mjs:151–167.

Trigger: A synchronous record/store mutation invokes a nested synchronous mutation returning a Promise. The outer callback discards the nested return or receives the inner async-misuse exception.

Evidence: Reentrant store branch returns operation() directly at694, bypassing the owning thenable guard. A discarded raw nested Promise lets the outer return normally and release the coordinator while async work remains. With nested record wrappers, inner lease detects Promise, throws RUNTIME_SYNC_WRITER_ASYNC and retains shared lease. Exception reaches coordinated before returned-result check; no catch retains coordinator, retained remains false, finally327–328 releases it. Only lease remains. Inherited mutation scope does not verify an actual coordinator digest.

Consequence: Whole-operation exclusion is lost while async work continues; another writer can acquire main coordinator. A continuation with inherited mutation scope can use the nested branch without actual ownership verification. Lease retention alone does not serialize another record writer.

Missing boundary: runtime-publication-validation.test.mjs:11–35 tests only direct single-layer Promise return.

Minimum remedy: Enforce synchronous thenable rule on reentrant calls; propagate retention to actual owning coordinator, including propagated RUNTIME_SYNC_WRITER_ASYNC; validate inherited ownership. Cover nested StoreLock/RecordLock discarded and propagated returns, typed refusal, both retained protections, competing-writer refusal and exact recovery.

Classification: High-confidence static cleanup defect, no executed reproduction claimed.

### I4 — Capture deletion accepts an incomplete bundle

Locations: scripts/task-tracker/lib/runtime-batch.mjs:123–152, especially132–146; runtime-capture-catalog.mjs:107–128.

Trigger: outcome.json declares stdout.bin stored with exact length/hash. Submit only stdout.bin with bytes:null, or delete only metadata while payload remains.

Evidence: validateMembers visits only supplied members. Deletion validates original bytes, and binary validation reads existing/original sibling metadata, so original payload passes unchanged stored descriptor. No resulting-bundle closure is required. Metadata validates descriptors without payload presence. Publication unlinks accepted member.

Consequence: Successful completed batch retains metadata claiming nonexistent stored bytes or strands protected payloads. This violates complete capture bundle deletion in kernel spec line22.

Missing boundary: runtime-batch-recovery.test.mjs:403–455 covers paired deletion/hash validation, not one-sided deletion or descriptor changes orphaning unlisted payloads.

Minimum remedy: Validate resulting dependency graph of affected capture bundles before journal/member publication. Deleted payloads cannot remain claimed stored; deleted metadata cannot strand payloads. Permit complete deletion or valid closed-family transition. Cover one-sided deletion, omitted sibling and descriptor orphan; refusal preserves bytes without partial publication.

Classification: High-confidence static whole-batch validation omission, no executed reproduction claimed.

### Minor

No separately actionable Minor finding asserted. Lower-confidence malformed-input/redundant guards remain explicit below.

## Declined to judge and limitations

None constitutes acceptance or is silently dropped.

1. Positive genuine native-host cross-PID admission: unchanged confinement denies production macOS observation. Fixture adapters/cloud owners/negative unleased-process cases do not prove positive invoking-actor admission.
2. Governed Test ingestion/finalization: no supported cloud-to-Test receipt capability identified in delivered scoped control. CI is not a receipt; no bypass invented.
3. Execution of four traces: reviewer ran no candidate code/tests. Static findings still require real-kill/reentrant/deletion tests.
4. Migrated-v1 original-root proof equivalence: runtime-storage433–480 checks physical identity only separately initialized roots; original migrated roots lack new mainActivation bootstrap/original-root checks. Part inherited. Without valid archived-v1 fixture/ruling, no parity certification or executed stale-root failure. Parent must disposition C1 closure or justified boundary.
5. V1 unfinished linked-recovery fencing after active control: storage461–480 omits receipts; v2 explicitly checks423–428. No equivalent-fencing certification or dismissal. Serialization/approval-only resume alone does not resolve broad unfinished-claim statement. Explicit compatibility disposition and targeted real-kill evidence remain needed.
6. First unbound/partial bootstrap artifacts: no guessed salvage demanded where accepted Plan requires protected refusal for insufficient original binding. Unlike I1/I2, complete bound evidence is absent.
7. Custom Node titles/renamed executables/unsupported process backends: broad completeness beyond observed supported Node24/26 labels unestablished. No repository producer sets process.title. Unknown coverage must refuse; supported-host positive requirement remains.
8. Capture .sequence high-bit input: ASCII decoding at capture-catalog96–100 may normalize high bits. Strict rejection merits disposition/test, but no supported consumer transition/executed impact established; no definite consumer grade.
9. Manually recomputed nested linked-plan schema mutations: no admitted corruption route shown with all protected bytes/proof digests manually rewritten. Normal APIs protected; adversarial manual proof rewrite not certified.
10. Main missing-control residue diagnostics: storage374–377 checks store/control, not all runtime-prefix residue. Reads still refuse; fresh apply independently refuses residue. No harmful authority grant established.
11. Dead retry guard: activation.kind==='empty' differs from real empty-initialization; preceding mainActivation validates ancestors already. No separate correctness finding; cleanup merits consideration.
12. Historical guidance/current operational acceptance: archived replay is provenance, not current publication/deployment/cleanup/forwarding/consumer adoption/timing transport owned by later children/joint C5.
13. Historical failure corpus/native WIP/private fixtures/archived candidate HEAD: not reexecuted or promoted to current authority; pinned implementation/scoped evidence/current logs govern.
14. Plan decomposition/reapproval/#1862: outside reviewer authority; accepted one-story/rank/estimate unchanged; no next story started.

## Recommendation and verdict

Perform focused repair I1–I4, retain every finding and declined disposition, obtain fresh exact-head verification. Existing CI verifies ec1298af only.

Ready to merge: No. Four Important defects plus legacy-v1 dispositions and genuine-host/Test capability boundaries remain. No package authentication, Test stamp, CODE_COMPLETE, lifecycle/GitHub approval, delivery authority or permission to advance1861/1862 is granted.
