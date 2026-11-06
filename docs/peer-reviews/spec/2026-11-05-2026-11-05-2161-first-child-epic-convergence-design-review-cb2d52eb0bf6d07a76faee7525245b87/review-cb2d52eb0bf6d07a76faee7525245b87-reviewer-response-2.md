<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-cb2d52eb0bf6d07a76faee7525245b87"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-11-05-2161-first-child-epic-convergence-design.md"
artifact_commit: "6de774988d64cb19bf2eedc8618ce0737bdb0950"
artifact_blob: "0a3ebca6595ee80ebdcebf60acd7191b617161c1"
artifact_digest: "sha256:01a38ecbb5d77095108efeba3ee8a9ef3216ce90d9a458fc1cf6aa8988297847"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:3f165d8f1034d2545c4bd50ca079bf13239ba58c1216848c6e46566b01d6d3d0"
  identity_source: "runtime"
started_at: "2026-11-05T15:40:08.384Z"
submitted_at: "2026-11-05T15:49:42.793Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I re-reviewed the revised specification (artifact commit `6de774988d64cb19bf2eedc8618ce0737bdb0950`, blob `0a3ebca6595ee80ebdcebf60acd7191b617161c1`) against author response 1 and the source I cited in round 1. All four required changes and the round-1 optional suggestions are resolved in the artifact text:

- Plan availability (round-1 finding 1): "Routing and compatibility" now requires `requirePlan:false` at the initial, fresh-base, pre-visible-effect and final checks, including after the body becomes Epic. This covers the `epic-metadata.mjs:125/:132/:137` call sites I flagged. Linked-but-unreadable, conflicting or malformed plans still refuse, so absence is not conflated with corruption. Plan-absent Backlog/Refine positive coverage is required through both entry routes, plus the post-body-publication check.
- Post-link refusal (round-1 finding 2): prospective parent admission now runs before `ghCreate` in the sanctioned creator and is repeated independently before any project or link write in project-tether. These are fresh reads, not a serialized token. A foreign or unbound non-Epic parent must produce zero GitHub writes, issues and links, and that is a named integration assertion. Drift after genuine child creation is handled as a truthful retained partial outcome, with no recreation.
- `ensure-wave-parent` (round-1 finding 3): it is explicitly excluded and tracked. I confirmed #2162 exists, is OPEN and is unassigned ("Automatic wave-parent creation lacks canonical convergence authority"). The spec no longer claims to fix every first-child caller. It preserves that path's existing refusal instead of granting it the bound-parent privilege. I agree with the author's choice: an unbound synthetic parent needs its own creation-authority model.
- Child census (round-1 finding 4): a separately returned `childInventory` carries child node/issue/configured project-item identity. It is compared before each effect and before final success, and it is explicitly decoupled from `current.input.epicReadiness.children`, which stays empty for the actual non-Epic body. Exceptional traversal must run the Epic branch's per-child membership/field/label/dependency checks, including rejection of missing or ambiguous membership.
- Output honesty and budget (round-1 finding 5, optional suggestions): `kind` prints the returned `already converged` or `reconciled` status, both exit 0, and refusals or uncertain outcomes keep failure status. The 5s/6s collector budgets are kept with no caching, the expected dispatch count is stated, and a slow-but-valid test is required.

I found no new blocking defects in the revision. The capability remains process-local and purpose-bound. The general `non-epic child presence` guard and its existing fixture stay regression anchors. Metadata conversion is still kept separate from stage, Test and delivery authority.

## Findings

1. **The plan-optional correction now also applies to already-Epic ordinary convergence (informational, accepted).** "Existing already-Epic ordinary paths retain their established behavior apart from the canonical plan-optional correction" means `reconcileEpicMetadata` on an already-Epic issue with no plan will now succeed where it previously refused with `decomposition:recovery-source-unavailable`. This is a deliberate, small widening that matches `kind`'s existing `requirePlan:false` precheck. It grants no stage authority, because Epic readiness (`decomposition-authority.mjs:489`) still requires an available plan. I accept it, but the builder should cover it with an explicit already-Epic, plan-absent regression test so the behavior change is intentional and visible.
2. **The prospective-parent read for a zero-child non-Epic parent does not need the exceptional read (informational).** Before the first link, the parent has no children, so the ordinary collector does not throw `non-epic child presence` (`decomposition-hook-authority.mjs:172-176`). The prospective entrypoint should use the ordinary read when the observed inventory is empty, and only take the capability for an already-anomalous parent (non-Epic with existing children). That keeps the exceptional surface minimal. This is within builder discretion and needs no spec change.

## Required changes

None.

## Optional suggestions

1. Add the already-Epic, plan-absent convergence case (finding 1) to the named regression tests in "Components and tests".
2. For the anomalous-parent case (non-Epic with existing children, such as #2157 with #2160), state in the plan whether creating additional children requires running `kind <N> epic` recovery first. Alternatively, the prospective admission could perform convergence before creating the next child. Either is fine, but the plan's "create only missing tasks 2–4" step should name the order. That order is already implied by "use the public kind recovery once" before creation.

## Decision

accepted
