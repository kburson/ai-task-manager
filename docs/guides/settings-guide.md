# Recommended Claude Code Settings

This guide documents the Claude Code settings that work well with `ai-task-manager`. Most are optional but each has a specific reason.

---

## Core Settings (`~/.claude/settings.json`)

```json
{
  "autoCompactWindow": 150000,
  "outputStyle": "Concise",
  "model": "claude-sonnet-4-6",
  "plugins": ["/Users/<you>/.claude/plugins/claude-plugins-official/superpowers"],
  "statusLine": "/Users/<you>/.claude/statusline.sh",
  "hooks": {
    "Notification": [
      {
        "type": "command",
        "command": "YOUR_NOTIFICATION_COMMAND"
      }
    ]
  }
}
```

### `autoCompactWindow: 150000`

Auto-compacts the conversation at 150,000 tokens. Without this, long sessions bloat until Claude Code prompts you manually — by that point you've already lost fast retrieval. 150k is the sweet spot: large enough for multi-hour sessions, small enough that compaction happens before quality degrades.

The direct Node task-tracker hook fires on `PreCompact` and `PostCompact` to flush timing data automatically, so compactions are lossless for issue tracking.

### `outputStyle: "Concise"`

Eliminates filler, preambles, and trailing summaries. Claude gives direct answers and diffs, not narration. Required if you want sub-100-word responses on simple questions.

### `model: "claude-sonnet-4-6"`

Sets the default model for all sessions and agent dispatches. Sonnet 4.6 is the recommended default — fast, capable, and cost-effective for long interactive sessions. Override to `claude-opus-4-7` for complex architectural work.

---

## Project Settings (`.claude/settings.json`)

