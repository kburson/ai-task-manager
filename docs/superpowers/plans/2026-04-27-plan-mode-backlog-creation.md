# Plan-Mode Backlog Creation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `skill/SKILL.md` so that `/task new [title]` in plan mode orchestrates full epic + sub-issue creation from a spec already in conversation context — including label setup, pickup directive injection, field setting, and parent linking.

**Architecture:** Pure skill-instruction change — no CLI modifications. Claude reads the state file to detect plan mode, confirms spec use with the user, then executes a sequence of `gh` CLI and GraphQL calls as directed by new sections in SKILL.md. The installed copy at `.claude/skills/task/SKILL.md` must be kept in sync.

**Tech Stack:** `gh` CLI, GitHub GraphQL API, `scripts/gh/set-priority.sh`, `scripts/gh/move-state.sh`, SKILL.md (markdown skill instructions)

---

## File Map

| File | Change |
|------|--------|
| `skill/SKILL.md` | Primary source — all new instructions added here |
| `.claude/skills/task/SKILL.md` | Local installed copy — synced from source after each task |

---

### Task 1: Update command table and add plan-mode branch to Step 1

**Files:**
- Modify: `skill/SKILL.md` (commands table + Step 1 block)

- [ ] **Step 1: Update the `/task new` row in the commands table**

In `skill/SKILL.md`, replace:
```markdown
| `/task new [title]` | Create a new issue and start working on it |
```
With:
```markdown
| `/task new [title]` | Create a new issue and start working on it. In plan mode: optionally orchestrate full epic + sub-issue backlog from a spec in context. |
```

- [ ] **Step 2: Add plan-mode detection block after Step 1's CLI invocation**

In `skill/SKILL.md`, after the paragraph ending `**Exit code 3** from \`/task close\` means unchecked items were found — see Pre-Close Gate below.`, add:

```markdown
### Step 1b: For `/task new` — check for plan mode

After the CLI returns, read `.claude/task-tracker-state.json`:
```bash
cat "$(git rev-parse --show-toplevel)/.claude/task-tracker-state.json"
```
If `active` is **not** `"plan"` → proceed to Step 3 (standard flow).

If `active === "plan"` → ask the user:

> "I see a spec in context — use it to build out the full backlog?
> I'll create the epic, sub-issues, set sizing/priority, and inject pickup directives.
> **yes** / **no** (no creates a single blank issue and starts tracking)"

- **no** → proceed to Step 3.
- **yes** → proceed to **Plan-Mode Backlog Orchestration** below.
```

- [ ] **Step 3: Sync to local installed copy**

```bash
cp skill/SKILL.md .claude/skills/task/SKILL.md
```

- [ ] **Step 4: Verify the branch reads correctly**

```bash
grep -n "plan mode\|Step 1b\|active.*plan" skill/SKILL.md
```
Expected: at least 3 matching lines including "Step 1b" and `active === "plan"`.

- [ ] **Step 5: Commit**

```bash
git add skill/SKILL.md .claude/skills/task/SKILL.md
git commit -m "feat(skill): add plan-mode detection branch to /task new"
```

---

### Task 2: Add Label Setup section

**Files:**
- Modify: `skill/SKILL.md` (new section before the Backlog Orchestration section)

- [ ] **Step 1: Add the full Label Setup section**

In `skill/SKILL.md`, locate the `## AI Directives` heading. Insert the following block **before** it:

```markdown
## Plan-Mode Backlog Orchestration

When the user confirms "yes" in Step 1b, execute the following sections in order.

### Label Setup

Do this once before creating any issues.

#### A. Master Plan Label

Derive a slug from the title argument: lowercase, spaces → hyphens, strip special chars, max 30 chars.
Example: "User Authentication & Identity" → `nexus-auth` (or use the full plan title if shorter).

Present to the user:
> "I'll tag all issues in this plan with **`plan/<slug>`**. Accept or replace?"

Wait for the response. Use whatever label text the user confirms.

Create the label if it doesn't exist:
```bash
gh label create "plan/<slug>" \
  --color "#0075ca" \
  --description "Plan: <full title>" \
  2>/dev/null || true
