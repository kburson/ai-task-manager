---
name: task
description: Bind work sessions to GitHub issues and track time + context words per issue. Use when the user types /task with no args or followed by #N, new, plan, resume, pause, update, review, close, log, check, fleet, or config.
---

<!-- aitm-skill-version: 0.0.0 -->

# Task Tracker

Per-issue time and context-word tracking. Writes to a "⏱ Timing Log" comment on the target GitHub issue; keeps minimal local state in `.ai-task-manager/task-tracker-state.json`.

**Full design:** `node_modules/ai-task-manager/docs/DESIGN.md`

## Mandatory Process Contract

**These rules are non-negotiable. Skipping any step is a process failure that corrupts the velocity ledger and leaves orphan work.**

### Before working on any issue — ALL of these, in order:

1. **Run `/task #N`** to start the timer and register the active task. **NEVER touch source files, run tests, edit issue bodies, or take any action against an issue without an active timer.** "The work is small" is not a valid reason. "The session was resumed and there's no active task" is not a valid reason — re-run `/task #N` to re-register.
2. **Verify the issue is in-progress** on the project board (the CLI does this automatically; if it failed, fix it before proceeding).
3. **Follow the Pickup Directive** in the issue body. The deep-dive section MUST be appended to the body and the hidden `<!-- aitm-deep-dive-complete -->` marker written (via `/task check`) **before** any code edits.

### Before moving an issue to In Review — agent steps, ALL of these, in order:

1. **Verify every Acceptance Criteria checkbox** by inspection AND by running the relevant test/build/command. Tick each with `/task check "<label>"`.
2. **Verify every Definition of Done checkbox** the same way. Tick each.
3. **Run `/task review #N`.** This moves the issue to **R4R** (Ready For Release), flushes a review timing row, and pauses the task. **This is the terminal automation step. Stop here.**
   - For epics: `/task review` will refuse if any sub-issues are not already in R4R. All sub-issues must reach R4R before the epic can.

> ⛔ **All checkboxes checked means "ready for human review" — NOT permission to close.**
> No agent or orchestrator may infer human approval from checked boxes, passing tests,
> a completed self-review, or any automated signal. The issue stays In Review until a
> human explicitly approves it.

### Review-approval prompt — required after every `/task review`

After a successful `/task review #N`, the CLI emits a marker line to stdout:

```
PROMPT_REQUIRED: review-approval #N
```

When you see that marker, you MUST surface a structured human decision before doing anything else. In Claude Code, invoke `AskUserQuestion` with options **Approve** and **Reject**:

- **Approve** → run `/task approve #N` (records the human approval marker in the issue body), then run `/task close #N`. The close verb refuses (exit 7) if the approval marker is missing and `gateReviewToDone=true`; `--answer yes` does NOT satisfy this gate (exit 8).
- **Reject** → ask a follow-up question for the rejection reason, then run `/task reject #N --reason "<reason>"`. The verb posts a `### ❌ Review rejected` comment on the issue and moves it back to Develop.
- **Dismiss / no choice** → run `/task pause "review-prompt-dismissed"`. The issue stays in R4R; the human will revisit.

The marker fires for every issue type — leaf, sub-issue, epic — and only on the successful path. If `/task review` exits non-zero (cascade gate, verification gate), the marker is not emitted and no prompt is required.

**Full-auto bypass.** Setting `gateReviewToDone false` in `.ai-task-manager/task-tracker.json` lets `/task close` proceed without the marker; the bypass is recorded as a `gate-bypassed` timing-log row. The companion key `gateAnalysisToDevelopment` (legacy name, retained for config-key stability) toggles the Plan → Develop prompt the same way. Defaults preserve today's human-required behavior. See `docs/guides/workflow.md` → Human Gates.

### Moving an issue to Done — human step only:

4. **Run `/task close #N` only after explicit human instruction** — e.g., "close #N", "mark #N done", "review accepted, close it." This is NOT an automated step. It writes a `+0` close marker row, deregisters from the fleet, and moves the issue to Done. (Engaged Time, Session Time, and Context Length are flushed to the project board at `/task review` — not at close.) If the pre-close gate fires (exit 3), resolve the unchecked items — do not bypass.

### Forbidden — these break the contract:

- ❌ Running `/task close` without an explicit human instruction. "All checkboxes are checked" is not human approval.
- ❌ Running `/task close` after implementation verification, even if every DoD item passes. The correct terminal step is `/task review`.
- ❌ Running `move-state.mjs <N> done` directly. `/task close` does this internally; calling it manually skips the timing flush.
- ❌ Running `gh issue close` directly. Same reason.
- ❌ Using `TASK_TRACKER_FORCE_DONE=1` for normal completion. It exists only for legitimate abandonment (the issue turned out invalid). Never use it to skip verification.
- ❌ Editing files for an issue without first running `/task #N`.
- ❌ Skipping the deep-dive checkpoint because "the scope seems clear."
- ❌ Asking the user a blocking question while the timer is running. Pause first (see Pause-on-Question below).
- ❌ Calling `gh issue create` directly. Always go through `scripts/gh/create-issue.mjs --shape <epic|sub-issue|solo>`. Direct calls skip the project tether, `aitm-fields` injection, placeholder substitution, and assignee/priority gate enforcement — producing a structurally non-conforming issue that cannot be closed via the normal workflow.

If any of these are skipped: stop, restore the contract (re-register the task, complete the missed step), then continue.

### Pause-on-Question

Whenever you must stop and wait for the user to answer a **blocking question** — a clarification, design choice, ambiguous spec, missing info, scope confirmation — the timer MUST be paused first, and resumed only after the user answers.

- Before asking: `/task pause "pause for question"`
- After the user answers: `/task start "question answered"`

Both verbs accept a free-text reason as positional args; the reason is written to the `description` column of the next row in the issue's `⏱ Timing Log`. This applies to any blocking question — not to rhetorical or in-flight prose questions you answer yourself.

Example:

> User: "/task #42"
> Assistant: _(reads body, sees ambiguous AC)_ Running `/task pause "pause for question"`. The AC says "tests pass" but doesn't list which suite — should I run the unit tests, the integration tests, or both?
> User: "Both."
> Assistant: Running `/task start "question answered"`. Proceeding to verify both suites.

