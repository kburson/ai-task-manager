# #2071 Public Activation Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for the approved implementation; no product implementation is authorized by this document. Steps use checkbox syntax. Root must inspect the exact design, source manifest and fresh peer review before Phase6.

**Goal:** Make routine existing-issue writes stage locally, with truthful working/published reads and one native, guarded transition publisher, without losing delivered fixes.

**Architecture:** Keep the existing issue identity, persistent writer claim, native producers, generation store and transition journal. Add one typed operation-evidence envelope to carry exact staged deltas, and rebind authority through native producers rather than trusting serialized capabilities. Switch public entrypoints and their result consumers together.

**Tech Stack:** Existing Node.js >=24 ESM, repository Git object provenance, existing AITM native guards, GitHub GraphQL/REST adapters and node:test. No new dependency, daemon, policy engine, clock or authority database.

**Spec:** Governing spec S and technical plan T below; this document contains the #2071 integration design missing from Task30. It does not amend the accepted #2039 carrier route or its five parent documents.

## Global Constraints

- Work is owned by #2071 in A on D. P stays at K and unheld. Preserve C/O/H/B and all original dirty/untracked O content.
- This revision is DOCS ONLY. No imported source, executed product tests, lifecycle promotion, dependency removal, parent checkpoint, push or merge.
- Native refusal means stop and retain the exact output. No alternate writer or disguised retry.
- Routine staging after explicit admission makes zero cloud reads and writes. Native command preflight, source/edit/commit/lifecycle guards retain their required observations and are measured separately.
- A local checksum, cached marker, serialized permission flag or claimed provider ID is not approval, execution proof, current remote state or publication.
- The native transition owns publication. No missing-cache legacy fallback, automatic uncertain retry, compensating body overwrite or intermediate public activation release.
- Original schemas retain exact identity, immutable payloads, one owning human/agent/worktree, measured Unknown and per-visit completion. Provider compare/write remains non-atomic; do not advertise CAS.
- All supported source/caller boundaries below must be implemented and verified together before release. #2050 end-to-end budget work and #2051 adoption/admin work remain separate; routine contract operations cannot be deferred to them.
- Keep #2145 as an edge throughout Develop. Source readiness and native integration/trunk-drift qualification precede any later removal.
- No new defect stories or execution of held Plan work. The missing integration is part of existing #2071.

## Review Focus

1. A genuine native proof operation survives a process restart and publishes; structurally plausible forged bytes do not.
2. An interrupted durable write never acknowledges working content and its operation evidence from different generations.
3. Contract/capsule creation and reviewed pointers never invent a GitHub ID or fall into a second writer after returning staged.
4. Every real CLI/hook/process reaches mandatory claim resolution and native transition ports while preserving required remote guard observations.
5. Reconciliation with newer K preserves current-scope approval, unique visits/state, remote observation forwarding, convergence and session authority.

## Pinned inputs and status

A = /Users/kpburson/.codex/worktrees/aaff/ai-task-manager.
D = codex/2071-public-activation-20261106.
P = codex/2039-integration-parent-20261106.

| Pin                                              | Exact commit                             |
| ------------------------------------------------ | ---------------------------------------- |
| K, current source baseline and parent checkpoint | 849239a672fdae97c9475e47bcc5eb8fc050f6fd |
| Z, delivered trunk beneath K                     | 2e5a3feec6d6296778f767977cf8086f587d1967 |
| O, committed historical #2071 candidate          | 58ed1ec27c9cc88ec9dfde4d23d4ef2428a2c3d4 |
| H, historical completed-prerequisite carrier     | 9514fcd7d5f24fc63335fb08f6efde05d19e4275 |
| S, governing spec                                | dafb1d276036ddc17490f76329f6aa2c09732a15 |
| T, original technical plan                       | f2894455a97bb80f6afb82ce5ff722cad2a46c2b |
| J, active child Task30 plan                      | 0ad57329a5eb4e3aec395adb06a6216178e45c87 |

S:path is docs/superpowers/specs/2026-10-19-2039-local-estimation-guarded-publication-design.md.
T:path is docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md, especially source census104–124 and Task10 639–688.
J:path is docs/superpowers/plans/2026-10-20-2039-active-child-execution-plan.md, Task30 933–959.

A source expression O:path or H:path below is an exact Git blob object expression after replacing the pin with its full commit. It is not a branch-tip input. Paths in manifest tables are relative to scripts/task-tracker/lib unless explicitly prefixed scripts/. Full blob hashes are supplied for the cache subgraph already read. Owner means historical attribution, not approval of the resulting integration.

**Readiness:** Root and an independent Astra6/xhigh source reviewer accepted the finding that a bulk import is unsafe, not product readiness. Source qualification was read-only. No tests in this document have been executed for #2071. The preliminary chat called the candidate cache graph “34”; the retained inventory contains **35** entries (8 identical, 5 H-identical missing leaves, 22 other candidates). This document corrects that counting error. None of those counts constitutes source acceptance.

The original 3.5h Task30 allocation assumed delivered, compatible prerequisites and only small activation seams. Current delivery lacks prerequisite modules, and actual proof/contract consumers require integration. Planning estimate for the work below is **24–34 active engineering hours**, excluding review wait and future #2050/#2051 work. This is an engineering estimate, not a board-field change or a promise that the original allocation remains adequate. Root must assess it with the reviewed plan before Phase6. Keep the work in #2071; the task steps are reviewable increments, not new stories.

## Design choices

1. **Chosen: typed operation records plus native rebind.** Retain immutable inputs/deltas within the existing generation and re-establish authority from native evidence on restart/freeze. This uses existing producers and supports honest staged results.
2. **Rejected: broaden generic override flags.** A union of evidenceStamp, allowMarkerLoss or reviewed permissions lets one edit authorize unrelated changes and has no durable source authority.
3. **Rejected: publish proof comments immediately while staging the body.** This breaks the local-staging contract, splits failure domains and permits false provider identities.
4. **Rejected: copy O wholesale.** O removes newer current-scope approval, observation and session/convergence safeguards. Select exact additive/necessary hunks against K.

These are the author's design choices under the owner's replan authority. They are not newly attributed human approvals.

## Contract A — operation evidence and authority lifetime

### Representation and atomicity

Keep the existing manifest/generation identity and counters. Add a strict working issue payload version **aitm.story-issue-update/v2**:

```text
{
  schema, body, title,
  operations: [
    {
      schema: "aitm.story-staged-operation/v1",
      operationId, kind, identity, claimId, issuer, sourceGeneration,
      target, beforePayload, afterPayload, beforeDigest, afterDigest, inputsDigest,
      evidence: [{kind, locator, digest}],
      effectKeys, predecessorOperationId
    }
  ]
}
```

The exact top-level keys are schema/body/title/operations. Exact operation keys are those shown; absent optional values are null. Digests use the existing SHA-256/canonicalRecordJson convention. identity is the complete native issue/project identity; target is a typed body target, owned-comment/record target or configured project-field target. operationId is a native local operation ID, never a provider ID. issuer is the exact native {human,sessionId,worktree,cachePath} tuple at issuance; claimId alone is insufficient because acknowledged handoff preserves that ID. kinds are the closed set neutral-body, neutral-title, neutral-field, owned-comment, evidence-stamp, evidence-check, reviewed-scope, native-plan-approval, native-decomposition, lifecycle-marker, contract-capsule and timing-repair. beforePayload and afterPayload are immutable contained payload references for the complete affected-resource value map. Their digests cover canonical semantic values (body/title/comment/field bytes), excluding the enclosing operation list and capabilityRef to avoid a self-hash cycle. Ordered operations must reproduce every intermediate value from retained bytes; the final value map must equal the generation’s working resources. A hash without its referenced bytes is unavailable.

Neutral operations have evidence:[] and cannot touch protected proof/marker/directory targets. evidence locators refer only to canonical native evidence sources: exact Test receipt, native verifier cache entry, reviewed manifest plus artifacts, native approval source/selection, native decomposition inputs or already observed published evidence. They are not arbitrary file paths supplied as authority. A retained artifact path must pass its owning native path/subject validator.

Store the canonical operation records and any immutable copied evidence bytes in the SAME proposed generation as all affected working bodies/comments/fields. The issue working entry capabilityRef is operations:<SHA256 of canonical operation list>; each affected resource references the same operation ID through its typed candidate payload. The store validates every reference/digest and complete resource set before publishing the new manifest. No second evidence journal or later “attach proof” write.

Use the existing store expectedGeneration comparison, immutable payload write/fsync and manifest publication. Only return staged after reading the exact manifest generation and all referenced bytes back. A failure before publication leaves the old generation authoritative; orphan immutable bytes grant nothing. Failure after an uncertain manifest publication is reconciled by exact readback, never by acknowledging a guessed generation. Conflicting concurrent staging is a typed stale-generation refusal.

Reading an envelope validates integrity only. It produces an unpublished view with authorityState:'needs-rebind'; it cannot produce a native grant. v1 neutral payloads remain readable without inventing operations. Existing private retained Plan approval payloads remain recognizable; their native issuer/rebind path must produce an explicit operation before publication. Unsupported privileged payloads are retained and refused with a named renewal route, not silently stripped or migrated.

### Interfaces and native producer ownership

Create:

- story-cache/operation-record.mjs: strict pure encode/parse/digest, ordered chain and target/effect-reference validation. No provider or process execution.
- story-cache/operation-authority.mjs: native dispatcher and process-local grant registry. It calls the fixed producers below; it accepts a kind plus typed request, never a caller-produced “verified result” or arbitrary mutator callback as proof.

Interfaces:

- prepareNativeStoryOperation({store, claim, cfg, kind, request, admission}) -> Promise<{grant, operation, changes}>.
- validateNativeStoryOperation(grant, {identity, claimId, generation, before, after, effectKeys}) -> immutable validated descriptor.
- rebindNativeStoryOperations({record, store, claim, cfg, admission, phase}) -> Promise<{grants, operationsDigest, checkCurrent}>.
- commitStagedStoryOperations({store, claim, expectedGeneration, prepared}) -> Promise<StageResult>.
- readWorkingOperationChain(record) -> validated data only, no grant.

Production dispatch is a fixed module-owned table. Native producer implementations derive their own target, declaration, command, actor and candidate from actual current native inputs. Do not expose mintGrant(result), trust a caller's success boolean, or permit runtime CLI/deps JSON to replace production validators. Test injection is confined to offline fixture construction, not public arguments/environment.

