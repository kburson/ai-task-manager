<!-- @story #1719 -->

# Story cost specification: Astra SAR

**Status: Issues Found**

The selected architecture and economic boundaries are suitable. Five accounting invariants need clarification before implementation planning. These findings concern incorrect amounts, attribution, or completeness under the written rules; they do not require a larger feature set.

## Provenance and limits

- Review type: user-requested native subagent specification review (SAR), using GPT-6 Astra (`gpt-6-astra`). This is not an `ai-peer-review` protocol run or protocol acceptance.
- Worktree: `/Users/kpburson/.codex/worktrees/df88/ai-task-manager`.
- Specification: `docs/superpowers/specs/2026-09-20-1719-story-token-cost-design.md`.
- Coordinator-supplied pinned HEAD: `f8b478432eddafdcf779bc33b6bbadb4b16bf7c2`. The reviewer did not run Git and does not independently attest that HEAD.
- Independently verified specification SHA-256: `5a9ee61e3ba843917470a0605ca67a6ff23e5ac75109494794d2d537c73e73c8`.
- Calibration: the local Superpowers `brainstorming/spec-document-reviewer-prompt.md`: approve unless serious gaps would produce a flawed plan. The requested review concerns completeness, consistency, consequential ambiguity, scope, and YAGNI.
- Evidence: read-only inspection of this specification, `AGENTS.md`, and the repository sources cited below. No source edits, dependency installation, tests, issue mutations, billing credentials, or live billing access. Only this report was written.
- Provider documentation: the coordinator reported live verification of all five official references at specification lines 739–743, including the documented grouping/bucket distinctions and xAI's inclusive per-request cost. This reviewer did not independently browse them. No finding relies on a new provider billing claim.
- Earlier memory was consulted only to confirm the user's economic boundaries; the review findings are grounded in the pinned specification and current local source, not remembered implementation state.

All specification line numbers below refer to the SHA-256 above. Source paths are relative to the reviewed worktree.

## Findings

### SAR-A1 — P1: Define attribution for cumulative spans that cross an unobserved boundary

**Specification:** lines 256–259, 283–303, 335–338, 429–441, 554–558, and 570–574. Delivery boundaries are defined at lines 171–184.

**Problem:** The rules subtract the last accepted cumulative observation, assign the interval to the stage active before the ending event, and explicitly retain the old cursor when an observation is unavailable. They do not say how to represent a recovered delta spanning the missing event. The out-of-order rule only forbids a delta across an unknown predecessor; here the previous accepted snapshot is known, but the intervening stage or ownership boundary is not measured. Reconciliation can supersede an incomplete view without a stated requirement to replace overlapping later deltas.

**Failure scenario:** Develop starts at cumulative 100. Its completion snapshot is unavailable. Test completes at 180. Applying the written subtraction and ending-stage rule charges 80 to Test, including Develop usage. If the missing snapshot later arrives as 150, simply filling Develop's 50 leaves the existing Test 80 and counts 50 twice. A failed resume snapshot can similarly let paused usage enter the next active interval. A successful delivery receipt between two snapshots creates the same problem for the delivery/post-trunk split even though the receipt itself is known.

**Repository evidence:** `scripts/task-tracker/runtime.mjs:437–477` captures observations at flush time and retains the old transcript cursor on unavailable evidence; it supplies no token-level reconstruction of intermediate events. `scripts/task-tracker/verbs/pause.mjs:29–47` and `scripts/task-tracker/verbs/resume.mjs:343–358` establish distinct pause/resume boundaries. Delivery is separately persisted and read back at `scripts/task-tracker/verbs/deliver.mjs:485–529`; its receipt includes a validated `verifiedAt` at `scripts/task-tracker/lib/delivery-records.mjs:283–295`. A receipt timestamp alone cannot split a cumulative counter.

**Minimum required clarification:** Define deltas as spans between identified observations, with explicit start/end boundaries. A span crossing an unmeasured stage, pause, issue, or delivery boundary must retain unresolved attribution unless independently timed source evidence can split it; a defensible issue subtotal may still be retained where ownership is certain. Specify that inserting/correcting an observation replaces the affected derived spans as one consistent view, so original and replacement quantities never both contribute. State whether delivery capture creates a boundary observation and which receipt instant it uses. If an opening baseline is initially unavailable, preserve the resulting coverage gap rather than silently treating later in-window consumption as excluded pre-baseline usage.

**Acceptance example:** Exercise the 100 / missing / 180 / late-150 sequence across two stages, plus a missing resume or delivery snapshot. The final stage deltas should be 50 and 30 only when the intermediate evidence supports them; unresolved splits must stay incomplete.

### SAR-A2 — P1: Separate durable observation acceptance from remote delivery retries

**Specification:** lines 220–227, 330–356, and 560–568.

