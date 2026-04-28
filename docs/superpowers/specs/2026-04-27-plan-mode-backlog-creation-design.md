# Plan-Mode Backlog Creation — Design Spec

**Date:** 2026-04-27
**Scope:** Extend `/task new` in SKILL.md to orchestrate epic + sub-issue creation from a spec already in conversation context.

---

## Problem

`/task new [title]` currently creates a single blank issue. When a planning session produces a full spec (epics, sub-issues, sizing, acceptance criteria), users must manually call `gh issue create` for every issue and wire up parent links by hand. This breaks the flow and loses the pickup directive injection.

## Goal

When `/task plan` is active and the user runs `/task new [title]`, Claude detects whether a spec is in context, confirms with the user, then orchestrates the full backlog creation: epic → sub-issues → field updates → parent links → pickup directive injection.

---

## Detection: Is Plan Mode Active?

Read `.claude/task-tracker-state.json` (via the CLI `status` or directly). If `active === "plan"`, plan mode is active. Otherwise fall through to existing `/task new` behavior.

---

## Trigger Flow

```
/task new [title]
  │
  ├─ active !== "plan" ──→ existing behavior (create one issue, start tracking)
  │
  └─ active === "plan"
       │
       └─ Claude asks:
            "I see a spec in context — use it to build out the full backlog?
             I'll create the epic, sub-issues, set sizing/priority, and inject pickup directives.
             (yes / no — no creates a single blank issue)"
               │
               ├─ no ──→ existing behavior
               │
               └─ yes ──→ Label Setup (see below) ──→ Backlog Orchestration
```

---

## Label Setup

Before creating any issues, establish two label sets.

### Master Plan Label

Derive a short slug from the epic title (lowercase, hyphenated, max 30 chars). Present it to the user:

> "I'll tag all issues in this plan with **`plan/nexus-auth`**. Accept or replace?"

Wait for confirmation. If the user provides a replacement, use that instead.

Create the label in the repo if it doesn't already exist:
```bash
gh label create "plan/<slug>" --color "#0075ca" --description "Plan: <full title>" 2>/dev/null || true
```

All issues (epic and sub-issues) receive this label.

### Purpose Labels

Standard set — create any that are missing before the first issue:

| Label | Color | When to apply |
|-------|-------|--------------|
| `purpose/infrastructure` | `#e4e669` | CI/CD, env setup, secrets, deployment, database migrations |
| `purpose/backend` | `#0e8a16` | API endpoints, business logic, data models, auth |
| `purpose/client` | `#1d76db` | UI components, pages, frontend state, CSS |
| `purpose/test` | `#f9d0c4` | Test suites, fixtures, coverage, quality tooling |
| `purpose/dx` | `#c5def5` | Developer experience: tooling, scripts, docs, onboarding |
| `purpose/security` | `#d93f0b` | Auth hardening, audits, vulnerability remediation |
| `purpose/data` | `#bfd4f2` | Analytics, exports, aggregations, reporting |

Claude assigns one or more purpose labels per issue by reading the scope. Apply all that fit — an issue can carry multiple purpose labels.

**Inference examples:**
- "Set up GitHub Actions CI" → `purpose/infrastructure`, `purpose/dx`
- "Implement MFA (TOTP)" → `purpose/backend`, `purpose/security`
- "Dashboard charts and visualizations" → `purpose/client`, `purpose/data`
- "Stripe webhook handler" → `purpose/backend`, `purpose/infrastructure`
- "CSV/JSON data export" → `purpose/backend`, `purpose/data`
- "Write user onboarding documentation" → `purpose/dx`

Create missing labels before the first `gh issue create`:
```bash
gh label create "purpose/<name>" --color "<hex>" --description "<description>" 2>/dev/null || true
```

---

## Backlog Orchestration

### Step 1 — Create the Epic

```bash
gh issue create \
  --title "EPIC: <title>" \
  --body "<epic-scope-section>" \
  --assignee <assignee-from-config> \
  --label "plan/<slug>" \
  --label "purpose/<inferred>" \
  [--label <defaultLabels-from-config> ...]
```

Capture the returned issue number as `<EPIC_N>`.

Immediately set fields on the project board:
- Size (XL for epics — or as declared in spec)
- Estimate (roll-up hours from spec)
- Priority (P0 unless spec says otherwise)
- Move to Backlog state via `move-state.sh <EPIC_N> backlog`

### Step 2 — Create Sub-Issues

For each sub-issue section in the spec (in order):

