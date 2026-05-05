---
name: task
description: Bind work sessions to GitHub issues and track time + context words per issue. Use when the user types /task with no args or followed by #N, new, plan, resume, pause, update, close, log, check, fleet, or config.
---

# Task Tracker

Per-issue time and context-word tracking. Writes to a "⏱ Timing Log" comment on the target GitHub issue; keeps minimal local state in `.claude/task-tracker-state.json`.

**Full design:** `.claude/skills/task/DESIGN.md`

## Mandatory Process Contract

**These rules are non-negotiable. Skipping any step is a process failure that corrupts the velocity ledger and leaves orphan work.**

### Before working on any issue — ALL of these, in order:

1. **Run `/task #N`** to start the timer and register the active task. **NEVER touch source files, run tests, edit issue bodies, or take any action against an issue without an active timer.** "The work is small" is not a valid reason. "The session was resumed and there's no active task" is not a valid reason — re-run `/task #N` to re-register.
2. **Verify the issue is in-progress** on the project board (the CLI does this automatically; if it failed, fix it before proceeding).
3. **Follow the Pickup Directive** in the issue body. The deep-dive section MUST be appended to the body and the `Deep dive complete` checkbox ticked **before** any code edits.

### Before closing any issue — ALL of these, in order:

1. **Verify every Acceptance Criteria checkbox** by inspection AND by running the relevant test/build/command. Tick each with `/task check "<label>"`.
2. **Verify every Definition of Done checkbox** the same way. Tick each.
3. **Run `/task close`.** This is the ONLY sanctioned way to close an issue. It atomically: writes the final timing-table row, updates Actual Session Time + Context Length on the project board, deregisters from the fleet, **and moves the issue to Done.** If the pre-close gate fires (exit 3), resolve the unchecked items — do not bypass.

### Forbidden — these break the contract:

- ❌ Running `move-state.sh <N> done` directly. `/task close` does this internally; calling it manually skips the timing flush.
- ❌ Running `gh issue close` directly. Same reason.
- ❌ Using `TASK_TRACKER_FORCE_DONE=1` for normal completion. It exists only for legitimate abandonment (the issue turned out invalid). Never use it to skip verification.
- ❌ Editing files for an issue without first running `/task #N`.
- ❌ Skipping the deep-dive checkpoint because "the scope seems clear."

If any of these are skipped: stop, restore the contract (re-register the task, complete the missed step), then continue.

## Commands

| Command | Action |
|---|---|
| `/task` | Print active task, elapsed, words since last marker |
| `/task #N` | **Start/switch to issue #N and display its full body** |
| `/task new [title]` | Create a new issue and start working on it. In plan mode: optionally orchestrate full epic + sub-issue backlog from a spec in context. |
| `/task plan` | Open an untracked planning bucket |
| `/task resume` | Resume the last paused task (no body reload — context still warm) |
| `/task resume #N` | **Switch back to a specific paused task and display its body** |
| `/task pause` | Flush timing, keep last-active. Run before `/clear` or closing Claude Code. |
| `/task update [msg]` | Checkpoint — flush timing and reset counters, keep task active |
| `/task close` | Hard-stop — flush timing, update board fields, deregister from fleet, **and move the issue to Done**. The only sanctioned close path. |
| `/task close --force` | Close even if unchecked items remain (audited; for legitimate abandonment only) |
| `/task log #N` | Re-compute and write Actual Session Time + Context Length for any issue |
| `/task check "<label>"` | Toggle a checkbox in the active issue body (exact label match) |
| `/task fleet` | Show all active tasks across parallel agent worktrees |
| `/task config` | List all config values |
| `/task config <key> <value>` | Set a config value (project-local) |
| `/task config init` | Interactive interview — review and set all config values |

`start` and `end` are accepted as aliases for `resume` and `close`.

## Implementation

### Step 1: For `/task new` — check plan mode BEFORE calling the CLI

**Do this before anything else when the verb is `new`.**

Read the state file:
```bash
cat "$(git rev-parse --show-toplevel)/.claude/task-tracker-state.json"
```

If `active` is **not** `"plan"` → skip to Step 1c (run the CLI normally).

If `active === "plan"` → ask the user:

> "I see a spec in context — use it to build out the full backlog?
> I'll create **all** epics and sub-issues, set sizing/priority, and inject pickup directives across the entire plan — no stopping between epics.
> **yes** / **no** (no creates a single blank issue and starts tracking)"

- **no** → skip to Step 1c (run the CLI normally).
- **yes** → proceed to **Plan-Mode Backlog Orchestration** below. **Do not call the CLI** — orchestration creates issues directly via `gh issue create`.

### Step 1c: Run the CLI (all verbs except `new` in plan mode)
```bash
node "$(git rev-parse --show-toplevel)/node_modules/@burson.kendrick/claude-gh-task-manager/scripts/task-tracker/task-tracker.mjs" <verb> [args...]
```
Print stdout verbatim. On non-zero exit, print stderr and surface the error.

**Exit code 3** from `/task close` means unchecked items were found — see Pre-Close Gate below.

### Step 2: For `/task #N` and `/task resume #N` — ensure issue states are correct

After the CLI succeeds, perform these checks before displaying the issue.

#### 2a. Fetch full issue metadata
```bash
gh issue view <N> --json title,body,state,projectItems,parent
```

#### 2b. Ensure the issue is open and in-progress
If closed, reopen it:
```bash
gh issue reopen <N>
```
Move to in-progress:
```bash
"$(git rev-parse --show-toplevel)/node_modules/@burson.kendrick/claude-gh-task-manager/scripts/gh/move-state.sh" <N> in-progress
```

#### 2c. If this is a sub-issue, ensure the parent is open and in-progress
Query via GraphQL (read repo owner/name from `.claude/task-tracker.json` key `repo`):
```bash
gh api graphql -f query='
  query($owner:String!,$repo:String!,$number:Int!) {
    repository(owner:$owner, name:$repo) {
      issue(number:$number) { parent { number state title } }
    }
  }
' -f owner=<owner> -f repo=<repo> -F number=<N>
```
If parent is closed → reopen and move to in-progress.
If parent is open but not in-progress → move to in-progress.
Report any state changes; skip silently if already correct.

#### 2d. Display the issue
```bash
gh issue view <N> --json title,body,state
```
Show: **title** (h2), full body, current state. This tells Claude what work needs doing.

### Step 2b: For `/task config init` — run the configuration interview

Do not pass `config init` to the CLI. Conduct the interview directly:

1. Run `/task config` and parse the current values and their sources.
2. Work through each key below, one at a time. Show the current value and source, ask the question, and write the answer with `/task config <key> <value>` before moving to the next.
3. Skip any key the user explicitly says to leave as-is.

**GitHub setup**

| Key | Question |
|---|---|
| `repo` | What is the GitHub repo? (`owner/repo` format) |
| `assignee` | Who should new issues be assigned to? (default: `@me`) |
| `defaultLabels` | Any default labels for new issues? (comma-separated, or leave empty) |

**Behavior**

| Key | Question |
|---|---|
| `wpm` | Your estimated reading/coding speed in words per minute? (default: 180) |
| `autoEndOnSwitch` | Auto-close the previous task when switching to a new one? (true/false) |
| `idleThresholdMinutes` | How many idle minutes before a gap stops counting as active time? (default: 5) |
| `recordWallClock` | Record wall-clock time in addition to active time? (true/false) |
| `hookNetworkTimeoutMs` | GitHub API timeout in milliseconds? (default: 2000) |

**Features**

| Key | Question |
|---|---|
| `pickupDirective` | Enable the Pickup Directive pattern for sub-issues? Inserts a structured deep-dive + Definition of Done block into each sub-issue body during epic planning. Recommended for multi-agent workflows. (true/false) |

**Internal paths** (show current values; only ask if the user wants to change them)

| Key | Default |
|---|---|
| `statePath` | `.claude/task-tracker-state.json` |
| `queuePath` | `.claude/task-tracker-queue.json` |

> GH Projects IDs (`projectId`, `kanbanFieldId`, `kanbanOption*`, `priorityFieldId`, `priorityOption*`) are set automatically by `npx claude-gh-task-manager init` and are not included in this interview.

After all keys are set, run `/task config` and display the final config.