The clock should reflect focused work only. Pause→resume gaps are classified at rollup time:

- **≤ `reviewPauseThresholdMin` minutes** (default 5): counted as **Review Time** and folded into **Engaged Time**. Use this for short blocking questions, intentional review beats, or quick context checks.
- **> threshold**: treated as idle/break and excluded from engaged totals. Long human-away gaps don't inflate the metrics.

The threshold lives in `.ai-task-manager/task-tracker.json` (`reviewPauseThresholdMin`). Override with `/task config reviewPauseThresholdMin <minutes>`.

## Commands

| Command                          | Action                                                                                                                                                                                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/task`                          | Print active task, elapsed, words since last marker                                                                                                                                                                                                |
| `/task #N`                       | **Start/switch to issue #N** (read body silently for context; do not print it)                                                                                                                                                                     |
| `/task new [title]`              | Create a new issue and start working on it. In plan mode: optionally orchestrate full epic + sub-issue backlog from a spec in context.                                                                                                             |
| `/task plan`                     | Open an untracked planning bucket                                                                                                                                                                                                                  |
| `/task resume`                   | Resume the last paused task (no body reload — context still warm)                                                                                                                                                                                  |
| `/task resume #N`                | **Switch back to a specific paused task** (read body silently for context; do not print it)                                                                                                                                                        |
| `/task pause`                    | Flush timing, keep last-active. Run before `/clear` or closing Claude Code.                                                                                                                                                                        |
| `/task update [msg]`             | Checkpoint — flush timing and reset counters, keep task active                                                                                                                                                                                     |
| `/task review #N`                | Move issue to R4R, flush a review timing row, and pause the task. For epics: refuses if any sub-issue is not already R4R. Emits `PROMPT_REQUIRED: review-approval #N` on success — surface an Approve/Reject prompt to the human.                  |
| `/task reject #N --reason "..."` | Reject an issue currently in R4R: post a rejection comment with the reason and move the issue back to Develop.                                                                                                                                     |
| `/task approve #N`               | Record explicit human review approval on a R4R issue. Writes a hidden marker into the issue body that `/task close` requires when `gateReviewToDone=true`. Idempotent.                                                                             |
| `/task close [#N]`               | Hard-stop — flush timing, update board fields, deregister from fleet, **and move the issue to Done**. The only sanctioned close path. Refuses (exit 7) if the review-approval marker is missing; `--answer yes` cannot satisfy this gate (exit 8). |
| `/task close --force`            | Close even if unchecked items remain (audited; for legitimate abandonment only)                                                                                                                                                                    |
| `/task log #N`                   | Re-compute and write Engaged Time, Session Time, and Context Length for any issue                                                                                                                                                                  |
| `/task migrate`                  | Select/configure a project, import repo issues, heal field DBs, and sync project fields                                                                                                                                                            |
| `/task check "<label>"`          | Toggle a checkbox in the active issue body (exact label match)                                                                                                                                                                                     |
| `/task fleet`                    | Show all active tasks across parallel agent worktrees                                                                                                                                                                                              |
| `/task config`                   | List all config values                                                                                                                                                                                                                             |
| `/task config <key> <value>`     | Set a config value (project-local)                                                                                                                                                                                                                 |
| `/task config init`              | Interactive interview — review and set all config values                                                                                                                                                                                           |

`start` and `end` are accepted as aliases for `resume` and `close`.

### State Transition Verb Map (7-state model)

The canonical verb surface is `promote` / `demote` / `next` / `reconcile`. The single-purpose verbs `review` and `close` remain first-class because they carry side effects (timing flush, board fields, fleet deregistration) beyond a board move.

**Canonical verbs:**

- `/task promote [<N>]` — Forward by one state. Reads the current state, picks the legal next state, runs the appropriate gate. Walks: Backlog → Refine → Plan → Develop → Test → Review → Done.
- `/task next [<N>]` — Alias of `/task promote`.
- `/task demote [<N>]` — Back to `Develop` from any forward state (Test / Review). Records the demotion in the timing log.
- `/task reconcile <N> <accept-live|revert-to-recorded>` — Drift recovery only. Use when the project board and the local field-DB disagree. `accept-live` treats GitHub Projects as source of truth; `revert-to-recorded` pushes the local recorded state back to the board. Do not run any other verb on a drifted issue first.

`/task approve` (records human approval marker; gates the Review → Done promotion) and `/task reject #N --reason "..."` (Review → Develop with rejection reason) remain first-class — they are not state-walking verbs.

There is no user-facing `/task move <state>` verb. Direct invocations of `scripts/gh/move-state.mjs` are forbidden in agent and user surfaces — `/task promote` calls it internally so timing flush, fleet update, and field-DB write all happen atomically.

Test → Review has no CLI verb: it is the agent self-report `REVIEW_COMPLETE`. The orchestrator confirms the report and runs `/task promote` to move the issue.

#### Estimation comment surfaces

Two verbs emit comments tied to the three-stage estimation model (see `docs/guides/workflow.md` → Three-stage estimation):

- `/task promote <N>` (from Plan) — if the Deep-Dive Analysis shifts the bucket, posts a `### 🔁 Plan re-estimate` comment with a from→to table and updates Size + Estimate on the board. A ≥2-tier jump posts a `⚠ HUMAN ATTENTION` variant and skips the writes. Set `TASK_TRACKER_SKIP_REEVAL=1` to bypass the hook.
- `/task close <N>` — posts a `### 📊 Review delta` comment recording Estimate vs. Actual hours. This comment is **read-only**: Size and Estimate are not changed at close. Set `TASK_TRACKER_SKIP_DELTA=1` to bypass the hook.

#### State-slug migration history

The 7-state Scrum vocabulary (`backlog` / `refine` / `plan` / `develop` / `test` / `review` / `done`) replaced the prior vocabulary (`groom` / `analyze` / `development` / `validate`) in epic #96. Old issues, comments, and project boards are migrated in-place by `scripts/maintenance/bind-issues-to-new-project.mjs` and `scripts/maintenance/rename-estimation-headers.mjs`. See [`docs/guides/migrations.md`](../../docs/guides/migrations.md) for the migration runbook. There is no slug shim — the renamed states are the only recognized inputs.

## Implementation

