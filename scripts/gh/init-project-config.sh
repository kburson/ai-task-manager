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

jq_get() {
  # jq_get <json-string> <jq-filter>
  echo "$1" | jq -r "$2" 2>/dev/null || echo ''
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

if ! command -v jq &>/dev/null; then
  err "jq not found. Install it:"
  err "  macOS:  brew install jq"
  err "  Linux:  apt install jq  (or equivalent)"
  err "  Windows: winget install jqlang.jq"
  exit 1
fi

if ! command -v node &>/dev/null; then
  err "Node.js not found. Install Node.js 18+ from: https://nodejs.org"
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

# List projects linked to this specific repo (not all user projects)
info "Fetching GitHub Projects linked to $REPO..."
PROJECTS_JSON=$(gh api graphql -f query="
{
  repository(owner: \"$OWNER\", name: \"$REPO_NAME\") {
    projectsV2(first: 20) {
      nodes { id title number }
    }
  }
}" --jq '.data.repository.projectsV2.nodes | map({id,title,number})' 2>/dev/null || echo '[]')
PROJECT_COUNT=$(echo "$PROJECTS_JSON" | jq 'length' 2>/dev/null || echo '0')

PROJECT_NODE_ID=""

create_and_link_project() {
  local title="$1"
  info "Creating project '$title'..."
  PROJECT_CREATE_OUT=$(gh project create --owner "$OWNER" --title "$title" --format json 2>/dev/null || echo '')
  if [[ -z "$PROJECT_CREATE_OUT" ]]; then
    err "Failed to create project."; exit 1
  fi
  PROJECT_NUMBER=$(echo "$PROJECT_CREATE_OUT" | jq -r '.number // empty')
  ok "Created project #$PROJECT_NUMBER: $title"

  # Resolve node ID
  PROJECT_NODE_ID=$(gh api graphql -f query="{ user(login: \"$OWNER\") { projectV2(number: $PROJECT_NUMBER) { id } } }" --jq '.data.user.projectV2.id' 2>/dev/null || \
    gh api graphql -f query="{ organization(login: \"$OWNER\") { projectV2(number: $PROJECT_NUMBER) { id } } }" --jq '.data.organization.projectV2.id' 2>/dev/null || echo '')
  if [[ -z "$PROJECT_NODE_ID" ]]; then err "Could not resolve project node ID."; exit 1; fi
  ok "Project node ID: $PROJECT_NODE_ID"

  # Link project to this repo
  REPO_NODE_ID=$(gh api graphql -f query="{ repository(owner: \"$OWNER\", name: \"$REPO_NAME\") { id } }" --jq '.data.repository.id' 2>/dev/null || echo '')
  if [[ -n "$REPO_NODE_ID" ]]; then
    gh api graphql -f query='
mutation($proj: ID!, $repo: ID!) {
  linkProjectV2ToRepository(input: { projectId: $proj, repositoryId: $repo }) {
    repository { nameWithOwner }
  }
}' -f proj="$PROJECT_NODE_ID" -f repo="$REPO_NODE_ID" &>/dev/null && ok "Linked project to $REPO" || warn "Could not link project to repo — add it manually in GitHub."
  fi

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
  [[ -n "$STATUS_FIELD_OUT" ]] && ok "Status field created with Backlog / Ready / In Progress / In Review / Done" || warn "Could not create Status field — add it manually then re-run init."
  echo ""
}

if [[ "$PROJECT_COUNT" == "0" ]]; then
  warn "No GitHub Projects linked to $REPO."
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
  create_and_link_project "$PROJECT_TITLE"
else
  echo ""
  info "Projects linked to $REPO:"
  echo "$PROJECTS_JSON" | jq -r 'to_entries[] | "    [\(.key+1)] \(.value.title)"'
  echo "    [new] Create a new project"
  PROJECT_COUNT_DISPLAY=$(echo "$PROJECTS_JSON" | jq 'length')
  echo ""
  while true; do
    prompt "Enter number or 'new' [1]:"
    read -r PROJECT_NUMBER_INPUT
    [[ -z "$PROJECT_NUMBER_INPUT" ]] && PROJECT_NUMBER_INPUT="1"
    if [[ "$PROJECT_NUMBER_INPUT" == "new" ]]; then
      DEFAULT_TITLE="$REPO_NAME Board"
      prompt "Project title [$DEFAULT_TITLE]:"
      read -r PROJECT_TITLE
      [[ -z "$PROJECT_TITLE" ]] && PROJECT_TITLE="$DEFAULT_TITLE"
      create_and_link_project "$PROJECT_TITLE"
      break
    elif [[ "$PROJECT_NUMBER_INPUT" =~ ^[0-9]+$ && "$PROJECT_NUMBER_INPUT" -ge 1 && "$PROJECT_NUMBER_INPUT" -le "$PROJECT_COUNT_DISPLAY" ]]; then
      idx=$((PROJECT_NUMBER_INPUT - 1))
      PROJECT_NUMBER=$(echo "$PROJECTS_JSON" | jq -r --argjson i "$idx" '.[$i].number')
      PROJECT_NODE_ID=$(echo "$PROJECTS_JSON" | jq -r --argjson i "$idx" '.[$i].id')
      break
    fi
    err "Please enter a number 1-$PROJECT_COUNT_DISPLAY or 'new'."
  done
fi

ok "Using project #$PROJECT_NUMBER"
echo ""

if [[ -z "$PROJECT_NODE_ID" ]]; then
  err "Could not resolve project node ID for #$PROJECT_NUMBER."
  err "Ensure the project is linked to $REPO and you have access."
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
            id name options { id name color description }
          }
          ... on ProjectV2Field {
            id name
          }
        }
      }
    }
  }
}" --jq '.data.node.fields.nodes' 2>/dev/null || echo '[]')

