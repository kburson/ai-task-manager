---
model: gpt-5.6-sol
effort: low
role: artifact-evaluator-and-research-author
turn_ordinal: Retrospective stage-one comparison r1
filepath: docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md
inputs:
  baseline:
    commit_sha: c2e33f4d0ae704900437a0659119bad6eb30dc01
    reviewed_file_sha256: 7066ff40fdfffa399d279f453b3e4ee7dd0e26f96effcc2dff0475b76c2cf783
  A_stage_1_SAR:
    commit_sha: c5cff0e6ce254cb8872d28fd24ecadc932d9b0a0
    reviewed_file_sha256: 5c3907545d5d3b12738b72b85d8afaa0bea5cdd12f4592e418ed2ec17798825b
  B_stage_1_XPR:
    commit_sha: 09551213ec6ee18e90d2d6d39f3fff00e9ade055
    reviewed_file_sha256: 1912963ac7bfa0f7565e3cb1758a0dc27c0695712db1b22612ffb8207ece8c1e
---

<!-- cspell:words implementability -->

# Stage-One Artifact Comparison: SAR-First Versus XPR-First

## Scope and conclusion

This retrospective extension compares the terminal artifact after Arm A's first stage, SAR, with the terminal artifact after Arm B's first stage, XPR. Both began from the same 883-line baseline. “Stage one” means the completed stage result: A includes five SAR passes and four correction cycles; B includes three XPR Reviewer rounds and two correction cycles. It does not mean the first review turn.

**A-stage-1-SAR is the conditional stage-one artifact winner for this architecture's risk profile.** It is materially stronger on recovery, authority bootstrap, approval integrity, local repository effects, migration safety, and adversarial verification. B-stage-1-XPR is stronger on current repository/package consistency, explicit mutation-observability categories, strict-host enforcement, and clarity. A's advantage is substantial but incomplete: later reviewers correctly found important trust, retention, identity, operability, and traceability gaps in it.

This is a retrospective assessment that was not blinded. The evaluator had already analyzed both final artifacts and review histories. The existing eight-dimension rubric was reused, but this extension was requested after the initial study. It cannot estimate a causal SAR-versus-XPR effect. The stage protocols used different numbers of passes, correction cycles, reviewer relationships, contexts, and resource budgets.

## Inputs and marginal change

| Artifact        | Method and terminal condition | Commit                                     | SHA-256                                                            | Lines | Change from baseline |
| --------------- | ----------------------------- | ------------------------------------------ | ------------------------------------------------------------------ | ----: | -------------------: |
| Common baseline | no experimental review        | `c2e33f4d0ae704900437a0659119bad6eb30dc01` | `7066ff40fdfffa399d279f453b3e4ee7dd0e26f96effcc2dff0475b76c2cf783` |   883 |                    — |
| S1-A            | SAR; passes `4, 3, 2, 2, 0`   | `c5cff0e6ce254cb8872d28fd24ecadc932d9b0a0` | `5c3907545d5d3b12738b72b85d8afaa0bea5cdd12f4592e418ed2ec17798825b` | 1,377 |           +494 lines |
| S1-B            | XPR; rounds `7, 1, 0`         | `09551213ec6ee18e90d2d6d39f3fff00e9ade055` | `1912963ac7bfa0f7565e3cb1758a0dc27c0695712db1b22612ffb8207ece8c1e` | 1,118 |           +235 lines |

Line growth describes the edit surface, not quality or effort. S1-A's 11 finding records and S1-B's eight required findings likewise are not comparable defect rates.

## Rubric matrix