### Step 1: For `/task new` — check plan mode BEFORE calling the CLI

**Do this before anything else when the verb is `new`.**

Read the state file:

```bash
cat "$(git rev-parse --show-toplevel)/.ai-task-manager/task-tracker-state.json"
```

If `active` is **not** `"plan"` → skip to Step 1c (run the CLI normally).

If `active === "plan"` → ask the user:

> "I see a spec in context — use it to build out the full backlog?
> I'll create **all** epics and sub-issues, set sizing/priority, and inject pickup directives across the entire plan — no stopping between epics.
> **yes** / **no** (no creates a single blank issue and starts tracking)"

- **no** → skip to Step 1c (run the CLI normally).
- **yes** → proceed to **Plan-Mode Backlog Orchestration** below. **Do not call the CLI** — orchestration creates issues via the `create-issue.mjs` helper (which wraps `gh issue create` + project tether + sub-issue link + placeholder substitution into one atomic step).

### Step 1c: Run the CLI (all verbs except `new` in plan mode)

```bash
node "$(git rev-parse --show-toplevel)/node_modules/ai-task-manager/scripts/task-tracker/task-tracker.mjs" <verb> [args...]
```

Print stdout verbatim. On non-zero exit, print stderr and surface the error.

**Exit code 3** from `/task review` or `/task close` means unchecked items were found — see Pre-Close Gate below.

### Step 2: For `/task #N` and `/task resume #N` — ensure issue states are correct

After the CLI succeeds, perform these checks. Read the issue body silently — do not print it to the chat.

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
"$(git rev-parse --show-toplevel)/node_modules/ai-task-manager/scripts/gh/move-state.mjs" <N> in-progress
```

#### 2c. If this is a sub-issue, ensure the parent is open and in-progress

Query via GraphQL (read repo owner/name from `.ai-task-manager/task-tracker.json` key `repo`):

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

#### 2d. Read the issue (silently)

```bash
gh issue view <N> --json title,body,state
```

Read title, body, and state for context. **Do not print the body to the chat** — the user reads it in the GitHub UI. Acknowledge with one line: issue title and current state.

### Step 2b: For `/task config init` — run the configuration interview

Do not pass `config init` to the CLI. Conduct the interview directly:

1. Run `/task config` and parse the current values and their sources.
2. Work through each key below, one at a time. Show the current value and source, ask the question, and write the answer with `/task config <key> <value>` before moving to the next.
3. Skip any key the user explicitly says to leave as-is.

**GitHub setup**

| Key             | Question                                                             |
| --------------- | -------------------------------------------------------------------- |
| `repo`          | What is the GitHub repo? (`owner/repo` format)                       |
| `assignee`      | Who should new issues be assigned to? (default: `@me`)               |
| `defaultLabels` | Any default labels for new issues? (comma-separated, or leave empty) |

**Behavior**

| Key                    | Question                                                                       |
| ---------------------- | ------------------------------------------------------------------------------ |
| `wpm`                  | Your estimated reading/coding speed in words per minute? (default: 180)        |
| `autoEndOnSwitch`      | Auto-close the previous task when switching to a new one? (true/false)         |
| `idleThresholdMinutes` | How many idle minutes before a gap stops counting as active time? (default: 5) |
| `recordWallClock`      | Record wall-clock time in addition to active time? (true/false)                |
| `hookNetworkTimeoutMs` | GitHub API timeout in milliseconds? (default: 2000)                            |

**Features**

| Key               | Question                                                                                                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pickupDirective` | Enable the Pickup Directive pattern for sub-issues? Inserts a structured deep-dive + Definition of Done block into each sub-issue body during epic planning. Recommended for multi-agent workflows. (true/false) |

**Internal paths** (show current values; only ask if the user wants to change them)

| Key         | Default                                    |
| ----------- | ------------------------------------------ |
| `statePath` | `.ai-task-manager/task-tracker-state.json` |
| `queuePath` | `.ai-task-manager/task-tracker-queue.json` |

> GH Projects IDs (`projectId`, `kanbanFieldId`, `kanbanOption*`, `priorityFieldId`, `priorityOption*`) are set automatically by `npx ai-task-manager init` and are not included in this interview.

After all keys are set, run `/task config` and display the final config.

### Step 3: For all other commands

Invoke the CLI and print output — no issue fetch needed.

### Pre-Close Gate (exit code 3)

When `/task review` or `/task close` exits with code 3, the CLI has already printed the unchecked items to stderr. Claude must:

1. Show the unchecked item list to the user.
2. Ask: **"Would you like me to verify and resolve these items first, or close anyway?"**
3. **Default behavior is resolution** — work through each unchecked item: verify by inspection AND by running the relevant test/build/command, then check it off with `/task check "<label>"`. Only after every pre-close box is checked, run `/task review #N`, then `/task close #N`.
4. If the user explicitly says close anyway (e.g., the issue is being abandoned) → run `TASK_TRACKER_FORCE_DONE=1 /task close`. This writes an audit comment to the issue noting which items were unverified at close. Do NOT use this to skip verification on a real fix — it's for legitimate-abandonment cases only.

`/task close` is the ONLY sanctioned close path. It atomically: flushes timing, updates board fields, deregisters from the fleet, and invokes `move-state.mjs <N> done` internally to move the issue to Done. The same pre-close gate applies whether triggered through `/task close` or (legacy) direct `move-state.mjs done` — both refuse if the body has unchecked pre-close boxes or the Deep Dive checkpoint is unticked, with the same `TASK_TRACKER_FORCE_DONE=1` audited override.

**Never run `gh issue close` or `move-state.mjs <N> done` directly.** Both bypass the timing flush and corrupt the velocity ledger. If no task session is active and you need to mark an issue done, run `/task #N` first to register, complete any verification, then `/task close`.

### Dirty-Workspace Gate

Two checkpoints inspect `git status --porcelain` in the issue's bound workspace (fleet-registered worktree path; falls back to project dir) so uncommitted work cannot bleed across issue boundaries.

**Gate 1 — `/task review` / `move-state.mjs <N> review` (warning only):**

- Dirty workspace prints a stderr warning summarizing the dirty paths (capped at 10 entries + `… +N more`). The move still proceeds.
- Disable with `TT_SKIP_DIRTY_CHECK=1` only in test contexts.

