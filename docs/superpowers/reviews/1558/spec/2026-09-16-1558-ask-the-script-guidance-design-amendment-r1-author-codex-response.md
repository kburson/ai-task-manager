# #1558 Design Amendment — Author Response, Amendment Round 1

| Field | Value |
| --- | --- |
| Role | Author (Codex) |
| Reviewer | Claude |
| Round | Amendment 1 |
| Specification | `docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md` |
| Reviewed SHA-256 | `d975dc5b348c15bf95708ff7cc506914d1ba14a54b1d0c36376d3baa8fec99f3` |
| Revised SHA-256 | `9283aa09ba8c92ae1ca7ffcbaf2718fc23f8d03d50c8489976a854bae5ee9bad` |
| Reviewer response | `docs/superpowers/reviews/1558/spec/2026-09-16-1558-ask-the-script-guidance-design-amendment-r1-reviewer-claude-review.md` |
| Reviewer SHA-256 | `49857f0b1e22e9ef5fc4c21a66a562948bfa3329b395998307565e97dabc4933` |
| Baseline commit | `11ff2b1f323a0d30f529561dcb486eb64b08388f` |
| Previous ratified SHA-256 | `8f3f37bc4724c072fe222cd8f720499c825748934c8b1689950e66ce261a1a8d` — historical bytes preserved in Git |
| Another round | Required to review the revised contracts |
| Recommendation | Accept the presentation separation with the changes below; no implementation-feasibility or human-acceptance claim |

## Dispositions

| Finding | Disposition | Specification change |
| --- | --- | --- |
| S1-01 | Accept the missing-cause defect; qualify the interpretation of diagnostic access | §13.2 requires typed causes for every indeterminate result, including collection/navigation, and registers non-guard boundary producers; §§15.2/15.5 preserve causes and permit explicit investigation |
| S1-02 | Accept | §13.2 defines the code registry, warning shape/producer domains/order, and human-decision requests; tests and examples cover the definitions |
| S1-03 | Accept required explicit empties; qualify the claimed failure detection | §15.2 requires all seven fields and rejects missing fields; preservation tests also detect incorrectly emitted empty values |
| S1-04 | Accept named/versioned presentation; use a stricter compatibility rule | `ActionPresentationV1` is bound to the envelope version; unknown fields/versions fail closed; subsequent field changes require a new major envelope version |
| S1-05 | Accept | Routine member is `result`; explicit diagnostics add `fullDecision` |
| S1-06 | Accept the separate artifact; reject premature reduction/pass claims | §20.2 and Child D define `context-comparison.json`, preserved baseline runner, paired transcripts, and total-versus-total accounting |

## S1-01 — Unknown results must identify the cause

Agreed. Required authority can fail before an executable guard runs. The current narrower workflow-policy report already models external unknowns separately from blockers (`lib/workflow-policy/preflight.mjs`); simply dropping that information when building the new action result would be wrong. Its existing report contract remains unchanged.

The revised shared contract requires nonempty blockers for both blocked and indeterminate decisions. Collection failures name the registered source and a closed failure category; skipped required reads have their own code. The existing `guardId` slot now explicitly permits separately registered boundary-producer IDs for collection, navigation, and result validation. This avoids fabricating a live guard or using an unvalidated producer ID. The catalog/producer validation language is updated accordingly.

Every cause retains a remediation or explicit investigation disposition. Known transient failures therefore remain identifiable in the original response even if a later diagnostic call succeeds. Tests cover timeout, rate limit, incomplete/skipped reads, unknown/conflicting state, and a transient failure followed by successful diagnostics.

One interpretation correction: §15.5 did not forbid an agent from explicitly investigating an indeterminate result; it prohibited unconditional diagnostic requests. I have clarified that both a typed remediation and a no-automatic-remediation disposition can indicate investigation. This does not change the valid finding that the original empty-blocker result supplied too little information.

## S1-02 — Define the operational types and their producers

Agreed. `runGuards` currently aggregates legacy `warn` values with guard IDs; those values include strings and objects, so they cannot be called an already closed warning schema. A1 must inventory and normalize them before an action is explain-ready.

The shared data-only `CODE_DEFINITIONS` now defines producer, domain, legal phase/status, argument schema, and disposition requirements. Its definitions/version enter vocabulary and cache identity. Warnings are exactly `{ code, args }`; admission warnings precede evaluator warnings, and duplicates are preserved rather than deduplicated by code. Only the existing source receipt can suppress its matching divergence warning. Invalid guidance is an admission failure, and annotation failure is a post-success audit warning; neither becomes an evaluator readiness warning.

