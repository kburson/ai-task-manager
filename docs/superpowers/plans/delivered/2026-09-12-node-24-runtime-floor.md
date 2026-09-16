# Node 24 Runtime Floor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require Node.js 24 LTS or newer and prefer Node.js 26 across AITM's live package, CI, setup, and documentation contracts.

**Architecture:** Keep `package.json` as the published runtime authority, mirror it in the root lockfile entry, and run CI on the minimum supported release. Align executable environment guards and current documentation while preserving historical records verbatim.

**Tech Stack:** npm package metadata, GitHub Actions, POSIX shell, Bash, Node.js ESM, `node:test`, Markdown.

## Global Constraints

- The minimum supported runtime is Node.js 24 LTS.
- The preferred development runtime is Node.js 26.
- Node.js 23 and earlier fail environment validation.
- Historical specifications, plans, reviews, evidence, research, and dependency-owned engine declarations remain unchanged.

---

### Task 1: Pin the Package and CI Runtime Contract

**Files:**

- Modify: `scripts/tests/unit/task-tracker/core/ci-actions-node-pins.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: npm's `engines.node` contract and GitHub Actions `node-version` inputs.
- Produces: an exact `>=24` published floor and Node 24 CI baseline.

- [ ] **Step 1: Change the contract test to require `>=24` in both package metadata files and `24` in CI.**

  Parse `package.json` and `package-lock.json`, then assert:

  ```js
  assert.equal(pkg.engines?.node, '>=24');
  assert.equal(lock.packages?.['']?.engines?.node, '>=24');
  ```

  Change every extracted CI `node-version` expectation from `22` to `24`.

- [ ] **Step 2: Run the focused test and confirm it fails against the Node 22 contract.**

  ```bash
  node --test scripts/tests/unit/task-tracker/core/ci-actions-node-pins.test.mjs
  ```

  Expected: failures report actual values `>=22` and `22`.

- [ ] **Step 3: Update only the root package engine entries and both CI pins.**

  Set `package.json` and `packages[""]` in `package-lock.json` to
  `"node": ">=24"`. Set both `.github/workflows/ci.yml` setup-node inputs to
  `node-version: 24`. Do not rewrite dependency-owned engine declarations.

- [ ] **Step 4: Run the focused test and confirm it passes.**

  ```bash
  node --test scripts/tests/unit/task-tracker/core/ci-actions-node-pins.test.mjs
  ```

  Expected: all tests pass.

### Task 2: Align Environment Enforcement and Current Guidance

**Files:**

- Modify: `scripts/tests/integration/dev-env/verify-local-worktree.test.mjs`
- Modify: `scripts/dev-env/setup-local-worktree.sh`
- Modify: `scripts/dev-env/setup-cloud.sh`
- Modify: `scripts/dev-env/verify-local-worktree.mjs`
- Modify: `scripts/lib/self-doc.mjs`
- Modify: `scripts/gh/init-project-config.sh`
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `docs/introduction/README.md`
- Modify: `docs/introduction/install-and-setup.md`
- Modify: `docs/guides/cloud-development-environments.md`
- Modify: `docs/guides/codex-local-worktree-environment.md`
- Modify: `scripts/tests/unit/task-tracker/lib/verification-allowlist.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/core/memory-seed-packaged.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/core/scope-pack.test.mjs`

**Interfaces:**

- Consumes: parsed Node major versions from the active runtime.
- Produces: rejection below 24, preference warnings below 26, and matching operator guidance.

- [ ] **Step 1: Update environment tests to reject Node 23, accept Node 24 with a Node 26 recommendation, and accept Node 26 without warnings.**

  Use the real exported inspector and assert these outcomes:

  ```js
  assert.equal(inspect(projectDir, { nodeVersion: '23.11.1' }).ok, false);
  assert.match(node23.errors.join('\n'), /Node\.js 24 or newer/);
  assert.equal(inspect(projectDir, { nodeVersion: '24.0.0' }).ok, true);
  assert.match(node24.warnings.join('\n'), /Node\.js 26 is preferred/);
  assert.deepEqual(inspect(projectDir, { nodeVersion: '26.0.0' }).warnings, []);
  ```

  Update the help assertion to require `Node.js 24` and add static assertions
  that both setup scripts contain the 24 floor and 26 preference.

- [ ] **Step 2: Run the focused environment test and confirm it fails against the old thresholds.**

  ```bash
  node --test scripts/tests/integration/dev-env/verify-local-worktree.test.mjs
  ```

  Expected: the new Node 24/26 assertions fail while production still uses
  22/25.

- [ ] **Step 3: Change executable checks, self-documentation, current guides, and canonical verification examples to the approved 24/26 policy.**

  Change each live minimum check/message from 22 to 24 and each development
  preference from 25 to 26. Rename the documented Codex environment to
  `AITM Dogfood — Node 26`. Change the missing-Node installation hint to 24+.
  Do not edit `docs/superpowers/**` files other than this design and plan, or
  historical research, memory, and evidence fixtures.

- [ ] **Step 4: Run the focused tests and confirm they pass.**

  ```bash
  node --test scripts/tests/unit/task-tracker/core/ci-actions-node-pins.test.mjs
  node --test scripts/tests/integration/dev-env/verify-local-worktree.test.mjs
  node --test scripts/tests/unit/task-tracker/lib/verification-allowlist.test.mjs
  ```

  Expected: all tests pass.

- [ ] **Step 5: Normalize npm 12 package reports used by packaging tests.**

  Parse both supported report shapes without changing package contents:

  ```js
  const entry = Array.isArray(report)
    ? report[0]
    : (report['@kburson/ai-task-manager'] ?? Object.values(report)[0]);
  ```

  In `package-boundary.test.mjs`, cache the resolved file list so its six
  assertions share one `npm pack --dry-run --json` call.

- [ ] **Step 6: Run all three packaging tests serially.**

  ```bash
  node --test scripts/tests/unit/task-tracker/core/memory-seed-packaged.test.mjs
  node --test scripts/tests/unit/task-tracker/core/scope-pack.test.mjs
  node --test scripts/tests/unit/task-tracker/core/package-boundary.test.mjs
  ```

  Expected: all package-manifest assertions pass under npm 12.

- [ ] **Step 7: Run format, lint, package, and broad test verification; inspect the diff for historical-record changes.**

  ```bash
  npm run format:check
  npm run lint
  npm test
  npm pack --dry-run
  git diff --check
  git diff --stat trunk...HEAD
  ```

  Expected: every command exits zero, and the diff contains only the approved
  live-contract files plus this design and plan.

- [ ] **Step 8: Commit, push `codex/node-24-runtime-floor`, and open a pull request into `trunk`.**

  ```bash
  git add .github/workflows/ci.yml CLAUDE.md README.md package.json package-lock.json \
    scripts/dev-env scripts/gh/init-project-config.sh scripts/lib/self-doc.mjs \
    scripts/tests docs/guides docs/introduction docs/superpowers/plans/2026-09-12-node-24-runtime-floor.md \
    docs/superpowers/specs/2026-09-12-node-24-runtime-floor-design.md
  git commit -m "chore: require Node.js 24 LTS"
  git push -u origin codex/node-24-runtime-floor
  gh pr create --base trunk --head codex/node-24-runtime-floor
  ```

  Expected: the commit succeeds, the remote branch matches local HEAD, and the
  pull request targets `trunk`.
