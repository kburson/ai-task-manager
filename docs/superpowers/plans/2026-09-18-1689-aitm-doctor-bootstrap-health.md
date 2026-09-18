# #1689 AITM Doctor Bootstrap Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `npx aitm doctor` gate that proves a fresh checkout still contains the committed, portable integration produced by an explicit AITM install.

**Architecture:** Move installer ownership knowledge into a pure artifact contract consumed by both install and doctor. The installer publishes a deterministic `.ai-task-manager/install-manifest.json` only after all writes succeed; doctor performs read-only filesystem and Git observation, feeds those observations into a pure evaluator, and renders equivalent human or `aitm.doctor/v1` JSON reports as a standalone `aitm` script.

**Tech Stack:** Node.js 24+ ESM, built-in `node:test`, synchronous filesystem and `git` subprocess probes, existing provider adapters and self-documenting `aitm` registry, GitHub Actions Node 24/26 package-compatibility matrix.

**Spec:** `docs/superpowers/specs/2026-09-18-1689-aitm-doctor-bootstrap-health-design.md`

## Global Constraints

- `npx ai-task-manager install` is the only operation allowed to choose providers or optional bootstrap features and the only operation allowed to create or repair installed artifacts.
- The manifest path and schema are exactly `.ai-task-manager/install-manifest.json` and `aitm.install-manifest/v1`.
- Doctor JSON uses `aitm.doctor/v1` and the closed statuses `ok`, `missing`, `untracked`, `stale`, `modified`, `invalid`, and `unsafe`.
- Doctor exit codes are exactly `0` for healthy, `1` for a completed unhealthy report, and `2` for invalid invocation.
- Doctor must aggregate all safely evaluable rows and must not write files, create caches, acquire AITM locks, bind issues, change timers/state, execute hooks, or access GitHub/network services.
- Manifest and artifact paths are project-relative, normalized, traversal-free, and contained by the project root; host-global Codex files are recorded as feature provenance but never required portable artifacts.
- Repository-scoped Codex bootstrap requires the tracked managed block in project `AGENTS.md`; `~/.codex/skills` and global `~/.codex/AGENTS.md` observations are optional.
- Mixed settings/hook files compare only AITM-owned semantic fragments; unrelated user keys, array entries, formatting, and ordering are preserved and ignored for health.
- Missing legacy manifests fail with explicit reinstall/review/commit guidance; no command or npm lifecycle hook infers or migrates intent.
- The supported runtime floor is Node 24, and packed-consumer behavior must run in the existing Node 24 and Node 26 compatibility matrix.
- Follow TDD for every task and preserve existing CLI exports while moving implementation into focused modules.

## File and Interface Map

