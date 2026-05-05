#!/usr/bin/env bash
# Routes PreCompact / PostCompact / SessionStart hooks to task-tracker hook-handler.
set -euo pipefail

INPUT=$(cat)

# Node resolution (nvm then system)
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
  echo "[task-tracker] node not found — skipping" >&2
  exit 0
fi

PROJECT_DIR="${AI_TASK_MANAGER_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$(pwd)}}"
SCRIPT="$PROJECT_DIR/node_modules/ai-task-manager/scripts/task-tracker/hook-handler.mjs"
if [ ! -f "$SCRIPT" ]; then
  echo "[task-tracker] handler not found at $SCRIPT — skipping" >&2
  exit 0
fi

# Pass stdin through; node reads fd 0
echo "$INPUT" | "$NODE_BIN" "$SCRIPT"

exit 0
