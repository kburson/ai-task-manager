# Codex Memory Index Hook Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Codex receive the same committed AITM memory-index and install artifacts that Claude receives, so cloned cloud environments do not need interactive install/init.

**Architecture:** Keep one shared `.ai-task-manager/memory/` corpus and one `.ai-task-manager/memory/MEMORY.md` index. Thread the existing `memoryIndexHook` install-time decision into Codex hook installation, and narrow `.gitignore` to exclude only runtime/local artifacts while allowing project-portable Claude/Codex/AITM files to be tracked.

**Tech Stack:** Node.js ESM CLI (`bin/cli.mjs`), `node:test`, JSON hook config files, Markdown docs.

## Global Constraints

- Codex and Claude must share `.ai-task-manager/memory/**` and `.ai-task-manager/memory/MEMORY.md`.
- Codex must register the memory-index hook on `SessionStart` and `PostCompact`, not `PreCompact`.
- `--memory-seed=none` must install no memory-index hook for either provider.
- Cloud workers must inherit committed install/init artifacts and must not need to run interactive `ai-task-manager install` or `aitm init`.
- Keep ignoring `.tmp/`, `node_modules/`, `.ai-task-manager/.cache/`, `.claude/worktrees/`, `.claude/settings.local.json`, and `.claude/scheduled_tasks.lock`.
- Do not blanket-ignore `.claude/` or `.agents/`.

---

## File Structure

- Modify `bin/cli.mjs`: add Codex memory-index hook registration, pass the install-time `memoryIndexHook` flag into Codex install, and update generated `.gitignore` entries.
- Modify `scripts/task-tracker/tests/unit/lib/coverage-cli.test.mjs`: direct helper tests for `patchCodexHooksJson(..., { memoryIndexHook })`.
- Modify `scripts/task-tracker/tests/unit/lib/install.test.mjs`: full installer assertions for memory-seed Codex hooks and `.gitignore` persistence policy.
- Modify `docs/guides/codex-support-matrix.md`: document memory-index hook parity.
- Modify `docs/introduction/install-and-setup.md`: document commit-once install/init workflow and clone-reproducible cloud behavior.
- Regenerate or add project-local install artifacts as needed after code lands: `.codex/hooks.json`, `.agents/skills/task/SKILL.md`, `.claude/settings.json`, `.claude/commands/task.md`, `.claude/skills/task/SKILL.md`, `.ai-task-manager/memory/**`.

---

### Task 1: Codex Memory Hook Wiring

**Files:**
- Modify: `bin/cli.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/coverage-cli.test.mjs`

**Interfaces:**
- Consumes: existing `MEMORY_INDEX_HOOK_CMD`, `hookEntryHasCommand()`, `patchCodexHooksJson(hooksPath)`, and `installCodex(targetDir, linkMode)`.
- Produces: `patchCodexHooksJson(hooksPath, { memoryIndexHook = false } = {})` and `installCodex(targetDir, linkMode, { memoryIndexHook = false } = {})`.

- [ ] **Step 1: Write failing direct tests for Codex memory hook registration**

Add these imports/helpers near the top of `scripts/task-tracker/tests/unit/lib/coverage-cli.test.mjs`, after the existing `const CLI = ...` block:

```js
function flatHookCommands(config, event) {
  return (config.hooks?.[event] ?? []).flatMap((entry) => [
    ...(typeof entry === 'string' ? [entry] : []),
    ...(entry.command ? [entry.command] : []),
    ...(entry.hooks ?? []).map((inner) => inner.command).filter(Boolean),
  ]);
}

function commandCount(config, event, commandPart) {
  return flatHookCommands(config, event).filter((cmd) => cmd.includes(commandPart)).length;
}
```

Add this test after `patchCodexHooksJson creates hooks, is idempotent, tolerates garbage`:

```js
test('patchCodexHooksJson registers memory index hooks only when requested', () => {
  const dir = scratch('cli-codex-memory-');
  const p = join(dir, '.codex', 'hooks.json');

  cli.patchCodexHooksJson(p, { memoryIndexHook: false });
  let config = JSON.parse(readFileSync(p, 'utf8'));
  assert.equal(
    commandCount(config, 'SessionStart', 'hooks/memory-index.mjs'),
    0,
    'no SessionStart memory index hook when seed selection was none'
  );
  assert.equal(
    commandCount(config, 'PostCompact', 'hooks/memory-index.mjs'),
    0,
    'no PostCompact memory index hook when seed selection was none'
  );
  assert.equal(
    commandCount(config, 'PreCompact', 'hooks/memory-index.mjs'),
    0,
    'memory index hook must never register on PreCompact'
  );

  cli.patchCodexHooksJson(p, { memoryIndexHook: true });
  config = JSON.parse(readFileSync(p, 'utf8'));
  assert.equal(
    commandCount(config, 'SessionStart', 'hooks/memory-index.mjs'),
    1,
    'SessionStart memory index hook registered'
  );
  assert.equal(
    commandCount(config, 'PostCompact', 'hooks/memory-index.mjs'),
    1,
    'PostCompact memory index hook registered'
  );
  assert.equal(
    commandCount(config, 'PreCompact', 'hooks/memory-index.mjs'),
    0,
    'PreCompact remains timing-only for memory index'
  );

  cli.patchCodexHooksJson(p, { memoryIndexHook: true });
  config = JSON.parse(readFileSync(p, 'utf8'));
  assert.equal(commandCount(config, 'SessionStart', 'hooks/memory-index.mjs'), 1);
  assert.equal(commandCount(config, 'PostCompact', 'hooks/memory-index.mjs'), 1);
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/coverage-cli.test.mjs
```

Expected: FAIL because `patchCodexHooksJson()` ignores the second argument and does not register `hooks/memory-index.mjs`.

- [ ] **Step 3: Implement Codex memory-index hook wiring**

In `bin/cli.mjs`, change the function signature:

```js
export function patchCodexHooksJson(hooksPath, { memoryIndexHook = false } = {}) {
```

Inside `patchCodexHooksJson()`, after the existing lifecycle timing loop and before `mkdirSync(dirname(hooksPath), ...)`, add:

```js
  if (memoryIndexHook) {
    add('SessionStart', 'startup|resume|clear|compact', MEMORY_INDEX_HOOK_CMD);
    add('PostCompact', 'manual|auto', MEMORY_INDEX_HOOK_CMD);
  }
```

Change `installCodex()` to accept and pass the flag:

```js
function installCodex(targetDir, linkMode, { memoryIndexHook = false } = {}) {
  step('Codex files');
  const skillDest = join(targetDir, getProvider('codex').installTarget);
  if (linkMode === 'symlink') {
    replaceWithSymlink(
      skillDest,
      join(PKG_ROOT, dirname(getProvider('codex').skillAdapterPath)),
      'Skill'
    );
  } else {
    installStub(join(skillDest, 'SKILL.md'), codexStub(), 'Skill');
  }
  if (getProvider('codex').hookCapability) {
    patchCodexHooksJson(join(targetDir, '.codex', 'hooks.json'), { memoryIndexHook });
    ok(`Hooks ${dim('.codex/hooks.json')}`);
  }
}
```

Change the install call in `cmdInstall()`:

```js
  if (agent === 'codex' || agent === 'both') installCodex(targetDir, linkMode, { memoryIndexHook });
```

- [ ] **Step 4: Run focused tests and confirm they pass**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/coverage-cli.test.mjs
node --test scripts/task-tracker/tests/unit/lib/memory-index-hook.test.mjs
```

Expected: PASS. `coverage-cli.test.mjs` confirms Codex hook registration and idempotency. `memory-index-hook.test.mjs` confirms the hook still emits only the shared index for `SessionStart` and `PostCompact`.

- [ ] **Step 5: Commit Task 1**

```bash
git add bin/cli.mjs scripts/task-tracker/tests/unit/lib/coverage-cli.test.mjs
git commit -m "feat(codex): register memory index hook"
```

---

### Task 2: Clone-Reproducible Install Artifact Policy

**Files:**
- Modify: `bin/cli.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/install.test.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: existing `patchGitignore(targetDir)` installer helper.
- Produces: generated `.gitignore` entries that ignore runtime/local files but do not hide stable install artifacts.

