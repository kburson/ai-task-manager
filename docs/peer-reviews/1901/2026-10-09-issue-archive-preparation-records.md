# #1901 historical issue records — preparation-records

This is an exact preservation of owned issue-comment bodies before the October 9, 2026 conversion to concise process summaries and immutable Git links. It preserves historical wording, including then-current statuses and relative links; it does not assert those statuses remain current. The accepted artifacts, sealed review responses, and current preparation handoff remain the operational records. Timing, commit-trace, state-transition provenance, and other AITM-owned lifecycle comments are outside this archive and remain on the issue.

## Comment 6071936726

Source: https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6071936726

Created: 2026-10-09T00:45:34Z. Last updated before archival: 2026-10-09T00:45:34Z.

<!-- historical-comment-body:start id="6071936726" -->
````````text
# #1901 user-approved timing-model clarification

Authority: direct user response on 2026-10-08 America/Chicago (2026-10-09T00:36:34.859Z UTC), answering 1A and 2A.

The user approved genuine native Astra SPR submission and selected independent recorded SessionTime: first recorded engagement opener through the last recorded event, including pauses/gaps, without double-counting overlap and without an implicit current-time tail.

The user further clarified: user and agent work are joint effort; one task has one active agent at any instant; a fresh-session agent swap is a handoff, and actual context-token size and word counts must remain visible in the timing history.

Required planning changes:

- Use one joint task clock. Do not split human versus agent effort or add simultaneous agent lanes together for this task.
- Treat actor/provider/session identity as provenance and ownership. Enforce single-agent admission; competing ownership or contradictory overlapping historical agent evidence requires an inspectable conflict, never double credit.
- Preserve task engagement across an evidenced handoff. The owner/session change alone does not reset the task clock or invent a pause; explicit departure/pause events still determine Idle. Unobserved gaps remain unavailable rather than guessed.
- Preserve original per-session measured word/context values and native identity; record handoff boundaries and actual new-session measurements. Do not count replay or handoff twice, fabricate token counts, or attribute a new context to the prior session.
- Compute SessionTime from the independent recorded horizon. Separate it from joint Active/Idle and stage subsets; keep board duration formatting unchanged. Pin behavior for missing/invalid endpoints and open/unavailable histories.
- Parallel fanout remains possible across different child tasks, with disjoint ownership and ranks; a single child never has concurrent implementation agents. Author/reviewer turns are serialized handoffs.
- The formerly accepted spec at bb24dd7e remains historical evidence. Its separate/per-lane effort assumptions must be explicitly amended and re-reviewed before claiming a current accepted plan.

Current protocol state: Astra completed first-pass notes but native submission remains blocked by automatic approval, despite explicit user approval. No SPR acceptance, author handoff or new plan/spec acceptance is claimed.

<!-- aitm-owned-comment key="plan.user-clarification-joint-effort" -->
````````
<!-- historical-comment-body:end id="6071936726" -->

## Comment 6072894128

Source: https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6072894128

Created: 2026-10-09T02:17:34Z. Last updated before archival: 2026-10-09T04:19:28Z.

<!-- historical-comment-body:start id="6072894128" -->
````````text
# #1901 plan SPR completion record

Fresh review `review-d84cbd2bcfc34c23ae33356c7fd41aa9` is finalized **accepted** in normal commit mode. Author: Codex gpt-6.1-sol, requested medium effort. Reviewer: native Codex gpt-6-astra, requested high effort. Three real reviewer rounds and two author revisions were sealed; final round has no remaining material required changes. The acceptance includes the explicitly user-authorized joint-effort/single-agent/handoff/measurement/independent-SessionTime amendment inside the plan.

