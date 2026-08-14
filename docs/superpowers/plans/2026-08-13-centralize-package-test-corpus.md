# Centralize Package Test Corpus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the complete package test corpus into `scripts/tests/`, preserve every starting test and the frozen lane census, record intentional semantic corrections, and make canonical layout plus whole-tree `@story` attribution fail-closed.

**Architecture:** `discoverTestFiles()` remains the package-wide source of truth and continues scanning all of `scripts/`, including misplaced tests. A canonical path parser in `test-lanes.mjs` becomes the sole lane classifier, while meta audits compare discovery with the allowed `scripts/tests/{unit,integration,slow}` tree and a frozen old-to-new migration manifest. Test-only helpers, fixtures, audit scripts, and migration evidence live beneath `scripts/tests/` and are excluded from the published npm package.

**Tech Stack:** Node.js 22+ ESM, `node:test`, npm package `files` allowlist, Git rename detection, GitHub Actions, Markdown ADR and contributor guidance.

## Global Constraints

- The repository has one npm package deliverable; do not preserve domain-local test roots as package boundaries.
- Canonical discovery remains rooted at all of `scripts/` so a misplaced `*.test.mjs` is detected and rejected.
- Every discovered test must live below exactly one of `scripts/tests/unit/`, `scripts/tests/integration/`, or `scripts/tests/slow/`.
- Preserve the frozen starting census for all 915 tests: 837 unit, 27 integration,
  and 51 slow. Record the intentional post-snapshot correction of
  `trunk-ref.integration.test.mjs` from unit to integration separately; it
  coordinates multiple Git repositories and a remote end to end through clone,
  push, fetch, and the close gate. With three story-owned unit tests, the final live
  census is 839 unit, 28 integration, and 51 slow (918 total).
- Use `git mv` for every existing test and test-only support asset; retain basename and rename provenance.
- Every test must carry `// @story #NNN` on line 1, or line 2 after a shebang.
- Use the creation issue when Git history exposes one; use the documented `#309` fallback only when attribution is unavailable.
- The npm tarball must exclude all of `scripts/tests/**` while retaining required production scripts and data files.
- Do not rewrite test behavior except for relocation, path repair, and assertions that enforce this story.

---

### Task 1: Freeze the starting corpus and define canonical path semantics

**Files:**

- Modify: `scripts/task-tracker/lib/test-lanes.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/test-corpus-paths.test.mjs` (moved by Task 3 to `scripts/tests/unit/task-tracker/lib/test-corpus-paths.test.mjs`)
- Create: `scripts/task-tracker/tests/unit/meta/package-test-corpus.test.mjs` (moved by Task 3 to `scripts/tests/unit/meta/package-test-corpus.test.mjs`)
- Create: `scripts/task-tracker/tests/fixtures/test-corpus-pre-move.json` (moved by Task 3 to `scripts/tests/fixtures/test-corpus-pre-move.json`)

**Interfaces:**

- Produces: `CANONICAL_TEST_ROOT`, `CANONICAL_LANES`, `parseCanonicalTestPath(relPath)`, `canonicalLayoutViolations(files)`, and a frozen 915-entry migration manifest.
- Consumes: `discoverTestFiles({ projectRoot })` and the existing `laneOf()` only to record each pre-move lane.

- [ ] **Step 1: Generate the immutable pre-move manifest before creating new test files**

Run a repository-local Node script from the issue worktree that imports `discoverTestFiles` and `laneOf`, computes a SHA-256 digest for each current file, and writes JSON shaped as:

```json
{
  "schema": 1,
  "sourceCommit": "4f4d7ccf1c3b2f7375e38e7a227f8bec1ef2fdc3",
  "counts": { "all": 915, "unit": 837, "integration": 27, "slow": 51 },
  "tests": [
    {
      "oldPath": "scripts/articles/publish-articles.test.mjs",
      "newPath": "scripts/tests/unit/articles/publish-articles.test.mjs",
      "lane": "unit",
      "basename": "publish-articles.test.mjs",
      "sha256": "5d9f089afe4408c85943254b03d98d3c8d8d0182816ed551852dd81ee82ea43c"
    }
  ]
}
```

