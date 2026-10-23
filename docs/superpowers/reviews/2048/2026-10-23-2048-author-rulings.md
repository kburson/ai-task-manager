# Issue 2048 author rulings and review dispositions

Source candidate: `4fd03020d39a2c0c1bd5a303e99bdfdb6881f585` against
`c0ca120cc8a08d3bc74887daac5ba1f50b436fce`. Independent GPT-6.1 Sol / medium
review had no implementation authorship. The raw contract audit and raw
actual-source review are preserved in full next to this file. This table
records author decisions; it is not a replacement reviewer report or a new
native approval. No product edit follows the accepted static review.

## Implementation decisions

| ID | Explicit ruling and reason | Cost if wrong / retained boundary |
| --- | --- | --- |
| I01 | Preserve the primary frozen-confirmation API and add the historical companion in the same owned module. Current timing bytes are needed in addition to original confirmations; current storage does not archive every older batch. | A new API incompatibility would require revision before future consumers integrate it. No upstream file, schema or workflow route changed. |
| I02 | Match the predecessor's expected rendered-row multiplicities while retaining unrelated pre-record legacy actor rows. Whole-table equality incorrectly rejected supported historical logs. | A stricter rule would reject valid old logs; unrelated legacy rows still cannot acquire a new native receipt. Native receipt-correlated rows and table digest remain required. |

## Contract audit: every requirement and limit

| ID | Audit statement / subject | Author disposition and ruling | Boundary or cost if violated |
| --- | --- | --- | --- |
| C01 | Companion is compatible and justified within the owned module; preserve exact primary API. | Accepted. Keep both validators pure, with original API unchanged. | Any additional workflow activation or upstream change requires separate scope authorization. |
| C02 | Frozen evidence cannot detect later edits without later timing bytes; retain original digest. | Accepted. Companion consumes current published content separately; receipt resource digest stays original. | Substituting today's digest would destroy immutable publication binding or reject legitimate appends. |
| C03 | Exact schema, native executable non-noop transition, ID/from/to/actor/positive visit. | Accepted. Retain exact shape and native transition/actor validation. | Missing correlation could permit the wrong visit to appear complete. |
| C04 | Confirmed prerequisite keys/digests, unique effects, provider identity and candidate bytes. | Accepted. Keep attempted/confirmed and candidate-digest checks, exact effect coverage, typed fields and comment target/provider correlation. | Caller-created declarations alone still cannot authenticate a provider outcome. |
| C05 | Synthetic creation intent must not become provider identity. | Accepted. Actual confirmed provider IDs bind created resources; synthetic keys are not receipt targets. | Confusing intent with provider identity would produce false publication evidence. |
| C06 | All pending events, including ordinary backdated events, belong to the frozen subset. | Accepted without narrowing. The ordinary-event behavioral case retains all three declared IDs and rejects pair-only substitution. | Dropping ordinary pending events would violate #2061's concrete contract and lose evidence. |
| C07 | Full manifest/generation/payloads, supplied-generation equality and published resource identity. | Accepted. Companion validates complete record and uses verified baseSnapshot reference. | A reduced or mismatched record cannot be current published evidence. |
| C08 | Bounded canonical compressed record, IDs/order, native pairs, visible-table digest and row correspondence. | Accepted. Keep decompression/UTF-8 bounds, canonical metadata and rendered native-row validation. | Compressed events alone would miss edited visible rows. I02 preserves unrelated legacy rows only. |
| C09 | Historical IDs/subset digest must survive appends but reject missing, altered or duplicate IDs. | Accepted. Select original IDs from validated current published events and compare canonical subset digest. | Full-comment equality would reject valid appends; no subset check would hide history edits. |
| C10 | Missing native record or receipt stays incomplete; legacy consumers are later work. | Accepted. Do not mint a new receipt from legacy rows or the latest sentinel. | Existing legacy authority must not be silently replaced or asserted complete. |
| C11 | Preserve original confirmations after current generation.batch is replaced. | Accepted. Historical caller supplies old confirmed-effects context separately; current record supplies current timing only. | Deriving old confirmations from the latest batch would invent an unavailable archive. |
| C12 | Pure validator cannot attest caller-fabricated confirmed outcomes. | Accepted and explicit. Trusted input provenance remains the coordinator's obligation; validator checks correlation only. | Treating local shape checks as provider authentication could create false lifecycle authority. |
| C13 | Coordinator ordering, recovery dispatch, publication, reader activation, sentinel persistence and final vector completion declined. | All remain out of this leaf. No implementation or claim is added for any of them. | Each owning integration slice must establish its own actual behavior and native evidence. |
| C14 | Design-direction acceptance is not implementation acceptance; audit read pinned sources only. | Retain original limited verdict verbatim. Actual-source acceptance comes only from the later exact-commit static review. | Collapsing those reviews would overstate what was inspected and when. |

## Actual-source review: strengths and test assessment

