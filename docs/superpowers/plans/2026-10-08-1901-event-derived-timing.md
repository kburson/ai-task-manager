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

`runtime.mjs` currently maps unavailable transcript activity evidence to null visible durations. The accepted source requires event ownership and matching closing observations, rather than an opener alone, while preserving original estimates. `gh-timing-comment.mjs` owns append/publication; `scripts/task-tracker/lib/timing-row-reader.mjs` is the lexical leaf; outcome-record validation protects exact prefix and suffix bytes. GitHub comment writes have no compare-and-swap. We can detect, converge and refuse within bounded attempts, but cannot promise global atomic exclusion.

## Plan Metadata

- Priority: P1
- Size: XL
- Estimate: 112 hours joint engineering effort, provisional until current child refinement
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
- Board codec stays unchanged. Task 7 introduces the defined independent SessionTime because the baseline board mapping currently aliases actor Active totals. Plan/Review Active are subsets of Engaged. Round minute totals only after summing seconds.
- Root ACs and governed child Test/Review gates remain required. Each child owns executable focused verifiers; aggregate gates never substitute for a failed child contract.

## Normative amendment to the historical accepted specification

Authority is the user's explicit 1A/2A response and subsequent clarification, recorded in [#1901 joint-effort clarification](https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6071936726). The user selected independent recorded SessionTime and stated that effort is joint, a task has one agent at any given time, and replacing an agent/session is a handoff affecting real context-token and word measurements. This changes the original specification's separate-lane summation. This amendment is reviewed with this plan by SPR and XPR; acceptance at bb24dd7e remains historical evidence, not acceptance of this amendment.

- One issue has one joint Active/Idle clock. Human and agent activity are not separate additive effort counters. At most one agent owns active execution at a time. Parallel work is across distinct child tasks, with one active agent per child. Author and reviewer take sequential protocol turns.
- Actor/session IDs remain immutable provenance. Replacement consumes a recorded ownership handoff, not another simultaneous effort lane. Detected conflicting current source-owner/handoff evidence refuses admission before a write or checkpoint change. Supported execution is operationally limited to one agent per task; this defect does not claim to implement a new distributed task lease. Publisher convergence detects conflicts under the existing bounded non-CAS contract, without promising global atomic exclusion. Historical contradictory overlaps are retained and diagnosed as `ownership-conflict`; affected joint allocations are unavailable, never double-summed. Later unambiguous ownership evidence restores future allocation without erasing conflict.
- A handoff records genuine predecessor/successor actor/session binding identities, source IDs, original observed endpoints and availability. Proven same-instant handoff preserves engagement/interruption state and task cursor; it creates no Idle. Explicit departure/resume keeps the actual Idle gap. Missing handoff/end evidence remains a scoped unavailable remainder, never an invented end or session identity. Task 2 stores attestation in immutable source evidence; Task 5 produces authority/transfer facts and Task 4 integrates them from sanctioned bind/recovery observations using existing event vocabulary.
- `joint-event-delta/v1` is a distinct planned model. Earlier `event-delta/v1` is not silently reinterpreted: historical evidence retains its explicit interpretation and incompatible current writes refuse. The reader-compatible release understands the new model. Neither proposed model is claimed to have shipped.
- Joint Engaged and Idle sum disjoint slices of the single task clock. For complete coverage, Active + Idle is at most SessionTime; excluded, unconverted or protected coverage explains a remainder. Plan and Review are Active subsets, never added again. Attribution/ownership uncertainty need not invalidate independently proven wall endpoints.
- `projectSessionWallSpan({sources})` is a new Task 7 pure function. It takes the earliest proven opener or bounded engagement-start evidence, subject to the earliest-coverage rules below, and last recorded event horizon for this issue, floors original millisecond endpoints to second ticks, and subtracts. Pauses and gaps count in wall span; no now-based tail, actor sum or Active alias is permitted. Return `{state,value,knownSec,reasons,sourceRefs,fromTick,untilTick}` with integer seconds or null. Missing opener/horizon, conflicting source timestamps, invalid potentially horizon-defining evidence or unsafe/negative subtraction yields unavailable, with a proven lower bound where available. A lone valid opener yields known zero at its recorded horizon. Incomplete effort/stage, mixed models or protected allocation do not invalidate proven immutable wall endpoints. Enabled board seconds read `sessionSec.value`, minutes read complete seconds / 60 with Math.round; null remains Unknown. Legacy marker-free and sealed calculations retain their pinned mapping; enabled current board/maintenance mappings deliberately use this new scalar.
- Required examples: start0/pause10/resume30/update40 => Active20, Idle20, Session40. Proven A-to-B handoff at10 between opener0 and update20 => Active20, Idle0, Session20. Contradictory A0..10 and B5..15 without handoff => independently known Session15 but unavailable affected joint effort with conflict scope and nonconflicting subtotal; never summed 20-second effort. Unresolved effort at a valid recorded horizon never grows with the local clock.
- Raw measured per-session word/context cursors remain immutable. Imported context counts only when actually measured with source/availability. A handoff retains predecessor cursor refs and successor baseline; Tasks 4/6 capture source facts and Task 7 derives joint task totals using explicit offsets and replay IDs without counting cumulative cursors twice, fabricating context size, resetting task totals or rewriting protected word cells. Existing Delta Words normalization remains separate. Unknown measurements stay Unknown; native input-token traffic is not context capacity or elapsed effort.

All other accepted constraints remain: bounded observation, whole-second flooring, source identity, stage attribution, sealed bytes, original estimates, shared-boundary partition, atomic pairs, distinct durable enqueue/remote publication, bounded non-CAS convergence, safe repair and explicit rollout. If task text contradicts this amendment, correct it before hydration; the amendment governs.

## Ownership-transfer evidence contract

Tasks 1/2 validate and encode these shapes before wave 2; Task 3 admits them; Task 5 produces transfer actions; Task 6 captures measurements; Task 4 integrates actual runtime/hook observations. Ordinary update plus another actor's bind/start never proves transfer. A readable actor/source ID, endpoint or matching human assignee is not release authority.

- A normal offer has immutable `transferId = sha256(canonical(repo,issue,fromActorRef,toActorRef,operationId,offerSourceId))` and `offer = {transferId,fromActorRef,toActorRef,offerSourceId,offeredAtMs,releaseTuple,state,authorizationRef,evidenceDigest}`. Only the outgoing actual bound native session may produce this explicit transfer/release action through prepareTimingHandoff; it names the successor, observes its own real endpoint and stops task execution after the release tuple. Neutral update without this control action is not release. Public identities are existing opaque keys/fingerprints; native handles stay local.
- Incoming `acceptance = {transferId,toActorRef,acceptSourceId,acceptedAtMs,offerDigest,authorizationRef,evidenceDigest}` comes only from the actual bound successor through acceptTimingHandoff. Controlled publication resolves both authorization refs to retained genuine host binding/operation evidence for the exact issue/action/recipient. Hashing caller-supplied labels alone is not authentication; unverifiable authority refuses. No free-text agent claim of human approval substitutes for source authority.
- Completion is one `handoff-pair` admission with outgoing neutral update/offer and incoming neutral update/acceptance. Both original separate observation timestamps and stable source order are preserved. The offer release tuple and incoming owner-entry tuple are immutable controls; canonical verified pair admission completes transfer. A local prepared half is not completed ownership. Incoming handoff update carries the joint engagement/interruption state; a later actual resumed event closes interruption normally. No timing slug or implicit pause/end is invented.
- Normal continuity is supported only by the outgoing offered task state and incoming observed accepted state plus verified transfer authority. Those genuine task-level observations can bracket continuous joint engagement across session replacement; neither participant retrospectively attests the other's session execution. Missing continuity/observations leaves that gap unavailable. Same-tick transfer preserves cursor with no duplicate time; paused transfer preserves interruption until actual resume and never becomes Active merely because owner changes.
- Durable sequence: outgoing pre-flush banks original words once; prepare immutable owner-bound offer beside the existing actor-flush journal; successor verifies exact offer and durably prepares acceptance with its measured baseline; enqueue/publish the complete original pair once; verify full canonical projection; retain exact durable/remote receipt; advance only the corresponding checkpoints once. An incomplete pair stays pending and cannot admit ordinary successor work as completed transfer. This adjacent handoff journal is recoverable transport, not replacement GitHub authority or runtime-storage migration.
- Recovery inspects transfer/source IDs and digests against canonical admission before retry. Lost response after pair admission recovers existing receipt without a duplicate; replay after successor work never moves owner or cursor back. Delayed halves keep real original times. Changed recipient, time, issue or offer digest conflicts. Missing predecessor end remains unknown independently of authorized future takeover.
- Crash takeover is distinct `kind=authorized-takeover` control evidence from recoverTimingHandoff, requiring retained actual recorded human/operator authorization or already authorized host recovery decision for exact issue, old/new actors and operation. Its authorization source/digest is resolved through the genuine host/controller evidence path; agent-authored approval prose, raw actor IDs and self-declared orphan status are insufficient. Unsupported/missing authority refuses takeover. A verified receipt opens successor ownership at its actual observed start while predecessor unknown end/gap remains unavailable: no fabricated release, backdating or lost-interval credit. Later bounded successor windows are known independently, so missing old history does not permanently poison future work.
- Delayed old source before its release tuple may be admitted with original identity/order and reallocation. Old-owner execution after release or accepted successor entry conflicts/refuses. Equal-tick ordering needs original ms/stable order or remains ambiguous; never arbitrarily order actors. Pair replay cannot manufacture ownership overlap.

