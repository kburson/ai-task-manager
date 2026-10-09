# Defect #1901 Event-derived Timing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. This preparation session stops before implementation. Executors must read both this plan and its accepted specification.

**Goal:** Show recoverable story Active/Idle from recorded event history, with exact optional-days clock formatting, coherent accounting and safe historical preview/apply tooling.

**Architecture:** A pure normalized-source derivation engine produces one joint task clock with half-open allocations and availability, independently of transcript estimates. Actor/session identity supplies provenance and exclusive ownership rather than additive effort. Tolerant codecs and one verified publication seam preserve immutable source identity, sealed bytes and recoverable queue/journal semantics. Producers, model-dispatched consumers, guarded repair and explicit rollout use that contract.

**Tech Stack:** Existing Node ES modules, node:test, GitHub comment authority, existing AITM runtime journal/queue and issue locks. No new product dependency or alternative storage authority.

**Spec:** `docs/superpowers/specs/2026-10-08-1901-event-derived-timing-design.md`, accepted artifact commit `bb24dd7ec75c43e3cb0acfbe4803d51a58ef3cd8`, SHA-256 `6e6e0aae4f1764850701f4f0be0b4593dfde8f1b84e968652b6cdf7b7bcd958f`. Specification XPR finalized at `aa5bfc190213a568afc5a18e4e5a98e949f3d8b3`. The historical XPR clarification sections govern earlier summary wording except where superseded by the later direct user amendment below. The historical accepted bytes remain intact. The normative amendment below records the later direct user clarification, supersedes separate-lane effort and assumed SessionTime-seam wording, and is part of this tracked plan review. Acceptance must include that amendment before execution; historical spec acceptance alone does not approve it.

**Repository baseline:** `54dcf2397f6101d67b58e67d3b5e1d81c044fd44`; package `@kburson/ai-task-manager` 0.1.0. Revalidate current interfaces and native dependencies at deep dive and each child pickup; material changes require plan amendment and renewed review.

## Scope

Implement all #1901 AC1–AC6: pure allocation, display and metadata, producers, consumers, replay, live convergence, historical tooling and operational rollout gates. Build apply capability but do not apply to historical GitHub logs, activate production logs, deploy or publish a package during this work. Keep #1847's scope, board codec, #1858 pause policy and #1857/#1862 runtime authority intact. The separately identified old-format zero-literal defect is not silently bundled.

## Context

`runtime.mjs` currently maps unavailable transcript activity evidence to null visible durations. The accepted source requires event ownership and matching closing observations, rather than an opener alone, while preserving original estimates. `gh-timing-comment.mjs` owns append/publication; `lib/timing-row-reader.mjs` is the lexical leaf; outcome-record validation protects exact prefix and suffix bytes. GitHub comment writes have no compare-and-swap. We can detect, converge and refuse within bounded attempts, but cannot promise global atomic exclusion.

## Plan Metadata

- Priority: P1
- Size: XL
- Estimate: 82 hours joint engineering effort, provisional until current child refinement
- Labels: bug
- Governing-spec: docs/superpowers/specs/2026-10-08-1901-event-derived-timing-design.md
- Stop-boundary: parent Develop prepared; children Ready for Planning; no implementation

## Story Intent

- **Beneficiary:** workspace operator reviewing story timing
- **Capability:** assess recorded engagement and waiting directly from event-derived Active and Idle durations
- **Need:** recoverable event intervals currently appear Unknown or reflect transcript heuristics instead of recorded engagement
- **Value or failure prevented:** reliable story timing without fabricated observations, double credit or unsafe historical rewrites

## Global Constraints

- Normalize timestamp milliseconds with `floor(ms / 1000)`; subtract whole-second ticks. Preserve original text, offset, precision and millisecond evidence.
- Known display is `[N days ]HH:MM:SS`: positive unpadded day prefix only at 24 hours or above, hours 00–23, two-digit clock fields; blank-zero remains distinct from explicit `00:00:00`.
- Reject unsafe, negative, fractional/nonfinite numeric seconds, numeric strings to formatting, invalid dates/offsets and malformed/conflicting recognized suffixes; never clamp to zero.
- Pure derivation has no network, writes, transcript access or implicit clock. Active/Idle need attributable bounded observation; unrelated/shared events cannot close a lone actor opener or interruption.
- Preserve immutable timestamps, event/actor identity, engagement endpoints and original estimate, description, words, transition identity and unrelated suffixes. Delta Words retains its existing separate publisher normalization.
- Event projection metadata is `aitm-duration:v1`, model `joint-event-delta/v1`; activation control is one immutable `aitm-duration-model:v1` in the canonical Timing Log.
- Every fully known dimension agrees across display, allocation and numeric metadata; partial rows omit a misleading complete row-sec pair and expose known subtotals/reasons.
- A live source admission plus affected reallocation is one body mutation, with full-projection read-back and a maximum of three mutation attempts. No own-row-only acknowledgment, CAS claim or automatic restore over newer data.
- Preserve exact sealed source prefix/suffix bytes and old outcome semantics; protected true late insertion/repair refuses. A valid ordinary append after a protected cutoff survives with an explicit unavailable protected remainder.
- Local config authorizes requesting rollout; the shared marker governs actual model. Marker-present legacy/disabled participants follow it or refuse. Unsupported installations are excluded operationally, not magically made safe.
- Historical apply consumes a reviewed preview digest, exact backup and coordinated exclusive maintenance window. Preview/export stays available without writer exclusion; no real historical apply is authorized here.
- Board codec stays unchanged. Task 5 introduces the defined independent SessionTime because the baseline board mapping currently aliases actor Active totals. Plan/Review Active are subsets of Engaged. Round minute totals only after summing seconds.
- Root ACs and governed child Test/Review gates remain required. Each child owns executable focused verifiers; aggregate gates never substitute for a failed child contract.

## Normative amendment to the historical accepted specification

Authority is the user's explicit 1A/2A response and subsequent clarification, recorded in [#1901 joint-effort clarification](https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6071936726). The user selected independent recorded SessionTime and stated that effort is joint, a task has one agent at any given time, and replacing an agent/session is a handoff affecting real context-token and word measurements. This changes the original specification's separate-lane summation. This amendment is reviewed with this plan by SPR and XPR; acceptance at bb24dd7e remains historical evidence, not acceptance of this amendment.

- One issue has one joint Active/Idle clock. Human and agent activity are not separate additive effort counters. At most one agent owns active execution at a time. Parallel work is across distinct child tasks, with one active agent per child. Author and reviewer take sequential protocol turns.
- Actor/session IDs remain immutable provenance. Replacement consumes a recorded ownership handoff, not another simultaneous effort lane. Detected conflicting current source-owner/handoff evidence refuses admission before a write or checkpoint change. Supported execution is operationally limited to one agent per task; this defect does not claim to implement a new distributed task lease. Publisher convergence detects conflicts under the existing bounded non-CAS contract, without promising global atomic exclusion. Historical contradictory overlaps are retained and diagnosed as `ownership-conflict`; affected joint allocations are unavailable, never double-summed. Later unambiguous ownership evidence restores future allocation without erasing conflict.
- A handoff records genuine predecessor/successor actor/session binding identities, source IDs, original observed endpoints and availability. Proven same-instant handoff preserves engagement/interruption state and task cursor; it creates no Idle. Explicit departure/resume keeps the actual Idle gap. Missing handoff/end evidence remains a scoped unavailable remainder, never an invented end or session identity. Task 2 stores attestation in immutable source evidence; Task 4 produces it from sanctioned bind/recovery observations using existing event vocabulary.
- `joint-event-delta/v1` is a distinct planned model. Earlier `event-delta/v1` is not silently reinterpreted: historical evidence retains its explicit interpretation and incompatible current writes refuse. The reader-compatible release understands the new model. Neither proposed model is claimed to have shipped.
- Joint Engaged and Idle sum disjoint slices of the single task clock. For complete coverage, Active + Idle is at most SessionTime; excluded, unconverted or protected coverage explains a remainder. Plan and Review are Active subsets, never added again. Attribution/ownership uncertainty need not invalidate independently proven wall endpoints.
- `projectSessionWallSpan({sources})` is a new Task 5 pure function. It takes the earliest proven opener or bounded engagement-start evidence, subject to the earliest-coverage rules below, and last recorded event horizon for this issue, floors original millisecond endpoints to second ticks, and subtracts. Pauses and gaps count in wall span; no now-based tail, actor sum or Active alias is permitted. Return `{state,value,knownSec,reasons,sourceRefs,fromTick,untilTick}` with integer seconds or null. Missing opener/horizon, conflicting source timestamps, invalid potentially horizon-defining evidence or unsafe/negative subtraction yields unavailable, with a proven lower bound where available. A lone valid opener yields known zero at its recorded horizon. Incomplete effort/stage, mixed models or protected allocation do not invalidate proven immutable wall endpoints. Enabled board seconds read `sessionSec.value`, minutes read complete seconds / 60 with Math.round; null remains Unknown. Legacy marker-free and sealed calculations retain their pinned mapping; enabled current board/maintenance mappings deliberately use this new scalar.
- Required examples: start0/pause10/resume30/update40 => Active20, Idle20, Session40. Proven A-to-B handoff at10 between opener0 and update20 => Active20, Idle0, Session20. Contradictory A0..10 and B5..15 without handoff => independently known Session15 but unavailable affected joint effort with conflict scope and nonconflicting subtotal; never summed 20-second effort. Unresolved effort at a valid recorded horizon never grows with the local clock.
- Raw measured per-session word/context cursors remain immutable. Imported context counts only when actually measured with source/availability. A handoff retains predecessor cursor refs and successor baseline; Tasks 4/5 derive joint task totals using explicit offsets and replay IDs without counting cumulative cursors twice, fabricating context size, resetting task totals or rewriting protected word cells. Existing Delta Words normalization remains separate. Unknown measurements stay Unknown; native input-token traffic is not context capacity or elapsed effort.