| File                                                 | Responsibility                                                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/package/install-content.mjs`                | Canonical provider stub/command text, managed hook fragments, Git-ignore entries, and semantic fragment comparison.             |
| `scripts/package/install-contract.mjs`               | Pure intent normalization, artifact derivation, manifest creation/validation, compatibility digest, and pure health evaluation. |
| `scripts/package/install-inventory.mjs`              | Read-only enumeration of packaged templates/references and canonical file digests.                                              |
| `scripts/package/install-manifest-store.mjs`         | Atomic final manifest publication; no policy decisions.                                                                         |
| `scripts/package/install-observer.mjs`               | Read-only project-root, filesystem, symlink, content, and Git-tracking observations.                                            |
| `scripts/package/doctor.mjs`                         | Argument parsing, self-doc help, report rendering, exit-code mapping, and direct entry point.                                   |
| `scripts/providers/*.mjs`                            | Declarative provider path/contract keys used by install and doctor.                                                             |
| `bin/cli.mjs`                                        | Existing install effects; delegates ownership/content decisions and publishes the final manifest.                               |
| `scripts/lib/self-doc.mjs` / `bin/aitm-registry.mjs` | Standalone `doctor` discovery/routing; no workflow verb.                                                                        |

---

### Task 1: Extract Canonical Installer Content and Provider Ownership

**Files:**

- Create: `scripts/package/install-content.mjs`
- Modify: `scripts/providers/provider-adapter.mjs:1-25`
- Modify: `scripts/providers/claude.mjs:17-27`
- Modify: `scripts/providers/codex.mjs:17-27`
- Modify: `scripts/providers/grok.mjs:13-23`
- Modify: `bin/cli.mjs:255-712,745-1029`
- Modify: `scripts/tests/unit/providers/parity.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/core/skill-stub-seed-directive.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/memory-index-hook.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/settings-hook-bootstrap.test.mjs`
- Modify: `scripts/tests/integration/task-tracker/lib/install-hooks.test.mjs`
- Modify: `scripts/tests/integration/task-tracker/lib/coverage-cli.test.mjs`
- Create: `scripts/tests/unit/package/install-content.test.mjs`

**Interfaces:**

- Consumes: current provider adapter paths, guard/hook bootstrap command builders, and the existing Codex managed-block generator.
- Produces:
  - `renderProviderSkillStub(providerName: string): string`
  - `renderClaudeCommandStub(): string`
  - `managedHookContract(providerName: string, { memoryIndexHook: boolean }): ManagedHookContract`
  - `applyManagedHookContract(providerName: string, current: object, options): object`
  - `matchesManagedHookContract(providerName: string, current: object, options): boolean`
  - `matchesCodexBootstrapBlock(content: string, { scope: 'repo'|'global' }): boolean`
  - `INSTALL_GITIGNORE_ENTRIES: readonly string[]`
  - provider `installRecipe.skillContract`, `hookContract`, and `commandContract` keys.

- [ ] **Step 1: Write failing ownership-contract tests**

Create `install-content.test.mjs` with explicit provider cases:

```js
// @story #1689
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyManagedHookContract,
  matchesManagedHookContract,
  renderClaudeCommandStub,
  renderProviderSkillStub,
} from '../../../package/install-content.mjs';

test('provider content is selected by declarative contract key', () => {
  assert.match(renderProviderSkillStub('claude'), /skill\/adapters\/claude\/SKILL\.md/);
  assert.match(renderProviderSkillStub('codex'), /skill\/adapters\/codex\/SKILL\.md/);
  assert.match(renderProviderSkillStub('grok'), /skill\/adapters\/grok\/SKILL\.md/);
  assert.match(renderClaudeCommandStub(), /Ready for Planning/);
});

test('managed hook comparison ignores unrelated user keys', () => {
  const installed = applyManagedHookContract(
    'codex',
    { userSetting: true },
    {
      memoryIndexHook: false,
    }
  );
  installed.userSetting = 'preserved';
  assert.equal(
    matchesManagedHookContract('codex', installed, {
      memoryIndexHook: false,
    }),
    true
  );
});
```

Extend provider parity to require this exact Claude recipe and equivalent Codex/Grok keys:

```js
assert.deepEqual(claude.installRecipe, {
  writer: 'claude-settings',
  skillContract: 'claude-skill',
  hookTarget: '.claude/settings.json',
  hookContract: 'claude-settings',
  commandTarget: '.claude/commands/task.md',
  commandContract: 'claude-command',
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
node --test \
  scripts/tests/unit/package/install-content.test.mjs \
  scripts/tests/unit/providers/parity.test.mjs
```

Expected: FAIL because the module and adapter keys do not exist.

- [ ] **Step 3: Move canonical content and managed-fragment logic**

Move the current skill-stub and Claude-command generators into `install-content.mjs` byte-for-byte. Move provider hook specifications into pure builders so writing and comparison share command lists:

```js
export function managedHookContract(providerName, { memoryIndexHook = false } = {}) {
  const base = HOOK_CONTRACTS[providerName];
  if (!base) throw new TypeError(`Unknown provider hook contract: ${providerName}`);
  return Object.freeze({
    required: base.required,
    optional: memoryIndexHook ? base.memory : [],
  });
}

export function matchesManagedHookContract(providerName, current, options = {}) {
  const projected = applyManagedHookContract(providerName, current, options);
  return (
    canonicalManagedFragment(providerName, projected, options) ===
    canonicalManagedFragment(providerName, current, options)
  );
}
```

`canonicalManagedFragment` serializes only AITM-owned hook commands/matchers and permission entries. It excludes unknown user keys and entries.

`matchesCodexBootstrapBlock` compares only the marked block returned by
`codexBootstrapBlock({ scope })`; user-authored text before or after the markers
is ignored. Doctor uses `scope: 'repo'` for the required project `AGENTS.md`
artifact. Global scope is never placed in the portable artifact list.

Keep compatibility exports in `bin/cli.mjs`:

```js
export const claudeStub = () => renderProviderSkillStub('claude');
export const codexStub = () => renderProviderSkillStub('codex');
export { applyManagedHookContract, renderProviderSkillStub };
```

Update each patch function to parse the existing file, call `applyManagedHookContract`, and write the result. Preserve malformed-file fallback, legacy-hook removal, idempotency, and user content.

- [ ] **Step 4: Prove byte and semantic parity**

Run:

```bash
node --test \
  scripts/tests/unit/package/install-content.test.mjs \
  scripts/tests/unit/providers/parity.test.mjs \
  scripts/tests/unit/task-tracker/core/skill-stub-seed-directive.test.mjs \
  scripts/tests/unit/task-tracker/lib/memory-index-hook.test.mjs \
  scripts/tests/unit/task-tracker/lib/settings-hook-bootstrap.test.mjs \
  scripts/tests/integration/task-tracker/lib/install-hooks.test.mjs \
  scripts/tests/integration/task-tracker/lib/coverage-cli.test.mjs
```

Expected: PASS. Applying each contract twice is idempotent; toggling memory integration changes only the memory hook.

- [ ] **Step 5: Commit ownership extraction**

```bash
git add bin/cli.mjs scripts/package/install-content.mjs scripts/providers/ \
  scripts/tests/unit/package/install-content.test.mjs \
  scripts/tests/unit/providers/parity.test.mjs \
  scripts/tests/unit/task-tracker/core/skill-stub-seed-directive.test.mjs \
  scripts/tests/unit/task-tracker/lib/memory-index-hook.test.mjs \
  scripts/tests/unit/task-tracker/lib/settings-hook-bootstrap.test.mjs \
  scripts/tests/integration/task-tracker/lib/install-hooks.test.mjs \
  scripts/tests/integration/task-tracker/lib/coverage-cli.test.mjs
git commit -m "[#1689] refactor: share installer ownership contracts"
```

---

### Task 2: Define the Pure Installation and Manifest Contract

**Files:**

- Create: `scripts/package/install-inventory.mjs`
- Create: `scripts/package/install-contract.mjs`
- Modify: `bin/lib/template-manifest.mjs`
- Create: `scripts/tests/unit/package/install-inventory.test.mjs`
- Create: `scripts/tests/unit/package/install-contract.test.mjs`

**Interfaces:**

- Consumes: provider adapters, canonical content from Task 1, `TEMPLATE_FILES`, packaged references/config defaults, selected memory files, and normalized install options.
- Produces:
  - `INSTALL_MANIFEST_PATH = '.ai-task-manager/install-manifest.json'`
  - `INSTALL_MANIFEST_SCHEMA = 'aitm.install-manifest/v1'`
  - `collectPackageInventory(packageRoot: string): PackageInventory`
  - `normalizeInstallIntent(input): InstallIntent`
  - `createInstallContract({ intent, adapters, inventory }): InstallContract`
  - `createInstallManifest({ packageName, packageVersion, contract }): InstallManifest`
  - `parseInstallManifest(value): InstallManifest`
  - `compareManifestContract(manifest, contract): { compatible: boolean, reason?: string }`.

- [ ] **Step 1: Write failing inventory and manifest tests**

Cover provider selection, link modes, feature constraints, ownership, path safety, ordering, and digest stability:

```js
const intent = normalizeInstallIntent({
  providers: ['codex', 'claude', 'codex'],
  linkMode: 'stub',
  features: {
    memoryIndex: false,
    codexSuperpowers: true,
    codexSuperpowersGlobal: false,
  },
  memoryFiles: [],
});
assert.deepEqual(intent.providers, ['claude', 'codex']);

const manifest = createInstallManifest({
  packageName: '@kburson/ai-task-manager',
  packageVersion: '1.2.3',
  contract: createInstallContract({ intent, adapters, inventory }),
});
assert.equal(manifest.schema, 'aitm.install-manifest/v1');
assert.match(manifest.generatedBy.contractDigest, /^[a-f0-9]{64}$/);
assert.deepEqual(
  manifest.artifacts.map(({ id }) => id),
  [...manifest.artifacts.map(({ id }) => id)].sort()
);
```

Reject exact error codes `schema`, `provider`, `feature-combination`, `absolute-path`, `path-traversal`, `duplicate-id`, `duplicate-path-contract`, and `artifact-shape`.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
node --test \
  scripts/tests/unit/package/install-inventory.test.mjs \
  scripts/tests/unit/package/install-contract.test.mjs
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement deterministic package inventory**

Export a sorted recursive reference-file list from `template-manifest.mjs` and implement:

```js
export function collectPackageInventory(packageRoot) {
  return Object.freeze({
    templates: TEMPLATE_FILES.map((name) =>
      exactFile(
        `template.${name}`,
        `.ai-task-manager/templates/${name}`,
        join(packageRoot, 'templates', name)
      )
    ),
    references: referenceTemplateFiles(join(packageRoot, 'templates', 'references')).map((name) =>
      exactFile(
        `reference.${name}`,
        `.ai-task-manager/templates/references/${name}`,
        join(packageRoot, 'templates', 'references', name)
      )
    ),
    configs: CONFIG_ARTIFACTS,
  });
}
```

`exactFile` records a SHA-256 digest. Use `reference` or `managed-fragment` ownership—not exact digests—for `project-fields.json`, `project-field-events.json`, `activity-policy.json`, and user-owned `task-tracker.json` content.

- [ ] **Step 4: Implement pure contract and compatibility digest**

Use this descriptor:

```js
/** @typedef {{
 * id: string,
 * path: string,
 * kind: 'file'|'symlink'|'json-fragment'|'managed-block',
 * ownership: 'generated'|'managed-fragment'|'reference',
 * required: boolean,
 * contract: string,
 * digest?: string
 * }} InstallArtifact */