**Gate 2 — `/task close` (blocking, prompts for decision):**

- Clean → proceeds to the existing pre-close checkbox gate as today.
- Dirty + `--answer yes` → refuses close with exit 6 and prints the cleanup-flow guidance. Clean up manually (commit issue-relevant changes, stash unrelated WIP), then re-run `/task close <id>`.
- Dirty + `--answer no` → closes anyway and appends a `closed-with-dirty-tree` audit row to the Timing Log with a summarized dirty-path description (capped at 5 entries).
- Dirty + `--answer cancel` → aborts close (exit 0, no board change, no timing row); issue stays in Review.
- Dirty + no `--answer` + `CI=1` (or otherwise headless) → exits 5 and refuses; **headless callers must pass `--answer`**.
- Dirty + no `--answer` + interactive → emits `PROMPT_REQUIRED: dirty-close-confirm #<N>` on stdout and exits 0 without changing state; the agent surfaces the prompt to the human, then re-invokes `/task close #<N> --answer yes|no|cancel`.

**Cleanup flow (printed on `--answer yes`):**

```
1. Inspect: git status
2. Stage + commit issue-relevant changes for this issue ONLY.
3. For unrelated changes: stash (`git stash push -m "…"`) or move to a separate branch.
4. Re-run: /task close <id>
```

**Known limitation:** the fleet registry stores one `worktreePath` per issue. If multiple worktrees are bound to the same issue, only the last-registered path is checked. Hoist manually if you need a stricter sweep.

### Commit Trail (per-commit hook)

Every successful `git commit` made while an issue is bound (`/task start <#N>`) is captured into a single rolling `### 🔗 Commits` comment on that issue. This closes the traceability gap between "issue is Done" and "which commits implemented it."

**Hook:** PostToolUse on `Bash` → `.claude/hooks/commit-trail.sh` → `commit-trail-handler.mjs`. Installed automatically by `bin/cli.mjs install`.

**Behavior:**

- Fires only on **successful** `git commit` (bash tool exit 0).
- Skips `git commit --amend` (amend rewrites SHA; v1 drops these).
- No active bound issue → silent no-op.
- `gh` failure → one-line stderr warning, hook exits 0; never propagates to the bash tool result.
- Idempotent: a hidden `<!-- aitm-commits: SHA1,SHA2,... -->` marker dedups re-fires.

**Comment shape:**

```
### 🔗 Commits

<!-- aitm-commits: abc1234...,def5678... -->

| SHA | Subject | Author | When |
|---|---|---|---|
| `abc1234` | feat(x): … | kendrick burson | 2026-05-10T14:32:11Z |
```

When the commit happens in a secondary worktree (git-dir ≠ git-common-dir), `Branch` and `Worktree` columns are added. If the existing comment is already 4-col, the 4-col schema is preserved to avoid mixing column counts.

**Out of scope (v1):** boundary-snapshot path at `development → validate` (depends on `/task promote`); squash/rebase reconciliation; amend handling.

## Plan-Mode Backlog Orchestration

When the user confirms "yes" in Step 1b, execute the following sections in order. **Process ALL epics in the spec in document order — do not stop between epics.** Solo tasks (issues with no sub-issues) are created the same way as epic issues but skipped for the sub-issue loop.

**All issues are stubs.** Do not deep-dive any issue at creation time — not epics, not sub-issues, not solos. Every issue gets: scope (verbatim from spec) + acceptance criteria + Pickup Directive. The deep dive happens at pickup time, against the current state of the repo.

### Preflight — MANDATORY before any `gh issue create`

Before creating ANY issue (epic, sub-issue, or solo), run the preflight check:

```bash
node "$(git rev-parse --show-toplevel)/node_modules/ai-task-manager/scripts/task-tracker/preflight-issue.mjs" --check-only
```

If this exits non-zero, **STOP all work**. Do not create any issues. Surface the script's
stderr message to the user verbatim — they need to (re)install the skill before any
issues can be generated. Resume only after the user confirms the install completed.

The preflight verifies that `.ai-task-manager/pickup-directive.md` and
`.ai-task-manager/definition-of-done.md` exist. These files encode the process
contract the close gate and `move-state.mjs done` gate enforce. Issues created without
them will reference paths that do not resolve, and agents picking them up will have no
authoritative directive to follow.

When you actually need to assemble an issue body, run the script **without**
`--check-only` and capture stdout — it emits the canonical Definition of Done + Pickup Directive tail block to
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

| Label            | Apply when the scope mentions...                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| `infrastructure` | CI/CD, pipelines, env vars, secrets, deployment, Docker, Railway, cron jobs, database migrations, cleanup scripts |
| `backend`        | API endpoints, REST, GraphQL, business logic, data models, ORM, auth middleware, tokens, sessions                 |
| `client`         | React, UI, components, pages, CSS, charts, visualizations, frontend state, Playwright                             |
| `test`           | test suites, fixtures, coverage, integration tests, unit tests, quality tooling                                   |
| `dx`             | developer experience, documentation, onboarding, scripts, tooling, README, internal guides                        |
| `security`       | auth hardening, MFA, rate limiting, CVE, audit, encryption, CSRF, token rotation                                  |
| `data`           | analytics, metrics, exports, aggregations, reporting, dashboards, CSV, JSON, S3                                   |

#### C. Read Config Values

Use the packaged helper to read values from `.ai-task-manager/task-tracker.json`. This produces a single clean `node` invocation instead of a `cat | python3` pipeline, which keeps the bash-guard hook happy and avoids shell-permission noise.

```bash
ROOT="$(git rev-parse --show-toplevel)"
HELPER="$ROOT/node_modules/ai-task-manager/scripts/task-tracker/config-get.mjs"

PROJECT_ID=$(node "$HELPER" projectId)
ASSIGNEE=$(node   "$HELPER" assignee @me)
REPO=$(node       "$HELPER" repo)
```

**Never** use `cat .ai-task-manager/task-tracker.json | python3 -c "..."` — use `config-get.mjs` instead.

