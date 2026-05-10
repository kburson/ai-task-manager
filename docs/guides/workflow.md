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

Issues move through seven states:

```
Backlog → Groom → Analyze → Development → Validate → Review → Done
```

Move issues using the helper script (reads all IDs from `.ai-task-manager/task-tracker.json`):

```bash
scripts/gh/move-state.mjs <issue#> <state>
# States: backlog | groom | analyze | development | validate | review | done

scripts/gh/move-state.mjs 42 development
```

- Move to **Groom** when an issue is being shaped (sized, AC drafted).
- Move to **Analyze** after the deep-dive analysis is posted.
- Move to **Development** when `/task #N` activates an issue and code work begins.
- **Validate** is entered automatically by `/task review` while the verification gate runs.
- Move to **Review** automatically when verification passes (ready-for-review).
- Move to **Done** only by `/task close` after a human approves.

### Sequence-as-wave-id

Sequence is a numeric field on each issue. Sub-issues sharing the same Sequence
form a wave: they may be dispatched in parallel, but a sub-issue at Sequence
N+1 cannot start until every Sequence-N sibling reaches Done. The
`wave-admission` gate enforces this on `/task analyze`. Solo issues with no
parent epic bypass the gate. See [DESIGN.md](../DESIGN.md) for the
discovered-sub-issue and same-wave-newcomer semantics.

### Backlog vs Todo (Groom)

Backlog and Todo (Groom) are not interchangeable — they encode different states of issue readiness:

- **Backlog** = raw, unvetted ideas. No `Size`, no `Estimate`, no fully-formed acceptance criteria required. Backlog is the idea inbox; pulling from Backlog requires shaping work first.
- **Todo (Groom)** = stories that are fully formed and ready to pick up. Acceptance criteria, `Size`, and `Estimate` are all set. Pulling from Groom never requires additional shaping.

When an agent or human files a new issue with full ACs and sizing already set, tether it to `--status groom`, not `backlog`. Plan-mode sub-issue creation is the one exception: those tether to `backlog` and flip to `groom`/`development` at fan-out time, because not every planned sub-issue is dispatched immediately.

`scripts/gh/project-tether.mjs` and `scripts/gh/move-state.mjs` emit non-blocking warnings when this rule is violated (e.g. tethering a sized + estimated issue to Backlog, or moving a sized issue back to Backlog).

---

## Priority Tiers

Use P0/P1/P2 only. Sub-issues must share the same Priority as their parent epic — mismatched priority causes sub-issues to appear in the wrong swim lane.

```bash
scripts/gh/set-priority.mjs <issue#> <priority> [--cascade]
# Priorities: p0 | p1 | p2

# Always use --cascade when setting priority on an epic:
scripts/gh/set-priority.mjs 42 p1 --cascade
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

### Post-Deep-Dive re-estimate

When `/task review #N` runs and the body gates pass, the harness re-evaluates `Size` and `Estimate` from the Deep-Dive Analysis section before moving the issue to Validate:

- Signals: count of files-to-edit, plan steps, identified risks, and `Depends on:` dependencies.
- Score → bucket → median hours. Constants live in `scripts/task-tracker/lib/reevaluate-estimate.mjs`.
- If the new (size, estimate) match the current values, the re-estimate is a silent no-op.
- If they differ within one tier, the project fields and body fields-block are updated and a `### 🔁 Post-Deep-Dive re-estimate` audit comment is posted.
- If they differ by **≥2 size tiers**, no fields are mutated — instead a `⚠ HUMAN ATTENTION` comment is posted under the same header so a human can resolve the scope question.

Override: set `TASK_TRACKER_SKIP_REEVAL=1` to skip the field writes. The bypass still posts an audit comment so the gap is visible per-issue.

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
   - Move completed sub-issues to Done: `scripts/gh/move-state.mjs <N> done`.
   - Update the parent issue body with progress; move parent to Done when all children are complete.

5. **Feature value summary** — if a feature/epic completed this session, generate a value summary using the template in `docs/guides/ai-value-framework.md`. Post it as a comment on the parent epic issue.

6. **Compact** — `/compact` to free context for the next phase.

---

## Close Tracking (required)

At issue close, set these two fields on the GitHub Projects board:

- **Actual Session Time** — total active AI session minutes across all sessions touching this issue.
- **Context Length** — total reader-visible chat words across all sessions.

The `/task end` command (or `scripts/gh/move-state.mjs <N> done`) handles this automatically when the task skill is active. If closing without the skill, set both fields manually via the GraphQL mutations in `docs/guides/ai-value-framework.md`.

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
