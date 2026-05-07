# Pickup Directive — Agent Instructions

These steps apply on first pickup of any issue with an unchecked `- [ ] Deep dive complete`
checkbox. If the checkbox is already checked, skip to step 6.

## ⛔ Hard Rules — Do Not Skip

These rules are enforced by `/task close` and by `move-state.sh <issue> done`. Bypassing
them is a process violation, not a shortcut. Closing or moving an issue to Done while any
required box is unchecked will be refused.

1. **Deep Dive is mandatory before any code changes.**
   - You MUST complete the deep-dive analysis (step 2 below) and append it to the issue
     body (step 3) BEFORE editing any source file in service of this issue.
   - You MUST check `- [ ] Deep dive complete` (`/task check "Deep dive complete"`)
     immediately after appending. That check is the gate signal — do not run it ahead
     of time.
   - If you have already started writing code without doing this: stop, set aside the
     changes, and run the deep dive against the actual current state of the repo.

2. **Every Definition of Done item must be individually verified.**
   - For each DoD checkbox, verify completion by **inspection AND by running the
     relevant tests, builds, or commands**. Read the output. Then check the box.
   - Same rule for every Acceptance Criterion (including any added during the deep
     dive).
   - Do not check a related Acceptance Criterion or DoD box until every relevant
     Verification Commands checkbox has been checked.
   - Never bulk-check. Never check preemptively. "It looks done" is not verification.

3. **All pre-close checkboxes must be checked before close.**
   - Before `/task close` or moving the issue to Done, every user-verifiable `- [ ]`
     in the issue body MUST be `- [x]`. This includes the Deep Dive checkpoint,
     every Acceptance Criterion, every Verification Commands checkbox, and every
     Definition of Done item.
   - Close side effects such as moving to Done, writing the final timing row, and
     updating Actuals are owned by `/task close`; they are not DoD checkboxes.
   - The pre-close gate WILL refuse if any pre-close box is unchecked. Do not bypass.
   - The audited override `TASK_TRACKER_FORCE_DONE=1` exists for legitimate
     abandonment cases only (e.g., issue turned out invalid). It writes a visible
     bypass row to the timing log. Do not use it to skip verification.

4. **Move to Done is gated.**
   - `move-state.sh <issue> done` will refuse if Deep Dive is unchecked or any other
     pre-close box in the issue body is unchecked. Same audited override applies.
   - Normal path: run `/task close` — it validates, flushes timing, then moves to Done.

5. **Agents MUST NOT run `/task close`. The terminal agent action is `/task review`.**
   - Once every pre-close checkbox is checked, run `/task review <issue>` and stop.
   - All checkboxes checked means "ready for human review" — NOT permission to close.
   - No agent or orchestrator may infer human approval from checked boxes, passing
     tests, a completed self-review, or any automated signal.
   - `/task close` requires explicit human instruction (e.g., "close #N", "mark #N done").
     Running it without that instruction is a process violation.

## Required steps before writing any code

1. **Move the issue to `in-progress`:**
   ```bash
   node_modules/ai-task-manager/scripts/gh/move-state.sh <this-issue-#> in-progress
   ```

   When implementation is complete and the pre-verification phase begins (CODE_COMPLETE),
   move to In Review before starting the verification checklist:
   ```bash
   node_modules/ai-task-manager/scripts/gh/move-state.sh <this-issue-#> in-review
   ```

2. **Run a deep-dive analysis.** Read the relevant code paths, validate the Scope's
   assumptions still hold, identify concrete files to edit, define the test approach,
   surface new risks. Cross-reference `docs/agent-context/file-index.yaml` and any
   relevant `AGENTS.md` files.

3. **Append the deep dive to the issue body**, then flip the checkpoint checkbox.

   > ⚠️ **Never use `gh issue edit --body "..."`** — it replaces the entire body.
   > Always use `--body-file`.

   ```bash
   gh issue view <this-issue-#> --json body --jq .body > /tmp/body.md
   # Append "## Deep-Dive Analysis (YYYY-MM-DD)" section to /tmp/body.md
   gh issue edit <this-issue-#> --body-file /tmp/body.md
   ```
   Then flip the checkpoint: `/task check "Deep dive complete"`

   The deep-dive section must include:
   - **Files to edit** (full repo-relative paths)
   - **Step-by-step implementation plan**
   - **Test additions** — list each test file with a one-line description; append as new acceptance-criteria checkboxes
   - **Verification Commands** — exact commands to prove each criterion, appended
     as checkboxes and checked only after successful execution and output review:
     ```markdown
     ### Verification Commands

     - [ ] `node scripts/task-tracker/tests/config.test.mjs`
     - [ ] `node scripts/task-tracker/tests/state.test.mjs`
     ```
     Do not add words like `PASS`; the checked box is the proof.
   - **Identified risks** beyond the Scope
   - **Sibling sub-issues to spawn** (if any)
   - **Dependency map** (always include, even if no dependencies):
     ```
     ## Dependency Map
     Depends on: #N (reason), #M (reason)   ← or "none"
     Blocks: #P (reason), #Q (reason)        ← or "none"
     ```

