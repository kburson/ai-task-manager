# Round 3 Author Response — Implementation Plan

- Author: `codex`
- Reviewed artifact: `docs/superpowers/plans/2026-09-04-1219-continuous-agent-delivery-amendment.md`
- Artifact commit remains: `c685199a0729d4792c4c120b2d30d41716a1b077`
- Comparison baseline: `07984e5137ba53f56fe062a351e5dd4111fb87bd`

This is the read-only author-validation round requested by the human coordinator. The tracked artifact is intentionally unchanged. The dispositions below establish the correction set; they do not claim the current plan is executable or acceptable.

## Blocking findings

[finding:F-101] [disposition:accepted]

Task 1 must deliver an actual trusted bootstrap/executor outside the candidate worktree and an adversarial fixture proving candidate authorization edits cannot execute. Reuse the pinned-tool-root execution pattern rather than recording identity alone.

[finding:F-102] [disposition:accepted]

Task 5 must explicitly carry #1512's `pullRequestReview` resolver, configured-reviewer resolution, exact-head human evidence evaluation, idempotent request, no-intent/no-action waiting result, and public prompt/exit contract into the shared Test merge service. One shared policy seam should serve both the legacy compatibility adapter and the enrolled Test runner.

[finding:F-103] [disposition:accepted-with-modification]

The target-aware lineage gap is blocking. Preserve `merge-back.mjs` as the governed child-to-parent entry surface, but route enrolled issues through the common PR/CI/flow-review/receipt service and retain its local fast-forward behavior only for legacy issues. Add opaque-target and legacy/enrolled split tests. This is not permission to replace graph authority or parse branch names.

[finding:F-104] [disposition:accepted-with-modification]

Task 2 replaces the old Task 14 contract and therefore must own creation—not modification—of `scripts/task-tracker/lib/cloud-test/awaiting-ci.mjs`, with the supersession explicit. Task 9 must likewise say `Create` for `skill/shared/rules/test.md`. Every materialized task needs explicit governed prerequisites; the exact owner/dependency table belongs in the decomposition correction under F-105.

[finding:F-105] [disposition:accepted]

Qualify the replaced task numbers with `docs/superpowers/plans/2026-09-01-1219-cloud-test-automation.md` and their existing owners #1237, #1238, #1239, #1242, and #1243. Before production work, add a complete table mapping Tasks 1-9 to governed issue, parent, predecessor, and disposition of every affected existing child contract. Reuse and rehydrate existing children where their ownership matches; any genuinely new work must be materialized later through the sanctioned workflow. Repin #1219, the WBS, and affected child contracts before implementation commits, not at Task 9.

[finding:F-106] [disposition:accepted-with-modification]

The trust/activation circularity, replaced pilot contract, unmet prerequisite, and unprotected target are blocking. The claim that #1237 itself cannot ever form a PR is too broad: after governed pickup a story can have a distinct recorded head targeting `cloud-test-automation`; the same-ref collapse applies to #1223's upward epic boundary. The revision must sequence previous-runtime delivery, literal-target protection, durable runtime activation, then a dependency-ready pilot whose own contract is not one of the protocol foundations. #1237 may remain only if rehydration, dependencies, distinct story head, and non-self-certifying runtime are all resolved first.

[finding:F-107] [disposition:accepted-with-modification]

The count is wrong and should be removed, but the count alone is not a material blocker because the instruction already says to synchronize with current `origin/trunk`. Replace it with an ancestry requirement that #1512's implementation commit `99bec143fd3c6401076da84ab78fefe65d054d60` is present, without freezing a moving trunk SHA in the implementation plan. Treat this as a required non-blocking correction.

## Non-blocking findings

[finding:N-101] [disposition:accepted-with-modification]

Promoted into the required Task 5 correction. The plan must inventory and assign the still-live Task 17 delivery-provider, records, verification, attribution, capsule-chain, integration-lane, and trailer contracts. Trailers remain non-authoritative projections.

[finding:N-102] [disposition:accepted]

Assign `skill/shared/rules/deliver.md`, `skill/shared/rules/full-auto.md`, and `full-auto-default-doc.test.mjs` to the relevant tasks. The corrected doctrine is that the old ad hoc implementation-review agent is displaced while the canonical exact-candidate flow-review evidence gate remains mandatory; human approval is an additional `pullRequestReview` authority.

[finding:N-103] [disposition:accepted-with-modification]

Touching `skill/shared/rules/review.md` in both a behavior task and final documentation sweep is not inherently defective, but the plan must state why. More importantly, Task 6 must enumerate which current Agent Review validators migrate into collateral validation, which are retired for enrolled issues, and which legacy paths remain.

[finding:N-104] [disposition:accepted]

Rehydrated child contracts must use the repository's enforced `scripts/tests/**` layout.

[finding:N-105] [disposition:accepted-with-modification]

Promoted to a blocking plan correction. Assign the normative delivery-receipt schema and validators to Task 1 or Task 5 before Tasks 5-7 consume them, including exact target-head and merge readback fields.

[finding:N-106] [disposition:accepted-with-modification]

Promoted to a blocking plan correction. The enrollment manifest must be generated by the trusted runtime, carry a canonical digest plus generation/live-observation provenance, and be revalidated against live issue/PR/merge state immediately before each idempotent mutation. Hand edits or stale observations must fail closed.

## Optional findings

[finding:O-101] [disposition:accepted]

Move authority/WBS repinning ahead of production implementation.

[finding:O-102] [disposition:accepted]

Use obviously synthetic schema-example identifiers.

## Sequencing and compatibility

- #1486: advisable cleanup, not a prerequisite. Task 5 can consume the delivered #1485 graph/branch-authority interfaces directly.
- #1512: incompatible as written. Task 5 must preserve the independent `pullRequestReview` gate, and Tasks 3/5/9 must explicitly reconcile the new canonical flow reviewer with the displaced ad hoc implementation-review agent.
- Overall author verdict on the current plan: `REVISE`; the WBS is not yet sufficiently decomposed or executable.

No tracked file, issue, graph, ref, or repository configuration was changed in this validation round.
