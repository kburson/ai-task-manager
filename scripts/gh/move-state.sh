#!/bin/bash
# Move a GitHub issue through board states: Backlog → Ready → In Progress → In Review → Done
# Usage: scripts/gh/move-state.sh <issue#> <state>
# States: backlog | ready | in-progress | in-review | done
#
# Requires project config in .ai-task-manager/task-tracker.json (set by: npx ai-task-manager init)

set -eu

ISSUE=$1
STATE=${2:-}
ITEM_ID_OVERRIDE=""

# Parse optional --item-id <id> flag (skips the GraphQL lookup — use when caller
# already has the project item ID, e.g. from addProjectV2ItemById response)
shift 2 2>/dev/null || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --item-id) ITEM_ID_OVERRIDE="${2:-}"; shift 2 ;;
    *) shift ;;
  esac
done

if [[ ! "$ISSUE" =~ ^[0-9]+$ ]]; then
  echo "Usage: scripts/gh/move-state.sh <issue#> <state> [--item-id <project-item-id>]"
  echo "States: backlog | ready | in-progress | in-review | done"
  exit 1
fi

if [[ -z "$STATE" ]]; then
  echo "Usage: scripts/gh/move-state.sh <issue#> <state> [--item-id <project-item-id>]"
  echo "States: backlog | ready | in-progress | in-review | done"
  exit 1
fi

# Locate config file
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "${AI_TASK_MANAGER_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$(pwd)}}")
CONFIG_FILE="$REPO_ROOT/.ai-task-manager/task-tracker.json"
if [[ ! -f "$CONFIG_FILE" && -f "$REPO_ROOT/.claude/task-tracker.json" ]]; then
  CONFIG_FILE="$REPO_ROOT/.claude/task-tracker.json"
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Error: task-tracker not configured. Run: npx ai-task-manager init" >&2
  exit 1
fi

read_config() {
  python3 -c "import json; d=json.load(open('$CONFIG_FILE')); print(d.get('$1', ''))" 2>/dev/null || echo ''
}

PROJECT_ID=$(read_config projectId)
FIELD_ID=$(read_config kanbanFieldId)

if [[ -z "$PROJECT_ID" || -z "$FIELD_ID" ]]; then
  echo "Error: Kanban board not configured. Run: npx ai-task-manager init" >&2
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
  echo "Error: option ID for state '$STATE' not configured. Run: npx ai-task-manager init" >&2
  exit 1
fi

REPO=$(read_config repo)

# Done gate — refuse if the issue body still has unchecked process boxes.
# Audited override: TASK_TRACKER_FORCE_DONE=1 bypasses but writes a visible bypass
# notice to the issue's timing log so the skip is auditable.
if [[ "$STATE" == "done" ]]; then
  BODY=$(gh issue view "$ISSUE" -R "$REPO" --json body --jq '.body' 2>/dev/null || echo "")
  if [[ -n "$BODY" ]]; then
    UNCHECKED=$(echo "$BODY" \
      | grep '^- \[ \] ' \
      | grep -v '^- \[ \] Issue moved to Done$' \
      | grep -v '^- \[ \] `/task close` run (writes Engaged Time, Session Time, and Context Length automatically)$' \
      | grep -v '^- \[ \] If this completes the parent epic: update parent body; close parent if all siblings Done$' \
      | wc -l | tr -d ' ' || true)
    HAS_DEEP_DIVE_DONE=$(echo "$BODY" | grep -c '^- \[x\] Deep dive complete' || true)
    HAS_DEEP_DIVE_LINE=$(echo "$BODY" | grep -c 'Deep dive complete' || true)

    REASONS=()
    if [[ "$UNCHECKED" -gt 0 ]]; then
      REASONS+=("$UNCHECKED unchecked checkbox(es) in issue body")
    fi
    if [[ "$HAS_DEEP_DIVE_LINE" -gt 0 && "$HAS_DEEP_DIVE_DONE" -eq 0 ]]; then
      REASONS+=("Deep dive checkpoint is not checked off")
    fi

    if [[ ${#REASONS[@]} -gt 0 ]]; then
      if [[ "${TASK_TRACKER_FORCE_DONE:-}" == "1" ]]; then
        echo "⚠ TASK_TRACKER_FORCE_DONE=1 — bypassing done gate for #$ISSUE" >&2
        for r in "${REASONS[@]}"; do echo "   • $r" >&2; done
        gh issue comment "$ISSUE" -R "$REPO" --body "⚠ **Done gate bypassed** via \`TASK_TRACKER_FORCE_DONE=1\` at $(date -u +%Y-%m-%dT%H:%M:%SZ). Unverified: $(IFS=, ; echo "${REASONS[*]}")." >/dev/null 2>&1 || true
      else
        echo "" >&2
        echo "⛔ Refusing to move #$ISSUE to Done:" >&2
        for r in "${REASONS[@]}"; do echo "   • $r" >&2; done
        echo "" >&2
        echo "See .ai-task-manager/pickup-directive.md Hard Rules." >&2
        echo "Verify each item, check its box, then retry. Legitimate-abandonment override:" >&2
        echo "   TASK_TRACKER_FORCE_DONE=1 $0 $ISSUE done${ITEM_ID_OVERRIDE:+ --item-id $ITEM_ID_OVERRIDE}" >&2
        echo "" >&2
        exit 4
      fi
    fi
  fi
fi

OWNER=$(echo "$REPO" | cut -d'/' -f1)
REPO_NAME=$(echo "$REPO" | cut -d'/' -f2)

if [[ -n "$ITEM_ID_OVERRIDE" ]]; then
  ITEM_ID="$ITEM_ID_OVERRIDE"
else
  # Get the project item ID for this issue via GraphQL.
  # Resolves through the issue's projectItems edge — works for user- and org-owned
  # projects without a project number, and avoids the `gh project item-list`
  # pagination cap and CLI flag churn.
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
fi

gh project item-edit --project-id "$PROJECT_ID" --id "$ITEM_ID" --field-id "$FIELD_ID" --single-select-option-id "$OPTION_ID"

echo "✓ Issue #$ISSUE moved to: $STATE"

EVENT_FIELDS_SCRIPT="$REPO_ROOT/node_modules/ai-task-manager/scripts/gh/update-event-fields.mjs"
if [[ ! -f "$EVENT_FIELDS_SCRIPT" ]]; then
  EVENT_FIELDS_SCRIPT="$REPO_ROOT/scripts/gh/update-event-fields.mjs"
fi
if [[ -f "$EVENT_FIELDS_SCRIPT" ]]; then
  node "$EVENT_FIELDS_SCRIPT" "$ISSUE" "$STATE" --item-id "$ITEM_ID" 2>/dev/null || true
fi

# End task tracking when an issue is marked done
if [[ "$STATE" == "done" ]]; then
  if [[ -n "$REPO_ROOT" ]]; then
    node "$REPO_ROOT/node_modules/ai-task-manager/scripts/task-tracker/task-tracker.mjs" end 2>/dev/null || true
  fi
fi
