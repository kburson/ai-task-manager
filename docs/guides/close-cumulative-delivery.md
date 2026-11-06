# Closing a cumulative delivery

Read-only Close readiness can prove a source prefix that was already delivered by squash. The existing verified v5 receipt and its original source/integration quartet remain the authority.

The additional proof requires all of these facts:

- The selected PR has a complete source inventory ending at the exact accepted head.
- A strict interior source ancestor has the same entire tree as the integration base, including every path, mode and object identity.
- The accepted source head and integration head have the same entire tree.
- Observed source trees and parents match immutable Git objects, and the candidate lies between the source base and accepted head.

Equal final trees alone are insufficient. Unrelated integration-base changes, missing or contradictory objects, incomplete inventory and changed observations remain refused. Existing exact/disjoint comparisons retain their behavior. This proof does not extend individual rebase-step comparisons or provide a general merge algorithm.

## Returning after a runtime repair

Complete and deliver the repair through its own governed workflow before activating the original operator. For #2161, activation waits until #2165 is delivered and Done. The owning coordinator then follows the supported integration route:

1. Start the original issue in its recorded checkout and inspect the actual branch, HEAD, binding generation and timer. A worktree switch can renew the generation; historical Test evidence can therefore be stale.
2. Declare substantive delivered-runtime integration with the registered rework demotion. In Develop, merge the exact verified delivered revision with an issue-attributed integration commit. Keep the original accepted artifact reachable and immutable.
3. Run ordinary commit tracing for the integration commit, then artifact-specific tracing for the accepted SHA. Retain both rows. An empty merge file list is possible; it does not establish delivery or justify removing the integration row.
4. Repeat native AC verification/ticking, Develop finalization, coordinated Test, Review and approval with the original accepted artifact explicitly selected. The native Test interlock owns artifact-aware Develop finalization. Coordinate the actual repository Test slot before running it. Existing story/Plan authority and every current guard still apply.
5. Revalidate the original delivery against the advanced actual operator. Preserve the original PR, intent and v5 receipt. This recovery does not require another provider merge for an already verified delivery.
6. Obtain ready results from both public Explain forms, then let the owning coordinator complete the registered Close under current approval policy.

Replace ISSUE and ACCEPTED_SHA with the original issue and its immutable acceptance subject:

```sh
npx aitm explain ISSUE --artifact-commit ACCEPTED_SHA --json
npx aitm close ISSUE --explain --json --artifact-commit ACCEPTED_SHA
```

Every acceptance action must retain that explicit artifact selection. New verification records name the accepted commit/tree separately from the actual operator HEAD, generation, checkout, branch, session and issue. Preserve older receipts as history; do not relabel their context or force an incompatible approval.

Explain performs immutable reads. It neither fetches nor runs a virtual merge, and leaves objects, refs, index, worktree, issue and timer state unchanged. A refusal remains a boundary to resolve through the supported workflow; there is no prefix-proof flag, replacement receipt or identity-copy recovery path.
