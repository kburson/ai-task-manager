#!/bin/bash
# Interactive setup for ai-task-manager.
# Walks through GitHub auth, discovers GitHub Projects V2 field/option IDs,
# and writes .ai-task-manager/task-tracker.json + .github/ISSUE_TEMPLATE/ in the target project.
#
# Usage: scripts/gh/init-project-config.sh [--target <project-dir>]

set -euo pipefail

# ── helpers ────────────────────────────────────────────────────────────────
# Color palette: bold/dim, fg colors, and a couple of bg banners. Each visual
# helper aims to delineate sections clearly without becoming visually noisy.

bold()    { printf "\033[1m%s\033[0m\n" "$*"; }
dim()     { printf "\033[2m%s\033[0m" "$*"; }
info()    { printf "  \033[36m🔹\033[0m %s\n" "$*"; }
ok()      { printf "  \033[32m✅\033[0m %s\n" "$*"; }
warn()    { printf "  \033[33m⚠️ \033[0m %s\n" "$*"; }
err()     { printf "  \033[31m❌\033[0m %s\n" "$*" >&2; }
prompt()  { printf "  \033[35m❓\033[0m \033[1m%s\033[0m " "$*"; }
divider() { printf "  \033[2m─────────────────────────────────────────────────────────\033[0m\n"; }

# banner <emoji> <title> [subtitle]
banner() {
  local emoji="$1" title="$2" sub="${3:-}"
  local pad="                                                              "
  echo
  printf "\033[44m\033[97m\033[1m%s\033[0m\n" "  ${pad:0:60}"
  printf "\033[44m\033[97m\033[1m  %s  %-56s\033[0m\n" "$emoji" "$title"
  if [[ -n "$sub" ]]; then
    printf "\033[44m\033[97m  \033[2m   %-57s\033[0m\n" "$sub"
  fi
  printf "\033[44m\033[97m\033[1m%s\033[0m\n" "  ${pad:0:60}"
  echo
}

# step <emoji> <"Step X of Y"> <title>
step() {
  local emoji="$1" idx="$2" title="$3"
  echo
  printf "\033[36m▸\033[0m \033[1m%s  %s · %s\033[0m\n" "$emoji" "$idx" "$title"
  divider
  echo
}

# success_banner <message>
success_banner() {
  local msg="$1"
  local pad="                                                              "
  echo
  printf "\033[42m\033[30m\033[1m  ✅  %-56s\033[0m\n" "$msg"
  echo
}

jq_get() {
  # jq_get <json-string> <jq-filter>
  echo "$1" | jq -r "$2" 2>/dev/null || echo ''
}

# ── args ───────────────────────────────────────────────────────────────────

TARGET_DIR=""
PROJECT_INPUT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET_DIR="$2"; shift 2 ;;
    --project) PROJECT_INPUT="$2"; shift 2 ;;
    --project-url) PROJECT_INPUT="$2"; shift 2 ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

if [[ -z "$TARGET_DIR" ]]; then
  TARGET_DIR=$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-$(pwd)}")
fi

CONFIG_DIR="$TARGET_DIR/.ai-task-manager"
CONFIG_FILE="$CONFIG_DIR/task-tracker.json"
mkdir -p "$CONFIG_DIR"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FIELD_DEFS_FILE="$CONFIG_DIR/project-fields.json"
FIELD_EVENTS_FILE="$CONFIG_DIR/project-field-events.json"
if [[ ! -f "$FIELD_DEFS_FILE" && -f "$PKG_ROOT/config/project-fields.default.json" ]]; then
  cp "$PKG_ROOT/config/project-fields.default.json" "$FIELD_DEFS_FILE"
fi
if [[ ! -f "$FIELD_EVENTS_FILE" && -f "$PKG_ROOT/config/project-field-events.default.json" ]]; then
  cp "$PKG_ROOT/config/project-field-events.default.json" "$FIELD_EVENTS_FILE"
fi

check_field_defs_drift() {
  local local_file="$1"
  local default_file="$2"
  local label="$3"
  if [[ ! -f "$local_file" || ! -f "$default_file" ]]; then return 0; fi
  local drift
  drift=$(node "$SCRIPT_DIR/lib/field-defs-drift.mjs" "$local_file" "$default_file" 2>/dev/null || echo '')
  if [[ -z "$drift" || "$drift" == "in-sync" ]]; then return 0; fi
  echo ""
  warn "$label drift detected — $drift"
  local ans
  printf "Refresh %s from package default? [y/N]: " "$label" >&2
  read -r ans </dev/tty || ans=""
  if [[ "$ans" =~ ^[Yy]$ ]]; then
    cp -f "$default_file" "$local_file"
    ok "Refreshed $label."
  else
    info "Keeping existing $label. Re-run after manual reconciliation if needed."
  fi
}

check_field_defs_drift "$FIELD_DEFS_FILE" "$PKG_ROOT/config/project-fields.default.json" "project-fields.json"

# ── banner ─────────────────────────────────────────────────────────────────

banner "🎯" "ai-task-manager — Project Setup" "Target: $TARGET_DIR"

# ── step 1: github auth ────────────────────────────────────────────────────

step "🔐" "Step 1 of 5" "GitHub Authentication"

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

AUTH_STATUS=$(gh auth status 2>&1 || true)
if ! echo "$AUTH_STATUS" | grep -Eq "Token scopes:.*'project'|Token scopes:.*'read:project'"; then
  err "GitHub Projects V2 access is not enabled for the current gh token."
  err "Refresh GitHub CLI auth with project scope, then rerun init:"
  err "  gh auth refresh -h github.com -s project"
  err "Current token scopes:"
  echo "$AUTH_STATUS" | sed -n '/Token scopes:/p' >&2
  exit 1
fi
echo ""

# ── step 2: repo + project ─────────────────────────────────────────────────

step "📁" "Step 2 of 5" "Repository & GitHub Project"

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

while [[ -z "$DETECTED_REPO" || ! "$DETECTED_REPO" =~ ^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$ ]]; do
  prompt "GitHub repo (owner/repo):"
  read -r DETECTED_REPO
  if [[ ! "$DETECTED_REPO" =~ ^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$ ]]; then
    err "Expected format: owner/repo (e.g. octocat/hello-world)"
    DETECTED_REPO=""
  fi
done

REPO="$DETECTED_REPO"
OWNER="${REPO%%/*}"
REPO_NAME="${REPO##*/}"

# Verify repo exists and is accessible
if ! gh repo view "$REPO" &>/dev/null; then
  err "Repo '$REPO' not found or not accessible with current gh auth."
  err "Check the name, your gh login (gh auth status), or repo visibility."
  exit 1
fi
ok "Repo: $REPO"
echo ""