4. **Re-evaluate Estimate and Size.** If the deep dive changes either, update project
   fields and post a comment. If Size jumps ≥ 2 tiers, pause and wait for human direction.

5. **If this is an Epic — validate sequencing and fan out sub-issues.**

   Skip this step for plain sub-issues. Only run it when picking up an issue whose title begins with `EPIC:` or that has linked sub-issues.

   a. Fetch all open sub-issues and read their Scope sections.

   b. Validate each sub-issue's `Sequence` field against actual code dependencies found in the deep dive. If a value is wrong, update it:
      ```bash
      gh project item-edit \
        --project-id <projectId> \
        --id <item-id> \
        --field-id <sequenceFieldId from .ai-task-manager/task-tracker.json> \
        --number <N>
      ```

   c. Post a validated dependency map comment on the epic:
      ```markdown
      ## Dependency Map (validated YYYY-MM-DD)
      Sequence 1 — start immediately, parallel: #N, #M
      Sequence 2 — after all Seq 1 close: #P, #Q
      Sequence 3 — after all Seq 2 close: #R
      ```

   d. Fan out in sequence order. Spawn agents for all Sequence-1 sub-issues simultaneously. Stay anchored to the epic (`/task #<epic>`) while agents work. When an agent returns, it will report `CODE_COMPLETE`, `ISSUE_READY_FOR_REVIEW`, or `BLOCKED` (see Status Reporting above). For `ISSUE_READY_FOR_REVIEW`: notify the human for review — do NOT run `/task close`; only after explicit human instruction should `/task close <N>` be run. For `CODE_COMPLETE`: resolve the listed unverified items before the human reviews. Only after **every** Sequence-N issue reaches Done via human-approved `/task close` should you spawn Sequence-(N+1). **Do not pick up work from other epics or solo tasks while this epic is in progress.**

6. **Spawn sibling sub-issues if needed.** Each sibling gets a fresh Pickup Directive
   injected, the same priority as the parent epic, and a "Spawned from: #<this-issue>" link.

7. **Proceed with implementation.** Branch: `<this-issue-#>-<short-slug>`. Use
   `superpowers:using-git-worktrees`. Every commit references this issue and parent epic:

   ```
   <scope>: short summary

   Closes #<this-issue-#>
   EPIC: #<parent-epic-#>
   ```

## Status Reporting

When returning control to an orchestrator after completing your work, report exactly one
of these statuses. Do not use `DONE` or `DONE_WITH_CONCERNS` — those terms are
ambiguous under the AITM close contract and will cause orchestrators to advance the
sequence prematurely.

| Status | Meaning | Required condition |
|---|---|---|
| `CODE_COMPLETE` | Implementation finished; one or more DoD items could not be verified by this agent and remain unchecked. | List every unchecked item explicitly. Orchestrator must not advance the sequence. |
| `ISSUE_READY_FOR_REVIEW` | Every AC, Verification Command, and DoD item this agent can verify is checked. `/task review` has been run. Issue is now In Review. | No unchecked pre-close boxes remain (agent-verifiable). Agent stops here — orchestrator notifies the human. Do NOT run `/task close`. |
| `BLOCKED` | Cannot proceed without orchestrator or human intervention. | Describe exactly what is needed. |

**Rules for orchestrators:**
- A sub-issue sequence is complete only after all issues in that sequence reach **Done**
  via the `/task review` → human approval → `/task close` path — not when agents report
  `CODE_COMPLETE` or `ISSUE_READY_FOR_REVIEW`.
- Do not advance to the next sequence while any issue in the current sequence has not
  been explicitly closed by a human.
- After receiving `ISSUE_READY_FOR_REVIEW`, notify the human for review. Do NOT run
  `/task close`. Only after the human instructs close should `/task close <N>` be run.

**If a DoD item cannot be verified by the agent** (e.g., it requires a human to observe
a live environment, or it involves a third-party review), leave that checkbox unchecked,
report `CODE_COMPLETE`, and list the unverified items. Do not check DoD boxes you cannot
actually verify.

## Before moving to In Review — agent steps

> ⛔ **All checkboxes checked means "ready for human review" — NOT permission to close.**
> No agent or orchestrator may infer human approval from checked boxes, passing tests,
> a completed self-review, or any automated signal. The issue stays In Review until a
> human explicitly instructs close.

Review every item in the Definition of Done checklist in the issue body. For each item:
- Verify it is genuinely complete (inspection + relevant test/command output).
- Run pre-commit hooks and verify they pass — this is a real DoD item, not a formality.
- Verify every relevant command in `### Verification Commands` has been run
  successfully, its output read, and its checkbox checked.
- Verify that all issue body checkboxes are ticked — this item is self-referential and
  must be the last box checked.
- Mark each verified item with `/task check "<label>"`.

Then verify every Acceptance Criterion the same way. Do not check the related Acceptance
Criterion or DoD item until the relevant Verification Commands checkbox is checked.

Run `/task review <issue>` to move the issue to **R4R** and flush/pause timing.
**This is the terminal agent action. Stop here regardless of context.**

Report `ISSUE_READY_FOR_REVIEW` and wait. The orchestrator (or human directly) will
review and, only upon explicit human instruction, run `/task close`.