| Dimension                                   | S1-A     | S1-B     | Pairwise judgment | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------- | -------- | -------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Requirements correctness and scope fidelity | Strong   | Strong   | S1-A, slight      | Both preserve the baseline architecture and ADR replacement boundary. S1-A additionally binds the local repository as a first-class port and prevents replay against another checkout (S1-A:160-184).                                                                                                                                                                                                                                  |
| Completeness of architecture contracts      | Strong   | Adequate | S1-A              | S1-A defines first-authority bootstrap (637-676), evidence-append recovery (713-742), configuration-change recovery (848-872), approval provenance (874-906), and fenced migration activation (1241-1279). S1-B lacks equivalent full contracts.                                                                                                                                                                                       |
| Internal and repository consistency         | Adequate | Strong   | S1-B              | S1-B names the existing `ProviderAdapter` collision (172-181), ties the design to current `0.1.0` and future public exports (215-232), and provides a concrete stable-release path (989-990). S1-A does not preserve those current-tree specifics.                                                                                                                                                                                     |
| Implementability                            | Strong   | Adequate | S1-A, conditional | S1-A gives implementers concrete identity, recovery, fencing, and failure-test obligations. S1-B is easier to decompose at the package boundary, but it leaves caller retry identity and several recovery protocols to later design. Neither proves default-provider feasibility.                                                                                                                                                      |
| Operational feasibility                     | Adequate | Adequate | S1-B, slight      | S1-A requires enforceable provider-credential and local-Git-write isolation plus startup probes (978-985). S1-B more explicitly defines the sandbox/executor split and attestation lifecycle (840-867). Neither has an operating budget or proves that its non-CAS dispatcher can support the default GitHub path.                                                                                                                     |
| Recovery, trust, and concurrency            | Strong   | Adequate | S1-A, material    | S1-A requires a caller-retained key and durable lookup (776-810), stable effect keys and conservative retry (821-846), approval provenance (874-906), and explicit ownership/fencing (908-943). S1-B has strong observability and non-CAS fencing (746-806), but creates `actionId` inside AITM and returns it only after execution (729-744, 808-817), leaving a lost-response caller unable to bind a retry to the first invocation. |
| Clarity and decision traceability           | Adequate | Strong   | S1-B              | S1-B's four-class mutation-observability table directly explains attribution and retry outcomes (746-773). S1-A is more complete but distributes interdependent rules across bootstrap, append recovery, request identity, configuration recovery, approvals, and fencing.                                                                                                                                                             |
| Testability and acceptance readiness        | Strong   | Adequate | S1-A              | S1-A enumerates adversarial concurrency, lost-response, evidence-append, approval, changed-binding, local Git, and fork cases (1005-1031), plus adapter bootstrap/evidence certification (1046-1064) and migration cutover tests (1098-1104). S1-B has useful conformance and release gates (877-933), but no equivalent coverage of caller identity or evidence-write ambiguity.                                                      |

## Why S1-A wins

The decisive difference is end-to-end identity across uncertain external writes. S1-A requires the caller to retain a `requestKey` before the first attempt, durably maps it to one action and canonical input, rejects conflicting reuse, and supports lookup when the caller never received the action ID (S1-A:776-803). S1-B instead creates `actionId` and its idempotency key inside AITM just before mutation (S1-B:729-731). If a work-item creation succeeds and the transport response is lost, the caller lacks a stable handle with which to distinguish “resume the first attempt” from “create another item.” S1-B correctly refuses blind replay once an unmatched request is found, but it does not say how a fresh caller finds that request.

S1-A also closes two recursive authority problems inherited from the baseline. First, the control stream cannot record a request to create itself. S1-A introduces a bootstrap key, genesis envelope, read-back, concurrent-setup behavior, and lost-response reconciliation (637-676). Second, writing `action.requested` or an outcome is itself an uncertain external write. S1-A assigns a stable event identity, requires exact-envelope verification, and prevents dispatch or repeated business effects while evidence remains ambiguous (713-742). S1-B has stable event IDs in its chain (662-666) and general read-back language, but no equivalent append-primitive recovery protocol.

The authority model is also more complete at important boundaries. S1-A records original bindings and recovery versions so a pending action cannot silently move to a new provider after configuration change (848-872). It distinguishes provider authentication from approval, binds approval to the governed subject, and refuses to treat generic tool permission or a provider credential as human approval (874-906). It assigns local Git to a bundled adapter and binds clone, worktree, refs, and revisions (160-184). S1-B had not yet selected an owner for the repository port.

Finally, S1-A turns these claims into negative tests. Its verification section explicitly attacks stale coordinators, lost responses, conflicting request keys, deleted local state, uncertain evidence appends, changed bindings, forged approvals, cross-clone Git recovery, and incomplete fork joins (1005-1031). This is stronger implementation guidance than a generic requirement for interrupted-write recovery.

## Where S1-B is better

