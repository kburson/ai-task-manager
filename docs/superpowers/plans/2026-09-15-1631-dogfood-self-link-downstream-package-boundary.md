# #1631 Dogfood Self-Link and Downstream Package Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a packed AITM installation use its real scoped npm location without requesting dogfood-only lifecycle approval, while preserving explicit self-link setup for AITM development worktrees.

**Architecture:** One scoped-first entrypoint resolver generates all downstream hook and guard commands. Consumer task-skill stubs point to the scoped package and omit dogfood seeding, while repository-tracked dogfood files retain explicit source-worktree bootstrap. A real tarball is installed under restrictive npm 12 policy and exercised from the consumer root as the final package-boundary authority.

**Tech Stack:** Node.js 24+, npm 12, ECMAScript modules, `node:test`, GitHub/Codex/Claude/Grok JSON hook installers, repository-local scratch helpers.

**Spec:** `docs/superpowers/specs/2026-09-15-1631-dogfood-self-link-downstream-package-boundary-design.md`

## Global Constraints

- Downstream AITM lives at `node_modules/@kburson/ai-task-manager`; no consumer test may create or rely on `node_modules/ai-task-manager`.
- AITM development worktrees retain `node_modules/ai-task-manager -> ..` through `npm run link:self` and `scripts/dev-env/setup-local-worktree.sh`.
- Remove the published `prepare` lifecycle; retain the explicit `link:self` command.
- Guards remain fail-closed; non-security lifecycle hooks remain fail-open with diagnostics; Grok native guards retain structured denial.
- Preserve user-authored installer settings and idempotently migrate only exact legacy AITM-managed commands.
- Keep every operational CLI, hook, guard, skill, workflow-policy, and preflight file in the packed artifact.
- Use `projectScratchDir('test')`; never use the system temporary directory.
- Do not change workflow-exception semantics delivered by #1628.

---

### Task 1: Establish the Scoped-First Entrypoint Contract

**Files:**

- Modify: `scripts/task-tracker/lib/guard-entrypoint.mjs`
- Modify: `scripts/tests/integration/task-tracker/lib/hook-entrypoint.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/guard-entrypoint-resolution.test.mjs`

**Interfaces:**

- Consumes: a validated repository-relative entrypoint string such as `scripts/task-tracker/hooks/on-stop.mjs`.
- Produces: `entrypointCandidates(repoRelPath) -> [scopedPackagePath, repoRelativePath]`, plus unchanged `guardBootstrapCommand`, `hookBootstrapCommand`, and `failClosedHookBootstrapCommand` command-string APIs.

- [ ] **Step 1: Add scoped-first failing assertions**

Update the story tags to include `#1631` and make the candidate test require the exact scoped path:

```js
assert.deepEqual(entrypointCandidates('scripts/task-tracker/hooks/memory-index.mjs'), [
  'node_modules/@kburson/ai-task-manager/scripts/task-tracker/hooks/memory-index.mjs',
  'scripts/task-tracker/hooks/memory-index.mjs',
]);
```

Update command-order assertions to require the scoped path before the repository-relative candidate and to reject the unscoped string:

```js
const scoped = cmd.indexOf(
  'node_modules/@kburson/ai-task-manager/scripts/task-tracker/hooks/on-stop.mjs'
);
const repo = cmd.indexOf('"scripts/task-tracker/hooks/on-stop.mjs"');
assert.ok(scoped !== -1 && repo !== -1 && scoped < repo);
assert.doesNotMatch(cmd, /node_modules\/ai-task-manager\//);
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
node --test scripts/tests/integration/task-tracker/lib/hook-entrypoint.test.mjs scripts/tests/unit/task-tracker/lib/guard-entrypoint-resolution.test.mjs
```

Expected: failure showing the first candidate is still `node_modules/ai-task-manager/...`.

- [ ] **Step 3: Implement the minimal scoped package constant**

In `guard-entrypoint.mjs`, replace the unscoped candidate construction with one authoritative constant:

```js
export const INSTALLED_PACKAGE_ROOT = 'node_modules/@kburson/ai-task-manager';

export function entrypointCandidates(repoRelPath) {
  if (!repoRelPath || typeof repoRelPath !== 'string') {
    throw new TypeError('entrypointCandidates: repoRelPath must be a non-empty string');
  }
  return [`${INSTALLED_PACKAGE_ROOT}/${repoRelPath}`, repoRelPath];
}
```

Make `guardEntrypointCandidates(name)` delegate to `entrypointCandidates` so guards and hooks cannot drift:

```js
export function guardEntrypointCandidates(name) {
  if (!name || typeof name !== 'string') {
    throw new TypeError('guardEntrypointCandidates: name must be a non-empty string');
  }
  return entrypointCandidates(`scripts/task-tracker/${name}.mjs`);
}
```

Update diagnostics from `node_modules + repo-relative` to `scoped package + repo-relative` without changing exit codes.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the command from Step 2.

Expected: all entrypoint tests pass; guard no-resolution tests still exit 2 and hook no-resolution tests still exit 0.

- [ ] **Step 5: Commit Task 1**

```bash
git add scripts/task-tracker/lib/guard-entrypoint.mjs scripts/tests/integration/task-tracker/lib/hook-entrypoint.test.mjs scripts/tests/unit/task-tracker/lib/guard-entrypoint-resolution.test.mjs
git commit -m "fix(package): resolve installed entrypoints through scoped root [#1631]"
```

---

### Task 2: Generate Scoped Consumer Hooks and Migrate Legacy Commands

**Files:**

- Modify: `bin/cli.mjs`
- Modify: `bin/lib/claude-bash-allowlist.mjs`
- Modify: `scripts/tests/integration/task-tracker/lib/install-hooks.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/install.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/settings-hook-bootstrap.test.mjs`

**Interfaces:**

- Consumes: Task 1's `hookBootstrapCommand`, `guardBootstrapCommand`, and `failClosedHookBootstrapCommand`.
- Produces: generated Claude/Codex/Grok hook JSON containing scoped-first managed commands and no bare unscoped consumer command.

- [ ] **Step 1: Add failing installer assertions**

Add `#1631` story attribution. Require every generated managed command that references AITM runtime bytes to contain the scoped package path or the scoped-first bootstrap payload:

```js
for (const command of managedCommands) {
  assert.doesNotMatch(command, /node_modules\/ai-task-manager\//);
  assert.match(command, /node_modules\/@kburson\/ai-task-manager\//);
}
```

Add a legacy-migration fixture containing exact pre-#1631 unscoped timing, prompt-timestamp, guard, and Grok commands. After two patcher runs, assert each legacy command count is zero, each replacement count is one, and a neighboring `echo user-hook` remains unchanged.

Add an allowlist assertion for:

```js
'Bash(node node_modules/@kburson/ai-task-manager/scripts/**)';
```

- [ ] **Step 2: Run installer tests and verify RED**

Run:

```bash
node --test scripts/tests/integration/task-tracker/lib/install-hooks.test.mjs scripts/tests/unit/task-tracker/lib/install.test.mjs scripts/tests/unit/task-tracker/lib/settings-hook-bootstrap.test.mjs
```

Expected: failures identify the bare Codex prompt-timestamp command, unscoped legacy output, and missing scoped allowlist entry.

- [ ] **Step 3: Route every generated hook through the shared helpers**

Replace the bare Codex prompt-timestamp command:

```js
const CODEX_PROMPT_TIMESTAMP_HOOK_CMD = hookBootstrapCommand(
  'scripts/task-tracker/hooks/codex-prompt-timestamp.mjs'
);
```

Keep Grok generation on `failClosedHookBootstrapCommand`. Remove the downstream `seed` registration from each consumer provider's desired hook set; seeding is a repository worktree concern, not an installed-project concern. Keep exact legacy seed/unscoped strings in removal-only arrays so reinstallation cleans old managed entries.