#### D. Look Up Size Option IDs

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
' -f projectId="$PROJECT_ID"
```

From the result, find the field named `Size` and capture its option IDs for: `XS`, `S`, `M`, `L`, `XL`. Also capture the `Sequence` field ID (a number field) and store it as `SEQUENCE_FIELD_ID`. Store all as local variables for use in the steps below.

> **Note to spec authors:** Include a `**Sequence:** N` value in every issue header. Issues with the same number run in parallel; higher-sequence issues wait for all lower-sequence issues in their scope to close. Without this, orchestration defaults to Sequence 1 for all issues (fully parallel). Cross-epic ordering belongs in a top-level note at the top of the spec.

### Project Tether — MANDATORY

Every created epic, sub-issue, and solo task must be tethered with the packaged
helper before orchestration reports success. Do not rely on raw
`addProjectV2ItemById` output or `Issue.projectItems`; GitHub can return issue-side
project metadata while the Project board itself still has no visible item.

Use:

```bash
node "$(git rev-parse --show-toplevel)/node_modules/ai-task-manager/scripts/gh/project-tether.mjs" \
  --issue <N> \
  --status backlog \
  --priority <P0|P1|P2> \
  --size <XS|S|M|L|XL> \
  --estimate <hours> \
  --sequence <sequence-number> \
  [--parent <EPIC_N>]
```

The helper verifies the issue through `ProjectV2.items`, sets project fields only
after project-side visibility is confirmed, repairs issue-side phantom items when
possible, and fails closed if the story cannot be made visible in the project.
For loose leaf tasks, omit `--parent`. For epic child issues, pass `--parent`.

#### Backlog vs Todo (Ready) at tether time

- **Plan-mode sub-issues:** keep `--status backlog`. The flip to `ready`/`in-progress` happens at fan-out (see "Mid-epic pickup" / `dispatch-prep.mjs`). Not every planned sub-issue is dispatched immediately, so Backlog is correct.
- **Ad-hoc issues created with full ACs and sizing** (e.g. an agent files a follow-on issue from a deep dive, or a human files a sized story): pass `--status ready` to `create-issue.mjs` / `project-tether.mjs`. Backlog is the unvetted-ideas inbox; sized + AC'd work belongs in Todo.
- The tether and move-state scripts emit a non-blocking warning when `--status backlog` is paired with both `--size` and `--estimate`, or when an already-sized issue is moved back to `backlog`. The warning is informational; the operation proceeds.

### Epic Creation

#### 1. Stage the three content fragments

Write the spec content into three files under `./tmp/`:

- `./tmp/scope.md` — the **Epic Scope** prose.
- `./tmp/acs.md` — the **Epic Acceptance Criteria** as `- [ ]` checkboxes (mandatory format; closes-gate parser requires it).
- `./tmp/plan-meta.md` — the Plan Metadata block (`**Size:**`, `**Estimate:**`, `**Priority:**`, `**Sequence:**`).

Do not hand-assemble the issue body. The `--shape epic` flag below feeds these fragments through `templates/epic-body.md` and appends the canonical Definition of Done + Pickup Directive tail block. `.ai-task-manager/epic-body.md` (if present) overrides the packaged template, same precedence as pickup-directive.md.

#### 2. Create + tether the epic atomically

`scripts/gh/create-issue.mjs --shape epic …` is the only sanctioned path. It calls `preflight-issue.mjs --shape epic` to render the body, runs `gh issue create`, tethers to the project Backlog with priority/size/estimate/sequence, and substitutes the `<this-issue-#>` / `<parent-epic-#>` placeholders — atomic. **Never call `gh issue create` directly.**

```bash
URL=$(node "$(git rev-parse --show-toplevel)/scripts/gh/create-issue.mjs" \
  --shape epic \
  --title "EPIC: <title>" \
  --scope-file ./tmp/scope.md \
  --ac-file ./tmp/acs.md \
  --plan-metadata-file ./tmp/plan-meta.md \
  --priority <p0|p1|p2 from spec> \
  --size <XS|S|M|L|XL from spec> \
  --estimate <estimate-hours as float> \
  --sequence <sequence-number> \
  --assignee "$ASSIGNEE" \
  --label "plan:<slug>" \
  --label "<inferred1>" \
  [--label "<inferred2>" ...])
```

Use `--dry-run` to print the rendered body to stdout without calling `gh` (useful for inspection or diff against an existing issue).

The helper prints the issue URL on stdout. Extract the number (e.g., `https://github.com/owner/repo/issues/42` → `42`) and store as `EPIC_N`. Default priority for epics: `p0`.

If the helper exits non-zero, STOP. Either the issue was never created (gh failure) or it was created but not tethered — the helper prints the exact recovery command in the latter case.

#### 3. Get the epic's node ID (needed for sub-issue linking)

```bash
gh issue view <EPIC_N> --json id --jq '.id'
```

Store as `EPIC_NODE_ID`.

### Sub-Issue Creation Loop

Repeat the following for each sub-issue in the spec, in document order.

#### 1. Infer purpose labels

Read the sub-issue's Scope. Apply all matching labels from the inference table in Label Setup B.

#### 2. Stage the three content fragments

Same as Epic Creation step 1, but for the sub-issue:

- `./tmp/scope.md` — Scope prose
- `./tmp/acs.md` — Acceptance Criteria as `- [ ]` checkboxes
- `./tmp/plan-meta.md` — Plan Metadata block

`--shape sub-issue` feeds these through `templates/sub-issue-body.md` (override: `.ai-task-manager/sub-issue-body.md`). Tail block (DoD + Pickup Directive) is appended by the preflight automatically. Do not hand-assemble.

#### 3. Create + tether the sub-issue atomically

Priority default for sub-issues: inherit from parent epic if not declared in spec. `create-issue.mjs --shape sub-issue` is the only sanctioned path; never call `gh issue create` directly.

```bash
URL=$(node "$(git rev-parse --show-toplevel)/scripts/gh/create-issue.mjs" \
  --shape sub-issue \
  --title "<sub-issue-title>" \
  --scope-file ./tmp/scope.md \
  --ac-file ./tmp/acs.md \
  --plan-metadata-file ./tmp/plan-meta.md \
  --parent <EPIC_N> \
  --priority <p0|p1|p2 from spec or parent> \
  --size <XS|S|M|L|XL from spec> \
  --estimate <estimate-hours as float> \
  --sequence <sequence-number> \
  --assignee "$ASSIGNEE" \
  --label "plan:<slug>" \
  --label "<inferred1>" \
  [--label "<inferred2>" ...])
```

