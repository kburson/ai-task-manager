# Solo Agent Review: planning and specification lifecycle

- Issue: #1768
- Artifact: `docs/superpowers/specs/2026-09-22-1768-review-lifecycle-design.md`
- Review mode: independent Codex subagent, three rounds
- Outcome: accepted version 3 as an informal SAR; no `ai-peer-review` protocol acceptance

## Round 1: version 1

The reviewer found seven issues. Title-only issues had no defined path through
the new Refine gate. Deep-Dive and hydration reviews lacked stable identity for
mutable GitHub issue content. The accepted master plan could diverge from the
plan used for approval and hydration. The risk rubric lacked executable
thresholds. A lost issue-creation response could create duplicates on retry.
The design did not account for existing WBS source-plan fields, and the
engaged-time calculation lacked an activity and idle policy.

The author revised the spec to version 2. It defined enrollment, issue-content
digests, a pinned plan commit through approval and exit, a versioned scoring
table with blocking unknowns, an issue-visible operation ID for reconciliation,
preservation of existing WBS fields, and activity intervals with an unknown-time
fallback. All seven findings were addressed in substance.

## Round 2: version 2

The reviewer found three remaining issues. Some Refine and Plan gates still
applied universally despite the title-only exemption. The plan-change rule did
not distinguish changes before and after epic Plan exit. Deep-Dive invalidation
watched its section but omitted other reviewed issue fields and the estimate.

The author revised the spec to version 3. The new gates now apply only to
enrolled issues, a changed master plan before epic Plan exit requires review and
mapping reconciliation, and the Deep-Dive receipt covers all reviewed inputs.

## Round 3: version 3

The reviewer checked the three corrections and found no further blocking
contradiction. The informal SAR accepted version 3. This acceptance applies to
the committed version-3 artifact only; any later content change needs another
review and version increment.

## Formal peer-review attempts

Review `review-92d520bf01583bf70dd7c81624917b29` was started against
version 1 with Claude Opus 5 as reviewer. The package's Claude launcher returned
`APR_CLAUDE_RESULT_INVALID` on the initial launch and on the one permitted
recovery. Event authority remained `awaiting-reviewer`, with no reviewer claim
or response. That attempt is incomplete and confers no acceptance on any
version. Its package-generated invitation and startup files remain in
`docs/peer-reviews/spec/2026-09-23-2026-09-22-1768-review-lifecycle-design-review-92d520bf01583bf70dd7c81624917b29/`.

After version 3 was committed, the author started review
`review-80c813f0f96ca4e89434a7012676243b` against that exact commit.
Claude Opus 5 again returned `APR_CLAUDE_RESULT_INVALID` before claiming the
reviewer slot. The fallback Grok 4.7 session read the invitation, but its first
run stopped before joining. Its one recovery ran the exact `peer-review join`
command, which refused because reviewer identity was unavailable to the
package. Event authority remains `awaiting-reviewer`, with no reviewer claim,
response, or acceptance. No further recovery was attempted. The version-3
protocol invitation and startup files remain in
`docs/peer-reviews/spec/2026-09-23-2026-09-22-1768-review-lifecycle-design-review-80c813f0f96ca4e89434a7012676243b/`.
