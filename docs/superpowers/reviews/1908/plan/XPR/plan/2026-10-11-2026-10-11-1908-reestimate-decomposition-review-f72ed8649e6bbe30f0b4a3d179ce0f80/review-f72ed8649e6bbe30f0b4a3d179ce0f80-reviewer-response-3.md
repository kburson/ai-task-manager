<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-f72ed8649e6bbe30f0b4a3d179ce0f80"
role: "reviewer"
turn: 3
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-10-11-1908-reestimate-decomposition.md"
artifact_commit: "84159001f66fbe4f678ac03d03d2ec762c612ced"
artifact_blob: "94428270100097627cdb192cde9891e043dfd3d2"
artifact_digest: "sha256:3aade2c0eb0ec38fc784f61e03799f91b44f2ea7579c5d5fcc0cabfd9eed20c9"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:988367240c76a33f0b2d1184b0071fc99132abcbbb7a5499d433590d5a3b6525"
  identity_source: "runtime"
started_at: "2026-10-11T15:23:06.515Z"
submitted_at: "2026-10-11T15:41:02.664Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I re-reviewed the plan at `84159001` against my two turn-2 required changes and two optional suggestions. All four are resolved in the artifact.

1. **Scope revision versus deliverable.** Task 5 has a new `#### Scope revision is preparation` subsection, which sits inside Task 5's section and so lands in its materialized child scope. It classifies governed edits to the issue's own User Story/Scope/AC/Plan Metadata/WBS as `decomposition-prepare` under every status. That includes `must-decompose`, `pending`, `indeterminate`, and `epic-readiness-required` with `planning=false`. The safeguards hold:
   - The fresh diff and the exact operation decide whether an edit counts as scope revision, not a caller label.
   - Mixed deliverable/completion content and forged evidence are not admitted as planning.
   - Scope changes force reassessment, keep pending intent, and leave an estimate of 24 or more flagged.
   - All three requested fixtures are assigned.

   The root "Remote no-commit effects" contract now classifies scope revision separately (line 427). The closing root clarification (line 468) ties this lane to the status table, and it confirms that ordinary epic Refine/Plan/WBS work before readiness stays available, consistent with spec line 208. The lane cannot bypass enforcement: it changes `scopeDigest`, and it cannot lower the recorded estimate or clear a pending publication.
2. **Task 2 verifiers.** Task 2's Files line now lists `issue-body-mutate.mjs`. A second `Run:` line (line 197) adds `body-invariants.test.mjs`, `mutate-issue-body.test.mjs`, `mutate-issue-body-marker-loss.test.mjs` and `state-action-resume.test.mjs`. Together these cover the existing `aitm-resident-action-ledger-head` advance consumer and the marker-loss contract. Task 2's original authority/projection `Run:` line is kept.
3. **Optional 1 (epic planning readiness).** Plan-exit/parent Develop preparation now reads `epicReadiness.planning` directly, and no orchestration capability name is invented.
4. **Optional 2 (vc numbering).** Task 7 states that parent `vc:1–3` become child `vc:6–8`, and that hydration keeps the generated numbering.

The turn-1 resolutions remain intact: bound task scopes, the epic readiness/capability table, branded advance-marker protection, `decompose-check`/`coverage-promote` ownership, serialized inventory waves with lint/parity verifiers, the hook freshness budget, the full `scripts/` census and the corrected sizes (52h, every child under 24h). The plan now meets the accepted spec's adapter-map, recovery-lane, waiver-retirement, epic-readiness and verification requirements, and it can proceed to hydration.

## Findings

None.

## Required changes

None.

## Optional suggestions

1. Task 5's in-section **Interfaces** line (line 291) still lists capabilities without `scoped-completion`, which exists only in the root "Epic readiness and capabilities" note ("Add scoped-completion to the closed vocabulary consumed by Task 5"). Task 5 cites that root section as scope-bearing, so this is not a defect. Adding `scoped-completion` to the Interfaces line during hydration would let the child's vocabulary read completely without the cross-reference.

## Decision

accepted