The dispatcher registers a grant only after the producer returns from its genuine operation under the current owner. The grant is an unforgeable process-local object held in a private WeakMap, bound to exact identity/claim/generation/operation digests. It is revoked after commit/freeze scope exits, lock release, actor/root drift or any relevant input change. It is not serialized.

| Kind                 | Independent native producer and evidence                                                                                                                                                                                   | Rebind after process loss                                                                                                                                                                                                                                                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| evidence-stamp       | ac-stamp/dod-stamp/evidence-markers select declaration from working body, run existing evidence-runner or validate exact existing Test receipt; preserve declaration identity, artifact operator and issue-proof authority | Re-read original native Test receipt or eligible verifier-cache entry using native validators and exact source/declaration fingerprint. Cached operation bytes alone cannot attest a run. If no independently reusable evidence exists, require the normal native stamp command to rerun/renew in a stage that permits it; never auto-run tests inside transition. |
| evidence-check       | check/auto-tick evaluates native evidence gate against the exact working target and corresponding rebound evidence operation or published evidence                                                                         | Recompute the gate and target identity; a stored checked glyph is insufficient. Honest non-demonstrable hatch remains a distinct native declaration, not execution proof.                                                                                                                                                                                          |
| reviewed-scope       | reviewed-scope/runtime reads bound manifest and artifact bytes, validates real review/target/lineage/actor; record.mjs computes exact allowed pointer/tick delta                                                           | Re-read manifest/artifacts and real current native identity; use bounded admitted current comment observations for predecessor/current record. Recreate its native capability without republishing the record. Changed manifest, target, source or predecessor refuses.                                                                                            |
| native-plan-approval | existing runPlanApprove plus current-scope route, direct-guidance/native mode, exact plan/trunk/forecast/scope; #2069 native issuance and K currentApprovalDigest are both preserved                                       | Rebind via the native approval owner and current source/selection validators. Full-Auto requires the actual currently authorized native mode. A persisted human-mode string cannot recreate human consent; absent independent native approval authority requires explicit native approval renewal. Never turn a historical exemption into present approval.        |
| native-decomposition | existing decomposition native issuer derives assessment/projection from validated inputs and scope-specific native observation                                                                                             | Recompute through native issuer with identical source/selection and owner; neither serialized assessment nor projection alone grants permission.                                                                                                                                                                                                                   |
| lifecycle-marker     | registered lifecycle command derives exact state/visit/cursor/marker mutation from native action decision and event identity                                                                                               | Re-establish the same registered native boundary; ordinary staging cannot mint completed state/receipt.                                                                                                                                                                                                                                                            |
| contract-capsule     | native contract operation planner validates original contract epoch/grant, semantic record IDs and evidence producer for record-evidence                                                                                   | Recompute from exact native contract/evidence lineage and current working predecessor; confirm published predecessors in transition before dependent effects.                                                                                                                                                                                                      |
| timing-repair        | existing explicitly requested healer validates the exact retained row/event candidate                                                                                                                                      | Re-run the pure candidate validation and identity checks; it never confers lifecycle completion.                                                                                                                                                                                                                                                                   |

Native verifier caches/receipts are existing protected native sources, not a new cryptographic root. This does not protect against a process with arbitrary permission to replace all native evidence/runtime code. Within the supported command boundary, editing only the story cache cannot forge authority. A positive restart test must use a real native exact-source receipt or cache path, not a test-created permission object.

### Exact producer requests and dispatch ownership

The request is data describing the requested native action, not a claimed result. Every request includes only its kind-specific keys below; identity, actor, current source, state, scope and current generation come from the native context. Existing function names remain public; add the named adapter export to the existing owning module and call it only through operation-authority. Adapters return {changes,evidence,effectKeys}; the dispatcher registers the grant after native validation. No exported adapter returns a reusable permission token.

| Kind / request keys                                                              | Adapter added in the existing owner                                                                                                                                                                         |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| neutral-body / {body}; neutral-title / {title}; neutral-field / {fieldId,value}  | stage-body.mjs: prepareNeutralStoryDelta({context,kind,request}); native neutral invariant checks cover the composite                                                                                       |
| owned-comment / {resourceKey,body}                                               | stage-comment.mjs: prepareOwnedStoryComment({context,request}); key must be an already validated owned resource or an issued creation intent                                                                |
| evidence-stamp / {family,labels}; family is ac, vc or dod                        | evidence-markers.mjs: prepareNativeEvidenceStamp({context,request}); existing ac-stamp/dod-stamp wrappers select declarations and invoke evidence-runner or exact receipt reuse                             |
| evidence-check / {labels}                                                        | verbs/check.mjs: prepareNativeEvidenceCheck({context,request}); exact existing stamp identities and declarations, no caller supplied success                                                                |
| reviewed-scope / {manifestPath,operation}; operation is record or invalidate     | reviewed-scope/record.mjs: prepareNativeReviewedScope({context,request}); owning runtime validates contained manifest and artifacts                                                                         |
| native-plan-approval / {currentScope,repairFromEvidence}                         | verbs/plan-approve.mjs: prepareNativePlanApproval({context,request}); delegates current native ordinary/current-scope route and native source selection                                                     |
| native-decomposition / {purpose}; purpose is assessment or projection            | plan-decomposition-staging.mjs: prepareNativeDecomposition({context,request}); reads native selected source and authority                                                                                   |
| lifecycle-marker / {action}; action is the registered native command's action ID | markers.mjs: prepareNativeLifecycleMarker({context,request}); requires the dispatcher to carry the real native action decision, never a serialized decision passed in request                               |
| contract-capsule / {action,target,recordRequest}                                 | github-records/contract-write.mjs: prepareNativeContractCapsule({context,request}); action/recordRequest are the existing contract planner's discriminated operation, validated by its current schema       |
| timing-repair / {rowIndex,repairKind}                                            | gh-timing-comment.mjs: prepareNativeTimingRepair({context,request}); exact repairKind comes from the existing healer's registered supported operations; retained candidate/event bytes are derived natively |

The explicit file additions in this table are NEW #2071 integration seams, not claimed O exports. Lifecycle action IDs and contract operations use their existing closed native registries; introducing a new action or contract operation is outside this plan.

### Restart and handoff decisions

No existing independent durable artifact was found for a newly issued, unpublished human Plan approval or chat-relayed Review approval. Direct-guidance admission proves guidance was read; it does not prove human consent. A working marker, a Full-Auto mode string, an operation digest and an action-ledger entry generated from the same candidate cannot fill this gap.

Accordingly, rebind accepts already published approval only after the current native approval/lifecycle evidence validators verify its exact observed artifact and scope. Full-Auto rebind invokes the native approval owner under the currently authorized native Full-Auto context, preserving that truthful provenance. A new human approval with no independent native consent source cannot be recovered merely by rerunning validators. The implementation must not acknowledge it as restart-safe.

**Concrete consent limit for primary XPR:** do not introduce a stronger consent requirement at initial issuance than the existing native producer requires. K runPlanApprove chooses human versus explicit Full-Auto from its native environment and validates current source/scope; K runApprove recognizes its native --human/published human checkbox path and preserves accepted review/Test evidence. Keep those actual rules. An unpublished approval whose original native authority cannot be re-established in a new process remains visible pending intent and returns STORY_OPERATION_RENEWAL_REQUIRED before freeze/effects; it is not silently invalidated or relabeled as human-approved. Return the exact owning command (plan-approve or approve), source/scope mismatch and reason. Do not automatically loop that command or promise that every human intent survives a process boundary. The supported autonomous path uses actual currently authorized Full-Auto renewal and independent review, never an invented human act. A valid already-published human approval remains reusable under existing native scope/receipt checks. No new consent store, signing key, approval prompt or generic bypass is included. Primary XPR must assess these explicit supported cases and limits against the governing spec; it must not infer universal recovery.

For non-approval lifecycle markers, rebind is permitted only for the exact event derivable from retained native timing events or an independently validated Test/Review/delivery/completion receipt. State-entry/completion markers requiring a transition receipt are publisher-derived; they are not independently stageable declarations. A native action decision is reevaluated against the same source/state/visit; it cannot attest that a past external effect happened.

After acknowledged handoff, preserve the original operation bytes and issuer tuple. readWorkingOperationChain remains data-only. rebindNativeStoryOperations additionally validates the existing native registry's completed transfer and exact bundle acknowledgement connecting that issuer to the current owner. Neutral content survives. Evidence-stamp/check and timing evidence can survive only when their native evidence validator admits the unchanged source and original actor provenance for the new owner. Decomposition and Full-Auto approval must be rederived under the recipient's actual current authority. Reviewed-scope actor/target checks remain native; a changed required actor refuses. Human consent follows the explicit limit above. There is no automatic authority transfer just because bytes were acknowledged.

Add renewNativeStoryOperations({store,claim,cfg,admission,operationIds}) in operation-authority.mjs for those kinds with independently revalidatable evidence. It recomputes the exact existing operation against its retained before/after values through its native owner, validates the acknowledged handoff when needed, and creates only current-process grants. It does not rewrite history or treat the recipient as the original executor. If revalidation changes the requested delta or native consent is absent, return a typed renewal-required refusal with no content change; use the existing owning command's invalidate/restamp route, preserving unrelated staged content and old generations.

### Staging, freeze, publication and invalidation

1. Resolve current persistent claim from actual provider session/root. Hold the native issue lock for the atomic generation operation; revalidate before and after async work.
2. Derive and validate each requested exact delta with its own native producer. Check the incremental delta and the complete published-base-to-working composite. Verify ordered before/after digests and disallow unrelated protected changes.
3. Persist the operation evidence and all resource changes atomically; acknowledge only exact durable readback.
4. A later neutral edit preserves valid operations only when their target, source/declaration/plan/forecast and protected deltas remain unchanged. Otherwise refuse that edit or use the native owner’s explicit invalidate/renew operation. No permission union and no silent evidence deletion.
5. At freeze, under current claim/lock, rebind ALL privileged operations from independent native sources and current admitted observations. Freeze operationsDigest and required effect keys into batch approved input digests. A valid marker copied from another issue, generation, actor, visit or source never matches.
6. Extend stage-body, stage-comment, store, view-payloads, views, stage-capabilities, batch, native-transition and native-authority together. In particular O native-transition currently rejects non-null capabilityRef at line56; it must consume rebound native operations, not merely remove that check.
7. Execute the full native guard registry on the exact frozen candidate plus current published observations. Authority requiring actual published comment/field evidence is checked again after confirmed prerequisite effects and before Status.
8. Materialize typed provider-ID slots only from journal-confirmed effects, revalidate the final body/composite, dispatch the final issue write once, confirm the complete vector, then commit completion receipt/publication cursor. Operation data remains retained evidence; it does not become an evergreen grant.
9. On restart/uncertainty, use the existing observation/recovery journal. No new dispatch until its existing typed recovery permits it. Do not rerun proof producers to conceal uncertain provider effects.