The generator must use an explicit destination mapping: existing lane roots retain their lane; `task-tracker` test subtrees map beneath `scripts/tests/<lane>/task-tracker/` except `meta`, `fixtures`, `helpers`, and `tools`, which map to the package-level support/bucket subtree; domain-local and co-located tests map beneath their production path relative to `scripts/`; files already in declared integration roots remain integration; the existing articles E2E test remains slow. A filename suffix alone does not rewrite the historical lane. The frozen manifest therefore retains the old classifier's unit destination for `trunk-ref.integration.test.mjs` as migration provenance and records its final semantic integration destination in `laneCorrections`.

Run: `node .tmp/inspect/build-876-manifest.mjs`

Expected: JSON reports exactly 915 unique `oldPath` values, 915 unique `newPath` values, and lane counts `837/27/51`.

- [ ] **Step 2: Write failing path-contract tests**

Add tests that require these exact semantics:

```js
assert.deepEqual(parseCanonicalTestPath('scripts/tests/unit/gh/create-issue.test.mjs'), {
  lane: 'unit',
  relative: 'gh/create-issue.test.mjs',
});
assert.equal(parseCanonicalTestPath('scripts/gh/create-issue.test.mjs'), null);
assert.equal(parseCanonicalTestPath('scripts/tests/fixtures/data.test.mjs'), null);
assert.deepEqual(
  canonicalLayoutViolations([
    'scripts/tests/slow/articles/publish-articles-e2e.test.mjs',
    'scripts/reports/generate-value-report.test.mjs',
  ]),
  ['scripts/reports/generate-value-report.test.mjs']
);
```

The package-corpus test must validate manifest schema, exact starting counts, unique old/new paths, allowed lanes, basename preservation, and a one-to-one mapping.

- [ ] **Step 3: Run the tests and confirm the new interface is missing**

Run: `node --test scripts/task-tracker/tests/unit/lib/test-corpus-paths.test.mjs scripts/task-tracker/tests/unit/meta/package-test-corpus.test.mjs`

Expected: FAIL because `parseCanonicalTestPath` and `canonicalLayoutViolations` are not exported yet.

- [ ] **Step 4: Implement the canonical parser without changing live runner behavior yet**

Add this contract to `test-lanes.mjs`:

```js
export const CANONICAL_TEST_ROOT = 'scripts/tests';
export const CANONICAL_LANES = Object.freeze(['unit', 'integration', 'slow']);

export function parseCanonicalTestPath(relPath) {
  const normalized = String(relPath).replaceAll('\\\\', '/');
  const match = /^scripts\/tests\/(unit|integration|slow)\/(.+\.test\.mjs)$/.exec(normalized);
  if (!match || match[2].split('/').includes('..')) return null;
  return { lane: match[1], relative: match[2] };
}

export function canonicalLayoutViolations(files) {
  return files.filter((file) => parseCanonicalTestPath(file) === null).sort();
}
```

Keep `laneOf()` permissive until Task 3 moves the corpus, so this task is independently green.

- [ ] **Step 5: Run focused tests and commit**

Run: `node --test scripts/task-tracker/tests/unit/lib/test-corpus-paths.test.mjs scripts/task-tracker/tests/unit/meta/package-test-corpus.test.mjs`

Expected: PASS with the manifest reporting 915 mapped starting tests.

Commit: `test: freeze #876 package corpus migration`

---

### Task 2: Enforce and repair whole-tree story attribution

**Files:**

- Modify: `scripts/task-tracker/tests/audit-story-tags.mjs` (moved by Task 3 to `scripts/tests/tools/audit-story-tags.mjs`)
- Modify: `scripts/task-tracker/tag-story-ids.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/coverage-tag-story-ids.test.mjs` (moved by Task 3)
- Create: `scripts/task-tracker/tests/unit/meta/audit-story-tags.test.mjs` (moved by Task 3 to `scripts/tests/unit/meta/audit-story-tags.test.mjs`)
- Modify: the 32 starting untagged `*.test.mjs` files listed by canonical discovery

**Interfaces:**

- Consumes: `discoverTestFiles({ projectRoot: process.cwd() })` with its default `scripts` root.
- Produces: identical whole-tree file selection in the audit and repair commands, exported pure tag-placement helpers, and complete story attribution.

- [ ] **Step 1: Write failing whole-tree audit and repair tests**

Use isolated project fixtures with tests under `scripts/tests/unit/`, `scripts/gh/`, and `scripts/providers/tests/`. Assert that:

```js
assert.equal(runAudit(fixtureWithUntaggedColocatedTest).status, 1);
assert.match(runAudit(fixtureWithUntaggedColocatedTest).stderr, /scripts\/gh\/orphan\.test\.mjs/);
assert.equal(runAudit(fixtureWhereEveryTestIsTagged).status, 0);
```

Extend the tag-helper child-process test so a co-located test outside every old root is tagged, an existing tag is preserved, a shebang remains line 1, a creation commit `#42` wins, and a no-attribution file receives `#309`.

- [ ] **Step 2: Run tests and prove the old two-root selection fails**

Run: `node --test scripts/task-tracker/tests/unit/meta/audit-story-tags.test.mjs scripts/task-tracker/tests/unit/lib/coverage-tag-story-ids.test.mjs`

Expected: FAIL because co-located fixture tests are omitted.

- [ ] **Step 3: Replace both hard-coded root arrays with canonical whole-tree discovery**

Use exactly:

```js
const files = discoverTestFiles({ projectRoot: process.cwd() });
```

Preserve the audit’s nonzero exit and complete offending-path report. Preserve `tag-story-ids.mjs` shebang ordering and make its filesystem and Git operations callable from tests without importing a module that immediately mutates the real worktree.

- [ ] **Step 4: Backfill all 32 starting missing tags**

Run: `node scripts/task-tracker/tag-story-ids.mjs`

Review the fallback list. For every fallback candidate, inspect `git log --follow --diff-filter=A -- <path>` and use a creation issue when the history contains one; retain `#309` only where it does not.

- [ ] **Step 5: Verify and commit**

Run: `node --test scripts/task-tracker/tests/unit/meta/audit-story-tags.test.mjs scripts/task-tracker/tests/unit/lib/coverage-tag-story-ids.test.mjs`

Run: `npm run lint:story-tags`

Expected: both commands PASS and the audit count equals canonical discovery.

Commit: `fix: enforce whole-tree story tags for #876`

---

### Task 3: Move the complete corpus and repair path consumers

**Files:**

- Move: every manifest `oldPath` to its unique `newPath` with `git mv`
- Move: `scripts/task-tracker/tests/fixtures/` to `scripts/tests/fixtures/`
- Move: `scripts/task-tracker/tests/helpers/` to `scripts/tests/helpers/`
- Move: test-only audit and support scripts to `scripts/tests/tools/`
- Modify: imports and URL-relative repository-root calculations in moved tests and helpers
- Modify: `scripts/task-tracker/lib/test-lanes.mjs`
- Modify: `scripts/task-tracker/find-unit-tests.mjs`
- Modify: `scripts/run-tests-lanes.mjs`
- Modify: `scripts/maintenance/lint-test-coverage-reach.mjs`
- Modify: `scripts/maintenance/lint-test-coverage-reach.baseline.json`
- Modify: `.ai-task-manager/activity-policy.json`
- Modify: every live source, fixture, baseline, or package script that names a retired test path
- Modify: moved `scripts/tests/unit/task-tracker/lib/enumerator-migration.test.mjs`
- Modify: moved `scripts/tests/unit/meta/test-tree-layout.test.mjs`

**Interfaces:**

- Consumes: the frozen manifest and Task 1 canonical parser.
- Produces: one canonical tree, strict `laneOf()`, source-to-test mapping by complete source-relative path, and zero retired live roots.

- [ ] **Step 1: Write failing strict-classification and migration-integrity assertions**

Update tests to require:

```js
assert.equal(
  laneOf('scripts/tests/integration/task-tracker/lib/trunk-ref.integration.test.mjs'),
  'integration'
);
assert.throws(
  () => laneOf('scripts/task-tracker/lib/trunk-ref.test.mjs'),
  /outside scripts\/tests/
);
assert.throws(() => laneOf('scripts/tests/fixtures/not-a-lane.test.mjs'), /canonical lane/);
assert.deepEqual(findUnitTests(['scripts/gh/create-issue.mjs'], { discovered }), [
  'scripts/tests/unit/gh/create-issue.test.mjs',
]);
```

The migration-integrity test must compare the frozen manifest with live discovery: every `newPath` exists exactly once, every `oldPath` is absent unless equal to its destination, basename and lane are preserved, no canonical file is multiply classified, and all story-owned tests added after the snapshot are canonical.

