# Codex Local Worktree Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable, tested Codex local-worktree bootstrap that preserves
AITM dogfooding and export the complete desktop setup procedure to Markdown.

**Architecture:** A Node verifier owns the environment contract and emits
actionable diagnostics. A small Bash script owns dependency installation and
delegates validation to that verifier. A guide owns the app navigation and
operator workflow without relying on an undocumented Codex configuration file
schema.

**Tech Stack:** Node.js 22+, ECMAScript modules, Node test runner, Bash, npm,
Git, GitHub CLI, jq, Markdown.

## Global Constraints

- Node.js 22 or newer is required; Node.js 25 is preferred.
- Use `npm ci` for dependency installation.
- Preserve `node_modules/ai-task-manager -> ..` as a link to the current
  worktree.
- Do not copy `node_modules`, `.tmp/aitm`, or active task state between
  worktrees.
- Do not bind an issue or run tests from the automatic setup script.
- Do not hand-author an undocumented Codex local-environment configuration
  schema.

---

### Task 1: Environment verifier

**Files:**

- Create:
  `scripts/task-tracker/tests/unit/dev-env/verify-local-worktree.test.mjs`
- Create: `scripts/dev-env/verify-local-worktree.mjs`

**Interfaces:**

- Consumes: a project directory, Node version, and command lookup function.
- Produces:
  `inspectLocalWorktreeEnvironment(options) -> { ok, errors, warnings, details }`
  and a command-line verifier with exit code `0` for a valid environment and
  `1` for contract violations.

- [ ] **Step 1: Write failing verifier tests**

  Cover a valid environment, Node below 22, a missing command, missing tracked
  configuration, and missing/foreign self-links.

- [ ] **Step 2: Run the focused test and verify RED**

  Run:

  ```bash
  node --test scripts/task-tracker/tests/unit/dev-env/verify-local-worktree.test.mjs
  ```

  Expected: failure because
  `scripts/dev-env/verify-local-worktree.mjs` does not exist.

- [ ] **Step 3: Implement the verifier**

  Export `inspectLocalWorktreeEnvironment`, keep filesystem and command lookup
  dependencies injectable, aggregate all errors, and make the CLI print
  actionable diagnostics.

- [ ] **Step 4: Run the focused test and verify GREEN**

  Run the same `node --test` command. Expected: all verifier cases pass.

### Task 2: Local worktree setup entrypoint

**Files:**

- Create: `scripts/dev-env/setup-local-worktree.sh`
- Modify:
  `scripts/task-tracker/tests/unit/dev-env/verify-local-worktree.test.mjs`

**Interfaces:**

- Consumes: the current worktree root and tools on `PATH`.
- Produces: a ready worktree with lockfile dependencies and a verified dogfood
  self-link.

- [ ] **Step 1: Add a failing shell-contract test**

  Assert that the setup script is executable and contains the ordered
  `npm ci`, `npm run link:self`, and verifier invocations without task binding
  or test execution.

- [ ] **Step 2: Run the focused test and verify RED**

  Expected: failure because `setup-local-worktree.sh` does not exist.

- [ ] **Step 3: Implement the setup script**

  Use strict Bash error handling, run installation and self-link repair, invoke
  the verifier, and warn on missing GitHub authentication.

- [ ] **Step 4: Verify GREEN and shell syntax**

  Run:

  ```bash
  node --test scripts/task-tracker/tests/unit/dev-env/verify-local-worktree.test.mjs
  bash -n scripts/dev-env/setup-local-worktree.sh
  ```

### Task 3: Codex desktop runbook

**Files:**

- Create: `docs/guides/codex-local-worktree-environment.md`
- Modify:
  `scripts/task-tracker/tests/unit/dev-env/verify-local-worktree.test.mjs`

**Interfaces:**

- Consumes: the checked-in setup script and Codex desktop local-environment UI.
- Produces: a standalone guide that can be opened beside the Codex settings
  page.

- [ ] **Step 1: Add a failing guide-contract test**

  Assert that the guide names Settings, Local environments, Worktree,
  `scripts/dev-env/setup-local-worktree.sh`, recommended actions, task binding,
  `.worktreeinclude` exclusions, and recovery commands.

- [ ] **Step 2: Run the focused test and verify RED**

  Expected: failure because the guide does not exist.

- [ ] **Step 3: Write the complete navigation guide**

  Include prerequisites, exact setup fields, actions, save/share steps,
  per-cycle workflow, detached-HEAD behavior, troubleshooting, cloud
  separation, and verification.

- [ ] **Step 4: Run focused verification and formatting**

  Run:

  ```bash
  node --test scripts/task-tracker/tests/unit/dev-env/verify-local-worktree.test.mjs
  npm exec prettier -- --check scripts/dev-env/setup-local-worktree.sh \
    scripts/dev-env/verify-local-worktree.mjs \
    scripts/task-tracker/tests/unit/dev-env/verify-local-worktree.test.mjs \
    docs/guides/codex-local-worktree-environment.md
  ```

### Task 4: Repository verification

**Files:**

- Verify all files changed by Tasks 1–3.

**Interfaces:**

- Consumes: the completed local-environment bootstrap and guide.
- Produces: fresh evidence that the change integrates with the repository.

- [ ] **Step 1: Run focused tests and syntax checks**

  ```bash
  node --test scripts/task-tracker/tests/unit/dev-env/verify-local-worktree.test.mjs
  bash -n scripts/dev-env/setup-local-worktree.sh
  node scripts/dev-env/verify-local-worktree.mjs
  ```

- [ ] **Step 2: Run repository checks**

  ```bash
  npm run format:check
  npm run lint
  npm test
  ```

- [ ] **Step 3: Review the delta**

  ```bash
  git status --short
  git diff --check
  git diff --stat
  git diff
  ```

- [ ] **Step 4: Commit as an audited chore if requested**

  ```bash
  git add docs/guides/codex-local-worktree-environment.md \
    docs/superpowers/specs/2026-07-29-codex-local-worktree-environment-design.md \
    docs/superpowers/plans/2026-07-29-codex-local-worktree-environment.md \
    scripts/dev-env/setup-local-worktree.sh \
    scripts/dev-env/verify-local-worktree.mjs \
    scripts/task-tracker/tests/unit/dev-env/verify-local-worktree.test.mjs
  git commit -m "chore: add Codex local worktree environment"
  ```