```

#### B. Purpose Labels

Create the standard purpose label set (skip any that already exist):
```bash
gh label create "purpose/infrastructure" --color "#e4e669" --description "CI/CD, env, deployment, migrations" 2>/dev/null || true
gh label create "purpose/backend"        --color "#0e8a16" --description "APIs, business logic, data models, auth" 2>/dev/null || true
gh label create "purpose/client"         --color "#1d76db" --description "UI components, pages, frontend state" 2>/dev/null || true
gh label create "purpose/test"           --color "#f9d0c4" --description "Test suites, fixtures, coverage" 2>/dev/null || true
gh label create "purpose/dx"             --color "#c5def5" --description "Tooling, scripts, docs, onboarding" 2>/dev/null || true
gh label create "purpose/security"       --color "#d93f0b" --description "Auth hardening, audits, CVE remediation" 2>/dev/null || true
gh label create "purpose/data"           --color "#bfd4f2" --description "Analytics, exports, aggregations, reporting" 2>/dev/null || true
```

**Purpose label inference — apply all that fit per issue:**

| Label | Apply when the scope mentions... |
|-------|----------------------------------|
| `purpose/infrastructure` | CI/CD, pipelines, env vars, secrets, deployment, Docker, Railway, cron jobs, database migrations, cleanup scripts |
| `purpose/backend` | API endpoints, REST, GraphQL, business logic, data models, ORM, auth middleware, tokens, sessions |
| `purpose/client` | React, UI, components, pages, CSS, charts, visualizations, frontend state, Playwright |
| `purpose/test` | test suites, fixtures, coverage, integration tests, unit tests, quality tooling |
| `purpose/dx` | developer experience, documentation, onboarding, scripts, tooling, README, internal guides |
| `purpose/security` | auth hardening, MFA, rate limiting, CVE, audit, encryption, CSRF, token rotation |
| `purpose/data` | analytics, metrics, exports, aggregations, reporting, dashboards, CSV, JSON, S3 |

#### C. Look Up Size Option IDs

The Size field is a single-select in GitHub Projects. Look up its option IDs once at the start of orchestration so you can set Size per issue without prompting:

```bash
gh api graphql -f query='
  query($projectId: ID!) {
    node(id: $projectId) {
      ... on ProjectV2 {
        fields(first: 20) {
          nodes {
            ... on ProjectV2SingleSelectField {
              id name
              options { id name }
            }
          }
        }
      }
    }
  }
' -f projectId=<projectId-from-task-tracker.json>
```

From the result, find the field named `Size` and capture its option IDs for: `XS`, `S`, `M`, `L`, `XL`. Store them as local variables for use in the steps below.
```

- [ ] **Step 2: Sync**

```bash
cp skill/SKILL.md .claude/skills/task/SKILL.md
```

- [ ] **Step 3: Verify**

```bash
grep -n "Label Setup\|Master Plan Label\|Purpose Labels\|purpose/infrastructure\|Size Option" skill/SKILL.md
```
Expected: 8+ matching lines covering all subsections.

- [ ] **Step 4: Commit**

```bash
git add skill/SKILL.md .claude/skills/task/SKILL.md
git commit -m "feat(skill): add label setup section to plan-mode orchestration"
```

---

### Task 3: Add Epic Creation instructions

**Files:**
- Modify: `skill/SKILL.md` (new subsection inside Plan-Mode Backlog Orchestration)

- [ ] **Step 1: Add the Epic Creation section immediately after Label Setup**

Append the following inside the `## Plan-Mode Backlog Orchestration` section, after the Label Setup block:

```markdown
### Epic Creation

#### 1. Assemble the epic body

From the spec in context, extract:
- The **Epic Scope** section (everything under `### Epic Scope` or the first `## Scope` block for this epic)
- The **Epic Acceptance Criteria** checkboxes

If `pickupDirective` is `true` in config, read `.claude/task-tracker/definition-of-done.md` and append the Pickup Directive block (placeholder issue number to be replaced after creation):

```markdown
## ⚡ Pickup Directive
> Follow: `.claude/task-tracker/pickup-directive.md`

- [ ] Deep dive complete

### Definition of Done
<contents of definition-of-done.md verbatim>

---
```

#### 2. Create the epic issue

```bash
gh issue create \
  --title "EPIC: <title>" \
  --body "<assembled-body>" \
  --assignee <assignee from .claude/task-tracker.json key "assignee", default "@me"> \
  --label "plan/<slug>" \
  --label "purpose/<inferred1>" \
  [--label "purpose/<inferred2>" ...] \
  [--label "<defaultLabel>" ...]
```