```

Derive skill paths from `installTarget` and link mode, hook/command paths from `installRecipe`, repo Codex bootstrap from `AGENTS.md`, durable memory paths from `memoryFiles`, and shared assets from inventory. Include the managed `.gitignore` fragment.

Compute `contractDigest` from normalized intent plus sorted descriptors. Exclude package version, absolute roots, timestamps, and host paths. `parseInstallManifest` validates structure/containment; `compareManifestContract` separately marks a valid older contract stale.

- [ ] **Step 5: Verify and commit**

Run:

```bash
node --test \
  scripts/tests/unit/package/install-inventory.test.mjs \
  scripts/tests/unit/package/install-contract.test.mjs \
  scripts/tests/unit/providers/parity.test.mjs
```

Expected: PASS with identical output for reversed input order.

```bash
git add bin/lib/template-manifest.mjs scripts/package/install-inventory.mjs \
  scripts/package/install-contract.mjs \
  scripts/tests/unit/package/install-inventory.test.mjs \
  scripts/tests/unit/package/install-contract.test.mjs
git commit -m "[#1689] feat: define installation manifest contract"
```

---

### Task 3: Publish the Manifest After a Successful Install

**Files:**

- Create: `scripts/package/install-manifest-store.mjs`
- Modify: `bin/cli.mjs:745-761,1570-1709`
- Modify: `bin/lib/memory-seed-install.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/install.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/memory-seed-install-menu.test.mjs`
- Create: `scripts/tests/unit/package/install-manifest-store.test.mjs`
- Create: `scripts/tests/integration/package/install-manifest.test.mjs`

**Interfaces:**

- Consumes: package inventory, normalized intent, and manifest builders from Task 2.
- Produces:
  - `writeInstallManifest(targetDir, manifest, deps?): void`
  - `installMemorySeed(...) -> { count: number, files: string[] }`
  - `runInstall(args, deps?): Promise<{ manifest: InstallManifest }>` for sequencing tests.

- [ ] **Step 1: Write failing atomic-publication and sequencing tests**

Test the store with injected methods:

```js
test('manifest store writes temporary content then renames atomically', () => {
  const calls = [];
  writeInstallManifest('/repo', fixtureManifest(), {
    mkdirSync: (...args) => calls.push(['mkdir', ...args]),
    writeFileSync: (...args) => calls.push(['write', ...args]),
    renameSync: (...args) => calls.push(['rename', ...args]),
    rmSync: (...args) => calls.push(['rm', ...args]),
    pid: 42,
  });
  assert.deepEqual(
    calls.map(([name]) => name),
    ['mkdir', 'write', 'rename']
  );
  assert.match(calls[1][1], /install-manifest\.json\.42\.tmp$/);
  assert.match(calls[2][2], /install-manifest\.json$/);
});
```

Add `runInstall` dependency-order tests asserting provider writes, optional bootstrap, and templates all precede `writeManifest`. Inject a throwing template writer and assert the manifest writer is never called.

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
node --test \
  scripts/tests/unit/package/install-manifest-store.test.mjs \
  scripts/tests/integration/package/install-manifest.test.mjs
```

