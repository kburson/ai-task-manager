# #2039 prerequisite proposal: bounded readiness for more than 32 children

Status: proposed, not approved for implementation. This documents a blocker discovered while carrying out the authorized flat 36-story refinement. It does not alter the accepted #2039 cache architecture or authorize a state/evidence bypass.

## Reproduction and current effects

The retained twelve stories were narrowed, and twenty-one additional stories were created as #2052–#2072. #2072 is natively linked to #2039 as child 33. Its wrapper failed with `project-tether: decomposition:readiness-children` during parent Epic metadata reconciliation. Tasks 33, 35 and 36 have not been created. Preserve every existing issue and parent link.

`readiness()` in `scripts/task-tracker/lib/decomposition-authority.mjs` includes every observed child in its normalized readiness record. `readiness()` in `scripts/task-tracker/lib/decomposition-assessment.mjs` sends that list through the generic `boundedArray`, which rejects lengths above 32. The hook collector already paginates complete child connections, but the closed-wire validator cannot represent the resulting 33-child observation. Repeating a refresh cannot repair this shape mismatch.

The separate 32-entry forecast-proposal limit is unrelated and must remain unchanged. This is not a WBS task-count limit, a request to truncate children, or grounds for rewriting estimates to fit the validator.

## Proposed bounded repair

Create a separate top-level prerequisite defect, carrying the existing native error and source evidence. Implement a dedicated maximum of 100 child-readiness entries. Keep the ordinary array limit at 32 for observations, forecast proposals, publication effects and other existing categories. Preserve the closed readiness schema, exact child records, identity checks, ordering, canonical digest behavior and duplicate/refinement validation.

Accept complete readiness observations containing 33 and 36 children. At the dedicated limit, retain all children; above it, fail closed with an explicit capacity diagnostic. Never slice or omit children to produce a successful marker. A malformed or incomplete connection remains unavailable, and the existing remote/total deadlines and page/byte limits remain enforced. Do not enlarge any GraphQL `first` value or silently disable authority checks.

After the prerequisite is tested and independently reviewed through normal task stages, restore the #2039 worktree's native authority using the sanctioned recovery route. Verify #2072's exact parent/project/Backlog effects and finish any remaining native creation steps without duplicating it. Create only the remaining three planned siblings using their pinned fragments, then continue the original Refine to R4P request for all 36 children.

## Intended changes and verification

Keep production scope to the readiness capacity validator and any shared named constant needed for its callers. Add boundary and wire round-trip cases to the existing decomposition unit/integration corpus. Future tests must cover 31, 32, 33, 36, 100 and 101 children; complete identities/digests for every accepted entry; refusal of malformed/incomplete observations; and preservation of the unrelated 32-entry forecast/effect bounds. Include a 33-child parent metadata recovery regression.

Candidate verifier entrypoints, to be finalized against the prerequisite issue's actual owned-file scope:

```sh
node --test scripts/tests/unit/task-tracker/lib/decomposition-authority.test.mjs scripts/tests/unit/task-tracker/lib/decomposition-review-fixes.test.mjs scripts/tests/integration/task-tracker/lib/decomposition-review-fixes.test.mjs
```

These commands and new cases are planned verification, not tests already executed or evidence of acceptance. Follow the repository's red/green, review, commit and lifecycle gates. Local estimate: 3.5 hours, comprising 1 hour implementation, 1.5 hours boundary/integration verification and 1 hour independent review/repair. No historical cloud tasks were consulted.

## Scope boundary

The expensive hook query, missing same-response telemetry coverage, aggregate tether timeout, and inconsistent REST quota overview are separate findings. This prerequisite must not bundle a query redesign, telemetry implementation, deadline change, generic bound increase or unrelated cache migration.
