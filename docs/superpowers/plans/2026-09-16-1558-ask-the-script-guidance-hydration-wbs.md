# #1558 Ask-the-Script Guidance Hydration WBS

> **Review status:** Proposed pre-hydration decomposition. External review is required before this file can become hydration authority. This record does not authorize implementation or change any GitHub issue.

## Authority and purpose

- **Parent issue:** `#1558`
- **Accepted-plan candidate:** `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-replacement.md`
- **Source-plan commit:** `a168753999617066d98bbc1227c4b5d97fa531c5`
- **Source-plan SHA-256:** `9300f7f8730110e41d8ff2e0022f2d85d893e2f32549e0f9ddbe8f672b8ba635`
- **Governing sizing rule:** Review at 16 hours or three implementation tasks. Split at 24 hours or four implementation tasks. Unknown estimates block hydration.
- **Backlog-field boundary:** The estimates below are decomposition estimates only. Hydrated Backlog issues retain unset Size and Estimate fields until the normal Refine and Plan workflow.

This record resolves the replacement plan's mandatory pre-hydration sizing gate. It estimates Task 1a's inventory/flag-analysis and harness-plus-baseline halves separately and together, estimates Task 1b, scrutinizes Tasks 4, 8, 10, and 12, and pins every required split. All estimates describe necessary mid-level-engineer work, including focused tests and task-local verification but excluding queue time and later lifecycle review.

## Sizing decision

| Source scope                        | Hours | Implementation tasks | Uncertainty | Proposed owner                                     | Threshold decision                                                                                           |
| ----------------------------------- | ----: | -------------------: | ----------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Task 1a inventory and flag analysis |    12 |                    2 | Medium      | Characterization inventory child                   | Atomic; below mandatory split threshold                                                                      |
| Task 1a harness plus baseline       |    44 |                    8 | High        | Three sequential characterization harness children | Mandatory split; this half independently exceeds both split triggers                                         |
| Combined Task 1a                    |    56 |                   10 | High        | Four sequential characterization children          | Mandatory split; no combined Task 1a issue may be hydrated                                                   |
| Combined Task 1b                    |    52 |                    9 | High        | Four sequential candidate-certification children   | Mandatory split; the final child remains the sole feasibility-decision owner                                 |
| Task 4                              |    20 |                    3 | High        | One evaluator-extraction child                     | Explicit size review required; retain as one atomic child because neither mandatory split trigger is reached |
| Task 8                              |    16 |                    3 | Medium-high | One Review-readiness child                         | Explicit size review required; retain as one atomic child                                                    |
| Task 10                             |    20 |                    3 | High        | One close-parity child                             | Explicit size review required; retain as one atomic child because neither mandatory split trigger is reached |
| Task 12                             |    40 |                    6 | High        | Two sequential guidance-admission children         | Mandatory split into the two boundaries already named by the accepted plan                                   |

The result is **25 native child issues**: four Task 1a children, four Task 1b children, Tasks 2-11, two Task 12 children, and Tasks 13-17. The split adds seven children to the replacement plan's original 18 proposed identities.

## Characterization decomposition

### Task 1a-i: Inventory lifecycle sources, effects, refusals, and behavioral flags

- **Estimate:** 12 hours; 2 implementation tasks; medium uncertainty.
- **Owner:** Characterization inventory child.
- **Source-plan-section:** `### Task 1a: Inventory source/effects/flags and freeze the legacy workflow baseline`
- **Scope:** Produce and fingerprint the action-observation, authority, refusal, warning, human-request, effect, and behavioral-flag inventories. Classify every relevant production flag and transport site before a process harness is accepted.
- **Excludes:** Process interception, authority fixture execution, transcript capture, candidate serialization, and runtime changes.
- **Verifier identity:** VC1.
- **Blocks:** Task 1a-ii-a and Task 1a-ii-b.

### Task 1a-ii-a: Build and prove whole-process transport interception

