#!/bin/sh
# Claude Code status line — shows active task-tracker issue in the CLI header bar.
#
# COMPATIBILITY: Status line is only supported in the Claude Code CLI (terminal).
# It has no effect in the Claude.ai web app or the Claude desktop application.
# The Claude desktop application is evolving rapidly and may add status line
# support in a future release.
#
# Claude Code pipes a JSON object to stdin containing workspace context.
# This script extracts current_dir, reads the task-tracker state file,
# and prints the active issue number (or nothing if no task is active).
#
# Requires: jq

input=$(cat)
cwd=$(echo "$input" | jq -r '.workspace.current_dir // empty' 2>/dev/null)

if [ -z "$cwd" ]; then
  exit 0
fi

state_file="$cwd/.claude/task-tracker-state.json"

if [ ! -f "$state_file" ]; then
  exit 0
fi

active=$(jq -r '.active // empty' "$state_file" 2>/dev/null)

if [ -n "$active" ]; then
  echo "task $active"
fi
