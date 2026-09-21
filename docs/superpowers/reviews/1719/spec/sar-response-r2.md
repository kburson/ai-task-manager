<!-- @story #1719 -->

# Story cost specification: Astra SAR round 2

**Status: Approved**

The specification is ready for implementation planning. The five round 1 findings are resolved, and independent review of the full revised specification found no remaining actionable design flaw that would require a specification change before planning.

## Provenance and limits

- Review type: user-authorized fresh native subagent specification review (SAR), round 2. This is not an `ai-peer-review` protocol run or protocol acceptance.
- Model and reasoning: `gpt-6-astra` / `high`.
- Worktree: `/Users/kpburson/.codex/worktrees/df88/ai-task-manager`.
- Specification: `docs/superpowers/specs/2026-09-20-1719-story-token-cost-design.md`.
- Coordinator-supplied pinned HEAD: `4f97d7a49c26561efffe6ae9549a27c50ed4b8bb`. No Git command was run; this report does not independently attest HEAD.
- Independently checked specification SHA-256: `a295ddeec226a0ddab22c029659ca3d3d26d69ba35cbef8564b50bdacac1d58e`, matching the supplied pin.
- Read order: full specification first, then the prior review and author disposition, followed by targeted current local source inspection.
- Calibration: `brainstorming/spec-document-reviewer-prompt.md` requires approval unless serious gaps would lead to a flawed implementation plan. Implementation decomposition, additional features, and style preferences are not approval blockers.
- Scope: read-only source review; only this report was written. No Git operations, dependency installation, implementation tests, issue mutations, billing access, or memory lookup.
- External references: the coordinator reported checking the official provider references in the prior turn. This reviewer made no new external provider claim and did not independently recheck those pages.

Specification line references below apply to the independently checked hash. Source paths are relative to the reviewed worktree.

## Findings

None. No unresolved P1 or P2 finding remains from this review.

## Round 1 disposition verification

| Prior finding                                             | Result   | Revised specification evidence                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SAR-A1: cumulative spans crossing unobserved boundaries   | Resolved | Lines 186–202 distinguish verification, publication, and observation instants. Lines 287–291 preserve opening gaps. Lines 345–363 require identified spans, unresolved unsupported attribution, and atomic replacement of affected spans. Lines 740–744 preserve reset gaps.                               |
| SAR-A2: observation acceptance versus publication retries | Resolved | Lines 238–260 freeze observations, predecessors, payloads, and cursors atomically, independently of remote read-back. Lines 425–463 define source serialization, frozen replay, crash recovery, and failure without invented lifecycle acceptance.                                                         |
| SAR-A3: duplicate economic usage across sources           | Resolved | Lines 327–331 preserve per-response receipt identity and aggregate resolution. Lines 388–411 distinguish economic identity from observation identity, select contributing evidence, prohibit uncertain overlap from additive totals, validate inclusion relationships, and restrict aggregate attribution. |
| SAR-A4: currencies                                        | Resolved | Lines 413–419 require separate per-currency aggregation without FX. Lines 654–668 preserve amount status and currency in headlines.                                                                                                                                                                        |
| SAR-A5: completeness from expected coverage               | Resolved | Lines 598–636 reconcile keyed timing events, policy, source roster, runs, dependencies, corrections, enablement, opening and terminal cutoffs. Missing envelopes remain visible from another checkout. Unsupported required sources cannot silently become not applicable.                                 |

The author response accurately describes these changes. The acceptance cases at lines 873–899 now exercise the consequential failures raised in round 1.

## Independent failure-scenario assessment

### Cumulative and receipt semantics

The cumulative subtraction applies only within a proven monotonic source epoch. The specification retains native categories and prohibits assuming overlapping provider categories are additive (lines 119–135, 313–343). A model, tier, account, or counter change requires a new epoch unless continuity is proven; this does not override the separate requirement for unambiguous pricing. Per-response sources keep unique receipts and a deduplicated running sum instead of pretending that the provider supplied cumulative counters.

The sequence 100 / missing / 180 / late-150 is safe under the written rules: 80 can be an issue quantity only with proven whole-span ownership, while its stage split remains unresolved. The late intermediate observation replaces 80 with 50 and 30 together. The same rule prevents a missing resume observation from silently assigning paused usage to active work.

### Boundary timing and lifecycle scope

A known delivery receipt does not establish a measured token cutoff. A delayed observation crossing verification or Done remains unsplit unless the source supports an exact partition (lines 186–202). Late-arriving evidence is accepted according to in-window occurrence, and source closure or a watermark must establish terminal coverage (lines 627–636). Waiting a timeout does not establish completeness.

The specification distinguishes configured-trunk delivery, epic-branch delivery, no-commit deliverables, and local-trunk work lacking a durable verification instant. Child Done cutoffs remain intact in epic rollups. Work after Done remains outside the stated story window; this is an explicit accounting boundary, not an accidental telemetry omission.

### Retries, concurrency, and correction projections

From baseline 100, a queued E1=130 becomes the durable predecessor of E2=160 before remote publication. A retry replays E1 rather than sampling the live meter again. The expected quantity remains 30 + 30; missing remote predecessors prevent a complete remote view. Source serialization covers predecessor selection through durable freezing, so merely locking the final write is insufficient under the contract.