Extend legacy removal arrays with the exact pre-#1631 prompt-timestamp and Grok forms. Do not use substring deletion.

- [ ] **Step 4: Update the Claude allowlist**

Add the scoped operational entry:

```js
'Bash(node node_modules/@kburson/ai-task-manager/scripts/**)',
```

Keep `Bash(node node_modules/ai-task-manager/scripts/**)` only if a repository-tracked dogfood command still uses it after Task 3. Explain that compatibility scope in the adjacent comment.

- [ ] **Step 5: Run installer tests and verify GREEN**

Run the Step 2 command.

Expected: all tests pass; generated managed paths are scoped; exact legacy commands migrate once; user hooks remain.

- [ ] **Step 6: Commit Task 2**

```bash
git add bin/cli.mjs bin/lib/claude-bash-allowlist.mjs scripts/tests/integration/task-tracker/lib/install-hooks.test.mjs scripts/tests/unit/task-tracker/lib/install.test.mjs scripts/tests/unit/task-tracker/lib/settings-hook-bootstrap.test.mjs
git commit -m "fix(installer): emit scoped provider hook paths [#1631]"
```

---

### Task 3: Separate Consumer Skill Stubs from Dogfood Bootstrap

**Files:**

- Modify: `bin/cli.mjs`
- Modify: `scripts/tests/unit/providers/parity.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/core/skill-stub-seed-directive.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/install.test.mjs`
- Verify without regenerating unless required: `.agents/skills/task/SKILL.md`
- Verify without regenerating unless required: `.codex/hooks.json`

**Interfaces:**

- Consumes: provider adapter paths from `getProvider(name).skillAdapterPath` and the fixed package name `@kburson/ai-task-manager`.
- Produces: `claudeStub()` and `codexStub()` consumer markdown that loads canonical files from the scoped package and contains no development self-link instructions.

- [ ] **Step 1: Write failing consumer-versus-dogfood assertions**

Require installed stubs to contain:

```text
node_modules/@kburson/ai-task-manager/skill/adapters/codex/SKILL.md
node_modules/@kburson/ai-task-manager/skill/shared/SKILL.md
node_modules/@kburson/ai-task-manager/scripts/
```

Require `claudeStub()` and `codexStub()` not to contain `ensure-worktree-seeded`, `link:self`, or `node_modules/ai-task-manager/`. Separately read repository `.agents/skills/task/SKILL.md` and require its explicit Step 0 plus `ensure-worktree-seeded` dogfood bootstrap to remain.

- [ ] **Step 2: Run skill tests and verify RED**

Run:

```bash
node --test scripts/tests/unit/providers/parity.test.mjs scripts/tests/unit/task-tracker/core/skill-stub-seed-directive.test.mjs scripts/tests/unit/task-tracker/lib/install.test.mjs
```

Expected: consumer-stub assertions fail because current generators embed Step 0 and unscoped paths.

- [ ] **Step 3: Implement consumer-only stubs**

Add a small path helper in `bin/cli.mjs`:

```js
const INSTALLED_PACKAGE_ROOT = 'node_modules/@kburson/ai-task-manager';
const installedPackagePath = (repoRelPath) => `${INSTALLED_PACKAGE_ROOT}/${repoRelPath}`;
```

Remove the Step 0 dogfood block from `claudeStub()` and `codexStub()`. Generate adapter, shared-skill, and scripts paths with `installedPackagePath`. Keep load-once sentinel instructions and the `.ai-task-manager/templates/pickup-directive.md` project-local path.

Do not overwrite repository `.agents/skills/task/SKILL.md` or `.codex/hooks.json` with consumer output. If a test assumed generator parity with those dogfood files, split it into explicit consumer-generation and repository-bootstrap assertions.

- [ ] **Step 4: Run skill tests and verify GREEN**

Run the Step 2 command.

Expected: installed stubs are scoped and seed-free; the repository dogfood stub still requires explicit seeding.

- [ ] **Step 5: Commit Task 3**