Capture the URL returned; extract the issue number from it (e.g., `https://github.com/owner/repo/issues/42` → `42`). Store as `EPIC_N`.

#### 3. Get the epic's node ID (needed for sub-issue linking)

```bash
gh issue view <EPIC_N> --json id --jq '.id'
```
Store as `EPIC_NODE_ID`.

#### 4. Set Priority

```bash
"$(git rev-parse --show-toplevel)/node_modules/@burson.kendrick/claude-gh-task-manager/scripts/gh/set-priority.sh" <EPIC_N> <p0|p1|p2>
```
Use the priority declared in the spec. Default: `p0` for epics.

#### 5. Set Size

```bash
gh project item-edit \
  --project-id <projectId from .claude/task-tracker.json> \
  --id <project-item-id> \
  --field-id <sizeFieldId from .claude/task-tracker.json> \
  --single-select-option-id <option-id for XS|S|M|L|XL looked up in Label Setup C>
```

Get the project item ID first:
```bash
gh api graphql -f query='
  query($owner:String!,$repo:String!,$number:Int!) {
    repository(owner:$owner, name:$repo) {
      issue(number:$number) {
        projectItems(first:5) { nodes { id } }
      }
    }
  }
' -f owner=<owner> -f repo=<repo> -F number=<EPIC_N> --jq '.data.repository.issue.projectItems.nodes[0].id'
```

#### 6. Set Estimate

```bash
gh api graphql -f query='
  mutation($project:ID!, $item:ID!, $field:ID!, $val:Float!) {
    updateProjectV2ItemFieldValue(input:{
      projectId:$project, itemId:$item, fieldId:$field,
      value:{ number: $val }
    }) { projectV2Item { id } }
  }
' -f project=<projectId> -f item=<project-item-id> \
  -f field=<fieldEstimate from .claude/task-tracker.json> \
  -F val=<estimate-hours as float>
```

#### 7. Move to Backlog

```bash
"$(git rev-parse --show-toplevel)/node_modules/@burson.kendrick/claude-gh-task-manager/scripts/gh/move-state.sh" <EPIC_N> backlog
```

#### 8. If pickupDirective is true — replace placeholder issue number

```bash
BODY=$(gh issue view <EPIC_N> --json body --jq '.body')
# Replace <this-issue-#> with actual EPIC_N — do NOT use gh issue edit --body (replaces entire body)
# Instead, use gh api to PATCH only the body field:
gh api repos/<owner>/<repo>/issues/<EPIC_N> \
  --method PATCH \
  --field body="$(echo "$BODY" | sed 's/<this-issue-#>/<EPIC_N>/g; s/<parent-epic-#>/none — this is the epic/g')"
```
```

- [ ] **Step 2: Sync**

```bash
cp skill/SKILL.md .claude/skills/task/SKILL.md
```

- [ ] **Step 3: Verify**

```bash
grep -n "Epic Creation\|EPIC_N\|EPIC_NODE_ID\|Set Priority\|Set Size\|Set Estimate\|Move to Backlog" skill/SKILL.md
```
Expected: 7+ matching lines, each heading present.

- [ ] **Step 4: Commit**

```bash
git add skill/SKILL.md .claude/skills/task/SKILL.md
git commit -m "feat(skill): add epic creation steps to plan-mode orchestration"
```

---

### Task 4: Add Sub-Issue Creation Loop instructions

**Files:**
- Modify: `skill/SKILL.md` (new subsection inside Plan-Mode Backlog Orchestration)

- [ ] **Step 1: Add Sub-Issue Loop section after Epic Creation**

Append inside `## Plan-Mode Backlog Orchestration`, after the Epic Creation block:

```markdown
### Sub-Issue Creation Loop

Repeat the following for each sub-issue in the spec, in document order.

#### 1. Infer purpose labels

Read the sub-issue's Scope. Apply all matching `purpose/*` labels from the inference table in Label Setup B.

#### 2. Assemble the sub-issue body

Combine in order:
1. The **Scope** section text
2. The **Acceptance Criteria** checkboxes
3. The Pickup Directive block (always inject — regardless of `pickupDirective` config — since the spec was built with it):

```markdown
## ⚡ Pickup Directive
> Follow: `.claude/task-tracker/pickup-directive.md`

- [ ] Deep dive complete

### Definition of Done
<contents of .claude/task-tracker/definition-of-done.md verbatim>

---
```

Use placeholder text `<this-issue-#>` and `<parent-epic-#>` for now — replace after creation in step 6.

#### 3. Create the sub-issue

```bash
gh issue create \
  --title "<sub-issue-title>" \
  --body "<assembled-body>" \
  --assignee <assignee from config> \
  --label "plan/<slug>" \
  --label "purpose/<inferred1>" \
  [--label "purpose/<inferred2>" ...] \
  [--label "<defaultLabel>" ...]
```

Capture the issue number as `SUB_N`. Get the node ID:
```bash
gh issue view <SUB_N> --json id --jq '.id'
```
Store as `SUB_NODE_ID`.

#### 4. Set Priority, Size, Estimate

Repeat the same `set-priority.sh`, `gh project item-edit` (Size), and GraphQL mutation (Estimate) steps from Epic Creation §4–§6, substituting `SUB_N` and the sub-issue's declared Size/Estimate/Priority.

Get the sub-issue's project item ID the same way as the epic (GraphQL `projectItems` query with `SUB_N`).

Priority default for sub-issues: inherit from parent epic if not declared in spec.

#### 5. Move to Backlog

```bash
"$(git rev-parse --show-toplevel)/node_modules/@burson.kendrick/claude-gh-task-manager/scripts/gh/move-state.sh" <SUB_N> backlog
```

#### 6. Link to epic as sub-issue

```bash
gh api graphql -f query='
  mutation($parentId:ID!, $childId:ID!) {
    addSubIssue(input:{ issueId:$parentId, subIssueId:$childId }) {
      issue { number }
    }
  }
' -f parentId=<EPIC_NODE_ID> -f childId=<SUB_NODE_ID>
```

#### 7. Replace placeholder issue numbers in body

```bash
BODY=$(gh issue view <SUB_N> --json body --jq '.body')
gh api repos/<owner>/<repo>/issues/<SUB_N> \
  --method PATCH \
  --field body="$(echo "$BODY" | sed 's/<this-issue-#>/<SUB_N>/g; s/<parent-epic-#>/<EPIC_N>/g')"
```

#### 8. Print progress line

After each sub-issue:
```
  Created #<SUB_N>  <title>  [purpose/backend, purpose/security]  S  3h  P0  → linked to #<EPIC_N>
```
```

- [ ] **Step 2: Sync**

```bash
cp skill/SKILL.md .claude/skills/task/SKILL.md
```

- [ ] **Step 3: Verify**

```bash
grep -n "Sub-Issue Creation Loop\|SUB_N\|SUB_NODE_ID\|addSubIssue\|placeholder issue numbers" skill/SKILL.md
```
Expected: 5+ matching lines.

- [ ] **Step 4: Commit**

```bash
git add skill/SKILL.md .claude/skills/task/SKILL.md
git commit -m "feat(skill): add sub-issue creation loop to plan-mode orchestration"
```

---

### Task 5: Add Summary Report and Tracking Offer

**Files:**
- Modify: `skill/SKILL.md` (closing section of Plan-Mode Backlog Orchestration)

- [ ] **Step 1: Add Summary Report section after Sub-Issue Loop**

Append inside `## Plan-Mode Backlog Orchestration`, at the end:

```markdown
### Summary Report

After all issues are created, print the full issue map:

```
Plan: <plan-slug>   label: plan/<slug>

Epic:  #<EPIC_N>  EPIC: <title>                              <Size>  <Estimate>h  <Priority>
  Sub: #<N>       <sub-title>                                <Size>  <Estimate>h  <Priority>  [purpose/...]
  Sub: #<N>       <sub-title>                                <Size>  <Estimate>h  <Priority>  [purpose/...]
  Sub: #<N>       <sub-title>                                <Size>  <Estimate>h  <Priority>  [purpose/...]
  Sub: #<N>       <sub-title>                                <Size>  <Estimate>h  <Priority>  [purpose/...]
```

Then ask:

> "Switch the planning bucket to track against the epic (#<EPIC_N>), or keep it untracked and continue planning?"

- **Switch** → run `/task #<EPIC_N>` to attach the session to the epic.
- **Keep planning** → leave plan mode active; the user can run `/task new <next-epic-title>` to create the next epic from the same spec.

### Multiple Epics in One Spec

If the spec contains more than one epic, `/task new <title>` creates **one epic at a time** — the title argument disambiguates which section to use. After completing the summary report and tracking offer, if more epics remain in the spec, ask:

> "Ready to create the next epic? Run `/task new <next-epic-title>` when you are."

Do not proceed to the next epic automatically.
```

- [ ] **Step 2: Sync**

```bash
cp skill/SKILL.md .claude/skills/task/SKILL.md
```

- [ ] **Step 3: Verify**

```bash
grep -n "Summary Report\|Multiple Epics\|Switch.*planning\|next-epic-title" skill/SKILL.md
```
Expected: 4+ matching lines.

- [ ] **Step 4: Commit**

```bash
git add skill/SKILL.md .claude/skills/task/SKILL.md
git commit -m "feat(skill): add summary report and tracking offer to plan-mode orchestration"
```

---

### Task 6: Self-review and smoke test against Nexus fixture

**Files:**
- Read: `skill/SKILL.md`
- Read: `test/fixtures/backlogs/nexus-saas.md`

- [ ] **Step 1: Trace the full flow against the Nexus fixture**

Read both files. Mentally walk through Epic 1 ("User Authentication & Identity") as if executing the instructions:

1. User runs `/task plan` → state file shows `active: "plan"` ✓
2. User runs `/task new "User Authentication & Identity"`
3. CLI runs → Step 1b reads state → detects plan mode → asks confirmation
4. User says yes → Label Setup runs
   - Slug derived: `user-auth-identity` (or similar)
   - Master plan label confirmed → `gh label create "plan/user-auth-identity"`
   - 7 purpose labels created
   - Size option IDs fetched
5. Epic body assembled from `## Epic 1 — User Authentication & Identity` section:
   - Scope ✓, Acceptance Criteria ✓, Pickup Directive injected ✓
6. `gh issue create --title "EPIC: User Authentication & Identity" ...` with `plan/user-auth-identity`, `purpose/backend`, `purpose/security` → `EPIC_N`
7. Priority P0 set, Size XL set, Estimate 16h set, moved to Backlog
8. Sub-issue loop for E1-S1 through E1-S4:
   - E1-S1: `purpose/backend`, `purpose/security` — body has scope + AC + pickup directive — linked to epic
   - E1-S2: `purpose/backend` — linked
   - E1-S3: `purpose/backend`, `purpose/security` — linked
   - E1-S4: `purpose/backend`, `purpose/security` — linked
9. Summary table printed
10. Tracking offer → user switches to `#EPIC_N`

Check for gaps:
- [ ] Verify Step 1b reads the correct state file path (uses `git rev-parse --show-toplevel`)
- [ ] Verify purpose label inference examples in Label Setup B cover all 12 Nexus sub-issues
- [ ] Verify placeholder replacement step handles `<this-issue-#>` and `<parent-epic-#>` correctly
- [ ] Verify no step requires a Size option ID that wasn't captured in Label Setup C
- [ ] Verify `addSubIssue` mutation uses node IDs (not issue numbers) — confirmed in Task 4 §6

- [ ] **Step 2: Fix any gaps found in Step 1**

If any instruction is ambiguous or missing a concrete value, fix it inline in `skill/SKILL.md` now.

- [ ] **Step 3: Sync after fixes**

```bash
cp skill/SKILL.md .claude/skills/task/SKILL.md
```

- [ ] **Step 4: Final commit**

```bash
git add skill/SKILL.md .claude/skills/task/SKILL.md
git commit -m "feat(skill): plan-mode backlog creation — complete implementation

- /task new in plan mode detects active=plan from state file
- Prompts user to confirm spec use before any gh calls
- Label setup: master plan label (user-confirmed slug) + 7 purpose labels
- Purpose labels inferred from scope content per issue
- Epic creation: body assembly, gh issue create, Priority/Size/Estimate fields, move to backlog
- Sub-issue loop: pickup directive injection, parent link via addSubIssue GraphQL
- Placeholder issue number replacement after creation
- Summary report + offer to switch tracking to epic or continue planning
- Multiple-epic specs handled one epic at a time"
```