All other accepted constraints remain: bounded observation, whole-second flooring, source identity, stage attribution, sealed bytes, original estimates, shared-boundary partition, atomic pairs, distinct durable enqueue/remote publication, bounded non-CAS convergence, safe repair and explicit rollout. If task text contradicts this amendment, correct it before hydration; the amendment governs.

## Ownership-transfer evidence contract

Tasks 1/2 validate and encode these shapes before wave 2; Task 3 admits them; Task 4 produces genuine observations. Ordinary update plus another actor's bind/start never proves transfer. A readable actor/source ID, endpoint or matching human assignee is not release authority.

- A normal offer has immutable `transferId = sha256(canonical(repo,issue,fromActorRef,toActorRef,operationId,offerSourceId))` and `offer = {transferId,fromActorRef,toActorRef,offerSourceId,offeredAtMs,releaseTuple,state,authorizationRef,evidenceDigest}`. Only the outgoing actual bound native session may produce this explicit transfer/release action through prepareTimingHandoff; it names the successor, observes its own real endpoint and stops task execution after the release tuple. Neutral update without this control action is not release. Public identities are existing opaque keys/fingerprints; native handles stay local.
- Incoming `acceptance = {transferId,toActorRef,acceptSourceId,acceptedAtMs,offerDigest,authorizationRef,evidenceDigest}` comes only from the actual bound successor through acceptTimingHandoff. Controlled publication resolves both authorization refs to retained genuine host binding/operation evidence for the exact issue/action/recipient. Hashing caller-supplied labels alone is not authentication; unverifiable authority refuses. No free-text agent claim of human approval substitutes for source authority.
- Completion is one `handoff-pair` admission with outgoing neutral update/offer and incoming neutral update/acceptance. Both original separate observation timestamps and stable source order are preserved. The offer release tuple and incoming owner-entry tuple are immutable controls; canonical verified pair admission completes transfer. A local prepared half is not completed ownership. Incoming handoff update carries the joint engagement/interruption state; a later actual resumed event closes interruption normally. No timing slug or implicit pause/end is invented.
- Normal continuity is supported only by the outgoing offered task state and incoming observed accepted state plus verified transfer authority. Those genuine task-level observations can bracket continuous joint engagement across session replacement; neither participant retrospectively attests the other's session execution. Missing continuity/observations leaves that gap unavailable. Same-tick transfer preserves cursor with no duplicate time; paused transfer preserves interruption until actual resume and never becomes Active merely because owner changes.
- Durable sequence: outgoing pre-flush banks original words once; prepare immutable owner-bound offer beside the existing actor-flush journal; successor verifies exact offer and durably prepares acceptance with its measured baseline; enqueue/publish the complete original pair once; verify full canonical projection; retain exact durable/remote receipt; advance only the corresponding checkpoints once. An incomplete pair stays pending and cannot admit ordinary successor work as completed transfer. This adjacent handoff journal is recoverable transport, not replacement GitHub authority or runtime-storage migration.
- Recovery inspects transfer/source IDs and digests against canonical admission before retry. Lost response after pair admission recovers existing receipt without a duplicate; replay after successor work never moves owner or cursor back. Delayed halves keep real original times. Changed recipient, time, issue or offer digest conflicts. Missing predecessor end remains unknown independently of authorized future takeover.
- Crash takeover is distinct `kind=authorized-takeover` control evidence from recoverTimingHandoff, requiring retained actual recorded human/operator authorization or already authorized host recovery decision for exact issue, old/new actors and operation. Its authorization source/digest is resolved through the genuine host/controller evidence path; agent-authored approval prose, raw actor IDs and self-declared orphan status are insufficient. Unsupported/missing authority refuses takeover. A verified receipt opens successor ownership at its actual observed start while predecessor unknown end/gap remains unavailable: no fabricated release, backdating or lost-interval credit. Later bounded successor windows are known independently, so missing old history does not permanently poison future work.
- Delayed old source before its release tuple may be admitted with original identity/order and reallocation. Old-owner execution after release or accepted successor entry conflicts/refuses. Equal-tick ordering needs original ms/stable order or remains ambiguous; never arbitrarily order actors. Pair replay cannot manufacture ownership overlap.

Task 4 creates lib/timing-handoff.mjs and lib/timing-handoff-journal.mjs, with prepareTimingHandoff/acceptTimingHandoff/recoverTimingHandoff using the shapes above and actual bind/resume/recovery adapters. Task 3 extends admission kind to single, lifecycle-pair, handoff-pair. Task 8 registers explicit timing-handoff prepare/accept/recover command/help operations; these controls add no timing slug or global lease. Every operation revalidates real binding and authority; unsupported recovery evidence refuses. Tasks 1/2 consume interface fixtures without importing producer code. Task 4's authorization resolver validates outgoing/incoming actual bound runtime operation receipts; takeover additionally requires genuine user-origin or already authorized controller decision evidence for that exact operation. It never accepts a model-authored transcript item, copied handle or arbitrary caller JSON as user authorization. Unsupported providers/authority sources return a typed refusal, not inferred consent.

Tasks 1–4 test intentional same-tick transfer versus competing bind with identical ordinary rows; delayed acceptance and paused transfer/resume; missing half; crash/takeover with unknown past but known future; enqueue failure; lost reply after admitted pair; replay after successor work; delayed old event before release versus actual old execution after it. Authority fixtures are explicitly synthetic and cannot authorize real takeover.

## Session measurements and visible joint counters

Task 4 creates lib/timing-measurement.mjs and owns a separate normalizeNativeUsageObservation(record,boundContext) export in scripts/providers/transcript-normalizer.mjs. It does not alter normalizeTranscriptRecord's existing text/tool recognition or word-counter semantics; token-only evidence must not turn unavailable words into a fabricated zero. Task 2 serializes immutable observation evidence; Task 5 creates projectHandoffMeasurements beside scalar projection; Task 3 preserves/verifies immutable measurement metadata during canonical admission; Task 8 renders the read-only timing-measurements report from Task 5 projection. Existing native transcript/binding/journal seams remain; no storage migration or word-counter redefinition.

