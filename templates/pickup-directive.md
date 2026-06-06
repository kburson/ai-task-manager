<!-- aitm-skill-version: 0.0.0 -->

# Pickup Directive — Agent Instructions

These steps apply on first pickup of any issue whose body does NOT yet carry an
`<!-- aitm-deep-dive-complete: ... -->` marker. If the marker is already present,
skip to step 6.

Rationale, examples, and audited overrides for every hard rule below live in
[`references/pickup-directive-rationale.md`](./references/pickup-directive-rationale.md).
Read it when you need the "why" behind a rule or the recovery procedure for an
override.

## ⛔ Hard Rules — Do Not Skip

These rules are enforced by `/task close` and by `move-state.mjs <issue> done`. Bypassing
them is a process violation, not a shortcut. Closing or moving an issue to Done while any
required box is unchecked will be refused.

0. **Bootstrap is fail-closed.** If steps 1–7 of "Required steps before writing any code" do not all succeed, STOP and report `STATUS: BLOCKED bootstrap-step-<N>: <reason>` before editing any source file. See rationale.

1. **Deep Dive is mandatory before any code changes.** Complete the deep-dive analysis (step 2 below), append it to the issue body (step 3), and run `/task check "Deep dive complete"` BEFORE editing any source file in service of this issue.

