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

### Human Gates

Two transitions require explicit human approval. Both are toggleable via config; defaults preserve today's behavior (human required).

| Gate | Config key | Default | Bypass behavior when `false` |
|---|---|---|---|
| Analyze → Development | `gateAnalysisToDevelopment` | `true` | `/task approve #N` auto-writes the approval marker and moves the issue; emits a `gate-bypassed` status. |
| Review → Done         | `gateReviewToDone`         | `true` | `/task close` posts a `gate-bypassed` timing-log row instead of refusing. |

The Analyze → Development gate is enforced by a hidden marker `<!-- aitm-plan-approved: <ISO ts> -->` written into the issue body by `/task approve #N`. `move-state.mjs` refuses (exit 4, `BLOCKED: analyze -> development requires <!-- aitm-plan-approved: <ts> --> marker`) when the marker is missing and the current state is Analyze. The legacy `- [ ] Plan approved by human` checkbox is no longer recognized — run `scripts/task-tracker/migrate-plan-approved.mjs <issue#>` on any in-flight issue that still carries it.

The Review → Done gate is enforced by a hidden marker `<!-- aitm-review-approved: <ISO ts> -->` written into the issue body by `/task approve-review #N`. `/task close` refuses (exit 7, `PROMPT_REQUIRED: review-approval #N`) when the marker is missing and `gateReviewToDone=true`.

The Analyze → Development gate also requires a hidden marker `<!-- aitm-deep-dive-complete: <ISO ts> -->` written into the issue body by `/task analyze #N` after the Deep-Dive Analysis section is posted. `/task approve #N` refuses with `deep-dive-required` when the marker is missing. As with the other two markers, the legacy visible `- [x] Deep dive complete` AC checkbox is no longer recognized — the marker is the sole source of truth. All three marker helpers live in [`scripts/task-tracker/lib/markers.mjs`](../../scripts/task-tracker/lib/markers.mjs) and write to the body only via the canonical encoding (legacy fenced field-DB blocks are normalized on the same write).

**`--answer yes` does not satisfy human gates.** `/task close #N --answer yes` when no review-approval marker is present exits 8 with a refusal message. The only ways to satisfy the gate are running `/task approve-review #N` (human) or setting `gateReviewToDone false` in config. `--answer yes|no` still works at the dirty-workspace prompt, which is operational, not a human gate.

Toggle a gate (project-wide, persisted to `.claude/task-tracker.json`):

```bash
/task config gateAnalysisToDevelopment false   # full-auto Analyze → Development
/task config gateReviewToDone false            # full-auto Review → Done
```

### Session-scoped auto-mode (`/task auto`)

For one-off parallel batches (e.g., dispatching several sub-issues without pausing on each human gate), prefer **session-scoped overrides** over editing project config. They live in `.claude/task-tracker.session.<session-id>.json` (gitignored) and apply only to the current Claude session.

```bash
/task auto both      # both gates OFF (full auto)
/task auto analyze   # analyze→dev OFF, review→done ON
/task auto review    # analyze→dev ON,  review→done OFF
/task auto off       # both gates ON (safe default)
/task auto reset     # clear session override → fall back to project config
```

**Precedence**: session override > project config > built-in defaults (both gates ON).

**Per-parent prompt**: when both `gateAnalysisToDevelopment` and `gateReviewToDone` are *not* explicitly set in project config, the first `/task #N` bind under a new parent emits a `PROMPT_REQUIRED: auto-mode #<rootKey>` line so the skill can ask the user which gates to toggle. The `lastPromptedParent` field is keyed by `parentOf(#N) || #N`, so further binds under the same parent do not re-prompt; switching to a different epic does.

**Orphan GC**: on `SessionStart`, override files older than `deadSessionMaxAgeMs` (default 7 days) are swept. Tunable via `/task config deadSessionMaxAgeMs <ms>`.

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

### Three-stage estimation

Size and Estimate move through three distinct stages. Only the first two ever mutate fields; the third is read-only.

| Stage | Verb that fires it | Mutates fields? | Comment surface |
|---|---|---|---|
| Grooming | (manual at issue creation / groom) | Yes — initial set | n/a |
| Analysis | `/task approve <N>` (analyze → development boundary) | Yes — rebucket from Deep Dive | `### 🔁 Analysis re-estimate` |
| Review | `/task close <N>` (review → done) | **No** — read-only delta | `### 📊 Review delta` |

