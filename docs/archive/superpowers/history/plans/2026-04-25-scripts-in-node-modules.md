# Scripts-in-node_modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop copying runtime scripts into the target project during `install`; execute them directly from `node_modules`, writing only Claude config files to the project.

**Architecture:** The install command writes a thin hook stub and Claude skill files into `.claude/`, patches `settings.json` and `.gitignore`, and does nothing else. All `.mjs` and `.sh` scripts remain in the npm package and are referenced via their `node_modules` path. `cmdInit` already knows `PKG_ROOT` — it just needs to use it instead of looking in the target project.

**Tech Stack:** Node.js ESM (`bin/cli.mjs`), bash scripts (`hooks/`, `scripts/gh/`), Markdown (`skill/SKILL.md`)

---

## File Map

| File                                          | Change                                                                                                                                 |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `bin/cli.mjs`                                 | Remove `copyDir`; remove script-copy blocks; replace hook copy with stub writer; add `patchGitignore`; fix `cmdInit` to use `PKG_ROOT` |
| `hooks/task-tracker.sh`                       | Resolve `SCRIPT` relative to the hook file itself (it lives in `node_modules`)                                                         |
| `scripts/gh/move-state.sh`                    | Fix one `task-tracker.mjs` reference to use `node_modules` path                                                                        |
| `skill/SKILL.md`                              | Update 4 script path references                                                                                                        |
| `scripts/task-tracker/tests/install.test.mjs` | New — verifies install output and absence of copied scripts                                                                            |

---

## Task 1: Write failing install test

**Files:**

- Create: `scripts/task-tracker/tests/install.test.mjs`

- [ ] **Step 1: Create the test file**

```js
#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dir, '..', '..', '..', 'bin', 'cli.mjs');

const target = mkdtempSync(path.join(tmpdir(), 'install-test-'));

try {
  await pexec('node', [CLI, 'install', '--target', target]);

  // Skill files copied
  assert.ok(
    existsSync(path.join(target, '.claude', 'skills', 'task', 'SKILL.md')),
    'SKILL.md missing'
  );
  assert.ok(
    existsSync(path.join(target, '.claude', 'skills', 'task', 'DESIGN.md')),
    'DESIGN.md missing'
  );

  // Stub written, not the original hook
  const stub = path.join(target, '.claude', 'hooks', 'task-tracker.sh');
  assert.ok(existsSync(stub), 'hook stub missing');
  const stubContent = readFileSync(stub, 'utf8');
  assert.ok(stubContent.includes('node_modules'), 'stub must reference node_modules');
  assert.ok(
    !stubContent.includes('CLAUDE_PROJECT_DIR'),
    'stub must not reference CLAUDE_PROJECT_DIR'
  );

  // settings.json patched
  const settings = JSON.parse(readFileSync(path.join(target, '.claude', 'settings.json'), 'utf8'));
  assert.ok(
    settings.hooks?.SessionStart?.some((h) => h.command?.includes('task-tracker.sh')),
    'SessionStart hook missing'
  );

  // .gitignore entries written
  const gitignore = readFileSync(path.join(target, '.gitignore'), 'utf8');
  assert.ok(gitignore.includes('.claude/task-tracker-state.json'), 'state gitignore missing');
  assert.ok(gitignore.includes('.claude/task-tracker-queue.json'), 'queue gitignore missing');

  // scripts NOT copied to project
  assert.ok(
    !existsSync(path.join(target, 'scripts', 'task-tracker')),
    'scripts/task-tracker must NOT be copied'
  );
  assert.ok(!existsSync(path.join(target, 'scripts', 'gh')), 'scripts/gh must NOT be copied');

  console.log('install.test.mjs: all assertions passed');
} finally {
  rmSync(target, { recursive: true });
}
```

- [ ] **Step 2: Run to confirm it fails**

```bash
node scripts/task-tracker/tests/install.test.mjs
```

Expected: assertion failure — either `scripts/task-tracker` is found (because the old code still copies it), or `stub must reference node_modules` fails.

