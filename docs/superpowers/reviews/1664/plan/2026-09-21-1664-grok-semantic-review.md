# #1664 Issue-Local Plan Semantic Review

## Authority and method

- Plan: `docs/superpowers/plans/2026-09-21-1664-functional-dod-projection.md`.
- Baseline: accepted #1558 specification and hydration WBS Task 12; the issue-local plan clarifies the current v2 contract without changing sibling scopes.
- Reviewer: Grok CLI, read-only semantic review. This is **not** an `ai-peer-review` protocol acceptance: the installed package doctor reported unavailable identity-source and authority-verifier checks.
- First review result: `FINDINGS`, with the two findings below. A focused second Grok invocation exited without a verdict; a third hit `max turns reached`. Neither retry is represented as reviewer acceptance.

## Findings and author resolution

1. **V2 normalization shape and digest.** The draft used historical `{key,ruleId,stamp,tick}`. Current `action-decision/contract.mjs` requires exact `{key,derivationRule,stamp,tick}` with `derive-acs/v1` or `derive-checkboxes/v1`, and `decisionDigest` over canonical `{normalizerId,decisions}`. The revised plan now says this in Global Constraints, Unit A interface, A1, and A3. Historical `derive:all-acceptance-criteria-ticked` and `derive:all-non-self-non-lifecycle-checkboxes-ticked` remain evidence-marker `cmd` values, not decision enums. **Author disposition: resolved.**
2. **Execution-time retry and readback authority.** The draft did not explicitly require re-projecting against every fresh mutation base with execution HEAD/time, and left the stale `review-derive-rescan` fallback and close catch-and-continue ambiguous. Revised B3 and B4 require complete projection/readiness recomputation inside each fresh-base callback, stop-before-write on blocked/indeterminate retry, actual execution provenance readback, no explanation-time bytes or timestamp as authority, and fail-closed replacement of both legacy fallback paths. **Author disposition: resolved.**

## Seven-question Story Intent review

1. **Stakeholder:** yes; a lifecycle executor is the operational role receiving the safeguard, not an implementation agent.
2. **Capability:** yes; inspect derived DoD without writing and persist only after current readiness.
3. **Need:** yes; the existing derive-and-rescan path writes before a complete readiness decision and can reuse stale data after refresh failure.
4. **Counterfactual value:** yes; explanation stays read-only and normalization failure or drift cannot authorize progression.
5. **Source grounding:** yes; issue Scope/ACs, accepted WBS Task 12, current derive/rescan code, and the posted deep dive support each claim.
6. **Sibling distinctness:** yes; #1663 owns read-only observation/guard evaluation, while #1664 owns projected DoD and ready-only persistence.
7. **Standalone readability:** yes; the four Story Intent fields and issue User Story identify the behavior and prevented failure without opening the implementation steps.

## Acceptance decision

The author accepts the revised issue-local plan for Full-Auto Plan approval. This is an author semantic disposition after addressing independent reviewer findings, not a claim of terminal Grok or package-protocol acceptance. Implementation must still demonstrate the named RED/GREEN cases, exact-SHA verification, independent code review, and lifecycle gates.
