# GitHub Issues & Kanban Workflow

Full workflow rules for projects using `claude-gh-task-manager`. These rules are written into a project's `CLAUDE.md` by convention — they tell Claude Code exactly how to manage issues, move Kanban states, and handle cleanup.

---

## Issue Creation

**Always assign new issues to yourself** — every `gh issue create` must include `--assignee <your-github-login>`.

```bash
gh issue create \
  --title "Feature: ..." \
  --body "## Description\n...\n\n## Acceptance Criteria\n- [ ] ..." \
  --label needs-triage \
  --assignee <your-login>
```

Immediately after creating, set **both** `Estimate` (hours) and `Size` on the GitHub Projects board — see `docs/guides/ai-value-framework.md` for the GraphQL mutations. Never leave an issue without these two fields.

---

## Kanban Board States

Issues move through five states:

```
Backlog → Ready → In Progress → In Review → Done
```

Move issues using the helper script (reads all IDs from `.claude/task-tracker.json`):

```bash
scripts/gh/move-state.sh <issue#> <state>
# States: backlog | ready | in-progress | in-review | done

scripts/gh/move-state.sh 42 in-progress
```

- Move to **In Progress** when `/task #N` activates an issue.
- Move to **In Review** when a PR is open.
- Move to **Done** only when all acceptance criteria are checked off.

---

## Priority Tiers

Use P0/P1/P2 only. Sub-issues must share the same Priority as their parent epic — mismatched priority causes sub-issues to appear in the wrong swim lane.

```bash
scripts/gh/set-priority.sh <issue#> <priority> [--cascade]
# Priorities: p0 | p1 | p2

# Always use --cascade when setting priority on an epic:
scripts/gh/set-priority.sh 42 p1 --cascade
```

---

## Sub-Issues Hierarchy

Use native GitHub sub-issues to track epic completion. **A parent issue cannot be marked Done until all child issues are complete.**

Link a new issue as a sub-issue of its parent epic:

```bash
# Get the parent issue's node ID
PARENT_ID=$(gh api graphql -f query='{ repository(owner:"<owner>", name:"<repo>") { issue(number:<N>) { id } } }' --jq '.data.repository.issue.id')

# Get the child issue's node ID
CHILD_ID=$(gh api graphql -f query='{ repository(owner:"<owner>", name:"<repo>") { issue(number:<M>) { id } } }' --jq '.data.repository.issue.id')

# Link as sub-issue
gh api graphql -f query="mutation { addSubIssue(input: { issueId: \"$PARENT_ID\" subIssueId: \"$CHILD_ID\" }) { issue { id } } }"
```

Cross-link in issue bodies: use "Parent: #N" and "Blocked by: #M" in the issue description.

---

## Estimates and Size (required)

Every issue/sub-issue needs both fields set **before work starts**:

| Field | Type | Purpose |
|-------|------|---------|
| `Estimate` | Number (hours) | Mid-level human-equivalent hours — the ROI denominator |
| `Size` | Single select | XS/S/M/L/XL — coarse sizing for swim-lane views |

Size options: **XS** (1–2h), **S** (3–4h), **M** (6–10h), **L** (12–20h), **XL** (24h+).

See `docs/guides/ai-value-framework.md` for the sizing guide, field IDs after `init`, and GraphQL mutation snippets.

**At `/task #N` activation**: if either field is missing, set both before touching any code.

---

## Inline Update Cadence

If work traces to a GitHub issue, update it inline (not just at cleanup):

- Comment when a sub-phase lands: include the commit SHA, what landed, and what's deferred and why.
- Check off acceptance criteria checkboxes as they are met.
- Open new issues for follow-on work discovered during the session; cross-link them.

In git commit messages, reference issue numbers (`fixes #42`) to auto-link commits on GitHub.

---

## Cleanup Procedure

When the user says **"cleanup"**, execute in order:

1. **Update docs** — update any `docs/` files that reflect this session's work.

2. **Update GitHub issues** — for completed issues, post a session log comment using the template in `docs/guides/ai-value-framework.md`. Set `Actual Session Time` (minutes) and `Context Length` (words) fields on the board. Open follow-on issues; close completed ones with a resolution comment.

3. **Commit** — stage all changes and commit with a descriptive message referencing issue numbers.

4. **Post-commit issue updates** — after the commit lands:
   - Check off completed acceptance criteria.
   - Post a comment with the SHA + what landed + what's deferred.
   - Open follow-on issues and cross-link them.
   - Move completed sub-issues to Done: `scripts/gh/move-state.sh <N> done`.
   - Update the parent issue body with progress; move parent to Done when all children are complete.

5. **Feature value summary** — if a feature/epic completed this session, generate a value summary using the template in `docs/guides/ai-value-framework.md`. Post it as a comment on the parent epic issue.

6. **Compact** — `/compact` to free context for the next phase.

---

## Close Tracking (required)

At issue close, set these two fields on the GitHub Projects board:

- **Actual Session Time** — total active AI session minutes across all sessions touching this issue.
- **Context Length** — total reader-visible chat words across all sessions.

The `/task end` command (or `scripts/gh/move-state.sh <N> done`) handles this automatically when the task skill is active. If closing without the skill, set both fields manually via the GraphQL mutations in `docs/guides/ai-value-framework.md`.

---

## Planning Issues

Log planning and design sessions against a dedicated planning issue, not the implementation issue. This keeps the `Estimate / Engaged Hours` ratio clean for implementation work and makes planning cost visible on its own.

```bash
gh issue create \
  --title "Planning: <epic title>" \
  --body "Planning and design sessions for #<epic>. Log actual planning hours here." \
  --label planning \
  --assignee <your-login>
```

Use `/task plan` in Claude Code to open an untracked planning bucket; use `/task new <title>` to promote it to a real issue when the scope is clear.