---

## Task 2: Fix `hooks/task-tracker.sh`

The hook will live at `node_modules/@burson.kendrick/claude-gh-task-manager/hooks/task-tracker.sh`. It currently resolves `hook-handler.mjs` via `$CLAUDE_PROJECT_DIR/scripts/task-tracker/` — that path won't exist after this change. Use the hook file's own directory instead.

**Files:**

- Modify: `hooks/task-tracker.sh:23-27`

- [ ] **Step 1: Replace the SCRIPT line**

Find:

```bash
SCRIPT="$CLAUDE_PROJECT_DIR/scripts/task-tracker/hook-handler.mjs"
if [ ! -f "$SCRIPT" ]; then
  echo "[task-tracker] handler not found at $SCRIPT — skipping" >&2
  exit 0
fi
```

Replace with:

```bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$SCRIPT_DIR/../scripts/task-tracker/hook-handler.mjs"
if [ ! -f "$SCRIPT" ]; then
  echo "[task-tracker] handler not found at $SCRIPT — skipping" >&2
  exit 0
fi
```

- [ ] **Step 2: Verify the file looks correct**

```bash
grep -n "SCRIPT" hooks/task-tracker.sh
```

Expected output:

```
8:SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
9:SCRIPT="$SCRIPT_DIR/../scripts/task-tracker/hook-handler.mjs"
10:if [ ! -f "$SCRIPT" ]; then
11:  echo "[task-tracker] handler not found at $SCRIPT — skipping" >&2
```

(Line numbers may vary.)

- [ ] **Step 3: Commit**

```bash
git add hooks/task-tracker.sh
git commit -m "fix(hooks): resolve hook-handler.mjs relative to hook file, not CLAUDE_PROJECT_DIR"
```

---

## Task 3: Fix `scripts/gh/move-state.sh`

One line at the bottom calls `task-tracker.mjs` via the project's `scripts/` path.

**Files:**

- Modify: `scripts/gh/move-state.sh:93`

- [ ] **Step 1: Replace the node call**

Find (near the bottom of the file):

```bash
    node "$REPO_ROOT/scripts/task-tracker/task-tracker.mjs" end 2>/dev/null || true
```

Replace with:

```bash
    node "$REPO_ROOT/node_modules/@burson.kendrick/claude-gh-task-manager/scripts/task-tracker/task-tracker.mjs" end 2>/dev/null || true
```

- [ ] **Step 2: Verify**

```bash
grep -n "task-tracker.mjs" scripts/gh/move-state.sh
```

Expected:

```
93:    node "$REPO_ROOT/node_modules/@burson.kendrick/claude-gh-task-manager/scripts/task-tracker/task-tracker.mjs" end 2>/dev/null || true
```

- [ ] **Step 3: Commit**

```bash
git add scripts/gh/move-state.sh
git commit -m "fix(gh): call task-tracker.mjs from node_modules, not project scripts/"
```

---

## Task 4: Update `skill/SKILL.md` path references

Four lines reference `$CLAUDE_PROJECT_DIR/scripts/...`. Update them all.

**Files:**

- Modify: `skill/SKILL.md` lines 33, 55, 78, 83

- [ ] **Step 1: Update the task-tracker CLI invocation (line 33)**

Find:

```
node "$CLAUDE_PROJECT_DIR/scripts/task-tracker/task-tracker.mjs" <verb> [args...]
```

Replace with:

```
node "$CLAUDE_PROJECT_DIR/node_modules/@burson.kendrick/claude-gh-task-manager/scripts/task-tracker/task-tracker.mjs" <verb> [args...]
```

- [ ] **Step 2: Update the three move-state.sh invocations (lines 55, 78, 83)**

Find all occurrences of:

```
"$CLAUDE_PROJECT_DIR/scripts/gh/move-state.sh"
```

Replace with:

```
"$CLAUDE_PROJECT_DIR/node_modules/@burson.kendrick/claude-gh-task-manager/scripts/gh/move-state.sh"
```