Task 5 creates lib/timing-handoff.mjs, lib/timing-handoff-journal.mjs and lib/timing-handoff-authority.mjs using the shapes above; Task 4 owns actual bind/resume/recovery integration. prepareTimingHandoff({context,successorActorRef,operationId,observation,deps}) returns {status:offered|pending|refused,offer,reason}. acceptTimingHandoff({context,offer,observation,deps}) returns PublicationResult plus {transferId,ownerEffect:unchanged|transferred,pair}. recoverTimingHandoff({context,transferId,takeoverAuthorization,observation,deps}) returns the same receipt/outcome shape without duplicate admission. Task 3 extends admission kind to single, lifecycle-pair, handoff-pair. Task 10 registers explicit timing-handoff prepare/accept/recover command/help operations; these controls add no timing slug or global lease. Every operation revalidates real binding and authority; unsupported recovery evidence refuses. Tasks 1/2 consume interface fixtures without importing producer code. Task 5's authorization resolver validates outgoing/incoming actual bound runtime operation receipts; takeover additionally requires genuine user-origin or already authorized controller decision evidence for that exact operation. It never accepts a model-authored transcript item, copied handle or arbitrary caller JSON as user authorization. Unsupported providers/authority sources return a typed refusal, not inferred consent.

Tasks 1,2,3,4,5 test intentional same-tick transfer versus competing bind with identical ordinary rows; delayed acceptance and paused transfer/resume; missing half; crash/takeover with unknown past but known future; enqueue failure; lost reply after admitted pair; replay after successor work; delayed old event before release versus actual old execution after it. Authority fixtures are explicitly synthetic and cannot authorize real takeover.

## Session measurements and visible joint counters

Task 6 creates lib/timing-measurement.mjs and owns a separate normalizeNativeUsageObservation(record,boundContext) export in scripts/providers/transcript-normalizer.mjs. It does not alter normalizeTranscriptRecord's existing text/tool recognition or word-counter semantics; token-only evidence must not turn unavailable words into a fabricated zero. Task 2 serializes immutable observation evidence; Task 7 creates projectHandoffMeasurements beside scalar projection; Task 3 preserves/verifies immutable measurement metadata during canonical admission; Task 10 renders the read-only timing-measurements report from Task 7 projection. Existing native transcript/binding/journal seams remain; no storage migration or word-counter redefinition.

- `MeasurementObservation = {observationId,sessionRef,sourceId,observedAtMs,boundary,provider,method,providerVersion,rawRecordDigest,wordCursor,fullWordCursor,contextRequestInputTokens,availability,reasons}`. Word cursors are integer words from real countWords tier-2 count and tier-3 fullExpansion. Context is integer tokens at a specified request-input boundary, not cumulative traffic or capacity. Each quantity has independent `{state:known|unavailable,value,reasons,sourceRefs}` availability. Projected counters separately use state known|partial|unavailable; null totals retain knownSubtotal. IDs are immutable source/replay identities. Native handles/transcript paths and exact authorization/binding receipts remain owner-only local provenance; public sessionRef uses opaque actor key or one-way binding fingerprint.
- Primary Codex capture is the existing native rollout JSONL, resolved through scripts/providers/codex.mjs and transcript-resolver for the actual bound sid. Accept exact `record.type=event_msg`, `record.payload.type=token_count`, `record.payload.info.last_token_usage.input_tokens`. Validate `session_meta.payload.id` against genuine binding and `session_meta.payload.cli_version` against a recognized schema (observed0.162.0-alpha.2), same cwd/provider, prior `turn_context.payload.turn_id` or task_started turn identity, timestamp and stable ordinal. The token row lacks its own turn_id, so correlation uses that preceding actual stream context, never an invented turn. A read-only check of this review's genuine native rollout found that exact reachable shape, last input227699, capacity258400 and separate total_token_usage. Those numbers are capture evidence for that session, not fixed model facts. App-server subscriptions/notifications are out of scope; schema documentation is contextual only. Exact version/schema, timestamp freshness, same bound request/generation and safe nonnegative integer units are checked; payload.info.total_token_usage, last_token_usage.total_tokens, model_context_window, exec turn.completed aggregated usage, words and guidance calibration are never substituted. Label this request-input context, not live post-response context. [Official protocol background](https://learn.chatgpt.com/docs/app-server).
- If evidence is aggregate-only, absent, inaccessible, uncorrelated or unsupported, contextRequestInputTokens is null/unavailable with reason/provenance. Claude/other providers initially have unavailable context unless a verified equivalent per-request source adapter is explicitly implemented by this same owner. Real words do not justify synthesizing tokens. Capturing absence makes no model request and needs no new provider API-key/harness.
- Compaction/reset invalidates an older observation as a current gauge until a new supported request observation; retain its historical value/time/boundary. A smaller later context observation is a legitimate gauge decrease, not negative word/effort delta. Never sum context gauges across requests/sessions. Task 6 captures native rollout version/source-shape and digest in implementation fixtures; schema presence alone is not proof a host supplied a live measurement.
- A cursor generation has actually measured baseline B_words/B_full and monotonic cursors C_words/C_full. Produced words are C_words-B_words and C_full-B_full only when both endpoints are known, same-generation and nonnegative. Initial joint counters sum unique nonoverlapping produced slices, not repeated cumulative snapshots. Handoff keeps prior proven joint offset O, measures successor imported baseline B, then projects O+(C-B). Replayed source IDs add zero. Actual reset starts a new measured generation/baseline; missing baseline, unexplained decreasing cursor or generation mismatch is unavailable, never clamped or inferred from context shrink.
- Example: A joint produced offset1000, B imported baseline600, later raw cursor650 => expose raw600/650, imported600 and new50, joint1050. Full-word offset2000, B baseline1200/current1280 => joint2080. Imported context is visible provenance, not additional produced work. Missing B baseline preserves known subtotal1000 but joint value is null. Unconverted/protected unknown earlier word coverage similarly makes whole-log totals partial.
- projectHandoffMeasurements returns `{jointWords,jointFullWords,sessions,observations}`. Joint counters are `{value,knownSubtotal,state,reasons,sourceRefs,coveredSegment}`. Sessions expose opaque ref, raw/imported baselines, produced slices and context request-input gauge with time/method/availability. Raw observations remain immutable; only derived joint projection changes. Existing Word Marker, Full Word Marker and Delta Words preserve their source/normalization contract.
- Task 4 consumes Task 6 observations and includes `Context at request input: <integer tokens|Unknown> (<observation boundary/reason>)` as an appended source-description phrase only when constructing new enabled rows, retaining the original event description. Existing descriptions/word columns are never rewritten. The observation time and immutable measurement envelope in that row preserve exactly what was observed; Task 3 admits/verifies them without a dependency on Task 7. Task 10 registers `timing-measurements <issue> [--json]`, a read-only report from the canonical Timing Log and Task 7 projectHandoffMeasurements. It renders observation time, opaque session, raw/imported/new words/full words, joint totals or Unknown/subtotals, and `Context at request input (tokens)` with method/boundary/reason and represented source digest. This is an inspectable derived view, never alternate authority or a second live comment write. New context observations are visibly rendered in their Timing Log rows even when Unknown. Reports verify canonical projection freshness and protected/legacy coverage, never rewriting sealed prefix/suffix or claiming stale/subtotal values as complete. No public raw handles, paths or private messages.

Task 2 tests envelope/provenance round-trip and private-field rejection. Task 6 tests real native-last-request versus aggregate/capacity/guidance/word impostors, missing quantities, baseline/reset/compaction observations and replay. Task 7 tests exact1050/2080, absent-baseline partial totals, replay and smaller gauge. Task 3 tests actual row metadata/description admission, full read-back/protection and opaque public identity; Task 10 tests read-only human-readable/JSON projection rendering. Task 10 proves end-to-end visibility. Each task owns corresponding cases in its focused command; newly named handoff/journal/measurement tests are Task 4 owned.

## SessionTime start evidence and earliest coverage

Task 7 selects the earliest valid original recorded start/resume opener OR genuine bounded engagement-start endpoint proving issue work, not just the first surviving opener row. Task 1 exposes endpoint provenance and earliest-coverage availability independently of actor attribution. End is last valid recorded event horizon. Complete span requires no earlier retained source/prefix with unresolved potentially earlier start; otherwise value is null and the proven span is knownSec lower bound with earliest-start-unproven. Protected/mixed prefix endpoints can establish wall span without rewriting bytes; missing/unreadable/invalid prefix authority keeps coverage unavailable. Never truncate whole-log span to later activation/actor adoption.

Regression: pause10 endpoints[0,10], resume20, pause30 endpoints[20,30] => start0, Session30, Active20, Idle10. Endpoint-only rows likewise use their earliest proven bounded start; absent explicit/valid bounded start => null. Legacy prefix earlier than attributed start remains eligible; unknown earlier prefix => lower-bound-only. Tasks 1/7 test source eligibility, scalar and actual board mapping; Task 9 tests enabled heal-backlog consumption. No implicit clock or fabricated row is added.

## Startup, released owners and dispatch controls

Task 5's classifySessionOwnership supplies the decision; Task 4 integrates it into actual lib/actor-hook-timing.mjs, hook-handler, bind/resume and dispatch callers. Tasks 1/3 decode and admit the explicit source controls. The following enabled-model behavior is required; marker-free legacy behavior is pinned.