- `MeasurementObservation = {observationId,sessionRef,sourceId,observedAtMs,boundary,provider,method,providerVersion,rawRecordDigest,wordCursor,fullWordCursor,contextRequestInputTokens,availability,reasons}`. Word cursors are integer words from real countWords tier-2 count and tier-3 fullExpansion. Context is integer tokens at a specified request-input boundary, not cumulative traffic or capacity. Each quantity has independent `{state:known|unavailable,value,reasons,sourceRefs}` availability. Projected counters separately use state known|partial|unavailable; null totals retain knownSubtotal. IDs are immutable source/replay identities. Native handles/transcript paths and exact authorization/binding receipts remain owner-only local provenance; public sessionRef uses opaque actor key or one-way binding fingerprint.
- Supported Codex evidence is a genuine version-checked thread/tokenUsage/updated notification correlated to the actual bound thread/turn, using tokenUsage.last.inputTokens as the last completed request's input-context observation. The official local Codex 0.162.0-alpha.2 generated schema defines ThreadTokenUsage.last/total/modelContextWindow and TokenUsageBreakdown.inputTokens. A recognized Codex rollout token_count record is eligible only if it preserves equivalent last-request semantics and genuine bound provenance. Exact version/schema, timestamp freshness, same bound request/generation and safe nonnegative integer units are checked; tokenUsage.total, totalTokens, modelContextWindow, exec turn.completed aggregated usage, words and guidance calibration are never substituted. Label this request-input context, not live post-response context. [Official native notification](https://learn.chatgpt.com/docs/app-server).
- If evidence is aggregate-only, absent, inaccessible, uncorrelated or unsupported, contextRequestInputTokens is null/unavailable with reason/provenance. Claude/other providers initially have unavailable context unless a verified equivalent per-request source adapter is explicitly implemented by this same owner. Real words do not justify synthesizing tokens. Capturing absence makes no model request and needs no new provider API-key/harness.
- Compaction/reset invalidates an older observation as a current gauge until a new supported request observation; retain its historical value/time/boundary. A smaller later context observation is a legitimate gauge decrease, not negative word/effort delta. Never sum context gauges across requests/sessions. Task 4 captures official schema/source-version and digest in implementation fixtures; schema presence alone is not proof a host supplied a live measurement.
- A cursor generation has actually measured baseline B_words/B_full and monotonic cursors C_words/C_full. Produced words are C_words-B_words and C_full-B_full only when both endpoints are known, same-generation and nonnegative. Initial joint counters sum unique nonoverlapping produced slices, not repeated cumulative snapshots. Handoff keeps prior proven joint offset O, measures successor imported baseline B, then projects O+(C-B). Replayed source IDs add zero. Actual reset starts a new measured generation/baseline; missing baseline, unexplained decreasing cursor or generation mismatch is unavailable, never clamped or inferred from context shrink.
- Example: A joint produced offset1000, B imported baseline600, later raw cursor650 => expose raw600/650, imported600 and new50, joint1050. Full-word offset2000, B baseline1200/current1280 => joint2080. Imported context is visible provenance, not additional produced work. Missing B baseline preserves known subtotal1000 but joint value is null. Unconverted/protected unknown earlier word coverage similarly makes whole-log totals partial.
- projectHandoffMeasurements returns `{jointWords,jointFullWords,sessions,observations}`. Joint counters are `{value,knownSubtotal,state,reasons,sourceRefs,coveredSegment}`. Sessions expose opaque ref, raw/imported baselines, produced slices and context request-input gauge with time/method/availability. Raw observations remain immutable; only derived joint projection changes. Existing Word Marker, Full Word Marker and Delta Words preserve their source/normalization contract.
- Task 4 includes `Context at request input: <integer tokens|Unknown> (<observation boundary/reason>)` as an appended source-description phrase only when constructing new enabled rows, retaining the original event description. Existing descriptions/word columns are never rewritten. The observation time and immutable measurement envelope in that row preserve exactly what was observed; Task 3 admits/verifies them without a dependency on Task 5. Task 8 registers `timing-measurements <issue> [--json]`, a read-only report from the canonical Timing Log and Task 5 projectHandoffMeasurements. It renders observation time, opaque session, raw/imported/new words/full words, joint totals or Unknown/subtotals, and `Context at request input (tokens)` with method/boundary/reason and represented source digest. This is an inspectable derived view, never alternate authority or a second live comment write. New context observations are visibly rendered in their Timing Log rows even when Unknown. Reports verify canonical projection freshness and protected/legacy coverage, never rewriting sealed prefix/suffix or claiming stale/subtotal values as complete. No public raw handles, paths or private messages.

Task 2 tests envelope/provenance round-trip and private-field rejection. Task 4 tests real native-last-request versus aggregate/capacity/guidance/word impostors, missing quantities, baseline/reset/compaction observations and replay. Task 5 tests exact1050/2080, absent-baseline partial totals, replay and smaller gauge. Task 3 tests actual row metadata/description admission, full read-back/protection and opaque public identity; Task 8 tests read-only human-readable/JSON projection rendering. Task 8 proves end-to-end visibility. Each task owns corresponding cases in its focused command; newly named handoff/journal/measurement tests are Task 4 owned.

## SessionTime start evidence and earliest coverage

Task 5 selects the earliest valid original recorded start/resume opener OR genuine bounded engagement-start endpoint proving issue work, not just the first surviving opener row. Task 1 exposes endpoint provenance and earliest-coverage availability independently of actor attribution. End is last valid recorded event horizon. Complete span requires no earlier retained source/prefix with unresolved potentially earlier start; otherwise value is null and the proven span is knownSec lower bound with earliest-start-unproven. Protected/mixed prefix endpoints can establish wall span without rewriting bytes; missing/unreadable/invalid prefix authority keeps coverage unavailable. Never truncate whole-log span to later activation/actor adoption.

Regression: pause10 endpoints[0,10], resume20, pause30 endpoints[20,30] => start0, Session30, Active20, Idle10. Endpoint-only rows likewise use their earliest proven bounded start; absent explicit/valid bounded start => null. Legacy prefix earlier than attributed start remains eligible; unknown earlier prefix => lower-bound-only. Tasks 1/5 test source eligibility, scalar and actual board mapping; Task 7 tests enabled heal-backlog consumption. No implicit clock or fabricated row is added.

## Review Focus

1. An actor opens and never returns while another advances stages for days: no invented Active or Idle tail (Task 1).
2. An original journal payload replays after another writer reallocates it: one source/word admission and only full-projection acknowledgment (Task 3).
3. An ordinary actor update spans a sealed cutoff: append succeeds, protected bytes stay exact and its unfillable earlier portion remains unavailable (Tasks 3 and 5).
4. Two upgraded hosts have divergent local settings around activation: the shared marker wins and old/unknown participants block rollout (Task 8).
5. A repair loses its response while another source changes: correlate exact target or refuse; never blindly repeat or restore (Task 6).

## Contracts shared across tasks

The following names are new planned interfaces, not claims that they already exist. Task ownership below creates them. Types use JavaScript objects; named shapes below fix their fields across workers.

- `SourceFact = { sourceId, evidenceDigest, sourceOrder, tick, timestampText, event, lane: {kind,key}, stage, endpoints, originalEstimate, words, description, transitionId, opaqueSuffixes }`. `lane.kind` is actor, legacy-single-stream or shared; an actor key is existing identity, never synthesized. `sourceOrder` is a stable integer tuple, not a current array index. `endpoints` holds original ms and attributable closing observations, or null. Pauses are separate scoped immutable facts. Immutable source evidence optionally carries `handoff = {kind: normal|authorized-takeover,transferId,offer,acceptance,takeover,availability}` and `measurement = {observations,baseline:{generationId,words,fullWords,importedRefs,availability},offsetRefs,availability}` using the concrete shapes and arithmetic below; missing values remain null/unavailable. Session refs come from real bindings, never fabricated IDs. Source identity hashing includes these attestations.
- `Allocation = { lane, fromTick, untilTick, seconds, dimension, stage, sourceRefs, method }`; dimension is active/idle; method is event-bracket, engagement-endpoints or legacy-idle-bridge. Each half-open allocation belongs to one closing source row and one joint task clock; lane is provenance, never permission for overlapping effort credit.
- `Availability = { state, knownSec, reasons, sourceRefs, extents }`; state is known, fillable-pending or terminal-unavailable. Unknown stage/lane diagnostics have inspectable scopes; known Idle alone cannot invalidate Active.
- `deriveEventDurations({ sources, pauses, activation, protectedRegions })` returns `{ model, sourceDigest, rows, scalars, diagnostics }`. A row contains `{sourceId, activeSec, idleSec, allocations, activeAvailability, idleAvailability, precision}`. Each scalar is { value: nullable integer seconds or minutes, knownSec: integer subtotal seconds, state, reasons, sourceRefs }; scalars expose independent availability and subtotal; no projected implicit tail.
- `decodeTimingSource(body)` returns `{sources,pauses,activation,diagnostics}` from lexical rows and canonical event grammar. It is pure and consumes the unchanged original source evidence, not displayed duration as event truth.
- `formatTimingDuration(seconds)` and `parseTimingDuration(text)` own new Timing Log grammar plus legacy read compatibility; the board formatter is untouched.
- `parseDurationSuffixes(line)` and `replaceDurationProjection(line, projection)` preserve opaque/source bytes and use the accepted composed-suffix order. Activation marker insertion is separate control evidence, never a mutable projection rewrite.
- `discoverProtectedTimingRegions({repo,issueNumber,commentNodeId,readRecords})` returns `{complete,regions,records}`. Each region identifies exact source bytes/digest and cutoff. Missing, inaccessible or ambiguous authority means complete=false and publication/apply refuses mutation.
- `publishTimingAdmission({context,admission,deps})` consumes one immutable single-source, lifecycle-pair or handoff-pair admission unit, a real source tick/order and optional explicit authorized activation request. It returns existing normalized publication/queue outcomes plus sourceDigest, attempts and reason. It uses injected reads/writes/locks and calls Task 1's pure engine and Task 2's codecs.
- `projectEventScalars(derivation)` yields complete seconds/null, known subtotals, reasons and rounded minutes for Engaged/Idle/Plan/Review/per-stage values. SessionTime uses Task 5's new projectSessionWallSpan contract above, independently of joint effort and under explicit model dispatch. Task 5 also exports `projectHandoffMeasurements({sources})` with the counter/session/observation shape below and `readVerifiedJointStageTiming({body,context})`, returning verified per-stage seconds/availability, source digest and model; it never converts incomplete subtotals or bare stored row-sec into complete stagesMs.
- `prepareEventDurationRepair({source,context})` returns an immutable preview with source/target digests, operation/operator identity, categories, allocations, protection, model coverage and board deltas. `applyEventDurationRepair({preview,coordination,deps})` requires that exact preview and validates every byte/write outcome.

Treat signatures as interface commitments. An implementer cannot silently rename fields used by siblings. Additions must be backward compatible within this plan or reviewed before another wave depends on them.

## Parallel waves and estimates

These are logical execution ranks, not already created issue IDs. Hydration binds them to real child issues, adds native blocking dependencies and uses the same rank for same-wave siblings. No worker is launched in this preparation session.

