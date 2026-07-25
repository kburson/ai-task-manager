#!/usr/bin/env sh
set -eu

log() {
  printf '[cloud-maintenance] %s\n' "$*"
}

warn() {
  printf '[cloud-maintenance] WARN: %s\n' "$*" >&2
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf '[cloud-maintenance] ERROR: missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

require_cmd git
require_cmd node
require_cmd npm

log "Refreshing remote refs"
git fetch --prune origin

if git show-ref --verify --quiet refs/remotes/origin/trunk; then
  if git show-ref --verify --quiet refs/heads/trunk; then
    log "Refreshing local trunk from origin/trunk"
    git fetch --no-tags origin trunk:trunk
  else
    log "Creating local trunk from origin/trunk"
    git branch trunk origin/trunk
  fi
else
  warn "origin/trunk not found; history-sensitive tests may need the repository trunk ref configured"
fi

mkdir -p .tmp/aitm
shallow_state=".tmp/aitm/cloud-maintenance-shallow-state"
if git rev-parse --is-shallow-repository >"$shallow_state" 2>/dev/null; then
  if [ "$(cat "$shallow_state")" = "true" ]; then
    log "Repository is shallow; fetching full history for git-history tests"
    git fetch --unshallow origin
  fi
  rm -f "$shallow_state"
fi

log "Refreshing npm dependencies from package-lock.json"
npm ci

log "Cloud maintenance complete"