The helper prints the issue URL on stdout. Extract the number and store as `SUB_N`. It also:

- Tethers the issue to the project Backlog and sets priority/size/estimate/sequence.
- Links the issue to the epic as a GitHub sub-issue after project-side visibility is verified.
- Substitutes `<this-issue-#>` → `#SUB_N` and `<parent-epic-#>` → `#EPIC_N` in the body.

If the helper exits non-zero, STOP and follow its recovery instructions before continuing the loop.

Get the node ID (still needed for any downstream linking):

```bash
gh issue view <SUB_N> --json id --jq '.id'
```

Store as `SUB_NODE_ID`.

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

## Project Preferences

Team-shared workflow preferences live in the git-tracked `.ai-task-manager/task-tracker.json` under `preferences`. Read them at session start via `getPreferences()` from `scripts/task-tracker/config.mjs`. Defaults preserve today's behavior; teams opt in by editing the file (or via `npx ai-task-manager configure preferences`). Reference keys by name when honoring them:

| Key | Default | Effect when enabled |
|---|---|---|
| `noPushToOrigin` | `false` | Commit/merge to trunk locally only; never `git push`, never open PRs. |
| `mainThreadOnly` | `false` | No feature branches, no worktrees; commit straight to trunk. Disables parallel dispatch. |
| `driveSubIssuesToR4R` | `true` | Drive sub-issues end-to-end through dispatch/review/merge to R4R without per-step human check-ins. |
| `pauseTimerOnBlockingQuestion` | `true` | `/task pause "pause for question"` before any blocking user prompt; `/task start "question answered"` on resume. |
| `noConfirmAfterDeepDive` | `true` | After posting the deep-dive comment, proceed straight to implementation; do not ask "ready to proceed?". |
| `askGatesBeforeParallel` | `true` | Before parallel sub-agent dispatch, prompt user which human gates to disable; encode into prompts; restore after. |
| `formatting.noEmojis` | `true` | Issue bodies, comments, and commit messages contain no emojis. |
| `formatting.currencyInBackticks` | `true` | Currency amounts wrap in backticks (`` `$200` ``). |
| `scratchDir` | `"./tmp/"` | Canonical directory for transient files (issue body fragments, deep-dive staging). |

Decision-point examples: if `mainThreadOnly` is true, skip worktree creation; if `noPushToOrigin` is true, never run `git push` and never open PRs; if `askGatesBeforeParallel` is true, prompt before dispatching parallel sub-agents.

## AI Directives

### Subagent completion semantics

When a subagent returns from issue work, it MUST report one of these three statuses.
**`DONE` and `DONE_WITH_CONCERNS` are not valid statuses for AITM issue work** — they
carry ambiguous semantics and cause orchestrators to advance sequences prematurely.

| Status                   | Meaning                                                                                                                                                                                                                         | Orchestrator action                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `CODE_COMPLETE`          | Implementation done; one or more DoD items are unverifiable by this agent and remain unchecked. Agent lists them explicitly.                                                                                                    | Do NOT advance the sequence. Inspect remaining items; resolve or reassign.                                                       |
| `ISSUE_READY_FOR_REVIEW` | All agent-verifiable AC, Verification Commands, and DoD checkboxes are checked. `/task review` has been run. Issue is in R4R. For epics: report this only after calling `/task review #<epic>` and the epic itself reaches R4R. | Notify the human for review. Do NOT run `/task close`. Count toward sequence completion only after the human runs `/task close`. |
| `HUMAN_APPROVED`         | A human has explicitly instructed close (e.g., "close #N", "mark #N done"). This status is set by the human, not reported by a subagent.                                                                                        | Run `/task close <N>`. Count the issue as Done. Advance sequence only after all issues in the sequence are Done.                 |
| `BLOCKED`                | Agent cannot proceed without orchestrator or human help.                                                                                                                                                                        | Intervene, then redispatch or reassign.                                                                                          |

**Epic review rule:** When all sub-issues in the current sequence reach R4R, the orchestrator must call `/task review #<epic>` on the parent epic **before** notifying the human. Running `/task review` on the epic is orchestrator work, not human work. The epic cannot move to R4R until all its sub-issues are already in R4R — the gate is enforced. Do not report `ISSUE_READY_FOR_REVIEW` or notify the human until the epic itself is in R4R.

**Sequence-advance rule:** A sequence is complete only after every issue in that
sequence reaches **Done** via the `/task review` → human approval → `/task close` path.
`CODE_COMPLETE` and `ISSUE_READY_FOR_REVIEW` do not count. An orchestrator that fans out
Sequence 2 while any Sequence 1 issue has not been closed by a human is violating the
close contract.

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

| Situation                                         | Flag                                               |
| ------------------------------------------------- | -------------------------------------------------- |
| Picking up a solo issue in your own session       | (omit — defaults to `solo`)                        |
| Starting an epic you will fan out to agents       | `--role orchestrator`                              |
| Agent picking up a sub-issue via Pickup Directive | `--role agent` (set in pickup-directive.md step 1) |

### Pickup Directive

**At issue creation** (epics, sub-issues, and solo tasks — unconditional in orchestration mode; gated by `pickupDirective: true` for plain `/task new` outside orchestration):

1. Run preflight (see "Preflight — MANDATORY" above). If it fails, STOP — do not create the issue.
2. Capture preflight stdout as `$DIRECTIVE_BLOCK`. It is the canonical tail block:

   ```markdown
   ### Definition of Done

   <DoD lines from template>

   ## Pickup Directive — MANDATORY, DO NOT SKIP

   > Follow: `.ai-task-manager/pickup-directive.md`

   ---
   ```

3. Append `$DIRECTIVE_BLOCK` after Acceptance Criteria and Plan Metadata so the issue order is Scope, Plan Metadata, Acceptance Criteria, Definition of Done, Pickup Directive, then any hidden AITM field DB.
4. Placeholder substitution (`<this-issue-#>`, `<parent-epic-#>`) is handled automatically by `create-issue.mjs`. Direct callers using bare `gh issue create` (rare, untethered) must do this themselves with a follow-up `gh api PATCH`.

