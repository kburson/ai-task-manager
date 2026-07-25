#!/usr/bin/env sh
set -eu

log() {
  printf '[cloud-setup] %s\n' "$*"
}

warn() {
  printf '[cloud-setup] WARN: %s\n' "$*" >&2
}

version_major() {
  printf '%s\n' "$1" | sed -E 's/^v?([0-9]+).*/\1/'
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf '[cloud-setup] ERROR: missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

require_cmd git
require_cmd node
require_cmd npm
require_cmd gh
require_cmd jq

node_version="$(node -v)"
node_major="$(version_major "$node_version")"
if [ "$node_major" -lt 22 ]; then
  printf '[cloud-setup] ERROR: Node.js 22+ is required; found %s\n' "$node_version" >&2
  exit 1
fi

if [ "$node_major" -lt 25 ]; then
  warn "Node 25 is preferred for cloud development; continuing with supported runtime $node_version"
else
  log "Node runtime: $node_version"
fi

log "npm version: $(npm -v)"
log "git version: $(git --version)"
log "gh version: $(gh --version | sed -n '1p')"
log "jq version: $(jq --version)"

if gh auth status >/dev/null 2>&1; then
  log "GitHub CLI authentication is available"
else
  warn "GitHub CLI is not authenticated; configure cloud secrets or run gh auth before AITM issue/project operations"
fi

log "Installing npm dependencies from package-lock.json"
npm ci

if command -v npx >/dev/null 2>&1; then
  log "Preparing Puppeteer browser cache when supported"
  if npx puppeteer browsers install chrome >/dev/null 2>&1; then
    log "Puppeteer Chrome browser installed"
  else
    warn "Puppeteer Chrome install skipped or unsupported; HTML reports still work, PDF/browser-backed flows may need image-level browser dependencies"
  fi
else
  warn "npx not found after npm verification; skipping Puppeteer browser install"
fi

log "Cloud setup complete"
