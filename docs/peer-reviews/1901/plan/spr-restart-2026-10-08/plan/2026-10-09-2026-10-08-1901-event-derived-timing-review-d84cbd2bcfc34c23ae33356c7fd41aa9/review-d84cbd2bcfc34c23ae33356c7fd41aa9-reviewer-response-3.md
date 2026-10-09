<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-d84cbd2bcfc34c23ae33356c7fd41aa9"
role: "reviewer"
turn: 3
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md"
artifact_commit: "b20d1255fde08ab16b9ed7ddb8b76dbeef9b0355"
artifact_blob: "1c5f6f22e334ff1f65def384ae221594a5035fe4"
artifact_digest: "sha256:059ebd09c9fe809b50f9b2007771b15fd18cff052f7a23b171750ed502051df9"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "gpt-6-astra"
  session_fingerprint: "sha256:19685058e4c340cdc0bdd0c9d96ee9ce7088fdd6bc6aa0d4d2eff767a83173b4"
  identity_source: "runtime"
started_at: "2026-10-09T01:32:08.926Z"
submitted_at: "2026-10-09T02:10:45.318Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Decision: accepted. The revised plan resolves all three round-2 required findings and retains the earlier corrections. I found no remaining material required changes at the specification-amendment and implementation-plan level.

This acceptance explicitly includes the directly user-authorized normative amendment: one joint task clock, one active execution owner per task, genuine session transfers, measured and separately labeled context/word observations, and independent recorded SessionTime. It does not treat the old separate-lane effort model as current authority. The historical accepted specification remains unchanged historical evidence, with the amendment's express precedence governing the superseded semantics.

Reviewed artifact: docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md, complete 549-line revision. Its byte SHA-256 is 059ebd09c9fe809b50f9b2007771b15fd18cff052f7a23b171750ed502051df9, matching the event-derived round-3 artifact and protected frontmatter. Historical specification SHA-256 remains 6e6e0aae4f1764850701f4f0be0b4593dfde8f1b84e968652b6cdf7b7bcd958f.

I read the exact author-response-2 identified by author-revision-committed sequence 13, the full revised artifact, and the complete prior sealed reviewer-response-2. I rechecked relevant repository source and the captured local native protocol schema. No reviewer Git commands, identity changes, hook changes, implementation edits, or writes to other documents were performed. The approval is a review decision on the plan, not a claim that the proposed implementation or its tests already pass.

### Round-2 finding dispositions

| Finding | Disposition | Assessment |
| --- | --- | --- |
| R2-F001 | Resolved | The Ownership-transfer evidence contract now distinguishes an explicit outgoing release/offer and incoming acceptance from ordinary update/bind. It defines identity/digests, actor authority, canonical paired admission, local pending state, original observation times, checkpoints, recovery, authorized takeover, and old-owner event ordering. |
| R2-F002 | Resolved | The measurement contract defines quantities, units, supported source shape, correlation/availability, imported baselines, exact offset arithmetic, per-session context gauges, public/local provenance boundaries, visible row descriptions and the read-only report. Production and test owners are named. |
| R2-F003 | Resolved | SessionTime explicitly accepts genuine bounded engagement-start evidence, considers earlier retained prefix coverage, distinguishes complete values from lower bounds, and pins the counterexample and protected/mixed/endpoint-only cases. |

### Handoff action, authority and durable recovery

The normal transfer now requires an explicit action by the outgoing actual bound session that names its successor and observes its own release endpoint. A neutral update does not relinquish ownership. Acceptance is produced by the actual bound successor against the exact offer digest. Controlled publication validates retained binding/operation evidence for the issue, action and recipient; copied actor labels and free-text approval claims are excluded. That resolves the former ambiguity between a legitimate same-tick handoff and a competing bind with otherwise identical timing rows.

The canonical handoff-pair is the completion point. The original separate timestamps and stable order remain source facts; a locally prepared half is pending and does not confer completed ownership. The outgoing pre-flush retains its existing banking role. An adjacent handoff journal transports immutable offer/acceptance, while exact durable/remote receipts and full read-back determine the subsequent checkpoints. Lost-response recovery checks existing admission before another mutation. Replay after successor work cannot move ownership or cursors backward. Delayed pre-release evidence remains distinguishable from post-release old-owner execution.

Crash takeover is separately authorized future ownership, not an invented predecessor end. Missing or unsupported authority refuses. A valid takeover leaves the old unobserved extent unavailable while permitting independently bounded future successor work. The required tests distinguish those cases, missing halves, paused transfers, enqueue failure and replay. The plan does not claim a distributed lease or infer exclusive ownership from human assignee policy.

This contract is sufficiently concrete for Tasks 1/2 to consume pure interface fixtures, Task 3 to implement admission validation through injected authority dependencies, and Task 4 to supply genuine producer/authorization/journal adapters. Implementation must prove those adapters and refusal paths; this acceptance does not certify hypothetical host authority as already available.

### Measurement source, units, baselines and visibility

The revised contract preserves existing tier-2 count and tier-3 fullExpansion word semantics rather than redefining the word counter. The new native-usage normalization export is separate from existing transcript text/tool recognition, preventing token-only records from manufacturing word coverage. The current countWords result shape and provider normalizer are consistent with this separation.

