<!-- aitm-skill-version: 0.1.0 -->

# Pickup Directive — Agent Instructions

Read at pickup. Live issue, AITM, and `references/pickup-directive-rationale.md` give detail. Summary and ledger are not authority.

## Hard Rules — Do Not Skip

0. **Bootstrap is fail-closed.** On a failed step, STOP and report `STATUS: BLOCKED bootstrap-step-<N>: <reason>` before source edits.
1. **Deep Dive before any code.** Post and mirror the deep dive, then stamp completion before code; the source-edit gate enforces it.
2. **Verify each DoD/AC.** Verify each item separately. ACs cite root commands via `aitm-verified vc-list="vc:N"`; DoD uses `cmd`. Run in Develop/Test; Review only reuses receipts. Never bulk-check.
3. **All pre-close checkboxes ticked before close.** Tick each before `/task close`; never use raw `move-state.mjs`.
4. **Agents MUST NOT run `/task review` or `/task close`.** Child ends by reporting `CODE_COMPLETE`; orchestrator owns Review, approval, and Close.
5. **Epic boxes wait for sub-issue Review.** tick no AC/DoD box until every sub-issue reaches Review.
6. Pause the timer for a blocking question; resume after the answer.
7. **Checkpoint Pause — re-read the conversation queue.** Before any `/task` state move, switch, close, or fan-out, read new user input.
8. **On mistakes — STOP, surface what/why.** Explain and wait for instruction on authority or scope changes.
9. Never hand-roll an issue body or use `gh issue create --body`; edit live bodies only through `mutateIssueBody` via `npx aitm issue-body`.
10. Rank (`child-cannot-lead-epic`), R4P pull budget, and dependency details live in the JIT rationale.

## Required steps before writing any code

1. **Post-Compact/Clear Recovery.** After Compact, Clear, fresh worker start, or changed guidance sentinel, read `.ai-task-manager/templates/session-boot.md`; discard old receipts and emit `aitm-boot-recovered:<session-id>:<timestamp>`.
2. Bind the exact issue with `npx aitm start <this-issue-#> --role agent`; confirm issue, worktree, branch, timer, and live `npx aitm explain #N --json` decision.
3. Read Scope and source plan; post, mirror, and complete the deep dive; reassess size.
4. Implement in the owned worktree, run cited verifiers, commit `[#N]`, and report `CODE_COMPLETE` with timing and unchecked items. Do not advance Review or Close as an agent.

Statuses: `CODE_COMPLETE`, `ISSUE_READY_FOR_REVIEW` (orchestrator), or `BLOCKED`; Do not report `DONE` or `DONE_WITH_CONCERNS`. All checkboxes checked means ready for human review, not permission to close. See `references/status-reporting.md`.