| Task                                                   | Rank/wave | Depends on tasks | Independently owned surface                               | Initial joint hours |
| ------------------------------------------------------ | --------- | ---------------- | --------------------------------------------------------- | ------------------: |
| 1 Engine, bounded evidence and exact histories         | 1         | none             | new engine/source facts, captures and tests               |                  12 |
| 2 Tolerant lexical, actor and display codecs           | 1         | none             | lexical/actor leaf and new codecs                         |                  10 |
| 3 Verified publication and source protection           | 2         | 1,2              | publisher, protection and convergence tests               |                  12 |
| 4 Producers, ownership handoff and durable outcomes    | 3         | 3                | runtime/bind/journal/queue/wrapper/lifecycle emitters     |                  14 |
| 5 Joint scalars, independent session span and outcomes | 3         | 3                | projection, ladder, rollup, board and estimation adapters |                  12 |
| 6 Guarded historical recalculation                     | 4         | 4,5              | repair and preview/apply tests                            |                   8 |
| 7 Maintenance consumer compatibility                   | 4         | 4,5              | heal/rename/sequence and all sequence tests               |                   6 |
| 8 Reader-first rollout and aggregate validation        | 5         | 6,7              | config/catalog/routing/release docs and system tests      |                   6 |

Task 1 does not import the Task 2 lexical implementation: it accepts normalized SourceFacts. Task 2 does not import derivation: it provides lexical/codec primitives and pure source decoding. Wave 1 validates their agreed shape independently before Task 3 integrates it. Tasks 4/5 and 6/7 may fan out only on integrated predecessor commits. Existing files are single-owner: Task 5 owns `lib/timing-rows.mjs` and `lib/timing-engagement.mjs`; Task 2 owns new formatting/metadata modules instead of editing those same files. Task 8 alone owns command catalog/routing and configuration. Task 6 supplies repair exported parser/help contracts for Task 8 registration. If a consumer sweep discovers an unlisted shared file, pause that change and route it to its declared owner; do not create overlapping edits in sibling worktrees.

Joint effort sum is 80 hours; reserve 2 hours root integration/orchestration, yielding 82 hours. Wave critical-path sums are 12 + 12 + 14 + 8 + 6 = 52 hours before staffing/coordination overhead; do not replace board effort with this parallel elapsed estimate. These are engineering estimates, not measured model time. Refined children replace these initial values before parent Develop entry.

## Adapter ownership and model dispatch

All shortened lib/ and verb paths resolve beneath scripts/task-tracker; shortened test paths resolve beneath scripts/tests. These known seams are assigned now. A later sweep verifies completeness rather than deciding their owners.

| Existing production seam                                                                                                                                                                                           | Owner / wave | Legacy or sealed behavior                                     | Enabled current-model behavior                                                                                          | Focused verifier                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| lib/timing-row-reader.mjs::readEstimationStageTiming                                                                                                                                                               | Task 2 / 1   | Explicitly legacy-only calculation                            | Enabled numeric callers use Task 5 readVerifiedJointStageTiming; lexical rows retain raw metadata                       | timing-row-reader and new source/metadata tests                                    |
| lib/timing-actor.mjs::readTimingActor                                                                                                                                                                              | Task 2 / 1   | Preserve identity, endpoint and cursor checks                 | Tolerant composed suffixes; no duration policy import                                                                   | timing-actor and new metadata tests                                                |
| gh-timing-comment.mjs::postTimingEvent                                                                                                                                                                             | Task 3 / 2   | Preserve legacy admission                                     | Single-owner source admission, full joint projection verification, max three mutation attempts                          | publication and gh-timing-comment-actors tests                                     |
| runtime.mjs, queue.mjs, lib/actor-flush-journal.mjs, lib/bind-event.mjs                                                                                                                                            | Task 4 / 3   | Original checkpoints, journal identities, estimates and words | Proven ownership handoff, real measurement baselines and explicit durable/remote/pending outcomes                       | producers, journal, isolation and bind-event tests                                 |
| verbs/resume.mjs, verbs/review.mjs, verbs/approve.mjs, verbs/close.mjs, hook-handler.mjs, lib/review-approval-timing.mjs, lib/terminal-review-handoff.mjs, lib/move-state/audit-timing.mjs and guard-execution.mjs | Task 4 / 3   | Original vocabulary and lifecycle gates                       | Actual emitter/pair/checkpoint paths use Task 3 seam; no unsupported core-emitter escape                                | producers, terminal-review-handoff and coverage-audit-timing tests                 |
| lib/timing-post-outcome.mjs::postTimingSafely and queue drain handlers                                                                                                                                             | Task 4 / 3   | Original successful legacy paths                              | Pending/refused never becomes ok:true or dequeues an item; durable acceptance differs from remote publication           | new timing-post-outcome test and producers/queue integration                       |
| timing-rollup.mjs, lib/timing-rows.mjs, timing-engagement.mjs, timing-ladder.mjs                                                                                                                                   | Task 5 / 3   | Pinned old snapshot and legacy API dispatch                   | Retain raw model/source data; verify joint projection, session span and per-stage availability                          | projection, rollup and ladder tests                                                |
| scripts/gh/log-issue-time.mjs::timingFieldProjection                                                                                                                                                               | Task 5 / 3   | Baseline mapping and unchanged board codec                    | Explicit joint model maps independent sessionSec/sessionMin, never Active aliases                                       | slow log-issue-time and projection tests                                           |
| lib/estimation/runtime-adapter.mjs, outcome-builder.mjs, outcome-record.mjs                                                                                                                                        | Task 5 / 3   | Pinned sealed source/snapshot interpretation                  | Actual live complete/partial selection uses verified stage availability; stale/mixed/protected input stays incomplete   | new estimation-runtime integration plus telemetry/builder/writer/child-close tests |
| heal-backlog.mjs, lib/heal-timing-log.mjs, heal-timing-interval.mjs, timing-slug-rename.mjs, agent-review/validators/timing-log-sequence.mjs                                                                       | Task 7 / 4   | Preserve legacy/protected bytes                               | Verified current session scalar and joint model, refuse stale/malformed projection, retain handoff/measurement evidence | maintenance and all three sequence validator tests                                 |

Task 4 defines `PublicationResult = {status: remote-published|queued-durably|pending|refused, remotePublished, queuedDurably, sourceDigest, receipt, reason}`. A resolved promise alone is not success. Skipped is not remote acknowledgment. An exact durable queue receipt may advance the original local banking checkpoint once; it cannot seal remote terminal evidence. Queue drain removes only remotely verified admission. Pending, refused or throwing handlers retain the immutable item/receipt/digest. Queue persistence failure leaves checkpoint unchanged. Tests exercise the real wrapper and drain.

## Root verification bindings

Existing vc:1–vc:4 retain their live exact commands; vc:5–vc:9 retain npm test, npm run test:slow, npm run lint, npm run format:check and git log --oneline -1. They provide baseline/aggregate evidence and never substitute for new behavior. Planned vc:10–vc:17 correspond to Tasks 1–8: each exact focused command is that task's first node --test command in its Verification Commands block below, preserving the full argv. Task 8 additionally contributes existing aggregate vc:5–vc:8. No command is declared passed here. After plan acceptance, a governed issue-body operation materializes the exact commands into root numbered entries and AC vc-list references before hydration. Future child evidence remains linked to those actual root groups.

| Root AC                                                   | Existing groups | New groups / future child owner                                      |
| --------------------------------------------------------- | --------------- | -------------------------------------------------------------------- |
| AC1 recovered seconds, missing transcript and captures    | vc:1, vc:3      | vc:10 Task 1, vc:12 Task 3, vc:13 Task 4, vc:17 Task 8               |
| AC2 grammar and board codec                               | vc:2, vc:4      | vc:11 Task 2, vc:14 Task 5, vc:17 Task 8                             |
| AC3 actual producer/checkpoint paths                      | vc:1            | vc:12 Task 3, vc:13 Task 4, vc:16 Task 7, vc:17 Task 8               |
| AC4 session/scalar/outcome dispatch and sealed reuse      | vc:2, vc:4      | vc:11 Task 2, vc:12 Task 3, vc:14 Task 5, vc:16 Task 7, vc:17 Task 8 |
| AC5 guarded preview/apply/idempotency                     | vc:3            | vc:12 Task 3, vc:15 Task 6, vc:17 Task 8                             |
| AC6 joint clock, handoff, conflict, replay and protection | vc:1, vc:4      | vc:10 Task 1, vc:12 Task 3, vc:13 Task 4, vc:14 Task 5, vc:17 Task 8 |

## Acceptance Criteria

- [ ] AC1: reproduce 133/5/51/453660 seconds and the subsequent 901-second update, including unavailable transcript and live unfinished-turn conditions; bounded evidence and conservation pass (Tasks 1,3,4,8).
- [ ] AC2: exact optional-days grammar, blank/explicit zero, malformed/unsafe input and unchanged board codec pass (Tasks 2,5,8).
- [ ] AC3: every producer uses event derivation under the canonical model with source/word preservation and honest unavailable reasons (Tasks 3,4,7,8).
- [ ] AC4: readers, metadata, scalar projections, replay, partial totals and original sealed outcome semantics agree (Tasks 2,3,5,7,8).
- [ ] AC5: preview-default, source-bound apply, non-overwriting exact backup, exclusion/drift/read-back failure and idempotency pass without real historical writes (Tasks 3,6,8).
- [ ] AC6: actor attribution/conflicting overlap, sequential ownership handoffs, shared pairs, delayed events, queue/journal restart and protected boundaries conserve allocations without duplicate credit (Tasks 1,3,4,5,8).