## Contract B — public results, views and capsule intents

### Results

```text
StageResult = {
  status: "staged" | "no-op",
  publication: "unpublished",
  generation: positiveInteger,
  operationIds: [localOperationId],
  dirtyKeys: [resourceKey],
  body?: string,
  title?: string,
  intent?: {key: "comment:new:<localIntentId>", recordId?: nativeRecordId}
}
PublishedResult = {
  status: "confirmed",
  publication: "published",
  publicationGeneration,
  receipt,
  effects: [{key, providerIdentity, observedDigest}]
}
```

Only the native transition publisher returns PublishedResult. A staged no-op is not a remote no-op. Public signatures/reexports stay available, but callers must consume the discriminated publication/result contract. Do not return directory-written, a remote URL, commentNodeId or readback proof for an unpublished operation. Existing actual provider IDs may be retained as target identity, explicitly distinguished from confirmation of changed content.

Expose readWorkingStory({identity,claim}) for authoring and readPublishedStoryObservation({repository,issue,projectId,host}) for fresh guard/remote authority. storyView requires explicit authority. Identity-mutate “fetch” callers must migrate to the corresponding reader; no hidden identity-mutation provider read.

Keep observeRemoteBody semantics on any genuine remote observation: the initial remote read and verified provider read remain distinct. A local candidate is delivered only through StageResult/working view. Preserve the existing third actual-remote argument to validateFreshBaseAsync; admitted transition readers provide that exact remote observation, never the candidate.

### Contract/capsule and reviewed-record creation

K and O github-records/contract-write.mjs are identical. Its325–359 path directly calls createCommentWithGh/appendCapsule/readback and updateIssueComment. check.mjs branches on directory-written; ac-stamp records evidence through this family. They are routine supported operations.

Add stageDirectoryContractOperation({context, action, target, evidenceRequest}) in contract-write.mjs. It invokes the existing pure planner/semantic validators, and native evidence producer where required, then atomically stages:

- the immutable capsule envelope/body with its real native record ID and stable local creation intent;
- its expected semantic predecessor record ID and contract epoch/grant;
- the delivery-contract projection update and exact dependency on the new capsule;
- any issue-directory or reviewed-pointer slot requiring a real provider identity.

Do not run appendCapsule’s provider execution/readback loop during routine staging. Keep its pure chain planning/validation; route transport through the journal. Working records have {envelope,body,source:'working',intentKey,providerIdentity:null}; published records retain real IDs. Never feed an invented pending ID into a parser whose return value represents an observed GitHub record.

Distinguish node IDs from fullDatabaseId strings. Final-body/template slots declare the exact required identity type and effect key. A native record ID is an allocator-created semantic ID, not a comment ID. After confirmed create, save its returned/observed identity before filling slots. Lost create response becomes uncertain and forbids automatic recreate. Projection update follows the capsule dependency, then any authority check, Status and final body.

check’s single/batch branches and all contract callers recognize StageResult as handled and do not fall through into legacy body writing. User output says staged or already staged. It must not say published/recorded remotely. Readback during routine authoring reads exact local generation; native publication readback remains remote.

### Exact materialization digest domain

Operation beforeDigest/afterDigest bind canonical affected-resource values before provider-ID realization. An unresolved value is an existing body-template structure with exact literal segments plus typed slots {effectKey,identityType}; it is not a string with guessed IDs. Freeze binds the full template digest, slot declarations, ordered operation list and dependencies. A slot may appear only in the syntactic location admitted by its native planner.

Add validateMaterializedStoryOperations({operations,template,confirmedEffects,materializedValues}) to operation-record.mjs. It is a pure equality check, not authority issuance: reconstruct values by substituting only the declared slot from the matching effect's journal-confirmed provider identity and compare every byte of every resulting value. native-transition supplies the genuinely confirmed journal outcomes and validates their effect keys, kind and exact native record/envelope lineage before calling it. A node ID cannot fill a database-ID slot; a successful unrelated create cannot fill a different effect's slot. The rebound grant authorizes that exact substitution, not a fresh arbitrary afterDigest.

The final body has a distinct realized UTF-8 resource digest, persisted in the batch before dispatch and checked on remote confirmation. Retain the original operation/template digest unchanged. This avoids changing authority to fit final bytes or creating a self-hash cycle. Tests must reject correct ID plus unrelated body edit, wrong identity type, wrong effect identity and unconfirmed outcome; a correct journal-confirmed substitution succeeds.

### Native entrypoint construction

Create the production context at the actual command runtime boundary after existing native preflight has admitted the operation:

- bin/aitm.mjs -> task-tracker.mjs -> runtime/verb preflight retains current source/session/activity gates.
- The explicit public acquisition route is the existing /task start #N (including numeric bind), /task resume #N and /task switch #N. No new verb or user opt-in. Add ctx.admitStoryWriterForBind(issueNumber) in runtime.mjs, delegating to admitNativeStoryWriter({cfg,issueNumber}) after real native readiness/worktree/occupancy admission and before the first target timing/content mutation. verbStart already delegates to verbResume; wire both resume branches and switch, including the already-bound no-op before its return. Reusing a valid claim must not add a timing event.
- Acquisition uses bounded current target identity, singleton authenticated human and complete inventory. Failure uses the existing bind failure/occupancy release path and never reports a successful writable binding. Do not undo an already recorded prior-issue departure or fabricate its replacement. Switch resolves the old writer before staging its departure; it cannot borrow the new target's claim. Explain, reports, arbitrary readers, hooks and ordinary staging never acquire. A user with an existing active binding and no cache can invoke Start on that same issue to initialize without resetting the timer.
- A new CLI process or installed hook resolves its real current provider session, bound issue, physical root/branch and persistent claim. It opens the exact store without hydration; no copying another session ID into env. A different process in the same native session may reuse the claim after real identity checks.
- The ordinary staging helper receives only this native context; absent/corrupt/frozen/foreign/transferring claim refuses. Hooks never acquire on behalf of another actor or repair the store.
- scripts/gh/move-state.mjs constructs mandatory store/claim/ports at its real issue-lock boundary. runtime.runMoveStateInProcess forwards the ordinary native context; optional test-only ctx.storyCache is not production activation.
- Preserve the host’s matrix/one-step routing, cursor, operator and preflight checks. Evaluate the full candidate-aware registry once through the sealed coordinator; do not first publish legacy guard side effects or execute both sagas.
- move-state-core must refuse an absent production cache context for supported existing-issue transitions; it must not choose legacy writes because a property is undefined.
- Network-skipped fixtures remain explicitly skipped, not publication success. Native direct low-level transports require publisher authority or a separately admitted creation/admin purpose.

### Observation and budget contract

The ledger distinguishes command admission, proof/source guards, staging, transition snapshot, native graph, effect mutation/readback and final census. Zero applies to staging, not to required native source/lifecycle observations. Tests assert both zero staging calls and the presence of required native observations.

Reuse the shared bounded snapshot budget (O snapshot-reader53–75: maxPages10, maxBytes4194304), including preflight/final census/recovery within one invocation as its existing contract requires. The native target/parent graph is a separate explicitly counted native-guard observation, shared across its scoped readers; it is not estimated-history discovery. Do not claim whole-transition #2050 budget qualification from unit tests here. Missing/partial observations refuse rather than empty-default or shadow reread.

## Source acceptance manifest

### Disposition rules

KEEP means retain K. REUSE means introduce the exact pinned prerequisite module only after the final reviewed manifest and tests admit it. ADAPT means use named historical logic against K plus this contract; never checkout the historical whole file. New code has #2071 ownership and cannot be attributed as a closed prerequisite.

All listed inputs are committed Git objects. No B history/review evidence, O worktree contents, untracked payload, private runtime state or old chat is an input. Do not recursively import a directory or use a changed-file count as acceptance.

Verifier aliases: A=operation/staging/composite tests; C=claim/store/retention/handoff; P=native transition/provider/journal; V=views and public-result authority; T=timing/receipt/Unknown; E=Plan/forecast native provenance; R=delivered-preservation regressions. Exact new integration verifier files and test steps are below.

### Cache subgraph with verified blob hashes

