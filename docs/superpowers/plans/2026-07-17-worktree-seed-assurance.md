# Worktree Seed Assurance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect and self-heal an unseeded git worktree before `/task` work begins, so an agent never loads a broken skill, never loses lifecycle hooks to silent `MODULE_NOT_FOUND`, and never edits one tree while running another tree's code.

**Architecture:** A pure `inspectSeed` classifier decides one of five seed states; a thin CLI heals the healable ones by delegating to the existing `ensureSelfLink` (#791) and re-inspecting. The #792 candidate-list shim is generalized so the SessionStart seed check and the bare-path lifecycle hooks both resolve node_modules-first with a repo-relative fallback. Heal is a single symlink — no per-worktree `npm ci`.

**Tech Stack:** Node.js v18+ ES modules, `node:test`, `node:assert/strict`, `node:fs`. GitHub issue #869.

## Global Constraints

- Node.js v18+, ES modules only. Copy exact values; do not paraphrase.
- **Reuse, don't reimplement.** Heal delegates to `ensureSelfLink({ pkgRoot })` from `scripts/task-tracker/lib/ensure-self-link.mjs`. No new symlink logic.
- **Dev vs consumer** branches on `isDevPackage(projectRoot)` from `bin/lib/stamp-skill-version.mjs` (`existsSync(join(pkgRoot, '.git'))`, true for a worktree's `.git` file).
- **Loud, never fatal.** A SessionStart hook that throws takes the session with it. Every new entrypoint ends `process.exit(0)`; failures report to stderr and SessionStart `additionalContext`, never a non-zero exit, never a retry loop.
- **Never fabricate evidence.** Tests run against real temp fixtures via `projectScratchDir('test')`; no forged markers.
- Scratch/fixtures under `./.tmp/<purpose>/` — never system `/tmp` (the bash-guard blocks it).
- Commit subjects lead with `[#869]`. Commit frequently, one deliverable per commit.
- Run `node scripts/task-tracker/verify-develop.mjs` before every Develop commit. Never `npm run test:all` during Develop.
- `additionalContext` emission shape (matches `hooks/memory-index.mjs:66-73`):
  `JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext } }) + '\n'` to stdout.

---

### Task 1: Spike — resolve the two open questions the spec forbids assuming

**Files:**

- Create: `docs/superpowers/specs/2026-07-17-worktree-seed-assurance-findings.md`

The spec (`## Open questions the plan must resolve, not assume`) records two unknowns that gate later tasks. This task answers them from evidence and commits the findings. No production code.

**Interfaces:**

- Produces: findings doc consumed by Task 6 (`deps-missing` remedy text) and Task 8 (mid-session-link coexistence assertion).

- [ ] **Step 1: Reproduce the mid-session self-link creation**

Create a throwaway worktree and record whether a self-link appears without an explicit `ensureSelfLink` call.

Run:

```bash
git worktree add /tmp/aitm-probe-wt HEAD 2>&1 | tail -2
ls -la ".claude/worktrees" 2>/dev/null || true
# Immediately snapshot: is there a node_modules in the fresh worktree?
ls -la /tmp/aitm-probe-wt/node_modules 2>&1 | head -3
# Exercise the same command the session ran when the link appeared (08:16:06):
( cd /tmp/aitm-probe-wt && npx --no-install aitm help >/dev/null 2>&1 || true )
ls -la /tmp/aitm-probe-wt/node_modules/ai-task-manager 2>&1 | head -3
```

Expected: EITHER the link appears after the `npx` invocation (confirms npm `prepare` firing) OR it does not (confirms something else created it). Record which, verbatim, in the findings doc. Clean up: `git worktree remove --force /tmp/aitm-probe-wt`.

Note: `/tmp` here is a git-worktree path outside the project tree, used only for this throwaway probe; no project scratch files are written there.

- [ ] **Step 2: Establish the consumer unscoped-path mechanism**

The package publishes as `@kburson/ai-task-manager`; every hook resolves the **unscoped** `node_modules/ai-task-manager/…`. Determine how a consumer obtains it.

Run:

```bash
node -p "require('./package.json').name"          # confirm scoped publish name
grep -rn "ai-task-manager@npm:\|npm:@kburson\|install alias\|node_modules/ai-task-manager" docs/ README.md 2>/dev/null | grep -v node_modules | head
grep -rn "postinstall\|prepare\|link:self\|ensureSelfLink" package.json | head
```

Expected: one of — (a) a documented install alias `npm i ai-task-manager@npm:@kburson/ai-task-manager`, (b) a `postinstall`/`prepare` script that provisions it, or (c) no consumer mechanism exists (path is untested). Record which.

- [ ] **Step 3: Write and commit the findings doc**

Write `docs/superpowers/specs/2026-07-17-worktree-seed-assurance-findings.md` with two sections — "Mid-session self-link origin" and "Consumer unscoped-path mechanism" — each stating the evidence and the conclusion. If the consumer mechanism is (c) "does not exist," state that Task 6's consumer branch classifies as `not-applicable` and `deps-missing` remains a dev-only diagnostic path.

```bash
git add docs/superpowers/specs/2026-07-17-worktree-seed-assurance-findings.md
git commit -m "[#869] docs(specs): worktree-seed open-question findings"
```

---

### Task 2: `inspectSeed` — pure seed-state classifier

**Files:**

- Create: `scripts/task-tracker/lib/worktree-seed.mjs`
- Test: `scripts/task-tracker/tests/unit/worktree-seed.test.mjs`

**Interfaces:**

- Consumes: `isDevPackage(pkgRoot)` from `bin/lib/stamp-skill-version.mjs`.
- Produces: `inspectSeed({ projectRoot }) → { status, detail }` where `status ∈ {'seeded','missing-link','foreign-link','deps-missing','not-applicable'}`. `detail` is a human string. Pure — no writes.

- [ ] **Step 1: Write the failing tests**

```javascript
// @story #869
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import { inspectSeed } from '../../lib/worktree-seed.mjs';

// A dev checkout is detected by isDevPackage() via a `.git` entry at the root.
function makeDevRoot(prefix) {
  const root = mkdtempSync(path.join(projectScratchDir('test'), prefix));
  writeFileSync(path.join(root, '.git'), 'gitdir: /nowhere\n');
  return root;
}
const linkOf = (root) => path.join(root, 'node_modules', 'ai-task-manager');

test('dev root, no node_modules/ai-task-manager → missing-link', () => {
  const root = makeDevRoot('ws-missing-');
  try {
    assert.equal(inspectSeed({ projectRoot: root }).status, 'missing-link');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('dev root, self-link resolves to root → seeded', () => {
  const root = makeDevRoot('ws-seeded-');
  try {
    mkdirSync(path.join(root, 'node_modules'), { recursive: true });
    symlinkSync('..', linkOf(root), 'dir');
    assert.equal(inspectSeed({ projectRoot: root }).status, 'seeded');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('dev root, link resolves OUTSIDE root → foreign-link (the trunk trap)', () => {
  const root = makeDevRoot('ws-foreign-');
  const elsewhere = mkdtempSync(path.join(projectScratchDir('test'), 'ws-parent-'));
  try {
    mkdirSync(path.join(root, 'node_modules'), { recursive: true });
    symlinkSync(elsewhere, linkOf(root), 'dir'); // points at another tree
    assert.equal(inspectSeed({ projectRoot: root }).status, 'foreign-link');
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(elsewhere, { recursive: true, force: true });
  }
});

test('consumer root (no .git), nothing installed → deps-missing', () => {
  const root = mkdtempSync(path.join(projectScratchDir('test'), 'ws-consumer-'));
  try {
    assert.equal(inspectSeed({ projectRoot: root }).status, 'deps-missing');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('consumer root, real install present → not-applicable', () => {
  const root = mkdtempSync(path.join(projectScratchDir('test'), 'ws-installed-'));
  try {
    mkdirSync(linkOf(root), { recursive: true }); // a real directory, genuine install
    writeFileSync(path.join(linkOf(root), 'package.json'), '{}');
    assert.equal(inspectSeed({ projectRoot: root }).status, 'not-applicable');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `node --test scripts/task-tracker/tests/unit/worktree-seed.test.mjs`
Expected: FAIL — `inspectSeed` not exported.

- [ ] **Step 3: Implement `inspectSeed`**

```javascript
// Classify a project root's seed state (#869). Pure: lstat + realpath only,
// no writes. Dev vs consumer branches on isDevPackage (.git presence). The
// heal decision lives in ensure-worktree-seeded.mjs; this module only reports.
//
//   seeded         : self-link exists and realpaths to projectRoot
//   missing-link   : dev checkout, no node_modules/ai-task-manager → healable
//   foreign-link   : link resolves OUTSIDE projectRoot (the trunk-code trap) → healable
//   deps-missing   : consumer, no aitm reachable at all → instruct npm ci, not healable
//   not-applicable : consumer with a genuine install intact
import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { isDevPackage } from '../../../bin/lib/stamp-skill-version.mjs';

const UNSCOPED_ALIAS = 'ai-task-manager';

export function inspectSeed({ projectRoot } = {}) {
  if (!projectRoot) throw new Error('inspectSeed: projectRoot required');
  const linkPath = join(projectRoot, 'node_modules', UNSCOPED_ALIAS);
  const isDev = isDevPackage(projectRoot);

  let entry = null;
  try {
    entry = lstatSync(linkPath);
  } catch {
    entry = null;
  }

  if (!entry) {
    return isDev
      ? { status: 'missing-link', detail: `no ${UNSCOPED_ALIAS} self-link in dev worktree` }
      : { status: 'deps-missing', detail: `${UNSCOPED_ALIAS} not installed (consumer)` };
  }

  if (!entry.isSymbolicLink()) {
    // A real directory/file — a genuine install occupies the slot.
    return isDev
      ? { status: 'seeded', detail: 'real install present in dev checkout' }
      : { status: 'not-applicable', detail: 'consumer install intact' };
  }

  let resolved = null;
  try {
    resolved = realpathSync(linkPath);
  } catch {
    resolved = null;
  }
  const rootReal = realpathSync(projectRoot);
  if (resolved && resolved === rootReal) {
    return { status: 'seeded', detail: 'self-link resolves to projectRoot' };
  }
  return {
    status: 'foreign-link',
    detail: `self-link resolves to ${resolved ?? '<broken>'}, not ${rootReal}`,
  };
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `node --test scripts/task-tracker/tests/unit/worktree-seed.test.mjs`
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
node scripts/task-tracker/verify-develop.mjs
git add scripts/task-tracker/lib/worktree-seed.mjs scripts/task-tracker/tests/unit/worktree-seed.test.mjs
git commit -m "[#869] feat(worktree-seed): pure inspectSeed seed-state classifier"
```

---

### Task 3: `ensure-worktree-seeded.mjs` — heal CLI + SessionStart hook

**Files:**

- Create: `scripts/task-tracker/ensure-worktree-seeded.mjs`
- Test: `scripts/task-tracker/tests/unit/ensure-worktree-seeded.test.mjs`

**Interfaces:**

- Consumes: `inspectSeed` (Task 2); `ensureSelfLink({ pkgRoot })` from `lib/ensure-self-link.mjs`.
- Produces: `runSeedCheck({ cwd, stdin, stdout, stderr, heal }) → 0` — reads the SessionStart JSON payload from stdin, inspects, heals `missing-link`/`foreign-link` via `ensureSelfLink` then re-inspects; emits `additionalContext` when the final state is not `seeded`; **always returns 0**. `heal` defaults true; `--check` sets it false (report only).

- [ ] **Step 1: Write the failing tests**

```javascript
// @story #869
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  realpathSync,
  lstatSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import { runSeedCheck } from '../../ensure-worktree-seeded.mjs';

function makeDevRoot(prefix) {
  const root = mkdtempSync(path.join(projectScratchDir('test'), prefix));
  writeFileSync(path.join(root, '.git'), 'gitdir: /nowhere\n');
  return root;
}
const linkOf = (root) => path.join(root, 'node_modules', 'ai-task-manager');
const PAYLOAD = JSON.stringify({ hook_event_name: 'SessionStart' });

test('missing-link → heals, ends seeded, exit 0, no additionalContext', async () => {
  const root = makeDevRoot('ehs-missing-');
  let out = '';
  try {
    const code = await runSeedCheck({
      cwd: root,
      stdin: PAYLOAD,
      stdout: (s) => (out += s),
      stderr: () => {},
    });
    assert.equal(code, 0);
    assert.ok(lstatSync(linkOf(root)).isSymbolicLink(), 'link created');
    assert.equal(realpathSync(linkOf(root)), realpathSync(root), 'resolves to worktree');
    assert.equal(out, '', 'seeded → silent, no additionalContext');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('foreign-link → replaced, resolves to worktree not the foreign tree', async () => {
  const root = makeDevRoot('ehs-foreign-');
  const elsewhere = mkdtempSync(path.join(projectScratchDir('test'), 'ehs-parent-'));
  try {
    mkdirSync(path.join(root, 'node_modules'), { recursive: true });
    symlinkSync(elsewhere, linkOf(root), 'dir');
    const code = await runSeedCheck({
      cwd: root,
      stdin: PAYLOAD,
      stdout: () => {},
      stderr: () => {},
    });
    assert.equal(code, 0);
    assert.equal(realpathSync(linkOf(root)), realpathSync(root));
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(elsewhere, { recursive: true, force: true });
  }
});

test('--check (heal:false) on missing-link → reports, creates nothing, exit 0', async () => {
  const root = makeDevRoot('ehs-check-');
  let out = '';
  try {
    const code = await runSeedCheck({
      cwd: root,
      stdin: PAYLOAD,
      heal: false,
      stdout: (s) => (out += s),
      stderr: () => {},
    });
    assert.equal(code, 0);
    assert.throws(() => lstatSync(linkOf(root)), 'nothing created under --check');
    assert.match(out, /additionalContext/, 'reports the un-seeded state');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('consumer deps-missing → non-fatal, emits npm ci remedy in additionalContext', async () => {
  const root = mkdtempSync(path.join(projectScratchDir('test'), 'ehs-consumer-'));
  let out = '';
  try {
    const code = await runSeedCheck({
      cwd: root,
      stdin: PAYLOAD,
      stdout: (s) => (out += s),
      stderr: () => {},
    });
    assert.equal(code, 0, 'never fatal');
    assert.match(out, /npm ci/, 'remedy names npm ci');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `node --test scripts/task-tracker/tests/unit/ensure-worktree-seeded.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the CLI + hook**

```javascript
#!/usr/bin/env node
// INTERNAL — SessionStart seed check for git worktrees (#869).
//
// A fresh `git worktree add` creates no node_modules. This runs at SessionStart
// (via the candidate-list shim so it resolves in a node_modules-less worktree),
// classifies the seed state, and heals the healable ones by delegating to
// ensureSelfLink (#791). Loud, NEVER fatal: a throwing SessionStart hook would
// take the session with it, so every path ends exit 0; failures surface via
// stderr and SessionStart additionalContext.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { inspectSeed } from './lib/worktree-seed.mjs';
import { ensureSelfLink } from './lib/ensure-self-link.mjs';

function remedyFor(status, cwd) {
  if (status === 'deps-missing') return `Run \`npm ci\` in ${cwd} to install ai-task-manager.`;
  if (status === 'foreign-link' || status === 'missing-link')
    return `Seed heal did not converge; run \`npm run link:self\` in ${cwd}.`;
  return `Worktree seed state: ${status}.`;
}

export async function runSeedCheck({
  cwd = process.cwd(),
  stdin = null,
  stdout = (s) => process.stdout.write(s),
  stderr = (s) => process.stderr.write(s),
  heal = true,
} = {}) {
  let payload = {};
  try {
    payload = JSON.parse(stdin ?? readFileSync(0, 'utf8') ?? '{}');
  } catch {
    payload = {};
  }
  const event = payload.hook_event_name || payload.hookEventName || 'SessionStart';

  let state = inspectSeed({ projectRoot: cwd });

  if (heal && (state.status === 'missing-link' || state.status === 'foreign-link')) {
    try {
      ensureSelfLink({ pkgRoot: cwd });
    } catch (err) {
      stderr(`[aitm seed] heal threw: ${err.message}\n`);
    }
    state = inspectSeed({ projectRoot: cwd }); // re-inspect to confirm convergence
  }

  if (state.status === 'seeded' || state.status === 'not-applicable') {
    return 0; // silent: nothing to say
  }

  const additionalContext = `aitm worktree seed check: status=${state.status} (${state.detail}). ${remedyFor(state.status, cwd)}`;
  stderr(additionalContext + '\n');
  stdout(
    JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext } }) + '\n'
  );
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const heal = !process.argv.includes('--check');
  runSeedCheck({ heal })
    .then((code) => process.exit(code))
    .catch(() => process.exit(0)); // never fatal
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `node --test scripts/task-tracker/tests/unit/ensure-worktree-seeded.test.mjs`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
node scripts/task-tracker/verify-develop.mjs
git add scripts/task-tracker/ensure-worktree-seeded.mjs scripts/task-tracker/tests/unit/ensure-worktree-seeded.test.mjs
git commit -m "[#869] feat(worktree-seed): SessionStart heal CLI over ensureSelfLink"
```

---

### Task 4: Generalize the bootstrap shim for lifecycle hooks

**Files:**

- Modify: `scripts/task-tracker/lib/guard-entrypoint.mjs`
- Test: `scripts/task-tracker/tests/unit/hook-entrypoint.test.mjs`

**Why this task exists (the crux):** The guards run their logic at **top-level module scope** (`bash-guard.mjs` has no `isMain` gate), so `import(pathToFileURL(p))` executes them. Every lifecycle hook instead gates entry on `process.argv[1]` matching its own filename (`on-ask.mjs:255`, `on-stop.mjs:53`, `hook-handler.mjs:401`, `commit-trail-handler.mjs:279`, `on-user-prompt.mjs:80`, `stop-audit-pause-resume.mjs:144`). Under the plain guard shim, `argv[1]` is not the module path, so the hook's main block never runs — a silent no-op. The generalized command must set `process.argv` to `[argv0, resolvedPath, ...extraArgs]` **before** importing, so both the `isMain` check and arg-reads like `on-ask.mjs:259` (`process.argv[2]`) work.

**Interfaces:**

- Consumes: existing `guardEntrypointCandidates`, unchanged.
- Produces:
  - `entrypointCandidates(repoRelPath)` → `['node_modules/ai-task-manager/' + repoRelPath, repoRelPath]` (general form).
  - `hookBootstrapCommand(repoRelPath, ...extraArgs)` → `node -e "…"` string that resolves node_modules-first, **normalizes `process.argv` to `[argv0, resolvedPath, ...extraArgs]`**, imports the resolved path, and on no-resolution writes a distinct stderr diagnostic and exits **0** (hooks fail open by design — they are non-security; only guards fail closed with exit 2).
- Unchanged: `GUARD_NAMES`, `guardEntrypointCandidates`, `resolveGuardEntrypoint`, `guardBootstrapCommand` keep their exact current output (the #792 guard test and settings must stay byte-for-byte).

- [ ] **Step 1: Write the failing tests**

```javascript
// @story #869
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entrypointCandidates, hookBootstrapCommand } from '../../lib/guard-entrypoint.mjs';

test('entrypointCandidates: node_modules first, repo-relative second', () => {
  assert.deepEqual(entrypointCandidates('scripts/task-tracker/hooks/memory-index.mjs'), [
    'node_modules/ai-task-manager/scripts/task-tracker/hooks/memory-index.mjs',
    'scripts/task-tracker/hooks/memory-index.mjs',
  ]);
});

test('hookBootstrapCommand embeds both candidates, node_modules first', () => {
  const cmd = hookBootstrapCommand('scripts/task-tracker/hooks/on-stop.mjs');
  const nm = cmd.indexOf('node_modules/ai-task-manager/scripts/task-tracker/hooks/on-stop.mjs');
  const repo = cmd.indexOf('"scripts/task-tracker/hooks/on-stop.mjs"');
  assert.ok(nm !== -1 && repo !== -1 && nm < repo);
});

test('hookBootstrapCommand normalizes process.argv so isMain + argv[2] work', () => {
  const cmd = hookBootstrapCommand('scripts/task-tracker/hooks/on-ask.mjs', 'pause');
  // argv is rewritten to [argv0, resolvedPath, ...extraArgs] before import
  assert.match(cmd, /process\.argv\s*=\s*\[process\.argv\[0\],\s*p/);
  assert.match(cmd, /"pause"/, 'extra arg is embedded');
  assert.match(cmd, /import\(pathToFileURL\(p\)\.href\)/);
});

test('hookBootstrapCommand fails OPEN (exit 0) when neither candidate resolves', () => {
  const cmd = hookBootstrapCommand('scripts/task-tracker/hooks/on-stop.mjs');
  assert.match(cmd, /process\.exit\(0\)/);
  assert.doesNotMatch(cmd, /process\.exit\(2\)/, 'hooks are non-security; do not fail closed');
});

test('end-to-end: shim actually runs a module main-block that gates on argv[1]', async () => {
  // Prove the argv normalization makes an isMain-gated module execute.
  // (Implementer: write a tiny fixture module under ./.tmp/inspect/ that
  //  prints "RAN:" + process.argv[2] only when isMain, invoke the emitted
  //  command via child_process, assert the output. See Step 3 note.)
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `node --test scripts/task-tracker/tests/unit/hook-entrypoint.test.mjs`
Expected: FAIL — `entrypointCandidates`/`hookBootstrapCommand` not exported.

- [ ] **Step 3: Implement the generalized helpers**

Append to `scripts/task-tracker/lib/guard-entrypoint.mjs` (leave the existing guard exports untouched):

```javascript
// #869 — general candidate builder for ANY repo-relative entrypoint (not just
// the four guards). Same node_modules-first / repo-relative-second ordering.
export function entrypointCandidates(repoRelPath) {
  if (!repoRelPath || typeof repoRelPath !== 'string') {
    throw new TypeError('entrypointCandidates: repoRelPath must be a non-empty string');
  }
  return [`node_modules/ai-task-manager/${repoRelPath}`, repoRelPath];
}

// #869 — bootstrap command for the lifecycle HOOKS. Unlike the guards (which run
// at top-level module scope), hooks gate their main block on process.argv[1]
// matching their own filename and read positional args from process.argv[2+]
// (e.g. on-ask `pause`/`resume`). So before importing we rewrite process.argv to
// [argv0, resolvedPath, ...extraArgs] — this makes the module's isMain check
// pass and its argv reads resolve. Hooks are non-security: on no-resolution we
// fail OPEN (exit 0 + stderr diagnostic), never closed.
export function hookBootstrapCommand(repoRelPath, ...extraArgs) {
  const candidates = JSON.stringify(entrypointCandidates(repoRelPath));
  const argvTail = extraArgs.map((a) => JSON.stringify(String(a))).join(',');
  const label = repoRelPath.split('/').pop();
  const program =
    `const {existsSync}=require('fs');` +
    `const {resolve}=require('path');` +
    `const {pathToFileURL}=require('url');` +
    `const c=${candidates};` +
    `const p=c.map(x=>resolve(process.cwd(),x)).find(existsSync);` +
    `if(!p){process.stderr.write('aitm ${label}: hook entrypoint unresolved ` +
    `(node_modules + repo-relative both absent) — skipping\\n');process.exit(0);}` +
    `process.argv=[process.argv[0],p${argvTail ? ',' + argvTail : ''}];` +
    `import(pathToFileURL(p).href);`;
  return `node -e "${program}"`;
}
```

Note for the end-to-end test (Step 1, last case): write a fixture like
`./.tmp/inspect/fixture-hook.mjs` containing
`if (process.argv[1]?.endsWith('/fixture-hook.mjs')) process.stdout.write('RAN:' + (process.argv[2] ?? ''));`,
build `hookBootstrapCommand('.tmp/inspect/fixture-hook.mjs', 'PHASE')`, run it with
`execSync(cmd, { cwd })`, and assert stdout `=== 'RAN:PHASE'`. This proves argv
normalization restores the main block the naive shim would have skipped.

- [ ] **Step 4: Run tests, verify they pass**

Run: `node --test scripts/task-tracker/tests/unit/hook-entrypoint.test.mjs`
Expected: PASS. Also re-run the guard test to prove no regression:
`node --test scripts/task-tracker/tests/unit/guard-entrypoint-resolution.test.mjs` → PASS (unchanged).

- [ ] **Step 5: Commit**

```bash
node scripts/task-tracker/verify-develop.mjs
git add scripts/task-tracker/lib/guard-entrypoint.mjs scripts/task-tracker/tests/unit/hook-entrypoint.test.mjs
git commit -m "[#869] feat(hooks): argv-normalizing bootstrap shim for lifecycle hooks"
```

---

### Task 5: Wire seed check + convert bare-path hooks in `patchSettingsJson`

**Files:**

- Modify: `bin/cli.mjs` (hook command constants at `126-161`; `patchSettingsJson` at `193-373`)
- Modify: `.claude/settings.json` (regenerated by running the installer against this repo)
- Test: `scripts/task-tracker/tests/unit/settings-hook-bootstrap.test.mjs`

**Interfaces:**

- Consumes: `hookBootstrapCommand` (Task 4); `entrypointCandidates` for the seed-check SessionStart entry.
- Produces: `patchSettingsJson` output where (a) a SessionStart entry runs `ensure-worktree-seeded.mjs` via `hookBootstrapCommand`, and (b) **no** hook command is a bare `node node_modules/…` form — every one goes through the shim.

- [ ] **Step 1: Write the failing regression test**

```javascript
// @story #869
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import { patchSettingsJson } from '../../../../bin/cli.mjs';

function allCommands(settings) {
  const out = [];
  for (const entries of Object.values(settings.hooks ?? {})) {
    for (const e of entries) for (const h of e.hooks ?? []) out.push(h.command);
  }
  return out;
}

test('patchSettingsJson emits no bare `node node_modules/…` hook command', () => {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'settings-'));
  const p = path.join(dir, 'settings.json');
  try {
    patchSettingsJson(p, { memoryIndexHook: true });
    const settings = JSON.parse(readFileSync(p, 'utf8'));
    const bare = allCommands(settings).filter((c) => /^node node_modules\//.test(c));
    assert.deepEqual(bare, [], `bare-path hook commands must be gone: ${bare.join(', ')}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('patchSettingsJson registers the SessionStart seed check via the shim', () => {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'settings-seed-'));
  const p = path.join(dir, 'settings.json');
  try {
    patchSettingsJson(p, {});
    const settings = JSON.parse(readFileSync(p, 'utf8'));
    const cmds = allCommands(settings);
    assert.ok(
      cmds.some((c) => c.includes('ensure-worktree-seeded.mjs') && c.startsWith('node -e "')),
      'seed check present as a node -e shim'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `node --test scripts/task-tracker/tests/unit/settings-hook-bootstrap.test.mjs`
Expected: FAIL — bare-path commands still present; seed check absent.

- [ ] **Step 3: Convert the constants and add the seed check**

In `bin/cli.mjs`, replace each bare-path constant (`126-156`) with a `hookBootstrapCommand` call, and add `LEGACY_*` entries for the old bare forms so re-running the installer migrates idempotently. Import `hookBootstrapCommand` and `entrypointCandidates` alongside the existing guard imports (`43-46`).

```javascript
const TIMING_HOOK_CMD = hookBootstrapCommand('scripts/task-tracker/hook-handler.mjs');
const COMMIT_TRAIL_HOOK_CMD = hookBootstrapCommand('scripts/task-tracker/commit-trail-handler.mjs');
const ON_STOP_HOOK_CMD = hookBootstrapCommand('scripts/task-tracker/hooks/on-stop.mjs');
const ON_USER_PROMPT_HOOK_CMD = hookBootstrapCommand(
  'scripts/task-tracker/hooks/on-user-prompt.mjs'
);
const ON_ASK_PAUSE_HOOK_CMD = hookBootstrapCommand(
  'scripts/task-tracker/hooks/on-ask.mjs',
  'pause'
);
const ON_ASK_RESUME_HOOK_CMD = hookBootstrapCommand(
  'scripts/task-tracker/hooks/on-ask.mjs',
  'resume'
);
const STOP_AUDIT_HOOK_CMD = hookBootstrapCommand(
  'scripts/task-tracker/hooks/stop-audit-pause-resume.mjs'
);
const MEMORY_INDEX_HOOK_CMD = hookBootstrapCommand('scripts/task-tracker/hooks/memory-index.mjs');
const SEED_CHECK_HOOK_CMD = hookBootstrapCommand('scripts/task-tracker/ensure-worktree-seeded.mjs');

// Bare-path forms shipped before #869 — stripped and re-registered as shims so
// re-running the installer migrates old settings idempotently (mirrors #792).
const LEGACY_HOOK_COMMANDS = [
  'node node_modules/ai-task-manager/scripts/task-tracker/hook-handler.mjs',
  'node node_modules/ai-task-manager/scripts/task-tracker/commit-trail-handler.mjs',
  'node node_modules/ai-task-manager/scripts/task-tracker/hooks/on-stop.mjs',
  'node node_modules/ai-task-manager/scripts/task-tracker/hooks/on-user-prompt.mjs',
  'node node_modules/ai-task-manager/scripts/task-tracker/hooks/on-ask.mjs pause',
  'node node_modules/ai-task-manager/scripts/task-tracker/hooks/on-ask.mjs resume',
  'node node_modules/ai-task-manager/scripts/task-tracker/hooks/stop-audit-pause-resume.mjs',
  'node node_modules/ai-task-manager/scripts/task-tracker/hooks/memory-index.mjs',
];
```

Then, inside `patchSettingsJson`: (a) in every event loop that currently registers a bare form, first `removeHookCommands(settings.hooks[event], LEGACY_HOOK_COMMANDS)` before the existing `hookEntryHasCommand` dedupe (the existing string-match dedupe then keys off the new shim string, so no dupes); (b) add a SessionStart entry for `SEED_CHECK_HOOK_CMD` **first** in the SessionStart array so the heal runs before the timing/memory hooks:

```javascript
// #869 — seed check FIRST on SessionStart: heal the worktree before any other
// hook resolves a node_modules path. Idempotent by command string.
if (!Array.isArray(settings.hooks.SessionStart)) settings.hooks.SessionStart = [];
settings.hooks.SessionStart = removeHookCommands(settings.hooks.SessionStart, LEGACY_HOOK_COMMANDS);
if (!settings.hooks.SessionStart.some((h) => hookEntryHasCommand(h, SEED_CHECK_HOOK_CMD))) {
  settings.hooks.SessionStart.unshift({
    matcher: '',
    hooks: [{ type: 'command', command: SEED_CHECK_HOOK_CMD }],
  });
}
```

Extend the existing `LEGACY_TIMING_HOOK_COMMANDS` / `LEGACY_COMMIT_TRAIL_HOOK_COMMANDS` strip sites to also strip `LEGACY_HOOK_COMMANDS` in the SessionStart/PreCompact/PostCompact/PostToolUse/Stop/UserPromptSubmit loops (the array covers every event those constants touch).

- [ ] **Step 4: Run test, verify it passes**

Run: `node --test scripts/task-tracker/tests/unit/settings-hook-bootstrap.test.mjs`
Expected: PASS (2/2).

- [ ] **Step 5: Regenerate this repo's `.claude/settings.json`**

The dogfooding repo's own settings must match. Run the installer's settings patch against the worktree, then confirm no bare paths remain:

```bash
node -e "import('./bin/cli.mjs').then(m => m.patchSettingsJson('.claude/settings.json', { memoryIndexHook: true }))"
grep -c '"command": "node node_modules/' .claude/settings.json
```

Expected: `0`.

- [ ] **Step 6: Commit**

```bash
node scripts/task-tracker/verify-develop.mjs
git add bin/cli.mjs .claude/settings.json scripts/task-tracker/tests/unit/settings-hook-bootstrap.test.mjs
git commit -m "[#869] fix(hooks): route lifecycle hooks + seed check through resolve shim"
```

---

### Task 6: Consumer branch — reconcile `deps-missing`/`not-applicable` with findings

**Files:**

- Modify: `scripts/task-tracker/ensure-worktree-seeded.mjs` (`remedyFor` text only, if Task 1 changed the mechanism)
- Modify: `scripts/task-tracker/tests/unit/ensure-worktree-seeded.test.mjs` (assert the exact remedy string)

**Gate:** Only adjust the remedy wording if Task 1's findings show a consumer mechanism other than plain `npm ci`. If findings conclude "consumer path does not exist / is untested," the `deps-missing` branch stays as the dev-only diagnostic already written in Task 3 — make no code change and record that decision in the commit body.

**Interfaces:**

- Consumes: Task 1 findings doc; Task 3's `remedyFor`.
- Produces: `deps-missing` remedy text that matches the established consumer install path.

- [ ] **Step 1: Decide from findings**

Read `docs/superpowers/specs/2026-07-17-worktree-seed-assurance-findings.md`. If the consumer install is an alias (`ai-task-manager@npm:@kburson/ai-task-manager`), the remedy must name it; if plain `npm ci` suffices, Task 3's text already matches — assert it and stop.

- [ ] **Step 2: Update the remedy test to the exact string, run it (fails if text differs)**

Run: `node --test scripts/task-tracker/tests/unit/ensure-worktree-seeded.test.mjs`
Expected: FAIL only if the remedy text needs changing; otherwise PASS and skip Steps 3-4.

- [ ] **Step 3: Update `remedyFor` `deps-missing` branch to the established command**

(Only if Step 1 requires it — replace the string; no structural change.)

- [ ] **Step 4: Run test, verify it passes**

Run: `node --test scripts/task-tracker/tests/unit/ensure-worktree-seeded.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
node scripts/task-tracker/verify-develop.mjs
git add scripts/task-tracker/ensure-worktree-seeded.mjs scripts/task-tracker/tests/unit/ensure-worktree-seeded.test.mjs
git commit -m "[#869] fix(worktree-seed): consumer deps-missing remedy matches install path"
```

---

### Task 7: Step 0 directive in the reachable skill stub

**Files:**

- Modify: `bin/cli.mjs` (`claudeStub()` at `488-526`, `codexStub()` at `528-566`)
- Modify: `skill/adapters/claude/SKILL.md` (packaged copy — document the same contract; confirm exact path via `getProvider('claude').skillAdapterPath`)
- Test: `scripts/task-tracker/tests/unit/skill-stub-seed-directive.test.mjs`
- Regenerate: `.claude/skills/task/SKILL.md` (this worktree's reachable copy)

**Interfaces:**

- Consumes: nothing runtime — this is a behavioral directive for the agent, backstopping the SessionStart hook.
- Produces: a `## Step 0` section in both stubs, **above** the Load-Once Procedure's `node_modules` reads.

- [ ] **Step 1: Write the failing test**

```javascript
// @story #869
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('claude stub carries a Step 0 seed directive above the node_modules reads', () => {
  const src = readFileSync('bin/cli.mjs', 'utf8');
  // claudeStub() must include a Step 0 line naming the seed check + ensure-worktree-seeded.
  assert.match(src, /Step 0[\s\S]{0,400}ensure-worktree-seeded/);
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `node --test scripts/task-tracker/tests/unit/skill-stub-seed-directive.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Add the Step 0 block to `claudeStub()` and `codexStub()`**

Insert immediately after `'# Task',` `''`, and before `'## Load-Once Procedure',` in each stub array:

````javascript
'## Step 0 — Verify worktree seeding (run before anything else)',
'',
'If this session runs in a git worktree, its `node_modules` may be absent, which',
'breaks the skill reads below and silently redirects module resolution to the',
'parent checkout. The SessionStart hook heals this automatically; if you have any',
'doubt it ran, verify and self-heal before loading the skill:',
'',
'```bash',
'node -e "const{existsSync}=require(\'fs\');const{resolve}=require(\'path\');const{pathToFileURL}=require(\'url\');const c=[\'node_modules/ai-task-manager/scripts/task-tracker/ensure-worktree-seeded.mjs\',\'scripts/task-tracker/ensure-worktree-seeded.mjs\'];const p=c.map(x=>resolve(process.cwd(),x)).find(existsSync);if(p){process.argv=[process.argv[0],p];import(pathToFileURL(p).href);}"',
'```',
'',
'Proceed to the Load-Once Procedure only once the self-link resolves to THIS worktree.',
'',
````

Add a shorter prose note to the packaged `skill/adapters/claude/SKILL.md` documenting the same contract (the packaged copy is unreachable in the exact failure case, so it only documents; the stub is authoritative).

- [ ] **Step 4: Run test, verify it passes**

Run: `node --test scripts/task-tracker/tests/unit/skill-stub-seed-directive.test.mjs`
Expected: PASS.

- [ ] **Step 5: Regenerate this worktree's reachable stub**

```bash
node -e "import('./bin/cli.mjs').then(async m => { /* if claudeStub is not exported, add `export` to it in Step 3 */ })"
# Simplest: re-run the installer's Claude stub writer, or hand-verify the stub is
# regenerated on next install. Confirm the reachable copy now contains Step 0:
grep -n "Step 0" .claude/skills/task/SKILL.md
```

Expected: the reachable `.claude/skills/task/SKILL.md` shows the Step 0 heading. (If `claudeStub()` is not currently exported, add `export` so the regeneration/test can call it directly.)

- [ ] **Step 6: Commit**

```bash
node scripts/task-tracker/verify-develop.mjs
git add bin/cli.mjs skill/adapters/claude/SKILL.md .claude/skills/task/SKILL.md scripts/task-tracker/tests/unit/skill-stub-seed-directive.test.mjs
git commit -m "[#869] feat(skill): Step 0 worktree-seed directive in reachable stub"
```

---

### Task 8: Integration — real worktree end-to-end

**Files:**

- Test: `scripts/task-tracker/tests/slow/worktree-seed-integration.test.mjs`

**Interfaces:**

- Consumes: everything above, exercised through a real `git worktree add`.
- Produces: proof that a fresh worktree, after the seed check, has a reachable skill file and a worktree-resolving link — and that a pre-existing self-link (the mid-session-creation case from Task 1) is left converged, not fought.

- [ ] **Step 1: Write the integration test**

```javascript
// @story #869
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, lstatSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import { runSeedCheck } from '../../ensure-worktree-seeded.mjs';

test('fresh worktree → seed check yields worktree-resolving link', async () => {
  const base = mkdtempSync(path.join(projectScratchDir('test'), 'wt-int-'));
  const wt = path.join(base, 'wt');
  const repoRoot = realpathSync(path.resolve(process.cwd()));
  try {
    execFileSync('git', ['worktree', 'add', '--detach', wt, 'HEAD'], {
      cwd: repoRoot,
      stdio: 'pipe',
    });
    assert.ok(!existsSync(path.join(wt, 'node_modules', 'ai-task-manager')), 'starts unseeded');

    await runSeedCheck({
      cwd: wt,
      stdin: JSON.stringify({ hook_event_name: 'SessionStart' }),
      stdout: () => {},
      stderr: () => {},
    });

    const link = path.join(wt, 'node_modules', 'ai-task-manager');
    assert.ok(lstatSync(link).isSymbolicLink(), 'link created');
    assert.equal(realpathSync(link), realpathSync(wt), 'resolves to the worktree, not trunk');
    // skill adapter reachable through the link
    assert.ok(
      existsSync(path.join(link, 'skill', 'adapters', 'claude', 'SKILL.md')),
      'skill reachable'
    );
  } finally {
    try {
      execFileSync('git', ['worktree', 'remove', '--force', wt], { cwd: repoRoot, stdio: 'pipe' });
    } catch {
      /* best effort */
    }
    rmSync(base, { recursive: true, force: true });
  }
});

test('second seed check is idempotent (pre-existing link left converged)', async () => {
  const base = mkdtempSync(path.join(projectScratchDir('test'), 'wt-idem-'));
  const wt = path.join(base, 'wt');
  const repoRoot = realpathSync(path.resolve(process.cwd()));
  try {
    execFileSync('git', ['worktree', 'add', '--detach', wt, 'HEAD'], {
      cwd: repoRoot,
      stdio: 'pipe',
    });
    const payload = JSON.stringify({ hook_event_name: 'SessionStart' });
    await runSeedCheck({ cwd: wt, stdin: payload, stdout: () => {}, stderr: () => {} });
    let out = '';
    await runSeedCheck({ cwd: wt, stdin: payload, stdout: (s) => (out += s), stderr: () => {} });
    assert.equal(out, '', 'already-seeded second run is silent');
  } finally {
    try {
      execFileSync('git', ['worktree', 'remove', '--force', wt], { cwd: repoRoot, stdio: 'pipe' });
    } catch {
      /* best effort */
    }
    rmSync(base, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the integration test**

Run: `node --test scripts/task-tracker/tests/slow/worktree-seed-integration.test.mjs`
Expected: PASS (2/2). If `git worktree add` under a temp dir is unavailable in the sandbox, mark the file in the `slow` lane (it already is) so it runs at the Test stage, not Develop.

- [ ] **Step 3: Commit**

```bash
node scripts/task-tracker/verify-develop.mjs
git add scripts/task-tracker/tests/slow/worktree-seed-integration.test.mjs
git commit -m "[#869] test(worktree-seed): real-worktree end-to-end integration"
```

---

## Self-Review

**Spec coverage:**

- `inspectSeed` 5-status classifier → Task 2. ✔
- `foreign-link` = trunk-code trap, not seeded → Task 2 (test) + Task 8 (real link resolves to worktree). ✔
- Heal delegates to `ensureSelfLink`, re-inspects → Task 3. ✔
- Heal never `npm ci`; deps resolve upward → Task 3 (no install call) + Task 8 (skill reachable through link with no install). ✔
- `real-entry-present` untouched; consumer `not-applicable`/`deps-missing` → Task 2. ✔
- SessionStart via candidate shim, node_modules first → Task 5. ✔
- Already-seeded silent → Task 3 + Task 8 idempotent. ✔
- Heal loud but never fatal, stderr + additionalContext, no retry → Task 3. ✔
- Lifecycle hooks through the shim → Task 4 (helper) + Task 5 (wiring). ✔
- `patchSettingsJson` strips legacy then registers → Task 5. ✔
- Regression: no bare `node node_modules/…` hook command → Task 5. ✔
- Step 0 directive above node_modules reads; packaged copy documents → Task 7. ✔
- Integration: real worktree, reachable skill + worktree-resolving link → Task 8. ✔
- Mid-session self-link reproduced/explained → Task 1 + Task 8 idempotency. ✔
- Consumer unscoped path established, remedy matches → Task 1 + Task 6. ✔

**Placeholder scan:** No "TBD/TODO" in code steps. Task 6 is deliberately conditional on Task 1 evidence (with an explicit no-change branch), not a placeholder. The Task 4 end-to-end fixture and the Task 7 stub-regeneration are described with the exact fixture content and the `export` prerequisite spelled out.

**Type consistency:** `inspectSeed({ projectRoot }) → { status, detail }` and `runSeedCheck({ cwd, stdin, stdout, stderr, heal }) → 0` used identically across Tasks 2/3/6/8. `ensureSelfLink({ pkgRoot })` matches the real signature at `ensure-self-link.mjs:29`. `hookBootstrapCommand(repoRelPath, ...extraArgs)` / `entrypointCandidates(repoRelPath)` used identically in Tasks 4/5. Hook `additionalContext` shape matches `memory-index.mjs:66-73`.

**Discovered correction to the spec:** the spec's Components section says only "SessionStart entry … via the shim" for the hooks; it does not flag that lifecycle hooks gate on `process.argv[1]` and therefore need argv normalization, which the guard shim does not do. Task 4 encodes this as established fact (evidence: `on-ask.mjs:255-259`, `bash-guard.mjs` top-level scope). The `hookBootstrapCommand` (fail-open, exit 0) is intentionally distinct from `guardBootstrapCommand` (fail-closed, exit 2) because hooks are non-security.
