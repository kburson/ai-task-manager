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
   - Never bulk-check. Never check preemptively. "It looks done" is not verification.

3. **All checkboxes must be checked before close.**
   - Before `/task close` or moving the issue to Done, every `- [ ]` in the issue body
     MUST be `- [x]`. This includes the Deep Dive checkpoint, every DoD item, every
     Acceptance Criterion, and any checkpoints you added.
   - The pre-close gate WILL refuse if any box is unchecked. Do not bypass.
   - The audited override `TASK_TRACKER_FORCE_DONE=1` exists for legitimate
     abandonment cases only (e.g., issue turned out invalid). It writes a visible
     bypass row to the timing log. Do not use it to skip verification.

4. **Move to Done is gated.**
   - `move-state.sh <issue> done` will refuse if Deep Dive is unchecked or any other
     box in the issue body is unchecked. Same audited override applies.
   - Normal path: run `/task close` — it validates, flushes timing, then moves to Done.

## Required steps before writing any code

1. **Move the issue to `in-progress`:**
   ```bash
   node_modules/@burson.kendrick/claude-gh-task-manager/scripts/gh/move-state.sh <this-issue-#> in-progress
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
   - **Acceptance verification commands** — exact commands to prove each criterion
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
        --field-id <sequenceFieldId from .claude/task-tracker.json> \
        --number <N>
      ```

   c. Post a validated dependency map comment on the epic:
      ```markdown
      ## Dependency Map (validated YYYY-MM-DD)
      Sequence 1 — start immediately, parallel: #N, #M
      Sequence 2 — after all Seq 1 close: #P, #Q
      Sequence 3 — after all Seq 2 close: #R
      ```

   d. Fan out in sequence order. Spawn agents for all Sequence-1 sub-issues simultaneously. Stay anchored to the epic (`/task #<epic>`) while agents work. When all Sequence-N issues close, spawn Sequence-(N+1). **Do not pick up work from other epics or solo tasks while this epic is in progress.**

6. **Spawn sibling sub-issues if needed.** Each sibling gets a fresh Pickup Directive
   injected, the same priority as the parent epic, and a "Spawned from: #<this-issue>" link.

7. **Proceed with implementation.** Branch: `<this-issue-#>-<short-slug>`. Use
   `superpowers:using-git-worktrees`. Every commit references this issue and parent epic:

   ```
   <scope>: short summary

   Closes #<this-issue-#>
   EPIC: #<parent-epic-#>
   ```

## Before closing

Review every item in the Definition of Done checklist in the issue body. For each item:
- Verify it is genuinely complete (inspection + relevant test/command output).
- Mark it with `/task check "<label>"`.

Then verify every Acceptance Criterion the same way. Only run `/task close` once **every
checkbox in the issue body** is checked. The pre-close gate will refuse otherwise; do not
bypass it.
