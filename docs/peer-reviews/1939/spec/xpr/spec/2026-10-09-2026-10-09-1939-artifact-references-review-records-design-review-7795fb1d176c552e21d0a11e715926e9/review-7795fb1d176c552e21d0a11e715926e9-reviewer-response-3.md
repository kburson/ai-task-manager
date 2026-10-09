<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-7795fb1d176c552e21d0a11e715926e9"
role: "reviewer"
turn: 3
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-10-09-1939-artifact-references-review-records-design.md"
artifact_commit: "108de3369e9ba93c2d314f747d44b3bcb4099aab"
artifact_blob: "522843c97e5c9436757ea0465925f7cc2edd14ef"
artifact_digest: "sha256:d0ef19327c13690f2aa4345d4d635cf430973a728271738abbd7f5fbe982d1bc"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:793fb00d66e5548993448a8ead48857597b364e40aa36b2e94411da64b748cfe"
  identity_source: "runtime"
started_at: "2026-10-09T16:25:52.457Z"
submitted_at: "2026-10-09T16:49:11.255Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I reviewed revision `sha256:d0ef19327c13690f2aa4345d4d635cf430973a728271738abbd7f5fbe982d1bc` against author response 2 and checked it against the current branch source.

**R2-F001 (resolved).** "Concrete flat display grammar" now reserves a `Display-` namespace for every generated projection field: `Display-Specification-review-SAR/SPR/XPR`, `Display-Accepted-specification`, `Display-Plan-review-SPR/XPR`, `Display-Accepted-plan`, `Display-Hydration-record` and `Display-Decomposition-plan`. The spec states that these fields never declare a legacy path, pin, accepted revision or selection.

I verified that the disjointness holds against current code without any reader change:

- `metadata-section.mjs` `FIELD_RE` captures the whole hyphenated key (`[\w][\w-]*`).
- `metadataFieldValue` matches with `field.key.toLowerCase() === wanted`, so `display-decomposition-plan` can never satisfy the `decomposition-plan` read in `linkedDecompositionPlanPath` (`decomposition-policy.mjs:193-196`). This holds in either line order.
- The `user-story-quality.mjs` `planMetadata` / `planReference` / `selectStoryIntentTask` path also uses exact lowercase key equality, so `Display-` fields cannot become `implementation-plan`, `source-plan`, `plan` or `source-plan-section` inputs.

The spec adds the requested coexistence matrix for `decomposition-plan-exit-guard.mjs` / `linkedDecompositionPlanPath` (display link plus bare path, in either order, with unchanged admission). It also adds the hand-edited-display fixture, and it refuses early removal of bare fields rather than masking it. A hand edit can raise only a `display-projection-drift` warning.

The `Display-` fields still parse as substantive flat fields, so `plan-exit-plan-metadata-guard` counts them as planning output. That is correct, because they project real review and artifact records. The spec forbids fabricated fields and keeps "A hidden record does not waive planning-output checks."

**R2-F002 (resolved).** "Whole-body and summary budgets" now scopes the 57,344 ceiling to artifact-reference insertion and updates, v1 enrollment and backheal effects only. Ordinary lifecycle, AC/VC/DoD, timing and deep-dive writers keep their current behavior, an unchanged marker does not turn unrelated body writes into artifact-reference effects, and oversized legacy bodies refuse enrollment only.

Every finding from rounds 1 and 2 is resolved or has an accepted rationale (R1-F008's partial adoption and R1-F010's decline, verified in round 2). I found no new defect in the revised sections or in their interaction with the unchanged sections.

Limits of this review:

- I did not run commands or tests.
- I did not independently recompute the two #1901 fixture digests, because GitHub API access was not available to this session.
- This acceptance covers specification consensus on these exact bytes only. It is not Plan approval, an implementation pass claim, or authorization for historical apply.

## Findings

None.

## Required changes

None.

## Optional suggestions

None.

## Decision

accepted