| Destination relative to lib/              | Historical owner and last relevant commit at O    | O blob                                     | K comparison                                           | Disposition and direct consumer                                                    | Verifier |
| ----------------------------------------- | ------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------- | -------- |
| `story-cache/activation.mjs`              | #2071; `eb67ec2919ab76de18a291525259c5ab3e026b8e` | `379903083e03c6a19ebc4397e2600f01b9a5dd45` | absent                                                 | REUSE O after interface verification; Explicit acquisition/local writer resolution | P        |
| `story-cache/stage-body.mjs`              | #2071; `eb67ec2919ab76de18a291525259c5ab3e026b8e` | `0a7959843afd777665b546d3d4413b2dc4334a5b` | absent                                                 | ADAPT with A/B; Body/title/field staging; add A atomics                            | A        |
| `story-cache/stage-comment.mjs`           | #2071; `eb67ec2919ab76de18a291525259c5ab3e026b8e` | `5eababb986a23db0394b4561abac9c20ffa05ef1` | absent                                                 | ADAPT with A/B; Owned comment/intents; add A/B atomics                             | A        |
| `story-cache/transition-batch.mjs`        | #2071; `eb67ec2919ab76de18a291525259c5ab3e026b8e` | `5a2c5a1dc80b02dfd9903b43bcf0cc854994faa6` | absent                                                 | REUSE O after interface verification; Mandatory sealed publication entry           | P        |
| `story-cache/native-ports.mjs`            | #2071; `f472e6bb67a1a7d81e75848ab7fc433bf1434063` | `b66b3e32af70d6dcf182e73a021b886b94a3c506` | absent                                                 | REUSE O after interface verification; Bounded current native observation ports     | P        |
| `story-cache/native-transition.mjs`       | #2071; `eb67ec2919ab76de18a291525259c5ab3e026b8e` | `52293d38d21e4441b27fbf10667dd23da3d7aa82` | absent                                                 | ADAPT with A/B; Build effects; support rebound A grants                            | P        |
| `story-cache/views.mjs`                   | #2049; `3ff10bcf65b2efe6a1386cba16e6f212eef986b3` | `30ec341cb420ccf78f45a95894d6bb9fb9153225` | absent                                                 | ADAPT with A/B; Explicit detached views; support operation envelopes               | V        |
| `story-cache/timing-authority.mjs`        | #2070; `916139efb295b9b5e6cb3f3fe652609d41b4ccf8` | `6a92eb5106018a2a2424c8859a747bda915c0339` | absent                                                 | REUSE O after interface verification; Measured time versus visit completion        | T        |
| `story-cache/retention.mjs`               | #2055; `312f38bc2bc4d9e440ec2f1b39cd0b72428d96af` | `4c1b110303ef2e91cdfddd8a10ded3c8160d64a2` | absent                                                 | REUSE H bytes; Protect unpublished generations                                     | C        |
| `story-cache/writer-handoff.mjs`          | #2057; `f0475123bec226e79aac28068ab4f8a453aa015f` | `d95b44329036172b7f028a1478c1bb156344a669` | absent                                                 | REUSE H bytes; Acknowledged transfer                                               | C        |
| `story-cache/writer-registry.mjs`         | #2090; `930b05780af85128a47c02e18be065c4f7c01d23` | `5eae73b8f3cb5e0a9c9d647a82e423f42f3aee9d` | same                                                   | KEEP K (identical); Persistent one-writer ownership                                | C        |
| `story-cache/store.mjs`                   | #2069; `dac71bf802547e91e20273644899565ce84d97df` | `5e1e098609bb09a73fccad190b87070a27154014` | different (`59564d1194cd286f3838e4f0bad9d48408532d47`) | ADAPT with A/B; Atomic generation; validate operation references                   | P        |
| `story-cache/manifest.mjs`                | #2090; `930b05780af85128a47c02e18be065c4f7c01d23` | `57fd33e8414f407baf8520d49dcf6d7756a09c6a` | same                                                   | KEEP K (identical); Existing generation/identity validation                        | P        |
| `story-cache/snapshot-reader.mjs`         | #2071; `3fcca13a3e597c447b198d46c62fac16f99219cf` | `82e49a7a3e5089c791dcb292e32acbbcd48e21c7` | different (`d5c66de59ab00197e6884bdbb409d091562eeb1b`) | REUSE O after interface verification; Complete bounded resource census             | P        |
| `story-cache/timing-candidate.mjs`        | #2071; `eb67ec2919ab76de18a291525259c5ab3e026b8e` | `fa3aa489a0daf10da8d6bfa8d9df2f3d4dc458c6` | different (`9a68ff6c41d6c68b3be8f9be428738b670a03d12`) | REUSE O after interface verification; Native timing freeze                         | T        |
| `story-cache/writer-claim.mjs`            | #2090; `930b05780af85128a47c02e18be065c4f7c01d23` | `dfb23c491258fcd359a7a83aac67d4a9be774f5e` | same                                                   | KEEP K (identical); Current claim assertion                                        | C        |
| `story-cache/view-payloads.mjs`           | #2049; `169a4183e36086275eebfb7022d5b60071709005` | `ae4e6dd9d0d3ec77fe79ebaf60fb8d010144087e` | absent                                                 | ADAPT with A/B; Strict working/approval decoding                                   | V        |
| `story-cache/native-authority.mjs`        | #2071; `eb67ec2919ab76de18a291525259c5ab3e026b8e` | `077f4bbc7723a70f042a91f0a071049ebe1d18cf` | absent                                                 | ADAPT with A/B; Native whole-composite/final validation                            | P        |
| `story-cache/transition-journal.mjs`      | #2071; `9d129d42003bf1cabb8f6974630f4a11016a136a` | `8bd36b9d2bfd324942bddc51633cedfda19f4b9b` | absent                                                 | ADAPT with A/B; One-attempt effect ordering/receipts                               | P        |
| `story-cache/native-target-admission.mjs` | #2071; `f472e6bb67a1a7d81e75848ab7fc433bf1434063` | `50d42a06b984e11a47f47a4734f375bcd1c28cbe` | absent                                                 | REUSE O after interface verification; Admitted target facts and identities         | P        |
| `story-cache/native-observers.mjs`        | #2071; `eb67ec2919ab76de18a291525259c5ab3e026b8e` | `9db2fece1a2c7265e3511afd8de7cebea1cee527` | absent                                                 | REUSE O after interface verification; Effect-specific bounded readback             | P        |
| `story-cache/provider-adapters.mjs`       | #2071; `eb67ec2919ab76de18a291525259c5ab3e026b8e` | `9c9b87939e7ac830ea5808edaeac470c9af4fd40` | different (`656bf43bfa2c7e6bf69d7f6ddcea843a144d8cd2`) | REUSE O after interface verification; Sole publication transport                   | P        |
| `story-cache/snapshot-compare.mjs`        | #2053; `5c1cbbd23c4d0747b7d6e8cbb70b3adbff4fb1fe` | `2352a9a0dbaec6ad173393f11d85b3e5e8300dc8` | absent                                                 | REUSE H bytes; Compare complete vectors                                            | P        |
| `story-cache/batch.mjs`                   | #2049; `169a4183e36086275eebfb7022d5b60071709005` | `a2bacc4ee98e29282927cf85e5de75b4f0ff9ec7` | absent                                                 | ADAPT with A/B; Freeze exact operations/effects                                    | P        |
| `story-cache/journal.mjs`                 | #2067; `1f707a843cc2d70fb5e6fb114fd521b7694f407e` | `0b22826bf1e20c4ab938b6e5e08491208bf514b3` | absent                                                 | REUSE H bytes; Durable observations/recovery                                       | P        |
| `story-cache/completion-receipt.mjs`      | #2071; `eb67ec2919ab76de18a291525259c5ab3e026b8e` | `f4f758c5332c72727fb73a3f8c3f35344f80c9c4` | absent                                                 | REUSE O after interface verification; Confirmed visit/effect subsets               | T        |
| `story-cache/writer-handoff-bindings.mjs` | #2049; `169a4183e36086275eebfb7022d5b60071709005` | `dad1eba894da823edd5f75df05a16afd5f9b9730` | absent                                                 | REUSE O after interface verification; Protected view/handoff reads                 | C        |
| `story-cache/timing-events.mjs`           | #2090; `930b05780af85128a47c02e18be065c4f7c01d23` | `b19e89de83cbf2ecffc5684ee1be929bd5fe1ea6` | same                                                   | KEEP K (identical); Canonical event identity                                       | T        |
| `story-cache/native-observation.mjs`      | #2090; `930b05780af85128a47c02e18be065c4f7c01d23` | `d9572deb75988586f86992dad23aa239cfac499b` | same                                                   | KEEP K (identical); Native revision/hash identity                                  | P        |
| `story-cache/writer-handoff-bytes.mjs`    | #2090; `930b05780af85128a47c02e18be065c4f7c01d23` | `f7ddf62d934db0b202413908a205ea434d8b2877` | same                                                   | KEEP K (identical); Transfer exact bytes                                           | C        |
| `story-cache/writer-handoff-io.mjs`       | #2090; `930b05780af85128a47c02e18be065c4f7c01d23` | `0e3f87c7f80712dbc834cc7b6d843823117dc29d` | same                                                   | KEEP K (identical); Guarded transfer IO                                            | C        |
| `story-cache/writer-claim-shape.mjs`      | #2090; `930b05780af85128a47c02e18be065c4f7c01d23` | `4216c1eeda4fac1ac0b8de305b915b83a386209a` | same                                                   | KEEP K (identical); Claim shape                                                    | C        |
| `story-cache/comment-source.mjs`          | #2071; `9d129d42003bf1cabb8f6974630f4a11016a136a` | `77297884da93c5e1e8f4677e0421bfe41400d3bf` | absent                                                 | REUSE O after interface verification; Native comment identity                      | P        |
| `story-cache/body-template.mjs`           | #2047; `ec89bd936235b6748f8595a3e8b6de49bf340b2a` | `8fcf26c9235699c0a630458a5ab7752c816881b4` | absent                                                 | REUSE H bytes; Typed verified-ID final slots                                       | P        |
| `story-cache/stage-capabilities.mjs`      | #2071; `eb67ec2919ab76de18a291525259c5ab3e026b8e` | `7c145ab54fa8e5f1650a3d8b52f687fc5533fc34` | absent                                                 | ADAPT with A/B; Validate each and complete operation chain                         | A        |

timing-stage.mjs is already in K and remains its canonical event ingestion adapter; integrate its callers without introducing a second clock. publisher.mjs and recovery.mjs are not imported merely because they are in O’s folder: production uses the declared transition-journal graph, while their algorithms/tests may be reference evidence. A second transport/recovery implementation is excluded.

### Remaining causal modules and exact hunk boundaries

Every source cell below denotes its exact blob via the full pin/path expression. Existing K imports not changed by the named hunk remain K. The reviewed implementation must not bring unrelated deletions along with these hunks.

