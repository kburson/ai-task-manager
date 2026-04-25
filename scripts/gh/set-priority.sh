#!/bin/bash
# Set Priority field on a GitHub issue (and optionally all sub-issues).
# Sub-issues must share the same priority as their parent to appear in the correct swim lane.
# Usage: scripts/gh/set-priority.sh <issue#> <priority> [--cascade]
# Priorities: p0 | p1 | p2
# --cascade: also set the same priority on all direct sub-issues
#
# Requires project config in .claude/task-tracker.json (set by: npx claude-gh-task-manager init)

set -eu

ISSUE=$1
PRIORITY=${2:-}
CASCADE=${3:-}

if [[ ! "$ISSUE" =~ ^[0-9]+$ ]]; then
  echo "Usage: scripts/gh/set-priority.sh <issue#> <priority> [--cascade]"
  echo "Priorities: p0 | p1 | p2"
  exit 1
fi

if [[ -z "$PRIORITY" ]]; then
  echo "Usage: scripts/gh/set-priority.sh <issue#> <priority> [--cascade]"
  echo "Priorities: p0 | p1 | p2"
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
PRIORITY_FIELD_ID=$(read_config priorityFieldId)
REPO=$(read_config repo)
OWNER=$(echo "$REPO" | cut -d'/' -f1)
REPO_NAME=$(echo "$REPO" | cut -d'/' -f2)

if [[ -z "$PROJECT_ID" || -z "$PRIORITY_FIELD_ID" ]]; then
  echo "Error: Priority field not configured. Run: npx claude-gh-task-manager init" >&2
  exit 1
fi

case "$(echo "$PRIORITY" | tr '[:upper:]' '[:lower:]')" in
  p0) OPTION_ID=$(read_config priorityOptionP0) ;;
  p1) OPTION_ID=$(read_config priorityOptionP1) ;;
  p2) OPTION_ID=$(read_config priorityOptionP2) ;;
  *)
    echo "Unknown priority: $PRIORITY"
    echo "Priorities: p0 | p1 | p2"
    exit 1
    ;;
esac

if [[ -z "$OPTION_ID" ]]; then
  echo "Error: option ID for priority '$PRIORITY' not configured. Run: npx claude-gh-task-manager init" >&2
  exit 1
fi

set_priority() {
  local issue_num=$1
  local item_id
  item_id=$(gh api graphql -f query="
  {
    repository(owner: \"$OWNER\", name: \"$REPO_NAME\") {
      issue(number: $issue_num) {
        projectItems(first: 5) { nodes { id } }
      }
    }
  }" | python3 -c "import json,sys; d=json.load(sys.stdin); nodes=d['data']['repository']['issue']['projectItems']['nodes']; print(nodes[0]['id'] if nodes else '')")

  if [[ -z "$item_id" ]]; then
    echo "  Issue #$issue_num not found in project — skipping"
    return
  fi

  gh project item-edit --project-id "$PROJECT_ID" --id "$item_id" \
    --field-id "$PRIORITY_FIELD_ID" --single-select-option-id "$OPTION_ID" > /dev/null
  echo "  ✓ #$issue_num → $(echo "$PRIORITY" | tr '[:lower:]' '[:upper:]')"
}

echo "Setting priority on #$ISSUE..."
set_priority "$ISSUE"

if [[ "$CASCADE" == "--cascade" ]]; then
  echo "Cascading to sub-issues of #$ISSUE..."
  SUB_ISSUES=$(gh api graphql -f query="
  {
    repository(owner: \"$OWNER\", name: \"$REPO_NAME\") {
      issue(number: $ISSUE) {
        subIssues(first: 50) { nodes { number } }
      }
    }
  }" | python3 -c "import json,sys; d=json.load(sys.stdin); [print(n['number']) for n in d['data']['repository']['issue']['subIssues']['nodes']]" 2>/dev/null || true)

  if [[ -z "$SUB_ISSUES" ]]; then
    echo "  No sub-issues found"
  else
    for sub in $SUB_ISSUES; do
      set_priority "$sub"
    done
  fi
fi