Expected: FAIL because publication and the injectable orchestrator do not exist.

- [ ] **Step 3: Implement atomic deterministic publication**

Write exactly `${JSON.stringify(manifest, null, 2)}\n` to a sibling temporary path and rename it. On failure, remove only that explicit temporary path with `force: true` and rethrow; never delete or truncate an existing manifest.

Refactor memory installation to preserve selected paths:

```js
return {
  count,
  files: selectedFiles.map((file) => `.ai-task-manager/memory/${file}`).sort(),
};
```

Preserve all current prompts and console copy.

- [ ] **Step 4: Make symlink mode portable or refuse it before publication**

Change `replaceWithSymlink` to receive `targetDir`, prove the package source is contained by the project, and write a relative target:

```js
if (!isPathInside(targetDir, src)) {
  throw new Error(
    '--link-mode symlink requires the installed package to resolve inside the target project; use --link-mode stub'
  );
}
symlinkSync(relative(dirname(dest), src), dest, 'dir');
```

Test a contained package, an external/workspace source refusal, an existing non-symlink refusal, and a relative link resolving to its canonical source.

- [ ] **Step 5: Publish manifest as the final install effect**

Refactor `cmdInstall` around exported `runInstall`. After provider, optional bootstrap, and template writes succeed:

```js
const contract = createInstallContract({
  intent: normalizeInstallIntent({
    providers: selectedNames,
    linkMode,
    features: {
      memoryIndex: memorySeed.count > 0,
      codexSuperpowers: enableCodexSuperpowers,
      codexSuperpowersGlobal: globalCodexSuperpowers,
    },
    memoryFiles: memorySeed.files,
  }),
  adapters: selectedNames.map(getProvider),
  inventory: collectPackageInventory(PKG_ROOT),
});
const manifest = createInstallManifest({
  packageName: PKG_NAME,
  packageVersion: pkg.version,
  contract,
});
writeInstallManifest(targetDir, manifest);
```

Only then print `Install complete`. Repeating the same install must preserve identical manifest bytes.

- [ ] **Step 6: Verify installer variants and failure paths**

Run:

```bash
node --test \
  scripts/tests/unit/package/install-manifest-store.test.mjs \
  scripts/tests/unit/task-tracker/lib/memory-seed-install-menu.test.mjs \
  scripts/tests/unit/task-tracker/lib/install.test.mjs \
  scripts/tests/integration/package/install-manifest.test.mjs
```