| Destination                                 | Exact source/owner                                                                                           | K disposition / selected hunk                                                                                                                                                             | Required consumer; verifier                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| story-cache/native-graph-observation.mjs    | O:same path; #2071 e34eae0c8b76934f0b5d5b3a10bc262f1e60925a through f472e6bb67a1a7d81e75848ab7fc433bf1434063 | Add scoped complete graph validators                                                                                                                                                      | native graph sources; P                          |
| story-cache/native-graph-sources.mjs        | O:same path; #2071 f472e6bb67a1a7d81e75848ab7fc433bf1434063                                                  | Add revocable receipt consumers                                                                                                                                                           | native guard registry; P                         |
| story-cache/native-lifecycle-graph.mjs      | O:same path; #2071 f472e6bb67a1a7d81e75848ab7fc433bf1434063                                                  | Add shared actual target/parent graph observation                                                                                                                                         | decomposition hook; P                            |
| story-cache/native-parent-graph.mjs         | O:same path; #2071 f472e6bb67a1a7d81e75848ab7fc433bf1434063                                                  | Add distinct parent receipt/identity validation                                                                                                                                           | parent/lineage readers; P                        |
| story-cache/native-target-decomposition.mjs | O:same path; #2071 bfa722fb44a3ae128bddd7e36f6025341c55d725                                                  | Add target snapshot projection; no synthetic receipt                                                                                                                                      | leaf native guard; P/E                           |
| story-cache/native-target-comments.mjs      | O:same path; #2071 9d129d42003bf1cabb8f6974630f4a11016a136a                                                  | Add real node/database identity projection                                                                                                                                                | Close/commit readers; P                          |
| native-story-guard-execution.mjs            | O:same path; #2071 eb67ec… through f472e6…                                                                   | Add full registry execution against sealed frozen input; reconcile K current guards                                                                                                       | transition-journal; P/R                          |
| native-story-observations.mjs               | O:same path; #2071 eb67ec2919ab76de18a291525259c5ab3e026b8e                                                  | Add actual operator/source and lifecycle evidence readers                                                                                                                                 | native-story guard; P/R                          |
| plan-approval-staging.mjs                   | O:same path; #2069 dac71bf802547e91e20273644899565ce84d97df, #2049 169a4183…                                 | Add native issuance/rebind/invalidate; adapt A and K current-scope evidence                                                                                                               | Plan producer/store; A/E/R                       |
| plan-transition-native.mjs                  | O:same path; #2069 dac71bf802547e91e20273644899565ce84d97df                                                  | Add frozen/pre-Status/final validators; preserve exact current approval                                                                                                                   | native ports; E/P                                |
| plan-native-guard-execution.mjs             | O:same path; #2069 dac71bf…, #2071 f472e6…                                                                   | Add native Plan registry; adapt A                                                                                                                                                         | transition-journal; E/P                          |
| plan-child-inventory.mjs                    | O:same path; #2069 dac71bf…                                                                                  | Add exact pure retained child projection                                                                                                                                                  | native Plan approval; E                          |
| plan-decomposition-staging.mjs              | O:same path; #2069 dac71bf…                                                                                  | Add owner-bound derivation                                                                                                                                                                | decomposition-projection issuer; E               |
| plan-decomposition-projection.mjs           | O:same path; #2069 dac71bf…                                                                                  | Add explicitly projected inputs, not observations                                                                                                                                         | Plan candidate validation; E                     |
| decomposition-projection.mjs                | O:same path; #2069 dac71bf…                                                                                  | Add withNativePlanAssessmentAdvance only; preserve existing owner/refresh roles                                                                                                           | Plan issuer; E/A                                 |
| decomposition-authority.mjs                 | O:same path; #2069 dac71bf…                                                                                  | Export selected-plan read and split pure deriveDecompositionAuthority/deriveDecompositionForecastObservation; retain K behavior outside projected input                                   | Plan and target graph; E/P                       |
| decomposition-hook-authority.mjs            | O:same path; #2049/#2071 e34eae… through f472e6…                                                             | Add native selection/boundary/receipt paths and explicit published attachment; KEEP K collectEpicConvergenceSnapshot/captureConvergenceFrame and governed session checks                  | native graph and existing convergence; P/R       |
| epic-rank-wave-runtime.mjs                  | O:same path; #2069/#2071 native graph consumer                                                               | Only forward allowPlanProjection to the existing child reader where native frozen bindings require it                                                                                     | native-graph-sources; E/P                        |
| close-gates-lineage.mjs                     | O:same path; #2071 3fcca13a3e597c447b198d46c62fac16f99219cf                                                  | Extract projectCloseLineageChild and reuse it; no alternate lineage algorithm                                                                                                             | native Close sources; P                          |
| move-state/guard-execution.mjs              | O:same path; #2069/#2071 dac71bf… through f472e6…                                                            | Add sealed candidate admission/observation seams; keep K current native guards and source authority                                                                                       | real host; P/R                                   |
| move-state/move-state-core.mjs              | O:same path; #2068 seam/#2049 169a4183…                                                                      | Published completion reader and early coordinator return; production mandatory-context behavior is NEW #2071                                                                              | host/runtime; P/V                                |
| scripts/gh/lib/github-projects.mjs          | O:same path; #2071 eb67ec2919ab76de18a291525259c5ab3e026b8e                                                  | Add gqlRaw and bounded byte buffering/UTF8 decode; retain gql behavior and usage hooks                                                                                                    | native-ports; P                                  |
| owned-comment.mjs                           | O:same path; #2071 eb67ec…                                                                                   | Add validateOwnedCommentBody; public staging is NEW, not old writer copy                                                                                                                  | stage-comment and public facade; A/V             |
| github-records/issue-directory.mjs          | O:same path; #2071 eb67ec…                                                                                   | Add assertIssueDirectoryPreserved only                                                                                                                                                    | neutral staging; A                               |
| body-invariants.mjs                         | H:same path; #2059 4c9b91d0f54ed4e31656d202084ac421c413e053                                                  | Add checkbox identity/includeNew and lost/moved proof validation; preserve K other invariants                                                                                             | stage/composite; A/R                             |
| plan-approval-markers.mjs                   | O:same path; #2049 169a4183e36086275eebfb7022d5b60071709005                                                  | Pure extraction plus candidate helpers; port K currentApprovalDigest codec intact                                                                                                         | views/comment/Plan readers; E/R                  |
| markers.mjs                                 | K:same path plus above extraction                                                                            | Reexport pure codec, preserve ALL K public fields/functions                                                                                                                               | existing consumers; R                            |
| plan-approved-guard.mjs                     | O:same path; #2069/#2049                                                                                     | Only import/reexport candidate helpers; retain native current guard                                                                                                                       | Plan rebind; E/R                                 |
| plan-approval-audit.mjs                     | O:same path additive helpers plus K:same path                                                                | Add candidate audit key/wrapper recognition; KEEP currentEvidence builder/parser/validator and currentApprovalDigest                                                                      | native approval/candidate comment; E/R           |
| plan-transition-authority.mjs               | O:same path; #2069 dac71bf…                                                                                  | Add candidate dispatch/render ports, no change to legacy verified authority meaning                                                                                                       | pre-Status validator; E/P                        |
| plan-exit-planned-estimate-guard.mjs        | O:same path; #2069 dac71bf…                                                                                  | Add native candidate facts/forecast validators; preserve K same-observation ready-reader semantics                                                                                        | native Plan validation; E/R                      |
| scripts/task-tracker/verbs/plan-approve.mjs | O:same path #2069 additions against K:same path                                                              | Add native retained-candidate capability lifecycle; KEEP currentScope flag/route, strict args, async validation and output cases                                                          | Plan producer; E/R                               |
| scripts/task-tracker/config.mjs             | O:same path; #2063 provenance                                                                                | Select physical projectDir defaultPaths and non-enumerable configuration provenance; retain K defaults/public config                                                                      | Plan native current configuration; E/R           |
| estimation/local-evidence.mjs               | O:same path; #2045 fa6f80836a673cba500c37e3947e8fc7bce44f89                                                  | Add exact validated local evidence graph                                                                                                                                                  | forecast-v3 and native selection; E              |
| estimation/local-evidence-store.mjs         | O:same path; #2045 fa6f80836a673cba500c37e3947e8fc7bce44f89                                                  | Add existing protected immutable evidence store; no automatic hydration                                                                                                                   | forecast-reader and native evidence; E           |
| estimation/local-runtime.mjs                | O:same path; #2062 337a7d03a428b0d5ad4fba0f018082820b467d9d                                                  | Add retained-input model/selection validation; no publication or cloud loader                                                                                                             | native-plan-selection/forecast-legacy/lineage; E |
| estimation/forecast-model.mjs               | O:same path; #2046 bc8f43e0971310d888d85575b9d33de763397ae2                                                  | Add the44-line v3 retained-input calculation support only                                                                                                                                 | local-runtime; E                                 |
| estimation/forecast-v3.mjs                  | O:same path; #2046 ed575ad00030631bec1860ab1e38410907b80dfa                                                  | Add strict v3 payload/provenance validation                                                                                                                                               | native forecast/record envelope; E               |
| estimation/forecast-reader.mjs              | O:same path; #2064                                                                                           | Add raw retained-byte reader                                                                                                                                                              | forecast-lineage; E                              |
| estimation/forecast-lineage.mjs             | O:same path; #2064                                                                                           | Add local-only resolution                                                                                                                                                                 | native forecast authority; E                     |
| estimation/forecast-legacy.mjs              | O:same path; #2065                                                                                           | Add current-v3 proof with exact native selection; legacy v1/v2 reads unchanged                                                                                                            | Plan candidate guard; E/R                        |
| estimation/native-plan-selection.mjs        | O:same path; #2069 dac71bf…                                                                                  | Add actual committed-plan/refinement/config/model selection                                                                                                                               | Plan approval; E                                 |
| github-records/record-envelope.mjs          | O:same path; #2065                                                                                           | Only strict v3 envelope branch and narrowly admitted localEvidence.plan.path; no broad secret-policy relaxation                                                                           | forecast consumers; E/R                          |
| estimation/runtime-adapter.mjs              | O:same path #2069/#2071 against K:same path                                                                  | Export recordsForProjection; extract derivePublishedForecastProjection with K optional readReadyForecastRecordId preserved. No wholesale cloud-calculation/runtime rewrite under this row | Plan/target projection; E/R                      |
| scripts/task-tracker/gh-timing-comment.mjs  | O:same path #2071 against K:same path                                                                        | Add isNativeTimingComment; keep K readUniqueLastKnownState and exact whitespace; public timing staging is NEW                                                                             | ownership/timing; T/R                            |
| scripts/task-tracker/phase-events.mjs       | O:same path; #2071 e781ec90aa7721825beb68eff4c57ae85087a88d                                                  | Add resolveTransitionEvents sharing native lifecycle policy                                                                                                                               | timing candidate/receipts; T                     |

Abbreviated historical commit labels above resolve through the exact O blob expression, never a floating abbreviated ref. Reuse attribution does not require checking out or replaying historical commits. The source acceptance unit is the named module or named hunk, with its exact input and K preservation constraints.

Known external leaves remain K: runtime-storage/session-id/ownership-policy/issue-mutator-lock, canonical-json, singleton-initializer, reviewed-scope/record and targets (except NEW A/B wiring), project-fields, decomposition-kind/policy/records/assessment, graph-node-authority, assignment-snapshot, parent-status/wave-admission, stage-entry grammar/markers, lifecycle-policy, timing-row-reader/events/actor, artifact-execution/subject, lifecycle-gate-source, record-secret-policy, forecast-record/plan-input/outcome-record/rubric-record/estimate-granularity. Literal comparisons found no required replacement in those leaves. assignment-snapshot and stage-entry/timing state files differ from O only because K contains newer safeguards: KEEP them.

**Explicit exclusions:** No replacement of versioned-issue-write with O; no deletion of K convergence/current-scope flows; no O runtime-wide estimator rewrite under a projection-only dependency; no publisher/recovery duplicate lane; no indiscriminate package inventories from O; no dependency/lockfile/runtime repair. Estimator dispatch is the separately enumerated #2063 hunk set below; projection extraction alone does not cover it.

