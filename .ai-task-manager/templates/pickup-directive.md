<!-- aitm-skill-version: 0.1.0 -->

# Pickup Directive — Agent Instructions

Read on first issue pickup. The current issue body, live AITM result, and `references/pickup-directive-rationale.md` provide detail; do not restore rules from a summary or local ledger.

## Hard Rules — Do Not Skip

0. **Bootstrap is fail-closed.** If a required step fails, STOP and report `STATUS: BLOCKED bootstrap-step-<N>: <reason>` before editing source.
1. **Deep Dive before any code.** Post and mirror it, then stamp completion; the source-edit gate enforces this.
2. **Verify each DoD/AC.** ACs cite root Verification Commands with `aitm-verified vc-list="vc:N"`; DoD uses `cmd`. Run in Develop/Test; Review only reuses receipts. Never bulk-check.
3. **All pre-close checkboxes ticked before close.** Use `/task close`; never move to Done with raw `move-state.mjs`.
4. **Agents MUST NOT run `/task review` or `/task close`.** The agent terminal action is reporting `CODE_COMPLETE`; the orchestrator handles Review and human/Full-Auto approval.
5. **Epic boxes wait for sub-issue Review.** Do not tick an epic AC/DoD box until every child reaches Review; tick no AC/DoD box until every sub-issue reaches Review.
6. Pause the timer before a blocking question; resume after the answer.
7. **Checkpoint Pause — re-read the conversation queue.** Before any `/task` state move, active-issue switch, close, or parallel fan-out, address new user input first.
8. **On mistakes — STOP, surface what/why**, then wait for instruction where the correction changes authority or scope.
9. **Never hand-roll an issue body.** Do not use `gh issue create --body`; use the governed writer and edit live bodies only through `mutateIssueBody` via `npx aitm issue-body`.
10. The Rank rules (`child-cannot-lead-epic`, R4P pull budget, dependencies) and other audited details live in the JIT rationale.

## Required steps before writing any code

1. **Post-Compact/Clear Recovery.** After Compact, Clear, fresh worker start, or changed guidance sentinel, read `.ai-task-manager/templates/session-boot.md`; discard stale guidance receipts and emit a fresh `aitm-boot-recovered:<session-id>:<timestamp>` sentinel. A compacted summary is not rule authority.
2. Bind the exact issue with `npx aitm start <this-issue-#> --role agent`; confirm issue/worktree/branch and active timer. Ask `npx aitm explain #N --json` when choosing the next lifecycle action.
3. Read Scope and source plan, perform the deep dive, post it, mirror it, and stamp its completion. Re-evaluate the estimate before source edits.
4. Implement in the owned worktree, run each cited verifier, commit with `[#N]`, and report `CODE_COMPLETE` with timing and unchecked items. Do not advance Review or Close as an agent.

## Status reporting

Use `CODE_COMPLETE`, `ISSUE_READY_FOR_REVIEW` (orchestrator only), or `BLOCKED`. Do not report `DONE` or `DONE_WITH_CONCERNS`. All checkboxes checked means ready for human review, not permission to close; Full-Auto follows current AITM gates. Details: `references/status-reporting.md`.