Expected: PASS. Integration cases cover Claude-only, Codex repo bootstrap, Grok-only, stub, symlink, and selected-memory manifests.

- [ ] **Step 7: Commit final install publication**

```bash
git add bin/cli.mjs bin/lib/memory-seed-install.mjs \
  scripts/package/install-manifest-store.mjs \
  scripts/tests/unit/package/install-manifest-store.test.mjs \
  scripts/tests/unit/task-tracker/lib/memory-seed-install-menu.test.mjs \
  scripts/tests/unit/task-tracker/lib/install.test.mjs \
  scripts/tests/integration/package/install-manifest.test.mjs
git commit -m "[#1689] feat: publish successful install manifests"
```

---

### Task 4: Build Read-Only Observation and Pure Health Evaluation

**Files:**

- Create: `scripts/package/install-observer.mjs`
- Modify: `scripts/package/install-contract.mjs`
- Create: `scripts/tests/unit/package/install-observer.test.mjs`
- Modify: `scripts/tests/unit/package/install-contract.test.mjs`
- Create: `scripts/tests/integration/package/install-health.test.mjs`

**Interfaces:**

- Consumes: a manifest, current contract, canonical comparators, project/package roots, and local Git output.
- Produces:
  - `resolveDoctorProjectRoot(cwd, deps?): { ok: true, root: string } | { ok: false, details: string }`
  - `observeInstallation({ projectRoot, packageRoot, manifest, contract, deps? }): InstallationObservations`
  - `evaluateInstallation({ projectRoot, manifestResult, contractResult, observations }): DoctorReport`.

- [ ] **Step 1: Write failing observer safety tests**

Use temporary Git repositories to cover existence, tracking, content, and symlink safety:

```js
test('observer distinguishes untracked, modified, and unsafe facts', () => {
  const observed = observeInstallation(fixture);
  assert.equal(observed.byId['provider.codex.skill'].exists, true);
  assert.equal(observed.byId['provider.codex.skill'].tracked, false);
  assert.equal(observed.byId['provider.codex.skill'].contentMatches, false);
  assert.equal(observed.byId['provider.codex.skill'].symlinkSafety, 'unsafe');
});
```

Snapshot recursive files and `git status --porcelain=v1 --untracked-files=all` before/after. Inject an `execFileSync` spy rejecting every Git subcommand except `rev-parse` and `ls-files`.

- [ ] **Step 2: Write the failing evaluator matrix**

Pass synthetic observations for every status and assert exact recovery text. Cover missing/invalid/stale manifest; missing, untracked, and modified artifacts; managed-fragment mismatch; absolute, escaping, broken, and cyclic links; healthy relative links; optional absent `~/.codex` files; and absent Git context. Required unhealthy rows set `healthy: false`; optional rows do not.

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
node --test \
  scripts/tests/unit/package/install-observer.test.mjs \
  scripts/tests/unit/package/install-contract.test.mjs \
  scripts/tests/integration/package/install-health.test.mjs
```

Expected: FAIL because observer/evaluator APIs do not exist.

- [ ] **Step 4: Implement read-only observation**

Resolve root with `git rev-parse --show-toplevel`. Validate paths before joining. Use `lstatSync` before following links; reject absolute targets, cycles, broken targets, and every hop outside the real root.

Use only:

```js
execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' });
execFileSync('git', ['ls-files', '--error-unmatch', '--', artifact.path], {
  cwd: projectRoot,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});
```

Parse JSON as data and call the Task 1 comparator; never execute hooks/configuration.
For `managed-block` artifacts, call `matchesCodexBootstrapBlock` so surrounding
user-authored `AGENTS.md` prose does not affect health.

- [ ] **Step 5: Implement closed-status aggregation**

Add:

```js
export const DOCTOR_SCHEMA = 'aitm.doctor/v1';
export const INSTALL_STATUSES = Object.freeze([
  'ok',
  'missing',
  'untracked',
  'stale',
  'modified',
  'invalid',
  'unsafe',
]);

function check({ id, status, required, details, recovery }) {
  if (!INSTALL_STATUSES.includes(status)) throw new TypeError(`Unknown status: ${status}`);
  return Object.freeze({ id, status, required, details, ...(recovery ? { recovery } : {}) });
}
```

Order context rows (`package.runtime`, `git.repository`, `manifest.*`), artifact rows by ID, then optional host rows. Derive summary counts and `healthy` from required rows. If a manifest is missing/invalid, keep independent rows and omit artifact rows that cannot be derived safely; never infer providers.

- [ ] **Step 6: Verify and commit**

Run:

```bash
node --test \
  scripts/tests/unit/package/install-observer.test.mjs \
  scripts/tests/unit/package/install-contract.test.mjs \
  scripts/tests/integration/package/install-health.test.mjs