2. **Every Definition of Done item and Acceptance Criteria checkbox must be individually verified.** For each DoD checkbox and every Acceptance Criteria item, verify by inspection AND by running the relevant tests, builds, or commands; then check the box. Every Acceptance Criteria checkbox must carry an `aitm-verified-by` HTML comment marker, and every command named there — standard or non-standard — must appear as a checkbox under the issue-specific `### Verification Commands` section so the sandbox actually runs it (#231 closed the standard-command exemption hole). Never bulk-check; never check preemptively.

3. **All pre-close checkboxes must be checked before close.** Before `/task close` or moving the issue to Done, every user-verifiable `- [ ]` in the issue body MUST be `- [x]`. The pre-close gate WILL refuse if any pre-close box is unchecked. No env override exists — legitimate abandonment moves through the GitHub Projects UI.

4. **Move to Done is gated.** `move-state.mjs <issue> done` refuses if Deep Dive or any other pre-close box is unchecked. Normal path: `/task close` validates, flushes timing, then moves to Done.

5. **Agents MUST NOT run `/task review` or `/task close`. The terminal agent action is reporting `CODE_COMPLETE`.** Checking all boxes means "orchestrator should now call `/task review`" — NOT permission for the agent to call `/task review` or `/task close`. `/task review` is an orchestrator action; `/task close` is a human action. Agents running either is a process violation.

6. **Epic AC/DoD checkboxes may not be checked before all sub-issues reach Review.** For issues whose title begins with `EPIC:`, no AC or DoD checkbox may be ticked until every linked sub-issue has reached Review. The sub-issue lifecycle IS the verification.

7. **Pause the timer before asking the user a blocking question; resume after they answer.** Run `/task pause "pause for question"` BEFORE asking, `/task start "question answered"` AFTER they answer. Does NOT apply to rhetorical or in-flight prose questions you answer yourself. See rationale for `reviewPauseThresholdMin` semantics.

8. **Skip collapsed `<details>` blocks unless told to expand.** Treat wrapped Deep-Dive Analysis content as already-applied context — do not re-read it on pickup unless explicitly asked to revisit scope.

9. **Checkpoint Pause — re-read the conversation queue before any state transition.** Re-read the most recent user messages at every trigger below. If the latest message is unacknowledged or contains a question not yet addressed, halt and respond first — do not advance state. Triggers:
   - Before `/task` state moves (`refine`, `plan`, `develop`, `test`, `review`, `done`).
   - Before switching active issue (`/task #N` when already bound to a different `#M`).
   - Before closing an issue.
   - Before parallel-agent fan-out.

10. **Field units — `estimate` is hours; timing fields are minutes.** The board's `Estimate` is hours; `engagedTime`, `sessionTime`, `reviewTime` are minutes. If you read these directly (board API, field-DB JSON), do not compare them raw.

11. **Review Notes drive the Drivers section in the delta comment.** `/task approve` writes a `### 📝 Review Notes` comment (stdin-prompted under human review; auto-derived under `TT_FULL_AUTO=1` and tagged `<!-- aitm-review-notes-source: auto -->`). The close-time `### 📊 Review delta` reads it.

12. **Full-Auto approvals leave a visible footnote under DoD.** Under `TT_FULL_AUTO=1`, `/task approve` writes a blockquote footnote between `<!-- aitm-full-auto-footnote:start -->` and `<!-- aitm-full-auto-footnote:end -->`. `gh-edit-guard` protects the delimiters; do not strip them. A `lifecycle-tick-noop` stderr warning means the DoD checklist label is missing or legacy.

13. **Post-Compact/Clear Recovery — boot index is authoritative.** After any compact, clear, or fresh session, follow [`.ai-task-manager/session-boot.md`](./session-boot.md) before the first verb: re-read every Tier-1 file, discard prior `aitm-skill-loaded:*` sentinels, then emit `aitm-boot-recovered:<session-id>:<timestamp>`. Treating a compacted paraphrase as the rule is a process violation.

14. **On mistakes — stop and surface, do not self-correct.** If you discover you have taken a wrong action (created a duplicate issue, used `gh issue close` directly, skipped the deep dive, dispatched agents without verifying state), STOP. Announce what happened, why it was wrong, and propose 2–3 resolution options. Wait for explicit instruction before proceeding.

## Sequence rules

**Child sub-issues may not lead the parent epic in state.** The `promote <child> <target>` verb refuses when the parent epic's state is lower than the child's requested target. The gate is the `child-cannot-lead-epic` invariant.

Children do **not** all have to reach `refine` before the epic may move to `plan` — that exit-gate requirement was retired. Instead, children flow through the verb chain under these rules:

- **Discovered work** may be created and driven `refine → review` (never straight to `done`) at any epic state **except a Done epic** — a Done epic must not grow new children. The `childCreationAllowedAtEpicState` guard refuses `--shape sub-issue` creation under a Done parent (override `AITM_SKIP_PARENT_STATE_GATE=1`).
- **WIP rule:** at most one child advances out of Refine per epic at a time. A child _parked_ on a dependency (carrying an `aitm-blocked-by` body marker) does not count against the budget, and a blocker may run ahead of the parked sibling it unblocks. Enforced by `planRefineWipGate` at the child Refine → Plan transition. No env override exists.
- **Dependency representation:** a parked child carries the `BLOCKED` label plus an `aitm-blocked-by: #N[, #M]` body marker.
- **Dependency-aware JIT selection:** the next child pulled Refine → Plan prefers blockers and excludes any child whose blockers are not all `done`.
- **Done-block unchanged:** a parent epic cannot close until every child is `done`; when a blocker reaches `done`, its dependents are auto-unparked.

## Required steps before writing any code

0. **Post-Compact/Clear Recovery.** If this session was just compacted, cleared, or freshly started — i.e. you see a "This session is being continued from a previous conversation" banner, a fresh-session preamble, or no `aitm-boot-recovered:*` sentinel in the live context — follow [`.ai-task-manager/session-boot.md`](./session-boot.md) before any other step below. Treat any compacted summary of those files as a hint only, not as the rule itself. Then emit a one-shot `aitm-boot-recovered:<session-id>:<timestamp>` sentinel and continue with step 1.

1. **Move the issue to `in-progress` and capture your entry word count:**

   ```bash
   node node_modules/ai-task-manager/scripts/gh/move-state.mjs <this-issue-#> in-progress
   node node_modules/ai-task-manager/scripts/task-tracker/task-tracker.mjs words-count
   ```

   Record the output as `W_start` and the current wall-clock time as `T_start`. You will use these at exit to compute `words_delta` and `duration_minutes` for your `CODE_COMPLETE` report. When implementation is complete, report `CODE_COMPLETE` and stop — the orchestrator calls `/task review #N --duration-minutes M --words W`.

2. **Run a deep-dive analysis.** Read the relevant code paths, validate the Scope's assumptions still hold, identify concrete files to edit, define the test approach, surface new risks. Use `rg`, `rg --files`, repository docs, and any relevant `AGENTS.md` files to build the file map from the current checkout.

3. **Append the deep dive to the issue body, then stamp the completion marker.** Full procedure (placement gate, `--body-file` requirement, required subsections, AC `aitm-verified-by` binding, `### Verification Commands`, Dependency Map) is in [`references/deep-dive-procedure.md`](./references/deep-dive-procedure.md). The canonical writer is `ensureDeepDive (scripts/task-tracker/lib/deep-dive.mjs)` — one transactional `mutateIssueBody` call. Pass `prose` to author the section + stamp the `<!-- aitm-deep-dive-posted: ... -->` marker (the first of `planDeepDiveGate`'s three signals) in a single transaction. Do not hand-write the posted marker. After `ensureDeepDive` returns, run `/task check "Deep dive complete"`, which writes the hidden `<!-- aitm-deep-dive-complete: ... -->` marker (the second signal) via the same primitive (`ensureDeepDive({ complete: true })`). No visible checkbox is needed.

4. **Re-evaluate Estimate and Size.** If the deep dive changes either, update project fields and post a comment. If Size jumps ≥ 2 tiers, pause and wait for human direction.

5. **If this is an Epic — validate sequencing and fan out sub-issues.** Skip for plain sub-issues. Full procedure (sub-issue Scope review, Sequence validation, validated Dependency Map comment, fan-out and re-dispatch loop, parent-epic `/task review` rule, human notification only after epic reaches Review) is in [`references/deep-dive-procedure.md`](./references/deep-dive-procedure.md).

6. **Spawn sibling sub-issues if needed.** Each sibling gets a fresh Pickup Directive injected, the same priority as the parent epic, and a "Spawned from: #<this-issue>" link.

7. **Proceed with implementation.** Branch: `<this-issue-#>-<short-slug>`. Use `superpowers:using-git-worktrees`. Every commit references this issue and parent epic:

   ```
   <scope>: short summary

   Closes #<this-issue-#>
   EPIC: #<parent-epic-#>
   ```

## Status Reporting

Report exactly one status. Do not use `DONE` or `DONE_WITH_CONCERNS` — those terms are ambiguous under the AITM close contract and will cause orchestrators to advance the sequence prematurely.

- `CODE_COMPLETE` — implementation finished; all verifiable boxes checked; list any unchecked items and why they could not be verified. Include `duration_minutes` and `words_delta`. Do NOT call `/task review`. The orchestrator calls `/task review #N --duration-minutes M --words W`. This status means ready for human review via the orchestrator; it is NOT permission to close.
- `ISSUE_READY_FOR_REVIEW` — orchestrator reports this after `/task review` succeeds and the issue reaches Review. Notify the human. Do NOT run `/task close`.
- `BLOCKED` — cannot proceed without orchestrator or human intervention. Describe exactly what is needed.

Full status table, orchestrator rules, and the pre-`CODE_COMPLETE` agent checklist (including the `words-count` exit step) live in [`references/status-reporting.md`](./references/status-reporting.md). If a DoD item cannot be verified by the agent (live-env observation, third-party review), leave it unchecked, report `CODE_COMPLETE`, and list it.

**Stop here. Report `CODE_COMPLETE`. Do NOT call `/task review`.**