# List projects linked to the repo plus user/org projects owned by the repo owner.
info "Fetching GitHub Projects for $OWNER and projects linked to $REPO..."
LINKED_PROJECTS_RAW=$(gh api graphql -f query="
{
  repository(owner: \"$OWNER\", name: \"$REPO_NAME\") {
    projectsV2(first: 50) {
      nodes { id title number }
    }
  }
}" --jq '.data.repository.projectsV2.nodes // [] | map({id,title,number,linked:true})' 2>/dev/null || echo '[]')

OWNER_PROJECTS_RAW=$(gh api graphql -F login="$OWNER" -f query='
query($login: String!) {
  user(login: $login) {
    projectsV2(first: 50) { nodes { id title number } }
  }
  organization(login: $login) {
    projectsV2(first: 50) { nodes { id title number } }
  }
}' --jq '[.data.user.projectsV2.nodes[]?, .data.organization.projectsV2.nodes[]?] | map({id,title,number,linked:false})' 2>/dev/null || echo '[]')

normalize_project_list() {
  local linked="$1"
  jq -c --argjson linked "$linked" '
    def clean_nodes:
      if type == "array" then .
      elif type == "object" then
        if (.data.repository.projectsV2.nodes? | type) == "array" then
          .data.repository.projectsV2.nodes
        else
          [(.data.user.projectsV2.nodes[]? // empty), (.data.organization.projectsV2.nodes[]? // empty)]
        end
      else [] end;
    clean_nodes
    | map(select(.id and .title and .number) | {id, title, number, linked: $linked})
  ' 2>/dev/null || echo '[]'
}

LINKED_PROJECTS_JSON=$(printf '%s\n' "$LINKED_PROJECTS_RAW" | normalize_project_list true)
OWNER_PROJECTS_JSON=$(printf '%s\n' "$OWNER_PROJECTS_RAW" | normalize_project_list false)

PROJECTS_JSON=$(printf '%s\n%s\n' "$LINKED_PROJECTS_JSON" "$OWNER_PROJECTS_JSON" | jq -s '
  add
  | group_by(.id)
  | map({
      id: .[0].id,
      title: .[0].title,
      number: .[0].number,
      linked: (map(.linked) | any)
    })
  | sort_by((if .linked then 0 else 1 end), .number)
')
PROJECT_COUNT=$(echo "$PROJECTS_JSON" | jq 'length' 2>/dev/null || echo '0')
LINKED_PROJECT_COUNT=$(echo "$PROJECTS_JSON" | jq '[.[] | select(.linked)] | length' 2>/dev/null || echo '0')

PROJECT_NODE_ID=""
PROJECT_NUMBER=""
PROJECT_TITLE=""

link_project_to_repo() {
  local project_id="$1"
  local repo_id
  repo_id=$(gh api graphql -f query="{ repository(owner: \"$OWNER\", name: \"$REPO_NAME\") { id } }" --jq '.data.repository.id' 2>/dev/null || echo '')
  if [[ -n "$repo_id" ]]; then
    gh api graphql -f query='
mutation($proj: ID!, $repo: ID!) {
  linkProjectV2ToRepository(input: { projectId: $proj, repositoryId: $repo }) {
    repository { nameWithOwner }
  }
}' -f proj="$project_id" -f repo="$repo_id" &>/dev/null && ok "Linked project to $REPO" || warn "Could not link project to repo — it may already be linked, or you can add it manually in GitHub."
  fi
}

project_number_from_input() {
  local raw="$1"
  if [[ "$raw" =~ github\.com/(users|orgs)/([^/]+)/projects/([0-9]+) ]]; then
    echo "${BASH_REMATCH[2]}:${BASH_REMATCH[3]}"
  elif [[ "$raw" =~ ^([A-Za-z0-9._-]+)[/:]([0-9]+)$ ]]; then
    echo "${BASH_REMATCH[1]}:${BASH_REMATCH[2]}"
  elif [[ "$raw" =~ ^[0-9]+$ ]]; then
    echo "$OWNER:$raw"
  else
    echo ""
  fi
}

resolve_existing_project() {
  local raw="$1"
  local parsed login number project_json
  parsed=$(project_number_from_input "$raw")
  if [[ -z "$parsed" ]]; then
    return 1
  fi
  login="${parsed%%:*}"
  number="${parsed##*:}"
  project_json=$(gh api graphql -F login="$login" -F number="$number" -f query='
query($login: String!, $number: Int!) {
  user(login: $login) {
    projectV2(number: $number) { id title number }
  }
  organization(login: $login) {
    projectV2(number: $number) { id title number }
  }
}' --jq '[.data.user.projectV2, .data.organization.projectV2] | map(select(. != null)) | first // empty' 2>/dev/null || echo '')

  if [[ -z "$project_json" || "$project_json" == "null" ]]; then
    return 1
  fi

  PROJECT_NODE_ID=$(echo "$project_json" | jq -r '.id // empty')
  PROJECT_NUMBER=$(echo "$project_json" | jq -r '.number // empty')
  PROJECT_TITLE=$(echo "$project_json" | jq -r '.title // empty')
  [[ -n "$PROJECT_NODE_ID" ]]
}

prompt_project_template() {
  local choice
  echo ""
  info "GitHub's built-in web templates are not exposed by the supported gh/API project-create command."
  info "AI Task Manager can create a compatible project shape and link it to this repo."
  echo ""
  echo "    [1] Feature Release (recommended) - Status, Priority, Size, Estimate, Actuals, Sequence"
  echo "    [2] Basic Kanban - Status columns only; remaining fields are mapped/created later"
  echo ""
  while true; do
    prompt "Project workflow template [1]:"
    read -r choice
    [[ -z "$choice" ]] && choice="1"
    case "$choice" in
      1|feature|feature-release|"Feature Release") PROJECT_TEMPLATE="feature-release"; return ;;
      2|basic|kanban|"Basic Kanban") PROJECT_TEMPLATE="basic-kanban"; return ;;
    esac
    err "Enter 1 for Feature Release or 2 for Basic Kanban."
  done
}

create_project_field_if_missing() {
  local name="$1"
  local data_type="$2"
  local options_json="${3:-}"
  local existing fields_raw
  fields_raw=$(gh api graphql -f query="
{
  node(id: \"$PROJECT_NODE_ID\") {
    ... on ProjectV2 {
      fields(first: 50) {
        nodes {
          ... on ProjectV2SingleSelectField { id name options { id name } }
          ... on ProjectV2Field { id name dataType }
        }
      }
    }
  }
}" 2>/dev/null || echo '{}')
  existing=$(printf '%s\n' "$fields_raw" | jq -r --arg name "$name" \
    '[.data.node.fields.nodes[]? | select((.name | ascii_downcase) == ($name | ascii_downcase))] | first.id // empty' \
    2>/dev/null || echo '')
  if [[ -n "$existing" ]]; then
    return
  fi

  local created
  if [[ "$data_type" == "SINGLE_SELECT" ]]; then
    created=$(jq -n \
      --arg proj "$PROJECT_NODE_ID" \
      --arg name "$name" \
      --argjson opts "$options_json" \
      '{query:"mutation($proj:ID!,$name:String!,$opts:[ProjectV2SingleSelectFieldOptionInput!]!){createProjectV2Field(input:{projectId:$proj,dataType:SINGLE_SELECT,name:$name,singleSelectOptions:$opts}){projectV2Field{...on ProjectV2SingleSelectField{id}}}}",variables:{proj:$proj,name:$name,opts:$opts}}' \
      | gh api graphql --input - --jq '.data.createProjectV2Field.projectV2Field.id' 2>/dev/null || echo '')
  else
    created=$(gh api graphql \
      -f query="mutation(\$proj:ID!,\$name:String!){createProjectV2Field(input:{projectId:\$proj,dataType:${data_type},name:\$name}){projectV2Field{...on ProjectV2Field{id}}}}" \
      -f proj="$PROJECT_NODE_ID" -f name="$name" \
      --jq '.data.createProjectV2Field.projectV2Field.id' 2>/dev/null || echo '')
  fi

  [[ -n "$created" ]] && ok "Created '$name' field." || warn "Could not create '$name' field — it can be mapped or created later."
}

apply_project_template() {
  local template="$1"
  local status_opts priority_opts size_opts
  status_opts='[
    {"name":"Backlog","color":"GRAY","description":"Unvetted ideas; not yet shaped."},
    {"name":"Refine","color":"BLUE","description":"Items being shaped: AC, sizing, estimates."},
    {"name":"Plan","color":"PURPLE","description":"Items being deep-dived: design + caller analysis."},
    {"name":"Develop","color":"YELLOW","description":"Implementation in progress."},
    {"name":"Test","color":"ORANGE","description":"Agent verification in progress."},
    {"name":"Review","color":"PURPLE","description":"All checks passed; awaiting human approval."},
    {"name":"Done","color":"GREEN","description":""}
  ]'
  priority_opts='[
    {"name":"P0","color":"RED","description":"Critical — blocking"},
    {"name":"P1","color":"ORANGE","description":"High — this sprint"},
    {"name":"P2","color":"BLUE","description":"Normal — backlog"}
  ]'
  size_opts='[
    {"name":"XS","color":"BLUE","description":"1-2 hours"},
    {"name":"S","color":"GREEN","description":"3-4 hours"},
    {"name":"M","color":"YELLOW","description":"6-10 hours"},
    {"name":"L","color":"ORANGE","description":"12-20 hours"},
    {"name":"XL","color":"RED","description":"24+ hours"}
  ]'

  info "Applying ${template} project workflow..."
  create_project_field_if_missing "Status" "SINGLE_SELECT" "$status_opts"
  if [[ "$template" == "feature-release" ]]; then
    create_project_field_if_missing "Priority" "SINGLE_SELECT" "$priority_opts"
    create_project_field_if_missing "Size" "SINGLE_SELECT" "$size_opts"
    create_project_field_if_missing "Estimate" "NUMBER"
    create_project_field_if_missing "Engaged Time" "NUMBER"
    create_project_field_if_missing "Session Time" "NUMBER"
    create_project_field_if_missing "Review Time" "NUMBER"
    create_project_field_if_missing "Plan Time" "NUMBER"
    create_project_field_if_missing "Sequence" "NUMBER"
    create_project_field_if_missing "Start date" "DATE"
    create_project_field_if_missing "End date" "DATE"
  fi
}

create_and_link_project() {
  local title="$1"
  local template="${2:-feature-release}"
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

  link_project_to_repo "$PROJECT_NODE_ID"
  apply_project_template "$template"
  echo ""
}

if [[ -n "$PROJECT_INPUT" ]]; then
  if resolve_existing_project "$PROJECT_INPUT"; then
    ok "Using existing project #$PROJECT_NUMBER: $PROJECT_TITLE"
    link_project_to_repo "$PROJECT_NODE_ID"
  else
    err "Could not resolve project from: $PROJECT_INPUT"
    err "Use a URL like https://github.com/users/kburson/projects/5 or an owner:number value like kburson:5."
    exit 1
  fi
elif [[ "$PROJECT_COUNT" == "0" ]]; then
  warn "No GitHub Projects linked to $REPO."
  echo ""
  info "A GitHub Project board is required to track Kanban state."
  echo ""
  info "You can use an existing user/org project by entering its URL or number."
  echo ""
  DEFAULT_TITLE="$REPO_NAME Board"
  prompt "Project URL, owner:number, number, or 'new' [new]:"
  read -r PROJECT_CHOICE
  [[ -z "$PROJECT_CHOICE" ]] && PROJECT_CHOICE="new"
  if [[ "$PROJECT_CHOICE" != "new" ]]; then
    if resolve_existing_project "$PROJECT_CHOICE"; then
      ok "Using existing project #$PROJECT_NUMBER: $PROJECT_TITLE"
      link_project_to_repo "$PROJECT_NODE_ID"
    else
      err "Could not resolve project from: $PROJECT_CHOICE"
      exit 1
    fi
  else
    prompt "Project title [$DEFAULT_TITLE]:"
    read -r PROJECT_TITLE
    [[ -z "$PROJECT_TITLE" ]] && PROJECT_TITLE="$DEFAULT_TITLE"
    PROJECT_TEMPLATE=""
    prompt_project_template
    create_and_link_project "$PROJECT_TITLE" "$PROJECT_TEMPLATE"
  fi
else
  if [[ "$LINKED_PROJECT_COUNT" == "0" ]]; then
    warn "No GitHub Projects are currently linked to $REPO."
    info "You can link one of the projects below or create a new repo-linked project."
  fi
  echo ""
  info "Available GitHub Projects:"
  LINKED_COUNT=$(echo "$PROJECTS_JSON" | jq '[.[] | select(.linked == true)] | length')
  UNLINKED_COUNT=$(echo "$PROJECTS_JSON" | jq '[.[] | select(.linked == false)] | length')
  if [[ "$LINKED_COUNT" -gt 0 ]]; then
    echo ""
    echo "    ── Linked Projects ──────────────────────────"
    echo "$PROJECTS_JSON" | jq -r 'to_entries[] | select(.value.linked == true) | "    [\(.key+1)] \(.value.title) (#\(.value.number))"'
  fi
  if [[ "$UNLINKED_COUNT" -gt 0 ]]; then
    echo ""
    echo "    ── Other Projects ──────────────────────────"
    echo "$PROJECTS_JSON" | jq -r 'to_entries[] | select(.value.linked == false) | "    [\(.key+1)] \(.value.title) (#\(.value.number))"'
  fi
  echo ""
  echo "    ── Manual Options ──────────────────────────"
  echo "    [url] Use an existing project URL or owner:number"
  echo "    [new] Create a new project"
  PROJECT_COUNT_DISPLAY=$(echo "$PROJECTS_JSON" | jq 'length')
  echo ""
  while true; do
    prompt "Enter list number, project URL, owner:number, or 'new' [1]:"
    read -r PROJECT_NUMBER_INPUT
    [[ -z "$PROJECT_NUMBER_INPUT" ]] && PROJECT_NUMBER_INPUT="1"
    if [[ "$PROJECT_NUMBER_INPUT" == "new" ]]; then
      DEFAULT_TITLE="$REPO_NAME Board"
      prompt "Project title [$DEFAULT_TITLE]:"
      read -r PROJECT_TITLE
      [[ -z "$PROJECT_TITLE" ]] && PROJECT_TITLE="$DEFAULT_TITLE"
      PROJECT_TEMPLATE=""
      prompt_project_template
      create_and_link_project "$PROJECT_TITLE" "$PROJECT_TEMPLATE"
      break
    elif [[ "$PROJECT_NUMBER_INPUT" =~ ^[0-9]+$ && "$PROJECT_NUMBER_INPUT" -ge 1 && "$PROJECT_NUMBER_INPUT" -le "$PROJECT_COUNT_DISPLAY" ]]; then
      idx=$((PROJECT_NUMBER_INPUT - 1))
      PROJECT_NUMBER=$(echo "$PROJECTS_JSON" | jq -r --argjson i "$idx" '.[$i].number')
      PROJECT_NODE_ID=$(echo "$PROJECTS_JSON" | jq -r --argjson i "$idx" '.[$i].id')
      PROJECT_TITLE=$(echo "$PROJECTS_JSON" | jq -r --argjson i "$idx" '.[$i].title')
      PROJECT_LINKED=$(echo "$PROJECTS_JSON" | jq -r --argjson i "$idx" '.[$i].linked')
      if [[ "$PROJECT_LINKED" != "true" ]]; then
        link_project_to_repo "$PROJECT_NODE_ID"
      fi
      break
    elif [[ "$PROJECT_NUMBER_INPUT" == "url" ]]; then
      prompt "Project URL or owner:number:"
      read -r PROJECT_URL_INPUT
      if resolve_existing_project "$PROJECT_URL_INPUT"; then
        link_project_to_repo "$PROJECT_NODE_ID"
        break
      fi
      err "Could not resolve project from: $PROJECT_URL_INPUT"
    elif resolve_existing_project "$PROJECT_NUMBER_INPUT"; then
      link_project_to_repo "$PROJECT_NODE_ID"
      break
    fi
    err "Please enter a number 1-$PROJECT_COUNT_DISPLAY, a project URL, owner:number, or 'new'."
  done
fi

ok "Using project #$PROJECT_NUMBER${PROJECT_TITLE:+: $PROJECT_TITLE}"
echo ""

if [[ -z "$PROJECT_NODE_ID" ]]; then
  err "Could not resolve project node ID for #$PROJECT_NUMBER."
  err "Ensure the project is linked to $REPO and you have access."
  exit 1
fi
ok "Project node ID: $PROJECT_NODE_ID"
echo ""

# ── step 3: kanban field discovery ────────────────────────────────────────

step "📊" "Step 3 of 5" "Kanban Status Field"

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

# Backlog only auto-matches "backlog" — not "todo" (that belongs to Refine)
auto_or_pick "Backlog" "backlog"                                              "required"; OPTION_BACKLOG="$PICKED_ID"
auto_or_pick "Refine"  "refine,groom,grooming,refined,ready,todo,to do"       "required"; OPTION_REFINE="$PICKED_ID"
auto_or_pick "Plan"    "plan,analyze,analysis"                                "required"; OPTION_PLAN="$PICKED_ID"
auto_or_pick "Develop" "develop,development,in progress,in-progress,doing,wip" "required"; OPTION_DEVELOP="$PICKED_ID"
auto_or_pick "Test"    "test,validate,verify,in review,in-review,reviewing"   "required"; OPTION_TEST="$PICKED_ID"
auto_or_pick "Review"  "review,r4r,ready for release,ready-for-release"       "required"; OPTION_REVIEW="$PICKED_ID"
auto_or_pick "Done"    "done,closed,complete,completed"                       "required"; OPTION_DONE="$PICKED_ID"


# Build list of options that need to be created
STATES_TO_CREATE=()
[[ "$OPTION_BACKLOG" == "__NEW__" ]] && STATES_TO_CREATE+=("Backlog:GRAY")
[[ "$OPTION_REFINE"  == "__NEW__" ]] && STATES_TO_CREATE+=("Refine:BLUE")
[[ "$OPTION_PLAN"    == "__NEW__" ]] && STATES_TO_CREATE+=("Plan:PURPLE")
[[ "$OPTION_DEVELOP" == "__NEW__" ]] && STATES_TO_CREATE+=("Develop:YELLOW")
[[ "$OPTION_TEST"    == "__NEW__" ]] && STATES_TO_CREATE+=("Test:ORANGE")
[[ "$OPTION_REVIEW"  == "__NEW__" ]] && STATES_TO_CREATE+=("Review:PURPLE")
[[ "$OPTION_DONE"    == "__NEW__" ]] && STATES_TO_CREATE+=("Done:GREEN")

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
  _REFETCH_RAW=$(gh api graphql -f query="
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
}" 2>/dev/null || echo '{}')
  KANBAN_FIELD_JSON=$(echo "$_REFETCH_RAW" | jq --arg fid "$KANBAN_FIELD_ID" '
    (if type == "array" then . else (.data.node.fields.nodes // []) end)
    | map(select(.id == $fid)) | first // empty
  ' 2>/dev/null || echo '')

  # Resolve __NEW__ sentinels to actual option IDs from updated field
  remap_state() {
    echo "$KANBAN_FIELD_JSON" | jq -r --arg n "$1" '.options[] | select(.name == $n) | .id'
  }
  [[ "$OPTION_BACKLOG" == "__NEW__" ]] && OPTION_BACKLOG=$(remap_state "Backlog")
  [[ "$OPTION_REFINE"  == "__NEW__" ]] && OPTION_REFINE=$(remap_state "Refine")
  [[ "$OPTION_PLAN"    == "__NEW__" ]] && OPTION_PLAN=$(remap_state "Plan")
  [[ "$OPTION_DEVELOP" == "__NEW__" ]] && OPTION_DEVELOP=$(remap_state "Develop")
  [[ "$OPTION_TEST"    == "__NEW__" ]] && OPTION_TEST=$(remap_state "Test")
  [[ "$OPTION_REVIEW"  == "__NEW__" ]] && OPTION_REVIEW=$(remap_state "Review")
  [[ "$OPTION_DONE"    == "__NEW__" ]] && OPTION_DONE=$(remap_state "Done")
fi

# ── Reorder columns if only the 6 standard states exist ───────────────────

TOTAL_OPTIONS=$(echo "$KANBAN_FIELD_JSON" | jq '.options | length' 2>/dev/null || echo '0')
if [[ "$TOTAL_OPTIONS" -eq 7 ]]; then
  info "Setting column order: Backlog → Refine → Plan → Develop → Test → Review → Done"
  ORDERED_OPTS=$(echo "$KANBAN_FIELD_JSON" | jq -c \
    --arg b   "$OPTION_BACKLOG" \
    --arg rf  "$OPTION_REFINE" \
    --arg pl  "$OPTION_PLAN" \
    --arg dev "$OPTION_DEVELOP" \
    --arg t   "$OPTION_TEST" \
    --arg rv  "$OPTION_REVIEW" \
    --arg d   "$OPTION_DONE" \
    --argjson desc '{
      "Backlog": "Unvetted ideas; not yet shaped.",
      "Refine":  "Items being shaped: AC, sizing, estimates.",
      "Plan":    "Items being deep-dived: design + caller analysis.",
      "Develop": "Implementation in progress.",
      "Test":    "Agent verification in progress.",
      "Review":  "All checks passed; awaiting human approval.",
      "Done":    ""
    }' \
    '.options as $opts |
     [$b,$rf,$pl,$dev,$t,$rv,$d] |
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
      info "  Develop: 3   |   Test: 5   |   Review: 10"
    else
      warn "Could not reorder columns — arrange manually in the GitHub Project board."
    fi
  fi
else
  info "Project has $TOTAL_OPTIONS status columns — column order not changed (arrange manually in GitHub)."
fi
echo ""

# ── verify a Board view exists (view config is not writable via API) ──────

BOARD_VIEW_NAME=$(gh api graphql -f query="
{
  node(id: \"$PROJECT_NODE_ID\") {
    ... on ProjectV2 {
      views(first: 20) { nodes { name layout } }
    }
  }
}" --jq '[.data.node.views.nodes[] | select(.layout == "BOARD_LAYOUT")][0].name' 2>/dev/null || echo '')

if [[ -n "$BOARD_VIEW_NAME" && "$BOARD_VIEW_NAME" != "null" ]]; then
  ok "Board view exists: '$BOARD_VIEW_NAME' (Review column visible once Status options are populated)."
else
  warn "No Board-layout view found on this project."
  info "GitHub Projects v2 does not expose view configuration via API. Create one manually:"
  info "  1. Open the project in the GitHub web UI"
  info "  2. Click 'New view' → choose 'Board' layout"
  info "  3. Group by 'Status'"
  info "  4. Confirm columns: Backlog → Refine → Plan → Develop → Test → Review → Done"
fi
echo ""

# ── step 4: project management fields ─────────────────────────────────────

step "⚙️ " "Step 4 of 5" "Project Management Fields"
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
  local aliases_json="${3:-[]}"

  # Check by name first (any type) to detect conflicts before the type-filtered lookup
  local name_match name_match_type
  name_match=$(echo "$FIELDS_JSON" | jq -c --arg n "$fname" --argjson aliases "$aliases_json" \
    '([$n] + $aliases | map(ascii_downcase)) as $names |
     first(.[] | select((.name | ascii_downcase) as $fieldName | ($names | index($fieldName) != null))) // empty' \
    2>/dev/null || echo '')
  name_match_type=$(echo "$name_match" | jq -r 'if has("options") then "SINGLE_SELECT" elif .dataType then .dataType else "" end' 2>/dev/null || echo '')

  if [[ -n "$name_match" && "$name_match_type" == "SINGLE_SELECT" ]]; then
    ok "Found field '$fname'."
    RESULT_FIELD_ID=$(echo "$name_match" | jq -r '.id')
    RESULT_FIELD_JSON="$name_match"
    return
  fi

  local create_name="$fname"

  if [[ -n "$name_match" ]]; then
    echo ""
    err "Field '$fname' exists on this project but is type ${name_match_type:-unknown}, not SINGLE_SELECT."
    info "You must choose a different name for a new single-select field."
    while true; do
      prompt "New field name for '$fname' (SINGLE_SELECT):"; read -r create_name
      [[ -z "$create_name" ]] && { err "Name required."; continue; }
      local alt_match
      alt_match=$(echo "$FIELDS_JSON" | jq -c --arg n "$create_name" \
        'first(.[] | select((.name | ascii_downcase) == ($n | ascii_downcase))) // empty' \
        2>/dev/null || echo '')
      if [[ -n "$alt_match" ]]; then
        local alt_type
        alt_type=$(echo "$alt_match" | jq -r 'if has("options") then "SINGLE_SELECT" elif .dataType then .dataType else "" end')
        if [[ "$alt_type" == "SINGLE_SELECT" ]]; then
          ok "Using existing field '$create_name'."
          RESULT_FIELD_ID=$(echo "$alt_match" | jq -r '.id')
          RESULT_FIELD_JSON="$alt_match"
          return
        fi
        err "Field '$create_name' also exists as type ${alt_type}. Choose a different name."
        continue
      fi
      break
    done
  fi

  if [[ -z "$name_match" ]]; then
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
        break
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
  fi

  local new_id
  new_id=$(jq -n \
    --arg proj "$PROJECT_NODE_ID" \
    --arg name "$create_name" \
    --argjson opts "$create_opts_json" \
    '{query:"mutation($proj:ID!,$name:String!,$opts:[ProjectV2SingleSelectFieldOptionInput!]!){createProjectV2Field(input:{projectId:$proj,dataType:SINGLE_SELECT,name:$name,singleSelectOptions:$opts}){projectV2Field{...on ProjectV2SingleSelectField{id}}}}",variables:{proj:$proj,name:$name,opts:$opts}}' \
    | gh api graphql --input - --jq '.data.createProjectV2Field.projectV2Field.id' 2>/dev/null || echo '')
  if [[ -n "$new_id" ]]; then
    ok "Created '$create_name' field."
    refresh_fields
    RESULT_FIELD_ID="$new_id"
    RESULT_FIELD_JSON=$(echo "$FIELDS_JSON" | jq -c --arg id "$new_id" \
      'first(.[] | select(.id == $id)) // empty')
  else
    warn "Could not create '$create_name'. Add it manually to your GitHub Project."
    RESULT_FIELD_ID=""
    RESULT_FIELD_JSON=""
  fi
}

# map_or_create_number <field-name>
# Auto-matches by exact name; otherwise prompts to map existing number field or create new.
# Sets RESULT_FIELD_ID.
map_or_create_number() {
  local fname="$1"
  local aliases_json="${2:-[]}"

  local name_match name_match_type
  name_match=$(echo "$FIELDS_JSON" | jq -c --arg n "$fname" --argjson aliases "$aliases_json" \
    '([$n] + $aliases | map(ascii_downcase)) as $names |
     first(.[] | select((.name | ascii_downcase) as $fieldName | ($names | index($fieldName) != null))) // empty' \
    2>/dev/null || echo '')
  name_match_type=$(echo "$name_match" | jq -r 'if has("options") then "SINGLE_SELECT" elif .dataType then .dataType else "" end' 2>/dev/null || echo '')

  if [[ -n "$name_match" && ( "$name_match_type" == "NUMBER" || -z "$name_match_type" ) ]]; then
    ok "Found field '$fname'."
    RESULT_FIELD_ID=$(echo "$name_match" | jq -r '.id')
    return
  fi

  local create_name="$fname"

  if [[ -n "$name_match" ]]; then
    echo ""
    err "Field '$fname' exists on this project but is type ${name_match_type:-unknown}, not NUMBER."
    info "You must choose a different name for a new number field."
    while true; do
      prompt "New field name for '$fname' (NUMBER):"; read -r create_name
      [[ -z "$create_name" ]] && { err "Name required."; continue; }
      local alt_match
      alt_match=$(echo "$FIELDS_JSON" | jq -c --arg n "$create_name" \
        'first(.[] | select((.name | ascii_downcase) == ($n | ascii_downcase))) // empty' \
        2>/dev/null || echo '')
      if [[ -n "$alt_match" ]]; then
        local alt_type
        alt_type=$(echo "$alt_match" | jq -r 'if has("options") then "SINGLE_SELECT" elif .dataType then .dataType else "" end')
        if [[ "$alt_type" == "NUMBER" || -z "$alt_type" ]]; then
          ok "Using existing field '$create_name'."
          RESULT_FIELD_ID=$(echo "$alt_match" | jq -r '.id')
          return
        fi
        err "Field '$create_name' also exists as type ${alt_type}. Choose a different name."
        continue
      fi
      break
    done
  fi

  if [[ -z "$name_match" ]]; then
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
        break
      elif [[ "$choice" =~ ^[0-9]+$ && "$choice" -ge 1 && "$choice" -le "$count" ]]; then
        RESULT_FIELD_ID=$(echo "$num_fields" | jq -r --argjson i "$((choice-1))" '.[$i].id')
        local pname
        pname=$(echo "$num_fields" | jq -r --argjson i "$((choice-1))" '.[$i].name')
        ok "Mapped '$fname' → '$pname'"
        return
      fi
      err "Enter a number 1-$count or 'new'."
    done
  fi

  local new_id
  new_id=$(gh api graphql -f query='
mutation($proj:ID!,$name:String!){
  createProjectV2Field(input:{projectId:$proj,dataType:NUMBER,name:$name}){
    projectV2Field{...on ProjectV2Field{id}}
  }
}' -f proj="$PROJECT_NODE_ID" -f name="$create_name" \
    --jq '.data.createProjectV2Field.projectV2Field.id' 2>/dev/null || echo '')
  if [[ -n "$new_id" ]]; then
    ok "Created '$create_name' field."
    refresh_fields
    RESULT_FIELD_ID="$new_id"
  else
    warn "Could not create '$create_name'. Add it manually to your GitHub Project."
    RESULT_FIELD_ID=""
  fi
}

map_or_create_date() {
  local fname="$1"
  local aliases_json="${2:-[]}"

  local name_match name_match_type
  name_match=$(echo "$FIELDS_JSON" | jq -c --arg n "$fname" --argjson aliases "$aliases_json" \
    '([$n] + $aliases | map(ascii_downcase)) as $names |
     first(.[] | select((.name | ascii_downcase) as $fieldName | ($names | index($fieldName) != null))) // empty' \
    2>/dev/null || echo '')
  name_match_type=$(echo "$name_match" | jq -r 'if has("options") then "SINGLE_SELECT" elif .dataType then .dataType else "" end' 2>/dev/null || echo '')

  if [[ -n "$name_match" && ( "$name_match_type" == "DATE" || -z "$name_match_type" ) ]]; then
    ok "Found field '$fname'."
    RESULT_FIELD_ID=$(echo "$name_match" | jq -r '.id')
    return
  fi

  local create_name="$fname"

  if [[ -n "$name_match" ]]; then
    echo ""
    err "Field '$fname' exists on this project but is type ${name_match_type:-unknown}, not DATE."
    info "You must choose a different name for a new date field."
    while true; do
      prompt "New field name for '$fname' (DATE):"; read -r create_name
      [[ -z "$create_name" ]] && { err "Name required."; continue; }
      local alt_match
      alt_match=$(echo "$FIELDS_JSON" | jq -c --arg n "$create_name" \
        'first(.[] | select((.name | ascii_downcase) == ($n | ascii_downcase))) // empty' \
        2>/dev/null || echo '')
      if [[ -n "$alt_match" ]]; then
        local alt_type
        alt_type=$(echo "$alt_match" | jq -r 'if has("options") then "SINGLE_SELECT" elif .dataType then .dataType else "" end')
        if [[ "$alt_type" == "DATE" || -z "$alt_type" ]]; then
          ok "Using existing field '$create_name'."
          RESULT_FIELD_ID=$(echo "$alt_match" | jq -r '.id')
          return
        fi
        err "Field '$create_name' also exists as type ${alt_type}. Choose a different name."
        continue
      fi
      break
    done
  fi

  if [[ -z "$name_match" ]]; then
    echo ""
    info "Field '$fname' not found on project."
    local date_fields count
    date_fields=$(echo "$FIELDS_JSON" | jq '[.[] | select(.dataType == "DATE")]')
    count=$(echo "$date_fields" | jq 'length')
    if [[ "$count" -gt 0 ]]; then
      echo "$date_fields" | jq -r 'to_entries[] | "    [\(.key+1)] \(.value.name)"'
    fi
    echo "    [new] Create '$fname' date field (default)"
    echo ""

    while true; do
      prompt "Choice for '$fname' [new]:"
      read -r choice
      [[ -z "$choice" ]] && choice="new"
      if [[ "$choice" == "new" ]]; then
        break
      elif [[ "$choice" =~ ^[0-9]+$ && "$choice" -ge 1 && "$choice" -le "$count" ]]; then
        RESULT_FIELD_ID=$(echo "$date_fields" | jq -r --argjson i "$((choice-1))" '.[$i].id')
        local pname
        pname=$(echo "$date_fields" | jq -r --argjson i "$((choice-1))" '.[$i].name')
        ok "Mapped '$fname' → '$pname'"
        return
      fi
      err "Enter a number 1-$count or 'new'."
    done
  fi

  local new_id
  new_id=$(gh api graphql -f query='
mutation($proj:ID!,$name:String!){
  createProjectV2Field(input:{projectId:$proj,dataType:DATE,name:$name}){
    projectV2Field{...on ProjectV2Field{id}}
  }
}' -f proj="$PROJECT_NODE_ID" -f name="$create_name" \
    --jq '.data.createProjectV2Field.projectV2Field.id' 2>/dev/null || echo '')
  if [[ -n "$new_id" ]]; then
    ok "Created '$create_name' field."
    refresh_fields
    RESULT_FIELD_ID="$new_id"
  else
    warn "Could not create '$create_name'. Add it manually to your GitHub Project."
    RESULT_FIELD_ID=""
  fi
}

map_or_create_text() {
  local fname="$1"
  local aliases_json="${2:-[]}"

  local name_match name_match_type
  name_match=$(echo "$FIELDS_JSON" | jq -c --arg n "$fname" --argjson aliases "$aliases_json" \
    '([$n] + $aliases | map(ascii_downcase)) as $names |
     first(.[] | select((.name | ascii_downcase) as $fieldName | ($names | index($fieldName) != null))) // empty' \
    2>/dev/null || echo '')
  name_match_type=$(echo "$name_match" | jq -r 'if has("options") then "SINGLE_SELECT" elif .dataType then .dataType else "" end' 2>/dev/null || echo '')

  if [[ -n "$name_match" && ( "$name_match_type" == "TEXT" || -z "$name_match_type" ) ]]; then
    ok "Found field '$fname'."
    RESULT_FIELD_ID=$(echo "$name_match" | jq -r '.id')
    return
  fi

  local create_name="$fname"
  if [[ -n "$name_match" ]]; then
    echo ""
    err "Field '$fname' exists on this project but is type ${name_match_type:-unknown}, not TEXT."
    info "You must choose a different name for a new text field."
    while true; do
      prompt "New field name for '$fname' (TEXT):"; read -r create_name
      [[ -z "$create_name" ]] && { err "Name required."; continue; }
      local alt_match
      alt_match=$(echo "$FIELDS_JSON" | jq -c --arg n "$create_name" \
        'first(.[] | select((.name | ascii_downcase) == ($n | ascii_downcase))) // empty' \
        2>/dev/null || echo '')
      if [[ -n "$alt_match" ]]; then
        local alt_type
        alt_type=$(echo "$alt_match" | jq -r 'if has("options") then "SINGLE_SELECT" elif .dataType then .dataType else "" end')
        if [[ "$alt_type" == "TEXT" || -z "$alt_type" ]]; then
          ok "Using existing field '$create_name'."
          RESULT_FIELD_ID=$(echo "$alt_match" | jq -r '.id')
          return
        fi
        err "Field '$create_name' also exists as type ${alt_type}. Choose a different name."
        continue
      fi
      break
    done
  fi

  local new_id
  new_id=$(gh api graphql -f query='
mutation($proj:ID!,$name:String!){
  createProjectV2Field(input:{projectId:$proj,dataType:TEXT,name:$name}){
    projectV2Field{...on ProjectV2Field{id}}
  }
}' -f proj="$PROJECT_NODE_ID" -f name="$create_name" \
    --jq '.data.createProjectV2Field.projectV2Field.id' 2>/dev/null || echo '')
  if [[ -n "$new_id" ]]; then
    ok "Created '$create_name' field."
    refresh_fields
    RESULT_FIELD_ID="$new_id"
  else
    warn "Could not create '$create_name'. Add it manually to your GitHub Project."
    RESULT_FIELD_ID=""
  fi
}

# ── Custom fields from definitions ─────────────────────────────────────────

info "Custom fields from .ai-task-manager/project-fields.json..."
echo ""
FIELD_IDS_JSON="{}"
PRIORITY_FIELD_ID="" OPTION_P0="" OPTION_P1="" OPTION_P2=""
SIZE_FIELD_ID=""
FIELD_ESTIMATE=""
FIELD_ENGAGED_TIME=""
FIELD_SESSION_TIME=""
FIELD_CONTEXT_LENGTH=""
FIELD_SEQUENCE=""
FIELD_START_TIME=""

set_field_id_json() {
  FIELD_IDS_JSON=$(printf '%s\n' "$FIELD_IDS_JSON" | jq -c --arg key "$1" --arg val "$2" '. + {($key): $val}')
}

while IFS= read -r FIELD_DEF <&3; do
  FIELD_KEY=$(echo "$FIELD_DEF" | jq -r '.key')
  FIELD_NAME=$(echo "$FIELD_DEF" | jq -r '.name')
  FIELD_TYPE=$(echo "$FIELD_DEF" | jq -r '.type')
  FIELD_ALIASES=$(echo "$FIELD_DEF" | jq -c '.aliases // []')
  RESULT_FIELD_ID=""
  RESULT_FIELD_JSON=""
  case "$FIELD_TYPE" in
    single_select)
      FIELD_OPTIONS=$(echo "$FIELD_DEF" | jq -c '.options // []')
      info "$FIELD_NAME (single-select)..."
      map_or_create_select "$FIELD_NAME" "$FIELD_OPTIONS" "$FIELD_ALIASES"
      ;;
    number)
      info "$FIELD_NAME (number)..."
      map_or_create_number "$FIELD_NAME" "$FIELD_ALIASES"
      ;;
    date)
      info "$FIELD_NAME (date)..."
      map_or_create_date "$FIELD_NAME" "$FIELD_ALIASES"
      ;;
    text)
      info "$FIELD_NAME (text)..."
      map_or_create_text "$FIELD_NAME" "$FIELD_ALIASES"
      ;;
    *)
      warn "Skipping unsupported field type '$FIELD_TYPE' for '$FIELD_NAME'."
      ;;
  esac

  if [[ -n "$RESULT_FIELD_ID" ]]; then
    set_field_id_json "$FIELD_KEY" "$RESULT_FIELD_ID"
    case "$FIELD_KEY" in
      priority)
        PRIORITY_FIELD_ID="$RESULT_FIELD_ID"
        if [[ -n "$RESULT_FIELD_JSON" ]]; then
          KANBAN_FIELD_JSON="$RESULT_FIELD_JSON"
          auto_or_pick "P0 (critical)" "p0,critical,urgent"   "optional"; OPTION_P0="$PICKED_ID"
          auto_or_pick "P1 (high)"     "p1,high,important"    "optional"; OPTION_P1="$PICKED_ID"
          auto_or_pick "P2 (normal)"   "p2,normal,medium,low" "optional"; OPTION_P2="$PICKED_ID"
          KANBAN_FIELD_JSON=""
        fi
        ;;
      size) SIZE_FIELD_ID="$RESULT_FIELD_ID" ;;
      estimate) FIELD_ESTIMATE="$RESULT_FIELD_ID" ;;
      engagedTime) FIELD_ENGAGED_TIME="$RESULT_FIELD_ID" ;;
      sessionTime) FIELD_SESSION_TIME="$RESULT_FIELD_ID" ;;
      contextLength) FIELD_CONTEXT_LENGTH="$RESULT_FIELD_ID" ;;
      sequence) FIELD_SEQUENCE="$RESULT_FIELD_ID" ;;
      startTime) FIELD_START_TIME="$RESULT_FIELD_ID" ;;
    esac
  fi
  echo ""