1. Build the issue body:
   - Include the sub-issue's Scope section
   - Include the Acceptance Criteria checkboxes
   - Append the Pickup Directive block (see Pickup Directive Injection below)

2. Create the issue:
   ```bash
   gh issue create \
     --title "<sub-issue-title>" \
     --body "<assembled-body>" \
     --assignee <assignee-from-config> \
     --label "plan/<slug>" \
     --label "purpose/<inferred>" \
     [--label "purpose/<inferred2>" ...] \
     [--label <defaultLabels-from-config> ...]
   ```
   Capture the returned number as `<SUB_N>`.

3. Set fields: Size, Estimate, Priority from spec values.

4. Move to Backlog: `move-state.sh <SUB_N> backlog`

5. Link to epic via GraphQL `addSubIssue` mutation:
   ```bash
   gh api graphql -f query='
     mutation($parentId:ID!, $childId:ID!) {
       addSubIssue(input: { issueId: $parentId, subIssueId: $childId }) {
         issue { number }
       }
     }
   ' -f parentId=<EPIC_NODE_ID> -f childId=<SUB_NODE_ID>
   ```
   Get node IDs via `gh issue view <N> --json id`.

### Step 3 — Report the Issue Map

After all issues are created, print a summary table:

```
Epic:  #42  EPIC: User Authentication & Identity
  Sub: #43  Implement email/password registration and login     S  3h  P0
  Sub: #44  Add Google OAuth integration                        M  4h  P0
  Sub: #45  Implement MFA (TOTP)                               L  6h  P0
  Sub: #46  Session management and token refresh               M  3h  P0
```

Then ask: "Switch the plan bucket to track against the epic (#42), or keep it untracked?"
- If yes → run `/task #42` to attach to the epic.
- If no → leave plan mode active.

---

## Pickup Directive Injection

Each sub-issue body must include the Pickup Directive block. Read the DoD from `.claude/task-tracker/definition-of-done.md` at orchestration time and inline it. Replace placeholder issue numbers (`<this-issue-#>`, `<parent-epic-#>`) with the real values after creation.

Template to append to every sub-issue body:

```markdown
## ⚡ Pickup Directive
> Follow: `.claude/task-tracker/pickup-directive.md`

- [ ] Deep dive complete

### Definition of Done
<contents of definition-of-done.md — each line verbatim>

---
```

Because `gh issue edit --body` replaces the entire body, build the complete body string before calling `gh issue create` — never patch after the fact.

---

## Spec Parsing Heuristics

The spec is in conversation context — Claude reads it directly. Structure expectations (based on the spec format produced by the brainstorming skill):

| Element | Identified by |
|---------|--------------|
| Epic title | Passed as the `/task new <title>` argument |
| Epic scope | First `### Epic Scope` or `## Scope` section under the epic heading |
| Epic estimate | `**Estimate:**` or table cell labeled `Roll-up Estimate` |
| Epic priority | `**Priority:**` field or table |
| Sub-issue sections | `#### <Title>` headings under the epic, or rows in a sub-issue table |
| Sub-issue size/estimate/priority | `**Size:**`, `**Estimate:**`, `**Priority:**` inline fields |
| Acceptance criteria | Content under `##### Acceptance Criteria` or `#### Acceptance Criteria` |

If the spec has multiple epics (like the Nexus test fixture), `/task new <title>` creates **one epic at a time** — the title argument disambiguates which section to use. After creating one epic, Claude asks if the user wants to continue with the next epic.

---

## Sizing and Priority Defaults

If the spec doesn't declare a value for a field, apply these defaults rather than prompting:

| Field | Default |
|-------|---------|
| Epic Size | XL |
| Sub-issue Size | M |
| Epic Priority | P0 |
| Sub-issue Priority | Inherit from parent epic |
| Estimate | Required — surface as a warning if missing, do not skip |

---

## Where This Lives

**All orchestration logic is in `skill/SKILL.md`** — no CLI changes required. The skill adds a new section under the `/task new` command description that activates only when plan mode is detected.

The spec parsing, `gh` calls, GraphQL mutations, and field updates are all performed by Claude following the skill instructions, exactly as the existing state-management steps in Step 2 work today.

---

## What Does NOT Change

- `/task new [title]` with no plan mode active: unchanged — creates one issue, starts tracking.
- `/task plan` itself: unchanged.
- CLI (`task-tracker.mjs`): no changes needed.
- All other commands: unchanged.