### Step 3: For all other commands
Invoke the CLI and print output — no issue fetch needed.

### Pre-Close Gate (exit code 3)

When `/task close` exits with code 3, the CLI has already printed the unchecked items to stderr. Claude must:

1. Show the unchecked item list to the user.
2. Ask: **"Would you like me to verify and resolve these items first, or close anyway?"**
3. **Default behavior is resolution** — work through each unchecked item: verify by inspection AND by running the relevant test/build/command, then check it off with `/task check "<label>"`. Only after every box is checked, run `/task close` again.
4. If the user explicitly says close anyway (e.g., the issue is being abandoned) → run `TASK_TRACKER_FORCE_DONE=1 /task close`. This writes an audit comment to the issue noting which items were unverified at close. Do NOT use this to skip verification on a real fix — it's for legitimate-abandonment cases only.

`/task close` is the ONLY sanctioned close path. It atomically: flushes timing, updates board fields, deregisters from the fleet, and invokes `move-state.sh <N> done` internally to move the issue to Done. The same pre-close gate applies whether triggered through `/task close` or (legacy) direct `move-state.sh done` — both refuse if the body has unchecked boxes or the Deep Dive checkpoint is unticked, with the same `TASK_TRACKER_FORCE_DONE=1` audited override.

**Never run `gh issue close` or `move-state.sh <N> done` directly.** Both bypass the timing flush and corrupt the velocity ledger. If no task session is active and you need to mark an issue done, run `/task #N` first to register, complete any verification, then `/task close`.

## Plan-Mode Backlog Orchestration

When the user confirms "yes" in Step 1b, execute the following sections in order. **Process ALL epics in the spec in document order — do not stop between epics.** Solo tasks (issues with no sub-issues) are created the same way as epic issues but skipped for the sub-issue loop.

**All issues are stubs.** Do not deep-dive any issue at creation time — not epics, not sub-issues, not solos. Every issue gets: scope (verbatim from spec) + acceptance criteria + Pickup Directive. The deep dive happens at pickup time, against the current state of the repo.

### Preflight — MANDATORY before any `gh issue create`

Before creating ANY issue (epic, sub-issue, or solo), run the preflight check:

```bash
node "$(git rev-parse --show-toplevel)/node_modules/@burson.kendrick/claude-gh-task-manager/scripts/task-tracker/preflight-issue.mjs" --check-only
```

If this exits non-zero, **STOP all work**. Do not create any issues. Surface the script's
stderr message to the user verbatim — they need to (re)install the skill before any
issues can be generated. Resume only after the user confirms the install completed.

The preflight verifies that `.claude/task-tracker/pickup-directive.md` and
`.claude/task-tracker/definition-of-done.md` exist. These files encode the process
contract the close gate and `move-state.sh done` gate enforce. Issues created without
them will reference paths that do not resolve, and agents picking them up will have no
authoritative directive to follow.

When you actually need to assemble an issue body, run the script **without**
`--check-only` and capture stdout — it emits the canonical Pickup Directive block to
splice into the body (with `<this-issue-#>` and `<parent-epic-#>` placeholders).
Always use this script's output rather than constructing the block from prose, so the
block stays in lockstep with the canonical templates.

### Label Setup

Do this once before creating any issues.

#### A. Master Plan Label

Derive a slug from the title argument (`/task new <title>`): lowercase, treat `&` and other special chars as hyphen separators, spaces → hyphens, collapse consecutive hyphens, max 30 chars.
Example: "Nexus SaaS" → `nexus-saas`.

Announce the slug and proceed immediately — no confirmation needed:
> "Creating backlog with label **`plan:<slug>`**..."

Create the label if it doesn't exist:
```bash
gh label create "plan:<slug>" \
  --color "#0075ca" \
  --description "Plan: <full title>" \
  2>/dev/null || true
```

#### B. Purpose Labels