The `install` command creates these automatically. Shown here for reference:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "type": "command",
        "command": "node node_modules/ai-task-manager/scripts/task-tracker/hook-handler.mjs"
      }
    ],
    "PreCompact": [
      {
        "type": "command",
        "command": "node node_modules/ai-task-manager/scripts/task-tracker/hook-handler.mjs"
      }
    ],
    "PostCompact": [
      {
        "type": "command",
        "command": "node node_modules/ai-task-manager/scripts/task-tracker/hook-handler.mjs"
      }
    ]
  }
}
```

The timing hook commands are direct Node invocations so installed hook execution does not require POSIX shell support. If your project still needs an optional `setup-nvm.sh` hook, register it before the direct Node timing hook.

### Bash permissions allowlist

`install` writes a positive `permissions.allow` allowlist into `.claude/settings.json` instead of granting a broad `Bash` allow. The PreToolUse hooks (`bash-guard.mjs`, `activity-guard.mjs`) remain in place as defense-in-depth, but the primary security boundary is the enumerated allowlist.

The canonical source-of-truth lives in [`bin/lib/claude-bash-allowlist.mjs`](../../bin/lib/claude-bash-allowlist.mjs). Entries cover the canonical commands the task-tracker drives (`npm test`, `npm run lint`, `npm run format:check`, `node scripts/**`, the symlinked `node_modules/ai-task-manager/scripts/**` dog-food form, `npx aitm <verb>`, read-only `gh`, non-destructive `git`, basic filesystem inspection). Interpreter-payload forms (`bash -c '<payload>'`, `node -e '...'`, `python -c '...'`) are intentionally **not** included — they bypass argv parsing and would let arbitrary code slip past the lexical hook classifier.

Older installs that shipped a single broad `Bash` entry are migrated automatically: re-running `install` drops the broad entry and adds the enumerated ones. Commands outside the allowlist prompt the user for permission rather than auto-running.

#### Why hot commands must be allowlisted — the classifier-stall failure mode (#665)

A command **outside** the allowlist is referred to Claude Code's permission **auto-mode classifier** (model `claude-opus-4-8`) on _every_ invocation. That classifier is occasionally **"temporarily unavailable"** — a transient outage. When it stalls on a _hot_ command (one issued many times per session, e.g. the `aitm`/`gh`/`node` calls that drive a full-auto `/task` chain), the command is blocked and the whole drive halts mid-flight. The fix is to put the hot forms on the allowlist so they short-circuit the classifier entirely:

- `npx aitm <verb>` — the canonical consumer CLI (`Bash(npx aitm:*)`).
- the symlinked `node_modules/ai-task-manager/scripts/**` dog-food form used by the Pickup Directive (the `node scripts/**` glob does not match the `node_modules/…` prefix, so it needs its own entry).
- read-only `gh issue view/list/edit/comment` — already covered.

**Retry fallback.** For network/API calls that the allowlist cannot make deterministic (GitHub API blips, not classifier stalls), the task-tracker wraps GraphQL/REST through [`scripts/gh/lib/with-retry.mjs`](../../scripts/gh/lib/with-retry.mjs) — bounded exponential-backoff retries around transient failures. If a hot command still stalls on the classifier despite being allowlisted, re-issuing it is safe (the verbs are idempotent) and the bounded retry absorbs transient API errors underneath.

### `/tmp` write contract

The bash-guard hook scopes Bash writes to the project root only. The canonical scratch directory is project-local `./.tmp/` (gitignored) with purpose subfolders `gh/`, `plan/`, `heal/`, `inspect/`. System `/tmp/` and `/private/tmp/` are **not** in scope for reads or writes — use `./.tmp/<subfolder>/<file>` instead. This matches the activity-guard `.tmp/**` carve-out documented in `CLAUDE.md` "Tool Usage Rules".

---

## Superpowers Plugin

Install the [Superpowers plugin](https://github.com/anthropics/claude-code-superpowers) from Claude Code settings. Once installed, add the plugin path to `~/.claude/settings.json` `plugins` array.

The plugin provides skills invoked via the `Skill` tool. Key skills for this workflow:

| Skill                                        | When to use                                          |
| -------------------------------------------- | ---------------------------------------------------- |
| `superpowers:brainstorming`                  | Before any creative or architectural work            |
| `superpowers:writing-plans`                  | Before implementation — get to 95% confidence first  |
| `superpowers:executing-plans`                | Execute an approved implementation plan step by step |
| `superpowers:subagent-driven-development`    | Parallel implementation with multiple agents         |
| `superpowers:dispatching-parallel-agents`    | Independent tasks that can run concurrently          |
| `superpowers:systematic-debugging`           | Any bug or test failure                              |
| `superpowers:verification-before-completion` | Before claiming work is done                         |
| `superpowers:requesting-code-review`         | After completing a logical chunk                     |
| `superpowers:finishing-a-development-branch` | After all tasks complete — wrap up the branch        |
| `superpowers:using-git-worktrees`            | Feature work that needs isolation                    |
| `superpowers:test-driven-development`        | When implementing testable features                  |

### Codex Bootstrap

Codex does not run Claude Code plugin startup hooks. AITM can opt in to a compatible setup by mirroring existing Claude Code Superpowers skills into `~/.codex/skills` and adding Codex bootstrap instructions:

```bash
npx ai-task-manager install --codex-superpowers
```

AITM looks for Superpowers under `~/.claude/plugins/cache/claude-plugins-official/superpowers/<version>/skills`. If found, it mirrors the supported skills and appends a marked AITM block to the repo `AGENTS.md`; existing content is preserved and repeat runs update the same block. Use `--codex-superpowers-global` only when you explicitly want to update `~/.codex/AGENTS.md` instead.

If the Superpowers cache is missing, AITM continues without it. Install Superpowers in Claude Code first, then rerun the same command. The AITM task skill remains repo-local at `.agents/skills/task/SKILL.md`.

---

## Status Line

> **CLI only.** The status line feature is only supported in the Claude Code CLI (terminal). It has no effect in the Claude.ai web app or the Claude desktop application. The desktop app is evolving rapidly and may add status line support in a future release.

The status line shows the active `/task` issue number in the Claude Code CLI header bar — useful when juggling multiple issues across sessions.

Install with one command:

```bash
npx ai-task-manager statusline
```

This copies `statusline/statusline.sh` from the package to `~/.claude/statusline.sh` and sets the `statusLine` key in `~/.claude/settings.json` automatically.

### What it shows

While a task is active (`/task #42`), the CLI header displays:

```
task #42
```

When no task is active, the status line is blank (nothing is printed).

### How it works

Claude Code pipes a JSON object containing the current workspace path to the status line script on each render. The script reads `.ai-task-manager/task-tracker-state.json` from that workspace, with legacy `.claude/task-tracker-state.json` fallback, and prints the active issue number.

Requires `jq` to be installed (`brew install jq` on macOS, `apt install jq` on Linux).

### Manual install

If you prefer to manage it yourself:

```bash
# Copy the script
cp node_modules/ai-task-manager/statusline/statusline.sh ~/.claude/statusline.sh
chmod +x ~/.claude/statusline.sh

# Add to ~/.claude/settings.json
{
  "statusLine": "/Users/<you>/.claude/statusline.sh"
}
```

---

## Notification Hook (optional)

Fire a push notification when Claude completes a long task. Uses [ntfy.sh](https://ntfy.sh) (free, no account required for self-hosted; free tier for ntfy.sh cloud).

Add to `~/.claude/settings.json` `hooks.Notification`:

```json
{
  "type": "command",
  "command": "curl -s -X POST https://ntfy.sh/<your-topic> -d 'Claude done' > /dev/null 2>&1 || true"
}
```

Replace `<your-topic>` with any random string (e.g. `claude-done-abc123`). Subscribe to the same topic in the ntfy app on your phone.

---

## nvm Hook (optional)

If your project uses nvm, add a `SessionStart` hook to ensure the right Node version is loaded:

Create `.claude/hooks/setup-nvm.sh`:

```bash
#!/usr/bin/env bash
# Load nvm and switch to the project's Node version.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[[ -s "$NVM_DIR/nvm.sh" ]] && source "$NVM_DIR/nvm.sh"

if [[ -f "$CLAUDE_PROJECT_DIR/.nvmrc" ]]; then
  nvm use --silent 2>/dev/null || true
fi
```

Make it executable and register it in `.claude/settings.json` before the direct Node task-tracker entry.

---

## Ref MCP Server (optional)

Gives Claude access to live documentation for libraries, frameworks, and APIs. Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "ref": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-ref"]
    }
  }
}
```

Once installed, Claude will use `ref_search_documentation` and `ref_read_url` automatically when working with third-party libraries.

---

<!-- cspell:ignore optout -->

## Task-tracker settings (`.ai-task-manager/task-tracker.json`)

A few keys gate state transitions. The defaults are safe; flip them off only with intent.

### `lifecycleCheckboxesRequired` (default `true`)

Controls the hard Review→Done lifecycle-checkbox gate (#179). With the default
`true`, `/task close` (and the underlying state-mover) refuses to advance to
Done unless each item under the `#### Lifecycle (auto-ticked at Review/Close)`
DoD subsection is satisfied by ONE of:

1. Visible checkbox ticked (`- [x] <label>`),
2. Corresponding audit marker present (`<!-- aitm-full-auto-approved: ... -->`
   satisfies `passed-final-review`), or
3. Explicit per-key opt-out marker:
   `<!-- aitm-lifecycle-optout: <key> -->`.

Set to `false` to downgrade the block to a `lifecycle-warn` row in the timing
log — useful for migrations or experimental workflows. See
[`docs/internals/checkbox-gates.md`](../internals/checkbox-gates.md) for the
full policy and inventory of label-string matches.

### `fullAutoMerge` (default absent → Full-Auto PR merge disabled)

Enables the agent to complete the PR-based close flow — merge the reviewed PR and
re-sync local trunk — without a human clicking **Merge**. Delivered by story
`#908` under epic `#912`; see the "Full-Auto PR merge + local-trunk sync" section
in [`workflow.md`](workflow.md). Absent by default: a Full-Auto batch that reaches
a PR merge with no `fullAutoMerge` block halts with an actionable error rather
than a mid-drive classifier denial.

```jsonc
"fullAutoMerge": {
  // "gh-auto-merge": enable GitHub auto-merge (agent runs
  //   `gh pr merge <N> --auto --<method>`; GitHub merges once checks pass).
  // "local-trunk-lane": operator-authorized no-push/no-PR local merge to trunk.
  "mechanism": "gh-auto-merge",
  "mergeMethod": "merge",        // gh-auto-merge only: merge | squash | rebase
  "operatorAuthorized": false    // local-trunk-lane only: must be true to use it
}
```

**Required repo settings for `gh-auto-merge`:** the repository must have
**Allow auto-merge** enabled (Settings → General → Pull Requests) and a
**branch-protection rule** on trunk with at least one required status check —
GitHub only performs an auto-merge once required checks pass. Without these,
`gh pr merge --auto` errors; the flow surfaces that as an actionable message.

**Optional Bash permission rule.** An operator who prefers the direct path may
add a `gh pr merge` allowlist entry (analogous to the human-gate toggles asked
about before parallel fan-out) for the duration of a Full-Auto batch, and remove
it afterward. `gh-auto-merge` avoids needing this because it is not
classifier-blocked.

**Trunk re-sync.** `close` reads `origin/trunk` (never local `trunk`) when it runs
inside a linked worktree, so the merged `[#N]` commit is seen without desyncing
the main worktree. Set `trunkRef` here to override the ref used for the
close-attribution query.

## Lock primitive

EPIC #207 (multi-session safety) needs a mutual-exclusion primitive when two
Claude Code sessions in the same repo touch shared state files. After review,
the project standardized on the **mkdir-based `withLock()`** pattern already
proven in
[`scripts/task-tracker/fleet-registry.mjs`](../../scripts/task-tracker/fleet-registry.mjs)
(lines 19–50). All EPIC #207 sub-issues (Seq 1–5) MUST inherit this choice.

Rationale:

- `mkdir(2)` is atomic on every POSIX filesystem the runtime supports; no race
  window between check and acquire.
- Stale-lock detection by directory mtime (`LOCK_STALE_MS = 30s`) is sufficient
  for the durations the task-tracker holds locks (milliseconds, occasionally
  seconds during `gh` calls). No daemon, no PID file, no extra cleanup.
- Zero native dependencies — preserves the "Node + `gh`, nothing else" install
  promise. The rejected alternative was `flock(2)` via an npm dep such as
  `proper-lockfile` or `fs-ext`, which would add a native build step and a new
  attack surface for marginal benefit.
- The pattern is already exercised under concurrency by `fleet-registry`'s
  test suite (`fleet-registry-concurrent.test.mjs`), giving us a working
  template to copy rather than design from scratch.

Implementers in Seq 2–5: import or replicate the `withLock(registryPath, fn)`
shape from `fleet-registry.mjs`. Do NOT introduce a competing lock primitive.

## Hook-driven pause/resume

Two hooks turn natural conversational pauses into mechanical timing events — no
`/task pause` discipline required for ordinary inter-turn idle gaps. Claude Code
registers them in `.claude/settings.json`; Codex registers them in
`.codex/hooks.json`.

- **`Stop` hook → `scripts/task-tracker/hooks/on-stop.mjs`**: when Claude
  Code or Codex finishes a turn, the hook writes a JSON marker at
  `.ai-task-manager/sessions/<sid>/pending-pause.json` containing
  `{stoppedAt, issue, sessionId}`. Zero network I/O.
- **`UserPromptSubmit` hook → `scripts/task-tracker/hooks/on-user-prompt.mjs`**:
  when the user sends the next turn, the hook reads the marker, computes the
  inter-turn gap, and (above `pauseThresholdSeconds`) appends one `idle` row to
  the bound issue's `⏱ Timing Log` comment. The marker is then deleted.

Both hooks key on `CLAUDE_SESSION_ID`, `AI_TASK_MANAGER_SESSION_ID`,
`CODEX_SESSION_ID`, or Codex's hook stdin `session_id` field. They tolerate
missing env / missing active task / write failures — a misbehaving hook must
never break the user's session.

## Per-session state layout

Each Claude Code session gets its own subdirectory so two sessions in the same
repo cannot clobber each other:

```
<projectRoot>/.ai-task-manager/
  sessions/
    <sid>/
      active-task.json     # bound issue + entry timestamps + word baseline
      pending-pause.json   # ephemeral pause marker (deleted on resume)
  locks/
    timing-#<issue>.lock/  # per-issue mkdir-based withLock dir
  queue/                   # offline post queue (drained on next online verb)
```

`.ai-task-manager/sessions/` and `.ai-task-manager/locks/` are gitignored —
they are local-only runtime state. Only `task-tracker.json` (config) is
committed.

## Orphan finalize

A "pending pause" marker can become orphaned when a session dies before the
next `UserPromptSubmit` fires (window closed, machine slept, process killed).
The shared lib at `scripts/task-tracker/orphan-finalize.mjs` finalizes those
markers from FOUR triggers — all routed through one implementation:

| Trigger                          | Reason tag        | When                                                 |
| -------------------------------- | ----------------- | ---------------------------------------------------- |
| `UserPromptSubmit` hook          | `natural`         | Normal next-turn resume                              |
| `verbs/start` and `verbs/resume` | `orphan-finalize` | Before binding/rebinding an issue                    |
| `verbs/switch` (`/task #N`)      | `switch`          | When the new sid differs from the bound one (forced) |
| `onSessionStart` sweep           | `stale-session`   | Per stale dir older than `sessionRetentionDays`      |

The idle row always lands on the issue named in the marker — NOT the
currently-bound issue. Sub-threshold gaps silently delete the marker without
posting (except `switch`, which forces a row regardless). A marker whose
`sessionId` differs from the consuming session's sid is REFUSED with a stderr
warning and left in place for the real owner to recover.

## Per-session timing config

Two task-tracker keys (`.ai-task-manager/task-tracker.json`) govern hook
behavior:

### `pauseThresholdSeconds` (default `30`)

Minimum inter-turn gap, in seconds, that produces an `idle` row in the timing
comment. Gaps shorter than this are dropped — they represent normal think-time,
not real pauses. Raise to suppress chatty short rows; lower to capture every
hesitation.

### `sessionRetentionDays` (default `2`)

Maximum age, in days, that a `.ai-task-manager/sessions/<sid>/` directory
survives without activity. The `onSessionStart` sweep finalizes any pending
pause inside an older dir (reason `stale-session`) and then removes the dir.
Raise if you frequently resume work in long-stale sessions; lower to keep the
runtime tree compact.