```

Expected: PASS with identical filesystem and Git snapshots before/after.

```bash
git add scripts/package/install-observer.mjs scripts/package/install-contract.mjs \
  scripts/tests/unit/package/install-observer.test.mjs \
  scripts/tests/unit/package/install-contract.test.mjs \
  scripts/tests/integration/package/install-health.test.mjs
git commit -m "[#1689] feat: evaluate bootstrap installation health"
```

---

### Task 5: Expose `npx aitm doctor` as a Standalone Command

**Files:**

- Create: `scripts/package/doctor.mjs`
- Modify: `scripts/lib/self-doc.mjs:35-130,270-650`
- Modify: `bin/aitm-registry.mjs:55-105`
- Modify: `scripts/tests/slow/task-tracker/lib/aitm-dispatcher.test.mjs`
- Modify: `scripts/tests/slow/task-tracker/verbs/deadlock-regression.test.mjs:1-42`
- Create: `scripts/tests/unit/package/doctor.test.mjs`
- Create: `scripts/tests/integration/package/doctor-cli.test.mjs`

**Interfaces:**

- Consumes: Task 4 diagnosis and existing self-doc helpers.
- Produces:
  - `parseDoctorArgs(argv): { json: boolean }`
  - `renderDoctorHuman(report): string`
  - `renderDoctorJson(report): string`
  - `runDoctor({ argv, cwd, stdout, stderr, deps? }): number`
  - `npx aitm doctor [--json]` as a routable standalone script.

- [ ] **Step 1: Write failing CLI tests**

```js
test('JSON mode emits one document and maps unhealthy to exit 1', () => {
  let stdout = '';
  let stderr = '';
  const code = runDoctor({
    argv: ['--json'],
    cwd: '/repo',
    stdout: (value) => {
      stdout += value;
    },
    stderr: (value) => {
      stderr += value;
    },
    deps: { diagnose: () => unhealthyFixture() },
  });
  assert.equal(code, 1);
  assert.equal(JSON.parse(stdout).schema, 'aitm.doctor/v1');
  assert.equal(stderr, '');
});
```

Add healthy `0`, invalid/duplicate/valued flag `2`, human/JSON row parity, aggregate failures, optional health, and help `0` cases.

- [ ] **Step 2: Write failing routing/deadlock tests**

```js
assert.equal(kind('doctor'), 'script');
assert.equal(SCRIPTS.doctor.path, 'scripts/package/doctor.mjs');
assert.ok(!VERBS.has('doctor'));
assert.match(aitm(['doctor', 'help']).stdout, /read-only bootstrap health/i);
```

Replace the obsolete deadlock claim with:

```js
test('AC5: doctor is standalone and never a task-tracker verb', () => {
  assert.equal(typeof runReconcile, 'function');
  assert.ok(!existsSync(path.join(VERBS_DIR, 'doctor.mjs')));
  assert.equal(kind('doctor'), 'script');
  assert.equal(SCRIPTS.doctor.path, 'scripts/package/doctor.mjs');
});
```

- [ ] **Step 3: Run command-surface tests and verify failure**

Run:

```bash
node --test \
  scripts/tests/unit/package/doctor.test.mjs \
  scripts/tests/integration/package/doctor-cli.test.mjs \
  scripts/tests/slow/task-tracker/lib/aitm-dispatcher.test.mjs \
  scripts/tests/slow/task-tracker/verbs/deadlock-regression.test.mjs
```

Expected: FAIL because doctor is not registered.

- [ ] **Step 4: Implement CLI without workflow imports**

```js
export function parseDoctorArgs(argv) {
  if (argv.length === 0) return { json: false };
  if (argv.length === 1 && argv[0] === '--json') return { json: true };
  throw new DoctorUsageError('Usage: npx aitm doctor [--json]');
}

export function runDoctor({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  stdout = (value) => process.stdout.write(value),
  stderr = (value) => process.stderr.write(value),
  deps = {},
} = {}) {
  if (wantsHelp(argv)) {
    emitSelfDoc('doctor', stdout);
    return 0;
  }
  try {
    const { json } = parseDoctorArgs(argv);
    const report = (deps.diagnose ?? diagnoseInstallation)({ cwd, deps });
    stdout(json ? renderDoctorJson(report) : renderDoctorHuman(report));
    return report.healthy ? 0 : 1;
  } catch (error) {
    if (error instanceof DoctorUsageError) {
      stderr(`${error.message}\n`);
      return 2;
    }
    throw error;
  }
}
```

Import package-health and self-doc modules only—no task state, locks, GitHub, timing, or verbs. Convert expected inspection failures to rows.

Terminate only when invoked as the entry point:

```js
if (isDirectInvocation(import.meta.url)) {
  process.exit(runDoctor());
}
```

- [ ] **Step 5: Register complete self-documentation**

Add doctor to `ROUTABLE_SELF_DOC`, `ROUTABLE_ARGUMENTS`, and `ROUTABLE_CONTRACTS`: group `Diagnostics`, usage `aitm doctor [--json]`, effect `Reads package, project files, and local Git metadata; writes nothing`, human/JSON output, exits `0/1/2`. Do not add a verb.

- [ ] **Step 6: Verify CLI parity and independence**

The integration test initializes a temporary Git repository, runs install, commits portable outputs, and invokes:

```bash
node bin/aitm.mjs doctor
node bin/aitm.mjs doctor --json
```

Assert normalized human IDs/statuses equal JSON checks, no task state appears, `git status --porcelain=v1` is unchanged, and provider/session environment variables are unnecessary.

Run the Step 3 command again. Expected: PASS.

- [ ] **Step 7: Commit standalone doctor**

```bash
git add scripts/package/doctor.mjs scripts/lib/self-doc.mjs bin/aitm-registry.mjs \
  scripts/tests/unit/package/doctor.test.mjs \
  scripts/tests/integration/package/doctor-cli.test.mjs \
  scripts/tests/slow/task-tracker/lib/aitm-dispatcher.test.mjs \
  scripts/tests/slow/task-tracker/verbs/deadlock-regression.test.mjs