**Problem:** The persisted intent is described as event identity, timing descriptor, cursor references, and status. The observation is taken afterward. The design requires identifier reuse and exact-payload idempotency but does not require persisting the captured snapshot/payload before remote append, or define whether a queued observation advances the local observation chain before GitHub read-back. Those alternatives change accounting results, not merely implementation structure.

**Failure scenario:** With an accepted baseline of 100, event E1 captures 130 and its Timing Log append succeeds, but its ledger append fails. E2 then captures 160. If “accepted cursor” means remotely accepted, E2 derives 60 against 100; later replay of E1 adds another 30. If E1 is instead resampled during retry, its quantity can change to 160 under the original event identity. A timeout after a successful remote write then presents a conflicting payload for an otherwise ordinary retry. Persisting identifiers alone does not prevent either outcome.

**Repository evidence:** The existing immutable envelope hashes the full payload (`scripts/task-tracker/lib/github-records/record-envelope.mjs:102–129,164–165`). Its `predecessor` and `supersedes` links validate identity and structural consistency, but do not implement a cost-observation commit point. The current runtime samples live transcript state at each flush (`scripts/task-tracker/runtime.mjs:451–477`), so simply reusing that operation on replay does not preserve the original observation.

**Minimum required clarification:** Require durable freezing of the observation, predecessor, and intended payload before attempting its remote publication. Define one commit point for the local source observation chain and how later events depend on queued predecessors. A delivery retry must replay frozen evidence; a newly observed or corrected value must become linked reconciliation evidence. Specify recovery when the process dies after intent creation but before observation capture: it cannot label a later sample as an exact observation at the earlier event.

**Acceptance example:** Capture E1=130 and E2=160 from baseline 100 while E1's publication fails, then retry after the live meter advances again. Across all retries and restarts, the accounted quantity remains 60, with stable event attribution or explicit unresolved coverage.

### SAR-A3 — P1: Identify the same economic usage across distinct evidence sources

**Specification:** lines 261–291, 307–326, 335–338, 378–409, and 483–495.

**Problem:** The design supports multiple applicable adapters, preserves their separate source identities, and protects against inclusive charge/component double counting. It does not establish how to recognize duplicate measurement of the same consumption through a transcript, response receipt, and administrative usage record. Exact event/source replay deduplication does not cover different source identities. The `includes` example explains a billed request and its components, not which of two observations of the same token usage is the contributing measurement.

**Failure scenario:** A transcript adapter and a response-receipt adapter each report the same request's 1,000 input tokens. Both are exact, both can be valued, and both satisfy their own monotonic/source rules. Summing them doubles consumption and the rate-card estimate. An exclusive billing bucket can also legitimately establish a whole-story actual amount without establishing any individual event or stage allocation; treating exclusive issue ownership as sufficient event correlation invents a stage distribution.

**Repository evidence:** The existing record envelope distinguishes records by record identity, payload, and structural links (`scripts/task-tracker/lib/github-records/record-envelope.mjs:21–34,102–129`); it cannot infer that two different cost-source payloads describe one provider request. The specification itself distinguishes per-response and aggregate adapter semantics at lines 363–368, so this ambiguity is inside the requested multi-source design.

**Minimum required clarification:** Define an economic identity/coverage relation independent of observation-source identity, with contributing versus corroborating evidence and deterministic precedence or explicit conflict handling. The same quantity may contribute once per valuation view. Where overlap cannot be resolved, keep the overlapping evidence non-additive and the affected view incomplete. State that exclusive aggregate billing can establish only the dimensions/boundaries supported by its evidence; event and stage actual-cost views remain unavailable or partial without finer correlation. No allocation by elapsed time is needed.

**Acceptance example:** Ingest one request from two local sources plus a matching exclusive aggregate bill. Consumption and equivalent valuation appear once, the billed amount appears once, and aggregate billing does not manufacture stage-level actual amounts.

### SAR-A4 — P2: Define monetary aggregation across currencies

**Specification:** lines 144–147, 309–321, 483–508, 515–524, and 539–542.

**Problem:** Currency is retained per line and configuration accepts currencies in the plural, but stage/story subtotals, headline selection, and subscription pay-as-you-go comparison do not define a currency rule. Exact decimal arithmetic does not make values in different currencies additive. Two materially different plans fit the document: per-currency totals or a converted reporting currency.

**Failure scenario:** One model contributes USD 1 and one metered runtime contributes EUR 1. Both lines are complete, so a report following the stated completeness rule could display a complete total of 2 or choose an unstated conversion. The same ambiguity affects comparing a subscription's fixed spend to a rate card denominated in another currency.

**Minimum required clarification:** Prefer the smallest v1 contract: aggregate separately by currency and prohibit a single cross-currency scalar or comparison. Alternatively, explicitly authorize conversion with immutable exchange-rate source, effective date, rounding, and provenance, preserving original amounts. This review recommends the first option; an FX subsystem is unnecessary for the requested outcome.