## Implementation Tasks

### Task 1: Derive bounded event durations with actor isolation and conservation

#### Story Intent

- **Beneficiary:** workspace operator inspecting engagement history
- **Capability:** recover attributable Active and Idle intervals from recorded events and inspect unresolved portions
- **Need:** transcript estimates suppress recoverable durations while unrelated events can otherwise inflate an actor's open tail
- **Value or failure prevented:** correct elapsed timing without cross-actor credit, invented observations or duplicate slices

#### Files

Create `scripts/task-tracker/lib/timing-duration-derivation.mjs` and `scripts/tests/unit/task-tracker/lib/timing-duration-derivation.test.mjs`. Create synthetic source-fact builders in `scripts/tests/helpers/1901-duration-facts.mjs`; later tasks use them read-only. Consume `lib/timing-events/index.mjs` classification without changing vocabulary. Interface: implement deriveEventDurations and Allocation/Availability exactly as above; normalized input rejects bad timestamps and source identity conflicts.

**Rank:** 1. **Estimate:** 12 hours, L. **Dependencies:** none.

- [ ] Read-only capture exact complete Timing Log bodies for #1851, #1852 and #1854 into `scripts/tests/fixtures/1901-timing-history/{1851,1852,1854}.md` plus `manifest.json`. Include repository, issue, canonical comment URL/node ID, body SHA-256, capture time and status. Verify sources https://github.com/kburson/ai-task-manager/issues/1851#issuecomment-5915448363, https://github.com/kburson/ai-task-manager/issues/1852#issuecomment-5915705167 and https://github.com/kburson/ai-task-manager/issues/1854#issuecomment-5915941693 against canonical current comment authority. Capture failure blocks the real-history verifier; labeled synthetic inputs never replace missing captures. Task 1 owns those fixtures and `scripts/tests/unit/task-tracker/lib/1901-timing-history-fixtures.test.mjs`; Tasks 6/8 consume them read-only. Assert hash/provenance agreement, the full supplied #1854 sequence and actual #1851/#1852 Unknown recoveries without live writes.
- [ ] Pin the normative single-clock examples, genuine handoffs, owner-conflict extents and no double summation. Closed allocations retain provenance but are unique in task time; prove complete Active+Idle<=Session. Missing attribution/ownership cannot synthesize another additive effort lane.
- [ ] Add table-driven failing tests for tick flooring, 51 Active, 453660 legacy bridge Idle, 133 update Active, boundary 5 and subsequent 901; same-second pair zero; minute-resolution input; offset changes; invalid calendar date/missing zone; unsafe tick; duplicate start; repeated departure; source conflict. Synthetic fixtures must be labeled synthetic.
- [ ] Add these executable kernel tests, with `makeFact` from the helper constructing complete SourceFact fields. Times below are already normalized ticks; real timestamp tests separately exercise the decoder.

```javascript
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deriveEventDurations } from '../../../../task-tracker/lib/timing-duration-derivation.mjs';
import { makeFact } from '../../../helpers/1901-duration-facts.mjs';
test('own observation splits at recorded shared boundary without recount', () => {
  const sources = [
    makeFact('start', 0, 'a'),
    makeFact('plan:started', 5, 'shared'),
    makeFact('update', 906, 'a'),
  ];
  const r = deriveEventDurations({ sources, pauses: [], activation: null, protectedRegions: [] });
  assert.equal(r.rows[1].activeSec, 5);
  assert.equal(r.rows[2].activeSec, 901);
  assert.equal(r.scalars.engagedSec.value, 906);
});
test('unrelated boundary cannot end a lone opener', () => {
  const r = deriveEventDurations({
    sources: [makeFact('start', 0, 'a'), makeFact('plan:started', 86400, 'shared')],
    pauses: [],
    activation: null,
    protectedRegions: [],
  });
  assert.equal(r.scalars.engagedSec.value, null);
  assert.equal(r.scalars.engagedSec.knownSec, 0);
});
```

- [ ] Implement the joint task state machine with immutable actor attribution and validated handoff chain, unique source-order validation, observed endpoint reconciliation, narrow legacy bridge retirement, scoped pause union, shared boundary split and unavailable extent propagation. Add symmetric never-resumed Idle, matching late endpoint spanning boundaries, orphan recovery without original end, observed long transcript gap with zero event Idle, contradictory historical overlapping owners without handoff and stage-uncertainty cases.
- [ ] Add deterministic late-insertion tests start=0/update=20/boundary=10 => 10+10; ensure sourceOrder persistence and completion-before-entry. Property tests iterate deterministic seeded interleavings, prove slice uniqueness and Active+Idle conservation for fully observed windows, and retain extents/subtotals rather than guessing incomplete values.
- [ ] Run the verifier, inspect each invariant and commit an issue-prefixed change after red/green tests. New module failures must be caused by missing implementation or wrong behavior, not broken test import paths.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/timing-duration-derivation.test.mjs scripts/tests/unit/task-tracker/lib/1901-timing-history-fixtures.test.mjs
```

### Task 2: Add tolerant lexical metadata and Timing Log duration codecs

#### Story Intent

- **Beneficiary:** operator reading mixed-version story logs
- **Capability:** decode old and event-model rows and see unambiguous days-and-clock durations
- **Need:** old suffix parsing and duration grammar reject enabled rows or conflate malformed, unavailable and zero values
- **Value or failure prevented:** readable history and compatible consumers without corrupting opaque metadata or board formats

#### Files

Modify `scripts/task-tracker/lib/timing-row-reader.mjs` and `scripts/task-tracker/lib/timing-actor.mjs`. Preserve strict identity, endpoint and word-cursor validation while supporting tolerant composed suffixes. Keep readEstimationStageTiming explicitly legacy-only: enabled callers bypass it through Task 5 policy, so Task 2 never imports the engine or adds a wave-1 dependency. Create `lib/timing-duration-codec.mjs`, `lib/timing-duration-metadata.mjs`, `lib/timing-duration-source.mjs` and focused tests `scripts/tests/unit/task-tracker/lib/timing-duration-codec.test.mjs`, `timing-duration-metadata.test.mjs`, `timing-duration-source.test.mjs`. Paths beginning lib here resolve under scripts/task-tracker. Do not edit Task 5's timing-rows/timing-engagement modules. Source decoder converts lexical events/endpoints into the agreed SourceFact shape and calls canonical event grammar. It neither estimates durations nor mutates source identity.

**Rank:** 1. **Estimate:** 10 hours, L. **Dependencies:** none; integrates with Task 1 only in wave 2.

- [ ] Add failing round-trip and rejection tables for 0,47,133,3599,3600,86399,86400,453660,multi-digit days and MAX_SAFE_INTEGER. Check positive unpadded days, literal days, clock bounds, missing timezone/calendar invalidity in source decoding, and legacy Xh MMm SSs/minute cells. Blank, Unknown and malformed are distinct typed decoding results.

```javascript
for (const [n, s] of [
  [0, '00:00:00'],
  [133, '00:02:13'],
  [86400, '1 days 00:00:00'],
  [453660, '5 days 06:01:00'],
]) {
  assert.equal(formatTimingDuration(n), s);
  assert.equal(parseTimingDuration(s).seconds, n);
}
for (const n of [-1, 1.5, NaN, Infinity, '133']) assert.throws(() => formatTimingDuration(n));
```

- [ ] Implement deterministic codec, source decoder and composed suffix parser. New suffix order is transition/actor/engagement/complete row-sec/activation/duration/cost/opaque; partial rows omit row-sec. Historical arbitrary composed order remains readable. Duplicate/conflicting recognized markers fail with inspectable diagnostics.
- [ ] Encode source identity/evidence separately from mutable projection. Stable source order uses recorded equal-tick order, including pair order; use a canonical length-delimited serialization and SHA-256 so concatenation ambiguities cannot alias. Replacing only duration projection must retain original engagement estimate/endpoints/word cursors and opaque bytes.
- [ ] Pin exact legacy-reader incompatibility in a small source-pinned compatibility fixture, including actor TIMING_ACTOR_INVALID, non-actor seconds extraction and new-clock rejection. Baseline fixture is historical reference, never substituted for production readers. Disabled emission bytes stay baseline-consumable.
- [ ] Run existing lexical structure tests plus new codecs; commit only owned files. Expected new tests fail before implementation and pass without changing board codec lib/duration.mjs.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/timing-actor.test.mjs scripts/tests/unit/task-tracker/lib/timing-duration-codec.test.mjs scripts/tests/unit/task-tracker/lib/timing-duration-metadata.test.mjs scripts/tests/unit/task-tracker/lib/timing-duration-source.test.mjs scripts/tests/unit/task-tracker/core/timing-row-reader-structure.test.mjs scripts/tests/unit/task-tracker/lib/timing-row-reader.test.mjs scripts/tests/unit/task-tracker/lib/duration.test.mjs
```

