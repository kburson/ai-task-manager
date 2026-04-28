# Pickup Directive — Agent Instructions

These steps apply on first pickup of any issue with an unchecked `- [ ] Deep dive complete`
checkbox. If the checkbox is already checked, skip to step 6.

## Required steps before writing any code

1. **Start tracking and move the issue to `in-progress`:**
   ```
   /task #<this-issue-#>
   ```
   This writes a `start` row to the timing log, opens the issue, and moves the Kanban card to `in-progress` in one step. Run it in the agent's own git worktree — state is per-worktree, so it will not overwrite the orchestrator's active task.

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

6. **Spawn sibling sub-issues if needed.**

   When the deep dive surfaces work that is out of scope for this issue but belongs to the same epic, create a new sub-issue rather than expanding scope. Each spawned issue is a sibling — linked to the parent **epic**, not to this sub-issue (GitHub supports only one level of nesting).

   **Issue body — always open with the provenance block:**
   ```markdown
   Spawned from: #<this-issue-#>
   Parent EPIC: #<parent-epic-#>
   Priority: <P0|P1|P2>. Size: <XS|S|M|L|XL> (<estimate>h est).

   ## Scope
   <what was discovered and why it needs its own issue>

   ## Acceptance Criteria
   - [ ] ...
   ```

   **Create the issue:**
   ```bash
   gh issue create \
     --title "<title>" \
     --body-file /tmp/spawned-body.md \
     --assignee <assignee from .claude/task-tracker.json> \
     --label "plan/<same-slug-as-parent-epic>" \
     --label "purpose/<inferred>"
   ```
   Capture the new issue number as `SPAWNED_N`. Get its node ID:
   ```bash
   gh issue view <SPAWNED_N> --json id --jq '.id'
   ```

   **Link to the epic as a sub-issue** (not to this issue):
   ```bash
   gh api graphql -f query='
     mutation($parentId:ID!, $childId:ID!) {
       addSubIssue(input:{ issueId:$parentId, subIssueId:$childId }) {
         issue { number }
       }
     }
   ' -f parentId=<EPIC_NODE_ID> -f childId=<SPAWNED_NODE_ID>
   ```

   **Add to project, set Priority / Size / Estimate** — same commands as the backlog orchestration flow. Move to backlog:
   ```bash
   scripts/gh/move-state.sh <SPAWNED_N> backlog
   scripts/gh/set-priority.sh <SPAWNED_N> <p0|p1|p2>
   ```

   **Inject a Pickup Directive** into the body (append the standard block with the DoD checklist). Replace `<this-issue-#>` with `SPAWNED_N` and `<parent-epic-#>` with the epic number.

   **Post a comment on the epic** so the orchestrator sees the addition:
   ```bash
   gh issue comment <parent-epic-#> \
     --body "Spawned #<SPAWNED_N> from deep dive on #<this-issue-#>: <one-line reason>. Added to backlog."
   ```

   The spawned issue stays in **backlog** — it is not picked up in this session. The orchestrator decides when to fan it out.

7. **Proceed with implementation.** Branch: `<this-issue-#>-<short-slug>`. Use
   `superpowers:using-git-worktrees`. Every commit references this issue and parent epic:

   ```
   <scope>: short summary

   Closes #<this-issue-#>
   EPIC: #<parent-epic-#>
   ```

## Before closing

Review every item in the Definition of Done checklist in the issue body. For each item:
- Verify it is genuinely complete.
- Mark it with `/task check "<label>"`.

Only run `/task close` once all items are checked.