- [ ] **Step 2: Run focused tests and confirm current layout fails**

Run: `node --test scripts/task-tracker/tests/unit/lib/lane-taxonomy.test.mjs scripts/task-tracker/tests/unit/lib/find-unit-tests.test.mjs scripts/task-tracker/tests/unit/meta/test-tree-layout.test.mjs scripts/task-tracker/tests/unit/meta/package-test-corpus.test.mjs`

Expected: FAIL on permissive classification and noncanonical current paths.

- [ ] **Step 3: Execute all recorded renames**

Run a checked migration driver that reads `test-corpus-pre-move.json`, refuses a missing source or existing destination, creates destination parents, and invokes `git mv -- <oldPath> <newPath>` once per entry. Move non-test support assets with explicit `git mv` commands. The driver must stop on the first error and print the completed count.

Expected: all 915 starting tests appear as Git renames to their frozen migration destinations, old roots contain no tests, and the intentional post-snapshot `trunk-ref.integration.test.mjs` correction is recorded separately. Final discovery contains 839 unit, 28 integration, and 51 slow tests.

- [ ] **Step 4: Repair imports and repository-root derivation mechanically, then format**

For every moved `.mjs`, resolve each relative ESM import and `new URL(..., import.meta.url)` target against the old path, then rewrite the relative specifier from the new path to the same absolute repository target. Update explicit `path.resolve(HERE, '../../..')`-style repository-root derivations to the correct new depth. Refuse any rewritten target that did not resolve before the move.

Run: `npx prettier --write scripts/tests scripts/task-tracker/lib/test-lanes.mjs scripts/task-tracker/find-unit-tests.mjs scripts/run-tests-lanes.mjs`

- [ ] **Step 5: Make lane classification fail closed and repair source-to-test mapping**

Replace `laneOf()` with:

```js
export function laneOf(relPath) {
  const parsed = parseCanonicalTestPath(relPath);
  if (!parsed)
    throw new Error(`test-lanes: ${relPath} is outside scripts/tests/<unit|integration|slow>/`);
  return parsed.lane;
}
```

Change `find-unit-tests.mjs` to derive the expected canonical unit path from the full source path relative to `scripts/`, with explicit package-level `core` handling only for root modules, and remove co-located preference. Basename fallback may remain only as a compatibility helper for synthetic fixtures and must reject ambiguous matches.

- [ ] **Step 6: Repair every live retired-path consumer**

Update package scripts, source comments that act as executable path guidance, activity/deploy globs, coverage baselines, test-impact manifests, verification fixtures, CI comments/guards, and live documentation. Do not rewrite historical dated plans/specs merely because they describe the layout that existed when authored; tests that intentionally exercise legacy strings keep them only when clearly labeled fixture data.

Run: `rg -n "scripts/(task-tracker|providers|reports|articles|inspect)/tests|scripts/(gh|dev-env|maintenance|reports|articles)/[^ ]+\\.test\\.mjs" package.json .github scripts docs --glob '!docs/archive/**' --glob '!docs/superpowers/plans/**' --glob '!docs/superpowers/specs/**'`

Expected: no stale live reference remains; any match is an explicit legacy-fixture assertion documented in its test.

- [ ] **Step 7: Verify focused contracts and rename provenance**

Run: `node --test scripts/tests/unit/meta/test-tree-layout.test.mjs scripts/tests/unit/meta/package-test-corpus.test.mjs scripts/tests/unit/task-tracker/lib/lane-taxonomy.test.mjs scripts/tests/unit/task-tracker/lib/find-unit-tests.test.mjs scripts/tests/unit/task-tracker/lib/enumerator-migration.test.mjs`

Run: `git diff --summary --find-renames=50% origin/trunk...HEAD`

Expected: tests PASS; every starting test has a rename record or a reviewed similarity explanation caused only by required path/tag edits.

Commit: `refactor: centralize package tests for #876`

---

### Task 4: Activate permanent layout, packaging, and documentation gates

**Files:**

