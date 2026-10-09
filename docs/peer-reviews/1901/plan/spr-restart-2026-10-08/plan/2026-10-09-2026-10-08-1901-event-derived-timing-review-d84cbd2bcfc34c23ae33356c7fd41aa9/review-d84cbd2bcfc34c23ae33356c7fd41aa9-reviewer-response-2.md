<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-d84cbd2bcfc34c23ae33356c7fd41aa9"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md"
artifact_commit: "e2e8f684208d2a2503c01dec30a689b63592dbd3"
artifact_blob: "88e1dd3bad7af02b5d549b0d813375dab5535b09"
artifact_digest: "sha256:036a45e3c032ec88f80eb89045b287915353873802807a58c9c8207b4d92f8aa"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "gpt-6-astra"
  session_fingerprint: "sha256:19685058e4c340cdc0bdd0c9d96ee9ce7088fdd6bc6aa0d4d2eff767a83173b4"
  identity_source: "runtime"
started_at: "2026-10-09T01:32:08.926Z"
submitted_at: "2026-10-09T01:52:05.662Z"
finding_ids: ["R2-F001","R2-F002","R2-F003"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Decision: revisions-requested. The original findings have been addressed at their original scope, including the optional publication-outcome concern. The newly authorized joint-effort amendment is legitimate and substantially improves the plan's clarity. It introduces three contracts that still need tightening before implementation: what establishes an actual ownership transfer, how real context/word measurements are acquired and projected, and which evidence qualifies as the first SessionTime opener when explicit opener rows are missing.

I independently read the complete amended 506-line plan, the exact sealed author-response-1 identified by the author-revision-committed event, and the prior sealed reviewer-response-1. The historical accepted specification remains the previously reviewed 317-line document; its SHA-256 is unchanged at 6e6e0aae4f1764850701f4f0be0b4593dfde8f1b84e968652b6cdf7b7bcd958f. The revised plan's SHA-256 is 036a45e3c032ec88f80eb89045b287915353873802807a58c9c8207b4d92f8aa, matching this round's sealed artifact. I also read the live issue's VC definitions and the linked user-clarification comment through read-only GitHub operations.

Source checks revisited the binding/actor filtering, native word counting and transcript normalization, journal validation/checkpoint behavior, and outcome completeness selection. Prior source evidence for the board, ladder and lexical/actor adapters remains applicable. No Git commands, implementation edits, historical writes, fabricated identity variables or bypass flags were used. Proposed tests were not reported as executed. This is a plan/specification-amendment review, not implementation verification.

### Assessment of the directly authorized normative amendment

The user-authorized clarification supports one joint task clock, one active agent per task, identity as ownership/provenance, actual recorded handoffs, measured session context/words and independent recorded SessionTime. The plan explicitly identifies that change, uses the distinct joint-event-delta/v1 model, preserves the historical specification bytes and acceptance as historical evidence, and requires fresh SPR/XPR acceptance. I accept that precedence and do not require reverting to additive actor effort.

The architectural choices are coherent: one disjoint task-time allocation can retain actor provenance; historical competing ownership can make affected effort unknown without corrupting an independently bounded wall span; Plan/Review remain subsets; participant exclusion and bounded convergence avoid pretending a new distributed lease exists. Operationally enforcing one supported agent per task is consistent with the amendment's stated scope. The findings below concern the evidence and calculation contracts needed to implement those choices, not the legitimacy of the user's model change.

### Disposition of all preceding findings

| Prior finding | Disposition | Evidence and remaining scope |
| --- | --- | --- |
| R1-F001 | Addressed at original scope | The plan now acknowledges the actual Active-to-Session baseline alias, introduces projectSessionWallSpan, defines recorded endpoints/no-clock-tail behavior and assigns board/heal mappings to Tasks 5/7. The former suggestion to retain summed actor effort is superseded by direct user authority. R2-F003 concerns a newly explicit endpoint-selection edge case, not a request to restore additive effort. |
| R1-F002 | Addressed | The adapter matrix and Tasks 2/4/5 name timing-actor, lexical legacy-only stage reading, the new policy reader, ladder metadata retention, actual estimation-runtime selection, producer/wrapper/drain ownership and focused tests. Keeping the lexical leaf independent of the engine is implementable. New handoff/measurement requirements need the additional contracts below. |
| R1-F003 | Addressed | Task 1 owns all three historical captures, their manifest and real-history verifier. Tasks 6/8 consume them. The root table ties AC1–AC6 to vc:10–vc:17 via each task's exact first focused command and retains existing groups. Read-only issue inspection confirmed the existing vc:1–vc:9 baseline/aggregate definitions. Materializing the new VC bodies before hydration remains an author/executor obligation, not a completed result. |
| R1-F004 | Addressed | PublicationResult distinguishes remote, durable queue, pending and refused outcomes. Task 4 explicitly covers actual wrapper/drain behavior, resolved non-success, queue persistence failure, checkpoint banking and terminal remote evidence. |

## Findings

### R2-F001 — Define the evidence that distinguishes an authorized handoff from a competing bind

Severity: high. Required.

Locations: normative amendment lines 60–61; shared handoff shape at line 82; Task 3 ownership check; Task 4 handoff-production bullet at line 315.

The plan requires a genuine handoff chain and refuses competing owners, but defines the handoff primarily as predecessor/successor identities, source references, endpoints and availability. It does not identify the recorded action that releases/transfers the predecessor's ownership, who may attest each side, or the validity/commit rule that turns those fields into a completed transfer. An existing binding proves session identity, not that its predecessor handed over.

Concrete ambiguity: A publishes a neutral update at tick 10 and remains engaged. B binds at tick 10, can read A's actor/source ID and endpoint, and supplies its own real identity. Those facts are available both for an intentional A-to-B handoff and for an unsupported competing B bind while A continues. The proposed fields and phrase sanctioned bind/recovery observations do not distinguish them. Accepting the first interpretation can counterfeit transfer; refusing both prevents the amendment's required uninterrupted handoff. Treating A's update as departure would also violate the retained event semantics.

The current source confirms this is a new contract: lib/bind-event.mjs::timingBodyForActor filters history to the selected actor; verbs/resume.mjs reads that filtered history and builds start/resumed rows. Neither a fresh actor start nor readable predecessor history is presently a joint ownership-transfer receipt. The existing actor flush journal durably represents one actor's row/checkpoint; its successful publication is not itself a release of task ownership.

Required change: specify an immutable transfer identity and the exact admissible evidence/action for outgoing release or transfer plus incoming acceptance, or a comparably explicit authorized transfer receipt. Define which participant produces each observation, when the joint owner changes, and how that attestation is carried in the existing event vocabulary/metadata without fabricating an end or a pause. Name the durable preparation/publication/checkpoint sequence and idempotent recovery for a missing or delayed half. Distinguish missing predecessor end (unknown historical extent) from an authorized successor takeover (future ownership), so recovery does not either invent past work or permanently prevent future work. This does not require a distributed lease redesign.

Assign that contract to Tasks 1–4 before wave 1 fixes source decoding and wave 2 admission. Test intentional same-tick transfer versus a competing bind with identical ordinary timing rows, predecessor crash without observed end, lost response after transfer admission, replay after successor work, and an old owner's delayed pre-transfer event versus genuinely post-transfer execution.

### R2-F002 — Specify the measurement source, arithmetic and visible output for the new handoff metrics

Severity: medium. Required.

Locations: normative amendment line 66; measurement shape at line 82; Task 4 measurement bullet; Task 5 projection responsibilities.

The amendment promises actual per-session context size and words plus joint task totals using offsets, but the shared contract contains only contextTokens, cursors, baselineRefs and availability. It does not define the provider measurement source/method, observation boundary, whether contextTokens is a current-context gauge or cumulative quantity, the joint word-offset formula, or the timing-history surface that displays the new measurements. No task assigns a concrete context-measurement adapter or a named measurement projection with output fields. Task 5's existing detailed steps remain duration/scalar/outcome work.

This cannot be supplied by the named existing word input alone. scripts/task-tracker/word-counter.mjs:287–365 returns count, fullExpansion, totalLines, status and diagnosticCode. scripts/providers/transcript-normalizer.mjs normalizes transcript text/tool events, not a measured current-context gauge. measure-guidance-context.mjs tokenizes explicitly supplied guidance streams and labels that calibration's scope; it is not proof of native session context size. A model's context capacity, cumulative input-token traffic and current context used are different measurements, as the amendment itself recognizes.

Concrete arithmetic left open: A has a measured 1,000-word cursor; B begins with an actually measured 600-word imported baseline, then reaches 650. State the raw values that remain visible and whether each named joint counter adds 50, 650, or reports separate imported/new quantities. Replaying B's admission must add nothing. A context shrink/compaction or missing baseline must have defined semantics, not be treated as a negative cumulative delta or inferred from words.

Required change: define the measured quantities separately, their units and observation/provenance fields, the supported native evidence adapter(s), and explicit unavailable behavior for unsupported/absent evidence. Provide exact offset/reset/replay arithmetic and availability propagation for each joint word counter; define context as a per-session observation unless a separate justified aggregate is intended. Name the rendered or inspectable timing-history output and the production owners/tests that prove the values are actually visible. Specify which session-reference representation is public versus local so existing opaque actor identity and native binding provenance remain intact. Do not infer context size from traffic, word count or capacity, and do not expand into a runtime-storage migration.

This is a completion requirement for the newly authorized measurement scope. Preserving raw cursors and listing measurement scenarios is valuable, but does not yet tell independent Tasks 2/4/5 what compatible values to encode, produce and display.

### R2-F003 — Reconcile SessionTime's first opener with retained engagement-endpoint recovery

Severity: medium. Required.

Locations: projectSessionWallSpan at amendment line 64 and Task 5; retained historical specification, Accounting rules / Precision and ownership; Task 1 endpoint reconciliation.

The new wall-span formula selects the first valid recorded engagement opener. The retained accepted rule separately permits an engagement start/end marker to establish a bounded slice when its explicit opener row is absent. The plan does not say whether such a marker's start is an eligible SessionTime opener or whether an earlier opener-less portion makes the whole-log start unavailable. Selecting the first later start/resumed row can understate a supposedly complete wall span.

Concrete valid single-owner history: the first surviving row is pause at tick 10 with genuine engagement endpoints [0,10]; resume is recorded at tick 20; a later pause at tick 30 has genuine endpoints [20,30]. Endpoint fallback and the pause/resume bracket recover Active=20 and Idle=10 without invented observations. If the wall-span reader treats resume20 as the first explicit opener, it reports Session=10 although the observed task window is at least 30 seconds, violating the newly required complete Active+Idle<=Session invariant. Missing the initial opener row does not erase the earlier bounded evidence.

Required change: define opener eligibility and earliest-history coverage explicitly. Either accept the genuine recorded engagement-start endpoint as wall-start evidence with provenance, or keep whole-log SessionTime unavailable when an earlier source establishes work before the first explicit opener; do not label the later-opener span a complete whole-log value. Distinguish a lower bound from a complete wall span. Add the above sequence, a log containing only bounded endpoint rows, a legacy prefix before the first attributed start, and a protected/mixed prefix to Tasks 1/5 tests. Apply the selected rule to enabled board and maintenance projections without rewriting source history.

## Required changes

1. Resolve R2-F001 with an explicit handoff evidence/authority and durable transition contract, distinct from ordinary binding and from departure.
2. Resolve R2-F002 with concrete measurement sources, quantities, offset formulas, provenance, visible outputs and task ownership.
3. Resolve R2-F003 with precise SessionTime opener/coverage rules and endpoint-only regression cases.

The prior round's repairs should remain intact. Retain the single joint clock, historical sealed semantics, actual observations, independent SessionTime, immutable source identity and queue/publication safety. If these refinements change the shared interface or workload, update the task dependencies and estimate before hydration. No historical apply, production activation or implementation is authorized by this decision.

## Optional suggestions

None beyond the required refinements above.

## Decision

revisions-requested
