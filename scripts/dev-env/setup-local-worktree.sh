#!/usr/bin/env bash
set -euo pipefail

log() {
  printf '[local-worktree] %s\n' "$*"
}

warn() {
  printf '[local-worktree] WARN: %s\n' "$*" >&2
}

fail() {
  printf '[local-worktree] ERROR: %s\n' "$*" >&2
  exit 1
}

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
project_dir="$(cd "$script_dir/../.." && pwd -P)"
cd "$project_dir"

for tool in git node npm gh jq; do
  command -v "$tool" >/dev/null 2>&1 || fail "required command is missing from PATH: $tool"
done

node_version="$(node -p 'process.versions.node')"
node_major="${node_version%%.*}"
case "$node_major" in
  '' | *[!0-9]*) fail "unable to parse Node.js version: $node_version" ;;
esac
if [ "$node_major" -lt 22 ]; then
  fail "Node.js 22 or newer is required; found $node_version"
fi
if [ "$node_major" -lt 25 ]; then
  warn "Node.js 25 is preferred for active development; found $node_version"
else
  log "Node.js $node_version"
fi

log "installing lockfile dependencies"
npm ci

log "repairing the dogfood self-link"
npm run link:self

log "verifying the AITM worktree environment"
node scripts/dev-env/verify-local-worktree.mjs

if gh auth status >/dev/null 2>&1; then
  log "GitHub CLI authentication is available"
else
  warn "GitHub CLI is not authenticated; GitHub-backed AITM operations will fail"
fi

log "setup complete: $project_dir"