| Sequence                                                        | Enabled ownership/timing behavior                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A's actual pause/stop/switch-out, then B's sanctioned task bind | A's own canonical authenticated departure releases execution ownership at its original tuple and preserves interruption. B may acquire through kind=departure-successor after verifying exact release and no competing intervening owner. No extra outgoing offer is required. B's actual resumed observation closes the same joint Idle bracket; no new time/word lane is added. An unrelated/unattributed or conflicting departure cannot release A. |
| New-sid automatic SessionStart with active A binding            | Startup itself conveys no takeover consent. Return nonfatal contender-deferred/read-only before occupancy touch, journal flush, session-end-recovery, start, state overwrite or checkpoint change. Only explicit legitimate task bind with release proof, normal handoff or verified takeover can acquire. Do not make the hook exit1 on an expected deferred contender.                                                                               |
| Peer-review guest starting in author's physical worktree        | Before reviewer join, a sid that is not task owner is read-only/deferred; after genuine peer-review role registration it is reviewer-isolated. It never acquires the task or emits AITM timing/occupancy/recovery rows. Role is read from actual registered protocol/runtime context, not a freely set environment label. Ordinary peer-review response writing remains allowed by its exact artifact boundary.                                        |
| Orphan/session-end recovery with missing old end                | Automatic fresh-session presence is not authorized host takeover. Keep old unknown extent and ownership unresolved; read-only/defer without fabricated release/start or fatal hook failure. A genuine already authorized host/controller recovery decision or retained actual operator authorization may create the distinct future takeover receipt defined above. Then bounded future owner windows are calculable while old gap stays unavailable.  |
| Same-sid PreCompact/PostCompact                                 | Owner identity is unchanged. Preserve actual pre-compact-flush/post-compact-resume source ticks, queue/journal checkpoints and task engagement/interruption state. No handoff, release, inferred Idle or duplicate Active slice is created. Context freshness/generation follows measured evidence, never an inferred word reset.                                                                                                                      |
| Same-sid SessionStart/resume                                    | Genuine current owner may resume its same recorded binding without an owner transfer. Replay existing original queued evidence once. Do not unconditionally assert lost prior end. If genuine session-loss evidence says end is missing, retain that scoped unknown extent and create only a real future observed opener; normal continued bound observation is not falsely classified as a new competing owner.                                       |

Task 5 exports classifySessionOwnership({binding,nativeContext,event,canonicalSources,peerReviewRole,controllerAuthorization}) => {status,eligible,effects,reasons}. Identity/role/authorization inputs come from genuine resolver/controller context. Task 4 performs no issue-write side effect before this classification. Tasks 1/3/4/5 test all rows, including identical ordinary competing binds, real departure-successor Idle and same-worktree unjoined/joined reviewer sessions.

SourceFact adds sourceRole and ownershipEffect with immutable genuine origin evidence. Dispatch-prep and ensure-wave-parent new enabled start rows have sourceRole=orchestration-dispatch and ownershipEffect=none. They are task-dispatch wall-start milestones, not worker engagement openers. SessionTime includes this recorded dispatch-to-worker latency; joint Active/Idle opens at the first actual bound worker engagement. The pre-engagement wall remainder is explicitly not-yet-engaged coverage, with zero credited effort and no invented pause/Idle. Later worker start is not a duplicate non-owning dispatch engagement. A late dispatcher row cannot reset an existing owner. Task 1/7 regress dispatch0, worker start10, update20 => Session20, Active10, Idle0, non-engaged remainder10. Existing legacy actorless rows remain on pinned legacy semantics; unclassified enabled actorless rows remain explicitly unavailable rather than guessing dispatcher identity.

Departure-successor receipt binds release source ID/digest/tuple and departing opaque owner to incoming actual native binding and acquisition source ID/time. It is admitted with the original resumed source, derives authority from the verified owner's actual departure, and replays once. It is distinct from normal two-sided offer and crash takeover. A transfer object may therefore have kind normal, departure-successor or authorized-takeover; a bare start/bind without eligible release is still insufficient.

## Known maintenance writer dispositions

Task 9 owns scripts/task-tracker/lib/heal-timing-departure.mjs and top-level heal-timing-departure.mjs; lib/heal-actor-opener-replays.mjs; lib/heal-timing-starts.mjs; heal-timing-starts.mjs; heal-timing-starts-sweep.mjs; heal-timing-log.mjs; lib/heal-timing-sweep.mjs, in addition to its original heal/interval/slug/sequence surfaces. These exact paths are assigned before hydration.

Backdated departure inference, opener replay deletion, duplicate-start rewriting and sweep-driven source changes remain legacy-only. On a marker-present enabled log they return typed duration-model-source-repair-refused before any write, including when the region is not sealed. They may export diagnostics but cannot invent an end, delete/relabel immutable source or silently invoke historical apply. Pure source-preserving projection changes are available only through Task 8's reviewed preview/exclusion/backup/fresh-base/read-back contract. Default healer CLIs do not auto-apply new-model changes. Enabled heal-backlog board projection reads Task 7's verified joint/session API; it does not rewrite source facts. Protected discovery failure refuses mutation. Task 9 tests each library and actual CLI/sweep refusal plus unchanged legacy behavior.

Task 10 alone owns scripts/task-tracker/lib/command-surface/entrypoints.mjs and catalog.mjs, scripts/task-tracker/verbs/help-data.mjs and scripts/tests/fixtures/1558/admission-surface.json for new command and existing maintenance routing. New commands must match the registration/admission inventory; legacy maintenance entries cannot acquire enabled write authority by being registered.

## Focused regression inventory before child Test

Each modifying child's executable focused verifiers include the listed minima AND every existing test that imports, dynamically imports, spawns or otherwise directly invokes one of its modified modules/CLIs. Hydration enumerates repository test/helper imports and literal CLI/harness targets against the exact owned file list, follows test-helper references, and records the resulting actual paths per child in committed hydration collateral. Source pickup repeats this sweep for drift. Add these suites as explicit additional child VC commands before its Test; never rely on Task 10's aggregate suite to catch another owner's regression. Unresolvable invocation evidence is surfaced and conservatively included/reviewed, not silently omitted. This rule expands regression evidence, not task source ownership or accepted behavior. It is enforced alongside the frozen focused root group and recorded with current source hash.

Listed producer minima include close-flush-timing, verb-start-resume-stop, timing-actor-runtime, actor-queue-isolation, stop-audit-pause-resume, approve-timing-boundary, resume-auto-gap-activity and slow coverage-hook-handler. Projection minima include timing-rows, timing-rows-seconds, timing-actor-accounting, active-by-phase-spans and pause-row-duration. Maintenance includes every assigned healer library/CLI/sweep. Registration includes command catalog/entrypoint/help/admission-inventory tests. Exact commands are in each corresponding task and the hydration inventory materializes any additional existing suites.

## Review Focus

1. An actor opens and never returns while another advances stages for days: no invented Active or Idle tail (Task 1).
2. An original journal payload replays after another writer reallocates it: one source/word admission and only full-projection acknowledgment (Task 3).
3. An ordinary actor update spans a sealed cutoff: append succeeds, protected bytes stay exact and its unfillable earlier portion remains unavailable (Tasks 3 and 7).
4. Two upgraded hosts have divergent local settings around activation: the shared marker wins and old/unknown participants block rollout (Task 10).
5. A repair loses its response while another source changes: correlate exact target or refuse; never blindly repeat or restore (Task 8).

## Contracts shared across tasks

The following names are new planned interfaces, not claims that they already exist. Task ownership below creates them. Types use JavaScript objects; named shapes below fix their fields across workers.

- `SourceFact = { sourceId, evidenceDigest, sourceOrder, tick, timestampText, event, lane: {kind,key}, stage, endpoints, originalEstimate, words, description, transitionId, opaqueSuffixes, sourceRole, ownershipEffect }`. `lane.kind` is actor, legacy-single-stream or shared; an actor key is existing identity, never synthesized. `sourceOrder` is a stable integer tuple, not a current array index. `endpoints` holds original ms and attributable closing observations, or null. Pauses are separate scoped immutable facts. Immutable source evidence optionally carries `handoff = {kind: normal|departure-successor|authorized-takeover,transferId,offer,acceptance,takeover,availability}` and `measurement = {observations,baseline:{generationId,words,fullWords,importedRefs,availability},offsetRefs,availability}` using the concrete shapes and arithmetic below; missing values remain null/unavailable. Session refs come from real bindings, never fabricated IDs. Source identity hashing includes these attestations.
- `Allocation = { lane, fromTick, untilTick, seconds, dimension, stage, sourceRefs, method }`; dimension is active/idle; method is event-bracket, engagement-endpoints or legacy-idle-bridge. Each half-open allocation belongs to one closing source row and one joint task clock; lane is provenance, never permission for overlapping effort credit.
- `Availability = { state, knownSec, reasons, sourceRefs, extents }`; state is known, fillable-pending or terminal-unavailable. Unknown stage/lane diagnostics have inspectable scopes; known Idle alone cannot invalidate Active.
- `deriveEventDurations({ sources, pauses, activation, protectedRegions, verifiedControls = [] })` returns `{ model, sourceDigest, rows, scalars, diagnostics }`. A row contains `{sourceId, activeSec, idleSec, allocations, activeAvailability, idleAvailability, precision}`. Each scalar is { value: nullable integer seconds or minutes, knownSec: integer subtotal seconds, state, reasons, sourceRefs }; scalars expose independent availability and subtotal; no projected implicit tail.
- `decodeTimingSource(body)` returns `{sources,pauses,activation,diagnostics}` from lexical rows and canonical event grammar. It is pure and consumes the unchanged original source evidence, not displayed duration as event truth.
- `formatTimingDuration(seconds)` and `parseTimingDuration(text)` own new Timing Log grammar plus legacy read compatibility; the board formatter is untouched.
- `parseDurationSuffixes(line)` and `replaceDurationProjection(line, projection)` preserve opaque/source bytes and use the accepted composed-suffix order. Activation marker insertion is separate control evidence, never a mutable projection rewrite.
- `discoverProtectedTimingRegions({repo,issueNumber,commentNodeId,readRecords})` returns `{complete,regions,records}`. Each region identifies exact source bytes/digest and cutoff. Missing, inaccessible or ambiguous authority means complete=false and publication/apply refuses mutation.
- `publishTimingAdmission({context,admission,deps})` consumes one immutable single-source, lifecycle-pair or handoff-pair admission unit, a real source tick/order and optional explicit authorized activation request. It returns existing normalized publication/queue outcomes plus sourceDigest, attempts and reason. Before pure derivation it obtains explicit verifiedControls from deps.verifyControlAuthority; the same current-model readers use Task 5's authority adapter. Unknown proof never becomes an asserted transfer. It uses injected reads/writes/locks and calls Task 1's pure engine and Task 2's codecs.
- `projectEventScalars(derivation)` yields complete seconds/null, known subtotals, reasons and rounded minutes for Engaged/Idle/Plan/Review/per-stage values. SessionTime uses Task 7's new projectSessionWallSpan contract above, independently of joint effort and under explicit model dispatch. Task 7 also exports `projectHandoffMeasurements({sources})` with the counter/session/observation shape below and `readVerifiedJointStageTiming({body,context})`, returning verified per-stage seconds/availability, source digest and model; it never converts incomplete subtotals or bare stored row-sec into complete stagesMs.
- `prepareEventDurationRepair({source,context})` returns an immutable preview with source/target digests, operation/operator identity, categories, allocations, protection, model coverage and board deltas. `applyEventDurationRepair({preview,coordination,deps})` requires that exact preview and validates every byte/write outcome.