### Task 3: Publish immutable admissions with complete projection verification

#### Story Intent

- **Beneficiary:** operator sharing a timing log across agents
- **Capability:** retain every admitted event and detect or reconcile stale duration projections
- **Need:** concurrent comment overwrites, delayed events and replay can lose evidence or acknowledge only a present row
- **Value or failure prevented:** no silent loss, duplicate credit or successful publication claim over a stale or protected projection

#### Files

Modify `scripts/task-tracker/gh-timing-comment.mjs` and its test-only internals surface. Create `lib/timing-duration-publication.mjs`, `lib/timing-source-protection.mjs` and `scripts/tests/unit/task-tracker/core/timing-duration-publication.test.mjs`. Extend `core/gh-timing-comment-actors.test.mjs`. Read existing outcome records via current GitHub record-store authority; Task 5 owns outcome-validator changes. Implement publishTimingAdmission and discoverProtectedTimingRegions contracts. The publisher accepts normalized immutable single-row or lifecycle pair units; row builders remain Task 4 owned.

**Rank:** 2. **Estimate:** 12 hours, L. **Dependencies:** Tasks 1,2 integrated.

- [ ] Add failure-injected tests for stale two-writer snapshots, delayed insertion, duplicate equal-tick admission, conflicting immutable evidence, lost response, full-projection mismatch despite own-row presence and retry exhaustion at exactly three writes. Expose reads/writes/locks through deps; no live GitHub mutation in tests.

```javascript
const result = await publishTimingAdmission({
  context,
  admission,
  deps: twoWriterHarness({ overwriteFirst: true }),
});
assert.ok(result.attempts <= 3);
assert.equal(result.remotePublished, true);
assert.deepEqual(await harness.sourceIds(), ['start-a', 'update-a', 'boundary-b']);
assert.equal(await harness.projectionMatchesFreshDerivation(), true);
```

- [ ] Admit complete handoff pairs with original distinct times and exact durable/remote receipts. Preserve and verify source measurement metadata plus the new-row context description; no new footer or protected-suffix rewrite is introduced. Cover pending half, competing ordinary bind, missing takeover authority, post-release old execution, replay after successor work and lost response after admitted transfer.
- [ ] Include the candidate's current source-owner/handoff evidence in full source-inventory validation. Refuse detected conflicting ownership, retain recoverable journal/queue evidence, and diagnose historical conflict extents without double summation. This is source-admission validation among supported single-agent task executions, not a new global agent lease or CAS guarantee.
- [ ] Implement source/evidence digest correlation, atomic in-memory body construction, stable source order, protected-reference enumeration and exact protected-byte checks before each attempt. Query all relevant sealed authority references exhaustively; pagination/identity/read failures are incomplete discovery and refuse mutation. No global atomicity claim.
- [ ] Verify all observed projection fields and known immutable pre-write inventory, not only candidate presence. On drift merge retained known source facts with fresh authority, rederive and retry; source conflicts and protected intersections refuse. Keep full recoverable journal/queue evidence on pending result.
- [ ] Cover protected ordinary append after an opener-before-cutoff: preserve source endpoints and protected bytes; terminalize only previously uncredited protected extent; credit only observed post-cutoff windows and retain existing credited prefix interpretation. True late insertion inside protected bytes refuses. Verify current successor validation before acknowledgment.
- [ ] Make canonical activation control part of source inventory and immutable admission. Duplicate/conflicting models/tuples refuse; local disabled settings cannot revert a marker-present model. A stale writer rereads activation and rederives or refuses. Ordinary marker-free appends retain legacy output.
- [ ] Run focused concurrency and existing actor-publication tests; commit. Queue acceptance versus remote acknowledgment keeps its existing distinct outcomes; Task 4 wires these into checkpoint decisions.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/core/timing-duration-publication.test.mjs scripts/tests/unit/task-tracker/core/gh-timing-comment-actors.test.mjs
```

### Task 4: Wire all producers and preserve journal, queue and lifecycle semantics

#### Story Intent

- **Beneficiary:** operator recording current agent activity
- **Capability:** receive event-derived timing from flush, resume, lifecycle, approval, close and recovery publication
- **Need:** current adapters expose transcript-dependent Unknown and separate lifecycle writes can admit half a pair
- **Value or failure prevented:** recoverable live intervals and safe retries without changed word banking or false transition evidence

#### Files

Create `scripts/task-tracker/lib/timing-handoff.mjs`, `lib/timing-handoff-journal.mjs` and `lib/timing-measurement.mjs`; modify `scripts/providers/transcript-normalizer.mjs` through its separate native-usage export. Modify `scripts/task-tracker/runtime.mjs`, `queue.mjs`, `lib/actor-flush-journal.mjs`, `lib/bind-event.mjs`, `lib/move-state/audit-timing.mjs`, `lib/review-approval-timing.mjs`, `lib/terminal-review-handoff.mjs`, `lib/timing-post-outcome.mjs`, `verbs/resume.mjs`, `verbs/close.mjs`, `verbs/review.mjs`, `verbs/approve.mjs`, `hook-handler.mjs`, and `lib/move-state/guard-execution.mjs`. Create `scripts/tests/integration/task-tracker/core/1901-duration-producers.test.mjs`. Extend actor-flush-journal, actor-flush-isolation, bind-event and coverage-audit-timing tests. Publication logic remains owned by Task 3; producers call that exported seam. Inventory every caller of postTimingEvent/buildFlushRow/buildReviewToDoneClosePair, including orphan/session recovery and Ask hooks; handle via the existing source boundary rather than introducing new event vocabulary.

**Rank:** 3. **Estimate:** 14 hours, L. **Dependencies:** Task 3.

- [ ] Add failing adapter tests using unavailable readActivityEvidence and a live uncompleted turn; event display recovers valid durations while original active estimate remains unknown. Also include an observed transcript gap whose bounded event window becomes all Active/zero Idle, without replacing the estimate.
- [ ] Implement the Ownership-transfer evidence and Session measurements contracts above in the assigned handoff/journal/measurement modules and actual provider/runtime adapters. Create the three named new handoff/journal/measurement tests and scripts/tests/unit/providers/transcript-normalizer.test.mjs. Never treat ordinary bind as transfer or aggregate CLI usage as context. Exercise real producer/journal APIs and the specified transfer, takeover, baseline/reset and source-qualification cases.
- [ ] Produce immutable handoff attestations from real bind/resume/recovery observations. Verify real issue/session binding identity, then have Task 3 validate the candidate's source-owner/handoff chain against canonical source inventory before admission. Existing assignee ownership is human-login policy, not proof of exclusive agent ownership; do not claim it already provides an agent lock or global CAS. A contender refuses without writing, banking words or shifting checkpoint. Cover same-instant and paused handoffs, missing predecessor observation, actually measured differing context sizes, unavailable measurements, each session restarting, replay of imported cumulative cursors and partial handoff recovery. Reuse actual runtime word measurement inputs; retain protected history and never estimate absent counts.
- [ ] Implement the PublicationResult wrapper/drain contract above in actual timing-post-outcome and queue paths. Test resolved pending/refused/skipped results, exact durable acceptance, enqueue failure, lost remote response and queue-item retention; freeze terminal evidence only after verified remote admission.
- [ ] Pass immutable actor identity, original endpoint and continued own-boundary observation through admission. Never attest other actors. Retain journal payload/digest and queue identity. Confirm remote read-back or exact durable enqueue advances checkpoint; neither success keeps checkpoint unchanged.

```javascript
await harness.flush({ transcriptStatus: 'window-unconfirmed', fromMs: 1000, toMs: 134000 });
assert.equal(harness.visibleActive(), 133);
assert.equal(harness.originalEstimate(), 'unknown');
await harness.flush({ remote: 'failed', queue: 'accepted' });
assert.equal(harness.checkpointAdvanced(), true);
assert.equal(harness.remotePublished(), false);
```

- [ ] Prepare completion+entry as one immutable ordered pair with common tick and transition identity, delivered or queued together. Keep the independent pre-flush and its words: it owns through its tick, first boundary only the remaining observed slice, second zero. Failure after flush preserves it; retry admits only the missing pair with original timestamp, including restart/lost-response cases.
- [ ] Exercise queue acceptance then process restart, queue write failure, source replay after reallocation, duplicate/conflicting pair replay, same-second pairs, exclusive owner handoffs and contradictory historical owner overlap, word/reset cursors and orphan recovery. Canonical mutation failure must not counterfeit a board transition or remote freeze.
- [ ] Inventory actual approval/close/recovery producers and prove they use the seam in integration tests. Run listed tests and commit; no durable runtime migration, new pause semantics or fabricated task_complete events.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/core/1901-duration-producers.test.mjs scripts/tests/unit/task-tracker/lib/timing-handoff.test.mjs scripts/tests/unit/task-tracker/lib/timing-handoff-journal.test.mjs scripts/tests/unit/task-tracker/lib/timing-measurement.test.mjs scripts/tests/unit/providers/transcript-normalizer.test.mjs scripts/tests/unit/task-tracker/lib/timing-post-outcome.test.mjs scripts/tests/integration/task-tracker/lib/terminal-review-handoff.test.mjs scripts/tests/unit/task-tracker/lib/actor-flush-journal.test.mjs scripts/tests/integration/task-tracker/lib/actor-flush-isolation.test.mjs scripts/tests/unit/task-tracker/lib/bind-event.test.mjs scripts/tests/unit/task-tracker/lib/move-state/coverage-audit-timing.test.mjs
```