Create the standard purpose label set (skip any that already exist):
```bash
gh label create "infrastructure" --color "#e4e669" --description "CI/CD, env, deployment, migrations" 2>/dev/null || true
gh label create "backend"        --color "#0e8a16" --description "APIs, business logic, data models, auth" 2>/dev/null || true
gh label create "client"         --color "#1d76db" --description "UI components, pages, frontend state" 2>/dev/null || true
gh label create "test"           --color "#f9d0c4" --description "Test suites, fixtures, coverage" 2>/dev/null || true
gh label create "dx"             --color "#c5def5" --description "Tooling, scripts, docs, onboarding" 2>/dev/null || true
gh label create "security"       --color "#d93f0b" --description "Auth hardening, audits, CVE remediation" 2>/dev/null || true
gh label create "data"           --color "#bfd4f2" --description "Analytics, exports, aggregations, reporting" 2>/dev/null || true
```

**Purpose label inference — apply all that fit per issue:**

| Label | Apply when the scope mentions... |
|-------|----------------------------------|
| `infrastructure` | CI/CD, pipelines, env vars, secrets, deployment, Docker, Railway, cron jobs, database migrations, cleanup scripts |
| `backend` | API endpoints, REST, GraphQL, business logic, data models, ORM, auth middleware, tokens, sessions |
| `client` | React, UI, components, pages, CSS, charts, visualizations, frontend state, Playwright |
| `test` | test suites, fixtures, coverage, integration tests, unit tests, quality tooling |
| `dx` | developer experience, documentation, onboarding, scripts, tooling, README, internal guides |
| `security` | auth hardening, MFA, rate limiting, CVE, audit, encryption, CSRF, token rotation |
| `data` | analytics, metrics, exports, aggregations, reporting, dashboards, CSV, JSON, S3 |

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

From the result, find the field named `Size` and capture its option IDs for: `XS`, `S`, `M`, `L`, `XL`. Also capture the `Sequence` field ID (a number field) and store it as `SEQUENCE_FIELD_ID`. Store all as local variables for use in the steps below.

> **Note to spec authors:** Include a `**Sequence:** N` value in every issue header. Issues with the same number run in parallel; higher-sequence issues wait for all lower-sequence issues in their scope to close. Without this, orchestration defaults to Sequence 1 for all issues (fully parallel). Cross-epic ordering belongs in a top-level note at the top of the spec.

### Epic Creation

#### 1. Assemble the epic body

From the spec in context, extract:
- The **Epic Scope** section (everything under `### Epic Scope` or the first `## Scope` block for this epic)
- The **Epic Acceptance Criteria** checkboxes

Generate the Pickup Directive block by running the preflight script (stdout = the
canonical block, with `<this-issue-#>` and `<parent-epic-#>` placeholders to be
replaced after creation). This is unconditional in orchestration mode — all issues
from a master plan are stubs; the deep dive happens at pickup time regardless of issue
type:

```bash
DIRECTIVE_BLOCK=$(node "$(git rev-parse --show-toplevel)/node_modules/@burson.kendrick/claude-gh-task-manager/scripts/task-tracker/preflight-issue.mjs")
# If this command exits non-zero, STOP — do not create any issues.
```

Append `$DIRECTIVE_BLOCK` to the assembled body. Do not hand-craft the block — the
script reads from `.claude/task-tracker/definition-of-done.md` so the output stays
authoritative.

#### 2. Create the epic issue

```bash
gh issue create \
  --title "EPIC: <title>" \
  --body "<assembled-body>" \
  --assignee <assignee from .claude/task-tracker.json key "assignee", default "@me"> \
  --label "plan:<slug>" \
  --label "<inferred1>" \
  [--label "<inferred2>" ...] \
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

#### 5. Add to Project, then Set Size

First add the issue to the project (issues aren't auto-added):
```bash
gh api graphql -f query='
  mutation($project:ID!, $contentId:ID!) {
    addProjectV2ItemById(input:{projectId:$project, contentId:$contentId}) {
      item { id }
    }
  }
' -f project=<projectId> -f contentId=<EPIC_NODE_ID> --jq '.data.addProjectV2ItemById.item.id'
```
Store as `ITEM_ID`. Then set Size:
```bash
gh project item-edit \
  --project-id <projectId from .claude/task-tracker.json> \
  --id <ITEM_ID> \
  --field-id <sizeFieldId from .claude/task-tracker.json> \
  --single-select-option-id <option-id for XS|S|M|L|XL from Label Setup C>
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
' -f project=<projectId> -f item=<ITEM_ID> \
  -f field=<fieldEstimate from .claude/task-tracker.json> \
  -F val=<estimate-hours as float>