```bash
git add bin/cli.mjs scripts/tests/unit/providers/parity.test.mjs scripts/tests/unit/task-tracker/core/skill-stub-seed-directive.test.mjs scripts/tests/unit/task-tracker/lib/install.test.mjs
git commit -m "fix(skills): separate consumer paths from dogfood seeding [#1631]"
```

---

### Task 4: Remove the Published Lifecycle and Preserve Explicit Development Setup

**Files:**

- Modify: `package.json`
- Modify: `scripts/tests/integration/dev-env/verify-local-worktree.test.mjs`
- Modify: `docs/guides/codex-local-worktree-environment.md`
- Modify: `docs/guides/parallel-agents.md`
- Modify: `docs/guides/settings-guide.md`

**Interfaces:**

- Consumes: repository setup script `scripts/dev-env/setup-local-worktree.sh` and `npm run link:self`.
- Produces: a package manifest with no `prepare` key and documentation that names explicit dogfood setup separately from scoped consumer runtime.

- [ ] **Step 1: Add failing manifest and setup assertions**

Extend the local-worktree test:

```js
const manifest = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
assert.equal(manifest.scripts.prepare, undefined);
assert.equal(manifest.scripts['link:self'], 'node scripts/task-tracker/ensure-self-link.mjs');
```

Keep the existing order assertions requiring `npm ci`, then `npm run link:self`, then `verify-local-worktree.mjs`.

- [ ] **Step 2: Run the local-worktree test and verify RED**

Run:

```bash
node --test scripts/tests/integration/dev-env/verify-local-worktree.test.mjs
```

Expected: only the `prepare` absence assertion fails.

- [ ] **Step 3: Remove `prepare` and update operational documentation**

Delete only this manifest entry:

```json
"prepare": "node scripts/task-tracker/ensure-self-link.mjs"
```

Retain `link:self`. Update current guides so:

- development worktrees use `./scripts/dev-env/setup-local-worktree.sh` as the complete setup;
- `npm ci` alone is not described as repairing the self-link;
- downstream examples use `node_modules/@kburson/ai-task-manager` where they describe installed files; and
- historical design/review artifacts remain unchanged.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the Step 2 command.

Expected: all local-worktree environment cases pass.

- [ ] **Step 5: Verify an ordinary worktree bootstrap explicitly**

Run:

```bash
npm run link:self
node scripts/dev-env/verify-local-worktree.mjs
```

Expected: self-link already present or created, then `[local-worktree] ready` for the current worktree.

- [ ] **Step 6: Commit Task 4**

```bash
git add package.json scripts/tests/integration/dev-env/verify-local-worktree.test.mjs docs/guides/codex-local-worktree-environment.md docs/guides/parallel-agents.md docs/guides/settings-guide.md
git commit -m "fix(package): remove dogfood prepare lifecycle [#1631]"
```

---

### Task 5: Prove the Real Installed Tarball Boundary

**Files:**

- Create: `scripts/tests/integration/task-tracker/lib/downstream-package-boundary.test.mjs`
- Create: `scripts/tests/integration/task-tracker/lib/package-workflow-exception-smoke.test.mjs`
- Modify if the package surface changes: `scripts/tests/integration/meta/package-test-corpus.test.mjs`
- Modify if the exact entry count changes: `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`
- Modify if required by repository test discovery: `scripts/tests/integration/meta/test-tree-layout.baseline.json`

**Interfaces:**

- Consumes: the real output of `npm pack --json`, current npm executable, `parseNpmPackReport`, `projectScratchDir('test')`, and Task 1-4 installer behavior.
- Produces: one installed consumer fixture and assertions over npm policy output, package layout, generated provider files, CLI execution, and packaged #1628 modules.

- [ ] **Step 1: Write the installed-tarball lifecycle test**

Create a test that packs and installs under `.scratch/test/`:

```js
const sandbox = mkdtempSync(join(projectScratchDir('test'), 'downstream-package-'));
const packDir = join(sandbox, 'pack');
const consumerDir = join(sandbox, 'consumer');
mkdirSync(packDir, { recursive: true });
mkdirSync(consumerDir, { recursive: true });

const packed = spawnSync('npm', ['pack', '--json', '--pack-destination', packDir], {
  cwd: PROJECT_ROOT,
  encoding: 'utf8',
  env: { ...process.env, npm_config_loglevel: 'silent' },
});
assert.equal(packed.status, 0, packed.stderr);
const report = parseNpmPackReport(packed.stdout, {
  expectedPackageName: '@kburson/ai-task-manager',
  requireFilename: true,
});
```

Write the consumer manifest with the tarball as a file dependency and an empty policy:

```js
writeFileSync(
  join(consumerDir, 'package.json'),
  JSON.stringify({
    name: 'aitm-downstream-boundary',
    private: true,
    type: 'module',
    dependencies: {
      '@kburson/ai-task-manager': `file:${join(packDir, report.filename)}`,
    },
    allowScripts: {},
  })
);
```

Run `npm install --no-audit --no-fund`, capture both streams, and assert neither stream identifies `@kburson/ai-task-manager` as blocked. Read the installed manifest and assert `scripts.prepare === undefined`. Assert the scoped root exists and `node_modules/ai-task-manager` does not.

- [ ] **Step 2: Extend the test to installed CLI and generated provider surfaces**

Run representative read-only commands through the installed bin:

```js
const aitmBin = join(consumerDir, 'node_modules', '.bin', 'aitm');
const help = spawnSync(aitmBin, ['help'], { cwd: consumerDir, encoding: 'utf8' });
assert.equal(help.status, 0, help.stderr);
assert.match(help.stdout, /AI Task Manager|aitm/i);
```

Run the installed package's `bin/cli.mjs install --target <consumer-project> --agent claude --agent codex`. Parse generated settings and skill files. Assert scoped package paths exist, no unscoped alias is present, and representative generated hook/guard payloads execute from the consumer root with the contractually expected exit status.

- [ ] **Step 3: Write the packaged #1628 smoke test**

Reuse a packed/installed consumer fixture local to the file. Import these exact installed paths with `pathToFileURL`:

```js
const installedRoot = join(consumerDir, 'node_modules', '@kburson', 'ai-task-manager');
const enforcement = await import(
  pathToFileURL(join(installedRoot, 'scripts/task-tracker/lib/workflow-policy/enforcement.mjs'))
);
const preflight = await import(
  pathToFileURL(join(installedRoot, 'scripts/task-tracker/lib/workflow-policy/preflight.mjs'))
);
assert.equal(typeof enforcement.evaluateBoundaryPolicy, 'function');
assert.ok(Object.keys(preflight).length > 0);
```

Before finalizing the assertion names, inspect the actual #1628 exports and assert the exact stable exports rather than using a guessed symbol. The test must fail if either installed file or its transitive import graph is missing.

- [ ] **Step 4: Run both new tests and verify RED before implementation completion**

Run:

```bash
node --test scripts/tests/integration/task-tracker/lib/downstream-package-boundary.test.mjs scripts/tests/integration/task-tracker/lib/package-workflow-exception-smoke.test.mjs
```

Expected before Tasks 1-4: lifecycle or unscoped-path assertions fail. Expected after Tasks 1-4: both files pass.

- [ ] **Step 5: Reconcile only proven package-manifest changes**

Run:

```bash
npm pack --dry-run --json
```

If the entry count changes, update `ENTRY_CEILING` to the exact measured count and document each intentional addition/removal in `package-boundary.test.mjs`; add `#1631` story attribution. Do not add spare headroom. If no count change occurs, leave the ceiling untouched.

Add new integration tests to the test-tree baseline only through the repository's canonical test-layout update workflow if the audit requires it; do not hand-remove unrelated baseline entries.

- [ ] **Step 6: Run package and new integration tests**

Run:

```bash
node --test scripts/tests/integration/task-tracker/lib/downstream-package-boundary.test.mjs scripts/tests/integration/task-tracker/lib/package-workflow-exception-smoke.test.mjs scripts/tests/integration/meta/package-test-corpus.test.mjs scripts/tests/unit/task-tracker/core/package-boundary.test.mjs
```

Expected: all tests pass and the installed consumer has no unscoped alias.

- [ ] **Step 7: Commit Task 5**

```bash
git add scripts/tests/integration/task-tracker/lib/downstream-package-boundary.test.mjs scripts/tests/integration/task-tracker/lib/package-workflow-exception-smoke.test.mjs scripts/tests/integration/meta/package-test-corpus.test.mjs scripts/tests/unit/task-tracker/core/package-boundary.test.mjs scripts/tests/integration/meta/test-tree-layout.baseline.json
git commit -m "test(package): exercise restrictive downstream tarball install [#1631]"
```

Stage only files that changed; omit untouched optional files from `git add`.

---

### Task 6: Align Governed Evidence and Run Exact-SHA Verification

**Files:**

- Modify through governed API: GitHub issue #1631 Verification Command 2
- Modify only if formatting requires it: implementation files from Tasks 1-5

**Interfaces:**

- Consumes: committed implementation SHA and issue #1631's root verification commands.
- Produces: corrected command path, individually stamped acceptance evidence, clean exact-SHA test receipt, review authority, and delivery-ready branch.

- [ ] **Step 1: Correct the stale verification-command path**

Create `.scratch/gh/1631-body-operation.json` with schema `aitm.issue-body-operation/v1` and exact replacement:

```json
{
  "schema": "aitm.issue-body-operation/v1",
  "kind": "replace-exact",
  "expected": "`node --test scripts/dev-env/verify-local-worktree.test.mjs`",
  "replacement": "`node --test scripts/tests/integration/dev-env/verify-local-worktree.test.mjs`"
}
```

Run:

```bash
npx aitm issue-body 1631 --operation-file .scratch/gh/1631-body-operation.json
```

Expected: one exact fresh-base replacement and verified body read-back.

- [ ] **Step 2: Run formatting and repair only actual changes**

Run:

```bash
npm run format:check
```

If red, run `npm run format`, review the diff, and commit only mechanical formatting with `[#1631]` attribution.

- [ ] **Step 3: Run all issue verification commands locally**

Run in this order:

```bash
node --test scripts/tests/integration/task-tracker/lib/downstream-package-boundary.test.mjs
node --test scripts/tests/integration/dev-env/verify-local-worktree.test.mjs
node --test scripts/tests/integration/task-tracker/lib/package-workflow-exception-smoke.test.mjs
npm run lint
npm run format:check
npm test
npm run test:slow
git log --oneline -1
```

Expected: every command exits 0 at the final committed SHA.

- [ ] **Step 4: Stamp each acceptance criterion individually**

For each exact AC label, run:

```bash
npx aitm ac-stamp "<exact acceptance-criterion label>"
```

Review the command output before proceeding to the next label. Never bulk-check or use unverified overrides.

- [ ] **Step 5: Stamp Functional DoD evidence**

Run:

```bash
npx aitm dod-stamp tests
npx aitm dod-stamp lint
npx aitm dod-stamp commits
```

Expected: stamps reference the exact final commit SHA and passing commands.

- [ ] **Step 6: Execute governed Test, Review, delivery, and close**

Run the normal state machine:

```bash
npx aitm test 1631
npx aitm promote 1631
npx aitm review 1631
npx aitm deliver 1631
npx aitm close 1631
```

Follow JIT rule files before each verb. Full-Auto may satisfy configured plan/code/task gates but does not bypass exact-SHA, CI, ownership, worktree, delivery, or peer-review integrity. One initial peer-review attempt and at most one recovery attempt are authorized; stop before a second recovery.

- [ ] **Step 7: Verify final state**

Confirm issue #1631 is closed and in Done, local and remote heads match the delivered SHA, CI is green for that SHA, the worktree is clean, and timing data is flushed.
