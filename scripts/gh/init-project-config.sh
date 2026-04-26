#!/bin/bash
# Interactive setup for claude-gh-task-manager.
# Walks through GitHub auth, discovers GitHub Projects V2 field/option IDs,
# and writes .claude/task-tracker.json + .github/ISSUE_TEMPLATE/ in the target project.
#
# Usage: scripts/gh/init-project-config.sh [--target <project-dir>]

set -euo pipefail

# ── helpers ────────────────────────────────────────────────────────────────

bold()  { printf "\033[1m%s\033[0m\n" "$*"; }
info()  { printf "  \033[34mℹ\033[0m  %s\n" "$*"; }
ok()    { printf "  \033[32m✓\033[0m  %s\n" "$*"; }
warn()  { printf "  \033[33m⚠\033[0m  %s\n" "$*"; }
err()   { printf "  \033[31m✗\033[0m  %s\n" "$*" >&2; }
prompt(){ printf "\033[1m%s\033[0m " "$*"; }

py_get() {
  # py_get <file> <key>
  python3 -c "import json; d=json.load(open('$1')); print(d.get('$2',''))" 2>/dev/null || echo ''
}

# ── args ───────────────────────────────────────────────────────────────────

TARGET_DIR=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET_DIR="$2"; shift 2 ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

if [[ -z "$TARGET_DIR" ]]; then
  TARGET_DIR=$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-$(pwd)}")
fi

CONFIG_DIR="$TARGET_DIR/.claude"
CONFIG_FILE="$CONFIG_DIR/task-tracker.json"
mkdir -p "$CONFIG_DIR"

# ── banner ─────────────────────────────────────────────────────────────────

echo ""
bold "═══════════════════════════════════════════════════"
bold "   claude-gh-task-manager — Project Setup"
bold "═══════════════════════════════════════════════════"
echo ""
info "Target project: $TARGET_DIR"
echo ""

# ── step 1: github auth ────────────────────────────────────────────────────

bold "Step 1 of 5 — GitHub Authentication"
echo ""

if ! command -v gh &>/dev/null; then
  err "GitHub CLI (gh) not found. Install from: https://cli.github.com"
  exit 1
fi

if gh auth status &>/dev/null; then
  GH_USER=$(gh api user --jq '.login' 2>/dev/null || echo "unknown")
  ok "Already authenticated as: $GH_USER"
else
  warn "Not authenticated with GitHub CLI."
  echo ""
  info "Starting GitHub authentication..."
  echo ""
  gh auth login
  GH_USER=$(gh api user --jq '.login' 2>/dev/null || echo "unknown")
  ok "Authenticated as: $GH_USER"
fi
echo ""

# ── step 2: repo + project ─────────────────────────────────────────────────

bold "Step 2 of 5 — Repository & GitHub Project"
echo ""

# Detect repo from git remote
DETECTED_REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null || echo '')

if [[ -n "$DETECTED_REPO" ]]; then
  info "Detected repo: $DETECTED_REPO"
  prompt "Use this repo? [Y/n]:"
  read -r USE_DETECTED
  if [[ "$USE_DETECTED" =~ ^[Nn] ]]; then
    DETECTED_REPO=""
  fi
fi

if [[ -z "$DETECTED_REPO" ]]; then
  prompt "GitHub repo (owner/repo):"
  read -r DETECTED_REPO
fi

REPO="$DETECTED_REPO"
OWNER=$(echo "$REPO" | cut -d'/' -f1)
REPO_NAME=$(echo "$REPO" | cut -d'/' -f2)
ok "Repo: $REPO"
echo ""

# List available projects for this owner
info "Fetching GitHub Projects for $OWNER..."
PROJECTS_JSON=$(gh project list --owner "$OWNER" --format json --limit 20 2>/dev/null || echo '{"projects":[]}')
PROJECT_COUNT=$(python3 -c "import json,sys; d=json.loads('''$PROJECTS_JSON'''); print(len(d.get('projects',[])))" 2>/dev/null || echo '0')