```

#### 7. Set Sequence

Read the `**Sequence:**` value from the spec for this epic (default `1` if not declared). Set it on the project item:

```bash
gh api graphql -f query='
  mutation($project:ID!, $item:ID!, $field:ID!, $val:Float!) {
    updateProjectV2ItemFieldValue(input:{
      projectId:$project, itemId:$item, fieldId:$field,
      value:{ number: $val }
    }) { projectV2Item { id } }
  }
' -f project=<projectId> -f item=<ITEM_ID> \
  -f field=<SEQUENCE_FIELD_ID> \
  -F val=<sequence-number as float>
```

#### 8. Move to Backlog

```bash
"$(git rev-parse --show-toplevel)/node_modules/@burson.kendrick/claude-gh-task-manager/scripts/gh/move-state.sh" <EPIC_N> backlog --item-id <ITEM_ID>
```

#### 9. Replace placeholder issue numbers in body

```bash
BODY=$(gh issue view <EPIC_N> --json body --jq '.body')
gh api repos/<owner>/<repo>/issues/<EPIC_N> \
  --method PATCH \
  --field body="$(echo "$BODY" | sed "s/<this-issue-#>/${EPIC_N}/g; s/<parent-epic-#>/none — this is the epic/g")"
```

Note: use double-quotes around the sed expression so shell variables (`$EPIC_N`) expand correctly.

### Sub-Issue Creation Loop

Repeat the following for each sub-issue in the spec, in document order.

#### 1. Infer purpose labels

Read the sub-issue's Scope. Apply all matching labels from the inference table in Label Setup B.

#### 2. Assemble the sub-issue body

Combine in order:
1. The **Scope** section text
2. The **Acceptance Criteria** checkboxes
3. The Pickup Directive block (always inject — regardless of `pickupDirective` config — since the spec was built with it). Generate via the preflight script:

```bash
DIRECTIVE_BLOCK=$(node "$(git rev-parse --show-toplevel)/node_modules/@burson.kendrick/claude-gh-task-manager/scripts/task-tracker/preflight-issue.mjs")
# If this command exits non-zero, STOP — do not create any issues.
```

The script's output already contains `<this-issue-#>` placeholders at the right spots — replace after creation in step 7.

#### 3. Create the sub-issue

```bash
gh issue create \
  --title "<sub-issue-title>" \
  --body "<assembled-body>" \
  --assignee <assignee from .claude/task-tracker.json key "assignee", default "@me"> \
  --label "plan:<slug>" \
  --label "<inferred1>" \
  [--label "<inferred2>" ...] \
  [--label "<defaultLabel>" ...]
```

Capture the issue number as `SUB_N`. Get the node ID:
```bash
gh issue view <SUB_N> --json id --jq '.id'
```
Store as `SUB_NODE_ID`.

#### 4. Set Priority, Size, Estimate

Add the sub-issue to the project and get its item ID:
```bash
gh api graphql -f query='
  mutation($project:ID!, $contentId:ID!) {
    addProjectV2ItemById(input:{projectId:$project, contentId:$contentId}) {
      item { id }
    }
  }
' -f project=<projectId> -f contentId=<SUB_NODE_ID> --jq '.data.addProjectV2ItemById.item.id'
```
Store as `ITEM_ID`. Then use the same Priority/Size/Estimate commands as Epic Creation §4–§6, substituting `SUB_N` and the sub-issue's declared values.

Priority default for sub-issues: inherit from parent epic if not declared in spec.

Also set Sequence (read from spec `**Sequence:**` field, default `1`):

```bash
gh api graphql -f query='
  mutation($project:ID!, $item:ID!, $field:ID!, $val:Float!) {
    updateProjectV2ItemFieldValue(input:{
      projectId:$project, itemId:$item, fieldId:$field,
      value:{ number: $val }
    }) { projectV2Item { id } }
  }
' -f project=<projectId> -f item=<ITEM_ID> \
  -f field=<SEQUENCE_FIELD_ID> \
  -F val=<sequence-number as float>
```