I inspected .scratch/peer-review/1901-native-protocol-schema/v2/ThreadTokenUsageUpdatedNotification.json. It contains threadId, turnId, tokenUsage.last and tokenUsage.total, optional modelContextWindow, and integer inputTokens/cachedInputTokens/outputTokens/totalTokens fields. That supports the proposed payload distinction. Schema presence establishes shape only; it does not prove this reviewer host supplied a live observation or establish freshness by itself. The plan correctly requires version/schema checks, genuine bound thread/turn/generation correlation, observation provenance and unavailable handling.

The accepted quantity is explicitly labeled request-input context at an observation boundary, not current post-response context, model capacity, summed traffic or elapsed effort. Aggregate-only, missing, inaccessible or uncorrelated evidence remains Unknown. Compaction invalidates an older observation as a current gauge while preserving its historical value. A smaller later gauge is valid and never becomes a negative produced-work delta. Unsupported other-provider context remains unavailable unless the same owner implements a verified equivalent source.

The word arithmetic is now deterministic: same-generation produced quantities are C-B, with the prior proven offset O applied once. The specified examples produce 1000+(650-600)=1050 words and 2000+(1280-1200)=2080 full words. Imported baselines remain visible but are not additional produced work. Replayed identities add zero; absent baseline or unexplained reset yields partial/unavailable totals with known subtotal. Context gauges are not summed across sessions.

Public source metadata uses opaque session references. Native handles, paths and exact private binding/authorization receipts remain local. Task 4 constructs the context phrase only on new enabled source descriptions and retains the original event description; historical descriptions/word cells are preserved. Task 3 verifies immutable source metadata without needing Task 5's later projection. Task 8's read-only human/JSON report exposes raw, imported, new and joint quantities, methods, observation boundaries, reasons and represented source digest. It creates neither a mutable protected footer nor a second comment authority. The specified tests cover actual producer admission and end-to-end visibility.

### SessionTime and earliest coverage

The earliest qualifying wall-start evidence is now the earliest valid original opener or genuine bounded engagement-start endpoint proving issue work. The end remains the recorded event horizon. Activation and actor adoption cannot truncate the whole-log span. Earlier unresolved retained prefix evidence prevents a complete value and retains a proven lower bound with earliest-start-unproven; protected or mixed-model bytes can still prove endpoints without being rewritten.

The prior counterexample is directly resolved: pause10 with endpoints[0,10], resume20, pause30 with endpoints[20,30] gives Session30, Active20 and Idle10. Endpoint-only history, an earlier legacy prefix, missing/invalid evidence, protected/mixed coverage and actual board/maintenance mapping are assigned verification cases. No implicit local-clock tail is introduced. Joint ownership uncertainty remains scoped independently from genuinely proven wall endpoints.

### Retained requirements, ownership and execution waves

The full plan retains the original recoverable 51/453660/133/5/901-second examples, whole-second flooring, exact optional-days grammar and board codec, legacy bridge rules, actor provenance, bounded observations, symmetric pending Active/Idle, stage-scoped availability and aggregate minute rounding. It continues to separate immutable source identity from mutable duration projection and transcript estimates.

The publication, repair and outcome constraints remain substantive: complete source/projection read-back, at most three mutation attempts, retained known source facts on convergence retries, exact journal/queue replay, protected prefix/suffix discovery and preservation, ordinary protected-cutoff successor handling, original sealed interpretation, actual runtime outcome dispatch, canonical model activation, participant readiness, and exclusive guarded historical apply. No historical application or production rollout is implied by plan acceptance.

Task ownership remains implementable. Wave 1 has independent normalized engine and lexical/codec work. Task 3 follows their integration. Tasks 4/5 can then proceed on distinct producer/provider and projection/outcome surfaces, with shared interface shapes fixed in the plan. Task 3 preserves measurement facts instead of importing the Task 5 report projection. Tasks 6/7 follow both and own separate repair/maintenance surfaces; Task 8 integrates commands, configuration, reports, rollout and system validation last. The adjacent handoff journal and measurement modules have explicit owners and focused tests. The inherited Task 3 file summary's shorter single/lifecycle wording is supplemented by its explicit handoff-pair bullet and shared admission contract; it does not remove the handoff requirement.

Eight tasks remain. The listed estimates sum to 80 child hours plus 2 root hours, and the stated wave critical path is 12+12+14+8+6=52 hours. These are provisional engineering estimates, not measured model time or a substitute for later child refinement. Twenty-five explicitly referenced existing test/helper paths were present; the absent paths were identifiable planned new artifacts. No absent proposed test was claimed to have run.

Root AC/VC bindings, all three historical captures and their provenance, actual adapter verification, governed Test checks and the preparation stop boundary remain intact. R1-F001 through R1-F004 therefore remain resolved as previously dispositioned. The user-authorized joint model remains the current reviewed contract, while the historical specification and old sealed records retain their original evidentiary meaning.

## Findings

None. No remaining material required changes identified.

## Required changes

None.

## Optional suggestions

None required for this acceptance. The plan already requires source revalidation, honest unavailable/refusal behavior, child-focused tests and renewed review for material contract changes; those remain execution obligations.

## Decision

accepted