### Exact #2063 estimator dispatch selection

The #2063 selector is resolveEstimationMode(cfg), not an invented CLI local-calculation mode. Keep its exact output: rubric 0 -> disabled/rubric-disabled; positive safe integer -> local/retained-evidence-only; invalid configuration provenance -> unavailable/config-invalid. estimationDispatchDecision({cfg,verb,args}) returns null outside calculation; plan-estimate with --compatibility-mode and no --evidence-file is a governed human appendix operation. Evidence-file takes precedence. Other plan-estimate calculation requests stop before clients with disabled or unavailable (local reason retained-local-input-required). O and K verbs/plan-estimate.mjs are identical.

| Exact source object / historical owner                                                                                                   | Accepted hunk, K constraint, consumer and verifier                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O:scripts/task-tracker/lib/estimation/runtime-adapter.mjs; #2063 af4aa276618188718f54b740c25c219f38a8529d                                | Add resolveEstimationMode, estimationDispatchDecision, estimationCommandArgs, estimationHookRefusal, refuseCloudEstimation, imports splitCommandSegments/configurationReadProvenance and calculateLocalEstimate reexport. Reject loadProjectEstimationCorpus before accessing io.graphql; retain createAdaptivePlanRuntime export as the typed refusal. E/V                                                                |
| Same exact object; #2063 publication/calculation separation                                                                              | Extract the old publication-only body to createPlanPublicationRuntime({cfg,deps,adoptLegacyBaseline}); omit cloud corpus/rubric/comparable loaders and calculation methods. Keep all original publication guards and K same-observation readReadyForecastRecordId API. This constructor is for an explicit native lifecycle publication purpose, not fallback calculation. Its writes consume StageResult through B. E/P/R |
| O:scripts/task-tracker/config.mjs; #2063 6eebd013260c6348f3e3d2b2965df49228b2513b                                                        | Physical defaultPaths(projectDir), readConfigLayer observations, private configurationProvenance WeakMap and configurationReadProvenance. Preserve enumerable defaults and existing public configuration shape. E/R                                                                                                                                                                                                        |
| O:scripts/task-tracker/runtime.mjs; #2063 6eebd013260c6348f3e3d2b2965df49228b2513b                                                       | loadRuntimeConfig wrapper and invalid-config early refusal only. Do not import the unrelated timing checkpointFlush diff under this row. E/V                                                                                                                                                                                                                                                                               |
| O:scripts/task-tracker/lib/verb-preflight.mjs; #2063 af4aa276618188718f54b740c25c219f38a8529d                                            | Add verb/args forwarding and early estimation-dispatch-stopped verdict. KEEP K exported refuseVerbPreflight and add its matching switch case; do not copy O's deletion/inlining. E/R                                                                                                                                                                                                                                       |
| O:scripts/task-tracker/activity-guard.mjs; #2063 af4aa276618188718f54b740c25c219f38a8529d                                                | Canonical Bash estimator recognizer and physical loadConfig before decomposition/authority reads. No bypass for unrecognized syntax; runtime still refuses. E/V                                                                                                                                                                                                                                                            |
| O:scripts/task-tracker/source-edit-gate.mjs; #2063 af4aa276618188718f54b740c25c219f38a8529d and 6eebd013260c6348f3e3d2b2965df49228b2513b | Same native recognizer/refusal, config from actual invocation root; preserve all subsequent source guards. E/R                                                                                                                                                                                                                                                                                                             |
| K:scripts/task-tracker/verbs/plan-estimate.mjs plus NEW #2071 B adapters                                                                 | Preserve parseArgs precedence and public API. Compatibility appendix body/comment operations stage and return unpublished. Adaptive/evidence-file route is blocked by #2063; do not silently call a publication runtime as calculator. E/V                                                                                                                                                                                 |

calculateLocalEstimate({mode,evidence,planInput}) in the retained local-runtime is the existing pure calculation interface. Caller resolves mode before clients; retained inputs are validated through retainLocalEstimateInputs({evidenceStore,bundle})/validateLocalSelection. This plan does not invent an evidence acquisition CLI. Add assertions for positive/zero/invalid rubric and corrupt configuration, both flags together, canonical hook invocation, and getters that throw if any cloud client/corpus path is touched before refusal. Native lifecycle publication explicitly consumes a previously validated forecast; it never recalculates history.

### Source-closure acceptance check before any implementation approval

The manifest is a proposed integration closure, not a claim of a compiled tree. Before Root authorizes Phase6, review must resolve every named source/hunk and exact current import/export interface. An unresolved external import or return contract is an explicit review finding against this document and must be fixed here; it is not an implementer TODO or permission to fetch another folder. The code-phase import check tests the approved closure; it must not expand it silently.

No source execution was used during qualification. The one generic Node graph scan was refused by the native scope hook and was not retried; later reads were literal exact Git object reads authorized by Root. That refusal is not evidence of a product defect.

## Public caller census and disposition

Each row owns every listed path. Paths are relative to scripts/task-tracker unless scripts/ is explicit. All NEW changes are #2071. Routines select working; guards select fresh published or sealed frozen candidate plus actual published observations. No row may infer authority from StageResult.

| Exact caller/entry paths                                                                                                                                                                                                                                                                           | Producer / result and read contract                                                                                                                                    | Provider identity and verifier/classification                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| lib/issue-body-mutate.mjs; lib/issue-body-push.mjs; verbs/issue-body.mjs                                                                                                                                                                                                                           | Native context -> neutral or authorized A operation -> StageResult; authoring reads working                                                                            | No publication ID; A/V/R; routine                                                                                                         |
| lib/versioned-issue-write.mjs                                                                                                                                                                                                                                                                      | Keep true remote observation callbacks; direct existing-issue transport requires private publisher purpose                                                             | Low-level direct transport cannot bypass staging; P/R                                                                                     |
| lib/owned-comment.mjs; lib/refine-estimate-comment.mjs; lib/commit-trail-handler.mjs                                                                                                                                                                                                               | Validate native ownership, stage update/create intent; commit note is unpublished until transition                                                                     | Existing target ID versus new intent; A/V                                                                                                 |
| lib/github-records/github-comment-store.mjs                                                                                                                                                                                                                                                        | Public create/update -> staging; explicit read APIs remain published observations or typed working-reader counterpart                                                  | Real readback only in publisher; A/V/P                                                                                                    |
| lib/github-records/contract-write.mjs; lib/github-records/capsule-chain.mjs                                                                                                                                                                                                                        | B native operation/chain planner, atomic capsule+projection; no directory-written for staging                                                                          | Semantic record ID retained, GitHub IDs deferred; A/V/P                                                                                   |
| verbs/ac-stamp.mjs; verbs/dod-stamp.mjs; verbs/evidence-markers.mjs                                                                                                                                                                                                                                | A evidence producer with genuine run/receipt, exact declaration and source; StageResult                                                                                | Both legacy-body and contract lanes; A/V/R                                                                                                |
| verbs/check.mjs; lib/auto-tick-verified.mjs; lib/stamp-verify.mjs                                                                                                                                                                                                                                  | Native evidence-check; reviewed route invokes reviewed producer; handled staged results never fall through                                                             | Exact target; A/V                                                                                                                         |
| lib/reviewed-scope/record.mjs; lib/reviewed-scope/comments.mjs; lib/reviewed-scope/runtime.mjs                                                                                                                                                                                                     | Reuse native manifest/artifact/record validation; typed working intent and freeze rebind                                                                               | Pointer slots distinguish node/database ID; A/V/P                                                                                         |
| lib/apply-review-delta.mjs; lib/evidence-v2/runtime-adapter.mjs; lib/verification-receipt-retirement.mjs; lib/no-new-tests-declaration.mjs                                                                                                                                                         | Existing native proof/declaration producers register exact A operations; no broad flags                                                                                | Source-specific proof remains native; A/R                                                                                                 |
| verbs/plan-approve.mjs; lib/plan-approve-current-scope.mjs; lib/plan-approval-current-scope.mjs                                                                                                                                                                                                    | Native Plan/current-scope authority; preserve current digest, source/plan/trunk and genuine actor; staged audit                                                        | Published authority checked before Status; E/R                                                                                            |
| verbs/refine.mjs; verbs/promote.mjs; verbs/demote.mjs; verbs/test.mjs; verbs/review.mjs; verbs/approve.mjs; verbs/close.mjs; verbs/cancel-plan.mjs; verbs/supersede.mjs                                                                                                                            | Existing registered action -> working preparation -> mandatory native transition; only publisher reports completed delivery                                            | Existing review/Close ownership unchanged; P/V                                                                                            |
| lib/shelve-transaction.mjs; lib/close-disposition.mjs; lib/state-recording.mjs; lib/markers.mjs; lib/blocked-marker.mjs                                                                                                                                                                            | Exact native lifecycle/field operation; no routine completed marker; sealed transition owns completion                                                                 | No compensating body/status overwrite; P                                                                                                  |
| verbs/user-story.mjs; verbs/kind.mjs; verbs/reconcile.mjs; verbs/epic-reconcile.mjs; verbs/inflate-estimate.mjs                                                                                                                                                                                    | Existing producer rules select neutral/decomposition operation, StageResult; retain K convergence                                                                      | Labels/assignment remain separate guarded nonbody ops; A/P/R                                                                              |
| lib/user-story-author.mjs; lib/deep-dive.mjs; lib/functional-dod-derive.mjs; lib/discuss-marker.mjs; lib/discuss-label.mjs; lib/apply-refinement-estimate.mjs; lib/resident-action-ledger-write.mjs; lib/session-ref.mjs                                                                           | Body/comment portions stage; native execution/approval ledgers remain their own authority and are not rewritten as cache proof                                         | Explicit body versus nonbody effects; A/V                                                                                                 |
| lib/estimate-writer-publication.mjs; lib/decomposition-writer-registry.mjs; lib/decomposition-adaptive-writer.mjs; lib/decomposition-field-writer.mjs; lib/decomposition-projection.mjs; lib/epic-rank-wave-runtime.mjs                                                                            | Native decomposition/estimate outputs stage into exact resources; current observation guards preserved                                                                 | No per-effect full authority or history scan; E/P                                                                                         |
| lib/estimation/runtime-adapter.mjs; lib/estimation/plan-estimate-authority.mjs; verbs/plan-estimate.mjs                                                                                                                                                                                            | Retained-input calculation stays separate; explicit lifecycle publication stages validated output. Projection helper extraction does not authorize old cloud estimator | Exact #2063 dispatch below: calculation refuses before clients; pure retained-input API remains local; compatibility appendix stages; E/V |
| gh-timing-comment.mjs; gh-timing-comment.internals.mjs; runtime.mjs; hook-handler.mjs                                                                                                                                                                                                              | Native event ingestion -> timing-stage, separate ingested/published cursors                                                                                            | One transition timing effect, no direct fallback; T/P                                                                                     |
| lib/actor-hook-timing.mjs; lib/actor-timing-state.mjs; lib/timing-post-outcome.mjs; lib/review-approval-timing.mjs; hooks/stop-audit-pause-resume.mjs                                                                                                                                              | Preserve existing clock/actor/source cursor; stage each measured interval once                                                                                         | Unknown remains Unknown; T                                                                                                                |
| scripts/gh/log-issue-time.mjs; scripts/gh/dispatch-prep.mjs; scripts/gh/ensure-wave-parent.mjs                                                                                                                                                                                                     | Subsequent existing-issue timing stages; creation is explicitly separate                                                                                               | No creation exception for later routine writes; T/P                                                                                       |
| scripts/gh/move-state.mjs; lib/move-state/move-state-core.mjs; lib/move-state/github-mutation.mjs; lib/move-state/audit-timing.mjs; lib/move-state/sentinel.mjs; lib/move-state/transition-commit.mjs; lib/move-state/post-commit-tail.mjs; lib/move-state/readout.mjs                             | Mandatory context -> frozen journal -> one native guard/publication path; legacy tails cannot write after coordinator                                                  | Publisher-only provider identities/receipt; P/R                                                                                           |
| activity-guard.mjs; source-edit-gate.mjs; lib/verb-preflight.mjs; lib/decomposition-hook-authority.mjs; lib/action-decision/session.mjs; verbs/explain.mjs                                                                                                                                         | Explicit purpose before authority; published/current native facts, optional untrusted local diagnostics                                                                | Read-only absence supported; no automatic admission; V/P/R                                                                                |
| timing-rollup.mjs; lib/timing-ladder.mjs; lib/timing-row-reader.mjs; lib/review-approval-timing.mjs; lib/plan-approval-evidence-repair.mjs; verbs/stop.mjs; verbs/resume.mjs; verbs/switch.mjs; scripts/reports/lib/daily-activity.mjs; scripts/gh/update-event-fields.mjs                         | Measured intervals independent of completion; explicit published versus working display; projections stage                                                             | Per-visit immutable subset proof; T/V                                                                                                     |
| backfill-timing-logs.mjs; heal-timing-starts.mjs; heal-timing-interval.mjs; heal-timing-log.mjs; heal-timing-departure.mjs; lib/heal-timing-continuity.mjs; lib/heal-timing-rebaseline.mjs; lib/heal-actor-opener-replays.mjs; lib/heal-actor-evidence-recovery.mjs; lib/timing-slug-rename.mjs    | Explicit validated local repair candidate, then staged; reads/status never auto-repair                                                                                 | Native repair authority retained; T/R                                                                                                     |
| backfill-vc-sections.mjs; heal-functional-dod.mjs; heal-vc-refs.mjs; backfill-plan-metadata.mjs; migrate-plan-approved.mjs; heal-backlog.mjs; heal-lifecycle-dod.mjs; verbs/adopt-github-records.mjs; verbs/migrate-dependencies.mjs; lib/decomposition-migration-writer.mjs; lib/heal-vc-refs.mjs | Existing-issue repair defaults to staging; separately admitted one-off migration must refuse pending claim/cache. #2051 owns adoption policy, not routine bypass       | Explicit administrative classification; A/P                                                                                               |
| scripts/gh/migrate-project.mjs; scripts/gh/verify-open-issue-bodies.mjs; scripts/gh/scaffold-web-issue.mjs; scripts/gh/lib/epic-metadata.mjs                                                                                                                                                       | Creation can create the new issue before claim; subsequent existing-issue writes follow staging; read-only verification stays read-only                                | Creation/admin only with real native purpose; P/V                                                                                         |
| lib/ownership-policy.mjs; assignee-guard.mjs; issue-mutator-lock.mjs; fleet-registry.mjs; lib/worktree-binding-lifecycle.mjs; lib/worktree-relocation-guard.mjs; lib/cleanup-base-aware.mjs; lib/runtime-storage.mjs; lib/runtime-migration-plan.mjs; lib/runtime-migration-apply.mjs              | Existing native ownership + retention/handoff; no acquire during reads; protected pending evidence survives                                                            | Preserve team-unassigned read-only semantics; C/R                                                                                         |
| lib/body-invariants.mjs; lib/gh-edit-guard.mjs; bash-guard.mjs; lib/checklist-command-lint.mjs; lib/entrypoint-guard-lint.mjs; lib/runtime-capabilities.mjs; lib/command-surface/catalog.mjs; lib/action-decision/normalization.mjs; lib/governed-plan-policy.mjs                                  | Classify real stage/admission/publisher/admin purposes; direct transport remains controlled                                                                            | No fake provider-write counters or new blanket bypass; P/V/R                                                                              |