**At issue pickup** (`/task #N` or `/task resume #N`):

- Read `.ai-task-manager/pickup-directive.md` — start with the "Hard Rules" section, then follow the step-by-step instructions.
- Check whether deep-dive evidence is present in the issue body. Evidence is **either**:
  - The hidden marker `<!-- aitm-deep-dive-complete: <ts> -->`, OR
  - A `## Deep-Dive Analysis` heading (legacy issues authored before the marker existed).
  - Evidence present → skip analysis steps; proceed to implementation (step 7 in the directive).
  - Evidence absent → run the full deep dive **before writing any code**.
- After completing the deep dive (step 3): `/task check "Deep dive complete"` writes the hidden marker.
- **Deep-Dive placement is canonical.** The `## Deep-Dive Analysis (YYYY-MM-DD)` section is an appendix — it MUST appear AFTER the `## Pickup Directive` heading block and BEFORE the `<!-- ai-task-manager:fields:start -->` marker. Body order: Scope → Acceptance Criteria → Definition of Done → Pickup Directive → Deep-Dive Analysis → fields-block. The `deep-dive-placement` body gate refuses in-review/r4r/done moves when the heading is present in any other position.

**For epics:** After appending the deep dive and running `/task check "Deep dive complete"` to write the hidden marker, verify that no Acceptance Criterion or Definition of Done checkbox has been ticked. If any are found ticked, uncheck them immediately. Then confirm that the following AC is present in the epic body (add it if missing):

> `- [ ] All sub-issues have passed through In Review to be verified and landed in R4R to await final human review.`

Do NOT list specific issue numbers — discovered work may add sub-issues during implementation. This checkbox gates the epic close and may only be ticked by the orchestrator after the last sub-issue's `/task review` succeeds.

**Before moving an issue to In Review (agent terminal step):**

- Verify every Definition of Done item AND every Acceptance Criterion individually — by inspection AND by running the relevant test/build/command.
- Verification commands appended during pickup must be issue-body checkboxes under `### Verification Commands`, and each relevant command checkbox must be checked before checking the related Acceptance Criterion or Definition of Done box.
- Mark each verified item: `/task check "<label>"`.
- Once every `- [ ]` in the issue body is `- [x]`, record exit word count and stop — the orchestrator calls `/task review #N --duration-minutes M --words W` with values from the agent's `CODE_COMPLETE` report. This is the terminal agent step — stop here.

> ⛔ **All checkboxes checked means "ready for human review" — NOT permission to close.**
> No agent or orchestrator may infer human approval from checked boxes, passing tests,
> a completed self-review, or any other automated signal. The issue stays In Review until
> a human explicitly instructs close.

**Moving an issue to Done (human-only step):**

- Only after a human has explicitly instructed close (e.g., "close #N", "mark #N done") should `/task close` be run.
- The pre-close gate will refuse if any box is unchecked or the Deep Dive checkpoint is unticked. The audited override is `TASK_TRACKER_FORCE_DONE=1` — it bypasses but writes a visible audit comment to the issue. Use only for legitimate abandonment (e.g., the issue turned out invalid), never to skip verification.

### Issue lifecycle

- Every issue needs `Estimate` (hours) and `Size` set before work starts. No exceptions.
- Move states via `scripts/gh/move-state.mjs` — never set manually. **Exception: never invoke `move-state.mjs <N> done` directly — only `/task close` does that, and it does so internally.**
- Sub-issues: one level only. Parent cannot close until all children are closed.
- Always assign on create: `--assignee` from `.ai-task-manager/task-tracker.json` key `assignee` (default `@me`).

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

### Worktree creation rules (NON-NEGOTIABLE)

When dispatching agents to parallel worktrees, every worktree MUST start from a fresh branch off `trunk` HEAD. The `Agent` tool's `isolation: "worktree"` flag does NOT guarantee this — it may reuse a pre-existing local branch with the same name (e.g. `208-cohorts-lib`) and check out from that branch's stale tip. Agents working off stale tips don't have current `.ai-task-manager/` directives, current scripts, or recent fixes — their work is at best wasted and at worst introduces regressions.

**Orchestrator pre-flight (before EVERY agent dispatch):**

1. Verify `git rev-parse trunk` is up to date (`git fetch origin trunk` if needed).
2. Delete any pre-existing local branches that would collide with planned worktree names — agents commonly use names like `<issue#>-<slug>` or `worktree-agent-<id>`. Run `git branch -D <name>` for each colliding branch BEFORE dispatch.
3. After dispatch, verify each worktree's base SHA matches trunk HEAD: `git -C .claude/worktrees/<agent-id> rev-parse HEAD` must equal `git rev-parse trunk`. If it doesn't, kill the agent immediately, force-remove the worktree (`git worktree remove -f -f <path>`), prune (`git worktree prune`), delete the stale branch, and relaunch. Wasted-work risk increases monotonically with time spent on a stale base.

**Agent bootstrap MUST include (in the agent prompt):**

```
1. cd into the assigned worktree path
2. git rev-parse HEAD  # capture current SHA
3. git rev-parse origin/trunk  # capture trunk HEAD (or local trunk if no remote)
4. If the two differ: STOP. Report "stale base; please relaunch" and exit.
   Do NOT attempt rebase/merge/reset on your own — that risks corrupting state across worktrees.
5. npm install --no-audit --no-fund
6. node node_modules/ai-task-manager/scripts/task-tracker/task-tracker.mjs "#<N>" --role agent
7. Read .ai-task-manager/pickup-directive.md IN FULL.
```

**Orchestrator state-isolation guard:** Before dispatching, snapshot `.ai-task-manager/task-tracker.json` and `.ai-task-manager/task-tracker-state.json` from the main repo. Agents are known to occasionally resolve git-root incorrectly from inside a worktree and write back into the main repo's shared runtime state. After all agents return (or are killed), diff the snapshots; if either file changed unexpectedly, restore from the snapshot before resuming orchestrator work.

### Worktree Config Seeding — MANDATORY

`.ai-task-manager/` is gitignored (it holds runtime state). `git worktree add` therefore creates a worktree **without** `task-tracker.json`, `pickup-directive.md`, or `definition-of-done.md`. An agent booting into an unseeded worktree will hit `config-not-found` and — under the fail-closed bootstrap rule — MUST `STATUS: BLOCKED` and stop. Work performed in an unseeded worktree is discarded.