- [ ] **Step 1: Write failing installer assertions for `.gitignore` policy**

In `scripts/task-tracker/tests/unit/lib/install.test.mjs`, in the existing `.gitignore entries written` section after the `.tmp/` assertion, add:

```js
  assert.ok(
    gitignoreLines.includes('.ai-task-manager/.cache/'),
    'installer must ignore local AITM cache'
  );
  assert.ok(
    gitignoreLines.includes('.claude/worktrees/'),
    'installer must ignore Claude worktree checkouts'
  );
  assert.ok(
    gitignoreLines.includes('.claude/settings.local.json'),
    'installer must ignore local Claude settings overrides'
  );
  assert.ok(
    gitignoreLines.includes('.claude/scheduled_tasks.lock'),
    'installer must ignore Claude scheduled task lock'
  );
  assert.equal(
    gitignoreLines.includes('.claude/'),
    false,
    'installer must not ignore the whole .claude/ directory'
  );
  assert.equal(
    gitignoreLines.includes('.agents/'),
    false,
    'installer must not ignore the whole .agents/ directory'
  );
```

- [ ] **Step 2: Run the focused installer test and confirm it fails**

Run:

```bash
node scripts/task-tracker/tests/unit/lib/install.test.mjs
```

Expected: FAIL because `patchGitignore()` does not currently emit `.claude/worktrees/`, `.claude/settings.local.json`, or `.claude/scheduled_tasks.lock`.

- [ ] **Step 3: Update generated `.gitignore` entries**

In `bin/cli.mjs`, update `patchGitignore()` entries to:

```js
  const entries = [
    // Machine-local/transient runtime state lives under `.tmp/aitm/`, with
    // project-local caches under `.ai-task-manager/.cache/`. Stable install
    // artifacts in `.ai-task-manager/`, `.claude/`, `.codex/`, and `.agents/`
    // are intentionally trackable so cloud clones inherit the AITM contract.
    '.ai-task-manager/.cache/',
    '.ai-task-manager/templates/*.bak',
    '.ai-task-manager/templates/references/*.bak',
    '.claude/worktrees/',
    '.claude/settings.local.json',
    '.claude/scheduled_tasks.lock',
    '.tmp/',
  ];
```

Change the installer status message near `installTemplates(targetDir)` from:

```js
  ok(`Gitignore ${dim('.ai-task-manager/templates backups and .tmp/ runtime tree')}`);
```

to:

```js
  ok(`Gitignore ${dim('runtime/local artifacts only')}`);
```

- [ ] **Step 4: Update this repo's root `.gitignore` to match the policy**

Replace the existing bottom block that blanket-ignores `.claude/` and `.agents/` with:

```gitignore
# ai-task-manager — local/runtime artifacts (do not commit)
.ai-task-manager/.cache/
.claude/worktrees/
.claude/settings.local.json
.claude/scheduled_tasks.lock

.worktrees/
```

Keep the existing top-level ignores for `node_modules/`, `.tmp/`, coverage, `.aitm/*.json`, and template `.bak` files.

- [ ] **Step 5: Run focused installer tests**

Run:

```bash
node scripts/task-tracker/tests/unit/lib/install.test.mjs
node --test scripts/task-tracker/tests/unit/lib/coverage-cli.test.mjs
```

Expected: PASS. The installer test confirms the generated ignore policy, and the CLI coverage test confirms Codex hook helper behavior is intact.

- [ ] **Step 6: Commit Task 2**

```bash
git add bin/cli.mjs .gitignore scripts/task-tracker/tests/unit/lib/install.test.mjs
git commit -m "fix(install): track portable aitm artifacts"
```

