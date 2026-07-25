# Cloud Development Environments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repo-owned cloud development setup scripts and docs so Codex and Claude cloud workers can run AI Task Manager tasks in isolated environments.

**Architecture:** Add plain shell entrypoints under `scripts/dev-env/` and a guide under `docs/guides/`. The scripts provide the executable environment contract; docs explain how cloud agents use AITM without changing the local trunk session.

**Tech Stack:** POSIX shell, Node.js 22+ minimum, Node 25 preferred for cloud development, npm lockfile installs, GitHub CLI, jq, git, rg-based verification.

## Global Constraints

- Development cloud environments prefer Node 25.
- Node 22 remains the minimum supported runtime and the CI compatibility floor.
- Do not add devcontainer, Docker, or Codespaces definitions in this issue.
- Do not push directly to `origin/trunk` from cloud workers.
- Do not bind or switch the local trunk checkout's active AITM issue.
- Use `npx aitm <verb>` from the active worktree root for all task workflow commands.

---

## File Structure

- Create `scripts/dev-env/setup-cloud.sh`: fresh cloud checkout bootstrap.
- Create `scripts/dev-env/maintenance-cloud.sh`: cached cloud environment refresh.
- Create `docs/guides/cloud-development-environments.md`: Codex/Claude cloud workflow guide.
- Modify `README.md`: replace Node 18 prerequisite with Node 22+ minimum and mention Node 25 preferred for cloud dev.
- Modify `CLAUDE.md`: replace Node 18 wording with Node 22+ minimum.
- Modify `docs/introduction/README.md`: replace Node 18 prerequisite.
- Modify `docs/introduction/install-and-setup.md`: replace Node 18 prerequisite.

### Task 1: Cloud Setup Scripts

**Files:**

- Create: `scripts/dev-env/setup-cloud.sh`
- Create: `scripts/dev-env/maintenance-cloud.sh`

**Interfaces:**

- Consumes: `package.json`, `package-lock.json`, `git`, `node`, `npm`, `gh`, `jq`.
- Produces: executable scripts callable from Codex/Claude cloud environment setup settings.

- [ ] **Step 1: Create the setup script**

Create `scripts/dev-env/setup-cloud.sh` with:

```sh
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
```

- [ ] **Step 2: Create the maintenance script**

Create `scripts/dev-env/maintenance-cloud.sh` with:

```sh
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
```

- [ ] **Step 3: Make scripts executable**

Run:

```bash
chmod +x scripts/dev-env/setup-cloud.sh scripts/dev-env/maintenance-cloud.sh
```

Expected: no output.

- [ ] **Step 4: Verify script syntax and executable mode**

Run:

```bash
test -x scripts/dev-env/setup-cloud.sh
test -x scripts/dev-env/maintenance-cloud.sh
bash -n scripts/dev-env/setup-cloud.sh
bash -n scripts/dev-env/maintenance-cloud.sh
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add scripts/dev-env/setup-cloud.sh scripts/dev-env/maintenance-cloud.sh
git commit -m "[#976] feat(cloud): add development environment scripts"
```

Expected: commit succeeds.

### Task 2: Cloud Workflow Guide And Runtime Docs

**Files:**

- Create: `docs/guides/cloud-development-environments.md`
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `docs/introduction/README.md`
- Modify: `docs/introduction/install-and-setup.md`

**Interfaces:**

- Consumes: scripts from Task 1.
- Produces: operator-facing instructions for Codex/Claude cloud workers.

- [ ] **Step 1: Add cloud workflow guide**

Create `docs/guides/cloud-development-environments.md` with these sections and exact policy points:

````md
# Cloud Development Environments

AI Task Manager cloud work runs from isolated task environments. Each Codex or
Claude cloud worker owns its checkout, branch, AITM issue binding, timing ledger,
verification, and push path.

## Runtime

- Node.js 22+ is the minimum supported runtime for this repository.
- Node 25 is the preferred development runtime for cloud environments.
- CI continues to prove the Node 22 compatibility floor.

## Codex Cloud Setup

Use the Codex cloud environment setup command:

```bash
scripts/dev-env/setup-cloud.sh
```

Use the maintenance command for cached environment refreshes:

```bash
scripts/dev-env/maintenance-cloud.sh
```

Codex cloud setup has internet access. The agent phase is offline by default
unless internet access is enabled for the environment. Keep agent internet access
off by default and install dependencies during setup.

## Claude Cloud Setup

Use the same repository scripts from Claude cloud or Claude-hosted GitHub worker
configuration:

```bash
scripts/dev-env/setup-cloud.sh
scripts/dev-env/maintenance-cloud.sh
```

If the Claude environment provides its own Node selector, choose Node 25 for
development while keeping Node 22 as the project minimum.

## AI Task Manager Workflow

1. Start a fresh cloud task environment or isolated worktree.
2. Create or bind the GitHub issue inside that environment.
3. Run `npx aitm status` and verify the active task belongs to that environment.
4. Use `npx aitm refine`, `npx aitm plan`, `npx aitm plan-approve`, `npx aitm test`,
   `npx aitm review`, and `npx aitm close` from that environment as the issue
   advances.
5. Commit with the issue token in the subject, for example `[#976]`.
6. Push the task branch to origin when complete.
7. Open or hand off a PR according to the normal AITM lifecycle.