git commit -m "[#1689] feat: add read-only AITM doctor command"
```

---

### Task 6: Prove the Packed Consumer on Node 24 and Node 26

**Files:**

- Create: `scripts/tests/slow/task-tracker/core/packaged-doctor-consumer.test.mjs`
- Modify: `scripts/tests/integration/meta/package-test-corpus.test.mjs:33-60`
- Modify: `.github/workflows/ci.yml:105-135`

**Interfaces:**

- Consumes: tarball runtime, package bins, explicit installer, doctor, Git, and the existing npm/Node matrix.
- Produces: a packed-consumer proof that `npm ci && npx aitm doctor` succeeds from committed outputs and representative drift returns a complete unhealthy report.

- [ ] **Step 1: Write failing package-boundary assertions**

Add:

```js
for (const required of [
  'package/scripts/package/doctor.mjs',
  'package/scripts/package/install-content.mjs',
  'package/scripts/package/install-contract.mjs',
  'package/scripts/package/install-inventory.mjs',
  'package/scripts/package/install-manifest-store.mjs',
  'package/scripts/package/install-observer.mjs',
]) {
  assert.ok(packed.has(required), `npm pack retains required doctor runtime: ${required}`);
}
```

- [ ] **Step 2: Write failing packed-consumer scenario**

Follow `packaged-tail-profile-consumer.test.mjs`:

1. Pack to a scratch directory using `npm pack --json`.
2. Create a consumer with the tarball dev dependency; run `npm install --ignore-scripts` and retain the lockfile.
3. Initialize Git and fixture identity.
4. Run packed `ai-task-manager install --agent codex --link-mode stub --target <consumer>`.
5. Commit package files, manifest, Codex skill/hooks, `.ai-task-manager/**`, and `.gitignore`.
6. Remove `node_modules`; run `npm ci --ignore-scripts`; run `npx --no-install aitm doctor --json`; assert exit `0` and `healthy: true`.
7. Delete the Codex skill and add an unrelated user hook key; assert exit `1`, `provider.codex.skill` is `missing`, and the user key is not modified.
8. Assert the packed package has no `postinstall` and doctor did not recreate the skill.

- [ ] **Step 3: Run packed test and verify failure**

Run:

```bash
node --test scripts/tests/slow/task-tracker/core/packaged-doctor-consumer.test.mjs
```

Expected: FAIL until the packed runtime works end to end.

- [ ] **Step 4: Add the test to the compatibility matrix**

Append the test path to the explicit `node --test` command in `npm-pack-compatibility`. Do not add doctor to the source repository fast lane: the prepared consumer fixture is the authority for selected install intent.

- [ ] **Step 5: Verify packed behavior**

Run:

```bash
node --test \
  scripts/tests/integration/meta/package-test-corpus.test.mjs \
  scripts/tests/slow/task-tracker/core/packaged-doctor-consumer.test.mjs
npm pack --dry-run --json > .scratch/inspect/1689-pack-report.json
node -e "const r=require('./.scratch/inspect/1689-pack-report.json'); const f=new Set(r[0].files.map(x=>x.path)); for (const p of ['scripts/package/doctor.mjs','scripts/package/install-contract.mjs','scripts/package/install-observer.mjs']) if(!f.has(p)) throw new Error('missing '+p)"
```

Expected: PASS locally; GitHub runs the same test under Node 24/npm 11.8.0 and Node 26/npm 12.0.2.

- [ ] **Step 6: Commit package-consumer proof**

```bash
git add .github/workflows/ci.yml \
  scripts/tests/integration/meta/package-test-corpus.test.mjs \
  scripts/tests/slow/task-tracker/core/packaged-doctor-consumer.test.mjs
git commit -m "[#1689] test: prove doctor in packed cloud consumers"
```

---

### Task 7: Document Bootstrap Health and Run Final Verification

**Files:**

- Modify: `README.md:35-60`
- Modify: `docs/introduction/install-and-setup.md:70-105,166-180`
- Modify: `docs/guides/settings-guide.md`
- Modify: `skill/shared/router.md`
- Modify: `scripts/tests/unit/task-tracker/lib/install.test.mjs`
- Modify: `docs/superpowers/plans/2026-09-18-1689-aitm-doctor-bootstrap-health.md`

**Interfaces:**

- Consumes: final command, manifest, migration behavior, and consumer evidence.
- Produces: one consistent contract—explicit install/commit once; `npm ci && npx aitm doctor && npm test` in fresh environments; explicit reinstall for missing/stale manifest.

- [ ] **Step 1: Write failing documentation assertions**

Extend installer tests:

```js
for (const rel of [
  'README.md',
  'docs/introduction/install-and-setup.md',
  'skill/shared/router.md',
]) {
  const text = readFileSync(path.join(ROOT, rel), 'utf8');
  assert.match(text, /npm ci && npx aitm doctor && npm test/, `${rel} has cloud sequence`);
  assert.doesNotMatch(text, /doctor\s+--fix|postinstall.*ai-task-manager install/i);
}
```

Require the setup guide generated-path table to name `.ai-task-manager/install-manifest.json`.

- [ ] **Step 2: Run test and verify failure**

Run: `node --test scripts/tests/unit/task-tracker/lib/install.test.mjs`

Expected: FAIL because docs and installed skill do not name doctor.

- [ ] **Step 3: Update maintainer/cloud/skill guidance**

Use this exact distinction:

```text
Maintainer setup (intent-changing):
  npx ai-task-manager install [selected options]
  review and commit .ai-task-manager/install-manifest.json plus portable outputs

Fresh checkout / cloud CI (read-only verification):
  npm ci && npx aitm doctor && npm test
```

State that missing/stale manifests require explicit install with intended options and that doctor never repairs. Explain repo `AGENTS.md` is portable while `~/.codex` is host-local/optional. Put the installed-skill rule in `skill/shared/router.md` so every provider reaches one canonical instruction.

- [ ] **Step 4: Run focused verification**

Run:

```bash
node --test \
  scripts/tests/unit/package/*.test.mjs \
  scripts/tests/integration/package/*.test.mjs \
  scripts/tests/unit/providers/parity.test.mjs \
  scripts/tests/unit/task-tracker/lib/install.test.mjs \
  scripts/tests/integration/task-tracker/lib/install-hooks.test.mjs \
  scripts/tests/slow/task-tracker/lib/aitm-dispatcher.test.mjs \
  scripts/tests/slow/task-tracker/verbs/deadlock-regression.test.mjs \
  scripts/tests/slow/task-tracker/core/packaged-doctor-consumer.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Run issue verification commands individually**

```bash
npm test
npm run test:slow
npm run lint
npm run format:check
git diff --check
git log --oneline -1
```

Expected: every command exits `0`.

- [ ] **Step 6: Inspect final authority boundary**

Run:

```bash
rg -n "doctor" scripts/task-tracker/verbs scripts/task-tracker/task-tracker.mjs
rg -n "postinstall|prepare" package.json
git diff --name-only origin/trunk...HEAD
```

Expected: no doctor workflow verb/dispatch case; no npm lifecycle install/doctor hook; only #1689 implementation, tests, docs, spec, and plan files.

- [ ] **Step 7: Commit documentation and plan evidence**

```bash
git add README.md docs/introduction/install-and-setup.md docs/guides/settings-guide.md \
  skill/shared/router.md scripts/tests/unit/task-tracker/lib/install.test.mjs \
  docs/superpowers/plans/2026-09-18-1689-aitm-doctor-bootstrap-health.md
git commit -m "[#1689] docs: define doctor as the cloud bootstrap gate"
```

---

## Spec Coverage Map

| Specification requirement                                                     | Implementing task |
| ----------------------------------------------------------------------------- | ----------------- |
| Installer-owned provider and managed-fragment authority                       | Task 1            |
| Versioned deterministic manifest and portable declaration                     | Tasks 2-3         |
| Manifest written only after successful install                                | Task 3            |
| Relative/contained symlink portability                                        | Tasks 3-4         |
| Pure aggregate classification and closed statuses                             | Task 4            |
| Read-only package/Git/filesystem observation                                  | Task 4            |
| Standalone human/JSON command and exact exits                                 | Task 5            |
| No workflow-verb/deadlock regression                                          | Task 5            |
| Packed consumer and Node 24/26 proof                                          | Task 6            |
| Explicit migration and cloud guidance                                         | Task 7            |
| No repair, inference, postinstall, GitHub, lock, timer, or task-state effects | Tasks 4-7         |

## Plan Acceptance Boundary

This plan does not authorize implementation by itself. After human plan review,
record Plan approval through the governed #1689 workflow before moving the issue
to Develop. Execution then follows the task-by-task TDD and commit sequence
above using either subagent-driven development or the executing-plans skill.