Cross-machine continuation needs a verified predecessor and continuity. Competing correction revisions, missing inputs, cycles, and invalid conservation prevent the affected replacement from contributing and keep coverage incomplete. These rules state the necessary accounting invariants without prescribing an unnecessary database or lock implementation.

### Overlapping evidence and shared sources

Transcript, response receipt, and exclusive administrative observations of one request contribute once within each view. An aggregate remainder requires established disjoint coverage. Inclusion relationships also require present, nonconflicting evidence. A whole-story exact bill cannot manufacture stage or delivery-split actual amounts.

Every cost line has one owning issue. A shared session is not allocated using elapsed time, and a cumulative span contributes to an issue only with proven whole-span ownership. Explicit dispatch and review-run references supply a defensible attribution path; uncorrelated work remains unresolved. Epic rollups identify immutable child records and exclude parent summary copies (lines 558–578).

### Completeness, valuation, and currency

Ten timing events with eight envelopes cannot become a complete total even when every available envelope is internally valid. Missing source expectations, unsupported required sources, missing baseline or terminal coverage, and unresolved corrections all remain visible. Completeness is specific to quantity, currency, stage, boundary, and valuation view.

Rate-card values retain immutable effective-price provenance and exact monetary precision; ambiguous rate selection preserves consumption while leaving valuation incomplete (lines 137–147, 365–381, 746–750). Actual billing and equivalent estimates are separate views. A partial estimate cannot become an unqualified headline, and USD and EUR never become one scalar.

### Subscription accounting and scope

The separate plan-period authority preserves fixed spend, provider-defined capacity, included and overage rules, attributable and unattributed usage, reconciliation provenance, and coverage (lines 263–269, 670–692). Soft or unpublished limits do not produce fabricated utilization percentages. Included consumption is not labeled a new invoice charge, and fixed subscription spend never enters a story total.

The plan can select the concrete representation for period snapshots and their derived reporting while preserving the existing immutable-evidence and append-only reconciliation requirements. That decomposition does not need another economic feature or a specification gate. Human labor, historical backfill, forecasting, and live billing access remain outside the authorized implementation scope.

## Current local source evidence

- `scripts/task-tracker/runtime.mjs:437–486` captures transcript evidence at flush time and retains the prior cursor when the source is unavailable. This supports treating capture time as distinct from historical lifecycle cutoffs and confirms that the current word-count path is a foundation, not an existing token ledger.
- `scripts/task-tracker/word-counter.mjs:218–285` exposes explicit unavailable Codex outcomes for unresolved sessions/transcripts or unrecognized schemas. The revised unknown-versus-zero contract preserves that distinction.
- `scripts/task-tracker/gh-timing-comment.mjs:726–755` supplies the per-issue timing lock and retry boundary. The specification separately requires source serialization and prohibits recursive issue-lock acquisition.
- `scripts/task-tracker/verbs/pause.mjs:29–47` and `scripts/task-tracker/verbs/resume.mjs:343–358` establish distinct pause and resume instants; a later cumulative sample cannot itself reconstruct their split.
- `scripts/task-tracker/verbs/deliver.mjs:485–529` builds and independently reads back the delivery receipt. `scripts/task-tracker/lib/delivery-records.mjs:283–295` validates target correlation and `verifiedAt`, supporting the revised distinction between verification and publication.
- `scripts/task-tracker/lib/close-delivery-receipt.mjs:55–98,144–154` distinguishes child delivery, issue-resident no-commit delivery, authorized local-trunk work, and evidence-v2 delivery. The specification handles these variants rather than assuming every Done event has a legacy PR receipt.
- `scripts/task-tracker/lib/evidence-v2/record-schema.mjs:292–326` validates v2 delivery target and content evidence but does not currently require a payload verification timestamp. The specification's requirement to expose an equivalent verified instant is therefore a future integration requirement, not a claim that the current payload already provides it. An unsupported instant must remain incomplete under the stated boundary rules.
- `scripts/task-tracker/lib/github-records/record-envelope.mjs:102–129,164–165` validates identity, lineage links, and payload hashes. Those structural checks do not independently prove accounting conservation; the revised specification explicitly requires the cost-domain projection validation above them.
- `scripts/task-tracker/lib/github-records/github-comment-store.mjs:135–175` validates comment identity, repository/issue correlation, and envelope content. Valid individual records do not prove complete coverage; the independent timing/policy/run inventory supplies that missing accounting requirement.

## Accounted-for risks and planning handoff

Unavailable or delayed provider telemetry, insufficient boundary resolution, local evidence loss, ambiguous overlap, and soft subscription limits can still prevent complete reports. The specification exposes these conditions and prohibits manufacturing a precise result. Their existence is not a design defect.

The implementation plan should turn the existing failure acceptance cases into executable fixtures and identify every timing emitter and supported delivery-authority variant. In particular, it must implement the v2 verification-instant requirement rather than substitute comment publication time. These are implementation obligations already imposed by the specification, not additional approval conditions.

**Verdict: Approved for implementation planning.** This verdict does not authorize implementation, backfill, provider credentials, or live billing access.