**Acceptance example:** Mixed-currency inputs produce separate labeled subtotals and cannot become a bare scalar headline. Currency-incompatible subscription comparisons remain unavailable unless the chosen policy supplies valid conversion evidence.

### SAR-A5 — P1: Derive completeness from expected coverage, including absent ledger records

**Specification:** lines 52–53, 225–227, 347–350, 479–508, 554–563, and 630–633.

**Problem:** Reporting computes from accepted ledger records and calls a view complete when all required contributors have accepted evidence. The specification does not define the required-contributor set or require comparison with authoritative Timing Log event IDs. Its permitted failure path can leave a valid timing event with only a machine-local intent and no GitHub cost record. Accepted ledger records alone cannot distinguish that missing event from no work at all.

**Failure scenario:** A story has ten keyed Timing Log events. The last two cost appends fail, and a report runs from another checkout with eight complete ledger records. Without checking the timing-event inventory, it can report a complete whole-story subtotal that omits the final work. Likewise, a configured source that never produces a record is invisible unless the expected sources for each event are durably identifiable. Losing the originating machine makes the local outbox unavailable, but must not make missing evidence disappear from the report.

**Repository evidence:** Timing emission and transcript observation are anchored independently in `scripts/task-tracker/runtime.mjs:437–486`. The record store validates individual comment identity, issue/repository correlation, and envelopes (`scripts/task-tracker/lib/github-records/github-comment-store.mjs:135–175`); valid retrieved records do not prove that every expected cost record exists. The specification deliberately keeps the Timing Log authoritative and remote ledger failure non-blocking, so reporting must account for this gap.

**Minimum required clarification:** Define completeness against the keyed Timing Log event inventory, applicable source/dispatch/run coverage, accounting enablement boundary, and unresolved reconciliation/conflict state. Preserve enough durable source expectations to distinguish not applicable from missing evidence. State that a missing event envelope, missing opening/terminal observation, or unresolved source coverage forces the relevant view to remain partial/unavailable even when all present records are individually complete. Default reports may read GitHub lifecycle evidence without calling provider APIs; if the inventory is unavailable, they must say coverage is unverified.

**Acceptance example:** Report from a clean second checkout after timing succeeds and ledger publication fails. The report names the missing event coverage and never claims a complete total. It can become complete only when the missing evidence is resolved or explicitly established as not applicable.

## Areas that are sufficiently specified

- **User economic requirements:** Human labor is excluded; fixed subscription spend stays in its separate ledger and is never allocated into a story. Tool-result input usage and independently billed tool execution are distinct components. Unknown telemetry is not fabricated as zero.
- **Authority and immutability:** Keeping Timing Log lifecycle authority, immutable cost envelopes, a replaceable projection, exact read-back, secret rejection, and append-only corrections is coherent. Findings A1–A3 concern the missing cost-domain semantics above those mechanisms, not a need to replace them.
- **Rate-card economics:** Immutable effective-date/tier/model/region provenance, native quantity retention, exact monetary precision, and explicit separation of estimated equivalent and actual billed cost are appropriate. No provider invoice should be allocated merely to balance a residual.
- **Lifecycle and ownership intent:** Delivery-to-trunk versus housekeeping through Done, stage visits, owning-issue-safe child rollups, explicit external review correlation, and pause handling are clear goals. A1 and A5 identify the missing evidence rules needed to make those goals reliable.
- **Scope and YAGNI:** Both ledgers are explicitly requested. Prospective opt-in rollout, fixture-first work, local adapters before credentialed reconciliation, and separately approved backfill keep the scope manageable. No additional forecasting, labor valuation, or mandatory FX feature is warranted.

## Advisory recommendations

These recommendations do not independently block approval:

1. Name the supported delivery authority variants in the future plan, including v2 records, local-trunk/no-commit paths, and child issues that finish before their epic reaches trunk. Existing `scripts/task-tracker/lib/close-delivery-receipt.mjs:55–98,144–154` shows that not every legitimate Done transition has the same PR receipt. The current specification safely marks a missing authoritative trunk split incomplete; keep that fallback explicit when a split is not applicable or cannot yet be proven.
2. Tie correction lineage and conflict resolution to the existing envelope `predecessor`/`supersedes` semantics rather than inventing a competing record framework. Schema field spellings and helper decomposition can remain implementation-plan choices.
3. Extend the existing end-to-end scenario with the compact failure cases above. Full implementation tests are appropriately deferred to the approved implementation plan.

## Verdict

**Issues Found.** Resolve SAR-A1 through SAR-A5 in the specification before treating it as ready for implementation planning. The minimal changes are accounting and coverage contracts; the selected two-ledger architecture and approved economic scope can remain intact.