done 3< <(jq -c '.[]' "$FIELD_DEFS_FILE")
echo ""

# ── step 5: write config + issue templates ─────────────────────────────────

step "💾" "Step 5 of 5" "Writing Config & Issue Templates"

# Write .ai-task-manager/task-tracker.json — merge with existing config
CONFIG_FILE="$CONFIG_FILE" \
REPO="$REPO" \
PROJECT_NODE_ID="$PROJECT_NODE_ID" \
KANBAN_FIELD_ID="$KANBAN_FIELD_ID" \
OPTION_BACKLOG="$OPTION_BACKLOG" \
OPTION_REFINE="$OPTION_REFINE" \
OPTION_PLAN="$OPTION_PLAN" \
OPTION_DEVELOP="$OPTION_DEVELOP" \
OPTION_TEST="$OPTION_TEST" \
OPTION_REVIEW="$OPTION_REVIEW" \
OPTION_DONE="$OPTION_DONE" \
PRIORITY_FIELD_ID="$PRIORITY_FIELD_ID" \
OPTION_P0="$OPTION_P0" \
OPTION_P1="$OPTION_P1" \
OPTION_P2="$OPTION_P2" \
SIZE_FIELD_ID="$SIZE_FIELD_ID" \
FIELD_ESTIMATE="$FIELD_ESTIMATE" \
FIELD_ENGAGED_TIME="$FIELD_ENGAGED_TIME" \
FIELD_SESSION_TIME="$FIELD_SESSION_TIME" \
FIELD_CONTEXT_LENGTH="$FIELD_CONTEXT_LENGTH" \
FIELD_SEQUENCE="$FIELD_SEQUENCE" \
FIELD_START_TIME="$FIELD_START_TIME" \
FIELD_IDS_JSON="$FIELD_IDS_JSON" \
node -e "
const fs = require('fs');
const file = process.env.CONFIG_FILE;
const legacyFile = file.replace('/.ai-task-manager/', '/.claude/');
let existing = {};
try { existing = JSON.parse(fs.readFileSync(file, 'utf8')); }
catch {
  try { existing = JSON.parse(fs.readFileSync(legacyFile, 'utf8')); } catch {}
}
const updates = {
  repo:                   process.env.REPO,
  projectId:              process.env.PROJECT_NODE_ID,
  kanbanFieldId:          process.env.KANBAN_FIELD_ID,
  kanbanOptionBacklog:     process.env.OPTION_BACKLOG,
  kanbanOptionRefine:      process.env.OPTION_REFINE,
  kanbanOptionGroom:       process.env.OPTION_REFINE,
  kanbanOptionPlan:        process.env.OPTION_PLAN,
  kanbanOptionAnalyze:     process.env.OPTION_PLAN,
  kanbanOptionDevelop:     process.env.OPTION_DEVELOP,
  kanbanOptionDevelopment: process.env.OPTION_DEVELOP,
  kanbanOptionTest:        process.env.OPTION_TEST,
  kanbanOptionValidate:    process.env.OPTION_TEST,
  kanbanOptionReview:      process.env.OPTION_REVIEW,
  kanbanOptionDone:        process.env.OPTION_DONE,
  priorityFieldId:        process.env.PRIORITY_FIELD_ID,
  priorityOptionP0:       process.env.OPTION_P0,
  priorityOptionP1:       process.env.OPTION_P1,
  priorityOptionP2:       process.env.OPTION_P2,
};
// Only write IDs when we got them — don't clobber manually configured values with empty strings
const optional = {
  sizeFieldId:            process.env.SIZE_FIELD_ID,
  fieldEstimate:          process.env.FIELD_ESTIMATE,
  fieldEngagedTime:       process.env.FIELD_ENGAGED_TIME,
  fieldActualHours:       process.env.FIELD_ENGAGED_TIME,
  fieldSessionTime:       process.env.FIELD_SESSION_TIME,
  fieldActualMinutes:     process.env.FIELD_SESSION_TIME,
  fieldContextWords:      process.env.FIELD_CONTEXT_LENGTH,
  fieldSequence:          process.env.FIELD_SEQUENCE,
  sequenceFieldId:        process.env.FIELD_SEQUENCE,
  fieldStartTime:         process.env.FIELD_START_TIME,
};
for (const [k, v] of Object.entries(optional)) { if (v) updates[k] = v; }
try {
  const fieldIds = JSON.parse(process.env.FIELD_IDS_JSON || '{}');
  if (Object.keys(fieldIds).length) updates.fieldIds = fieldIds;
} catch {}
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
description: Manual task entry compatible with AI Task Manager
title: "[Task] "
labels: []
body:
  - type: markdown
    attributes:
      value: |
        Fill in the planning fields below. AI Task Manager will create the hidden
        field database and timing-log comment the first time an agent picks up
        this issue with `/task #<issue-number>`.

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
        - P0 - Critical / blocking
        - P1 - High / this sprint
        - P2 - Normal / backlog
    validations:
      required: true

  - type: dropdown
    id: size
    attributes:
      label: Size
      description: Estimated effort
      options:
        - "XS - 1-2 hours"
        - "S - 3-4 hours"
        - "M - 6-10 hours"
        - "L - 12-20 hours"
        - "XL - 24+ hours"
    validations:
      required: true

  - type: input
    id: estimate
    attributes:
      label: Estimate
      description: Mid-point estimate in hours, for example 4 or 4h.
      placeholder: "4"
    validations:
      required: true

  - type: input
    id: sequence
    attributes:
      label: Sequence
      description: Optional fan-out/order number used by AITM orchestration.
      placeholder: "1"
    validations:
      required: false

  - type: textarea
    id: dependencies
    attributes:
      label: Dependencies
      description: Optional issue numbers or work items that should complete first.
      placeholder: "#12, auth setup, database migration"
    validations:
      required: false
