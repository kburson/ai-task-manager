#!/bin/bash
# Move a GitHub issue through board states: Backlog → Ready → In Progress → In Review → Done
# Usage: scripts/gh/move-state.sh <issue#> <state>
# States: backlog | ready | in-progress | in-review | done
#
# Requires project config in .claude/task-tracker.json (set by: npx claude-gh-task-manager init)

set -eu

ISSUE=$1
STATE=${2:-}

if [[ ! "$ISSUE" =~ ^[0-9]+$ ]]; then
  echo "Usage: scripts/gh/move-state.sh <issue#> <state>"
  echo "States: backlog | ready | in-progress | in-review | done"
  exit 1
fi

if [[ -z "$STATE" ]]; then
  echo "Usage: scripts/gh/move-state.sh <issue#> <state>"
  echo "States: backlog | ready | in-progress | in-review | done"
  exit 1
fi

# Locate config file
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-$(pwd)}")
CONFIG_FILE="$REPO_ROOT/.claude/task-tracker.json"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Error: task-tracker not configured. Run: npx claude-gh-task-manager init" >&2
  exit 1
fi

read_config() {
  python3 -c "import json; d=json.load(open('$CONFIG_FILE')); print(d.get('$1', ''))" 2>/dev/null || echo ''
}

PROJECT_ID=$(read_config projectId)
FIELD_ID=$(read_config kanbanFieldId)

if [[ -z "$PROJECT_ID" || -z "$FIELD_ID" ]]; then
  echo "Error: Kanban board not configured. Run: npx claude-gh-task-manager init" >&2
  exit 1
fi

case "$STATE" in
  backlog)
    OPTION_ID=$(read_config kanbanOptionBacklog)
    ;;
  ready)
    OPTION_ID=$(read_config kanbanOptionReady)
    ;;
  in-progress|in_progress)
    OPTION_ID=$(read_config kanbanOptionInProgress)
    ;;
  in-review|in_review)
    OPTION_ID=$(read_config kanbanOptionInReview)
    ;;
  done)
    OPTION_ID=$(read_config kanbanOptionDone)
    ;;
  *)
    echo "Unknown state: $STATE"
    echo "States: backlog | ready | in-progress | in-review | done"
    exit 1
    ;;
esac

if [[ -z "$OPTION_ID" ]]; then
  echo "Error: option ID for state '$STATE' not configured. Run: npx claude-gh-task-manager init" >&2
  exit 1
fi

# Get the project item ID for this issue via GraphQL.
# Resolves through the issue's projectItems edge — works for user- and org-owned
# projects without a project number, and avoids the `gh project item-list`
# pagination cap and CLI flag churn.
REPO=$(read_config repo)
OWNER=$(echo "$REPO" | cut -d'/' -f1)
REPO_NAME=$(echo "$REPO" | cut -d'/' -f2)

ITEM_ID=$(gh api graphql -f query="
{
  repository(owner: \"$OWNER\", name: \"$REPO_NAME\") {
    issue(number: $ISSUE) {
      projectItems(first: 10) { nodes { id project { id } } }
    }
  }
}" | python3 -c "
import json,sys
d=json.load(sys.stdin)
issue=d.get('data',{}).get('repository',{}).get('issue')
nodes=(issue or {}).get('projectItems',{}).get('nodes',[])
for n in nodes:
    if n.get('project',{}).get('id') == '$PROJECT_ID':
        print(n['id']); break
")

if [[ -z "$ITEM_ID" ]]; then
  echo "Issue #$ISSUE not found in project (owner: $OWNER, projectId: $PROJECT_ID)"
  exit 1
fi

gh project item-edit --project-id "$PROJECT_ID" --id "$ITEM_ID" --field-id "$FIELD_ID" --single-select-option-id "$OPTION_ID"

echo "✓ Issue #$ISSUE moved to: $STATE"

# End task tracking when an issue is marked done
if [[ "$STATE" == "done" ]]; then
  if [[ -n "$REPO_ROOT" ]]; then
    node "$REPO_ROOT/node_modules/@burson.kendrick/claude-gh-task-manager/scripts/task-tracker/task-tracker.mjs" end 2>/dev/null || true
  fi
fi