- **Estimate:** 16 hours; 3 implementation tasks; high uncertainty.
- **Owner:** Process-harness child.
- **Source-plan-section:** `### Task 1a: Inventory source/effects/flags and freeze the legacy workflow baseline`
- **Scope:** Implement the test-only launcher, preload, callback interception, custom-promisify replacement, nested-child propagation, direct-network denial, and positive transport-ledger regressions. Prove the supported Node floor and development runtime without changing production predicates.
- **Excludes:** Scenario authority modeling, final baseline capture, candidate modeling, and production bypasses.
- **Verifier identity:** VC1.
- **Depends on:** Task 1a-i.
- **Blocks:** Task 1a-ii-c.

### Task 1a-ii-b: Model coherent authority fixtures and lifecycle scenarios

- **Estimate:** 16 hours; 3 implementation tasks; high uncertainty.
- **Owner:** Authority-fixture child.
- **Source-plan-section:** `### Task 1a: Inventory source/effects/flags and freeze the legacy workflow baseline`
- **Scope:** Build the isolated repository, deterministic issue/board/approval/PR/provider store, expected request identities, success/refusal lanes, and coverage reconciliation used by the unchanged CLI. Every simulated remote effect occurs only after the production command reaches the intercepted transport.
- **Excludes:** Interception implementation, final transcript freezing, candidate serialization, and runtime changes.
- **Verifier identity:** VC1.
- **Depends on:** Task 1a-i.
- **Blocks:** Task 1a-ii-c.

### Task 1a-ii-c: Capture and freeze both legacy adapter baselines

- **Estimate:** 12 hours; 2 implementation tasks; medium-high uncertainty.
- **Owner:** Baseline-capture child.
- **Source-plan-section:** `### Task 1a: Inventory source/effects/flags and freeze the legacy workflow baseline`
- **Scope:** Run the coherent lifecycle through the unchanged pinned CLI for both adapters; freeze loaded bytes, full streams, effects, request/page/retry identities, source/runtime/runner/scenario/fixture digests, and separate controlled live timing observations.
- **Excludes:** Candidate semantics, feasibility verdicts, runtime extraction, and skill slimming.
- **Verifier identity:** VC1.
- **Depends on:** Tasks 1a-ii-a and 1a-ii-b.
- **Blocks:** Task 1b-i.

### Task 1b-i: Index normative clauses and establish the independent oracle

- **Estimate:** 16 hours; 3 implementation tasks; high uncertainty.
- **Owner:** Clause-oracle child.
- **Source-plan-section:** `### Task 1b: Certify candidate semantics and measure the single feasibility decision`
- **Scope:** Verify Task 1a inputs, transcribe the independently reviewable clause index, map positive/adversarial fixtures and executable assertions, and prove missing generation or validation cannot pass.
- **Excludes:** Candidate cost serialization, context comparison, the final feasibility decision, and production contracts.
- **Verifier identity:** VC18.
- **Depends on:** Task 1a-ii-c.
- **Blocks:** Task 1b-ii and Task 1b-iii.

### Task 1b-ii: Build complete candidate decisions and presentation fixtures

- **Estimate:** 16 hours; 3 implementation tasks; high uncertainty.
- **Owner:** Candidate-fixture child.
- **Source-plan-section:** `### Task 1b: Certify candidate semantics and measure the single feasibility decision`
- **Scope:** Implement the versioned standalone test oracle/serializer and complete seven-action ready, blocked, indeterminate, warning, human-request, normalization, and policy-enriched candidate fixtures. Prove operational invariance when evidence-only cardinality changes.
- **Excludes:** Final comparison verdict, production evaluators, runtime schemas, and guidance loading.
- **Verifier identity:** VC18.
- **Depends on:** Task 1b-i.
- **Blocks:** Task 1b-iii.

### Task 1b-iii: Measure sensitivity and assemble paired comparison artifacts