Do not bind or switch the active issue in the local trunk checkout for cloud
task work. The local trunk session may be occupied by Claude, Codex, or the
maintainer's hand-editing workflow.

## Secrets And Authentication

Cloud environments need GitHub authentication for `gh`, issue-body mutation,
project field updates, and branch pushes. Provide tokens through the cloud
platform's secret settings. Do not commit secrets to the repository.

Run this in the cloud environment to diagnose authentication:

```bash
gh auth status
```

## Git Baseline

The test suite expects enough git history for history-sensitive checks. The
maintenance script fetches refs, avoids shallow-history assumptions, and
materializes a local `trunk` ref from `origin/trunk` when available.
````

- [ ] **Step 2: Update root README prerequisite**

In `README.md`, replace the prerequisite line:

```md
- **Node.js 18+**
```

with:

```md
- **Node.js 22+** — minimum supported runtime; Node 25 is preferred for cloud development environments
```

- [ ] **Step 3: Update CLAUDE.md runtime statement**

In `CLAUDE.md`, replace:

```md
Requires Node.js v18+ (ES modules) and the GitHub CLI (`gh`).
```

with:

```md
Requires Node.js v22+ (ES modules) and the GitHub CLI (`gh`). Node 25 is preferred for cloud development environments.
```

- [ ] **Step 4: Update introduction prerequisites**

In `docs/introduction/README.md` and `docs/introduction/install-and-setup.md`, replace:

```md
- Node.js 18 or newer
```

with:

```md
- Node.js 22 or newer
```

- [ ] **Step 5: Verify required doc terms**

Run:

```bash
rg -n 'Node.js 22' README.md CLAUDE.md docs/introduction/README.md docs/introduction/install-and-setup.md docs/guides/cloud-development-environments.md
rg -n 'Node 25' docs/guides/cloud-development-environments.md
rg -n 'Codex' docs/guides/cloud-development-environments.md
rg -n 'Claude' docs/guides/cloud-development-environments.md
rg -n 'npx aitm' docs/guides/cloud-development-environments.md
rg -n 'local trunk' docs/guides/cloud-development-environments.md
rg -n 'push' docs/guides/cloud-development-environments.md
rg -n 'secret' docs/guides/cloud-development-environments.md
rg -n 'gh auth' docs/guides/cloud-development-environments.md
rg -n 'internet access' docs/guides/cloud-development-environments.md
rg -n 'offline' docs/guides/cloud-development-environments.md
```

Expected: every command prints at least one match.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
git add README.md CLAUDE.md docs/introduction/README.md docs/introduction/install-and-setup.md docs/guides/cloud-development-environments.md
git commit -m "[#976] docs(cloud): describe agent environment workflow"
```

Expected: commit succeeds.

### Task 3: Final Verification And Handoff

**Files:**

- Modify: no source files expected beyond Task 1 and Task 2 files.

**Interfaces:**

- Consumes: scripts and docs from prior tasks.
- Produces: verified branch ready for implementation review.

- [ ] **Step 1: Run script verifiers**

Run:

```bash
test -x scripts/dev-env/setup-cloud.sh
test -x scripts/dev-env/maintenance-cloud.sh
bash -n scripts/dev-env/setup-cloud.sh
bash -n scripts/dev-env/maintenance-cloud.sh
rg -n 'Node 25' scripts/dev-env/setup-cloud.sh
rg -n 'Node 22' scripts/dev-env/setup-cloud.sh
rg -n 'npm ci' scripts/dev-env/setup-cloud.sh
rg -n 'gh' scripts/dev-env/setup-cloud.sh
rg -n 'jq' scripts/dev-env/setup-cloud.sh
rg -n 'git' scripts/dev-env/setup-cloud.sh
rg -n 'puppeteer' scripts/dev-env/setup-cloud.sh
rg -n 'package-lock.json' scripts/dev-env/maintenance-cloud.sh
rg -n 'git fetch' scripts/dev-env/maintenance-cloud.sh
rg -n 'origin/trunk' scripts/dev-env/maintenance-cloud.sh
```

Expected: every command exits 0.

- [ ] **Step 2: Run formatting and lint**

Run:

```bash
npm run format:check
npm run lint
```

Expected: both commands exit 0.

- [ ] **Step 3: Run fast lane**

Run:

```bash
npm test
```

Expected: all fast-lane test files pass.

- [ ] **Step 4: Verify commit attribution**

Run:

```bash
git log --oneline -3
```

Expected: recent commits for this branch include `[#976]`.

- [ ] **Step 5: Commit any verification-only doc adjustments**

If verification required small docs/script adjustments, run:

```bash
git add scripts/dev-env docs/guides/cloud-development-environments.md README.md CLAUDE.md docs/introduction/README.md docs/introduction/install-and-setup.md
git commit -m "[#976] fix(cloud): align environment verification"
```

Expected: commit succeeds if there are changes; skip this step if `git status --short` is clean.

## Self-Review

- Spec coverage: Tasks 1-3 cover setup scripts, maintenance refresh, Codex/Claude workflow docs, network/secrets expectations, and Node 22/Node 25 runtime policy.
- Placeholder scan: this plan contains no `TBD` or `TODO` placeholders.
- Type/signature consistency: shell script paths and verification command paths match the issue AC `vc-list` commands.