### Task 5: Project coherent totals while preserving sealed outcome semantics

#### Story Intent

- **Beneficiary:** operator comparing story effort and stage timing
- **Capability:** use complete event-derived totals and inspect scoped unknown remainders without invalidating old outcomes
- **Need:** actor, legacy, per-stage and minute calculations currently diverge and old source validation pins earlier semantics
- **Value or failure prevented:** trustworthy metrics without double-added Review time, subtotal-as-total claims or retroactive outcome corruption

#### Files

Create `scripts/task-tracker/lib/timing-duration-projection.mjs` and `scripts/tests/unit/task-tracker/lib/timing-duration-projection.test.mjs`. Modify `lib/timing-rows.mjs`, `lib/timing-engagement.mjs`, `lib/timing-ladder.mjs`, `lib/estimation/runtime-adapter.mjs`, `timing-rollup.mjs`, `lib/estimation/outcome-record.mjs`, `lib/estimation/outcome-builder.mjs`, `scripts/gh/log-issue-time.mjs` and relevant existing rollup/outcome tests. Keep lexical implementation stable; Task 5 imports Task 2's codec, creates projectSessionWallSpan and readVerifiedJointStageTiming beside timing-duration-projection, and retains raw source/control metadata in the ladder for verified model dispatch. The runtime adapter chooses enabled complete/partial outcomes from verified joint stage completeness, not old deriveActorEngagement or bare row-sec. Old sealed-record validation keeps original semantics. Add model dispatch adjacent to old functions rather than replacing old-schema semantics.

**Rank:** 3. **Estimate:** 12 hours, L. **Dependencies:** Task 3.

- [ ] Implement projectHandoffMeasurements and its exact counter/gauge/availability formulas. Add1050/2080, replay, missing/reset baseline, context compaction/shrink, opaque provenance and protected/unconverted coverage cases to the projection verifier.
- [ ] Implement and test projectSessionWallSpan plus actual board timingFieldProjection against the normative formula/null rules. Cover start0/pause10/resume30/update40 => session40/engaged20/idle20; handoff0..20 => session20/engaged20; owner conflict horizon15 => session15/affected engaged null; lone opener zero; invalid/missing horizon null; protected effort remainder with proven wall endpoints; mixed models; day/offset transitions; and no now-based growth. Enabled board mapping reads sessionSec/sessionMin rather than totalActiveSec/totalActiveMin. Old marker-free/sealed mapping stays pinned; Task 7 consumes this API for heal-backlog. Board codec output stays unchanged.
- [ ] Add `scripts/tests/integration/task-tracker/lib/1901-duration-estimation-runtime.test.mjs` exercising actual estimation runtime adapter/outcome writer with complete, projection-stale, mixed-segment, protected-unknown and stage-scoped partial current-model inputs. Complete stages come only from readVerifiedJointStageTiming after full projection validation. Separately exercise actual old sealed-record reuse and the ladder retaining model/source metadata for dispatch.
- [ ] Add failing scalar tests for 120 Active/180 Idle Plan => 2 Plan minutes; two 20-second Plan visits => 1 minute; repeated/demoted/open visits; stage-scoped unknown; known Idle with complete Active; unknown-stage scope; independent SessionTime; conflicting historical owners without double summation and complete joint Active+Idle bounded by independent wall span. Whole-log mixed legacy/event coverage returns legacy-segment-unconverted instead of blending estimates.

```javascript
const s = projectEventScalars(deriveFixture({ planActive: [20, 20], planIdle: [180] }));
assert.equal(s.planSec.value, 40);
assert.equal(s.planMin.value, 1);
assert.equal(s.engagedSec.value, 40);
assert.equal(s.totalIdleSec.value, 180);
```

- [ ] Event model uses disjoint allocations and full-projection verification; incomplete affected board dimensions persist null/Unknown with subtotal/reason/model/source digest. A projection-stale reader never publishes complete authoritative numeric totals from stored cells alone. Apply Math.round only after summing complete seconds.
- [ ] Preserve old sealed snapshot digest and exact prefix/suffix validation, original estimates and old numeric interpretation. Supply a compatibility view for new-format successors that decodes known zero correctly without globally changing old-format explicit-zero behavior. Test actual outcome-record/outcome-builder/writer reuse, not merely unchanged record bytes.
- [ ] Test protected ordinary append with previously uncredited remainder, original sealed record reuse, valid zero/multi-day successors and invalid ordering/source evidence. Incomplete close measurements keep current incomplete-outcome handling and remain excluded from quantitative calibration; do not invent totals to pass a gate.
- [ ] Run focused projection and real rollup/outcome tests, review adapter sweep and commit. Preserve board codec byte output and remove new-model display-string heuristics from numeric decisions.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/timing-duration-projection.test.mjs scripts/tests/integration/task-tracker/lib/1901-duration-estimation-runtime.test.mjs scripts/tests/slow/task-tracker/lib/log-issue-time.test.mjs scripts/tests/unit/task-tracker/core/timing-rollup.test.mjs scripts/tests/unit/task-tracker/lib/timing-ladder.test.mjs scripts/tests/unit/task-tracker/lib/estimation/outcome-telemetry.test.mjs scripts/tests/unit/task-tracker/lib/estimation/outcome-builder.test.mjs scripts/tests/unit/task-tracker/lib/estimation/outcome-writer.test.mjs scripts/tests/integration/task-tracker/lib/child-close-outcome-evidence.test.mjs
```

### Task 6: Build guarded historical preview and idempotent apply capability

#### Story Intent

- **Beneficiary:** workspace operator repairing historical story timing
- **Capability:** preview recoverable timing changes and apply exactly reviewed unprotected changes under explicit writer exclusion
- **Need:** current backfill skips actor Unknown and stale seconds and lacks exact fresh-base conflict protection
- **Value or failure prevented:** recoverable historical metrics without overwriting newer data, sealed evidence or unrelated source fields

#### Files

Modify `scripts/task-tracker/backfill-timing-logs.mjs`. Create `lib/timing-duration-repair.mjs`, `scripts/tests/unit/task-tracker/core/timing-duration-repair.test.mjs`, and extend backfill/coverage-backfill tests. Task 8 owns command registration and help snapshots; Task 6 exports the repair CLI parser/help and functions for registration. Consume Task 3 protection/admission checks and Task 5 scalar projection without changing sibling files.

**Rank:** 4. **Estimate:** 8 hours, L. **Dependencies:** Tasks 4,5.

- [ ] Add failing read-only preview tests for exact captured #1854 rows plus synthetic Unknown/zero/observed discrepancies. Categories are unknown-recovered, observed-estimate-reclassified, stale-seconds-reconciled and display-only. Include original/new board deltas, protected export-only segments, model coverage, remaining legacy/unavailable portions, source/comment identity and input precision.
- [ ] Implement prepareEventDurationRepair with exact source/target digests and deterministic derivation/provenance. Issue selection is explicit; live #1847 child discovery only supplies operator-selected preview candidates, not implicit writes or scope changes.
- [ ] Implement applyEventDurationRepair requiring preview expected digest, canonical identity reread, complete protected-reference inventory, writer exclusion and drained/excluded queue. Save exact non-overwriting backup/manifest under .scratch/heal before mutation. Missing coordination, backup error, drift or protected overlap => zero writes. Reread immediately before write and exact read-back after.

```javascript
const preview = prepareEventDurationRepair({ source, context });
await assert.rejects(
  () => applyEventDurationRepair({ preview, coordination: { exclusive: false }, deps }),
  /coordination/
);
assert.equal(deps.writeCount(), 0);
await applyEventDurationRepair({ preview, coordination: exclusiveFixture, deps });
assert.equal(deps.backupBytes(), source.body);
assert.equal(deps.readBody(), preview.targetBody);
```

- [ ] Inject lost response and observe exact target/provenance before retry; matching target succeeds without a second mutation. Source drift, newer unrelated mutation and read-back mismatch stop remaining issues, retain evidence and never blindly restore a backup. Repeated preview/apply with confirmed target is byte-identical without duplicate provenance.
- [ ] Initial historical activation writes the same immutable canonical marker in the same body mutation at the earliest eligible unprotected tuple, retaining actual current recording time. Existing tuple cannot move; excluded earlier history/protected regions remain preview/export-only. Original descriptions/events/word fields/opaque suffixes are invariant.
- [ ] Run tests and commit. Default invocation retains legacy-only behavior; explicit event-duration mode is preview by default. No real GitHub historical write occurs in implementation tests or preparation.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/core/timing-duration-repair.test.mjs scripts/tests/unit/task-tracker/core/backfill-timing-logs.test.mjs scripts/tests/unit/task-tracker/core/coverage-backfill-timing-logs.test.mjs
```

### Task 7: Make maintenance and sequence consumers model-aware