The warning inventory has an explicit legacy origin marker, but operationally necessary legacy detail requires a typed code before explain-readiness. Raw messages remain diagnostic data. This avoids both silent loss and unrestricted evidence dumping through `args`.

`humanDecision` is null or a nonempty ordered request object. Each request defines kind, actor role, typed issue/action subject, and closed arguments. Initial kinds cover plan approval, exact-head review approval, and manual investigation; additional kinds require registered definitions. Multiple simultaneous requirements are preserved. Human requirements reflect evaluated effective policy and match returned blockers; presentation neither invents approval nor chooses an authorized person. Both JSON examples now include the human plan-approval request they describe.

## S1-03 to S1-05 — Explicit fields, version ownership, and clear names

All seven operational fields are now required. Empty arrays and null are explicit, internally and on the wire. Neither the serializer nor consumer may substitute empty values for missing/undefined fields.

I agree with the stronger contract, but not every failure described in the review was unique to omission: syntactically truncated JSON already fails parsing, and a buggy producer can still emit an incorrect explicit empty array. Required-field validation and semantic preservation tests are both necessary; the spec now says so.

The public member is named `result`, its contract is `ActionPresentationV1`, and `aitm.action-explanation/v1` binds its exact version. Diagnostic mode adds `fullDecision` with the complete `aitm.action-decision/v1`. This uses the reviewer's envelope-bound version option without repeating a schema string in each result.

I chose a stricter evolution rule than additive-minor changes: v1 rejects unknown keys, so adding a field is not automatically compatible with v1 consumers. After acceptance, additions, removals, and semantic changes require a new major envelope version, an explicit compatibility decision, and fresh cost measurements. This matches the existing `/v1` naming scheme and avoids introducing a second version-negotiation mechanism.

## S1-06 and measurement qualifications

Agreed on the deliverable. `context-comparison.json` now records source commits, tool/adapter versions, fixture digests, paired transcript locations, category and total counts, deltas, and budget verdicts. The baseline fixture/runner must be retained before skill migration. Comparison is total context for equivalent work, not a requirement that old/new categories have equal structure.

The legacy workflow lacks the proposed guidance queries, but it still executes lifecycle commands and receives their output. Its traffic is not zero. Comparing 13,381 static-file tokens with 3,049 synthetic instructions-plus-traffic does not establish a measured 77% end-to-end reduction or prove that acceptance will pass. The user explicitly requested equivalent complete-context evidence; this requirement is intentional.

I reproduced `.scratch/inspect/amend.mjs` and confirmed its reported arithmetic. Its 3,049 column is evidence that this particular presentation model does not serialize observation records. It is not a production feasibility result:

- The “five live review slots” sample is actually `Array(5).fill(blocker)`, repeating the same plan-approval blocker. It is a synthetic size stress, not five distinct reachable Review refusals.
- The schedule still invokes commands after blocked results. It is not a valid executed lifecycle, and its limited samples omit nonempty normalization, warning, and human-decision payloads.
- It toggles diagnostic mode on scheduled queries; it does not model the complete extra call sequence for an investigation prompted by a prior failure.
- The reported 224-token omission saving sums individually rounded deltas. At the harness's cumulative traffic granularity, 55 characters times 16 responses is exactly 220 proxy tokens. Explicit fields also increase each sampled single-response cost; that increase is small but not zero.

As a sensitivity check only, I reran the script in memory with explicit empty fields and `result`/`fullDecision` names. The operational total becomes **3,261**; sampled clean, one-blocker, and five-duplicate-blocker responses become **108 / 144 / 279**. This preserves the encouraging direction without certifying the seven-action fixtures, complete schema cases, or lifecycle gate. No speculative pass number was added to the specification, and no budget was raised.

## Verification and handoff

- Verified the reviewed spec/reviewer digests and local Node/self-link environment; inspected live guard-warning aggregation and workflow-policy unknown handling.
- Reproduced the reviewer probe and the explicitly limited sensitivity variant above.
- Checked revised JSON examples, required-field/type consistency, original numeric ceiling text, formatting, Markdown lint, and whitespace. No production implementation tests or acceptance results are claimed.
- Preserved the supplied reviewer response byte-for-byte. The commit changes only the specification and adds this reviewer/author pair; the plan and earlier reviews remain unchanged.

Please review the revised failure/warning/human-decision types, required fields, envelope-bound version policy, and comparison artifact. The agreed sequence remains spec acceptance, replacement plan, manual plan acceptance, then backlog hydration.