The census is a route specification, not a claim that every path needs code changes. An unchanged caller can be KEEP only when its actual native result/read contract is compatible; record that determination in the implementation diff. A newly discovered required path changes the manifest and requires review before importing it.

## Implementation tasks (not yet authorized)

### Task1: Assemble the reviewed prerequisite interfaces against K

**Files:** only the source-manifest destinations and their exact named hunks. Create scripts/tests/helpers/story-cache-public-activation-fixture.mjs and scripts/tests/unit/task-tracker/lib/story-cache/public-activation-source.test.mjs.

**Interfaces:** exports in the manifest. Test-only createNativeActivationFixture({identity,comments,fields,actor,source}) returns {context,store,claim,ledger,runCommand,restart,runHook,transition,handoff,failStoreAt}. runCommand({verb,args}) invokes the actual public verb/CLI adapter and returns its public result. restart() starts a distinct process with the same test-native session/binding files and opens the existing generation, with no shared WeakMap. runHook({toolName,toolInput}) invokes the installed hook entrypoint. transition({to}) invokes the real move-state host with offline provider transport. handoff({recipient}) runs the actual native transfer/acknowledgement protocol. failStoreAt(point) installs offline I/O failure at payload-fsync, before-manifest or after-manifest. ledger.entries have {category,operation,resourceKey}; category is admission, native-guard, staging, snapshot, native-graph, effect or readback. Fixtures create native session/receipt evidence using the repository's test setup and real native runners; they never return grant-shaped objects. Production CLI has no fixture injection flag.

The assertion seeds below define outcomes; fixture adapters execute the real command, evidence and store boundaries. They are not executed by this docs-only phase.

- [ ] Write source-contract tests asserting required exports and native construction, while current K is missing them; verify the intended missing-export failure.
- [ ] Run node --test scripts/tests/unit/task-tracker/lib/story-cache/public-activation-source.test.mjs.
- [ ] Assemble only approved exact sources/hunks, retaining K preservation rows. Remove no current API because O lacks it.
- [ ] Run the same focused test plus unchanged native regression suites covering preserved APIs; all pass.
- [ ] Commit a #2071 internal, unexposed prerequisite increment and record real trace. No public route switch or release here.

### Task2: Persist and rebind genuine operations atomically

**Files:** new story-cache/operation-record.mjs and operation-authority.mjs; adapt store, stage-body, stage-comment, view-payloads, views, stage-capabilities; native producers listed in A. Create scripts/tests/unit/task-tracker/lib/story-cache/operation-authority.test.mjs.

**Interfaces:** exactly A. Do not implement a general mint-from-JSON API.

- [ ] Write positive native stamp -> atomic commit -> fresh process -> native receipt rebind -> valid exact delta test. Assert original run source/time remains, no second cloud write, and changed declaration refuses.
- [ ] Add failure injection before/after payload flush and manifest publication: acknowledged generation contains both exact content and evidence or neither; orphan bytes cannot authorize.
- [ ] Add proof move, foreign issue/claim/source, unknown operation, broad-flag union, forged grant, missing native receipt and multi-operation composite rejection.
- [ ] Run node --test scripts/tests/unit/task-tracker/lib/story-cache/operation-authority.test.mjs; confirm intended red assertions.
- [ ] Implement A and rerun to green; commit #2071 with real trace.