#### 5. Move to Backlog

```bash
"$(git rev-parse --show-toplevel)/node_modules/@burson.kendrick/claude-gh-task-manager/scripts/gh/move-state.sh" <SUB_N> backlog --item-id <ITEM_ID>
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
  --field body="$(echo "$BODY" | sed "s/<this-issue-#>/${SUB_N}/g; s/<parent-epic-#>/${EPIC_N}/g")"
```

Note: use double-quotes around the sed expression so shell variables (`$SUB_N`, `$EPIC_N`) expand correctly.

#### 8. Print progress line

After each sub-issue:
```
  Created #<SUB_N>  <title>  [backend, security]  S  3h  P0  Seq:<N>  → linked to #<EPIC_N>
```

### Summary Report

After ALL epics and sub-issues are created, print the complete issue map:

```
Plan: <plan-slug>   label: plan:<slug>

Epic:  #<N>   EPIC: <title>            <Size>  <Estimate>h  <Priority>  Seq:<N>
  Sub: #<N>   <sub-title>              <Size>  <Estimate>h  <Priority>  Seq:<N>  [backend, client, ...]
  Sub: #<N>   <sub-title>              <Size>  <Estimate>h  <Priority>  Seq:<N>  [backend, client, ...]

Epic:  #<N>   EPIC: <title>            <Size>  <Estimate>h  <Priority>  Seq:<N>
  Sub: #<N>   <sub-title>              <Size>  <Estimate>h  <Priority>  Seq:<N>  [backend, client, ...]
  ...

Solo: #<N>   <title>                   <Size>  <Estimate>h  <Priority>  Seq:<N>  [backend, client, ...]
```

Then ask:

> "Which epic should I attach this session to for tracking? (or reply 'none' to stay in plan mode)"

- User names an epic → run `/task #<EPIC_N>` to attach the session.
- **none** → leave plan mode active.

## AI Directives

### Task context — always match active task to the work happening now

**Epic fan-out (epic + sub-issues):**
- `/task #epic` when dispatching agents, reviewing output, orchestrating, or deciding what to fan out next.
- `/task #child` when performing that child's work directly in this session (no sub-agent).
- Switch back to `/task #epic` the moment work is handed to a sub-agent or you return to orchestration.
- Never leave the epic active while a child is being worked directly, and never leave a child active while orchestrating.
- **Run `/task update` every time an agent returns.** Each agent completion is a checkpoint — flush timing and reset counters before dispatching the next batch. Without this, long orchestration sessions accumulate unbounded wall-clock time with no intermediate record.
- When starting the epic session for fan-out, pass `--role orchestrator`: `/task #<epic> --role orchestrator`. This records your session as the human engagement cost in the value report.

**Solo fan-out (a set of independent issues with no parent epic):**
- The currently active task is the engagement anchor — stay on it while agents work the others. Its time records the orchestration cost.
- **If no task is active when the fan-out is requested, you MUST ask the user which issue should serve as the anchor before dispatching any agents.** Do not fan out without an anchor — orchestration time would be lost entirely.
- The anchor task must NOT itself be dispatched to an agent. The anchor's timing log is written exclusively by the orchestrator. If an agent also wrote to it, the session accounting would be corrupted.
- The anchored issue's time will be a mix of orchestration + any direct implementation work the main thread does — this is expected and acceptable for solo fan-out.
- **Run `/task update` every time an agent returns** — same rule as epic fan-out.

**Role flag reference:**

| Situation | Flag |
|---|---|
| Picking up a solo issue in your own session | (omit — defaults to `solo`) |
| Starting an epic you will fan out to agents | `--role orchestrator` |
| Agent picking up a sub-issue via Pickup Directive | `--role agent` (set in pickup-directive.md step 1) |

### Pickup Directive

**At issue creation** (epics, sub-issues, and solo tasks — unconditional in orchestration mode; gated by `pickupDirective: true` for plain `/task new` outside orchestration):

