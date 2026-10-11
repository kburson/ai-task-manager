<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-2cf594a8a446f9552e00ecc0ef920a86"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-10-11-1908-reestimate-decomposition-design.md"
artifact_commit: "acb725feafc26e31bccfd18b96e9b5e517137397"
artifact_blob: "4247db3317a84c6bd6370915bf7a67768e6fda02"
artifact_digest: "sha256:3aa7382fdb05c1151d95fb0a74745b0ecf610671086db5e22545682e1ac554d4"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:72a52ca24cb6d4dd4a36057be14d196a8e893cbdaf46f79afd97c8400ed95ec5"
  identity_source: "runtime"
started_at: "2026-10-11T14:27:52.157Z"
submitted_at: "2026-10-11T14:34:10.214Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I re-reviewed the revised spec at `acb725fe` against author response 1 and the source. All three required changes from reviewer response 1 are fixed, and so are the optional suggestions. I checked each claim in the author response against the source myself:

- **Kind taxonomy:** `VALID_KINDS` is `code`, `docs-only`, `audit`, `research`, `spike` and `epic` (`scripts/task-tracker/lib/issue-kind.mjs:24-38`). The new "issue kinds and classifier vocabulary" section covers all five non-epic kinds, default/unmarked `code`, and code-kind defects. It also requires an indeterminate result for malformed or unsupported explicit kind markers. That matters because `parseIssueKind` currently falls back silently to `code` for unknown values (`issue-kind.mjs:118-120`), and the spec now explicitly blocks that fallback from being exploited. The AC1 kind matrix extension and the no-commit deliverable restrictions settle how the condition applies to kinds with no product commits.
- **Recovery adapters:** `scripts/task-tracker/verbs/kind.mjs`, `scripts/gh/lib/epic-metadata.mjs`, `scripts/task-tracker/verbs/split-plan.mjs`, `scripts/task-tracker/lib/split-plan.mjs` and `scripts/gh/create-issue.mjs` all exist. So do the cited suites `scripts/tests/unit/task-tracker/verbs/coverage-kind.test.mjs` and `split-plan.test.mjs`. The new table rows require a reassess-and-refresh after a kind change, a refused refresh to deny admission, no escape from one non-epic kind into another, and pending intents to survive a conversion. The author's qualification is correct and consistent with the fail-closed contract: the recovery capability doesn't override the operation's own unreadable ownership/scope/plan preconditions. Converted epics keep a visible unresolved disposition until reviewed children are materialized, which fixes the stale-projection ambiguity.
- **Waiver remediation:** The spec now explicitly retires the `decomposition-plan-exit-guard.mjs:122` recommendation and the prose-waiver success/warning branch. It also requires real-output regressions across Plan-exit, typed Explain and admission, including the AI-waiver fixture.
- **Vocabulary:** The classifier keeps `must-split` and maps it centrally to the assessment status `must-decompose`. Pending, authority-unavailable and epic-readiness are defined as overlays, not as classifier signals.
- **Proposal normalization:** I confirmed `normalizeEstimateProjection` applies `ceilEstimateHours` (`scripts/task-tracker/verbs/plan-estimate.mjs:141-149`). The author's correction is right: effective normalization already exists, and the spec now requires proposal/publication parity tests instead of new behavior.

The clarifications sit inside the existing contracts and don't weaken any earlier guarantee: truthful estimate recording, Status/history preservation, recompute-on-admission, and no self-waiver.

## Findings

None.

## Required changes

None.

## Optional suggestions

1. When the implementation plan is written, fold the two "XPR clarification" sections into the main body sections they amend: the shared assessment contract and the minimum adapter map. Then the plan's adapter-to-verifier map has a single source table. This only affects readability, and it doesn't block SAR acceptance.

## Decision

accepted