- Create: `scripts/tests/tools/audit-test-layout.mjs`
- Modify: `scripts/tests/unit/meta/test-tree-layout.test.mjs`
- Modify: `scripts/tests/unit/meta/package-test-corpus.test.mjs`
- Modify: `scripts/tests/tools/audit-story-tags.mjs`
- Modify: `scripts/tests/tools/audit-line-cap.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/decisions/0001-test-tree-convention.md`
- Modify: `docs/guides/test-lane-taxonomy.md`
- Modify: `docs/guides/test-authoring.md`
- Modify: contributor/onboarding documentation containing the live test convention

**Interfaces:**

- Consumes: canonical discovery, strict path parsing, and the migration manifest.
- Produces: `npm run lint:test-layout`, package-wide story/line-cap audits, and an npm-pack exclusion proof.

- [ ] **Step 1: Write failing layout-fixture and npm-pack tests**

The layout test must create an isolated fixture with one canonical test plus one co-located or domain-local test and assert the audit exits nonzero while naming the misplaced file. The package test must execute `npm pack --dry-run --json`, parse the file list, assert no entry starts with `package/scripts/tests/`, and assert representative required production files remain, including `package/scripts/gh/create-issue.mjs`, `package/scripts/task-tracker/task-tracker.mjs`, and required data/config assets.

- [ ] **Step 2: Run the new acceptance tests and confirm the missing gate/exclusion fails**

Run: `node --test scripts/tests/unit/meta/test-tree-layout.test.mjs scripts/tests/unit/meta/package-test-corpus.test.mjs`

Expected: FAIL until `lint:test-layout` exists and `package.json` excludes the package-level root explicitly.

- [ ] **Step 3: Wire fail-closed audits and package exclusion**

Add:

```json
{
  "lint:test-layout": "node scripts/tests/tools/audit-test-layout.mjs",
  "lint:story-tags": "node scripts/tests/tools/audit-story-tags.mjs",
  "lint:line-cap": "node scripts/tests/tools/audit-line-cap.mjs"
}
```

Include `npm run lint:test-layout` in `npm run lint`. Replace the old broad `!scripts/**/tests/**` package rule with explicit `!scripts/tests/**` while retaining `!**/*.test.mjs` as defense in depth.

- [ ] **Step 4: Update the authoritative documentation**

Amend ADR 0001 to record the one-deliverable rationale, canonical tree, strict lane path declaration, package-level support subtrees, mandatory tags, and retired exceptions. Update the taxonomy and authoring guides so all examples use `scripts/tests/<lane>/<source-relative-subtree>/` and explicitly state that co-located tests are rejected.

- [ ] **Step 5: Run every issue verification command**

Run: `node --test scripts/tests/unit/meta/test-tree-layout.test.mjs`

Run: `node --test scripts/tests/unit/meta/audit-story-tags.test.mjs`

Run: `node --test scripts/tests/unit/task-tracker/lib/coverage-tag-story-ids.test.mjs scripts/tests/unit/task-tracker/lib/enumerator-migration.test.mjs`

Run: `npm run lint:story-tags`

Run: `node --test scripts/tests/unit/meta/package-test-corpus.test.mjs`

Expected: all five commands PASS.

- [ ] **Step 6: Run complete regression and package verification**

Run: `npm run format:check`

Run: `npm run lint`

Run: `npm run test:unit`

Run: `npm run test:integration`

Run: `npm run test:slow`

Run: `npm pack --dry-run --json`

Expected: every command exits 0; canonical discovery and lane union contain the same full test set; tarball contains no `scripts/tests/**` path.

- [ ] **Step 7: Commit the permanent gates and documentation**

Commit: `chore: enforce canonical test corpus for #876`

---

## Plan Self-Review

- Spec coverage: Tasks 1 and 3 prove lossless migration and preserve the frozen starting census while explicitly recording one semantic lane correction; Tasks 2 and 4 enforce whole-tree tags; Tasks 1, 3, and 4 enforce canonical discovery/layout; Task 3 repairs all path consumers; Task 4 proves packaging and documentation.
- Placeholder scan: no implementation step delegates an unspecified error-handling or test-design decision; generated hashes and the complete 915-entry mapping are intentionally machine-produced from the frozen starting commit.
- Interface consistency: `parseCanonicalTestPath()` is introduced before strict `laneOf()` consumes it; both audits consume `discoverTestFiles()`; the manifest’s `oldPath/newPath/lane/basename/sha256` fields preserve immutable migration provenance, while `laneCorrections` distinguishes the final live destination.
