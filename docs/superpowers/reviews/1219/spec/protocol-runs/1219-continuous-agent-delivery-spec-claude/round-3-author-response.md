# Round 3 Author Response — Specification

- Author: `codex`
- Reviewed artifact: `docs/superpowers/specs/2026-09-04-1219-continuous-agent-delivery-amendment-design.md`
- Artifact commit remains: `c685199a0729d4792c4c120b2d30d41716a1b077`
- Comparison baseline: `07984e5137ba53f56fe062a351e5dd4111fb87bd`

This is the read-only author-validation round requested by the human coordinator. The tracked artifact is intentionally unchanged. The dispositions below establish the correction set and narrow two conclusions; they do not claim the current artifact is acceptable.

## Blocking findings

[finding:F-001] [disposition:accepted]

The binary mode language is incompatible with the independently resolved `analysisToDevelopment`, `pullRequestReview`, and `reviewToDone` gates. The revision must name each gate and leave Plan to Develop untouched.

[finding:F-002] [disposition:accepted-with-modification]

The doctrine conflict is real, but the proposed correction must not call the flow-review verdict advisory. The intended model is: the old ad hoc spawned implementation-review agent does not run; the new canonical Test-stage flow reviewer always runs as a mandatory exact-candidate evidence gate; and when `pullRequestReview=true`, the eligible human's exact-head approval is an additional merge-authorization gate that the flow receipt can never satisfy. `skill/shared/rules/full-auto.md` and its documentation contract test must distinguish those actors and be updated in the same change.

[finding:F-003] [disposition:accepted-with-modification]

Specification line 405 already says authorization "runs from" the trusted runtime, so the finding overstates the text as identity-only. The implementation risk is nevertheless blocking: the spec must require an execution root outside the candidate worktree, restrict eligible sources to protected immutable refs or immutable installed packages, and define a durable `aitm.runtime-activation/v1`-style record authorized by the previously trusted runtime on the designated authority host. The plan's resolver-only Task 1 confirms the missing executable boundary.

[finding:F-004] [disposition:accepted-with-modification]

Preserve the child-to-parent merge-back semantic path and `merge-back.mjs` entry surface. For enrolled continuous-delivery issues, that entry must delegate to the same target-aware PR, hosted-CI, flow-review, expected-head merge, and delivery-receipt service; only legacy issues retain the local rebase/test/fast-forward implementation. This explicitly supersedes the original plan's "unchanged" implementation claim without removing the governed child-to-parent path.

[finding:F-005] [disposition:accepted]

Add the shared-ref collapse rule. When a nested epic and its parent record the same authoritative branch, there is no upward repository delivery boundary, PR, or merge receipt for that tier; the epic aggregates terminal child receipts on the shared ref. A story still requires its own distinct bound head before opening a PR to that ref.

[finding:F-006] [disposition:accepted]

Enrollment must fail closed unless the literal immediate target ref has PR enforcement, exact-head required checks, deletion protection, and non-fast-forward protection. Opaque recorded branch authority must not be assumed to match `feature/epic/*`; #1240 owns the existing ruleset work and must cover `cloud-test-automation` before that target is enrolled.

## Non-blocking findings

[finding:N-001] [disposition:accepted-with-modification]

Promoted into the required revision set. The delivery receipt is merge authority and needs a normative schema binding candidate/source SHA, tested base SHA, literal target ref, target head before merge, expected resulting target head, observed merge SHA/method, PR, CI receipt IDs, flow-review ID, runtime identity, and readback time.

[finding:N-002] [disposition:accepted]

Commit trailers are projections only and can corroborate live provider evidence; they can never independently reconstruct or authorize a receipt.

[finding:N-003] [disposition:accepted]

Add both `skill/shared/rules/deliver.md` and `skill/shared/rules/full-auto.md`, together with their contract tests, to the documentation-change ownership.

[finding:N-004] [disposition:accepted]

The amendment must extend or explicitly map to `aitm.runtime-capability/v2` and the pinned-runtime rehearsal identity instead of introducing a third unrelated authority identity.

[finding:N-005] [disposition:accepted]

Migration to a fresh candidate generation retires all existing `acceptedHeadSha`-bound approvals and requires mode-appropriate fresh authority.

## Optional findings

[finding:O-001] [disposition:accepted]

Add terminology distinguishing the new clean-context flow reviewer, the displaced ad hoc implementation-review agent, and the existing structural Agent Review Gate.

[finding:O-002] [disposition:accepted]

Name and remove or gate the current Review-to-Develop demotion surfaces for enrolled issues while retaining legacy behavior.

## Sequencing and compatibility

- #1486: advisable behavior-preserving cleanup, not a prerequisite. Existing #1485 lineage and opaque-branch interfaces are sufficient.
- #1512: incompatible as written. The required correction is the three independent gates plus the actor/authority separation described under F-001 and F-002.
- Overall author verdict on the current specification: `REVISE`.

No tracked file, issue, graph, ref, or repository configuration was changed in this validation round.
