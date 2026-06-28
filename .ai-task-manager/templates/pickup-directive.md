<!-- aitm-skill-version: 0.0.0 -->

# Pickup Directive — Agent Instructions

Applies on first pickup of any issue whose body lacks an
`<!-- aitm-deep-dive-complete: ... -->` marker; if present, skip to step 6. Rules
are terse; full prose, trigger lists, Rank rules, worked examples, and audited
overrides live in the JIT reference
[`references/pickup-directive-rationale.md`](./references/pickup-directive-rationale.md).

## ⛔ Hard Rules — Do Not Skip

Enforced by `/task close` and `move-state.mjs <issue> done`; bypassing is a process violation.

0. **Bootstrap is fail-closed.** If the required steps below do not all succeed, STOP and report `STATUS: BLOCKED bootstrap-step-<N>: <reason>` before editing source.
1. **Deep Dive before any code.** Append it and run `/task check "Deep dive complete"` before editing any source file; the `source-edit-gate` hook enforces this (`.tmp/**` exempt). Unrelated edits need `chore-mode on "<reason>"`.
2. **Verify every DoD/AC item individually.** Run its `aitm-verified cmd="…"` command (also listed under `### Verification Commands`), then check the box. Never bulk-check.
3. **All pre-close checkboxes ticked before close.** `/task close` (and move-to-Done) refuses any unchecked pre-close `- [ ]`. No env override.
4. **Move to Done is gated.** `move-state.mjs <issue> done` refuses on unchecked boxes; the normal path is `/task close`.
5. **Agents MUST NOT run `/task review` or `/task close`. The terminal agent action is reporting `CODE_COMPLETE`.** `/task review` is an orchestrator action; `/task close` is human.
6. **Epic boxes wait for sub-issue Review.** For 🧑‍🧒‍🧒 [Epic] issues, tick no AC/DoD box until every sub-issue reaches Review.
7. **Pause the timer before blocking questions** — `/task pause "pause for question"` before, `/task start "question answered"` after.
8. **Checkpoint Pause — re-read the conversation queue before any state transition.** Before any `/task` state move, active-issue switch, close, or parallel-agent fan-out, re-read the most recent user messages; if the latest is unaddressed, halt and respond first.
9. **On mistakes — STOP, surface what/why with 2–3 options, wait for instruction.** Do not self-correct.
10. **Never hand-roll an issue body** — no `gh issue create`/`edit … --body`/`--body-file` (`gh-edit-guard` refuses). Make issues via `preflight-issue.mjs`; edit live bodies only through `mutateIssueBody`.
11. **Reference rules — in the rationale:** skip collapsed `<details>` unless told to expand; field units (`estimate` hours, `engagedTime`/`sessionTime`/`reviewTime` minutes); Review-Notes → close-time Review-delta; Full-Auto footnote delimiters must not be stripped; Post-Compact/Clear recovery via [`session-boot.md`](./session-boot.md); the **Rank rules** (`child-cannot-lead-epic`, Refine WIP, dependency representation).

## Required steps before writing any code

0. **Post-Compact/Clear Recovery.** If this session was just compacted, cleared, or freshly started (continuation banner, fresh-session preamble, or no `aitm-boot-recovered:*` sentinel in context), follow [`.ai-task-manager/templates/session-boot.md`](./session-boot.md) before any step below, then emit a one-shot `aitm-boot-recovered:<session-id>:<timestamp>` sentinel.

1. **Move the issue to `in-progress` and capture your entry word count:**

   ```bash
   node node_modules/ai-task-manager/scripts/gh/move-state.mjs <this-issue-#> in-progress
   node node_modules/ai-task-manager/scripts/task-tracker/task-tracker.mjs words-count
   ```

   Record `W_start` and `T_start` for the exit `words_delta`/`duration_minutes`. When done, report `CODE_COMPLETE` and stop — the orchestrator calls `/task review #N --duration-minutes M --words W`.

2. **Run a deep-dive analysis.** Read the relevant code paths, validate Scope, identify files to edit, define the test approach, surface risks.

3. **Append the deep dive, then stamp completion.** Full procedure is in [`references/deep-dive-procedure.md`](./references/deep-dive-procedure.md). Canonical writer: `ensureDeepDive` (`scripts/task-tracker/lib/deep-dive.mjs`); the appendix is narrative-only. After it returns, run `/task check "Deep dive complete"`.

4. **Re-evaluate Estimate and Size.** Update fields + comment if either changes; pause for human direction if Size jumps ≥ 2 tiers.

5. **If this is an Epic — validate sequencing and fan out sub-issues.** Skip for plain sub-issues. Each spawned sibling gets a fresh Pickup Directive, the parent epic's priority, and a "Spawned from: #<this-issue>" link. Full procedure in [`references/deep-dive-procedure.md`](./references/deep-dive-procedure.md).

6. **Proceed with implementation.** Branch `<this-issue-#>-<short-slug>`; use `superpowers:using-git-worktrees`. The commit convention is in the rationale.

## Status Reporting

Report exactly one status. Do not use `DONE` or `DONE_WITH_CONCERNS` — ambiguous under the close contract. Full table and the pre-`CODE_COMPLETE` checklist: [`references/status-reporting.md`](./references/status-reporting.md).

- `CODE_COMPLETE` — done; all verifiable boxes checked, unchecked items listed with reasons; include `duration_minutes`/`words_delta`. Do NOT call `/task review` (the orchestrator does). This means ready for human review via the orchestrator — NOT permission to close.
- `ISSUE_READY_FOR_REVIEW` — orchestrator-only, after `/task review` reaches Review. Notify the human; do NOT run `/task close`.
- `BLOCKED` — needs orchestrator/human intervention; say exactly what.

**Stop here. Report `CODE_COMPLETE`. Do NOT call `/task review`.**