#### Story Intent

- **Beneficiary:** operator validating or maintaining timing histories
- **Capability:** diagnose malformed or incomplete event-model rows while preserving their source and projection contracts
- **Need:** independent heal, rename and sequence readers can reject enabled suffixes or reinterpret projected seconds as transcript observations
- **Value or failure prevented:** no maintenance-induced corruption or false green validation after reader rollout

#### Files

Modify `scripts/task-tracker/lib/heal-timing-log.mjs`, `lib/heal-timing-interval.mjs`, `lib/timing-slug-rename.mjs`, `heal-backlog.mjs`, `lib/agent-review/validators/timing-log-sequence.mjs` and their tests. Add `scripts/tests/unit/task-tracker/maintenance/1901-timing-consumers.test.mjs`. All module paths resolve under scripts/task-tracker. Do not change Task 6's backfill or Task 5's old engagement/outcome implementation. Consume stable lexical/model APIs; any additional consumer discovered is assigned to a single owner before edits.

**Rank:** 4. **Estimate:** 6 hours, M. **Dependencies:** Tasks 4,5.

- [ ] Add failing table tests for every maintenance/validation adapter on legacy, enabled, mixed-segment and partial rows. Include composed opaque suffixes, missing Full Word Marker, minute timestamps, zero and multi-day clocks, duplicate recognized metadata, invalid timestamp/ordering and projection-stale diagnostics.
- [ ] Replace display heuristics for event model with decoded availability/seconds and preserve old-schema validation semantics. Heal or slug-rename never authorizes changing immutable event identity/source or protected bytes merely because a duration is Unknown. Reuse admission/repair guards when a supported maintenance action would affect projection/source.

```javascript
const before = capturedEnabledBody;
const result = await validateSequenceFixture(before);
assert.equal(result.model, 'joint-event-delta/v1');
assert.equal(result.unknownRemainderReason, 'sealed-source-protected');
assert.equal(await maintenanceNoop(before), before);
```

- [ ] Audit the dependency graph with rg for parseDurationSeconds, deriveActorEngagement, parseTimingRow and formatDurationSeconds. Enumerate remaining legacy-only call sites explicitly in a committed compatibility report; unsupported event-model consumers refuse honestly instead of silently degrading.
- [ ] Run focused maintenance and existing sequence tests; commit. Original old-format zero literal behavior remains pinned for legacy snapshot semantics.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/maintenance/1901-timing-consumers.test.mjs scripts/tests/unit/task-tracker/lib/heal-timing-log.test.mjs scripts/tests/unit/task-tracker/lib/heal-timing-interval.test.mjs scripts/tests/unit/task-tracker/lib/timing-slug-rename.test.mjs scripts/tests/unit/task-tracker/lib/agent-review/validators/timing-log-sequence.test.mjs scripts/tests/unit/task-tracker/lib/agent-review/validators/timing-log-sequence-update-slug.test.mjs scripts/tests/unit/task-tracker/lib/agent-review/validators/timing-log-sequence-audit-rows.test.mjs
```

### Task 8: Gate reader-first activation and prove complete repository integration

#### Story Intent

- **Beneficiary:** operator rolling out event-derived timing across hosts
- **Capability:** activate a shared log only after compatible participants are established and verify the complete timing workflow
- **Need:** old readers cannot consume enabled output and divergent local settings can otherwise mix duration models
- **Value or failure prevented:** no incompatible mixed writers, accidental downgrade, unreviewed historical apply or unsupported release claims

#### Files

Create `scripts/task-tracker/timing-duration-model.mjs`, `scripts/tests/integration/task-tracker/core/1901-duration-rollout.test.mjs`, `scripts/tests/integration/task-tracker/core/1901-duration-system.test.mjs`, and `docs/guides/event-derived-timing-rollout.md`. Modify `scripts/task-tracker/config.mjs`, `lib/command-surface/catalog.mjs`, `lib/command-surface/routing.mjs` and relevant help/config tests. Register new timing-duration-model operation and backfill-timing-logs with existing bin/aitm routing, using Task 6 parser/help exports. Package version/release changes are release-manager decisions and require actual release evidence, not an invented published version.

- [ ] Register timing-handoff prepare/accept/recover and read-only timing-measurements command/help contracts using the Task 4/5 exported APIs defined above. Recovery validates genuine authority. Extend catalog/routing/help/integration tests with honest unavailable metrics, request-input context descriptions, exact1050/2080 report arithmetic, source digest, opaque identity and protected legacy history. No new live comment authority or provider harness is introduced.

**Rank:** 5. **Estimate:** 6 hours, M. **Dependencies:** Tasks 6,7 integrated; all earlier work retained.

- [ ] Add failing rollout tests where no inventory/concrete release/config revision => no activation; stale allowed host/session/worktree => no activation; conflicting tuple => refusal; identical operation retry => one activation; marker-present local disabled => event output or duration-model-unsupported, never downgrade. Test post-activation legacy rows as refused evidence with raw preservation.
- [ ] Introduce disabled-by-default timingDurationModel. The readiness record lists all allowed writers and consumers, their concrete compatible release and capability/config revision, excluded/suspended old sessions, exact canonical source digest and operator operation ID. Release N is the first actually produced compatible release; activation refuses a symbolic N, unassigned version or unverified participant. Documentation names how to obtain/verify that concrete release rather than pretending a version has shipped.
- [ ] Future-only activation uses the next real ordinary candidate event admitted by an already authorized producer. The rollout command authorizes an activation request for that operation; it does not invent a new timing event or retrospective observation. If there is no eligible real candidate, activation remains pending and reports that status. The existing sanctioned task update can supply a real operator checkpoint; only its genuine admission can carry the marker. The marker and that source row are admitted together. Historical conversion instead uses Task 6's selected existing row; both paths share immutable model tuple/readiness/protection checks.
- [ ] Test all three captured #1851/#1852/#1854 tables and the full supplied #1854 sequence recovering 51/453660/133/5/901, missing task_complete and non-Codex estimates, baseline disabled emission, release-N reading, sealed outcome reuse, full projection convergence, repaired replay, protected cutoff successors and complete/null board values. Record capture URL/body digest/time separately from synthetic tests; do not alter historical live logs.

```javascript
const result = await rolloutHarness.activate({
  inventory: verifiedParticipants,
  candidate: realUpdate,
});
assert.equal(result.status, 'activated');
assert.equal(result.markerCount, 1);
assert.equal(await rolloutHarness.disabledPeerAppend(), 'joint-event-delta/v1');
assert.equal(await rolloutHarness.legacyPeerAttempt(), 'duration-model-unsupported');
```

- [ ] Publish the reader-compatible release with legacy emission default before any operator activation. This task prepares release artifacts/docs and test evidence; actual package publication and production rollout require their separate authorization. Do not silently auto-enable on installation or dry-run.
- [ ] Run complete root verification groups and current repository npm test, test:slow, lint and format:check at an exact clean commit under governed Test. Document known pre-existing failures with evidence and refuse success if required gates fail. Commit collateral, preservation checks and operational guide; do not tick root ACs merely because children exist.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/core/1901-duration-rollout.test.mjs scripts/tests/integration/task-tracker/core/1901-duration-system.test.mjs
npm test
npm run test:slow
npm run lint
npm run format:check
```

## Hydration, refinement and preparation handoff

After genuine plan SPR and XPR acceptance/finalization, commit all generated startup, invitation, response, disposition and manifest files. Add immutable accepted plan path/commit and acceptance record to #1901 Plan Metadata. Perform the governed current-source deep dive with this accepted plan; if it contradicts a contract or requires another task/file dependency, amend and re-review before hydration.

Enumerate #1901's native existing children first. Use sanctioned split-plan dry-run then confirm only once after all eight task Story Intent blocks and executable verifier lists validate. Store exact task-to-child mapping, accepted plan digest/commit and native dependency edges in committed hydration collateral. Generated children point to the exact Task N source section; never substitute generic prose or imaginary issue IDs.

Rank children by the wave table and add native blocked-by dependencies for every listed predecessor. Higher waves cannot begin until predecessor work is integrated under existing lineage/delivery policy; Ready for Planning may hold tasks with future execution dependencies, but that state never implies those dependencies are already delivered. Refine each child Backlog→Refine→Ready for Planning with individual supported size, estimate, priority, rank, labels, ownership and current evidence. Stop at R4P; no child Plan/Develop/implementation in this session.

Parent estimated effort becomes current child estimate sum plus explicit orchestration overhead; record actual current child IDs/values in the estimate evidence. Prepare parent plan-estimate, current story semantic/source binding, plan approval and decomposition gate from real accepted artifacts. Use ordinary one-edge Plan→Develop. Preserve all honest blockers; no fabricated approval, completed AC, outcomes, test evidence or lifecycle jump. The user's marching orders authorize this preparation and its ordinary approval boundaries; they do not authorize implementation or historical application.

Final handoff lists parent state, child IDs/ranks/dependencies/R4P status, accepted spec/plan hashes, SPR/XPR records, deep dive, forecast/estimation evidence, exact branch/commit, timing checkpoints and remaining implementation gates. Pause the timer and stop for the user's fresh implementation agent.
