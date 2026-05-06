# Init Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block task commands with a clear error when `repo` is not configured, and warn (non-blocking) when project/board fields are missing.

**Architecture:** A single `checkInit(cfg, verb)` function added to `task-tracker.mjs`, called once in the dispatch IIFE after `checkRepoMismatch()`. Exempt verbs bypass both tiers. Tier 1 exits; Tier 2 warns and continues.

**Tech Stack:** Node.js ESM, existing `loadConfig()` from `config.mjs`

---

### File Map

- Modify: `scripts/task-tracker/task-tracker.mjs` — add `checkInit`, call it in dispatch
- Modify: `scripts/task-tracker/tests/cli.test.mjs` — set `repo` in sandbox config so existing tests survive the new guard; add new tests for uninitialized behavior

---

### Task 1: Write failing tests for uninitialized behavior

**Files:**
- Modify: `scripts/task-tracker/tests/cli.test.mjs`

The new tests must run *without* a repo configured in the sandbox. Append them after the existing `rmSync` cleanup so they use a fresh sandbox. The `pexec` calls are expected to reject (non-zero exit) for blocked verbs.

- [ ] **Step 1: Append the uninitialized tests to cli.test.mjs**

Open `scripts/task-tracker/tests/cli.test.mjs`. Replace the final two lines:

```js
rmSync(sandbox, { recursive: true });
console.log('cli.test.mjs: status/config/end passed');
```

with:

```js
rmSync(sandbox, { recursive: true });

// ---- Uninitialized guard tests ----
const noRepoDirBase = mkdtempSync(path.join(tmpdir(), 'tt-norepo-'));
mkdirSync(path.join(noRepoDirBase, '.ai-task-manager'), { recursive: true });
const noRepoEnv = { ...process.env, AI_TASK_MANAGER_PROJECT_DIR: noRepoDirBase, TT_SKIP_NETWORK: '1' };

// Blocked verbs exit non-zero with "not initialized" on stderr
for (const blockedVerb of ['#42', 'close', 'pause', 'plan', 'new', 'update', 'check', 'log']) {
  try {
    await pexec('node', [CLI, blockedVerb], { env: noRepoEnv });
    assert.fail(`Expected exit(1) for verb: ${blockedVerb}`);
  } catch (err) {
    assert.match(err.stderr, /not initialized/i, `verb "${blockedVerb}" should print "not initialized"`);
  }
}

// Exempt verbs succeed without repo
for (const exemptVerb of ['status', 'config', 'help', '?']) {
  const er = await pexec('node', [CLI, exemptVerb], { env: noRepoEnv });
  assert.ok(er.stdout.length > 0 || er.stderr.length === 0, `exempt verb "${exemptVerb}" should not error`);
}

rmSync(noRepoDirBase, { recursive: true });
console.log('cli.test.mjs: status/config/end passed');
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
cd /Users/kpburson/projects/Vibe-Coding/ai-task-manager
node scripts/task-tracker/tests/cli.test.mjs
```

Expected: the blocked-verb assertions fail because `checkInit` doesn't exist yet — the verbs run without error.

---

### Task 2: Update existing tests to set `repo` in sandbox

Without this, the existing tests (`#107`, `pause`, `start`, etc.) will break once `checkInit` is added in Task 3.

**Files:**
- Modify: `scripts/task-tracker/tests/cli.test.mjs`

- [ ] **Step 1: Add repo config to the existing sandbox setup**

In `cli.test.mjs`, find the sandbox setup block near the top:

```js
const sandbox = mkdtempSync(path.join(tmpdir(), 'tt-cli-'));
mkdirSync(path.join(sandbox, '.claude'), { recursive: true });
const env = { ...process.env, CLAUDE_PROJECT_DIR: sandbox, TT_SKIP_NETWORK: '1' };
```

Replace it with:

```js
import { writeFileSync } from 'node:fs';

const sandbox = mkdtempSync(path.join(tmpdir(), 'tt-cli-'));
mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
writeFileSync(
  path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
  JSON.stringify({ repo: 'test-owner/test-repo' }, null, 2)
);
const env = { ...process.env, AI_TASK_MANAGER_PROJECT_DIR: sandbox, TT_SKIP_NETWORK: '1' };
```

Note: `writeFileSync` is already imported at the top of the file — no new import needed (check the existing imports; if not present, add it to the `import { ... } from 'node:fs'` line).

- [ ] **Step 2: Run existing tests and confirm they still pass**

```bash
node scripts/task-tracker/tests/cli.test.mjs
```

Expected: The existing tests (Tests 1–11) pass. The uninitialized guard tests still fail (no implementation yet).

---

### Task 3: Add `checkInit` to task-tracker.mjs and call it

**Files:**
- Modify: `scripts/task-tracker/task-tracker.mjs`

- [ ] **Step 1: Add the `checkInit` function**

In `task-tracker.mjs`, find the `checkRepoMismatch` function (around line 50). Immediately after its closing brace, add:

```js
const INIT_EXEMPT = new Set(['config', 'help', '?', 'migrate', 'status', 'fleet']);

function checkInit(cfg, verb) {
  if (INIT_EXEMPT.has(verb)) return;
  if (!cfg.repo) {
    process.stderr.write(
      'task-tracker: not initialized — no repo configured.\n' +
      '  npx ai-task-manager init   (recommended — sets up repo, project, and board fields)\n' +
      '  /task config init          (from a Claude session — interactive config interview)\n'
    );
    process.exit(1);
  }
  if (!cfg.projectId || !cfg.kanbanFieldId) {
    process.stderr.write(
      '[task-tracker] Board features unavailable: project not configured (projectId missing).\n' +
      '  Run: npx ai-task-manager init   or   /task config init\n'
    );
  }
}
```

- [ ] **Step 2: Call `checkInit` in the dispatch IIFE**

Find the dispatch block (around line 627):

```js
(async () => {
  checkRepoMismatch();
  try {
```

Change it to:

```js
(async () => {
  checkRepoMismatch();
  checkInit(cfg, verb);
  try {
```

- [ ] **Step 3: Run all tests and confirm everything passes**

```bash
node scripts/task-tracker/tests/cli.test.mjs
```

Expected output ends with: `cli.test.mjs: status/config/end passed`
No assertion errors.

- [ ] **Step 4: Smoke-test manually**

```bash
cd /tmp && mkdir tt-smoke && cd tt-smoke
AI_TASK_MANAGER_PROJECT_DIR=/tmp/tt-smoke node /Users/kpburson/projects/Vibe-Coding/ai-task-manager/scripts/task-tracker/task-tracker.mjs '#1' 2>&1
```

Expected stderr:
```
task-tracker: not initialized — no repo configured.
  npx ai-task-manager init   (recommended — sets up repo, project, and board fields)
  /task config init          (from a Claude session — interactive config interview)
```

```bash
AI_TASK_MANAGER_PROJECT_DIR=/tmp/tt-smoke node /Users/kpburson/projects/Vibe-Coding/ai-task-manager/scripts/task-tracker/task-tracker.mjs status 2>&1
```

Expected: prints status (no block).

```bash
rm -rf /tmp/tt-smoke
```

- [ ] **Step 5: Commit**

```bash
cd /Users/kpburson/projects/Vibe-Coding/ai-task-manager
git add scripts/task-tracker/task-tracker.mjs scripts/task-tracker/tests/cli.test.mjs
git commit -m "feat(init-guard): block task commands until repo is configured, warn if board fields missing"
```