PROJECT_NODE_ID=""
if [[ "$PROJECT_COUNT" == "0" ]]; then
  warn "No GitHub Projects V2 found for $OWNER."
  echo ""
  info "A GitHub Project board is required to track Kanban state."
  echo ""
  DEFAULT_TITLE="$REPO_NAME Board"
  prompt "Create a new project now? [Y/n] (title: '$DEFAULT_TITLE'):"
  read -r CREATE_PROJECT
  if [[ "$CREATE_PROJECT" =~ ^[Nn] ]]; then
    err "Cannot continue without a GitHub Project. Create one at:"
    err "  https://github.com/users/$OWNER/projects/new"
    err "Then re-run: npx claude-gh-task-manager init"
    exit 1
  fi

  prompt "Project title [$DEFAULT_TITLE]:"
  read -r PROJECT_TITLE
  [[ -z "$PROJECT_TITLE" ]] && PROJECT_TITLE="$DEFAULT_TITLE"

  info "Creating project '$PROJECT_TITLE'..."
  PROJECT_CREATE_OUT=$(gh project create --owner "$OWNER" --title "$PROJECT_TITLE" --format json 2>/dev/null || echo '')
  if [[ -z "$PROJECT_CREATE_OUT" ]]; then
    err "Failed to create project. Please create one manually at:"
    err "  https://github.com/users/$OWNER/projects/new"
    err "Then re-run: npx claude-gh-task-manager init"
    exit 1
  fi
  PROJECT_NUMBER=$(python3 -c "import json; print(json.loads('''$PROJECT_CREATE_OUT''').get('number',''))" 2>/dev/null || echo '')
  ok "Created project #$PROJECT_NUMBER: $PROJECT_TITLE"

  # Resolve the new project node ID immediately
  info "Fetching project node ID..."
  PROJECT_NODE_ID=$(gh api graphql -f query="
{
  user(login: \"$OWNER\") {
    projectV2(number: $PROJECT_NUMBER) { id }
  }
}" --jq '.data.user.projectV2.id' 2>/dev/null || \
  gh api graphql -f query="
{
  organization(login: \"$OWNER\") {
    projectV2(number: $PROJECT_NUMBER) { id }
  }
}" --jq '.data.organization.projectV2.id' 2>/dev/null || echo '')

  if [[ -z "$PROJECT_NODE_ID" ]]; then
    err "Could not resolve new project #$PROJECT_NUMBER."
    exit 1
  fi
  ok "Project node ID: $PROJECT_NODE_ID"

  # Create Status field with standard Kanban options
  info "Creating Status field with Kanban options..."
  STATUS_FIELD_OUT=$(gh api graphql -f query='
mutation($proj: ID!) {
  createProjectV2Field(input: {
    projectId: $proj
    dataType: SINGLE_SELECT
    name: "Status"
    singleSelectOptions: [
      {name: "Backlog",     color: GRAY,   description: ""},
      {name: "Ready",       color: BLUE,   description: ""},
      {name: "In Progress", color: YELLOW, description: ""},
      {name: "In Review",   color: ORANGE, description: ""},
      {name: "Done",        color: GREEN,  description: ""}
    ]
  }) {
    projectV2Field { ... on ProjectV2SingleSelectField { id options { id name } } }
  }
}' -f proj="$PROJECT_NODE_ID" 2>/dev/null || echo '')

  if [[ -z "$STATUS_FIELD_OUT" ]]; then
    err "Could not create Status field. The project was created but setup is incomplete."
    err "Add a Status (single-select) field manually, then re-run: npx claude-gh-task-manager init"
    exit 1
  fi
  ok "Status field created with Backlog / Ready / In Progress / In Review / Done"
  echo ""

  # Refresh PROJECTS_JSON and jump to field fetch below
  PROJECTS_JSON=$(gh project list --owner "$OWNER" --format json --limit 20 2>/dev/null || echo '{"projects":[]}')
  PROJECT_COUNT=1
else
  echo ""
  info "Available projects:"
  python3 -c "
import json
d = json.loads('''$PROJECTS_JSON''')
for p in d.get('projects', []):
    print(f\"    [{p['number']}] {p['title']}\")
" 2>/dev/null || true
  FIRST_NUMBER=$(python3 -c "
import json
d = json.loads('''$PROJECTS_JSON''')
ps = d.get('projects', [])
if ps: print(ps[0]['number'], end='')
" 2>/dev/null || echo '')
  echo ""
  while true; do
    if [[ -n "$FIRST_NUMBER" ]]; then
      prompt "Enter project number [$FIRST_NUMBER]:"
    else
      prompt "Enter project number:"
    fi
    read -r PROJECT_NUMBER
    [[ -z "$PROJECT_NUMBER" && -n "$FIRST_NUMBER" ]] && PROJECT_NUMBER="$FIRST_NUMBER"
    [[ "$PROJECT_NUMBER" =~ ^[0-9]+$ ]] && break
    err "Please enter a valid project number."
  done
fi

ok "Using project #$PROJECT_NUMBER"
echo ""

# Resolve project node ID (skip if already resolved by auto-create above)
if [[ -z "$PROJECT_NODE_ID" ]]; then
  info "Fetching project node ID..."
  PROJECT_NODE_ID=$(gh api graphql -f query="
{
  user(login: \"$OWNER\") {
    projectV2(number: $PROJECT_NUMBER) { id title }
  }
}" --jq '.data.user.projectV2.id' 2>/dev/null || \
  gh api graphql -f query="
{
  organization(login: \"$OWNER\") {
    projectV2(number: $PROJECT_NUMBER) { id title }
  }
}" --jq '.data.organization.projectV2.id' 2>/dev/null || echo '')
fi

if [[ -z "$PROJECT_NODE_ID" ]]; then
  err "Could not resolve project #$PROJECT_NUMBER for $OWNER."
  err "Ensure the project exists and you have access."
  exit 1
fi
ok "Project node ID: $PROJECT_NODE_ID"
echo ""

# ── step 3: kanban field discovery ────────────────────────────────────────

bold "Step 3 of 5 — Kanban Status Field"
echo ""

info "Fetching project fields..."
FIELDS_JSON=$(gh api graphql -f query="
{
  node(id: \"$PROJECT_NODE_ID\") {
    ... on ProjectV2 {
      fields(first: 30) {
        nodes {
          ... on ProjectV2SingleSelectField {
            id name options { id name }
          }
          ... on ProjectV2Field {
            id name
          }
        }
      }
    }
  }
}" --jq '.data.node.fields.nodes' 2>/dev/null || echo '[]')

# List single-select fields (likely Kanban status candidates)
echo ""
info "Single-select fields found:"
python3 -c "
import json, sys
fields = json.loads('''$FIELDS_JSON''')
for f in fields:
    if 'options' in f:
        opts = ', '.join(o['name'] for o in f.get('options', []))
        print(f\"    [{f['name']}]  options: {opts}\")
" 2>/dev/null || true
echo ""

KANBAN_FIELD_JSON=""
while [[ -z "$KANBAN_FIELD_JSON" ]]; do
  prompt "Which field is your Kanban status field? [Status]:"
  read -r KANBAN_FIELD_NAME
  [[ -z "$KANBAN_FIELD_NAME" ]] && KANBAN_FIELD_NAME="Status"

  KANBAN_FIELD_JSON=$(python3 -c "
import json
fields = json.loads('''$FIELDS_JSON''')
for f in fields:
    if f.get('name','').lower() == '$KANBAN_FIELD_NAME'.lower() and 'options' in f:
        print(json.dumps(f))
        break
" 2>/dev/null || echo '')

  if [[ -z "$KANBAN_FIELD_JSON" ]]; then
    err "Field '$KANBAN_FIELD_NAME' not found or has no options. Try again."
  fi
done

KANBAN_FIELD_ID=$(python3 -c "import json; print(json.loads('''$KANBAN_FIELD_JSON''')['id'])")
ok "Kanban field ID: $KANBAN_FIELD_ID"
echo ""

# Map state names to option IDs
info "Field options:"
python3 -c "
import json
f = json.loads('''$KANBAN_FIELD_JSON''')
for o in f.get('options', []):
    print(f\"    [{o['id']}]  {o['name']}\")
" 2>/dev/null || true
echo ""

map_option() {
  local label="$1"
  local default_names="$2"
  local field_json="$3"
  # Try to auto-match by name
  local matched
  matched=$(python3 -c "
import json
f = json.loads('''$field_json''')
defaults = [n.strip().lower() for n in '$default_names'.split(',')]
for o in f.get('options', []):
    if o['name'].lower() in defaults:
        print(o['id'])
        break
" 2>/dev/null || echo '')
  if [[ -n "$matched" ]]; then
    ok "Auto-matched '$label' → $matched" >&2
    echo "$matched"
  else
    prompt "Option ID for '$label' state:" >&2
    read -r val
    echo "$val"
  fi
}

info "Mapping Kanban state names to option IDs (auto-matched where possible)..."
echo ""
OPTION_BACKLOG=$(map_option "Backlog" "backlog,todo,to do" "$KANBAN_FIELD_JSON")
OPTION_READY=$(map_option "Ready" "ready,refined,groomed" "$KANBAN_FIELD_JSON")
OPTION_IN_PROGRESS=$(map_option "In Progress" "in progress,in-progress,doing,wip" "$KANBAN_FIELD_JSON")
OPTION_IN_REVIEW=$(map_option "In Review" "in review,in-review,review,reviewing" "$KANBAN_FIELD_JSON")
OPTION_DONE=$(map_option "Done" "done,closed,complete,completed" "$KANBAN_FIELD_JSON")
echo ""

# ── step 4: priority + timing fields ──────────────────────────────────────

bold "Step 4 of 5 — Priority & Timing Fields"
echo ""

info "Looking for Priority field..."
PRIORITY_FIELD_JSON=$(python3 -c "
import json
fields = json.loads('''$FIELDS_JSON''')
for f in fields:
    if 'priority' in f.get('name','').lower() and 'options' in f:
        print(json.dumps(f))
        break
" 2>/dev/null || echo '')

PRIORITY_FIELD_ID=""
OPTION_P0="" OPTION_P1="" OPTION_P2=""

if [[ -n "$PRIORITY_FIELD_JSON" ]]; then
  PRIORITY_FIELD_NAME=$(python3 -c "import json; print(json.loads('''$PRIORITY_FIELD_JSON''')['name'])")
  ok "Found priority field: $PRIORITY_FIELD_NAME"
  PRIORITY_FIELD_ID=$(python3 -c "import json; print(json.loads('''$PRIORITY_FIELD_JSON''')['id'])")
  echo ""
  info "Priority options:"
  python3 -c "
import json
f = json.loads('''$PRIORITY_FIELD_JSON''')
for o in f.get('options', []):
    print(f\"    [{o['id']}]  {o['name']}\")
" 2>/dev/null || true
  echo ""
  OPTION_P0=$(map_option "P0 (critical)" "p0,critical,urgent" "$PRIORITY_FIELD_JSON")
  OPTION_P1=$(map_option "P1 (high)" "p1,high,important" "$PRIORITY_FIELD_JSON")
  OPTION_P2=$(map_option "P2 (normal)" "p2,normal,medium,low" "$PRIORITY_FIELD_JSON")
else
  warn "No 'Priority' single-select field found — skipping priority config."
  info "Add a Priority field to your project and re-run init to enable it."
fi
echo ""


# ── step 5: write config + issue templates ─────────────────────────────────

bold "Step 5 of 5 — Writing Config & Issue Templates"
echo ""

# Write .claude/task-tracker.json
python3 -c "
import json, os
config_file = '$CONFIG_FILE'
# Merge with existing config if present
existing = {}
if os.path.exists(config_file):
    try:
        existing = json.load(open(config_file))
    except Exception:
        pass

existing.update({
    'repo': '$REPO',
    'projectId': '$PROJECT_NODE_ID',
    'kanbanFieldId': '$KANBAN_FIELD_ID',
    'kanbanOptionBacklog': '$OPTION_BACKLOG',
    'kanbanOptionReady': '$OPTION_READY',
    'kanbanOptionInProgress': '$OPTION_IN_PROGRESS',
    'kanbanOptionInReview': '$OPTION_IN_REVIEW',
    'kanbanOptionDone': '$OPTION_DONE',
    'priorityFieldId': '$PRIORITY_FIELD_ID',
    'priorityOptionP0': '$OPTION_P0',
    'priorityOptionP1': '$OPTION_P1',
    'priorityOptionP2': '$OPTION_P2',
})
with open(config_file, 'w') as f:
    json.dump(existing, f, indent=2)
    f.write('\n')
print('written')
"
ok "Config written: $CONFIG_FILE"
echo ""

# Write GitHub issue templates
TEMPLATE_DIR="$TARGET_DIR/.github/ISSUE_TEMPLATE"
mkdir -p "$TEMPLATE_DIR"

# Task template
cat > "$TEMPLATE_DIR/task.yml" <<'TMPL'
name: Task
description: A unit of work tracked by the AI task manager
title: "[Task] "
labels: []
body:
  - type: markdown
    attributes:
      value: |
        Fill in the sections below. The AI assistant will track time and context words
        for this issue automatically via the `/task` skill.

  - type: textarea
    id: description
    attributes:
      label: Description
      description: What needs to be done and why?
    validations:
      required: true

  - type: textarea
    id: acceptance-criteria
    attributes:
      label: Acceptance Criteria
      description: How will we know this is done?
      value: |
        - [ ]
        - [ ]
    validations:
      required: true

  - type: dropdown
    id: priority
    attributes:
      label: Priority
      options:
        - P0 — Critical / blocking
        - P1 — High / this sprint
        - P2 — Normal / backlog
    validations:
      required: true

  - type: dropdown
    id: size
    attributes:
      label: Size
      description: Estimated effort
      options:
        - "XS — 1-2 hours"
        - "S — 3-4 hours"
        - "M — 6-10 hours"
        - "L — 12-20 hours"
        - "XL — 24+ hours"
    validations:
      required: true

  - type: input
    id: estimate
    attributes:
      label: Estimate (hours)
      description: Mid-point estimate in hours (used for ROI reporting)
      placeholder: "4"
    validations:
      required: true
TMPL

# Bug template
cat > "$TEMPLATE_DIR/bug.yml" <<'TMPL'
name: Bug
description: Something isn't working as expected
title: "[Bug] "
labels: ["bug"]
body:
  - type: textarea
    id: description
    attributes:
      label: What happened?
      description: Describe the bug and what you expected instead.
    validations:
      required: true

  - type: textarea
    id: repro
    attributes:
      label: Steps to reproduce
      value: |
        1.
        2.
        3.

  - type: dropdown
    id: priority
    attributes:
      label: Priority
      options:
        - P0 — Critical / blocking
        - P1 — High / this sprint
        - P2 — Normal / backlog
    validations:
      required: true

  - type: dropdown
    id: size
    attributes:
      label: Size
      description: Estimated fix effort
      options:
        - "XS — 1-2 hours"
        - "S — 3-4 hours"
        - "M — 6-10 hours"
        - "L — 12-20 hours"
        - "XL — 24+ hours"
    validations:
      required: true

  - type: input
    id: estimate
    attributes:
      label: Estimate (hours)
      placeholder: "2"
    validations:
      required: true
TMPL

ok "Issue templates written: $TEMPLATE_DIR/"
echo ""

# ── done ───────────────────────────────────────────────────────────────────

bold "═══════════════════════════════════════════════════"
bold "   Setup complete!"
bold "═══════════════════════════════════════════════════"
echo ""
ok "Config:          $CONFIG_FILE"
ok "Issue templates: $TEMPLATE_DIR/"
echo ""
info "Next steps:"
echo "   1. Commit the issue templates (config is gitignored):"
echo "      git add .github/ISSUE_TEMPLATE/"
echo "      git commit -m 'chore: add claude-gh-task-manager issue templates'"
echo ""
echo "   2. Start Claude Code and type: /task #<issue-number>"
echo ""
info "To reconfigure at any time, run: npx claude-gh-task-manager init"
echo ""