**Analysis re-estimate.** When `/task approve <N>` advances an issue from Analyze to Development, the harness re-evaluates Size + Estimate from the Deep-Dive Analysis section:

- Signals: count of files-to-edit, plan steps, identified risks, and `Depends on:` dependencies.
- Score → bucket → median hours. Constants live in `scripts/task-tracker/lib/reevaluate-estimate.mjs`.
- If the new (size, estimate) match the current values, the re-estimate is a silent no-op.
- If they differ within one tier, the project fields and body fields-block are updated and a `### 🔁 Analysis re-estimate` audit comment is posted with a from→to table.
- If they differ by **≥2 size tiers**, no fields are mutated — instead a `⚠ HUMAN ATTENTION` comment is posted under the same header so a human can resolve the scope question.

Override: set `TASK_TRACKER_SKIP_REEVAL=1` to skip the analyze-stage hook. The bypass still posts a one-line audit comment so the gap is visible per-issue.

**Review delta.** When `/task close <N>` advances an issue to Done, the harness posts a read-only retrospective comment recording Estimate vs. Actual:

- Reads `Estimate` (hours) and `engagedTime` (hours, the "Actual Hours" board field) from the project board.
- Posts a `### 📊 Review delta` comment with the Δ percentage and a footer noting that Size/Estimate are not modified.
- If `Actual` is missing, the cells render as `—` and a fallback note is included; no crash.

Override: set `TASK_TRACKER_SKIP_DELTA=1` to skip the close-stage hook. The bypass still posts a one-line note so the gap is visible per-issue.

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

## Backlog healing

`scripts/task-tracker/heal-backlog.mjs` walks every issue in the project board and performs three jobs in one pass:

1. **Encoding normalization** — strips legacy fenced `<!-- ai-task-manager:fields:start/end -->` blocks and emits a single `<!-- aitm-fields: ... -->` HTML comment; converts visible "Plan approved by human" checkboxes into `<!-- aitm-plan-approved: <ts> -->` markers. Vestigial AC bullets (`- [x] approved by Human`, `- [x] Deep dive complete`) are stripped only when the corresponding hidden marker is present — this preserves history on issues that predate the marker model.
2. **Timing reconciliation** — parses the `⏱ Timing Log` comment, recomputes `engagedTime` / `sessionTime` / `reviewTime` / `startTime` from the rollup, rewrites the fields-DB if they disagree, and posts a `### 🛠 Backlog heal` comment with a deltas table. Static fields (`priority`, `size`, `estimate`, `sequence`) are never touched.
3. **Schema validation** — fetches the project's GraphQL field schema and diffs against the canonical set; reports missing / extra fields, type mismatches, and option drift (including Status column options). Exit code 3 on drift.

### Usage

```bash
# Dry run, all issues (default) — writes report to tmp/heal-backlog-<ISO>.md
node scripts/task-tracker/heal-backlog.mjs

# Apply changes for real
node scripts/task-tracker/heal-backlog.mjs --apply

# Scope to specific issues
node scripts/task-tracker/heal-backlog.mjs --scope 41,87 --apply

# Filter by state
node scripts/task-tracker/heal-backlog.mjs --state open
node scripts/task-tracker/heal-backlog.mjs --state closed

# Skip schema validation
node scripts/task-tracker/heal-backlog.mjs --no-schema-check

# Run apply despite schema drift (not recommended)
node scripts/task-tracker/heal-backlog.mjs --apply --ignore-schema-drift
```

### Idempotence

Re-running on a healed body is a no-op: encoding is already canonical, timing fields already match the rollup, plan-approved marker is already in place. The heal comment is only posted when there are deltas to surface.

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

---

## Load-Once Skill Files

Frequently-loaded skill detail files (`skill/adapters/claude/SKILL.md`, `skill/shared/SKILL.md`, `templates/pickup-directive.md`) carry an `<!-- aitm-skill-version: X.Y.Z -->` marker stamped from `package.json#version` at `npm install` time. The installed Claude shim instructs the agent to:

1. Read just the marker line from each file.
2. Grep the current conversation context for `aitm-skill-loaded:<id>:<version>`.
3. Skip the full read when the sentinel is present; otherwise read fully and emit the sentinel.

After `/clear`, `/compact`, or `npm update ai-task-manager`, the sentinel/marker mismatches and a reload happens automatically. v1 is text-instruction only — no hook enforces the contract. The `AITM_FORCE_STAMP=1` env var makes install stamp dev checkouts (otherwise stamping skips when `.git` is present at the package root).