1. Run preflight (see "Preflight — MANDATORY" above). If it fails, STOP — do not create the issue.
2. Capture preflight stdout as `$DIRECTIVE_BLOCK`. It is the canonical block:
   ```markdown
   ## ⚡ Pickup Directive — MANDATORY, DO NOT SKIP
   > Follow: `.claude/task-tracker/pickup-directive.md`

   - [ ] Deep dive complete

   ### Definition of Done
   <DoD lines from template>

   ---
   ```
3. Append `$DIRECTIVE_BLOCK` to the issue body after the Scope section.
4. Replace `<this-issue-#>` and `<parent-epic-#>` placeholders in the body with actual numbers after `gh issue create` returns.

**At issue pickup** (`/task #N` or `/task resume #N`):
- Read `.claude/task-tracker/pickup-directive.md` — start with the "Hard Rules" section, then follow the step-by-step instructions.
- Check if `- [x] Deep dive complete` is present in the issue body.
  - Checked → skip analysis steps; proceed to implementation (step 7 in the directive).
  - Unchecked → run the full deep dive **before writing any code**.
- After completing the deep dive (step 3): `/task check "Deep dive complete"`.

**Before `/task close` or moving to Done:**
- Verify every Definition of Done item AND every Acceptance Criterion individually — by inspection AND by running the relevant test/build/command.
- Mark each verified item: `/task check "<label>"`.
- Only run `/task close` once **every** `- [ ]` in the issue body is `- [x]`.
- The pre-close gate AND `move-state.sh done` will refuse if any box is unchecked or the Deep Dive checkpoint is unticked. The audited override is `TASK_TRACKER_FORCE_DONE=1` — it bypasses but writes a visible audit comment to the issue. Use only for legitimate abandonment (e.g., the issue turned out invalid), never to skip verification.

### Issue lifecycle

- Every issue needs `Estimate` (hours) and `Size` set before work starts. No exceptions.
- Move states via `scripts/gh/move-state.sh` — never set manually. **Exception: never invoke `move-state.sh <N> done` directly — only `/task close` does that, and it does so internally.**
- Sub-issues: one level only. Parent cannot close until all children are closed.
- Always assign on create: `--assignee` from `.claude/task-tracker.json` key `assignee` (default `@me`).

### Session recovery

- **Paused** → `/task resume` to reattach without reloading body.
- **Abandoned** (forgot to pause) → SessionStart hook auto-recovers timing on next open.
- **Mid-epic pickup** → `/task #epic` to reattach and reload context before fanning out. Check epic comments for any "Spawned #N from deep dive" notices — those are new backlog items agents added during their deep dives and need to be sequenced into the remaining fan-out.
- **Jumping between tasks** → `/task resume #N` to reattach and reload body for the target issue.

## Hooks

PreCompact, PostCompact, and SessionStart hooks (in `.claude/settings.json`) call the hook handler automatically. The skill does not need to handle compaction/session events.

**SessionStart behavior:**
- No active task, nothing paused → `[task-tracker] No active task.`
- Task paused → `[task-tracker] #N is paused. Use /task resume to continue.`
- Task was active when session closed → posts `session-end-recovery` row, then fresh `session-start` row, prints recovered minutes.

## Multi-Agent / Parallel Worktrees

Run parallel agents in separate git worktrees — each has isolated state and word-count session.

**Epic / sub-issue pattern:** Start `/task #<epic> --role orchestrator` in the main worktree, fan sub-issues to agent worktrees (agents use `--role agent` via the Pickup Directive). Epic accumulates orchestration time (human engagement cost); sub-issues accumulate execution time (AI effort). The value report uses the role written into each `start` timing row to compute Human Leverage (estimated effort ÷ human engagement time).

**Solo fan-out pattern:** When fanning a set of independent issues with no parent epic, the main thread stays on whichever issue was active when the fan-out began. That issue's time records the orchestration cost. If no task is active, **stop and ask the user to pick an anchor before dispatching any agents** — never fan out without one. The anchor task must not itself be dispatched to an agent; its timing log belongs exclusively to the orchestrator. See AI Directives → Task context.

## Error Handling

If GH API fails, the event is queued. Next successful `/task` call drains the queue.

## Validation

- Issue refs must match `^#\d+$`.
- Unknown config keys are rejected with the list of valid keys (CLI handles this).