Treat signatures as interface commitments. An implementer cannot silently rename fields used by siblings. Additions must be backward compatible within this plan or reviewed before another wave depends on them.

## Parallel waves and estimates

These are logical execution ranks, not already created issue IDs. Hydration binds them to real child issues, adds native blocking dependencies and uses the same rank for same-wave siblings. No worker is launched in this preparation session.

| Task                                          | Rank/wave | Depends on tasks | Independently owned surface                      | Initial joint hours |
| --------------------------------------------- | --------- | ---------------- | ------------------------------------------------ | ------------------: |
| 1 Engine and exact histories                  | 1         | none             | normalized engine/source facts/history fixtures  |                  12 |
| 2 Lexical, actor and display codecs           | 1         | none             | lexical/actor leaf, source/metadata codecs       |                  10 |
| 3 Verified publication and protection         | 2         | 1,2              | publisher/protection/convergence                 |                  12 |
| 4 Producer, hook and dispatch integration     | 4         | 3,5,6            | runtime/journal/queue/hooks/lifecycle/dispatch   |                  14 |
| 5 Ownership handoff and authority             | 3         | 3,6              | new transfer/authority/journal modules           |                  14 |
| 6 Native measurement capture                  | 1         | none             | separate native usage export/measurement adapter |                   8 |
| 7 Joint scalar/session/outcome projection     | 4         | 3,5,6            | projection/ladder/rollup/board/outcomes          |                  12 |
| 8 Guarded historical recalculation            | 5         | 4,7              | repair and preview/apply                         |                   8 |
| 9 Maintenance compatibility                   | 5         | 4,7              | all named healer/rename/sequence writers         |                  12 |
| 10 Rollout, commands and aggregate validation | 6         | 8,9              | registration/config/report/rollout/system tests  |                   8 |

Wave 1 can fan out Tasks 1,2,6 on distinct child issues with one agent per issue. Task 1 accepts normalized facts; Task 2 does lexical/codec work without engine or producer imports; Task 6 reads native measurement sources without importing either. Their shared shapes are fixed here. Task 3 integrates1/2. Task 5 follows3/6; Tasks 4/7 follow3/5/6 in separate producer and projection files. Tasks 8/9 then run on separate repair/maintenance surfaces; Task 10 integrates last. Shared-file ownership is explicit, never concurrent. Child numbering is plan order, not execution order; rank/native dependencies govern execution.

Joint child estimate is110 hours (12+10+12+14+14+8+12+8+12+8), plus2 root orchestration =112. Wave critical path is12+12+14+14+12+8=72 hours before staffing/coordination overhead. These are provisional joint engineering estimates, not separate human/agent effort measurements or board elapsed time. Refined children replace them before Develop. No worker is launched in this preparation session.

## Adapter ownership and model dispatch

Exact production paths below are assigned now. New modules are explicitly proposed; existing files keep one owner across the six waves. A later sweep verifies completeness, not ownership of these known seams.

| Exact production seam                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Owner / rank | Enabled disposition and legacy boundary                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| scripts/task-tracker/lib/timing-row-reader.mjs; scripts/task-tracker/lib/timing-actor.mjs                                                                                                                                                                                                                                                                                                                                                                                   | Task 2 / 1   | Tolerant source/suffix reading with original identity/cursor checks. readEstimationStageTiming stays explicitly legacy-only; Task 7 owns enabled numeric policy.                 |
| scripts/task-tracker/gh-timing-comment.mjs                                                                                                                                                                                                                                                                                                                                                                                                                                  | Task 3 / 2   | Verified full projection/source/protection; handoff-pair admission with injected authority, no duplicate publisher.                                                              |
| scripts/task-tracker/runtime.mjs; scripts/task-tracker/queue.mjs; scripts/task-tracker/lib/actor-flush-journal.mjs; scripts/task-tracker/lib/bind-event.mjs; scripts/task-tracker/lib/timing-post-outcome.mjs                                                                                                                                                                                                                                                               | Task 4 / 4   | Real producer/queue/checkpoint integration; exact remote/durable/pending result; no source/control/word fabrication.                                                             |
| scripts/task-tracker/hook-handler.mjs; scripts/task-tracker/lib/actor-hook-timing.mjs; scripts/task-tracker/verbs/resume.mjs; scripts/task-tracker/verbs/review.mjs; scripts/task-tracker/verbs/approve.mjs; scripts/task-tracker/verbs/close.mjs; scripts/task-tracker/lib/review-approval-timing.mjs; scripts/task-tracker/lib/terminal-review-handoff.mjs; scripts/task-tracker/lib/move-state/audit-timing.mjs; scripts/task-tracker/lib/move-state/guard-execution.mjs | Task 4 / 4   | Explicit owner/release/startup/guest/recovery/compaction decisions and atomic source lifecycle pairs. Expected deferred startup is nonfatal and read-only.                       |
| scripts/gh/dispatch-prep.mjs; scripts/gh/ensure-wave-parent.mjs                                                                                                                                                                                                                                                                                                                                                                                                             | Task 4 / 4   | Enabled orchestration-dispatch is non-owning wall milestone, not worker engagement; actual agent starts do not duplicate it. Legacy bytes remain pinned.                         |
| scripts/task-tracker/lib/timing-handoff.mjs; scripts/task-tracker/lib/timing-handoff-journal.mjs; scripts/task-tracker/lib/timing-handoff-authority.mjs (new)                                                                                                                                                                                                                                                                                                               | Task 5 / 3   | Genuine normal/departure-successor/takeover evidence, adjacent journal and replay/recovery; no runtime-hook edits or global lease.                                               |
| scripts/task-tracker/lib/timing-measurement.mjs (new); scripts/providers/transcript-normalizer.mjs                                                                                                                                                                                                                                                                                                                                                                          | Task 6 / 1   | Exact reachable native rollout usage and measured word baselines; separate usage export, existing word semantics unchanged, unsupported evidence Unknown.                        |
| scripts/task-tracker/lib/timing-duration-projection.mjs (new); scripts/task-tracker/lib/timing-rows.mjs; scripts/task-tracker/lib/timing-engagement.mjs; scripts/task-tracker/lib/timing-ladder.mjs; scripts/task-tracker/timing-rollup.mjs                                                                                                                                                                                                                                 | Task 7 / 4   | Joint clock/session/measurement projection and raw model/source retention; old sealed/marker-free calculations remain pinned.                                                    |
| scripts/gh/log-issue-time.mjs                                                                                                                                                                                                                                                                                                                                                                                                                                               | Task 7 / 4   | Actual board timingFieldProjection AND human-readable Session/Engaged report use independent session and joint Engaged; Review not double-added. Existing board codec unchanged. |
| scripts/task-tracker/lib/estimation/runtime-adapter.mjs; scripts/task-tracker/lib/estimation/outcome-builder.mjs; scripts/task-tracker/lib/estimation/outcome-record.mjs                                                                                                                                                                                                                                                                                                    | Task 7 / 4   | Actual current complete/partial selection from verified stage availability; stale/mixed/protected stays incomplete; original sealed snapshot validation stays pinned.            |
| scripts/task-tracker/backfill-timing-logs.mjs; scripts/task-tracker/lib/timing-duration-repair.mjs (new)                                                                                                                                                                                                                                                                                                                                                                    | Task 8 / 5   | Explicit reviewed preview/exclusion/backup/fresh-base/apply contract, no default new-model historical writes.                                                                    |
| scripts/task-tracker/lib/heal-timing-log.mjs; scripts/task-tracker/lib/heal-timing-interval.mjs; scripts/task-tracker/lib/timing-slug-rename.mjs; scripts/task-tracker/heal-backlog.mjs; scripts/task-tracker/lib/agent-review/validators/timing-log-sequence.mjs                                                                                                                                                                                                           | Task 9 / 5   | Verified board/diagnostic model reading; source-changing implicit repairs refuse enabled logs. Controlled projection repair uses Task 8.                                         |
| scripts/task-tracker/lib/heal-timing-departure.mjs; scripts/task-tracker/heal-timing-departure.mjs; scripts/task-tracker/lib/heal-actor-opener-replays.mjs; scripts/task-tracker/lib/heal-timing-starts.mjs; scripts/task-tracker/heal-timing-starts.mjs; scripts/task-tracker/heal-timing-starts-sweep.mjs; scripts/task-tracker/heal-timing-log.mjs; scripts/task-tracker/heal-timing-interval.mjs; scripts/task-tracker/lib/heal-timing-sweep.mjs                        | Task 9 / 5   | Named legacy-only source rewrite/inferred-departure paths refuse marker-present enabled writes, with actual CLI/sweep negative tests. No invented end/deletion/identity change.  |
| scripts/task-tracker/lib/command-surface/entrypoints.mjs; scripts/task-tracker/lib/command-surface/catalog.mjs; scripts/task-tracker/verbs/help-data.mjs; scripts/tests/fixtures/1558/admission-surface.json                                                                                                                                                                                                                                                                | Task 10 / 6  | Exact command/admission/help registration and inventory, with truthful maintenance routing and no implicit enabled write authority.                                              |