Orchestrators MUST run the seed helper **immediately after `git worktree add` and before the agent boots**:

```bash
node scripts/task-tracker/seed-worktree.mjs <worktree-path>
# (or, when ai-task-manager is installed as a dep:)
node node_modules/ai-task-manager/scripts/task-tracker/seed-worktree.mjs <worktree-path>
```

The helper copies `task-tracker.json`, `pickup-directive.md`, `definition-of-done.md` from the parent repo's `.ai-task-manager/` and creates an empty `task-tracker-state.json` so the agent has a clean session ledger. It refuses to overwrite a populated target.

### Wave parent — required for any solo fan-out of ≥2

**Before** the per-child `dispatch-prep.mjs` loop, when the planned fan-out spans **2 or more candidate children**, the orchestrator MUST run:

```bash
node "$(git rev-parse --show-toplevel)/node_modules/ai-task-manager/scripts/gh/ensure-wave-parent.mjs" \
  --children <N1>,<N2>,<N3> \
  --purpose "<one-line summary of the wave>"
```

The helper classifies the candidates via `lib/wave-detect.mjs` (batched GraphQL parent query) and behaves as follows:

| Classification                                   | Behaviour                                                                                                                                                                        |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| single child (`len==1`)                          | no-op; prints `NO_WAVE_PARENT_NEEDED`; exits 0                                                                                                                                   |
| all solo (no parent), `len ≥ 2`                  | creates a new parent issue at `Status=Develop`, links each child via `addSubIssue`, posts an orchestration `start` row to the new parent's `⏱ Timing Log`, prints `PARENT: #<N>` |
| all share one existing parent                    | prints the existing `PARENT: #<N>` so the orchestrator can switch active task to it; no new issue created                                                                        |
| **mixed** (some solo, some parented)             | **REFUSES** — exits 2 with `wave-detect: mixed-fanout — …`. Orchestrator must hoist the solos under the existing parent (or detach the parented child) before retrying.          |
| **multi-parent** (children of different parents) | **REFUSES** — exits 2 with `wave-detect: multi-parent — …`. These are two waves, not one.                                                                                        |

After a successful `PARENT: #<N>`:

1. **Switch active task to the parent** — `/task #<N>` (orchestrator's session is now bound to the parent, not to any child).
2. **Then** run the per-child `dispatch-prep.mjs` loop as before.

Children continue to log their own time on their own issues. The parent's `⏱ Timing Log` accumulates orchestration time only (dispatch, coordination, merge). The parent's `Size` and `Estimate` start blank — leave them for human grooming rather than auto-summing children.

**Idempotency.** The parent body carries a `<!-- wave-id: ... -->` marker derived from the sorted child list. On retry mid-dispatch, the helper queries open issues for a matching marker and reuses the existing parent rather than creating a duplicate.

**Exception.** A single solo issue (no fan-out, or fan-out of 1) does NOT require a parent. The classifier handles this and emits `NO_WAVE_PARENT_NEEDED`.

### Pre-dispatch board flip — orchestrator owns the transition

Sub-issues that will be picked up immediately by an agent MUST be moved to `In Progress` **by the orchestrator, before the agent boots**, and the `start` timing row MUST be posted by the orchestrator at the same moment. Do not rely on the agent's bootstrap to flip the board status — that path is a silent dependency. If the agent's bootstrap fails for any reason, the board state lies (still `Backlog`) and the work is invisible to the rest of the system.

For each sub-issue about to be dispatched:

```bash
node "$(git rev-parse --show-toplevel)/node_modules/ai-task-manager/scripts/gh/dispatch-prep.mjs" <SUB_N> --description "agent dispatch (sequence <S>)"
```

`dispatch-prep.mjs` runs `move-state.mjs <N> in-progress` then posts a `start` row to the issue's `⏱ Timing Log`. Both happen before the agent boots.

The agent's own bootstrap will still call `move-state.mjs in-progress` and post its own `start` row — those are now idempotent confirmations rather than load-bearing transitions. If the agent never boots, the orchestrator's pre-dispatch state is correct and accountable; the agent's missing presence is what surfaces as a post-dispatch verification failure (no second `start` row, agent not in fleet) rather than as a silently-stalled `Backlog` issue.

**At sub-issue creation time** (the loop in "Sub-Issue Creation Loop"), continue to tether at `--status backlog`. The flip happens at fan-out, not at creation, because not every created sub-issue is dispatched immediately (later sequences wait, deep-dives may land before pickup).

### Orchestrator post-dispatch verification

After dispatching each agent, the orchestrator MUST complete the following four checks within **60 seconds** of dispatch. If any check fails, kill the agent process, force-remove the worktree (`git worktree remove -f -f <path> && git worktree prune`), and re-dispatch.

1. **Worktree config present:** `test -f <worktree>/.ai-task-manager/task-tracker.json` exits 0.
2. **Agent registered in fleet:** `task-tracker.mjs fleet` lists the agent's session and issue.
3. **Issue moved to In Progress:** `gh issue view <N> --json projectItems` shows the project board status as `In Progress` (not `Backlog`/`Ready`).
4. **`start` timing row posted:** the issue's `⏱ Timing Log` comment contains a row with `event=start` whose timestamp is at or after the dispatch moment.

A dispatch with no `start` row in 60s is a silent bootstrap failure. Treat it the same as an explicit `STATUS: BLOCKED` — the agent is not actually running the contract.

### Canary before fan-out

The first multi-agent dispatch in a repository, OR any dispatch following a change to the worktree/bootstrap pipeline (the seeding helper, the pickup directive Hard Rules, the agent prompt, or this section), MUST start with a **single-agent canary** on the smallest available sub-issue.

The fan-out is gated on the canary's `start` row landing in the issue's timing log. If the canary fails the post-dispatch verification, do not fan out — fix the pipeline first. Parallel dispatch amplifies a broken pipeline into N units of discarded work; a canary contains the blast radius to one.

## Error Handling

If GH API fails, the event is queued. Next successful `/task` call drains the queue.

## Validation

- Issue refs must match `^#\d+$`.
- Unknown config keys are rejected with the list of valid keys (CLI handles this).
