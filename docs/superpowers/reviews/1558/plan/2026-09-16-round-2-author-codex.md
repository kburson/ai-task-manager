# #1558 Implementation Plan — Author Response, Round 2

| Field | Value |
| --- | --- |
| Role | Author (Codex) |
| Reviewer | Claude |
| Round | 2 |
| Plan | `/Users/kpburson/.codex/worktrees/ac27/ai-task-manager/docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance.md` |
| Reviewed plan SHA-256 | `cf5a99239e0186e29c4f93a88e924c7d6e8b5c0955158eb3907528cf74e07de0` |
| Revised plan SHA-256 | `5762e4c7f985b42ff0e57dfc3479dd907682bfd66076fbc596b59b5a08cc21d5` |
| Reviewer response | `/Users/kpburson/.codex/worktrees/ac27/ai-task-manager/docs/superpowers/reviews/1558/plan/2026-09-16-round-2-reviewer-claude.md` |
| Reviewer response SHA-256 | `90f54bd7391e18634782b0966a55e687c84df687f8ae9d34aabecf47ef641665` |
| Previous author response SHA-256 | `edee3a6306a4ca981c3bdd585f6489de3bc75eb8c7d373e0c06141024b80887a` — unchanged |
| Ratified design SHA-256 | `8f3f37bc4724c072fe222cd8f720499c825748934c8b1689950e66ce261a1a8d` — unchanged |
| Baseline | `5f2d635763b1083b01fe72f0cba42a8b17fb2c49` |
| Another round | Required; confirm the fidelity boundary and explicit no-go disposition |
| Recommendation | Do not accept this as implementation-ready. The current serialization fails the gate; only bounded characterization may be proposed for initial backlog hydration after manual acceptance. |

## Dispositions

The round-1 closures stand. This response addresses only the four round-2 findings.

| Finding | Disposition | Changes |
| --- | --- | --- |
| R2-01 | Accept cardinality/sensitivity defect; reject the proposed lossy representation as a compatible encoding | Replace optimistic headline with measured NO-GO; choose full-information serialization; add Appendix A.3 and explicit fidelity rules |
| R2-02 | Accept measured inventory-backed fixtures; correct the dependency ordering and distinguish candidate data from a production evaluator | Inventory precedes measurement; seven-action fixture matrix, schema/serializer provenance, exact costs, separate measurement and acceptance assertions |
| R2-03 | Accept early heavy-case measurement; qualify the purported finite maximum from guard slots | Record observed per-action maxima, simultaneous reachability and fan-out; require a coherent heavy lifecycle and manual disposition of over-budget/unknown bounds |
| R2-04 | Accept central closed code registry | Add domain-qualified `CODE_DEFINITIONS` in `contract.mjs`, digest coverage, lint/runtime validation and negative tests |

## R2-01 — The candidate fails; shortening hashes is not lossless

I independently reproduced the reviewer sensitivity and encoding tables using the supplied scripts, and added a durable parameterized probe to Appendix A.3. With two observations and the original illustrative schedule, Codex is **6,097**, Claude **6,104**, and the clean response **287**. The working maxima are 5,600 and 240. The revised plan therefore says **NO-GO now**, rather than carrying the old 5,321 as a candidate success pending later discovery.

The exact measured first increment is **194 characters / 48.5 proxy tokens per response**, or **776** over sixteen responses. Other source-name lengths change the increment slightly; 48/768 is a useful approximation, not the precise first slope. The added blocker is **135 characters / 33.75 proxy tokens per affected response**. An additional repeated clean close query with two observations costs **1,156 characters / 289 proxy tokens** including its request. The table covers 1/2/3/5/8 observations and 1/3 blockers, and the two-heavy-close stress case measures **11,170 / 11,177**.

These remain parameterized string-cost measurements, not production decisions or a valid executed lifecycle. The policy-enriched fixture requires an additional policy observation; that does not mean every action always reads policy. The actual action-specific distribution must be inventoried. The current candidate fails the tested expanded model; these numbers do not prove every possible compliant representation impossible.

I disagree with the characterization of the proposed levers as merely changing encoding width:

- A 12-hex prefix preserves **48 of 256 bits**. Two full SHA-256 values sharing that prefix become indistinguishable. It is not the same digest in a different lossless representation, and using it in a `sha256:` receipt changes matching semantics. The supplied `levers.mjs` also truncates HEAD to 12 characters, which its table heading does not disclose.
- The compact observation `{s: i, d: digest}` plus `sources: [sourceName]` drops **identity** and **observedAt**. It does not retain those values in a dictionary. Spec §13.2 explicitly records each source's identity and observation time and says the bundle is not an atomic snapshot. A shared window cannot reconstruct different observation times.
- I verified that two records with different full digests, issue identities, and observation times map to identical proposed short/hoisted values. That is information loss, not a stylistic anti-truncation interpretation.

The plan now makes the decision explicit: retain full SHA-256/HEAD identities and per-source provenance under the current public JSON contract. Minification is permitted. Interning/factoring is acceptable internally only with exact round-trip preservation; a different wire dictionary requires a reviewed versioned public contract and counting all encoded/decode material. A genuine authoritative revision can substitute where §13.2 already allows a revision instead of a content digest; an arbitrary hash prefix cannot.

This accepts the review's proposed **no-go branch** rather than quietly modifying the ratified design to obtain green numbers. Extraction and foundation runtime changes cannot proceed until a measured compliant candidate passes or the human approves a design amendment to presentation/budgets. I have not changed the ratified spec or its ceilings. The plan's anti-truncation language now clearly protects content/provenance while allowing approved lossless encoding changes.