Task 4 preserves `PublicationResult = {status: remote-published|queued-durably|pending|refused,remotePublished,queuedDurably,sourceDigest,receipt,reason}`. A fulfilled promise or skipped call is not remote success. Only exact durable acceptance advances local banking once; queue drain removes only remotely verified source admission. Pending/refused/throwing handlers retain immutable items and receipt/digest. Queue persistence failure leaves checkpoint unchanged.

Task 3's injected `deps.verifyControlAuthority({control,context,sourceInventory})` returns `{state:verified|unavailable|refused,controlDigest,sourceRefs,reasons}`. Task 5 supplies the genuine authority adapter; pure engine consumes explicitly verified controls and diagnostics, never opaque labels alone. Task 7 uses that adapter for current control-aware reads. Test-only fixtures do not grant production authority. Missing/unsupported real authority leaves affected control allocation unavailable or refuses candidate mutation; ordinary unaffected source remains inspectable.

## Root verification bindings

Keep current exact vc:1–vc:4 and aggregates vc:5–vc:9 unchanged. New focused root groups vc:10–vc:19 correspond to Tasks 1–10 respectively, each using its exact first node --test command below. Task 10 additionally uses existing aggregate vc:5–vc:8. Governed issue-body materialization after acceptance freezes these commands and root AC citations before hydration. The focused regression inventory adds explicit existing child VC suites without silently replacing source commands. No proposed implementation test is claimed run here.

| Root AC                                                                     | Existing root groups | New root groups / child owners                                  |
| --------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------- |
| AC1 bounded seconds, real captures and unfinished turn                      | vc:1,vc:3            | vc:10 T1,vc:12 T3,vc:13 T4,vc:19 T10                            |
| AC2 grammar/zero/unchanged board codec                                      | vc:2,vc:4            | vc:11 T2,vc:16 T7,vc:19 T10                                     |
| AC3 actual producer/startup/dispatch/checkpoint paths                       | vc:1                 | vc:12 T3,vc:13 T4,vc:14 T5,vc:15 T6,vc:18 T9,vc:19 T10          |
| AC4 joint session/scalar/measurement/outcome dispatch and sealed reuse      | vc:2,vc:4            | vc:11 T2,vc:12 T3,vc:15 T6,vc:16 T7,vc:18 T9,vc:19 T10          |
| AC5 guarded preview/apply/replay                                            | vc:3                 | vc:12 T3,vc:17 T8,vc:18 T9,vc:19 T10                            |
| AC6 ownership/release/handoff/guest/dispatch/compaction/source conservation | vc:1,vc:4            | vc:10 T1,vc:12 T3,vc:13 T4,vc:14 T5,vc:15 T6,vc:16 T7,vc:19 T10 |

## Acceptance Criteria

- [ ] AC1: reproduce 133/5/51/453660 seconds and the subsequent 901-second update, including unavailable transcript and live unfinished-turn conditions; bounded evidence and conservation pass (Tasks 1,3,4,10).
- [ ] AC2: exact optional-days grammar, blank/explicit zero, malformed/unsafe input and unchanged board codec pass (Tasks 2,7,10).
- [ ] AC3: every producer uses event derivation under the canonical model with source/word preservation and honest unavailable reasons (Tasks 3,4,5,6,9,10).
- [ ] AC4: readers, metadata, scalar projections, replay, partial totals and original sealed outcome semantics agree (Tasks 2,3,6,7,9,10).
- [ ] AC5: preview-default, source-bound apply, non-overwriting exact backup, exclusion/drift/read-back failure and idempotency pass without real historical writes (Tasks 3,8,9,10).
- [ ] AC6: actor attribution/conflicting overlap, sequential ownership handoffs, shared pairs, delayed events, queue/journal restart and protected boundaries conserve allocations without duplicate credit (Tasks 1,3,4,5,6,7,10).

## Implementation Tasks

### Task 1: Derive bounded event durations with actor isolation and conservation

#### Story Intent

- **Beneficiary:** workspace operator inspecting engagement history
- **Capability:** recover attributable Active and Idle intervals from recorded events and inspect unresolved portions
- **Need:** transcript estimates suppress recoverable durations while unrelated events can otherwise inflate an actor's open tail
- **Value or failure prevented:** correct elapsed timing without cross-actor credit, invented observations or duplicate slices

#### Files

Create `scripts/task-tracker/lib/timing-duration-derivation.mjs` and `scripts/tests/unit/task-tracker/lib/timing-duration-derivation.test.mjs`. Create synthetic source-fact builders in `scripts/tests/helpers/1901-duration-facts.mjs`; later tasks use them read-only. Consume `scripts/task-tracker/lib/timing-events/index.mjs` classification without changing vocabulary. Interface: implement deriveEventDurations and Allocation/Availability exactly as above; normalized input rejects bad timestamps and source identity conflicts.

**Rank:** 1. **Estimate:** 12 hours, L. **Dependencies:** none.

- [ ] The history-fixture unit verifier is fully offline: it reads only committed fixture bytes and manifest digests/provenance. Live authority capture/reverification is a separate one-time read-only preparation step; an unavailable required capture blocks completing that preparation, never causes unit tests to access GitHub. No CI/unit network request is permitted.
- [ ] Read-only capture exact complete Timing Log bodies for #1851, #1852 and #1854 into `scripts/tests/fixtures/1901-timing-history/{1851,1852,1854}.md` plus `manifest.json`. Include repository, issue, canonical comment URL/node ID, body SHA-256, capture time and status. Verify sources https://github.com/kburson/ai-task-manager/issues/1851#issuecomment-5915448363, https://github.com/kburson/ai-task-manager/issues/1852#issuecomment-5915705167 and https://github.com/kburson/ai-task-manager/issues/1854#issuecomment-5915941693 against canonical current comment authority. Capture failure blocks completion of the one-time fixture preparation; labeled synthetic inputs never replace missing captures. Task 1 owns those fixtures and `scripts/tests/unit/task-tracker/lib/1901-timing-history-fixtures.test.mjs`; Tasks 8/10 consume them read-only. Assert hash/provenance agreement, the full supplied #1854 sequence and actual #1851/#1852 Unknown recoveries without live writes.
- [ ] Add departure-successor, deferred new-sid SessionStart, reviewer-isolated startup, authorized orphan takeover, same-sid compaction and non-owning dispatch source cases from the explicit startup table. Decode sourceRole/ownershipEffect and verifiedControls; actorless dispatch is a wall-start milestone, not worker engagement. Verify dispatch0/worker10/update20 => Session20,Active10,Idle0,unengaged10.
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

Modify `scripts/task-tracker/lib/timing-row-reader.mjs` and `scripts/task-tracker/lib/timing-actor.mjs`. Preserve strict identity, endpoint and word-cursor validation while supporting tolerant composed suffixes. Keep readEstimationStageTiming explicitly legacy-only: enabled callers bypass it through Task 7 policy, so Task 2 never imports the engine or adds a wave-1 dependency. Create `scripts/task-tracker/lib/timing-duration-codec.mjs`, `scripts/task-tracker/lib/timing-duration-metadata.mjs`, `scripts/task-tracker/lib/timing-duration-source.mjs` and focused tests `scripts/tests/unit/task-tracker/lib/timing-duration-codec.test.mjs`, `scripts/tests/unit/task-tracker/lib/timing-duration-metadata.test.mjs`, `scripts/tests/unit/task-tracker/lib/timing-duration-source.test.mjs`. Paths beginning lib here resolve under scripts/task-tracker. Do not edit Task 7's timing-rows/timing-engagement modules. Source decoder converts lexical events/endpoints into the agreed SourceFact shape and calls canonical event grammar. It neither estimates durations nor mutates source identity.

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
- [ ] Encode all normal/departure-successor/takeover control and SourceFact.sourceRole/ownershipEffect shapes; preserve genuine opaque references and reject raw native handles/paths in public metadata. Controls require external verified authority before time allocation; decoding labels is not authentication.
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

Modify `scripts/task-tracker/gh-timing-comment.mjs` and its test-only internals surface. Create `scripts/task-tracker/lib/timing-duration-publication.mjs`, `scripts/task-tracker/lib/timing-source-protection.mjs` and `scripts/tests/unit/task-tracker/core/timing-duration-publication.test.mjs`. Extend `scripts/tests/unit/task-tracker/core/gh-timing-comment-actors.test.mjs`. Read existing outcome records via current GitHub record-store authority; Task 7 owns outcome-validator changes. Implement publishTimingAdmission and discoverProtectedTimingRegions contracts. The publisher accepts normalized immutable single-row or lifecycle pair units; row builders remain Task 4 owned.

**Rank:** 2. **Estimate:** 12 hours, L. **Dependencies:** Tasks 1,2 integrated.

- [ ] Add failure-injected tests for stale two-writer snapshots, delayed insertion, duplicate equal-tick admission, conflicting immutable evidence, lost response, full-projection mismatch despite own-row presence and retry exhaustion at exactly three writes. Expose reads/writes/locks through deps; no live GitHub mutation in tests.

```javascript
const harness = twoWriterHarness({ overwriteFirst: true });
const result = await publishTimingAdmission({ context, admission, deps: harness });
assert.ok(result.attempts <= 3);
assert.equal(result.remotePublished, true);
assert.deepEqual(await harness.sourceIds(), ['start-a', 'update-a', 'boundary-b']);
assert.equal(await harness.projectionMatchesFreshDerivation(), true);
```

