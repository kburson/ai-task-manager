## Deep-Dive Analysis (2026-09-19)

### Authority and current state

The accepted authority is the pinned #1558 specification and reviewed 26-child WBS selected by this issue's Plan Metadata. WBS 1-7 (#1653-#1659) are Done, and their attributed history is incorporated into `feature/epic/1558` at `9ef4dec80438ed1f0851d33d7d5fb05ed51ee6aa`, which is also the current `origin/feature/epic/1558` head. #1660 is the next dependency-eligible child and remains the sole owner of the authoritative early feasibility decision. No later runtime child may treat #1659's favorable comparison totals as authority by themselves.

The refined Size M / 8-hour estimate remains appropriate. The work has one implementation unit: aggregate and validate the already-frozen WBS 5-7 evidence, publish one reproducible decision, and expose the distinct honest-measurement and foundation-assertion command modes. No split or sibling is needed.

### Files to edit

- `scripts/maintenance/measure-guidance-candidate.mjs` — add the deterministic measurement CLI and pure decision builder/validator used by its command modes.
- `scripts/tests/unit/task-tracker/lib/guidance-characterization.test.mjs` — aggregate the WBS 5-7 baseline, traceability, candidate-oracle, measurement, decision, and command-mode assertions.
- `scripts/tests/fixtures/1558/feasibility-decision.json` — commit the single versioned decision generated from the accepted inputs.

No runtime evaluator, guard, loader, budget, candidate serializer, or previously frozen baseline fixture changes belong to this child.

### Implementation sequence

1. Load and validate the frozen legacy baseline, independent clause index, executed oracle traceability, action-decision fixtures, candidate transcripts, cardinality report, sensitivity report, and context comparison. Recompute content digests from the exact tracked bytes rather than trusting embedded claims.
2. Add the aggregate #1660 test first and run its declared verifier to the expected RED result because the measurement CLI and decision fixture do not yet exist.
3. Implement a pure decision builder with a closed versioned schema. Pin source paths, source commits where already authoritative, exact file digests, runtime/tool identities, serializer identity, scenario/authority identities, proposed static text identities, and the complete accepted-input generation digest.
4. Recompute completeness, fidelity, four fixed-budget working/absolute verdicts, and candidate-versus-legacy reduction independently for both adapters. Carry the declared heavy-case inputs and measurement with an explicit non-universal interpretation.
5. Derive one overall `GO` only when every required input is current, completeness and fidelity pass, all working maxima pass, and both adapter totals are lower. A structurally valid measured `NO-GO` remains reportable evidence but cannot satisfy the foundation assertion.
6. Implement `--all --json` as the honest reporting lane and `--all --assert-feasible --json` as the distinct fail-closed foundation gate. Missing, stale, malformed, or extra arguments fail before a favorable verdict can be emitted.
7. Materialize `feasibility-decision.json` from the same pure builder and require byte-equivalent parsed regeneration in the aggregate test. Run the issue-specific commands, then the full lint, format, fast, and slow verification workflow.

### Test additions

`scripts/tests/unit/task-tracker/lib/guidance-characterization.test.mjs` will prove that:

- all WBS 5-7 frozen inputs validate and their exact identities are pinned in the decision;
- both adapters independently satisfy completeness, semantic fidelity, all four fixed working maxima, and total-context reduction before the overall verdict can be `GO`;
- an honest `NO-GO` decision remains valid in reporting mode while assertion mode returns a nonzero result;
- missing, stale, malformed, shortened, or relabeled inputs cannot pass either decision validation or the foundation gate;
- the heavy case remains explicit and is not misrepresented as a universal budget;
- the committed decision exactly matches deterministic regeneration from the accepted input generation.

The existing root verification commands already cover these assertions: VC1 runs the aggregate test, VC2 runs honest JSON measurement, and VC3 runs the separate feasibility assertion. No additional root command is required.

### Risks and controls

- A favorable #1659 partial report could be mistaken for release authority. The decision validator will require the complete WBS 5-7 input set and identify #1660 as the sole writer.
- Embedded fixture verdicts could become self-attesting. The builder will recompute thresholds, reductions, digests, and aggregate status from raw tracked values.
- Reporting mode could accidentally enforce GO or assertion mode could accept NO-GO. Separate return/exit contracts and an injected NO-GO test will preserve the distinction.
- Runtime or platform identity can make regeneration host-sensitive. Only the already-recorded accepted measurement identity is pinned; the decision will not invent service timing or claim cross-provider tokenizer equivalence.
- The provisional static obligation assumption must remain visible. The decision will preserve its replacement owner and remaining margins rather than claiming final release certification.

### Sibling issues

No new sibling is required. The accepted WBS already separates this sole foundation verdict from #1661-#1678, all of which remain blocked unless this issue records GO and closes.

### Dependency Map

Depends on: #1657 (clause index and traceability), #1658 (candidate semantic oracle and fixtures), #1659 (paired measurement, sensitivity, cardinality, and transcripts)

Blocks: #1661-#1678 (runtime foundation, migration, loader/cache, operational replay, and release work require this sole GO)