---

### Task 3: Full Install Behavior, Docs, and Repo Artifacts

**Files:**
- Modify: `scripts/task-tracker/tests/unit/lib/install.test.mjs`
- Modify: `docs/guides/codex-support-matrix.md`
- Modify: `docs/introduction/install-and-setup.md`
- Regenerate/track: `.codex/hooks.json`
- Regenerate/track: `.agents/skills/task/SKILL.md`
- Regenerate/track: `.claude/settings.json`
- Regenerate/track: `.claude/commands/task.md`
- Regenerate/track: `.claude/skills/task/SKILL.md`
- Generate/track: `.ai-task-manager/memory/**`

**Interfaces:**
- Consumes: Task 1 Codex memory-index hook plumbing and Task 2 `.gitignore` policy.
- Produces: committed project-portable install artifacts and docs that describe clone-reproducible setup.

- [ ] **Step 1: Write failing full-install assertions for memory seed Codex hooks**

In `scripts/task-tracker/tests/unit/lib/install.test.mjs`, add near the other scratch target declarations:

```js
const memoryTarget = mkdtempSync(path.join(projectScratchDir('test'), 'install-memory-test-'));
const memoryNoneTarget = mkdtempSync(
  path.join(projectScratchDir('test'), 'install-memory-none-test-')
);
```

Add this constant near the other hook constants:

```js
const MEMORY_INDEX_HOOK_CMD = hookBootstrapCommand('scripts/task-tracker/hooks/memory-index.mjs');
```

After the default install assertions, add:

```js
  await pexec('node', [
    CLI,
    'install',
    '--target',
    memoryTarget,
    '--agent',
    'codex',
    '--memory-seed=all',
  ]);
  const memoryCodexHooks = JSON.parse(
    readFileSync(path.join(memoryTarget, '.codex', 'hooks.json'), 'utf8')
  );
  assert.ok(
    hasHookCommand(memoryCodexHooks, 'SessionStart', MEMORY_INDEX_HOOK_CMD),
    'Codex SessionStart memory-index hook missing after memory seed acceptance'
  );
  assert.ok(
    hasHookCommand(memoryCodexHooks, 'PostCompact', MEMORY_INDEX_HOOK_CMD),
    'Codex PostCompact memory-index hook missing after memory seed acceptance'
  );
  assert.equal(
    hasHookCommand(memoryCodexHooks, 'PreCompact', MEMORY_INDEX_HOOK_CMD),
    false,
    'Codex PreCompact must not receive memory-index hook'
  );
  assert.ok(
    existsSync(path.join(memoryTarget, '.ai-task-manager', 'memory', 'MEMORY.md')),
    'accepted memory seed must write shared MEMORY.md index'
  );

  await pexec('node', [
    CLI,
    'install',
    '--target',
    memoryNoneTarget,
    '--agent',
    'codex',
    '--memory-seed=none',
  ]);
  const memoryNoneCodexHooks = JSON.parse(
    readFileSync(path.join(memoryNoneTarget, '.codex', 'hooks.json'), 'utf8')
  );
  assert.equal(
    hasHookCommand(memoryNoneCodexHooks, 'SessionStart', MEMORY_INDEX_HOOK_CMD),
    false,
    'Codex SessionStart memory-index hook must not install when memory seed is none'
  );
  assert.equal(
    existsSync(path.join(memoryNoneTarget, '.ai-task-manager', 'memory', 'MEMORY.md')),
    false,
    'memory seed none must not write shared memory index'
  );
```

- [ ] **Step 2: Run the focused installer test**

Run:

```bash
node scripts/task-tracker/tests/unit/lib/install.test.mjs
```

Expected: PASS after Tasks 1 and 2. If it fails, fix the implementation rather than loosening assertions.

- [ ] **Step 3: Update Codex support docs**

In `docs/guides/codex-support-matrix.md`, add this row to the Enforcement Parity table:

```markdown
| Operational-lessons memory index                         | `SessionStart`, `PostCompact` load `.ai-task-manager/memory/MEMORY.md` only | Same events via `.codex/hooks.json`; shared index and per-fact corpus |
```

Add one paragraph after the table:

```markdown
The memory-index hook emits only `.ai-task-manager/memory/MEMORY.md` as additional context. Both providers share the same accepted per-fact files under `.ai-task-manager/memory/`; neither provider injects the full corpus automatically.
```

- [ ] **Step 4: Update install/setup docs**

In `docs/introduction/install-and-setup.md`, replace the generated paths table rows with:

```markdown
| Path                           | Purpose                                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| `.ai-task-manager/`            | Project config, runtime templates, memory index, Pickup Directive, and Definition of Done      |
| `.claude/skills/task/SKILL.md` | Claude Code task skill shim                                                                    |
| `.agents/skills/task/SKILL.md` | Codex task skill shim                                                                          |
| `.claude/settings.json`        | Claude Code hook and allow-rule configuration when applicable                                  |
| `.codex/hooks.json`            | Codex hook configuration when Codex support is installed                                       |
```

Replace the commit example with:

```bash
git add .ai-task-manager/ .github/ISSUE_TEMPLATE/ .claude/settings.json .claude/commands/task.md .claude/skills/task/SKILL.md .codex/hooks.json .agents/ AGENTS.md CLAUDE.md
git commit -m "chore: add ai-task-manager"
```

Add this paragraph after the commit example:

```markdown
Run `install` and `init` once in a maintainer environment, then commit the project-portable outputs. Ephemeral cloud environments should clone the repository and run normal tool setup such as `npm ci`; they should not rerun the interactive installer or initialize project board metadata.
```

- [ ] **Step 5: Regenerate this repo's install artifacts**

Run:

```bash
node bin/cli.mjs install --agent both --memory-seed=all --codex-superpowers
```

Expected: command exits 0. It should write or refresh `.ai-task-manager/memory/**`, `.claude/settings.json`, `.claude/commands/task.md`, `.claude/skills/task/SKILL.md`, `.codex/hooks.json`, `.agents/skills/task/SKILL.md`, and `AGENTS.md` as needed. It must not create tracked changes for `.claude/settings.local.json`, `.claude/scheduled_tasks.lock`, `.claude/worktrees/`, `.ai-task-manager/.cache/`, `.tmp/`, or `node_modules/`.

- [ ] **Step 6: Inspect artifact scope**

Run:

```bash
git status --short
git check-ignore -v .claude/settings.local.json .claude/scheduled_tasks.lock .claude/worktrees .ai-task-manager/.cache .tmp node_modules || true
git check-ignore -v .claude/settings.json .claude/commands/task.md .claude/skills/task/SKILL.md .codex/hooks.json .agents/skills/task/SKILL.md .ai-task-manager/memory/MEMORY.md || true
```

Expected: runtime/local paths are ignored. Project-portable paths are not ignored and appear as tracked or untracked files ready to commit.

- [ ] **Step 7: Run verification**

Run:

```bash
node scripts/task-tracker/tests/unit/lib/install.test.mjs
node --test scripts/task-tracker/tests/unit/lib/coverage-cli.test.mjs
node --test scripts/task-tracker/tests/unit/lib/memory-index-hook.test.mjs
node scripts/task-tracker/tests/unit/core/codex-support-matrix.test.mjs
```

Expected: PASS for all commands.

- [ ] **Step 8: Commit Task 3**

```bash
git add scripts/task-tracker/tests/unit/lib/install.test.mjs docs/guides/codex-support-matrix.md docs/introduction/install-and-setup.md .ai-task-manager/memory .claude/settings.json .claude/commands/task.md .claude/skills/task/SKILL.md .codex/hooks.json .agents/skills/task/SKILL.md AGENTS.md CLAUDE.md
git commit -m "chore(install): persist clone-ready aitm artifacts"
```