- [ ] Pin all startup/release/guest/dispatch-control cases with exact verifiedControl dependencies; an actorless orchestration milestone never claims a worker or fabricates effort. Refuse unsupported/forged transfer authority and retain unaffected source.
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

### Task 4: Integrate actual producers, startup ownership and publication outcomes

#### Story Intent

- **Beneficiary:** operator recording current story timing
- **Capability:** publish event-derived timing from actual runtime, hook, dispatch and lifecycle paths without false owner changes or remote success
- **Need:** existing session-replacement and wrappers emit recovery/start or successful checkpoints without the joint-model ownership and admission checks
- **Value or failure prevented:** trustworthy live records without competing session takeover, lost queued work, invented departure or duplicate time/words

#### Files

Modify `scripts/task-tracker/runtime.mjs`, `scripts/task-tracker/queue.mjs`, `hook-handler.mjs`, `scripts/task-tracker/lib/actor-hook-timing.mjs`, `scripts/task-tracker/lib/actor-flush-journal.mjs`, `scripts/task-tracker/lib/bind-event.mjs`, `scripts/task-tracker/lib/timing-post-outcome.mjs`, `scripts/task-tracker/lib/move-state/audit-timing.mjs`, `scripts/task-tracker/lib/move-state/guard-execution.mjs`, `scripts/task-tracker/lib/review-approval-timing.mjs`, `scripts/task-tracker/lib/terminal-review-handoff.mjs`, `scripts/task-tracker/verbs/resume.mjs`, `scripts/task-tracker/verbs/review.mjs`, `scripts/task-tracker/verbs/approve.mjs`, `scripts/task-tracker/verbs/close.mjs`, `scripts/gh/dispatch-prep.mjs` and `scripts/gh/ensure-wave-parent.mjs`. Create `scripts/tests/integration/task-tracker/core/1901-duration-producers.test.mjs` and `scripts/tests/unit/task-tracker/lib/timing-post-outcome.test.mjs`. Core transfer/journal APIs are Task 5 owned; measurement/provider code is Task 6 owned; publisher is Task 3 owned. This task integrates their fixed interfaces without editing sibling-owned files.

**Rank:** 4. **Estimate:** 14 hours, L. **Dependencies:** Tasks 3,5,6 integrated.

- [ ] Add failing real-adapter tests for unavailable transcript estimates and unfinished turns, honest pending/refused/skipped results, exact durable queue acceptance, queue persistence failure and retained queue items. A fulfilled promise alone is not remote success. Local word checkpoint advances once only on verified remote admission or exact durable queue receipt; only verified remote publication freezes terminal evidence.
- [ ] Integrate classifySessionOwnership and the startup/release rules above in the actual actor-hook-timing, bind/resume and hook-handler paths. Defer non-owner SessionStart before any recovery flush, occupancy touch or state overwrite; return a nonfatal structured status rather than exiting1 for expected contender/reviewer cases. Owner departures release under their recorded evidence; eligible successor bind uses departure-successor provenance and preserves real Idle. Orphan recovery never fabricates old end or treats process presence as authority. Same-sid PreCompact/PostCompact keeps owner/state and original observation times.
- [ ] Adopt dispatch-prep and ensure-wave-parent timing admission. New enabled rows carry explicit non-owning orchestration source role and genuine dispatcher provenance. They establish recorded wall start but never claim worker ownership or manufacture Active/Idle. Actual agent start is the first owning engagement observation, not duplicate orchestration engagement. Preserve carried-forward original word markers; dispatch work belongs to the orchestrator's actual task rather than being charged again as child effort.
- [ ] Runtime flush and every lifecycle/approval/close/guard emitter pass immutable source/endpoints/measurement data into Task 3. Preserve original journal/queue identities and word normalization. Prepare completion+entry as one original ordered pair; retain separate pre-flush through its timestamp and bank its words once. Pair failures/restarts/replays never duplicate pre-flush or transition evidence.
- [ ] Capture new enabled row context-description observations through Task 6's actual rollout adapter and current word counter. Invoke Task 5 handoff APIs through genuine bound contexts and callback authority, not manually assigned identities. Read-only reviewer sessions publish no AITM issue timing. Source admission failures leave recoverable journal/queue data, do not counterfeit a board transition, and never hide unavailable measurements.
- [ ] Test queue acceptance/restart, pair conflict/same-second replay, delayed insert/reallocation, departure-successor, automatic start contender, authorized takeover, same-worktree reviewer, compaction and measurement generation/reset using actual runtime/hook/verb adapters. Create a test-local makeProducerHarness that drives real buildContext/flush/publication APIs with isolated source/journal/queue and injected fake GitHub I/O; it supplies the methods in the example below and never contacts live issues.

```javascript
const harness = await makeProducerHarness({ transcriptStatus: 'window-unconfirmed' });
await harness.flush({ fromMs: 1000, toMs: 134000 });
assert.equal(harness.visibleActive(), 133);
assert.equal(harness.originalEstimate(), 'unknown');
await harness.flush({ remote: 'pending', queue: 'accepted' });
assert.equal(harness.checkpointAdvanced(), true);
assert.equal(harness.remotePublished(), false);
```

- [ ] Run the full focused existing-regression inventory below and commit only this task's owned source/tests. Baseline legacy/disabled startup behavior stays pinned. No historical apply or new pause-threshold policy is introduced.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/core/1901-duration-producers.test.mjs scripts/tests/unit/task-tracker/lib/timing-post-outcome.test.mjs scripts/tests/unit/task-tracker/lib/actor-flush-journal.test.mjs scripts/tests/integration/task-tracker/lib/actor-flush-isolation.test.mjs scripts/tests/unit/task-tracker/lib/bind-event.test.mjs scripts/tests/unit/task-tracker/lib/move-state/coverage-audit-timing.test.mjs scripts/tests/integration/task-tracker/lib/terminal-review-handoff.test.mjs scripts/tests/unit/task-tracker/core/close-flush-timing.test.mjs scripts/tests/integration/task-tracker/lib/verb-start-resume-stop.test.mjs scripts/tests/integration/task-tracker/lib/timing-actor-runtime.test.mjs scripts/tests/unit/task-tracker/lib/actor-queue-isolation.test.mjs scripts/tests/unit/task-tracker/hooks/stop-audit-pause-resume.test.mjs scripts/tests/unit/task-tracker/verbs/approve-timing-boundary.test.mjs scripts/tests/integration/task-tracker/lib/resume-auto-gap-activity.test.mjs scripts/tests/slow/task-tracker/lib/coverage-hook-handler.test.mjs scripts/tests/unit/task-tracker/gh/coverage-dispatch-prep.test.mjs scripts/tests/unit/task-tracker/gh/dispatch-prep-inprocess.test.mjs scripts/tests/slow/task-tracker/lib/ensure-wave-parent.test.mjs
```

### Task 5: Implement genuine ownership handoff, release and takeover recovery

#### Story Intent

- **Beneficiary:** operator handing an ongoing task to a fresh agent session
- **Capability:** transfer execution ownership with recorded authority and recover future work without inventing lost past timing
- **Need:** ordinary binding and automatic recovery currently do not distinguish an authorized handoff from a competing session
- **Value or failure prevented:** no counterfeit owner transfer, duplicated task time or permanent poisoning of bounded successor work

#### Files

Create `scripts/task-tracker/lib/timing-handoff.mjs`, `scripts/task-tracker/lib/timing-handoff-journal.mjs`, `scripts/task-tracker/lib/timing-handoff-authority.mjs`, `scripts/tests/unit/task-tracker/lib/timing-handoff.test.mjs`, `scripts/tests/unit/task-tracker/lib/timing-handoff-journal.test.mjs` and `scripts/tests/unit/task-tracker/lib/timing-handoff-authority.test.mjs`. Implement the transfer/release/startup authority contracts above through prepareTimingHandoff/acceptTimingHandoff/recoverTimingHandoff/classifySessionOwnership. Task 4 alone edits runtime/hook/verb integrations; Task 6 supplies measured baselines. Contexts derive genuine binding identities from the existing provider/runtime resolution path, never caller-supplied actor labels. Publication is injected Task 3 seam, not duplicate GitHub code.

**Rank:** 3. **Estimate:** 14 hours, L. **Dependencies:** Tasks 3,6 integrated.

- [ ] Add table-driven failing normal offer/acceptance, departure-successor and takeover tests against the shared authority/source shapes. Distinguish identical ordinary rows with actual outgoing transfer versus contender bind; classify reviewer/unbound startup read-only; keep same-sid compaction ownership. Synthetic binding/controller fixtures are test-only and cannot authorize real operations.
- [ ] Implement the explicit offer/acceptance identity, actor/issue/action/recipient checks, release/entry tuples and original endpoint chronology. A departed owner supplies eligible release without an unnecessary offer; unresolved active predecessor requires explicit verified normal handoff or authorized takeover. Native-bound journal preparation is not a canonical transfer completion.
- [ ] Implement adjacent owner-bound journal states prepared-offer, prepared-acceptance, queued-durably, remote-admitted and checkpointed with immutable payload/digest/source IDs and exact receipts. Retry lost reply by inspecting canonical pair before enqueue/write; partial halves remain pending; replay after successor work cannot change owner/cursor. Do not create a global lease or new storage authority.
- [ ] Implement genuine host/controller authorization resolver with callback interfaces fixed above and fail-closed unavailable sources. A takeover opens future owner at its real observation, never fabricates predecessor end. Allow delayed old source before release tuple and refuse actual old execution after release/entry, preserving equal-tick ms/order evidence.
- [ ] Use Task 6 measurement output to retain actual imported baselines and observations, including independent Unknown values. Supply these immutable facts to Task 3 and Task 7; no derived joint totals are computed by the handoff producer. Test reset/generation mismatches, enqueue failure, missing/delayed half, paused handoff/resume and unauthorized ordinary takeover.
- [ ] Create test-local makeHandoffHarness with isolated binding/authority/journal/publisher adapters. Its prepare/accept/recover methods invoke the real exported APIs and expose canonical sources/current owner/receipts for assertions, so the example has bound variables and real implementation behavior.

```javascript
const harness = makeHandoffHarness({ source: 'synthetic-native-binding' });
const offer = await harness.prepare({ from: 'a', to: 'b', observedAtMs: 10000 });
await harness.accept({ offer, actor: 'b', observedAtMs: 10000 });
assert.equal(harness.owner(), 'b');
const count = harness.sourceIds().length;
await harness.recover({ transferId: offer.transferId });
assert.equal(harness.sourceIds().length, count);
```

- [ ] Run focused transfer/authority/journal tests, including negative forged-label/agent-authored-approval cases; commit only owned modules/tests. Task 4 then integrates these tested interfaces.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/timing-handoff.test.mjs scripts/tests/unit/task-tracker/lib/timing-handoff-journal.test.mjs scripts/tests/unit/task-tracker/lib/timing-handoff-authority.test.mjs
```