echo ""
info "Single-select fields found:"
echo "$FIELDS_JSON" | jq -r '.[] | select(.options) | "    [\(.name)]  options: \([.options[].name] | join(", "))"'
echo ""

KANBAN_FIELD_JSON=""
while [[ -z "$KANBAN_FIELD_JSON" ]]; do
  prompt "Which field is your Kanban status field? [Status]:"
  read -r KANBAN_FIELD_NAME
  [[ -z "$KANBAN_FIELD_NAME" ]] && KANBAN_FIELD_NAME="Status"

  KANBAN_FIELD_JSON=$(echo "$FIELDS_JSON" | jq -c --arg name "$KANBAN_FIELD_NAME" \
    'first(.[] | select((.name | ascii_downcase) == ($name | ascii_downcase) and has("options"))) // empty' \
    2>/dev/null || echo '')

  if [[ -z "$KANBAN_FIELD_JSON" ]]; then
    err "Field '$KANBAN_FIELD_NAME' not found or has no options. Try again."
  fi
done

KANBAN_FIELD_ID=$(echo "$KANBAN_FIELD_JSON" | jq -r '.id')
ok "Kanban field ID: $KANBAN_FIELD_ID"
echo ""

# Show current states and explain what's needed
info "Current states in this field:"
echo "$KANBAN_FIELD_JSON" | jq -r '.options[] | "    \(.name)"'
echo ""
info "Required task-tracker states: Backlog, Ready, In Progress, Done"
info "Optional: In Review. You can also add custom unmanaged states."
echo ""

# Global used for inter-function return value (avoids subshell scoping issues)
PICKED_ID=""

