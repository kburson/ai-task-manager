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

The `task-tracker.sh` hook fires on `PreCompact` and `PostCompact` to flush timing data automatically, so compactions are lossless for issue tracking.

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
        "command": ".claude/hooks/setup-nvm.sh"
      },
      {
        "type": "command",
        "command": ".claude/hooks/task-tracker.sh"
      }
    ],
    "PreCompact": [
      {
        "type": "command",
        "command": ".claude/hooks/task-tracker.sh"
      }
    ],
    "PostCompact": [
      {
        "type": "command",
        "command": ".claude/hooks/task-tracker.sh"
      }
    ]
  }
}
```

The `setup-nvm.sh` hook is optional — include it if your project uses nvm. The three `task-tracker.sh` hook entries are required for timing data to survive compactions and session restarts.

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

Make it executable and register it in `.claude/settings.json` before the `task-tracker.sh` entry.

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
