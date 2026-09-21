<!-- cspell:words implementability prespecified unblinding -->

# Review-Order Experiment: Prespecified Quality Rubric and Assessment Procedure

Status: frozen before the evaluator opened either neutral-labeled final specimen, the specimen manifest, or any review history. This is an evaluator assessment-order protocol, not a preregistration made before the review experiment.

## Purpose

This protocol compares two final architecture-spec artifacts. It separates artifact quality from review-process history: the initial judgment uses only neutral labels A and B, the common baseline, source requirements, ADRs, and relevant implementation evidence. Review method, sequence, reviewer agreement, finding counts, and cost are examined only after that judgment is recorded.

This is an assessment-order precaution, not perfect blinding or independent human adjudication. The evaluator may recognize writing patterns or repository concepts. The evaluator is an AI from a provider family also used in the experiment, so same-provider evaluator bias is possible. Repository access may omit runtime or organizational knowledge that the original authors possessed.

## Unit of analysis and comparison rule

The primary unit is the frozen final specification, evaluated as an executable engineering contract for the repository at the experiment date. A specimen wins a dimension only when cited text or an evidenced omission creates a material difference. Additional prose, constraints, or reviewer consensus do not count as quality by themselves.

The primary outcome is a profile of ordinal dimension judgments rather than a single numeric score. Each dimension receives one of four anchors:

| Anchor                | Meaning                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Strong                | The contract is materially complete and internally coherent; residual issues are low-risk or local.                        |
| Adequate              | Implementable with ordinary engineering judgment, but one or more gaps could cause rework or inconsistent implementations. |
| Weak                  | Material ambiguity, contradiction, or omission threatens correctness, safety, or delivery.                                 |
| Insufficient evidence | Available artifacts do not support a defensible judgment.                                                                  |

Pairwise outcomes are `A better`, `B better`, `tie`, or `indeterminate`. A conditional overall winner may be named when it is stronger on higher-consequence dimensions without a compensating material regression. No arithmetic aggregation is allowed in the primary judgment. A sensitivity check will test whether the overall conclusion changes under three explicit priority lenses: safety/operations, implementation/delivery, and comprehension/maintainability.

## Quality dimensions

1. **Requirements correctness and scope fidelity.** The design addresses the stated problem and requirements, respects ratified ADRs, and avoids unsupported scope expansion or contraction.
2. **Completeness of architecture contracts.** Components, responsibilities, interfaces, state, lifecycle boundaries, failure modes, and dependencies are specified to the level needed for planning and implementation.
3. **Internal and repository consistency.** Definitions, state transitions, paths, identifiers, invariants, examples, and terminology agree with each other and with relevant current implementation facts.
4. **Implementability.** Engineers can decompose the design into work without inventing consequential policy. Ordering, prerequisites, ownership, migration boundaries, and compatibility obligations are explicit.
5. **Operational feasibility.** Startup, shutdown, deployment, observability, incident diagnosis, resource limits, platform constraints, and operator actions form a credible operating model.
6. **Recovery, trust, and concurrency contracts.** The design states authority boundaries, authentication/authorization assumptions, crash and retry behavior, partial-failure recovery, idempotency, locking/serialization, stale-state handling, and split-brain prevention where applicable.
7. **Clarity and decision traceability.** Normative requirements are distinguishable from rationale and examples; important terms are defined; decisions expose their reasons and tradeoffs; readers can locate governing rules.
8. **Testability and acceptance readiness.** Material claims map to observable behaviors or verification hooks, including negative paths and recovery behavior. The specification enables meaningful acceptance tests without testing prose structure.

## Evidence rules

- Every material strength, defect, or tie-breaker must cite exact file and line references from an immutable snapshot or repository evidence.
- Counterexamples take priority over impressions. A claimed contract is credited only if its text covers the relevant failure or boundary case.
- A repair that fixes one issue while introducing another is recorded in both directions.
- Unknown or unavailable evidence remains unknown; it is never converted to a favorable score.
- The baseline is used to distinguish inherited defects from experiment-stage changes, not to excuse defects in a final artifact.
- Requirements and ADRs outrank stylistic preference. Current implementation is evidence of feasibility and integration constraints, but cannot silently override a ratified prospective design.

## Assessment sequence

1. Verify the neutral specimen files and baseline against the supplied hashes or immutable Git objects without opening the manifest or review histories.
2. Read the original requirements, ADRs, and relevant implementation sections needed to test the eight dimensions.
3. Read specimen A and specimen B in alternating passes: structure/claims, operational and failure contracts, then implementation/testability details.
4. Build a cited evidence matrix. Search specifically for contradictions, missing negative paths, ambiguous authority, non-atomic transitions, recovery gaps, and untestable mandates.
5. Record the preliminary dimension profile, overall conditional judgment, residual defects, and confidence. Freeze this record before unblinding.
6. Open the manifest and retrieve all relevant review collateral from the exact specimen commits. Classify review events by substantive role rather than count.
7. Analyze how each sequence changed the baseline and final artifact. Keep artifact-quality conclusions distinct from process-causality claims.
8. Integrate telemetry and rate-card evidence supplied independently. Separate measured usage, API-equivalent estimates, actual billed spend, subscription utilization, wall-clock latency, and unavailable data.
9. Apply stopping-rule analysis: assess the marginal risk reduction of each additional stage against its incremental cost, latency, and regression risk.
10. Verify citations, hashes, arithmetic, links, and consistency across the whitepaper and supporting evidence.

## Review-event classification after unblinding

Each distinct review observation will be assigned exactly one primary class for trajectory accounting:

- required finding that identifies a material defect or missing contract;
- change item that implements or responds to a finding;
- carried-forward observation already present in an earlier stage;
- regression introduced by a repair or later revision;
- rejected or qualified premise with documented rationale;
- optional suggestion or editorial preference;
- clean pass with no required changes;
- correction cycle fixing review-record or protocol integrity rather than the architecture artifact;
- excluded/interrupted setup, reported only as overhead outside primary outcome counts.

Publication duplicates will be linked to their original protocol records and never double-counted.

## Process comparison boundaries

The study can compare these two completed trajectories and judge their final artifacts. It cannot identify a universal causal effect of review order: the stages saw different starting states, author context changed over time, the same model families were reused, order was not randomized, and the sample contains only two architecture-spec trajectories. SAR, SPR, and XPR conclusions must therefore be conditional on defect type, stakes, and stopping evidence.

## Prespecified stopping rule

An additional review stage is warranted when it has a credible chance of finding or preventing a material unresolved risk whose expected consequence exceeds the stage's incremental cost, latency, and repair-regression exposure. Stop when all of the following hold:

1. no known high-consequence requirement, trust, recovery, concurrency, or operability gap remains;
2. the latest independent pass produces no new required finding, or only findings already covered with verified dispositions;
3. all accepted repairs pass a focused regression reread across affected contracts;
4. remaining observations are optional, editorial, or explicitly accepted residual risks; and
5. provenance and acceptance evidence are complete enough for the next governed lifecycle step.

This rule treats clean convergence and verified repair closure as stronger stopping evidence than a fixed number of rounds.