# Try auto-match by name; if no match, show numbered list for interactive selection.
# Sets PICKED_ID to an existing option ID, "__NEW__" (needs creation), or "" (skipped).
auto_or_pick() {
  local label="$1"
  local candidates="$2"   # comma-separated auto-match names
  local optional="$3"     # "required" or "optional"

  local matched
  matched=$(echo "$KANBAN_FIELD_JSON" | jq -r --arg names "$candidates" '
    ($names | split(",") | map(ltrimstr(" ") | rtrimstr(" ") | ascii_downcase)) as $targets |
    first(.options[] | select(.name | ascii_downcase | IN($targets[])) | .id) // empty
  ' 2>/dev/null || echo '')

  if [[ -n "$matched" ]]; then
    local mname
    mname=$(echo "$KANBAN_FIELD_JSON" | jq -r --arg id "$matched" '.options[] | select(.id == $id) | .name')
    ok "Auto-matched '$label' → '$mname'"
    PICKED_ID="$matched"
    return
  fi

  echo ""
  info "State '$label' ($optional) — no match found:"
  echo "$KANBAN_FIELD_JSON" | jq -r '.options | to_entries[] | "    [\(.key+1)] \(.value.name)"'
  echo "    [new] Create '$label' as a new option"
  [[ "$optional" == "optional" ]] && echo "    [skip] Don't use this state"
  echo ""

  local count
  count=$(echo "$KANBAN_FIELD_JSON" | jq '.options | length')

  while true; do
    prompt "Choice for '$label' [new]:"
    read -r choice
    [[ -z "$choice" ]] && choice="new"
    if [[ "$optional" == "optional" && "$choice" == "skip" ]]; then
      PICKED_ID=""; return
    elif [[ "$choice" == "new" ]]; then
      PICKED_ID="__NEW__"; return
    elif [[ "$choice" =~ ^[0-9]+$ && "$choice" -ge 1 && "$choice" -le "$count" ]]; then
      PICKED_ID=$(echo "$KANBAN_FIELD_JSON" | jq -r --argjson i "$((choice-1))" '.options[$i].id')
      local pname
      pname=$(echo "$KANBAN_FIELD_JSON" | jq -r --argjson i "$((choice-1))" '.options[$i].name')
      ok "Mapped '$label' → '$pname'"
      return
    fi
    local skip_hint=""
    [[ "$optional" == "optional" ]] && skip_hint=", or 'skip'"
    err "Enter a number 1-$count, 'new'${skip_hint}."
  done
}

# Backlog only auto-matches "backlog" — not "todo" (that belongs to Ready)
auto_or_pick "Backlog"     "backlog"                               "required"; OPTION_BACKLOG="$PICKED_ID"
auto_or_pick "Ready"       "ready,refined,groomed,todo,to do"      "required"; OPTION_READY="$PICKED_ID"
auto_or_pick "In Progress" "in progress,in-progress,doing,wip"     "required"; OPTION_IN_PROGRESS="$PICKED_ID"
auto_or_pick "Done"        "done,closed,complete,completed"        "required"; OPTION_DONE="$PICKED_ID"
auto_or_pick "In Review"   "in review,in-review,review,reviewing"  "required"; OPTION_IN_REVIEW="$PICKED_ID"


# Build list of options that need to be created
STATES_TO_CREATE=()
[[ "$OPTION_BACKLOG" == "__NEW__" ]]     && STATES_TO_CREATE+=("Backlog:GRAY")
[[ "$OPTION_READY" == "__NEW__" ]]       && STATES_TO_CREATE+=("Ready:BLUE")
[[ "$OPTION_IN_PROGRESS" == "__NEW__" ]] && STATES_TO_CREATE+=("In Progress:YELLOW")
[[ "$OPTION_IN_REVIEW" == "__NEW__" ]]   && STATES_TO_CREATE+=("In Review:ORANGE")
[[ "$OPTION_DONE" == "__NEW__" ]]        && STATES_TO_CREATE+=("Done:GREEN")

# If any new options needed, append them via updateProjectV2Field
if [[ ${#STATES_TO_CREATE[@]} -gt 0 ]]; then
  echo ""
  local_names=()
  for s in "${STATES_TO_CREATE[@]}"; do local_names+=("${s%%:*}"); done
  info "Adding new states: $(IFS=', '; echo "${local_names[*]}")"

  # Existing options with their IDs (preserved) + new options (no id = created)
  EXISTING_OPTS_JSON=$(echo "$KANBAN_FIELD_JSON" | jq '[.options[] | {id, name, color, description}]')
  NEW_STATES_STR="$(IFS='|'; echo "${STATES_TO_CREATE[*]}")"
  NEW_OPTS_JSON=$(echo "$NEW_STATES_STR" | jq -R '
    split("|") | map(split(":") | {name: .[0], color: .[1], description: ""})
  ')
  ALL_OPTS_JSON=$(echo "$EXISTING_OPTS_JSON" "$NEW_OPTS_JSON" | jq -s 'add')

  MUTATION_OK=$(jq -n \
    --arg field "$KANBAN_FIELD_ID" \
    --argjson opts "$ALL_OPTS_JSON" \
    '{query:"mutation($field:ID!,$opts:[ProjectV2SingleSelectFieldOptionInput!]!){updateProjectV2Field(input:{fieldId:$field,singleSelectOptions:$opts}){projectV2Field{...on ProjectV2SingleSelectField{id}}}}",variables:{field:$field,opts:$opts}}' \
    | gh api graphql --input - --jq '.data.updateProjectV2Field.projectV2Field.id' 2>/dev/null || echo '')

  if [[ -z "$MUTATION_OK" ]]; then
    err "Failed to add new states. Check that you have 'write' access to the GitHub Project."
    exit 1
  fi

  ok "New states added."

  # Re-fetch the field to get fresh option IDs
  KANBAN_FIELD_JSON=$(gh api graphql -f query="
{
  node(id: \"$PROJECT_NODE_ID\") {
    ... on ProjectV2 {
      fields(first: 30) {
        nodes {
          ... on ProjectV2SingleSelectField { id name options { id name color description } }
        }
      }
    }
  }
}" --jq --arg fid "$KANBAN_FIELD_ID" \
    '[.data.node.fields.nodes[] | select(.id == $fid)] | first' 2>/dev/null || echo '')

  # Resolve __NEW__ sentinels to actual option IDs from updated field
  remap_state() {
    echo "$KANBAN_FIELD_JSON" | jq -r --arg n "$1" '.options[] | select(.name == $n) | .id'
  }
  [[ "$OPTION_BACKLOG" == "__NEW__" ]]     && OPTION_BACKLOG=$(remap_state "Backlog")
  [[ "$OPTION_READY" == "__NEW__" ]]       && OPTION_READY=$(remap_state "Ready")
  [[ "$OPTION_IN_PROGRESS" == "__NEW__" ]] && OPTION_IN_PROGRESS=$(remap_state "In Progress")
  [[ "$OPTION_IN_REVIEW" == "__NEW__" ]]   && OPTION_IN_REVIEW=$(remap_state "In Review")
  [[ "$OPTION_DONE" == "__NEW__" ]]        && OPTION_DONE=$(remap_state "Done")
fi

# ── Reorder columns if only the 5 standard states exist ───────────────────

TOTAL_OPTIONS=$(echo "$KANBAN_FIELD_JSON" | jq '.options | length' 2>/dev/null || echo '0')
if [[ "$TOTAL_OPTIONS" -eq 5 ]]; then
  info "Setting column order: Backlog → Ready → In Progress → In Review → Done"
  ORDERED_OPTS=$(echo "$KANBAN_FIELD_JSON" | jq -c \
    --arg b  "$OPTION_BACKLOG" \
    --arg r  "$OPTION_READY" \
    --arg ip "$OPTION_IN_PROGRESS" \
    --arg ir "$OPTION_IN_REVIEW" \
    --arg d  "$OPTION_DONE" \
    --argjson desc '{
      "Backlog":     "List of ungroomed features and ideas.",
      "Ready":       "List of items ready to implement.",
      "In Progress": "",
      "In Review":   "Code complete awaiting verification.",
      "Done":        ""
    }' \
    '.options as $opts |
     [$b,$r,$ip,$ir,$d] |
     map(. as $id | $opts[] | select(.id == $id) | {id, name, color, description: ($desc[.name] // .description)})' \
    2>/dev/null || echo '')

  if [[ -n "$ORDERED_OPTS" && "$ORDERED_OPTS" != "null" ]]; then
    REORDER_OK=$(jq -n \
      --arg field "$KANBAN_FIELD_ID" \
      --argjson opts "$ORDERED_OPTS" \
      '{query:"mutation($field:ID!,$opts:[ProjectV2SingleSelectFieldOptionInput!]!){updateProjectV2Field(input:{fieldId:$field,singleSelectOptions:$opts}){projectV2Field{...on ProjectV2SingleSelectField{id}}}}",variables:{field:$field,opts:$opts}}' \
      | gh api graphql --input - --jq '.data.updateProjectV2Field.projectV2Field.id' 2>/dev/null || echo '')
    if [[ -n "$REORDER_OK" ]]; then
      ok "Column order and descriptions set."
      info "WIP limits cannot be set via API — set them manually in the GitHub Project board:"
      info "  In Progress: 3   |   In Review: 5"
    else
      warn "Could not reorder columns — arrange manually in the GitHub Project board."
    fi
  fi
else
  info "Project has $TOTAL_OPTIONS status columns — column order not changed (arrange manually in GitHub)."
fi
echo ""

# ── step 4: project management fields ─────────────────────────────────────

bold "Step 4 of 5 — Project Management Fields"
echo ""
info "For each field: if a matching field exists it will be used automatically."
info "Otherwise you can map to an existing field or create a new one (default)."
echo ""

# Re-fetch with dataType so we can identify number vs text fields.
FIELDS_JSON=$(gh api graphql -f query="
{
  node(id: \"$PROJECT_NODE_ID\") {
    ... on ProjectV2 {
      fields(first: 50) {
        nodes {
          ... on ProjectV2SingleSelectField { id name options { id name } }
          ... on ProjectV2Field { id name dataType }
          ... on ProjectV2IterationField { id name }
        }
      }
    }
  }
}" --jq '.data.node.fields.nodes' 2>/dev/null || echo '[]')

refresh_fields() {
  FIELDS_JSON=$(gh api graphql -f query="
{
  node(id: \"$PROJECT_NODE_ID\") {
    ... on ProjectV2 {
      fields(first: 50) {
        nodes {
          ... on ProjectV2SingleSelectField { id name options { id name } }
          ... on ProjectV2Field { id name dataType }
          ... on ProjectV2IterationField { id name }
        }
      }
    }
  }
}" --jq '.data.node.fields.nodes' 2>/dev/null || echo '[]')
}

# Return values (globals — avoids subshell scoping)
RESULT_FIELD_ID=""
RESULT_FIELD_JSON=""

# map_or_create_select <field-name> <options-json>
# Auto-matches by exact name; otherwise prompts to map existing or create new.
# Sets RESULT_FIELD_ID and RESULT_FIELD_JSON.
map_or_create_select() {
  local fname="$1"
  local create_opts_json="$2"

  local found
  found=$(echo "$FIELDS_JSON" | jq -c --arg n "$fname" \
    'first(.[] | select((.name | ascii_downcase) == ($n | ascii_downcase) and has("options"))) // empty' \
    2>/dev/null || echo '')

  if [[ -n "$found" ]]; then
    ok "Found field '$fname'."
    RESULT_FIELD_ID=$(echo "$found" | jq -r '.id')
    RESULT_FIELD_JSON="$found"
    return
  fi

  echo ""
  info "Field '$fname' not found on project."
  local select_fields count
  select_fields=$(echo "$FIELDS_JSON" | jq '[.[] | select(has("options"))]')
  count=$(echo "$select_fields" | jq 'length')
  if [[ "$count" -gt 0 ]]; then
    echo "$select_fields" | jq -r 'to_entries[] | "    [\(.key+1)] \(.value.name)"'
  fi
  echo "    [new] Create '$fname' with standard options (default)"
  echo ""

  while true; do
    prompt "Choice for '$fname' [new]:"
    read -r choice
    [[ -z "$choice" ]] && choice="new"
    if [[ "$choice" == "new" ]]; then
      local new_id
      new_id=$(jq -n \
        --arg proj "$PROJECT_NODE_ID" \
        --arg name "$fname" \
        --argjson opts "$create_opts_json" \
        '{query:"mutation($proj:ID!,$name:String!,$opts:[ProjectV2SingleSelectFieldOptionInput!]!){createProjectV2Field(input:{projectId:$proj,dataType:SINGLE_SELECT,name:$name,singleSelectOptions:$opts}){projectV2Field{...on ProjectV2SingleSelectField{id}}}}",variables:{proj:$proj,name:$name,opts:$opts}}' \
        | gh api graphql --input - --jq '.data.createProjectV2Field.projectV2Field.id' 2>/dev/null || echo '')
      if [[ -n "$new_id" ]]; then
        ok "Created '$fname' field."
        refresh_fields
        RESULT_FIELD_ID="$new_id"
        RESULT_FIELD_JSON=$(echo "$FIELDS_JSON" | jq -c --arg id "$new_id" \
          'first(.[] | select(.id == $id)) // empty')
      else
        warn "Could not create '$fname'. Add it manually to your GitHub Project."
        RESULT_FIELD_ID=""
        RESULT_FIELD_JSON=""
      fi
      return
    elif [[ "$choice" =~ ^[0-9]+$ && "$choice" -ge 1 && "$choice" -le "$count" ]]; then
      local picked pname
      picked=$(echo "$select_fields" | jq -c --argjson i "$((choice-1))" '.[$i]')
      pname=$(echo "$picked" | jq -r '.name')
      RESULT_FIELD_ID=$(echo "$picked" | jq -r '.id')
      RESULT_FIELD_JSON="$picked"
      ok "Mapped '$fname' → '$pname'"
      return
    fi
    err "Enter a number 1-$count or 'new'."
  done
}

# map_or_create_number <field-name>
# Auto-matches by exact name; otherwise prompts to map existing number field or create new.
# Sets RESULT_FIELD_ID.
map_or_create_number() {
  local fname="$1"

  local found_id
  found_id=$(echo "$FIELDS_JSON" | jq -r --arg n "$fname" \
    'first(.[] | select((.name | ascii_downcase) == ($n | ascii_downcase)
      and (.options == null or (.options | length) == 0)) | .id) // empty' \
    2>/dev/null || echo '')

  if [[ -n "$found_id" ]]; then
    ok "Found field '$fname'."
    RESULT_FIELD_ID="$found_id"
    return
  fi

  echo ""
  info "Field '$fname' not found on project."
  local num_fields count
  num_fields=$(echo "$FIELDS_JSON" | jq '[.[] | select(.dataType == "NUMBER")]')
  count=$(echo "$num_fields" | jq 'length')
  if [[ "$count" -gt 0 ]]; then
    echo "$num_fields" | jq -r 'to_entries[] | "    [\(.key+1)] \(.value.name)"'
  fi
  echo "    [new] Create '$fname' number field (default)"
  echo ""

  while true; do
    prompt "Choice for '$fname' [new]:"
    read -r choice
    [[ -z "$choice" ]] && choice="new"
    if [[ "$choice" == "new" ]]; then
      local new_id
      new_id=$(gh api graphql -f query='
mutation($proj:ID!,$name:String!){
  createProjectV2Field(input:{projectId:$proj,dataType:NUMBER,name:$name}){
    projectV2Field{...on ProjectV2Field{id}}
  }
}' -f proj="$PROJECT_NODE_ID" -f name="$fname" \
        --jq '.data.createProjectV2Field.projectV2Field.id' 2>/dev/null || echo '')
      if [[ -n "$new_id" ]]; then
        ok "Created '$fname' field."
        refresh_fields
        RESULT_FIELD_ID="$new_id"
      else
        warn "Could not create '$fname'. Add it manually to your GitHub Project."
        RESULT_FIELD_ID=""
      fi
      return
    elif [[ "$choice" =~ ^[0-9]+$ && "$choice" -ge 1 && "$choice" -le "$count" ]]; then
      RESULT_FIELD_ID=$(echo "$num_fields" | jq -r --argjson i "$((choice-1))" '.[$i].id')
      local pname
      pname=$(echo "$num_fields" | jq -r --argjson i "$((choice-1))" '.[$i].name')
      ok "Mapped '$fname' → '$pname'"
      return
    fi
    err "Enter a number 1-$count or 'new'."
  done
}

# ── Priority ───────────────────────────────────────────────────────────────

info "Priority (single-select: P0 / P1 / P2)..."
PRIORITY_OPTS='[{"name":"P0","color":"RED","description":"Critical — blocking"},{"name":"P1","color":"ORANGE","description":"High — this sprint"},{"name":"P2","color":"BLUE","description":"Normal — backlog"}]'
map_or_create_select "Priority" "$PRIORITY_OPTS"
PRIORITY_FIELD_ID="$RESULT_FIELD_ID"
OPTION_P0="" OPTION_P1="" OPTION_P2=""
if [[ -n "$RESULT_FIELD_JSON" ]]; then
  KANBAN_FIELD_JSON="$RESULT_FIELD_JSON"
  auto_or_pick "P0 (critical)" "p0,critical,urgent"   "optional"; OPTION_P0="$PICKED_ID"
  auto_or_pick "P1 (high)"     "p1,high,important"    "optional"; OPTION_P1="$PICKED_ID"
  auto_or_pick "P2 (normal)"   "p2,normal,medium,low" "optional"; OPTION_P2="$PICKED_ID"
  KANBAN_FIELD_JSON=""
fi
echo ""

# ── Size ───────────────────────────────────────────────────────────────────

info "Size (single-select: XS / S / M / L / XL)..."
SIZE_OPTS='[{"name":"XS","color":"BLUE","description":"1-2 hours"},{"name":"S","color":"GREEN","description":"3-4 hours"},{"name":"M","color":"YELLOW","description":"6-10 hours"},{"name":"L","color":"ORANGE","description":"12-20 hours"},{"name":"XL","color":"RED","description":"24+ hours"}]'
map_or_create_select "Size" "$SIZE_OPTS"
SIZE_FIELD_ID="$RESULT_FIELD_ID"
echo ""

# ── Number fields ──────────────────────────────────────────────────────────

info "Number fields..."
echo ""
map_or_create_number "Estimate";            FIELD_ESTIMATE="$RESULT_FIELD_ID"
map_or_create_number "Actual Hours";        FIELD_ACTUAL_HOURS="$RESULT_FIELD_ID"
map_or_create_number "Actual Session Time"; FIELD_ACTUAL_SESSION_TIME="$RESULT_FIELD_ID"
map_or_create_number "Context Length";      FIELD_CONTEXT_LENGTH="$RESULT_FIELD_ID"
map_or_create_number "Sequence";            FIELD_SEQUENCE="$RESULT_FIELD_ID"
echo ""

# ── step 5: write config + issue templates ─────────────────────────────────

bold "Step 5 of 5 — Writing Config & Issue Templates"
echo ""

# Write .claude/task-tracker.json — merge with existing config
CONFIG_FILE="$CONFIG_FILE" \
REPO="$REPO" \
PROJECT_NODE_ID="$PROJECT_NODE_ID" \
KANBAN_FIELD_ID="$KANBAN_FIELD_ID" \
OPTION_BACKLOG="$OPTION_BACKLOG" \
OPTION_READY="$OPTION_READY" \
OPTION_IN_PROGRESS="$OPTION_IN_PROGRESS" \
OPTION_IN_REVIEW="$OPTION_IN_REVIEW" \
OPTION_DONE="$OPTION_DONE" \
PRIORITY_FIELD_ID="$PRIORITY_FIELD_ID" \
OPTION_P0="$OPTION_P0" \
OPTION_P1="$OPTION_P1" \
OPTION_P2="$OPTION_P2" \
SIZE_FIELD_ID="$SIZE_FIELD_ID" \
FIELD_ESTIMATE="$FIELD_ESTIMATE" \
FIELD_ACTUAL_HOURS="$FIELD_ACTUAL_HOURS" \
FIELD_ACTUAL_SESSION_TIME="$FIELD_ACTUAL_SESSION_TIME" \
FIELD_CONTEXT_LENGTH="$FIELD_CONTEXT_LENGTH" \
FIELD_SEQUENCE="$FIELD_SEQUENCE" \
node -e "
const fs = require('fs');
const file = process.env.CONFIG_FILE;
let existing = {};
try { existing = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
const updates = {
  repo:                   process.env.REPO,
  projectId:              process.env.PROJECT_NODE_ID,
  kanbanFieldId:          process.env.KANBAN_FIELD_ID,
  kanbanOptionBacklog:    process.env.OPTION_BACKLOG,
  kanbanOptionReady:      process.env.OPTION_READY,
  kanbanOptionInProgress: process.env.OPTION_IN_PROGRESS,
  kanbanOptionInReview:   process.env.OPTION_IN_REVIEW,
  kanbanOptionDone:       process.env.OPTION_DONE,
  priorityFieldId:        process.env.PRIORITY_FIELD_ID,
  priorityOptionP0:       process.env.OPTION_P0,
  priorityOptionP1:       process.env.OPTION_P1,
  priorityOptionP2:       process.env.OPTION_P2,
};
// Only write IDs when we got them — don't clobber manually configured values with empty strings
const optional = {
  sizeFieldId:            process.env.SIZE_FIELD_ID,
  fieldEstimate:          process.env.FIELD_ESTIMATE,
  fieldActualHours:       process.env.FIELD_ACTUAL_HOURS,
  fieldActualMinutes:     process.env.FIELD_ACTUAL_SESSION_TIME,
  fieldContextWords:      process.env.FIELD_CONTEXT_LENGTH,
  fieldSequence:          process.env.FIELD_SEQUENCE,
};
for (const [k, v] of Object.entries(optional)) { if (v) updates[k] = v; }
Object.assign(existing, updates);
fs.writeFileSync(file, JSON.stringify(existing, null, 2) + '\n');
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
