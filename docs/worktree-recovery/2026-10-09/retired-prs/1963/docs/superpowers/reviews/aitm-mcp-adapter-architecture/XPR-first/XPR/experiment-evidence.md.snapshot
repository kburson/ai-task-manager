---
record_type: experiment-evidence
model: gpt-6-astra
effort: high
filepath: docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md
commit_sha: c2e33f4d0ae704900437a0659119bad6eb30dc01
reviewed_file_sha256: 7066ff40fdfffa399d279f453b3e4ee7dd0e26f96effcc2dff0475b76c2cf783
turn_ordinal: XPR-first setup
turn_description: Cross Provider Review first experiment setup
comparison_trunk_commit: 94c32e12d845b621311a4597ac1dbaf3715c9d67
comparison_spec_sha256: 4c3e51d93861e93ced662efbdbd551221be1e5e114fe0c68c3d3219d822f2382
---

# XPR-first experiment evidence

The user requested a second sequence starting with the original pre-review spec:
XPR first, then a discussion before deciding whether to proceed to SPR and SAR.
The eventual comparison is between this experiment's resulting spec and the
first experiment's trunk result. No implementation is authorized by this review.

## Frozen starting points

The original spec is 883 lines at `c2e33f4d0ae704900437a0659119bad6eb30dc01`.
Its next commit introduced SAR r1 corrections. This branch,
`codex/aitm-mcp-adapter-xpr-first`, starts at the original-spec commit, not at its
parent, which did not contain the spec. Setup does not change those spec bytes.

The first sequence, SAR then SPR then XPR, was merged through PR #1724:
[PR #1724](https://github.com/kburson/ai-task-manager/pull/1724). Its merge commit and final
spec hash are frozen in the frontmatter. All 32 review files were verified on
trunk after merge. Using this fixed comparison revision avoids silently changing
the comparison if trunk advances during the second experiment.

## Participants and protocol

Author: continuing GPT-6 Astra, high effort. Reviewer: a new Claude Opus 5 session,
medium effort. This repeats the earlier XPR pairing and effort selection. The
reviewer receives only the generated invitation, the original artifact, and
repository context available to an ordinary review. Earlier review records are
not present in this branch's checked-out review directory. No previous finding
list or corrected spec is supplied as review guidance.

The Author retains prior review knowledge and is not blinded. Git history and
local scratch still contain prior work, so this is not a controlled isolation
study even with a fresh reviewer. Do not claim causal superiority from round
counts. Record actual reviewer access if later evidence shows prior collateral
was read. No instruction asks the reviewer to match the earlier result.

Installed package: `ai-peer-review` 0.2.2. Claude Code: 2.1.278. Start uses the
package launcher; continuation uses the locally repaired current-turn launcher
from the first experiment to avoid its documented stale invitation defect. That
repair is operational carryover, not a design change, and differs from the first
experiment's initial unpatched runtime. It remains local in ignored scratch.
The provider's genuine session and fingerprint are retained for each continuation;
raw handles stay private. Claude model identity remains labeled declared when
resolved from the project fallback; runtime model evidence is reported separately.

Normal commit mode and explicit resume handoffs are used. Automatic-required
transport is not claimed. Human authority assurance remains separate from AI
reviewer consensus. The reviewer may request revisions or accept; only submitted
protocol evidence constitutes a decision.

## Review and stopping rules

For each round retain original findings, author dispositions and disagreements,
input and result commits, hashes, decisions, and model/effort frontmatter copies.
Use the same substantive review standard: actionable design defects, supported
by concrete failure scenarios and repository evidence. Do not copy the trunk spec
onto this branch; changes must be responses to this review's evidence.

Continue XPR until acceptance or an explicit protocol/user stop. Then pause for
the user's decision about SPR; do not start either SPR or SAR automatically.
Keep all rounds and operational failures, including any regressions introduced
by corrections. Record optional suggestions separately from blocking findings.

## Comparison plan

After the selected levels finish, compare both artifacts against the same original
requirements and repository constraints: correctness, completeness, internal
consistency, implementation feasibility, recovery and trust boundaries, testability, and
operational complexity. Report retained, missing, conflicting, and unnecessary
requirements with concrete examples. Word count and review-round count are
observations, not quality scores. Separate candidate defects from independently
adjudicated defects, and identify any evaluator who has seen prior results.

The initial frozen trunk comparison remains available even if further edits are
made later. No quality winner is predetermined. Token/cost and active reasoning
time are unknown unless reliable telemetry is retained; wall-clock times include
tool and scheduling delays. Append observed results without rewriting setup history.

Setup observation: the first doctor invocation omitted the Author model environment
and reported identity unavailable. Repeating with the verified Astra model metadata
reported healthy manual-mode readiness; no protocol had yet been started.

## Excluded attempt: user requested fresh Author

The user identified Author context carryover as an experimental concern and
requested a fresh Astra Author. This attempt was stopped before any Author
revision or submitted Reviewer response. The original spec digest is unchanged.
The in-flight Claude process was terminated; its launcher reported invalid JSON
because it was interrupted. Its draft, invitation, and scratch authority remain
preserved as excluded setup evidence. No finding from this attempt is supplied
to either participant in the replacement run or counted as a review outcome.

The protocol package has no abort/cancel/stop command. Its last event state
therefore remains reviewer-turn, not accepted or officially cancelled. This
sidecar records the human-directed discontinuation; the raw authority was not
rewritten. A new protocol with genuinely distinct Author and Reviewer sessions
will start in a separate worktree from the original-spec commit. This branch
is excluded from the primary XPR-first comparison.

Operational observations: the Claude native executable was missing again before
launch and was restored using its own installer. Claude reported 2.1.278. The
baseline fast suite passed all 872 test files. Setup Markdown lint identified a
bare PR URL in this log; that editorial issue was corrected here. This stopped
attempt provides no design acceptance or candidate-quality evidence.