### Task 6: Capture real native context and word baseline observations

#### Story Intent

- **Beneficiary:** operator inspecting timing records across agent session changes
- **Capability:** see attributable request-input context and raw imported/new word observations with honest unavailable states
- **Need:** existing word cursors do not establish context size and aggregate token traffic can be mistaken for current request context
- **Value or failure prevented:** no fabricated token measurement, duplicate imported words or reset-induced loss of task evidence

#### Files

Create `scripts/task-tracker/lib/timing-measurement.mjs`, `scripts/tests/unit/task-tracker/lib/timing-measurement.test.mjs` and `scripts/tests/unit/providers/transcript-normalizer.test.mjs`. Modify `scripts/providers/transcript-normalizer.mjs` only through separate normalizeNativeUsageObservation; preserve existing normalizeTranscriptRecord text/tool recognition. Consume `scripts/providers/codex.mjs`, transcript-resolver and task-tracker/word-counter read-only. Own isolated fixtures under `scripts/tests/fixtures/1901-native-measurement/`. Task 2 owns envelope serialization; Task 4 integrates runtime capture; Task 7 computes joint counters; Task 10 renders reports.

**Rank:** 1. **Estimate:** 8 hours, M. **Dependencies:** none; fixed shared observation interface, no engine/codec/provider harness import cycle.

- [ ] Add failing exact Codex rollout record tests at the concrete field path below, correlated to genuine session metadata and preceding turn context. Use a sanitized captured shape fixture plus explicitly synthetic boundary/error cases; preserve fixture provenance/version/byte digest and do not commit private handles/transcript content.
- [ ] Implement normalizeNativeUsageObservation(record,boundContext) and observeSessionMeasurements using existing bounded native transcript resolver/current-session binding, never scanning arbitrary sessions or using app-server subscription. Validate native id/cwd/provider/version, stable record ordinal/time and latest corresponding turn context. Request-input tokens are last_token_usage.input_tokens; reject total_token_usage, capacity, exec aggregates, guidance/word estimates and missing/invalid/unsafe values.
- [ ] Capture actual tier-2 count/tier-3 fullExpansion plus status from unchanged countWords; preserve independent availability, measured imported baselines and cursor generation. Token-only record recognition never manufactures word coverage or zero words. A fresh session with absent native observation exposes Unknown context. Compaction clears freshness until a later eligible observation, retaining historical gauge.
- [ ] Return the immutable MeasurementObservation and per-counter baseline shapes above, with opaque public session reference and owner-only native source/receipt refs. Capture path absence/access failure/unsupported provider or version returns typed unavailable; no model/API request, native provider harness or runtime-storage migration is introduced.
- [ ] Test latest request227699 versus observed capacity258400 as separately labeled source fields in the sanitized captured fixture, not fixed global model facts; also synthetic input400 then250 after compaction, cached-input handling without double addition, absent baseline, cursor reset, malformed record and mismatched binding/turn. Create a test-local measurement fixture that passes real adapter records into the exported observer and has no network or live native-file access during unit tests.
- [ ] Run focused capture/provider/word regressions; commit only owned adapter/module/tests. Other providers retain honest context Unknown unless a verified equivalent rollout-source contract is explicitly supported.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/timing-measurement.test.mjs scripts/tests/unit/providers/transcript-normalizer.test.mjs scripts/tests/unit/task-tracker/lib/word-counter-codex.test.mjs scripts/tests/unit/task-tracker/lib/word-counter-full-expansion.test.mjs scripts/tests/unit/task-tracker/lib/word-counter.test.mjs
```

### Task 7: Project coherent totals while preserving sealed outcome semantics

#### Story Intent

- **Beneficiary:** operator comparing story effort and stage timing
- **Capability:** use complete event-derived totals and inspect scoped unknown remainders without invalidating old outcomes
- **Need:** actor, legacy, per-stage and minute calculations currently diverge and old source validation pins earlier semantics
- **Value or failure prevented:** trustworthy metrics without double-added Review time, subtotal-as-total claims or retroactive outcome corruption

#### Files

Create `scripts/task-tracker/lib/timing-duration-projection.mjs` and `scripts/tests/unit/task-tracker/lib/timing-duration-projection.test.mjs`. Modify `scripts/task-tracker/lib/timing-rows.mjs`, `scripts/task-tracker/lib/timing-engagement.mjs`, `scripts/task-tracker/lib/timing-ladder.mjs`, `scripts/task-tracker/lib/estimation/runtime-adapter.mjs`, `scripts/task-tracker/timing-rollup.mjs`, `scripts/task-tracker/lib/estimation/outcome-record.mjs`, `scripts/task-tracker/lib/estimation/outcome-builder.mjs`, `scripts/gh/log-issue-time.mjs` and relevant existing rollup/outcome tests. Keep lexical implementation stable; Task 7 imports Task 2's codec, creates projectSessionWallSpan and readVerifiedJointStageTiming beside timing-duration-projection, and retains raw source/control metadata in the ladder for verified model dispatch. The runtime adapter chooses enabled complete/partial outcomes from verified joint stage completeness, not old deriveActorEngagement or bare row-sec. Old sealed-record validation keeps original semantics. Add model dispatch adjacent to old functions rather than replacing old-schema semantics.

**Rank:** 4. **Estimate:** 12 hours, L. **Dependencies:** Tasks 3,5,6.

- [ ] Implement projectHandoffMeasurements and its exact counter/gauge/availability formulas. Add1050/2080, replay, missing/reset baseline, context compaction/shrink, opaque provenance and protected/unconverted coverage cases to the projection verifier.
- [ ] Include log-issue-time's actual human-readable report as well as timingFieldProjection: enabled Session Time reads independent sessionMin; Engaged is joint Active and never Active+Review. Unknown/stale/partial values and unchanged legacy formatting are tested by invoking the real CLI. Add the dispatcher milestone counterexample and all startup/release/opener-coverage cases to scalar and board verifiers.
- [ ] Implement and test projectSessionWallSpan plus actual board timingFieldProjection against the normative formula/null rules. Cover start0/pause10/resume30/update40 => session40/engaged20/idle20; handoff0..20 => session20/engaged20; owner conflict horizon15 => session15/affected engaged null; lone opener zero; invalid/missing horizon null; protected effort remainder with proven wall endpoints; mixed models; day/offset transitions; and no now-based growth. Enabled board mapping reads sessionSec/sessionMin rather than totalActiveSec/totalActiveMin. Old marker-free/sealed mapping stays pinned; Task 9 consumes this API for heal-backlog. Board codec output stays unchanged.
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
node --test scripts/tests/unit/task-tracker/lib/timing-duration-projection.test.mjs scripts/tests/unit/task-tracker/lib/timing-rows.test.mjs scripts/tests/unit/task-tracker/lib/timing-rows-seconds.test.mjs scripts/tests/unit/task-tracker/lib/timing-actor-accounting.test.mjs scripts/tests/unit/task-tracker/lib/active-by-phase-spans.test.mjs scripts/tests/unit/task-tracker/core/pause-row-duration.test.mjs scripts/tests/integration/task-tracker/lib/1901-duration-estimation-runtime.test.mjs scripts/tests/slow/task-tracker/lib/log-issue-time.test.mjs scripts/tests/unit/task-tracker/core/timing-rollup.test.mjs scripts/tests/unit/task-tracker/lib/timing-ladder.test.mjs scripts/tests/unit/task-tracker/lib/estimation/outcome-telemetry.test.mjs scripts/tests/unit/task-tracker/lib/estimation/outcome-builder.test.mjs scripts/tests/unit/task-tracker/lib/estimation/outcome-writer.test.mjs scripts/tests/integration/task-tracker/lib/child-close-outcome-evidence.test.mjs
```

### Task 8: Build guarded historical preview and idempotent apply capability

#### Story Intent

- **Beneficiary:** workspace operator repairing historical story timing
- **Capability:** preview recoverable timing changes and apply exactly reviewed unprotected changes under explicit writer exclusion
- **Need:** current backfill skips actor Unknown and stale seconds and lacks exact fresh-base conflict protection
- **Value or failure prevented:** recoverable historical metrics without overwriting newer data, sealed evidence or unrelated source fields

#### Files

Modify `scripts/task-tracker/backfill-timing-logs.mjs`. Create `scripts/task-tracker/lib/timing-duration-repair.mjs`, `scripts/tests/unit/task-tracker/core/timing-duration-repair.test.mjs`, and extend backfill/coverage-backfill tests. Task 10 owns command registration and help snapshots; Task 8 exports the repair CLI parser/help and functions for registration. Consume Task 3 protection/admission checks and Task 7 scalar projection without changing sibling files.