S1-B is better grounded in the current package and naming system. It notices that “provider adapter” already means an AI-vendor abstraction in the repository and plans a compatibility migration rather than a bulk rename (172-181). It states that the current package is `0.1.0`, lacks an adapter SDK export, needs an `exports` map and packed-package consumer test, and will publish ABI 1 with core `1.0.0` only after Phase 5 gates pass (215-232, 981-990). S1-A presents future `^2.0.0`/ABI 2 examples without that concrete release bridge (203-233).

S1-B also gives the stronger direct account of mutation observability. Its four classes distinguish marker attribution, exclusive transitions, state-only satisfaction, and unobservable/conflicting outcomes; it explains why equal provider state cannot prove who caused a change (746-773). S1-A has conservative effect keys and retry rules, but no equally usable taxonomy at this stage.

S1-B is more explicit about the strict-host executor boundary. It names a sandbox/executor split, credential-broker and egress controls, attestation binding and expiry, revalidation, and negative probes, while refusing to call an ordinary desktop with accessible `gh` credentials strict (840-867). S1-A already requires isolation of provider credentials and local Git write access through enforceable filesystem, process, network, and credential controls; it rejects an unrestricted shell sharing writable Git metadata and requires startup probes (978-985). S1-A is stronger about local Git isolation, while S1-B is clearer about executor separation and the attestation lifecycle.

S1-B is also more concise. Its important rules are easier to locate, especially the observability and host-enforcement contracts. This is a practical advantage for architecture review and later planning.

## Residual risks in each stage-one artifact

S1-A's stronger recovery contract should not be mistaken for readiness. Its `requestKey` namespace depends on an “authenticated initiating principal” without defining how CLI or MCP establishes that identity, and its example uses the low-entropy value `analysis-45-01` (784-803, 945-954). Later review correctly required random caller keys and an explicit principal-authentication contract. Its staleness table treats any core/generator difference as stale (587-604), so a compatible patch release can disable mutation. It gives every adapter an `evidence` method and says “each adapter” stores envelopes (235-246, 620-624), leaving canonical evidence ownership ambiguous in mixed-provider configurations. It also lacks full history-retention requirements, a concrete immutable plugin-loading mechanism, quantitative operating budgets, Phase 0 feasibility, and acceptance-to-test traceability.

S1-B's highest-risk residual is the missing caller-retained invocation identity. It also lacks first-container bootstrap recovery, evidence-append recovery, approval subject/provenance rules, general recovery through configuration changes, a selected repository-port implementation, filesystem-plugin portability limits, and a writer-fenced migration cutover. Its error example reports `effects.committed: false` (814-817) without distinguishing the current attempt from an earlier same-intent attempt whose lookup failed. Its extension-promotion rule does not yet state that a promoted extension loses its generic route (378-385), leaving a potential permission fallback.

## Marginal interpretation and limits

Both stage-one methods materially improved the common baseline, but in different directions. SAR-first concentrated on failure closure: identity, bootstrap, append recovery, approval, binding changes, forks, local Git, and cutover. XPR-first concentrated on architecture/repository fit and externally legible contracts: route coverage, ADR coordination, observability, ABI/version realism, strict enforcement, vocabulary, and discovery bounds.

That pattern is useful for designing future experiments, not for claiming a method effect. A-stage-1 included five same-author passes and four repairs; B-stage-1 included three cross-provider Reviewer rounds and two Author repairs. The Author context, Reviewer relationship, elapsed time, and measured usage were unequal. The evaluator is now familiar with every later finding, so hindsight can make omissions easier to recognize. One artifact pair cannot separate method, budget, order, or chance.

The result does show that a terminal stage label is not enough. Both stages ended with a zero-finding/accepted pass, yet each retained material gaps found later. Stage artifacts and exact hashes should therefore accompany review summaries, allowing later evaluation of what a stage actually produced rather than treating consensus as a scalar quality score.

## Stage-one decision

For this governed orchestration architecture, choose S1-A as the stronger stage-one specification, then incorporate S1-B's repository/version, observability, and strict-host details and submit the combined artifact to independent review. If the decision priority were package migration clarity or immediate readability rather than duplicate-effect and authority risk, S1-B could be preferred. Under the architecture's stated safety purpose, S1-A's recovery and trust contracts carry more weight.

This stage-one result reinforces the paper's practical staged-review recommendation but does not prove SAR should always precede XPR. A stronger experiment would equalize pass and repair budgets, randomize order across multiple designs, use fresh controlled contexts, and rely on independent judges who have not seen later artifacts.
