---
name: reference_bash_guard_selflink
description: dogfooding repo needs node_modules/ai-task-manager self-link or ALL bash PreToolUse guards silently fail open
metadata: 
  node_type: memory
  type: reference
  originSessionId: 301e5da3-5b45-4b14-ba73-5ad8ac0d9400
---

The Bash `PreToolUse` guard hook is wired (in `.claude/settings.json` + `.claude/settings.local.json`) to `node node_modules/ai-task-manager/scripts/task-tracker/bash-guard.mjs`. That path is correct for CONSUMER projects but this repo IS `ai-task-manager` and needs a self-referential link. If `node_modules/ai-task-manager` is missing, the hook crashes with `MODULE_NOT_FOUND` on every Bash call and **fails open** — silently disabling ALL bash protections at once (move-state block #675, `gh issue edit --body` refusal #361/#362, dangerous-pattern blocks, `~/.claude` write block).

Required self-symlinks (relative, from repo root):

- `node_modules/ai-task-manager` → `..`
- `node_modules/.bin/ai-task-manager` → `../ai-task-manager/bin/cli.mjs`
- `node_modules/.bin/aitm` → `../ai-task-manager/bin/aitm.mjs`

Create with `ln -sfn` (idempotent). Verify the guard is live by piping a move-state payload through the hook path — it must return `{"decision":"block"}`:

```
printf '%s' '{"tool_name":"Bash","tool_input":{"command":"node scripts/gh/move-state.mjs 748 done"}}' | node node_modules/ai-task-manager/scripts/task-tracker/bash-guard.mjs
```

Discovered 2026-07-08 during #748: a direct `move-state.mjs` call sailed through because the guard wasn't loading. The durable fix — make the guard fail CLOSED on any internal load/eval error so a broken hook can never again silently disable protection — is tracked in #751 (Backlog). See also [[project_task_tracker_invocation_path]] (CLI runs via `bin/`/`scripts/`, node_modules is a symlink) and [[feedback_single_state_mutator]] (move-state is internal; only verbs write Status).
