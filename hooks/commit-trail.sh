#!/usr/bin/env bash
# PostToolUse hook: routes Bash tool calls to the commit-trail handler.
# Silent on all failures — must not break the developer's shell loop.
set -uo pipefail

INPUT=$(cat)

NODE_BIN=""
if [ -f "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  # shellcheck source=/dev/null
  source "$NVM_DIR/nvm.sh" --no-use 2>/dev/null || true
  NODE_BIN=$(nvm which current 2>/dev/null || echo "")
fi
if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  NODE_BIN=$(command -v node 2>/dev/null || echo "")
fi
if [ -z "$NODE_BIN" ]; then
  exit 0
fi

PROJECT_DIR="${AI_TASK_MANAGER_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$(pwd)}}"
SCRIPT="$PROJECT_DIR/node_modules/ai-task-manager/scripts/task-tracker/commit-trail-handler.mjs"
if [ ! -f "$SCRIPT" ]; then
  # Fallback to in-repo path (used by this repo's own .claude/settings.json).
  SCRIPT="$PROJECT_DIR/scripts/task-tracker/commit-trail-handler.mjs"
fi
if [ ! -f "$SCRIPT" ]; then
  exit 0
fi

echo "$INPUT" | "$NODE_BIN" "$SCRIPT" 2>/dev/null || true
exit 0