- **Estimate:** 12 hours; 2 implementation tasks; medium-high uncertainty.
- **Owner:** Candidate-measurement child.
- **Source-plan-section:** `### Task 1b: Certify candidate semantics and measure the single feasibility decision`
- **Scope:** Produce complete candidate workflow transcripts, action cardinality, serialization sensitivity, heavy-case accounting, static/traffic categories, and paired comparison artifacts against the frozen Task 1a baselines.
- **Excludes:** The authoritative GO/NO-GO decision and all production extraction.
- **Verifier identity:** VC18.
- **Depends on:** Tasks 1b-i and 1b-ii.
- **Blocks:** Task 1b-iv.

### Task 1b-iv: Record the sole feasibility decision and enforce the foundation gate

- **Estimate:** 8 hours; 1 implementation task; medium uncertainty.
- **Owner:** Feasibility-decision child.
- **Source-plan-section:** `### Task 1b: Certify candidate semantics and measure the single feasibility decision`
- **Scope:** Validate every pinned characterization input, publish `feasibility-decision.json`, run VC18, and run the separate `--assert-feasible` foundation gate. An honest NO-GO completes this child's accounting but blocks Tasks 2-17.
- **Excludes:** Revising fixed budgets, relabeling a NO-GO as success, and production changes.
- **Verifier identity:** VC18 plus the accepted plan's separate foundation-gate command.
- **Depends on:** Task 1b-iii.
- **Blocks:** Task 2, and only with a recorded GO.

## Other mandatory size reviews

### Task 4: Extract immutable authority collection and complete guard evaluation

- **Estimate:** 20 hours; 3 implementation tasks; high uncertainty.
- **Decision:** Retain as one child after explicit review. Its observation-attempt boundary, pure evaluator/guard extraction, and promote migration form one inseparable parity change. It remains below 24 hours and below four implementation tasks.
- **Verifier identity:** VC4.

### Task 8: Share Review readiness and evidence-dependent navigation

- **Estimate:** 16 hours; 3 implementation tasks; medium-high uncertainty.
- **Decision:** Retain as one child after explicit review. Review preflight sharing, evidence-dependent rerun selection, and promote/generic explanation parity must land together.
- **Verifier identity:** VC8.

### Task 10: Share close readiness and complete lifecycle parity

- **Estimate:** 20 hours; 3 implementation tasks; high uncertainty.
- **Decision:** Retain as one child after explicit review. Close readiness, attribution/object-completeness reads, and the completed seven-action parity suite are one reviewable boundary. It remains below 24 hours and below four implementation tasks.
- **Verifier identity:** VC10.

### Task 12a: Enforce guidance source trust and recovery admission

- **Estimate:** 20 hours; 3 implementation tasks; high uncertainty.
- **Owner:** Guidance trust/admission child.
- **Source-plan-section:** `### Task 12: Enforce guidance source trust and operational admission`
- **Scope:** Implement source profiles, project/package trust selection, strict validation before effects, recovery-only routes, release identity generation, and the first half of the exhaustive admission inventory.
- **Excludes:** Full command-surface dispatch integration, success annotation, and cache internals.
- **Verifier identity:** VC12.
- **Depends on:** Tasks 6-11.
- **Blocks:** Task 12b.

### Task 12b: Integrate exhaustive entrypoint admission and success annotation

- **Estimate:** 20 hours; 3 implementation tasks; high uncertainty.
- **Owner:** Entrypoint/annotation child.
- **Source-plan-section:** `### Task 12: Enforce guidance source trust and operational admission`
- **Scope:** Gate every enumerated canonical route, alias, standalone entrypoint, and direct supported entrypoint before its first effect; integrate the post-success annotation, package boundaries, CLI/help surface, and aggregate CI certification.
- **Excludes:** Cache implementation and catalog-content migration.
- **Verifier identity:** VC12.
- **Depends on:** Task 12a.
- **Blocks:** Task 13.

## Hydration WBS

