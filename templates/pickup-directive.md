# Pickup Directive — Agent Instructions

These steps apply on first pickup of any issue with an unchecked `- [ ] Deep dive complete`
checkbox. If the checkbox is already checked, skip to step 6.

## ⛔ Hard Rules — Do Not Skip

These rules are enforced by `/task close` and by `move-state.mjs <issue> done`. Bypassing
them is a process violation, not a shortcut. Closing or moving an issue to Done while any
required box is unchecked will be refused.

0. **Bootstrap is fail-closed. If steps 1–7 of "Required steps before writing any code" do not all succeed, STOP.**
   - If `task-tracker.mjs <issue> --role agent` reports `config-not-found`, if `move-state.mjs` cannot move the issue to `in-progress`, if `words-count` returns no value, or if any other bootstrap step exits non-zero — you MUST report `STATUS: BLOCKED` with the failing step name (`bootstrap-step-<N>: <reason>`) and stop before editing any source file.
   - "It printed a warning but I kept going" is a process violation. The bootstrap is the contract that registers your session, moves the issue, and posts the `start` timing row. If the contract did not complete, your work cannot be accounted for and will be discarded.
   - The most common cause is a worktree that was created without `.ai-task-manager/` (the directory is gitignored, so `git worktree add` doesn't carry it). The orchestrator must seed it via `scripts/task-tracker/seed-worktree.mjs <worktree>` BEFORE booting you. If you hit this, BLOCK — do not try to recreate the config yourself.

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
   - `move-state.mjs <issue> done` will refuse if Deep Dive is unchecked or any other
     pre-close box in the issue body is unchecked. Same audited override applies.
   - Normal path: run `/task close` — it validates, flushes timing, then moves to Done.

5. **Agents MUST NOT run `/task review` or `/task close`. The terminal agent action is reporting `CODE_COMPLETE`.**
   - Once implementation is complete and all verifiable checkboxes are checked, capture
     exit word count, then report `CODE_COMPLETE` with `duration_minutes` and
     `words_delta`. The orchestrator calls `/task review #N --duration-minutes M --words W`.
   - Checking all boxes means "orchestrator should now call `/task review`" — NOT
     permission for the agent to call `/task review` or `/task close`.
   - `/task review` is an orchestrator action. `/task close` is a human action.
     Agents running either is a process violation.

6. **Epic AC/DoD checkboxes may not be checked before all sub-issues reach R4R.**
   For issues whose title begins with `EPIC:`, no Acceptance Criterion or Definition of
   Done checkbox may be ticked until every sub-issue linked to the epic has passed through
   In Review verification and reached R4R status. Checking epic-level boxes during
   deep-dive or mid-implementation is a process violation, even if the outcome appears
   correct by inspection. The sub-issue lifecycle IS the verification.

7. **Pause the timer before asking the user a blocking question; resume after they answer.**
   - Any time you must stop work to ask the user a clarification, design choice, missing-info, or scope-confirmation question and wait for an answer, run `/task pause "pause for question"` BEFORE asking. Run `/task start "question answered"` AFTER they answer, before any further tool calls. The reason strings are positional args and land in the `description` column of the issue's `⏱ Timing Log`.
   - Does NOT apply to rhetorical or in-flight prose questions you answer yourself.
   - Why: the timer measures focused engagement. Idle time waiting for a human answer corrupts `engagedTime`/`sessionTime` and the value report.
   - Pause→resume gaps ≤ `reviewPauseThresholdMin` (default 5 min, configurable in `.ai-task-manager/task-tracker.json`) count as **Review Time** and roll into **Engaged Time**; longer gaps are excluded as idle.

8. **On mistakes — stop and surface, do not self-correct.**
   If you discover you have taken a wrong action (created a duplicate issue, used
   `gh issue close` directly, skipped the deep dive, dispatched agents without
   verifying state), STOP immediately. Do not attempt to fix the mistake yourself.
   Announce what happened, why it was wrong, and propose 2–3 resolution options.
   Wait for explicit orchestrator or human instruction before proceeding.

## Required steps before writing any code

1. **Move the issue to `in-progress` and capture your entry word count:**
   ```bash
   node_modules/ai-task-manager/scripts/gh/move-state.mjs <this-issue-#> in-progress
   node node_modules/ai-task-manager/scripts/task-tracker/task-tracker.mjs words-count
   ```
   Record the output as `W_start` and the current wall-clock time as `T_start`. You will
   use these at exit to compute `words_delta` and `duration_minutes` for your
   `CODE_COMPLETE` report. When implementation is complete, report `CODE_COMPLETE` and
   stop — the orchestrator calls `/task review #N --duration-minutes M --words W`.

2. **Run a deep-dive analysis.** Read the relevant code paths, validate the Scope's
   assumptions still hold, identify concrete files to edit, define the test approach,
   surface new risks. Cross-reference `docs/agent-context/file-index.yaml` and any
   relevant `AGENTS.md` files.

3. **Append the deep dive to the issue body**, then flip the checkpoint checkbox.

   > ⚠️ **Never use `gh issue edit --body "..."`** — it replaces the entire body.
   > Always use `--body-file`.

   > 📐 **Placement is mandatory.** Append the `## Deep-Dive Analysis (YYYY-MM-DD)`
   > section AFTER the `## Pickup Directive` heading block (after its trailing
   > `- [ ] Deep dive complete` checkbox) and BEFORE the
   > `<!-- ai-task-manager:fields:start -->` marker. The canonical body order is
   > Scope → Acceptance Criteria → Definition of Done → Pickup Directive → Deep-Dive
   > Analysis → fields-block. The `deep-dive-placement` body gate refuses
   > in-review/r4r/done moves when the Deep-Dive heading is present in any other
   > position.

   ```bash
   gh issue view <this-issue-#> --json body --jq .body > ./tmp/body.md
   # Append "## Deep-Dive Analysis (YYYY-MM-DD)" section to ./tmp/body.md
   # — placed AFTER the Pickup Directive block and BEFORE the fields-block start marker.
   gh issue edit <this-issue-#> --body-file ./tmp/body.md
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

   d. Fan out in sequence order. Spawn agents for all Sequence-1 sub-issues simultaneously. Stay anchored to the epic (`/task #<epic>`) while agents work. When an agent returns, it will report `CODE_COMPLETE`, `ISSUE_READY_FOR_REVIEW`, or `BLOCKED` (see Status Reporting above). For `CODE_COMPLETE`: extract `duration_minutes` and `words_delta`, call `/task review #N --duration-minutes M --words W` — on failure post a comment with failed criteria, revert to In Progress, and re-dispatch; on success the sub-issue moves to R4R. For `ISSUE_READY_FOR_REVIEW`: the sub-issue is already in R4R — do NOT run `/task close`.

   **When every sub-issue in the current sequence reaches R4R, the orchestrator must immediately call `/task review #<epic>` on the parent epic.** This is orchestrator work, not human work. Running `/task review` on the epic is what moves the epic to R4R and gates the human notification. Do not notify the human until the epic itself is in R4R.

   Once the epic reaches R4R, report `ISSUE_READY_FOR_REVIEW` and notify the human: "Epic #X and sub-issues #A–#Z are in R4R awaiting your review and `/task close`." Do NOT run `/task close`. Only after **every** Sequence-N issue reaches Done via human-approved `/task close` should you spawn Sequence-(N+1). **Do not pick up work from other epics or solo tasks while this epic is in progress.**

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
| `CODE_COMPLETE` | Implementation finished. All verifiable boxes checked; any boxes requiring human/live-env observation noted as unverifiable. Agent stops — orchestrator calls `/task review #N --duration-minutes M --words W` using values from this report. | List any unchecked items and why they could not be verified. Include `duration_minutes` and `words_delta`. Do NOT call `/task review`. |
| `ISSUE_READY_FOR_REVIEW` | Orchestrator reports this after `/task review` succeeds and the issue reaches R4R. | Orchestrator notifies the human for approval. Do NOT run `/task close`. |
| `BLOCKED` | Cannot proceed without orchestrator or human intervention. | Describe exactly what is needed. |

**Rules for orchestrators:**
- On receiving `CODE_COMPLETE` from an agent: extract `duration_minutes` and
  `words_delta` from the report, then call `/task review #N --duration-minutes M --words W`.
  If it exits non-zero (verification failed), post a comment on the issue listing the
  failed criteria, confirm the issue has been reverted to In Progress, and re-dispatch
  the agent. Loop until `/task review` succeeds.
- On `/task review` success (issue reaches R4R): report `ISSUE_READY_FOR_REVIEW` and
  notify the human. Do NOT run `/task close`.
- A sub-issue sequence is complete only after all issues in that sequence reach **Done**
  via the `/task review` → human approval → `/task close` path.
- Do not advance to the next sequence while any issue has not been explicitly closed by
  a human.

**If a DoD item cannot be verified by the agent** (e.g., it requires a human to observe
a live environment, or it involves a third-party review), leave that checkbox unchecked,
report `CODE_COMPLETE`, and list the unverified items. Do not check DoD boxes you cannot
actually verify.

## Before reporting CODE_COMPLETE — agent steps

> ⛔ **All checkboxes checked means "ready for orchestrator to call `/task review`" — NOT
> permission for the agent to call `/task review` or `/task close`.**
> The agent's terminal action is reporting `CODE_COMPLETE` and stopping.

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

**Word count — exit step (agent sessions only):**
Before reporting `CODE_COMPLETE`, record your final word count:
```
node node_modules/ai-task-manager/scripts/task-tracker/task-tracker.mjs words-count
```
Compute `words_delta = W_end - W_start` (where `W_start` was captured at agent entry —
see step 1). Include both values in your `CODE_COMPLETE` report.

**Stop here. Report `CODE_COMPLETE`. Do NOT call `/task review`.**
The orchestrator calls `/task review #N --duration-minutes M --words W`, which moves the
issue through In Review → R4R (or reverts to In Progress on failure and re-dispatches
this agent). Duration and word count come from the agent's `CODE_COMPLETE` report.