| ID | Reviewer statement / subject | Explicit author ruling | Limit retained |
| --- | --- | --- | --- |
| S01 | Exact primary API and transition/actor/visit/effect checks. | Preserve the reviewed implementation unchanged. | Evidence correlation grants no mutation or provider authentication authority. |
| S02 | Actual provider identity, original resource digest, complete pending subset and ordinary backdated events. | Preserve these bindings and tests without narrowing the subset. | Original pending partition is trusted frozen input, not reconstructed by this validator from baseline bytes. |
| S03 | Original context separate from current full store; published baseSnapshot and exact subset. | Preserve separation. No latest-batch substitution or working-view fallback. | Future caller must retain original context. |
| S04 | Bounds, canonical ordering, native pairs, table digest and rendered rows resist rehashed edits. | Preserve all checks and coherent-tampering coverage. | It verifies supplied bytes, not remote freshness or cryptographic authenticity. |
| S05 | No publishing, recovery execution, lifecycle activation or source writes introduced by validators. | Keep this leaf pure and unactivated. Collateral edits no product source. | Later integration cannot inherit unearned execution claims. |
| T01 | Timing fixtures exercise real freeze/persist/confirm and original baseline preservation. | Retain real predecessor fixtures; no reduced timing generation is substituted. | These are offline tests, not live provider publication evidence. |
| T02 | Prerequisite field outcomes are synthetic pure-validator inputs, appropriate here. | Retain transparent synthetic fixtures; do not describe them as actual GitHub confirmations. | Coordinator/provider integration still must prove real outcomes. |
| T03 | Behavioral coverage: append, demotion/reentry, old context, Unknown, checksums, visible rows, coherent edits, reduced/foreign records and views. | Preserve each case and its raw executed results. | Static reviewer read tests but did not execute them. |
| T04 | Provisional-body case proves old receipt survival; null receipt does not prove downstream enforcement. | Accept that precise limit. Claim only the tested local behavior. | Sentinel persistence and lifecycle completion require #2068/later integration. |

## Recommendations and every declined boundary

| ID | Recommendation / declined subject | Explicit author ruling | Owner / consequence |
| --- | --- | --- | --- |
| R01 | Supply confirmedEffects from preserved verified original batch; do not authenticate arbitrary objects or reconstruct pending partition. | Accepted as an integration prerequisite, not waived or treated as an implemented archive. No source repair required by this review. | Future coordinator must preserve provenance and original batch context before calling the API. |
| D01 | Final-body receipt/sentinel persistence and required-effect ordering. | Declined scope remains unimplemented and unclaimed in #2048. | #2068 must establish ordering and final-body authority. |
| D02 | Recovery authorization, provider dispatch and fresh snapshot collection. | No recovery or dispatch code changed. | Adjacent publisher/recovery work owns authority and actual effects. |
| D03 | Reader activation and actual lifecycle completion decisions. | No reader migration or lifecycle activation. | Later integration must distinguish published, provisional and missing proof. |
| D04 | Package inventory adjustment. | Shared file remains read-only. Report measured 978 versus 977 honestly. | Controller-owned integration needs exactly +1 entry allowance and explicit module inclusion assertion, then green verification. |
| D05 | Revalidating historical legacy authority. | Existing legacy consumer semantics remain intact; no new receipt is manufactured. | Existing consumer integration owns genuine legacy provenance. |

## Verdicts, access refusal and evidence limits

| ID | Limit / result | Explicit author ruling |
| --- | --- | --- |
| L01 | Critical none; Important none established within slice; Minor no required changes. | No source fix or deferred minor is invented. Preserve the exact severity-qualified verdict. |
| L02 | Actual source read from permitted committed Git objects in b187 after earlier filesystem refusal. | Honor the refused 5dc6 read. No external copy, permission change or alternate-root retry; committed-object review is a later separate observation. |
| L03 | Static-only source review; reviewer ran no tests, native actions or mutations. | Attribute executed results to the author/controller. Never portray static review as independent test execution. |
| L04 | Reviewer received targeted/lint/format claims from controller rather than observing executions. | Retain that limitation verbatim, alongside raw author logs and actual exit receipts. |
| L05 | Full fast not green due inventory; reviewer slow result unverified. | Preserve original report unchanged. Separate addendum: author slow exit 0/all 57 files was subsequently inspected by controller. Fast remains exit 1. |
| L06 | Acceptable exact source candidate, subject to controller verification/integration; future edits excluded. | Source acceptance is bounded to 4fd03020d and its two recorded hashes. Documentation collateral receives its own review; native Test/final acceptance/CI remain pending. |
| L07 | Pure diagnostic hook/CLI match is not cryptographic or mutation authority; invocation HEAD differs conceptually from loaded guard source. | Preserve original consumed files and actual native origins. Do not label invocation HEAD as a measured guard-module hash. |
| L08 | Optional ledger append after source-turn Pause refused for inactive binding. | Leave it unapplied and do not retry it. This newly admitted collateral is a distinct required documentation task. |
| L09 | All AC/VC/DoD boxes remain unchecked; fresh Explain blocks code-complete and warns finalization pending. | No stamps, ticks, promotion, native Test, Review, approval, Close, Stop, push or integration are attempted for this collateral. |

The tables are exhaustive for the supplied reports. There are no other
implementation-review findings, implicit waivers or deferred minor fixes.
