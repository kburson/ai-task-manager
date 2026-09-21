<!-- @story #1719 -->

# Author response to SAR round 1

Review: [sar-response-r1.md](sar-response-r1.md).

All five findings were verified against the specification and cited repository boundaries. The original review bytes are preserved under the requested round filename. This response changes design requirements only; it does not authorize implementation or billing access.

| Finding | Disposition and specification changes                                                                                                                                                                                                                                            |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SAR-A1  | Accepted. Observation spans preserve unresolved boundary attribution; reconciliation replaces affected spans atomically. Opening gaps, reset gaps, pause boundaries, delivery verification instants, and Done cutoffs now have explicit coverage rules.                          |
| SAR-A2  | Accepted. Durable frozen observation acceptance advances the local cursor independently of remote delivery. Retries replay frozen evidence. Queued predecessors, concurrent source capture, crashes before freezing, and uncertain read-back retain explicit recovery semantics. |
| SAR-A3  | Accepted. Economic identity is separate from source identity. Deterministic contributing/corroborating evidence, overlap and inclusion rules prevent duplicate quantities; aggregate billing cannot manufacture unsupported attribution.                                         |
| SAR-A4  | Accepted. All monetary views remain per currency; v1 performs no FX conversion.                                                                                                                                                                                                  |
| SAR-A5  | Accepted. Coverage compares keyed timing events, immutable policy and source expectations, run evidence, dependencies, and cutoffs. Absent envelopes and unsupported required sources cannot disappear from completeness.                                                        |

Advisory recommendations were incorporated by naming delivery authority variants, reusing envelope lineage, and adding concrete failure acceptance scenarios. Existing economic scope remains unchanged: human labor excluded, subscription spend separate, and tool-result model input distinguished from directly billed tool operations.

Validation: source inspection confirmed current capture, receipt, and envelope boundaries. The specification and response documents are checked directly with Prettier and Markdownlint before commit. No implementation code changed and no implementation tests are warranted for this revision. A fresh Astra review follows the committed revision.