**Rank:** 5. **Estimate:** 8 hours, L. **Dependencies:** Tasks 4,7.

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

### Task 9: Make maintenance and sequence consumers model-aware

#### Story Intent

- **Beneficiary:** operator validating or maintaining timing histories
- **Capability:** diagnose malformed or incomplete event-model rows while preserving their source and projection contracts
- **Need:** independent heal, rename and sequence readers can reject enabled suffixes or reinterpret projected seconds as transcript observations
- **Value or failure prevented:** no maintenance-induced corruption or false green validation after reader rollout

#### Files

Modify all exact maintenance library/CLI paths in Known maintenance writer dispositions: `scripts/task-tracker/lib/heal-timing-departure.mjs`, `scripts/task-tracker/heal-timing-departure.mjs`, `scripts/task-tracker/lib/heal-actor-opener-replays.mjs`, `scripts/task-tracker/lib/heal-timing-starts.mjs`, `scripts/task-tracker/heal-timing-starts.mjs`, `scripts/task-tracker/heal-timing-starts-sweep.mjs`, `scripts/task-tracker/heal-timing-log.mjs`, `scripts/task-tracker/heal-timing-interval.mjs`, `scripts/task-tracker/lib/heal-timing-sweep.mjs`; also `scripts/task-tracker/lib/heal-timing-log.mjs`, `scripts/task-tracker/lib/heal-timing-interval.mjs`, `scripts/task-tracker/lib/timing-slug-rename.mjs`, `scripts/task-tracker/heal-backlog.mjs`, `scripts/task-tracker/lib/agent-review/validators/timing-log-sequence.mjs` and their tests. Add `scripts/tests/unit/task-tracker/maintenance/1901-timing-consumers.test.mjs`. All module paths resolve under scripts/task-tracker. Do not change Task 8's backfill or Task 7's old engagement/outcome implementation. Consume stable lexical/model APIs; any additional consumer discovered is assigned to a single owner before edits.

**Rank:** 5. **Estimate:** 12 hours, L. **Dependencies:** Tasks 4,7.

- [ ] Apply the explicit enabled-model legacy-only/refusal dispositions to every inferred-departure/source-deleting/opener-rewriting/heal CLI and sweep before writes. Test real library/CLI/sweep calls on marker-present/protected logs and confirm zero writes, retained source and typed refusal; preserve current marker-free behavior. Projection repair only uses Task 8's separately authorized guarded operation.
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
node --test scripts/tests/unit/task-tracker/maintenance/1901-timing-consumers.test.mjs scripts/tests/unit/task-tracker/lib/heal-timing-log.test.mjs scripts/tests/unit/task-tracker/lib/heal-timing-interval.test.mjs scripts/tests/unit/task-tracker/lib/timing-slug-rename.test.mjs scripts/tests/unit/task-tracker/lib/heal-timing-departure-repair.test.mjs scripts/tests/unit/task-tracker/maintenance/heal-timing-departure-cli.test.mjs scripts/tests/unit/task-tracker/maintenance/heal-timing-interval-cli.test.mjs scripts/tests/unit/task-tracker/lib/heal-actor-opener-replays.test.mjs scripts/tests/unit/task-tracker/lib/heal-timing-starts.test.mjs scripts/tests/unit/task-tracker/lib/heal-timing-sweep.test.mjs scripts/tests/unit/task-tracker/core/heal-timing-starts-command.test.mjs scripts/tests/unit/task-tracker/core/coverage-heal-timing-starts.test.mjs scripts/tests/integration/task-tracker/core/coverage-heal-timing-starts-sweep.test.mjs scripts/tests/unit/task-tracker/core/heal-timing-log-command.test.mjs scripts/tests/unit/task-tracker/lib/agent-review/validators/timing-log-sequence.test.mjs scripts/tests/unit/task-tracker/lib/agent-review/validators/timing-log-sequence-update-slug.test.mjs scripts/tests/unit/task-tracker/lib/agent-review/validators/timing-log-sequence-audit-rows.test.mjs
```

### Task 10: Gate reader-first activation and prove complete repository integration

#### Story Intent

- **Beneficiary:** operator rolling out event-derived timing across hosts
- **Capability:** activate a shared log only after compatible participants are established and verify the complete timing workflow
- **Need:** old readers cannot consume enabled output and divergent local settings can otherwise mix duration models
- **Value or failure prevented:** no incompatible mixed writers, accidental downgrade, unreviewed historical apply or unsupported release claims

#### Files

Own `scripts/task-tracker/lib/command-surface/entrypoints.mjs`, `scripts/task-tracker/lib/command-surface/catalog.mjs`, `scripts/task-tracker/verbs/help-data.mjs` and `scripts/tests/fixtures/1558/admission-surface.json`, plus the originally listed configuration/routing/system files below. Exact registration/admission inventory must agree; healer routing cannot create implicit enabled write authority.

Create `scripts/task-tracker/timing-duration-model.mjs`, `scripts/tests/integration/task-tracker/core/1901-duration-rollout.test.mjs`, `scripts/tests/integration/task-tracker/core/1901-duration-system.test.mjs`, and `docs/guides/event-derived-timing-rollout.md`. Modify `scripts/task-tracker/config.mjs`, `scripts/task-tracker/lib/command-surface/catalog.mjs`, `scripts/task-tracker/lib/command-surface/routing.mjs` and relevant help/config tests. Register new timing-duration-model operation and backfill-timing-logs with existing bin/aitm routing, using Task 8 parser/help exports. Package version/release changes are release-manager decisions and require actual release evidence, not an invented published version.

- [ ] Register timing-handoff prepare/accept/recover and read-only timing-measurements command/help contracts using the Task 4/5 exported APIs defined above. Recovery validates genuine authority. Extend catalog/routing/help/integration tests with honest unavailable metrics, request-input context descriptions, exact1050/2080 report arithmetic, source digest, opaque identity and protected legacy history. No new live comment authority or provider harness is introduced.

**Rank:** 6. **Estimate:** 8 hours, M. **Dependencies:** Tasks 8,9 integrated; all earlier work retained.

- [ ] Add failing rollout tests where no inventory/concrete release/config revision => no activation; stale allowed host/session/worktree => no activation; conflicting tuple => refusal; identical operation retry => one activation; marker-present local disabled => event output or duration-model-unsupported, never downgrade. Test post-activation legacy rows as refused evidence with raw preservation.
- [ ] Introduce disabled-by-default timingDurationModel. The readiness record lists all allowed writers and consumers, their concrete compatible release and capability/config revision, excluded/suspended old sessions, exact canonical source digest and operator operation ID. Release N is the first actually produced compatible release; activation refuses a symbolic N, unassigned version or unverified participant. Documentation names how to obtain/verify that concrete release rather than pretending a version has shipped.
- [ ] Future-only activation uses the next real ordinary candidate event admitted by an already authorized producer. The rollout command authorizes an activation request for that operation; it does not invent a new timing event or retrospective observation. If there is no eligible real candidate, activation remains pending and reports that status. The existing sanctioned task update can supply a real operator checkpoint; only its genuine admission can carry the marker. The marker and that source row are admitted together. Historical conversion instead uses Task 8's selected existing row; both paths share immutable model tuple/readiness/protection checks.
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
node --test scripts/tests/integration/task-tracker/core/1901-duration-rollout.test.mjs scripts/tests/integration/task-tracker/core/1901-duration-system.test.mjs scripts/tests/unit/task-tracker/lib/command-catalog-parser-policy.test.mjs scripts/tests/unit/task-tracker/lib/command-catalog-policy.test.mjs
npm test
npm run test:slow
npm run lint
npm run format:check
```

## Hydration, refinement and preparation handoff

After genuine plan SPR and XPR acceptance/finalization, commit all generated startup, invitation, response, disposition and manifest files. Add immutable accepted plan path/commit and acceptance record to #1901 Plan Metadata. Perform the governed current-source deep dive with this accepted plan; if it contradicts a contract or requires another task/file dependency, amend and re-review before hydration.

Enumerate #1901's native existing children first. Use sanctioned split-plan dry-run then confirm only once after all ten task Story Intent blocks and executable verifier lists validate. Before child Test, enumerate and commit each child's complete existing regression import/CLI-target inventory, materialize additional child VCs, and freeze accepted source hashes. Store exact task-to-child mapping, accepted plan digest/commit and native dependency edges in committed hydration collateral. Generated children point to the exact Task N source section; never substitute generic prose or imaginary issue IDs.

Rank children by the wave table and add native blocked-by dependencies for every listed predecessor. Higher waves cannot begin until predecessor work is integrated under existing lineage/delivery policy; Ready for Planning may hold tasks with future execution dependencies, but that state never implies those dependencies are already delivered. Refine each child Backlog→Refine→Ready for Planning with individual supported size, estimate, priority, rank, labels, ownership and current evidence. Stop at R4P; no child Plan/Develop/implementation in this session.

Parent estimated effort becomes current child estimate sum plus explicit orchestration overhead; record actual current child IDs/values in the estimate evidence. Prepare parent plan-estimate, current story semantic/source binding, plan approval and decomposition gate from real accepted artifacts. Use ordinary one-edge Plan→Develop. Preserve all honest blockers; no fabricated approval, completed AC, outcomes, test evidence or lifecycle jump. The user's marching orders authorize this preparation and its ordinary approval boundaries; they do not authorize implementation or historical application.

Final handoff lists parent state, child IDs/ranks/dependencies/R4P status, accepted spec/plan hashes, SPR/XPR records, deep dive, forecast/estimation evidence, exact branch/commit, timing checkpoints and remaining implementation gates. Pause the timer and stop for the user's fresh implementation agent.