| Sequence | Hydrated child identity | Native prerequisites | Source verifier           |
| -------: | ----------------------- | -------------------- | ------------------------- |
|        1 | Task 1a-i               | None                 | VC1                       |
|        2 | Task 1a-ii-a            | 1a-i                 | VC1                       |
|        3 | Task 1a-ii-b            | 1a-i                 | VC1                       |
|        4 | Task 1a-ii-c            | 1a-ii-a, 1a-ii-b     | VC1                       |
|        5 | Task 1b-i               | 1a-ii-c              | VC18                      |
|        6 | Task 1b-ii              | 1b-i                 | VC18                      |
|        7 | Task 1b-iii             | 1b-i, 1b-ii          | VC18                      |
|        8 | Task 1b-iv              | 1b-iii               | VC18 plus foundation gate |
|        9 | Task 2                  | 1b-iv GO             | VC2                       |
|       10 | Task 3                  | 2                    | VC3                       |
|       11 | Task 4                  | 3                    | VC4                       |
|       12 | Task 5                  | 4                    | VC5                       |
|       13 | Task 6                  | 4, 5                 | VC6                       |
|       14 | Task 7                  | 4, 5                 | VC7                       |
|       15 | Task 8                  | 6, 7                 | VC8                       |
|       16 | Task 9                  | 4                    | VC9                       |
|       17 | Task 10                 | 5, 8, 9              | VC10                      |
|       18 | Task 11                 | 2                    | VC11                      |
|       19 | Task 12a                | 6, 7, 8, 9, 10, 11   | VC12                      |
|       20 | Task 12b                | 12a                  | VC12                      |
|       21 | Task 13                 | 12b                  | VC13                      |
|       22 | Task 14                 | 3, 10, 13            | VC14                      |
|       23 | Task 15                 | 14                   | VC15                      |
|       24 | Task 16                 | 15                   | VC16                      |
|       25 | Task 17                 | 16                   | VC17                      |

Tasks 2-11 and 13-17 otherwise retain the exact stories, scopes, acceptance criteria, exclusions, and verifier commands in their named source-plan sections. Hydration must copy those exact sections into child fragments rather than substituting this table for their implementation contracts.

## Hydration controls after acceptance

1. Record the accepted revision's commit and SHA-256 in this file's review closure and in #1558 Plan Metadata.
2. Keep #1558 as the parent and replace its obsolete Epic A framing with the accepted replacement-plan goal, constraints, child map, feasibility gate, and immutable provenance.
3. Create exactly the 25 children above with `npx aitm create-issue --shape sub-issue --parent 1558`; never call `gh issue create` directly.
4. Give every child exact `Source-plan`, `Source-plan-commit`, `Source-plan-section`, `Source-WBS`, and `Source-WBS-commit` fields. Split children use the original Task 1a, Task 1b, or Task 12 heading plus their exact WBS subsection identity.
5. Copy the relevant story, bounded scope, acceptance criteria, and exact root verifier into each issue. Split children must not receive sibling scope.
6. Record native parentage and dependency edges matching the table. Later children may exist in Backlog while blocked, but a Task 1b NO-GO blocks Tasks 2-17 from execution.
7. Leave every created child in Backlog with Size and Estimate unset. Do not promote, dispatch, or begin implementation during hydration.
8. Run decomposition/WBS coverage against the immutable accepted plan and WBS bytes. Verify 25 expected and 25 covered children, unique source-section/WBS identities, correct parentage, assignee, Backlog status, priority inheritance, and dependency edges.

## External review request

Please determine whether:

1. Each estimate and implementation-task count is credible for the named scope.
2. Every scope at or above the review threshold received explicit scrutiny.
3. Every scope at or above either mandatory split threshold was decomposed far enough.
4. Task 1b-iv remains the sole feasibility-decision owner and preserves honest NO-GO behavior.
5. The 25-child dependency graph preserves the accepted replacement plan without enabling premature runtime work.
6. The two Task 12 children cover source/trust/recovery and entrypoint/annotation integration without leaving a release gap.

An accepted review should name this file's exact SHA-256 and the repository commit containing the reviewed bytes. Any requested change creates a new reviewed revision; do not silently edit bytes already named by an acceptance record.