- Accepted plan: `docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md` at `b20d1255fde08ab16b9ed7ddb8b76dbeef9b0355`.
- Accepted SHA-256: `059ebd09c9fe809b50f9b2007771b15fd18cff052f7a23b171750ed502051df9`.
- SPR finalization commit: `2fbe884e87e6c6c622393218b076748eb60d9888`.
- [review-manifest](https://github.com/kburson/ai-task-manager/blob/d93cdd588c9c7e1db73a719b9bb8f9e2a6bc941f/docs/peer-reviews/1901/plan/spr-restart-2026-10-08/plan/2026-10-09-2026-10-08-1901-event-derived-timing-review-d84cbd2bcfc34c23ae33356c7fd41aa9/review-d84cbd2bcfc34c23ae33356c7fd41aa9-review-manifest.md). Package authority assurance is unavailable, as retained in the manifest; ordinary reviewer consensus is the actual acceptance basis.

## Every review pass

| Pass | Sealed reviewer notes | Findings and author action |
| --- | --- | --- |
| 1 | [reviewer-response-1](https://github.com/kburson/ai-task-manager/blob/d93cdd588c9c7e1db73a719b9bb8f9e2a6bc941f/docs/peer-reviews/1901/plan/spr-restart-2026-10-08/plan/2026-10-09-2026-10-08-1901-event-derived-timing-review-d84cbd2bcfc34c23ae33356c7fd41aa9/review-d84cbd2bcfc34c23ae33356c7fd41aa9-reviewer-response-1.md) | Three required findings plus one optional wrapper suggestion: board SessionTime mismatch, missing adapter ownership/model dispatch, historical capture/root VC binding. [author-response-1](https://github.com/kburson/ai-task-manager/blob/d93cdd588c9c7e1db73a719b9bb8f9e2a6bc941f/docs/peer-reviews/1901/plan/spr-restart-2026-10-08/plan/2026-10-09-2026-10-08-1901-event-derived-timing-review-d84cbd2bcfc34c23ae33356c7fd41aa9/review-d84cbd2bcfc34c23ae33356c7fd41aa9-author-response-1.md); revision e2e8f684. |
| 2 | [reviewer-response-2](https://github.com/kburson/ai-task-manager/blob/d93cdd588c9c7e1db73a719b9bb8f9e2a6bc941f/docs/peer-reviews/1901/plan/spr-restart-2026-10-08/plan/2026-10-09-2026-10-08-1901-event-derived-timing-review-d84cbd2bcfc34c23ae33356c7fd41aa9/review-d84cbd2bcfc34c23ae33356c7fd41aa9-reviewer-response-2.md) | Prior findings addressed; three required refinements for genuine transfer authority, measured context/word arithmetic and earliest wall-start evidence. [author-response-2](https://github.com/kburson/ai-task-manager/blob/d93cdd588c9c7e1db73a719b9bb8f9e2a6bc941f/docs/peer-reviews/1901/plan/spr-restart-2026-10-08/plan/2026-10-09-2026-10-08-1901-event-derived-timing-review-d84cbd2bcfc34c23ae33356c7fd41aa9/review-d84cbd2bcfc34c23ae33356c7fd41aa9-author-response-2.md); revision b20d1255. |
| 3 | [reviewer-response-3](https://github.com/kburson/ai-task-manager/blob/d93cdd588c9c7e1db73a719b9bb8f9e2a6bc941f/docs/peer-reviews/1901/plan/spr-restart-2026-10-08/plan/2026-10-09-2026-10-08-1901-event-derived-timing-review-d84cbd2bcfc34c23ae33356c7fd41aa9/review-d84cbd2bcfc34c23ae33356c7fd41aa9-reviewer-response-3.md) | Accepted, no remaining material required changes. Explicit acceptance of the normative user amendment. |

## Timing evidence

Event-authoritative timestamps below are UTC; local operator date is October8,2026 America/Chicago. They measure one sequential joint workflow, not separate human-versus-agent effort.

| Event | UTC recorded time |
| --- | --- |
| Fresh review created | 2026-10-09T01:23:24.604Z |
| Genuine reviewer joined | 2026-10-09T01:32:08.947Z |
| Round1 revisions requested | 2026-10-09T01:36:16.612Z |
| Author revision1 committed | 2026-10-09T01:48:51.870Z |
| Round2 revisions requested | 2026-10-09T01:52:05.662Z |
| Author revision2 committed | 2026-10-09T02:08:31.170Z |
| Round3 accepted | 2026-10-09T02:10:45.318Z |
| Acceptance finalized | 2026-10-09T02:11:03.585Z |

Fresh review creation-to-finalization wall span: **47m38.981s**. Reviewer-owned protocol windows total9m35.605s; author-revision windows total29m0.766s; startup/recovery8m44.343s; finalization18.267s. These disjoint workflow windows partition the same elapsed span and do not form separate actor effort estimates. Live AITM checkpoints remain the actual timing/word evidence; Unknown values are not retroactively fabricated. CLI aggregate token traffic is not reported as current context size.

## Discarded earlier attempt and recovery

The user directed discarding `review-85401a177844696ebef0617faa7017d5` and creating this independent fresh review. Its startup/invitation/native unsealed notes are retained under docs/peer-reviews/1901/plan/spr/. Its broker is fenced **recovery-only**. Its package protocol still has an unresolved reviewer turn because joined cancellation lacks the needed intervention/reciprocal lineage; no terminal supersession or old reviewer submission is fabricated. This fresh review has its own independent ID/root, no fake lineage, and a complete accepted terminal record.

Failure evidence: trusted peer-review hooks added native identity/token instrumentation; Codex auto-review misclassified it as manual forgery. Interactive resume restored the transcript but not historic denials into /approve. The displayed app terminal lacked bundled codex on PATH. Fresh headless exec forced approval_policy never despite the requested on-request config, so it could not join in workspace sandbox. The human then explicitly selected full access. The same fresh native reviewer session resumed under that setting, genuinely joined and completed all three rounds. No --approve-for-me or --dangerously-bypass flags were used for completed fresh review turns; AITM, identity hooks and peer-review boundaries stayed intact.

## Validation and remaining preparation

Eight tasks/five waves parse with valid Story Intent and executable verifiers; plan formatting and git diff --check passed. Proposed implementation tests were not claimed executed. No implementation, production activation or historical apply occurred. The plan XPR, final accepted-plan metadata, deep dive, hydration/refinement/estimate and parent Develop preparation follow under the original marching orders.

<!-- aitm-owned-comment key="plan.spr-astra-restart" -->
````````
<!-- historical-comment-body:end id="6072894128" -->

## Comment 6073603720

Source: https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6073603720

Created: 2026-10-09T03:22:15Z. Last updated before archival: 2026-10-09T04:19:23Z.

<!-- historical-comment-body:start id="6073603720" -->
````````text
# #1901 Plan XPR record

Review **review-44cf48195bdeaa60b8acf83e3d0abe82** is **accepted and finalized** in normal commit mode with no required changes remaining. Codex gpt-6.1-sol medium authored the plan; genuine Claude Opus 5.5 (claude-opus-5-5), high effort, reviewed in the same registered native session across all four rounds.

Accepted plan: `docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md`, artifact commit `e8a34e7b1fbb39cafddae7a4189d819f005ba4b9`, digest `sha256:df768032f5fa4111babc0a3ea9ef4acfc879a95217b75bdd638be9f289e86668`. Finalization commit: `dc9fc1f13a1d02ceadbd0ef45efbc81654885b3a`. [Final manifest](https://github.com/kburson/ai-task-manager/blob/d93cdd588c9c7e1db73a719b9bb8f9e2a6bc941f/docs/peer-reviews/1901/plan/xpr/plan/2026-10-09-2026-10-08-1901-event-derived-timing-review-44cf48195bdeaa60b8acf83e3d0abe82/review-44cf48195bdeaa60b8acf83e3d0abe82-review-manifest.md).

The historical accepted spec remains byte-identical; the later user joint-effort amendment and current plan changes were included in this XPR. Astra SPR accepted the preceding plan version; the final Claude version incorporates that review plus three further author revisions. Neither older acceptance is misrepresented as accepting later bytes.

| Pass | Decision and discovered changes | Reviewer notes | Author disposition |
| --- | --- | --- | --- |
| 1 | Revisions requested: startup authority, dispatch/maintenance ownership, reachable native measurement, task split and focused regression coverage; all nine items dispositioned | [Round 1](https://github.com/kburson/ai-task-manager/blob/d93cdd588c9c7e1db73a719b9bb8f9e2a6bc941f/docs/peer-reviews/1901/plan/xpr/plan/2026-10-09-2026-10-08-1901-event-derived-timing-review-44cf48195bdeaa60b8acf83e3d0abe82/review-44cf48195bdeaa60b8acf83e3d0abe82-reviewer-response-1.md) | [Revision 1](https://github.com/kburson/ai-task-manager/blob/d93cdd588c9c7e1db73a719b9bb8f9e2a6bc941f/docs/peer-reviews/1901/plan/xpr/plan/2026-10-09-2026-10-08-1901-event-derived-timing-review-44cf48195bdeaa60b8acf83e3d0abe82/review-44cf48195bdeaa60b8acf83e3d0abe82-author-response-1.md) |
| 2 | Revisions requested: concrete release/takeover evidence and split test ownership; optional command suites/full path also addressed | [Round 2](https://github.com/kburson/ai-task-manager/blob/d93cdd588c9c7e1db73a719b9bb8f9e2a6bc941f/docs/peer-reviews/1901/plan/xpr/plan/2026-10-09-2026-10-08-1901-event-derived-timing-review-44cf48195bdeaa60b8acf83e3d0abe82/review-44cf48195bdeaa60b8acf83e3d0abe82-reviewer-response-2.md) | [Revision 2](https://github.com/kburson/ai-task-manager/blob/d93cdd588c9c7e1db73a719b9bb8f9e2a6bc941f/docs/peer-reviews/1901/plan/xpr/plan/2026-10-09-2026-10-08-1901-event-derived-timing-review-44cf48195bdeaa60b8acf83e3d0abe82/review-44cf48195bdeaa60b8acf83e3d0abe82-author-response-2.md) |
| 3 | Revisions requested: receipt index must use current runtime authority; provider-accurate deferred recovery guidance | [Round 3](https://github.com/kburson/ai-task-manager/blob/d93cdd588c9c7e1db73a719b9bb8f9e2a6bc941f/docs/peer-reviews/1901/plan/xpr/plan/2026-10-09-2026-10-08-1901-event-derived-timing-review-44cf48195bdeaa60b8acf83e3d0abe82/review-44cf48195bdeaa60b8acf83e3d0abe82-reviewer-response-3.md) | [Revision 3](https://github.com/kburson/ai-task-manager/blob/d93cdd588c9c7e1db73a719b9bb8f9e2a6bc941f/docs/peer-reviews/1901/plan/xpr/plan/2026-10-09-2026-10-08-1901-event-derived-timing-review-44cf48195bdeaa60b8acf83e3d0abe82/review-44cf48195bdeaa60b8acf83e3d0abe82-author-response-3.md) |
| 4 | Accepted: no required changes. Optional missing write-guard name is carried explicitly into deep-dive/child preparation, as the reviewer requests | [Round 4](https://github.com/kburson/ai-task-manager/blob/d93cdd588c9c7e1db73a719b9bb8f9e2a6bc941f/docs/peer-reviews/1901/plan/xpr/plan/2026-10-09-2026-10-08-1901-event-derived-timing-review-44cf48195bdeaa60b8acf83e3d0abe82/review-44cf48195bdeaa60b8acf83e3d0abe82-reviewer-response-4.md) | No further artifact revision required |

## Timing evidence

Protocol creation: **2026-10-09T02:17:32.515Z**. Reviewer-consensus acceptance: **2026-10-09T03:19:34.415Z**. Author finalization: **2026-10-09T03:20:08.425Z**.

Joint end-to-end wall span: **62m 35.910s**. This includes launch, author revisions, review turns and finalization. Reviewer-turn wall windows total 14m 3.390s; author-revision windows total 46m 43.114s. These are disjoint diagnostic partitions of one joint elapsed span, not separate human/agent effort estimates or measured Active/Idle. The first author revision includes preparation and context recovery. AITM's current Unknown telemetry is not replaced with these wall windows.

| Protocol event | Original UTC observation |
| --- | --- |
| review-created (sequence 1) | 2026-10-09T02:17:32.515Z |
| reviewer-joined (sequence 4) | 2026-10-09T02:18:47.911Z |
| reviewer-revisions-requested (sequence 6) | 2026-10-09T02:24:37.126Z |
| author-revision-committed (sequence 9) | 2026-10-09T03:05:12.560Z |
| reviewer-revisions-requested (sequence 11) | 2026-10-09T03:10:36.110Z |
| author-revision-committed (sequence 13) | 2026-10-09T03:14:44.785Z |
| reviewer-revisions-requested (sequence 15) | 2026-10-09T03:16:37.603Z |
| author-revision-committed (sequence 17) | 2026-10-09T03:18:36.608Z |
| reviewer-accepted (sequence 19) | 2026-10-09T03:19:34.415Z |
| acceptance-committed (sequence 22) | 2026-10-09T03:20:08.425Z |

Authority assurance/human verifier is recorded **unavailable** by the package. Acceptance is genuine ordinary reviewer consensus, not a cryptographically verified human approval. No raw native handles, authorization messages or transcript paths are committed.

## Preparation boundary

Ten children across six dependency ranks are planned. Plan estimate before current refinement is 110 joint child hours plus 2 root orchestration hours. The 72-hour wave critical path is an estimate, not observed review duration. Child refinement must reassess Task 5's breadth. Implementation, activation, package publication and historical application remain unperformed and require their own governed stages.

<!-- aitm-owned-comment key="plan.xpr-claude-record" -->
````````
<!-- historical-comment-body:end id="6073603720" -->

## Comment 6073668723

Source: https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6073668723

Created: 2026-10-09T03:27:59Z. Last updated before archival: 2026-10-09T03:27:59Z.

<!-- historical-comment-body:start id="6073668723" -->
````````text
The accepted #1901 plan at e8a34e7b1fbb39cafddae7a4189d819f005ba4b9 (sha256:df768032f5fa4111babc0a3ea9ef4acfc879a95217b75bdd638be9f289e86668) is the governing preparation source. The historical specification at bb24dd7ec75c43e3cb0acfbe4803d51a58ef3cd8 remains byte-identical (sha256:6e6e0aae4f1764850701f4f0be0b4593dfde8f1b84e968652b6cdf7b7bcd958f). The later user clarification is normative through the reviewed plan: timing represents one joint task clock, a task has one active execution owner, and session replacement is a genuine handoff with attributable context and word observations. Astra SPR accepted its predecessor version after three passes; Claude Opus 5.5 high accepted these final plan bytes after four passes. Each review pass, author revision and manifest is retained. No implementation, production activation, package publication or historical apply has occurred.

Current source inspection confirms the defect seam: scripts/task-tracker/runtime.mjs imports readActivityEvidence at line40 and calls it in flushActiveToGH around line697. An unavailable transcript estimate still suppresses event-recoverable visible timing. scripts/task-tracker/gh-timing-comment.mjs remains the row/publication seam and row-sec consumer; it currently emits the old hours/minutes/seconds display. The future normalized engine must establish bounded allocations from immutable events, preserve unavailable original estimates and exact source identity, and keep all owning/non-owning source controls separate from mutable projection. A lone opener cannot earn an unbounded tail. Shared lifecycle boundaries partition genuine intervals without inventing actor ends. Current runtime flush journals and queue receipts already provide the integration boundary; merely fulfilled promises, skipped work and durable enqueue must never be represented as verified remote publication. Full canonical projection read-back, maximum three mutation attempts, exact source IDs and idempotent recovery remain required because GitHub comments provide no CAS.

The actual scripts/gh/log-issue-time.mjs timingFieldProjection around line90 still maps Session to totalActive, while formatRollupSummaryLines adds Active and Review in its printed Engaged expression. These are concrete Task7 changes, including the printed report; changing only a scalar library would leave misleading user-visible output. The reviewed independent SessionTime derives the earliest eligible original wall opener/engagement evidence and last recorded source horizon, floors original milliseconds to seconds and includes pauses/gaps without an implicit now. Joint Active and Idle remain disjoint with Plan/Review subsets and explicit unavailable/protected/unconverted remainder. Uncertain actor allocations can coexist with independently known wall endpoints. Existing marker-free and sealed snapshot semantics remain pinned, including original estimates and byte protection. Current node/provider resolution, input-token records, word counters and compacted context must supply actual measurements independently; total token traffic, capacity or a word estimate cannot substitute for a context observation.

Review-driven authority checks are now concrete. Task5 owns same-host shared handoff receipt resolution and native user takeover verification; Task4 owns actual runtime/hook/verb/dispatch integration. The current runtime roots come from scripts/task-tracker/lib/runtime-storage.mjs runtimeStoragePaths, not the retired .db tree. Only an already activated compatible shared store supports new private receipts. Existing migration barriers, source inventory and root/path/control checks must remain; no live migration or implicit activation is authorized. Cross-host authority and non-Codex takeover remain unsupported with visible diagnostics. A new native session automatically defers, rather than fabricating old-end recovery or acquiring the author task. The dominant unpaused-owner replacement and same-host cross-worktree departure tests invoke real resolvers with production-shaped isolated files/native records. Pre-authorization contender work stays uncredited; later genuinely admitted successor windows are measurable independently. Same-session compaction preserves ownership, checkpoints and engagement, while invalidating stale context gauges only.

### Current-source clarification from accepted XPR advisory

Claude round4 R4-F001 is correct: assertRuntimeReadable and assertRuntimeStoragePath exist in runtime-storage.mjs; no existing exported assertRuntimeWritable exists. Task5 will add the named write-side wrapper to its already-owned runtime-storage.mjs, rather than search for or claim a nonexistent export. The wrapper must reuse current physical root, complete activation/control/manifest identity and storage-path/symlink validation before receipt mutations, with fresh checks under the existing authority lock and explicit refusal during migration/partial state. Focused runtime-storage/migration tests must prove it neither initializes a store nor weakens any existing barrier. This is the bounded deep-dive disposition explicitly requested by the accepting reviewer; it changes no accepted plan file or owner/dependency.

### Decomposition and refined joint estimates

Ten accepted tasks map to six ranks: rank1 Tasks1/2/6; rank2 Task3; rank3 Task5; rank4 Tasks4/7; rank5 Tasks8/9; rank6 Task10. Dependencies are respectively none, none, Tasks1/2, Tasks3/5/6, Tasks3/6, none, Tasks3/5/6, Tasks4/7, Tasks4/7, Tasks8/9. The DAG is acyclic and no same-wave siblings share an owned source file. Three parallel lanes at rank1, two at rank4 and two at rank5 are available across distinct child tasks; this preparation launches no implementation workers.

Task5 should refine from14h to18h/L because concrete native authority, generation-safe crash recovery, runtime-family registration and the new write-side wrapper now have explicit production-shaped coverage obligations. Other accepted joint estimates remain12,10,12,14,8,12,8,12,8 hours for Tasks1,2,3,4,6,7,8,9,10. Refined children therefore total114h, plus2h root orchestration =116h/XL. The revised estimated wave critical path is76h before staffing/coordination overhead. These are one joint effort estimate, never a sum of separate agent and user effort. The accepted plan's112h remains its explicitly provisional pre-refinement estimate. GitHub child read-back must replace these expectations before the parent estimate is recorded.

### Story-value and verification preparation

Applied all seven story-quality questions to the root intent and every selected task: each beneficiary is an actual operator/release stakeholder; the requested behavior is an observable timing or integrity safeguard; its need is grounded in the defect/current source; its value describes the failure prevented; sibling capabilities are distinct (derivation, codecs, publication, producers, handoff, measurement, projection, repair, maintenance, rollout); and each generated three-line story explains that capability/need/value without requiring the plan. Root prose is authored through aitm user-story from the accepted root intent. The ten generated proposals passed canonical split-plan dry-run with executable verifier declarations and supported intent. Generated children must retain exact task headings and accepted source commit/digest.

Before child Test, the mandatory current regression inventory follows imports/helper references and direct/dynamic/spawned CLI invocations for each owned modified module. Existing minima include producer/start/resume/dispatch/queue/compact hooks; projection/duration/actor/phase/outcome suites; runtime migration/storage; all maintenance writer CLIs/sweeps; and catalog/admission/help. No new proposed suite has been run here and no AC/DoD box is ticked. The live historical fixture capture belongs to Task1 before its offline unit verifier; absent source capture is a real block, not replaced with synthetic data. The six original root ACs and existing vc1–9 remain; accepted focused groups vc10–19 must be materialized before execution.

### Operational dependencies and stopping point

Live native enumeration of #1901 found no children and no blockers before hydration. #1857 and #1862 remain open upstream coordination issues; current runtime APIs already exist, and release/activation readiness must revalidate actual compatible participants and runtime setup. No completion or release is inferred from source presence. The parent becomes an epic for the accepted materialized WBS, retaining its recorded codex/1901-draft worktree lineage. Each child moves only Backlog → Refine → Ready for Planning, with same-wave ranks and native blocked-by edges. Parent develops only after current story binding, estimate, decomposition, deep dive and Plan approval genuinely pass. Stop with the timer paused for the requested fresh implementation agent; preserve any honest refusal rather than create approval/test evidence or bypass a gate.

<!-- aitm-owned-comment key="plan.deep-dive-accepted" -->
````````
<!-- historical-comment-body:end id="6073668723" -->

## Comment 6074153467

Source: https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6074153467

Created: 2026-10-09T04:16:58Z. Last updated before archival: 2026-10-09T04:19:34Z.

<!-- historical-comment-body:start id="6074153467" -->
````````text
# #1901 Hydration and preparation handoff

Reviews are accepted and finalized. Preparation is complete through child refinement and parent estimate convergence. Parent **#1901 remains Plan**, because the registered Plan-to-Develop gate refuses the current forecast and title-provenance contracts. No implementation, historical application, production activation or package publication began.

## Accepted sources and review evidence

- Accepted specification: `docs/superpowers/specs/2026-10-08-1901-event-derived-timing-design.md`; immutable commit `bb24dd7ec75c43e3cb0acfbe4803d51a58ef3cd8`; digest `sha256:6e6e0aae4f1764850701f4f0be0b4593dfde8f1b84e968652b6cdf7b7bcd958f`.
- Accepted plan: `docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md`; artifact commit `e8a34e7b1fbb39cafddae7a4189d819f005ba4b9`; digest `sha256:df768032f5fa4111babc0a3ea9ef4acfc879a95217b75bdd638be9f289e86668`. The later direct user joint-clock amendment is part of this reviewed plan.
- Astra 6 high SPR: review-d84cbd2bcfc34c23ae33356c7fd41aa9, three passes; predecessor plan accepted. [SPR record](https://github.com/kburson/ai-task-manager/blob/d93cdd588c9c7e1db73a719b9bb8f9e2a6bc941f/docs/peer-reviews/1901/plan/2026-10-08-plan-spr-record.md).
- Claude Opus 5.5 high XPR: review-44cf48195bdeaa60b8acf83e3d0abe82, four passes; no required changes remain. [XPR record](https://github.com/kburson/ai-task-manager/blob/d93cdd588c9c7e1db73a719b9bb8f9e2a6bc941f/docs/peer-reviews/1901/plan/2026-10-08-plan-xpr-record.md). XPR protocol wall span62m35.910s; genuine normal consensus finalized at dc9fc1f13a1d02ceadbd0ef45efbc81654885b3a.
- [Current-source deep dive](https://github.com/kburson/ai-task-manager/blob/d93cdd588c9c7e1db73a719b9bb8f9e2a6bc941f/docs/superpowers/plans/2026-10-08-1901-deep-dive.md), committed at f341e9858333612ad58ad6384e514c01271e3c7e and mirrored from [the owned issue comment](https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6073668723).
- Normal review authority assurance is recorded unavailable; peer consensus is not relabeled as cryptographically verified human approval.

## Native WBS and current refinement

Canonical split-plan dry-run validated every task/story/verifier before one confirm created exactly ten children. Native enumeration initially found no children. Every child now has a current schema3 refinement snapshot, P1, a finite rank, supported size/estimate, genuine native dependency edges and the accepted #1901 spec pointer. The root now has Source-plan, Source-plan-commit, Governing-spec, Decomposition-plan and deep-dive references. Root focused verifier groups vc10–19 are declared alongside the original vc1–9; no verifier or implementation AC/DoD is claimed passed.

| Task | Child                                                           | Rank | Size | Joint hours | Native predecessors | State              |
| ---- | --------------------------------------------------------------- | ---- | ---- | ----------- | ------------------- | ------------------ |
| 1    | [#1929](https://github.com/kburson/ai-task-manager/issues/1929) | 1    | L    | 12          | none                | Ready for Planning |
| 2    | [#1930](https://github.com/kburson/ai-task-manager/issues/1930) | 1    | L    | 10          | none                | Ready for Planning |
| 3    | [#1931](https://github.com/kburson/ai-task-manager/issues/1931) | 2    | L    | 12          | #1929, #1930        | Ready for Planning |
| 4    | [#1932](https://github.com/kburson/ai-task-manager/issues/1932) | 4    | L    | 14          | #1931, #1933, #1934 | Ready for Planning |
| 5    | [#1933](https://github.com/kburson/ai-task-manager/issues/1933) | 3    | L    | 18          | #1931, #1934        | Ready for Planning |
| 6    | [#1934](https://github.com/kburson/ai-task-manager/issues/1934) | 1    | M    | 8           | none                | Ready for Planning |
| 7    | [#1935](https://github.com/kburson/ai-task-manager/issues/1935) | 4    | L    | 12          | #1931, #1933, #1934 | Ready for Planning |
| 8    | [#1936](https://github.com/kburson/ai-task-manager/issues/1936) | 5    | L    | 8           | #1932, #1935        | Ready for Planning |
| 9    | [#1937](https://github.com/kburson/ai-task-manager/issues/1937) | 5    | L    | 12          | #1932, #1935        | Ready for Planning |
| 10   | [#1938](https://github.com/kburson/ai-task-manager/issues/1938) | 6    | M    | 8           | #1936, #1937        | Ready for Planning |

Every generated child pins Source-plan-commit `a7327f55ca9eb7eaedc315611baabc53a2ef4d19`, which contains exactly the accepted plan bytes at e8a34e7b. No imaginary child ID or changed source text was substituted. The creator had initially fallen back to its generic decomposition specification because the root lacked the exact Governing-spec key; that metadata error was repaired on the root and all ten children through guarded issue-body operations and verified live. Historical creation/refinement records remain intact.

Wave1 offers Tasks1/2/6 in parallel on distinct issues; wave2 integrates Task3; wave3 performs Task5; wave4 offers Tasks4/7; wave5 offers Tasks8/9; wave6 integrates Task10. No implementation workers were launched. Native dependencies at later ranks remain pending, which is compatible with staging at R4P and does not claim predecessor delivery.

Current joint child estimate is **114h**, plus **2h** explicit root orchestration = **116h/XL**. Task5 was refined from provisional14h to18h for concrete native authority, generation-safe recovery, runtime-family compatibility and the accepted review's write-side-guard advisory. Revised estimated critical path is76h before staffing/coordination overhead. This is one joint estimate, not separate user/agent effort. Root board and canonical fields were updated with inflate-estimate and the supported compatibility plan-estimate appendix was written. The accepted plan's112h remains its explicitly provisional pre-refinement estimate.

## Worktrees and pickup boundary

All ten preparation worktrees are attached to this chat, seeded with pinned npm dependencies and a self-link to their own checkout. They are clean detached checkouts based on f341e9858, with no implementation edits. Their actual locations are `/Users/kpburson/.codex/worktrees/1901-child-<issue>-plan/ai-task-manager` for issues1929–1938. Bind/timing operations ran from each real worktree, one active task at a time. Child timers were stopped after preparation; no claim of a nonexistent named child branch is made.

A fresh executor must use the governed child pickup/branch route, re-read current Tier1 and source interfaces, and complete each child deep dive before source edits. The current Codex hook ignores exec_command.workdir when checking its invoking worktree; canonical task commands needed their documented foreign-worktree override while executing in the genuine bound child directory. The standalone draft-branch and explain parsers do not accept that override. Existing registration/paths were retained, rather than forging a provider session or weakening hooks. A command presented as promote --explain actually executed the authorized Backlog-to-Refine edge on #1930; the canonical refinement then completed to R4P. This is additional integration defect evidence, not a claimed successful diagnostic.

Before child Test, enumerate the current full import/helper/CLI regression inventory, add any additional explicit child verifiers, freeze actual source hashes and perform Task1's read-only real-history fixture capture. The committed plan's existing regression minima are already in child verifier declarations. No missing fixture is replaced by synthetic authority.

## Verified remaining Develop refusals

1. **Forecast contract.** `TT_FULL_AUTO=1 node bin/aitm.mjs plan-approve 1901` returned exit13: "#1901 has no converged adaptive forecast to freeze at Plan approval." The real planned-appendix gate returns ok=true; the real plan-exit estimate guard returns `plan-forecast-freeze-missing`. The native adaptive builder in scripts/task-tracker/lib/estimation/forecast-model.mjs computes a human Plan and separate AI stage forecasts. The user directly requested a joint effort basis. No separate forecast was invented and no approval/forecast marker was fabricated. The blocked approval also leaves its required epic-orchestration freeze absent.
2. **Title provenance contract.** The real decomposition gate finds all ten task claims, pinned identical plan bytes, valid ranks/dependencies and current refinement. It still compares raw child titles to plain plan task titles. AITM's bug-title normalization adds "🐞 [BUG] ", which then fails `wbs-provenance-mismatch`. Attempts to set the exact accepted plain titles through supported GitHub metadata edits were automatically normalized back. The accepted plan was not rewritten or falsely re-accepted to hide this contradiction.
3. **Diagnostics.** Compact Explain still reports plan-exit-planned-estimate, plan-exit-decomposition and plan-exit-epic-children-r4p-or-beyond as unclassified refusals. Direct real child admission returns ok=true for all10 current R4P children; the latter refusal is its missing durable orchestration plan, not a child state failure. Preserve the distinction instead of treating marker presence alone as readiness.

The ordinary one-edge Develop transition is not executed while these typed refusals remain. Resolving the planning forecast contract and title-normalization/provenance mismatch requires explicit supported policy/contract repair; this preparation does not expand #1901 into implementing unrelated workflow fixes or bypass delivery invariants. All real reviews, timing checkpoints and collateral remain reviewable. Stop before implementation.

<!-- aitm-owned-comment key="plan.hydration-handoff" -->
````````
<!-- historical-comment-body:end id="6074153467" -->