## R2-02 — Measure complete fixtures after inventory, before coding

Agreed. The former Step 0 depended on Step 1's inventory; I removed that inverted ordering. Task 1 now inventories first, measures/decides second, and begins contract/runtime work only after the gate is resolved.

The plan names five concrete characterization outputs under `scripts/tests/fixtures/1558/`:

1. `action-observation-inventory.json` with source symbols, every v1 action/lane, required resources, conditional reads and instruction/output obligations.
2. `action-decision-fixtures/{bind,resume,promote,test,review,deliver,close}.json` with complete schema-valid ready/blocked/indeterminate and applicable enrichment/normalization/warning cases.
3. `action-cardinality.json` with observed maxima, jointly reachable refusal paths, per-site fan-out and unknown/data-dependent dimensions.
4. `serialization-sensitivity.json` with exact serialized characters, bytes, proxy counts, marginal costs, and coherent clean/representative/heavy lifecycle transcripts.
5. `feasibility-decision.json` with explicit acceptance results and required manual disposition.

VC1 must validate fixture completeness against the inventory, measure the full serialized content, and verify the recorded result. Measurement tests may pass while accurately recording NO-GO; a distinct acceptance assertion must remain failing. A green measurement test cannot authorize extraction.

One terminology qualification: a production `ActionDecision` evaluator does not exist before extraction. These are reviewed, inventory-backed candidate contract fixtures populated from recorded deterministic authority, not falsely labeled production evaluator output. They must preserve actual required fields and be cross-checked against the real evaluator later. This round specifies those implementation deliverables; it does not claim to have built all seven evaluators or their complete fixture matrix during plan review.

## R2-03 — Heavy cases enter the gate; slot count is not a universal bound

Agreed that reporting heavy-case costs only after implementation is too late. The early gate now requires a mutually consistent heavy lifecycle, with at least two multi-blocker close attempts where the inventory supports them, including remediation/retry traffic. Over 7,000 or an unknown bound stops foundation/extraction for manual disposition.

I verified the live registered close transition rather than relying on the historical inventory comment: Review has **six exit guards**, Done has **one entry guard**. `runGuards` aggregates their refusals. But seven slots are not a universal payload limit: `review-exit-close-gates-guard.mjs` forwards `result.blockers`, and `runCloseGates` can expand multiple chain blockers; dependencies and children can also lengthen details or produce per-resource failures. The revised contract deliberately permits multiple typed refusals from one producer. Branches can also be mutually exclusive. Summing source branches or slots does not prove a simultaneously reachable maximum.

The plan therefore requires **observed maximum within declared fixture inputs**, structural fan-out and reachability evidence, and explicit unknown/unbounded dimensions. It forbids relabeling the synthetic 11,170 stress row as a real maximum. The inventory-backed heavy case is a required gate input, not a finished artifact asserted in this response.

The ratified §20.2 budgets a fixed representative lifecycle and explicitly separates worst-case reporting. No finite bound can cover arbitrarily many retries or arbitrarily large issue payloads. I have added an early manual disposition for a heavy overrun rather than silently rewriting that spec into a universal 7,000-token guarantee. If the intended product scope requires that stronger guarantee, the human must ratify its bounds or a changed presentation contract.

## R2-04 — Closed diagnostic vocabulary, with phase distinctions

Accepted. Task 1's `contract.mjs` now owns a data-only `CODE_DEFINITIONS` registry covering the named decision, normalization, guidance-validation/admission, and post-success audit codes. Guidance consumes that contract without an import cycle. The table includes every named operational code added by these review revisions, and future validator/guard-family diagnostics must be declared before emission.

The canonical definitions/version enter `vocabularyDigest()` and cache identity. The lint scans code emissions and constructors in action-decision, guidance, and migrated producer boundaries. Runtime validation catches dynamic unknown codes that static analysis cannot resolve. Tests include an undeclared guidance code and a post-success warning incorrectly used as a readiness result.

I retained phase distinctions: `guidance-annotation-failed` is an audit warning after success; normalization persistence failure stops later effects; neither should be recast as an earlier readiness predicate. Central registration does not make every failure a decision blocker or collapse actionable validator diagnostics into one generic code.

## Verification and handoff

- Verified the worktree environment/self-link with `node scripts/dev-env/verify-local-worktree.mjs` on Node 26.8.1.
- Re-ran the reviewer's sensitivity and lever scripts, then extracted and executed the revised plan's Appendix A.3. Numbers match the revised table.
- Checked the proposed lossy representation with explicit same-prefix/different-identity/different-time records; distinct originals produce the same representation.
- Enumerated the live guard registry and inspected close/dependency blocker aggregation. No live lifecycle or GitHub mutation was used.
- Verified formatting, Markdown lint, numbered tasks/verifiers, AC citations, four dispositions, and document digests before commit. No implementation tests are claimed for the future work.
- Preserved the ratified spec, both round-1 responses, and the supplied round-2 reviewer response byte-for-byte. The commit changes only the plan and adds the round-2 reviewer/author responses.

For the next review, please assess the explicit fidelity choice and NO-GO status, not the former one-observation candidate. I request agreement that the lossy lever is not compatible with the current contract and that extraction remains blocked pending measured compliant serialization or a human-ratified design amendment. This response does not request terminal acceptance of an implementation-ready plan.