TMPL

# Bug template
cat > "$TEMPLATE_DIR/bug.yml" <<'TMPL'
name: Bug
description: Manual bug entry compatible with AI Task Manager
title: "[Bug] "
labels: ["bug"]
body:
  - type: markdown
    attributes:
      value: |
        Fill in the planning fields below. AI Task Manager will create the hidden
        field database and timing-log comment the first time an agent picks up
        this issue with `/task #<issue-number>`.

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

  - type: textarea
    id: acceptance-criteria
    attributes:
      label: Acceptance Criteria
      description: How will we know this fix is done?
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
        - P0 - Critical / blocking
        - P1 - High / this sprint
        - P2 - Normal / backlog
    validations:
      required: true

  - type: dropdown
    id: size
    attributes:
      label: Size
      description: Estimated fix effort
      options:
        - "XS - 1-2 hours"
        - "S - 3-4 hours"
        - "M - 6-10 hours"
        - "L - 12-20 hours"
        - "XL - 24+ hours"
    validations:
      required: true

  - type: input
    id: estimate
    attributes:
      label: Estimate
      description: Mid-point fix estimate in hours, for example 2 or 2h.
      placeholder: "2"
    validations:
      required: true

  - type: input
    id: sequence
    attributes:
      label: Sequence
      description: Optional fan-out/order number used by AITM orchestration.
      placeholder: "1"
    validations:
      required: false
TMPL

ok "Issue templates written: $TEMPLATE_DIR/"
echo ""

# ── done ───────────────────────────────────────────────────────────────────

success_banner "Setup complete!"
ok "Config           $(dim "$CONFIG_FILE")"
ok "Issue templates  $(dim "$TEMPLATE_DIR/")"
echo ""
divider
echo ""
printf "  \033[1m🚀 Next steps\033[0m\n"
echo ""
printf "    \033[32m1.\033[0m Commit the issue templates \033[2m(config is gitignored)\033[0m:\n"
printf "       \033[36mgit add .github/ISSUE_TEMPLATE/\033[0m\n"
printf "       \033[36mgit commit -m 'chore: add ai-task-manager issue templates'\033[0m\n"
echo ""
printf "    \033[32m2.\033[0m Start Claude Code and type: \033[35m/task #<issue-number>\033[0m\n"
echo ""
divider
echo ""
printf "  \033[36m🔹\033[0m To reconfigure at any time, run: \033[36mnpx ai-task-manager init\033[0m\n"
echo ""