Assertion seed in operation-authority.test.mjs (native fixture's configured declaration is a real deterministic zero-exit verifier, run through evidence-runner):

```js
const staged = await f.runCommand({ verb: 'ac-stamp', args: ['AC1'] });
assert.equal(staged.publication, 'unpublished');
assert.ok(staged.operationIds.length > 0);
const afterRestart = await f.restart();
const result = await afterRestart.transition({ to: 'test' });
assert.equal(result.publication, 'published');
assert.equal(afterRestart.ledger.entries.filter((e) => e.category === 'staging').length, 0);
```

Separate negative cases use a copy of the retained generation with a changed declaration or fabricated evidence reference, and assert refusal before any effect ledger entry. Do not edit genuine shared runtime state during tests.

### Task3: Switch body/comment results and explicit views together

**Files:** Task30 seven public paths, issue-body/versioned write seams, identity-read callers in census. Create scripts/tests/unit/task-tracker/lib/story-cache/public-activation.test.mjs.

**Interfaces:** StageResult, PublishedResult and explicit readers in B; retain exports.

- [ ] Test actual public neutral body/title/comment call: zero staging provider traffic, unpublished result, local readback and restart preservation; published reader still returns remote bytes.
- [ ] Test missing/corrupt/foreign/frozen claim mutation refusal and genuine no-cache remote-only reader success.
- [ ] Test real pre-read versus verified remote callback values and third fresh-remote argument; local candidate never triggers them.
- [ ] Run node --test scripts/tests/unit/task-tracker/lib/story-cache/public-activation.test.mjs; observe intended failures, implement, rerun green and commit #2071.
- [ ] Keep this increment unreleased until native transition, consumer and timing tasks are green.

Assertion seeds in public-activation.test.mjs:

```js
assert.equal(staged.status, 'staged');
assert.equal(staged.publication, 'unpublished');
assert.equal(working.body, requestedBody);
assert.equal(published.body, originalRemoteBody);
assert.equal(staged.commentNodeId, undefined);
assert.equal(ledger.entries.filter((e) => e.category === 'staging').length, 0);
```

staged comes from the actual neutral public mutation; working and published come from the two explicit B readers, not fixture-supplied values.

### Task4: Stage contracts, capsules and reviewed pointers

**Files:** github-records/contract-write.mjs, capsule-chain.mjs, github-comment-store.mjs, reviewed-scope record/comments/runtime, check/ac-stamp/dod-stamp/evidence adapters from census. Create scripts/tests/unit/task-tracker/lib/story-cache/public-contract-staging.test.mjs.

**Interfaces:** stageDirectoryContractOperation and typed working record from B; A proof producer for record-evidence.

- [ ] Test real native record-evidence -> capsule+projection one generation; check’s handled staged branch must not execute legacy body writer.
- [ ] Test two ordered capsules, exact predecessor, interrupted creation, node versus database IDs, pointer slot realization and no remote identity before confirmation.
- [ ] Test reviewed evidence operation survives restart through original manifest/artifact/native record validation and rejects changed bytes.
- [ ] Run node --test scripts/tests/unit/task-tracker/lib/story-cache/public-contract-staging.test.mjs; observe intended failures, implement, rerun green and commit #2071.

Assertion seeds in public-contract-staging.test.mjs:

```js
assert.equal(created.publication, 'unpublished');
assert.equal(created.intent.key.startsWith('comment:new:'), true);
assert.equal(created.commentNodeId, undefined);
assert.equal(legacyBodyWriterCalls, 0);
assert.equal(materialized.body, expectedExactBody);
assert.throws(() =>
  validateMaterializedStoryOperations({
    operations,
    template,
    confirmedEffects,
    materializedValues: { ...materialized, body: materialized.body + 'unrelated' },
  })
);
```

Observe legacyBodyWriterCalls at the actual legacy body-writer boundary. Confirmed effects come from the actual offline journal execution, not a caller success flag.

### Task5: Construct real CLI and hook contexts

**Files:** runtime.mjs, hook-handler.mjs, task-tracker.mjs, verbs/start.mjs (existing delegation retained), verbs/resume.mjs, verbs/switch.mjs, lib/verb-preflight.mjs, action/session and guard classification rows only as required; scripts/gh/move-state.mjs. Create scripts/tests/integration/task-tracker/lib/story-cache-native-entrypoints.integration.test.mjs.

**Interfaces:** real native context from B; actual host receives store/claim/ports, not a test-only opt-in.

- [ ] Test supported CLI and installed-hook invocation paths in separate offline processes using native session/binding fixtures. Assert actual persistent claim revalidation and same-session reuse, different-session refusal.
- [ ] Test read-only Explain does not acquire/hydrate; Start/Resume/Switch admission does bounded observation once; self-bind cache acquisition adds no timing event; refused acquisition preserves honest binding/departure state; runtime staging subsequently makes zero transport calls.
- [ ] Assert source/edit/commit/lifecycle guard observations still occur in their own ledger category; same-human different agent cannot borrow the claim.
- [ ] Run node --test scripts/tests/integration/task-tracker/lib/story-cache-native-entrypoints.integration.test.mjs; red, implement, green, commit #2071.

Assertion seeds in native-entrypoints.integration.test.mjs:

```js
assert.equal(afterSelfBind.entryStartTs, beforeSelfBind.entryStartTs);
assert.equal(newTimingEvents.length, 0);
assert.equal(explainAdmissionCalls, 0);
assert.ok(ledger.entries.some((e) => e.category === 'native-guard'));
assert.equal(ledger.entries.filter((e) => e.category === 'staging').length, 0);
```

Use actual Start/no-op and Explain command invocations, read native binding/event state, then invoke a real guarded mutation. Include failed admission and preserve the original active span.

### Task6: Freeze and publish exact native authority

**Files:** native-transition, batch, native-authority, transition-batch/journal, native Plan/graph adapters, move-state-core/host. Create scripts/tests/integration/task-tracker/lib/story-cache-public-transition.integration.test.mjs.

**Interfaces:** A rebound grants + operationsDigest; B confirmed publication result.

- [ ] Test genuine proof-bearing operation after restart through real host: native guards, prerequisites confirmed before Status, one final body, complete vector and receipt. Non-null capabilityRef is accepted only through native rebind.
- [ ] Test changed assignment/foreign comment/field/revision, incomplete inventory, stale source/plan/trunk or expired native authority refuses before effects.
- [ ] Inject uncertainty at create, pre-Status authority, Status and final body; assert no automatic recreate, no legacy tail/compensation, no false completion. Confirm no more than one attempted dispatch per frozen effect.
- [ ] Run node --test scripts/tests/integration/task-tracker/lib/story-cache-public-transition.integration.test.mjs; red, implement, green, commit #2071.

Assertion seeds in public-transition.integration.test.mjs:

```js
assert.equal(result.publication, 'published');
assert.equal(finalBodyAttempts.length, 1);
assert.ok(lastPrerequisiteConfirmation < statusDispatch);
assert.equal(legacyTailWrites, 0);
assert.equal(uncertainResult.receipt, undefined);
assert.equal(recoveryDuplicateCreates, 0);
```

Indices/counts come from the provider transport ledger of the actual move-state host. The uncertainty test uses a provider-side accepted create with a lost response, then a fresh process recovery.

### Task7: Finish every proof/result/reader census family

**Files:** exact remaining census rows only. Extend public-activation.test.mjs and native-entrypoints integration tests with a maintained per-entry route table.

**Interfaces:** no additional result variants. Production entrypoints may not accept test-issued capabilities.

- [ ] For every routine row, assert its public result and selected view; for every low-level transport assert publisher/admin/creation authority; for every excluded path assert its actual exclusion.
- [ ] Include directory and legacy proof lanes, current-scope Plan approval, approved-current output, convergence, native administrative pending-cache refusal, and actual estimator purpose selection.
- [ ] Implement required direct-call replacements; a textual grep match alone neither passes nor fails the route test.
- [ ] Run the named focused suites; all mapped cases pass. Commit #2071 with the final per-path disposition manifest updated.

Assertion seeds for the #2063 cases in public-activation-source.test.mjs and native-entrypoints.integration.test.mjs:

```js
assert.deepEqual(resolveEstimationMode({ estimationRubricIssue: 0 }), {
  mode: 'disabled',
  reason: 'rubric-disabled',
});
assert.equal(
  estimationDispatchDecision({
    cfg,
    verb: 'plan-estimate',
    args: ['--compatibility-mode'],
  }),
  null
);
assert.equal(
  estimationDispatchDecision({
    cfg,
    verb: 'plan-estimate',
    args: ['--compatibility-mode', '--evidence-file=x.json'],
  }).reason,
  'retained-local-input-required'
);
assert.equal(cloudClientConstructionCount, 0);
```

cfg in the last two cases has a positive rubric; corrupt physical configuration is separately loaded through actual loadConfig and must yield config-invalid before native cloud dispatch.

### Task8: Preserve timing, retention and handoff semantics

**Files:** timing/repair/report/field/retention/handoff census rows. Create scripts/tests/unit/task-tracker/lib/story-cache/public-timing-authority.test.mjs.

**Interfaces:** existing canonical event source + independent ingestion/publication cursors + timingAuthority.

- [ ] Test cumulative snapshot/restart ingestion does not double-count; measured Active/Idle and Unknown remain visible without completion proof.
- [ ] Test two visits with different full timing comment hashes preserve first immutable event subset; altered first subset removes completion without deleting measured work.
- [ ] Test staged repair never changes board/completion automatically; pending payloads survive cleanup and acknowledged transfer. Positive handoff rebind of real unchanged native evidence preserves staged content and original issuer; missing acknowledgement, changed actor-sensitive evidence and unsupported human approval refuse without content loss.
- [ ] Run node --test scripts/tests/unit/task-tracker/lib/story-cache/public-timing-authority.test.mjs; red, implement, green, commit #2071.

Assertion seeds in public-timing-authority.test.mjs:

```js
assert.notEqual(firstFullCommentDigest, secondFullCommentDigest);
assert.equal(firstReceipt.timing.eventsDigest, unchangedFirstSubsetDigest);
assert.equal(authority.completedVisits.length, 2);
assert.equal(changedFirstSubsetAuthority.completedVisits.length, 1);
assert.deepEqual(afterHandoffWorkingValues, beforeHandoffWorkingValues);
assert.deepEqual(retainedDescriptor.issuer, originalNativeIssuer);
```

The last assertion checks the native operation descriptor retained in the resulting publication evidence. The in-process grant itself remains private. Repeated ingestion asserts unchanged measured totals and cursors; absence of completion retains measured work and Unknown.

### Task9: Integrated qualification and handoff

**Files:** final implementation/test/document paths already owned; no unreviewed import expansion.

- [ ] Run the focused source/operation/public/contract/timing and native entrypoint/transition suites, then required repository checks appropriate to the complete change once.
- [ ] Verify preserved K behavior: remote observation forwarding, third async remote argument, shared mutation session guard, location snapshot, unique state/visit validators, currentScope/currentApprovalDigest/audit evidence, exported refuseVerbPreflight, same-observation readReadyForecastRecordId, and convergence frame.
- [ ] Verify the actual public route has no optional-cache legacy fallback and no routine direct transport; compare executed ledger categories and declared read budgets. Do not claim #2050 package-wide budget proof.
- [ ] Reconcile actual modified paths with this manifest/census. Any new causal input must receive review before acceptance.
- [ ] Record real exact-head native evidence and commit trace. Report #2071 implementation completion only to Root; no agent Review/Close.
- [ ] Keep #2145 edge until Root inspects actual retained-source/native parent integration readiness and current trunk drift before Test. No blanket P1–P8 bridge work or source qualification by “Closed” labels.

## Docs-only review protocol and unresolved decisions

Use a fresh normal-commit primary Claude XPR of this exact document, with author requested gpt-6-astra/xhigh and reviewer claude-opus-5-5/high if available. Bound the review to six rounds; resolve actual findings in tracked responses/manifest and preserve integrity. Requested selection/launch ACK is not a claim about every later turn. If Claude cannot establish, preserve exact failure and use the authorized independent Astra6 Extra High SAR fallback; no duplicate active XPR and no cancel-to-evade findings.

A fresh builder check precedes handoff. It may identify missing source/hunk or producer authority choices; resolve them here with normal engineering judgment. Any unverified retained module/interface is a review blocker, not an implementation TODO: this document is not ready for Phase6 until independent review resolves it and Root inspects the actual artifacts.

No product tests, implementation, source imports, board changes or integration have been performed by writing this plan.