- [ ] **Step 3: Verify no old paths remain**

```bash
grep -n 'scripts/' skill/SKILL.md
```

Expected: all lines now contain `node_modules/@burson.kendrick/claude-gh-task-manager/scripts/`.

- [ ] **Step 4: Commit**

```bash
git add skill/SKILL.md
git commit -m "fix(skill): update script paths to reference node_modules"
```

---

## Task 5: Rewrite `bin/cli.mjs`

This is the largest change. Remove script copying, add stub writer, add gitignore patcher, fix `cmdInit`.

**Files:**

- Modify: `bin/cli.mjs`

- [ ] **Step 1: Remove `copyDir` and the two script-copy blocks**

Delete the entire `copyDir` function (lines 28–39).

In `cmdInstall`, delete:

```js
// 4. Scripts — task-tracker
const ttSrc = join(PKG_ROOT, 'scripts', 'task-tracker');
const ttDest = join(targetDir, 'scripts', 'task-tracker');
copyDir(ttSrc, ttDest);
ok(`Scripts:  scripts/task-tracker/`);

// 5. Scripts — gh helpers
const ghSrc = join(PKG_ROOT, 'scripts', 'gh');
const ghDest = join(targetDir, 'scripts', 'gh');
mkdirSync(ghDest, { recursive: true });
for (const f of readdirSync(ghSrc)) {
  const src = join(ghSrc, f);
  const dest = join(ghDest, f);
  // Don't overwrite existing user-customised gh scripts
  if (!existsSync(dest)) {
    copyFileSync(src, dest);
    try {
      execFileSync('chmod', ['+x', dest]);
    } catch {
      /* ignore */
    }
  } else {
    console.log(`  ${dim('○')}  Skipped (exists): scripts/gh/${f}`);
  }
}
ok(`Scripts:  scripts/gh/ (move-state.sh, set-priority.sh, init-project-config.sh)`);
```

Also remove unused imports: `readdirSync`, `statSync` from the `fs` import line.

- [ ] **Step 2: Replace hook copy with stub writer**

Delete:

```js
// 3. Hook
const hookDest = join(targetDir, '.claude', 'hooks');
mkdirSync(hookDest, { recursive: true });
copyFileSync(join(PKG_ROOT, 'hooks', 'task-tracker.sh'), join(hookDest, 'task-tracker.sh'));
// Ensure executable
try {
  execFileSync('chmod', ['+x', join(hookDest, 'task-tracker.sh')]);
} catch {
  /* ignore on Windows */
}
ok(`Hook:     .claude/hooks/task-tracker.sh`);
```

Replace with:

```js
// 3. Hook stub — delegates to node_modules package
const hookDest = join(targetDir, '.claude', 'hooks');
mkdirSync(hookDest, { recursive: true });
const hookStubPath = join(hookDest, 'task-tracker.sh');
const PKG_NAME = '@burson.kendrick/claude-gh-task-manager';
const hookStub = [
  '#!/usr/bin/env bash',
  `# Generated by ${PKG_NAME} install — do not edit.`,
  `PKG="$(cd "$(dirname "$0")/../.." && pwd)/node_modules/${PKG_NAME}"`,
  'exec bash "$PKG/hooks/task-tracker.sh"',
  '',
].join('\n');
writeFileSync(hookStubPath, hookStub, 'utf8');
try {
  execFileSync('chmod', ['+x', hookStubPath]);
} catch {
  /* ignore on Windows */
}
ok(`Hook:     .claude/hooks/task-tracker.sh (stub → node_modules)`);
```

- [ ] **Step 3: Add `patchGitignore` function**

Add this function after `patchSettingsJson`:

```js
function patchGitignore(targetDir) {
  const gitignorePath = join(targetDir, '.gitignore');
  const entries = ['.claude/task-tracker-state.json', '.claude/task-tracker-queue.json'];
  let content = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf8') : '';
  let changed = false;
  for (const entry of entries) {
    if (!content.includes(entry)) {
      content += (content.endsWith('\n') || content === '' ? '' : '\n') + entry + '\n';
      changed = true;
    }
  }
  if (changed) writeFileSync(gitignorePath, content, 'utf8');
}
```

- [ ] **Step 4: Call `patchGitignore` in `cmdInstall`**

After the `patchSettingsJson` call and its `ok(...)` line, add:

```js
patchGitignore(targetDir);
ok(`Gitignore: .claude/task-tracker-state.json, .claude/task-tracker-queue.json`);
```

- [ ] **Step 5: Fix `cmdInit` to use `PKG_ROOT`**

Replace:

```js
const initScript = join(targetDir, 'scripts', 'gh', 'init-project-config.sh');
if (!existsSync(initScript)) {
  err(`init script not found at: ${initScript}`);
  err('Run "npx claude-gh-task-manager install" first.');
  process.exit(1);
}
```

With:

```js
const initScript = join(PKG_ROOT, 'scripts', 'gh', 'init-project-config.sh');
```

(Remove the existence check — the script is always present in the package.)

- [ ] **Step 6: Verify the fs import line only imports what's used**

The updated import should be:

```js
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
```

(`readdirSync` and `statSync` are no longer used.)

- [ ] **Step 7: Commit**

```bash
git add bin/cli.mjs
git commit -m "feat(install): stop copying scripts to project; write hook stub, patch .gitignore"
```

---

## Task 6: Run the install test

- [ ] **Step 1: Run the test**

```bash
node scripts/task-tracker/tests/install.test.mjs
```

Expected:

```
install.test.mjs: all assertions passed
```

- [ ] **Step 2: Run the full test suite**

```bash
node scripts/task-tracker/tests/cli.test.mjs
node scripts/task-tracker/tests/config.test.mjs
node scripts/task-tracker/tests/state.test.mjs
node scripts/task-tracker/tests/queue.test.mjs
node scripts/task-tracker/tests/word-counter.test.mjs
node scripts/task-tracker/tests/active-time.test.mjs
node scripts/task-tracker/tests/gh-timing-comment.test.mjs
```

Expected: all pass with no failures.

- [ ] **Step 3: Commit the test**

```bash
git add scripts/task-tracker/tests/install.test.mjs
git commit -m "test(install): verify install writes stub and does not copy scripts"
```

---

## Task 7: Manual smoke test

- [ ] **Step 1: Create a temp target directory and run install**

```bash
TMPDIR=$(mktemp -d)
node bin/cli.mjs install --target "$TMPDIR"
```

Expected output (approximately):

```
Installing claude-gh-task-manager
  → /tmp/...

  ✓  Skill:    .claude/skills/task/SKILL.md
  ✓  Design:   .claude/skills/task/DESIGN.md
  ✓  Hook:     .claude/hooks/task-tracker.sh (stub → node_modules)
  ✓  Hooks:    registered in .claude/settings.json
  ✓  Gitignore: .claude/task-tracker-state.json, .claude/task-tracker-queue.json

Next step — configure your GitHub project:
  npx claude-gh-task-manager init
```

- [ ] **Step 2: Confirm scripts are absent and stub content is correct**

```bash
ls "$TMPDIR/scripts" 2>&1   # should say "No such file or directory"
cat "$TMPDIR/.claude/hooks/task-tracker.sh"
```

Expected stub:

```bash
#!/usr/bin/env bash
# Generated by @burson.kendrick/claude-gh-task-manager install — do not edit.
PKG="$(cd "$(dirname "$0")/../.." && pwd)/node_modules/@burson.kendrick/claude-gh-task-manager"
exec bash "$PKG/hooks/task-tracker.sh"
```

- [ ] **Step 3: Confirm .gitignore entries**

```bash
cat "$TMPDIR/.gitignore"
```

Expected to contain:

```
.claude/task-tracker-state.json
.claude/task-tracker-queue.json
```

- [ ] **Step 4: Clean up**

```bash
rm -rf "$TMPDIR"
```
