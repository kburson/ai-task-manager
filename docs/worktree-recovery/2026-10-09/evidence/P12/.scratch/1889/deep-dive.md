## Deep-Dive Analysis (2026-10-05)

The delivered source at be8140343 claims a generation in occupancy.mjs, returning it as claim.row.bindingGenerationId. Every resume path and switch path discards that return field when saving the binding. state.mjs separately limits session projection to worktreePath, worktreeBranch and worktreeResolvedAt, so merely adding a field at the caller would still lose it. The rank-wave runtime deliberately compares the authoritative occupancy generation with the native active-task generation before observing the genuine native transcript. In the consumer parent #107, native start succeeds but active-task lacks the occupancy generation; epic-wave prepare therefore correctly refuses the inconsistent authority producer.

The bounded correction transports the exact successful claim generation into the existing binding state, includes generation in the per-session projection, and strips it from shared state. Same-issue rebind obtains the existing occupancy row and retains that generation. A real issue switch uses the target claim generation rather than inheriting the prior issue generation. Paused/no-argument resume and explicit reopening follow the same rule. Do not generate a second identifier or derive it from a task, path or transcript; the successful occupancy claim is the authority.

Tests first exercise native verbResume/verbSwitch plus actual occupancy and active-task persistence under isolated fixture directories, without GitHub mutations. State round-trip tests verify generation preservation and rejection of shared-ledger leakage. Refused claims and timing-write failures verify the existing rollback contract retains prior authority. The integration test performs a real native bind in a physically isolated Git repository before the production rank-wave assertion; it does not manually construct an accepted active-task record. Missing, foreign and mismatched generations must remain refused. Fixture native transcripts only test observation plumbing and cannot authorize production waves.

This defect does not change #1872 graph/refinement checks, exact human-source validation, parent/child isolation, immutable publication, completed-member lineage or rank barriers. A first wave after completed #140 may encounter a separately demonstrated missing completed-member observation; that is outside this narrow persistence repair and must not be silently omitted or fabricated. No installed consumer package will be patched; adopt a normally packed, delivered artifact after exact-head CI.

Implementation steps: write the four declared regression files (plus a focused fixture helper if needed), run genuine RED, minimally extend state projection and resume/switch claimed-binding construction, run focused GREEN and affected TIA, then exact-head full CI with real artifacts, independent PR diff review and governed delivery. Host full suites remain prohibited by the maintainer; CI supplies those receipts. Refine S/3h is retained as the initial human estimate: approximately 0.75h tests, 0.75h production/rollback verification, 0.75h native integration, and 0.75h CI/review/package adoption. The native forecast is separate from observed timing.

### Story Intent

- **Beneficiary:** Epic orchestrators using genuine native task bindings.
- **Capability:** Persist the exact successful occupancy generation through native bind and session-state round trips.
- **Need:** Rank-wave preparation refuses a parent whose successful bind omits its generation.
- **Value or failure prevented:** Enable explicitly authorized parallel lifecycle admission without forged authority or weakened isolation.

### Semantic Review

Seven-question semantic review: the operational epic orchestrator receives the benefit; persistence is a concrete safeguard; the native refusal establishes need; avoiding forged authority and restoring admission establishes value; inspected source, live consumer refusal and ACs ground every claim; #1872 supplies parallel policy while this defect repairs its ordinary binding producer; the three-line story is independently understandable. All seven answers are yes. This is Full-Auto author planning review under explicit maintainer delivery authorization, not human eyes on the diff.
