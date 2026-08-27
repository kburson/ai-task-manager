# Test Corpus Baseline Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace AITM's migration-era test-corpus authority with a simple current-tree baseline and remove all Writing Studio retirement and graduation scaffolding from HEAD.

**Architecture:** `discoverTestFiles()` and `laneManifest()` remain the only live corpus discovery authorities. A checked-in baseline stores sorted, full repository-relative test paths by lane and acts as a current-state regression floor; Git history, rather than runtime loaders or receipts, preserves earlier accepted states.

**Tech Stack:** Node.js 22, native `node:test`, JSON, npm scripts, GitHub Actions YAML, Git.

## Global Constraints

- Work only in `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.claude/worktrees/articles-book-publication-6a7dfe` on `claude/articles-book-publication-6a7dfe`.
- Do not create a substitute branch or worktree and do not touch the main checkout or its active #1367 work.
- This is an intentionally unbound chore: do not create or bind a GitHub issue.
- Do not change defect #1421 or implement the terminal Review timer/resume repair.
- Preserve existing Git history; delete migration-era files from HEAD without rewriting or pruning history.
- Do not introduce a tombstone, retirement receipt, history hydrator, or graduation automation replacement.
- Keep `node_modules/ai-task-manager -> ..`; do not copy dependencies from another checkout.
- Use test-driven changes, focused verification after each task, and `apply_patch` for hand-edited files.

---

## File structure

### Retained and simplified

- `scripts/tests/integration/meta/test-tree-layout.test.mjs`: current placement,
  partition, and baseline-floor authority only.
- `scripts/tests/integration/meta/test-tree-layout.baseline.json`: schema `1`,
  counts, and sorted full test paths for the current unit, integration, and slow
  lanes.
- `scripts/tests/integration/meta/package-test-corpus.test.mjs`: current package
  exclusions and `npm pack --dry-run` assertions only.
- `scripts/task-tracker/test-impact-manifest.json`: routes current test-tree
  changes to the retained layout guard.
- `scripts/tests/integration/task-tracker/lib/test-impact-selector.test.mjs`:
  verifies current-tree routing and deleted-test lane escalation.
- `scripts/tests/slow/task-tracker/core/maintenance-scripts-strict-argv.test.mjs`:
  retains only live `--apply` scripts.
- `scripts/tests/unit/task-tracker/core/residue-audit-scope.test.mjs`: retains its
  generic generated-file boundary without naming the deleted pre-move manifest.
- `package.json`: contains no graduation command.

### Deleted

- `.github/workflows/graduate-frozen-test-retirements.yml`
- `docs/evidence/temporary-test-retirements/2026-08-25-writing-studio-extraction.md`
- `scripts/maintenance/graduate-frozen-test-retirements.mjs`
- `scripts/tests/lib/frozen-test-retirements.mjs`
- `scripts/tests/lib/test-corpus-membership.mjs`
- `scripts/tests/integration/meta/frozen-test-retirements.test.mjs`
- `scripts/tests/integration/meta/test-corpus-membership.test.mjs`
- `scripts/tests/integration/maintenance/graduate-frozen-test-retirements.test.mjs`
- `scripts/tests/fixtures/test-corpus-pre-move.json`
- all files under `scripts/tests/fixtures/test-corpus-post-snapshot/`
- all files under `scripts/tests/fixtures/test-corpus-frozen-retirements/`

Historical specifications, plans, reviews, and research snapshots remain
unchanged because they describe earlier commits rather than current runtime
authority.

---

### Task 1: Replace historical corpus checks with current-state guards

**Files:**

- Modify: `scripts/tests/integration/meta/test-tree-layout.test.mjs:1-363`
- Modify: `scripts/tests/integration/meta/test-tree-layout.baseline.json:1-end`
- Modify: `scripts/tests/integration/meta/package-test-corpus.test.mjs:1-289`

**Interfaces:**

- Consumes: `discoverTestFiles({ projectRoot })`, `laneManifest({ projectRoot })`,
  `laneOf(testPath)`, and `LANES` from the existing test-discovery modules.
- Produces: baseline schema
  `{ schema: 1, _comment: string, counts: Record<Lane, number>, lanes: Record<Lane, string[]> }`.
- Produces: a regression floor where every baseline path must remain live in
  its recorded lane, while canonically placed additions are allowed.

- [ ] **Step 1: Record the live starting corpus and worktree invariants**

Run:

```bash
test "$(git branch --show-current)" = "claude/articles-book-publication-6a7dfe"
node -e "if (require('node:fs').realpathSync('node_modules/ai-task-manager') !== process.cwd()) process.exit(1)"
git status --short
node --input-type=module -e "import {laneManifest} from './scripts/task-tracker/lib/test-lanes.mjs'; const lanes=laneManifest({projectRoot:process.cwd()}); console.log(JSON.stringify(Object.fromEntries(Object.entries(lanes).map(([lane,files])=>[lane,files.length]))));"
```

Expected: the branch and self-link checks succeed, status is clean, and the
starting counts are printed for later comparison.

- [ ] **Step 2: Rewrite the retained tests before changing the old baseline**

In `test-tree-layout.test.mjs`, remove the Git-provenance imports and helper,
the membership/retirement imports and hydration, the basename retirement
allowances, the migration-era `AC3/AC4` test, and the entire `AC6` history test.
Retain the layout-audit fixtures, subsystem validation, feature semantic-owner
check, AC1, AC2, and the disjoint-partition test.

Replace the header and baseline setup with:

```js
#!/usr/bin/env node
// @story #868
// #868 — current test-tree authority. Every live test must occupy exactly one
// canonical lane and every path in the checked-in current-state baseline must
// remain live in that lane. Canonically placed additions are allowed; an
// intentional removal refreshes the baseline in the same change.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LANES, laneManifest, laneOf } from '../../../task-tracker/lib/test-lanes.mjs';
import { discoverTestFiles } from '../../../task-tracker/lib/discover-test-files.mjs';
import { countCodeLines } from '../../../task-tracker/lib/count-code-lines.mjs';
import { mkdtempProjectIsolated } from '../../../task-tracker/lib/scratch-dir.mjs';
import { laneFiles } from '../../../run-tests-lanes.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../..');
const LAYOUT_AUDIT = path.join(REPO_ROOT, 'scripts/tests/tools/audit-test-layout.mjs');
const STORY_AUDIT = path.join(REPO_ROOT, 'scripts/tests/tools/audit-story-tags.mjs');
const LINE_CAP_AUDIT = path.join(REPO_ROOT, 'scripts/tests/tools/audit-line-cap.mjs');
const LANE_ROOTS = LANES.map((lane) => `scripts/tests/${lane}`);
const baselineDocument = JSON.parse(
  readFileSync(path.join(HERE, 'test-tree-layout.baseline.json'), 'utf8')
);
const baseline = baselineDocument.lanes;
const manifest = laneManifest({ projectRoot: REPO_ROOT });
```

Add these current-state baseline tests before the existing AC1 test:

```js
test('current test-tree baseline is well formed', () => {
  assert.equal(baselineDocument.schema, 1);
  assert.deepEqual(Object.keys(baseline).sort(), [...LANES].sort());
  assert.deepEqual(Object.keys(baselineDocument.counts).sort(), [...LANES].sort());

  for (const lane of LANES) {
    assert.equal(baselineDocument.counts[lane], baseline[lane].length);
    assert.deepEqual(baseline[lane], [...baseline[lane]].sort(), `${lane} baseline is sorted`);
    assert.equal(new Set(baseline[lane]).size, baseline[lane].length);
    for (const rel of baseline[lane]) {
      assert.equal(laneOf(rel), lane, `${rel} belongs to the ${lane} lane`);
    }
  }
});

test('AC3/AC4: every current baseline test remains live in its recorded lane', () => {
  for (const lane of LANES) {
    const live = new Set(manifest[lane]);
    const missing = baseline[lane].filter((rel) => !live.has(rel));
    assert.deepEqual(
      missing,
      [],
      `${lane} lane lost ${missing.length} baseline test(s): ${missing.slice(0, 8).join(', ')}` +
        ' — refresh the baseline only when the removal or relane is intentional'
    );
  }
});
```

Replace `package-test-corpus.test.mjs` with this current-package-only structure,
retaining the existing complete `required` path list in the second test:

```js
// @story #868
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function npmPackFiles() {
  const result = spawnSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  const packages = JSON.parse(result.stdout);
  assert.equal(packages.length, 1, 'npm pack describes exactly one package');
  return packages[0].files.map(({ path: relPath }) => `package/${relPath}`);
}

test('package files explicitly exclude the canonical test support root', () => {
  const packageJson = JSON.parse(readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
  assert.ok(packageJson.files.includes('!scripts/tests/**'));
  assert.ok(!packageJson.files.includes('!scripts/**/tests/**'));
  assert.ok(packageJson.files.includes('!**/*.test.mjs'), 'test suffix remains defense in depth');
});

test('npm pack excludes the test corpus while retaining required runtime files and assets', () => {
  const packed = new Set(npmPackFiles());
  const leakedTests = [...packed].filter((relPath) => relPath.startsWith('package/scripts/tests/'));
  assert.deepEqual(leakedTests, []);

  for (const required of [
    'package/scripts/gh/create-issue.mjs',
    'package/scripts/task-tracker/task-tracker.mjs',
    'package/config/activity-policy.default.json',
    'package/config/project-fields.default.json',
    'package/scripts/reports/regional-rates.json',
    'package/scripts/providers/grok.mjs',
    'package/scripts/task-tracker/hooks/grok-wire.mjs',
    'package/scripts/task-tracker/lib/occupancy.mjs',
    'package/scripts/task-tracker/lib/apply-patch-targets.mjs',
    'package/scripts/review/lib/index.mjs',
    'package/scripts/review/lib/provider-session.mjs',
    'package/scripts/review/lib/runtime-root.mjs',
    'package/scripts/review/lib/repository-boundary.mjs',
    'package/skill/adapters/grok/SKILL.md',
    'package/docs/guides/grok-provider.md',
  ]) {
    assert.ok(packed.has(required), `npm pack retains required runtime asset: ${required}`);
  }
});
```

- [ ] **Step 3: Run the rewritten layout test and observe the old baseline fail**

Run:

```bash
node --test scripts/tests/integration/meta/test-tree-layout.test.mjs scripts/tests/integration/meta/package-test-corpus.test.mjs
```

Expected: FAIL because the old baseline has no schema and contains migration-era
basename data rather than canonical full paths. The package assertions pass.

- [ ] **Step 4: Generate the current full-path baseline**

Run this deterministic mechanical rewrite:

```bash
node --input-type=module <<'NODE'
import { writeFileSync } from 'node:fs';
import { laneManifest } from './scripts/task-tracker/lib/test-lanes.mjs';

const lanes = laneManifest({ projectRoot: process.cwd() });
for (const files of Object.values(lanes)) files.sort();
const document = {
  schema: 1,
  _comment:
    'Current live AITM test-corpus regression floor. Every listed path must remain live in its recorded lane. Canonically placed additions are allowed; refresh this file in the same change as an intentional removal or relane.',
  counts: Object.fromEntries(Object.entries(lanes).map(([lane, files]) => [lane, files.length])),
  lanes,
};
writeFileSync(
  'scripts/tests/integration/meta/test-tree-layout.baseline.json',
  `${JSON.stringify(document, null, 2)}\n`
);
NODE
```

Expected: schema `1`; each lane contains sorted full repository-relative paths;
the counts equal the array lengths; no `postMigrationAdditions`, basename-only
entry, or migration wording remains.

- [ ] **Step 5: Run the focused current-state guards**

Run:

```bash
node --test scripts/tests/integration/meta/test-tree-layout.test.mjs scripts/tests/integration/meta/package-test-corpus.test.mjs
npm run lint:test-layout
npm run lint:story-tags
npm run lint:line-cap
```

Expected: PASS. A temporary local experiment that removes one baseline path
from discovery would fail the floor test; restore the experiment before commit.

- [ ] **Step 6: Commit the current-state authority**

```bash
git add scripts/tests/integration/meta/test-tree-layout.test.mjs \
  scripts/tests/integration/meta/test-tree-layout.baseline.json \
  scripts/tests/integration/meta/package-test-corpus.test.mjs
git diff --cached --check
git commit -m "test: reset corpus guards to current state"
```

Expected: one commit containing only the retained guard simplification and the
first current-tree baseline.

---

### Task 2: Delete the obsolete authority and remove all live wiring

**Files:**

- Modify: `scripts/task-tracker/test-impact-manifest.json:88-121`
- Modify: `scripts/tests/integration/task-tracker/lib/test-impact-selector.test.mjs:35-55,285-427`
- Modify: `scripts/tests/slow/task-tracker/core/maintenance-scripts-strict-argv.test.mjs:21-43`
- Modify: `scripts/tests/unit/task-tracker/core/residue-audit-scope.test.mjs:49-57`
- Modify: `package.json:1-40`
- Modify: `scripts/tests/integration/meta/test-tree-layout.baseline.json:1-end`
- Delete: every path listed in the plan's **Deleted** section.

**Interfaces:**

- Consumes: the current-state layout guard and baseline from Task 1.
- Produces: one test-impact rule that selects
  `scripts/tests/integration/meta/test-tree-layout.test.mjs` for live test or
  baseline changes.
- Produces: a HEAD with no historical membership, receipt, or graduation
  runtime dependency.

- [ ] **Step 1: Change the test-impact expectations first**

Replace the migration-era constants with:

```js
const CURRENT_TREE_TEST = 'scripts/tests/integration/meta/test-tree-layout.test.mjs';
const EXPENSIVE_PACKAGE_TEST = 'scripts/tests/integration/meta/package-test-corpus.test.mjs';
const CORPUS_DISCOVERED = [
  CURRENT_TREE_TEST,
  EXPENSIVE_PACKAGE_TEST,
  'scripts/tests/unit/lib/live.test.mjs',
  'scripts/tests/integration/lib/live.test.mjs',
  'scripts/tests/slow/lib/live.test.mjs',
];
```

Rename the corpus-selection describe block to `checked-in current-tree
selection`. Keep the literal-manifest-path drift test. Replace the remaining
membership, registry, pre-move, receipt, evidence, and graduation cases with:

```js
test('a test content edit selects itself and the current-tree guard', (t) => {
  const projectRoot = corpusSelectionProject(t);
  const changed = 'scripts/tests/unit/lib/live.test.mjs';
  const result = selectCorpus(projectRoot, [changed]);

  assert.deepEqual(result.tests, [changed, CURRENT_TREE_TEST].sort());
  assert.ok(signals(result, changed).includes('changed-test'));
  assert.deepEqual(manifestReasons(result, CURRENT_TREE_TEST), [
    'current test tree authority change',
  ]);
  assert.equal(result.escalated, false);
});

test('a deleted integration test selects the current-tree guard and retains its former lane', (t) => {
  const projectRoot = corpusSelectionProject(t);
  const deleted = 'scripts/tests/integration/lib/deleted.test.mjs';
  const result = selectCorpus(projectRoot, [deleted]);

  assert.ok(result.tests.includes(CURRENT_TREE_TEST));
  assert.deepEqual(result.lanes, ['integration']);
  assert.equal(result.escalated, true);
  assert.ok(
    result.reasons.some(
      ({ changedPath, signal }) => changedPath === deleted && signal === 'deleted-test-lane'
    )
  );
  assert.deepEqual(manifestReasons(result, CURRENT_TREE_TEST), [
    'current test tree authority change',
  ]);
});

test('a rename selects the current-tree guard while the old path retains lane escalation', (t) => {
  const projectRoot = corpusSelectionProject(t);
  const oldPath = 'scripts/tests/integration/lib/renamed.test.mjs';
  const newPath = 'scripts/tests/unit/lib/live.test.mjs';
  const result = selectCorpus(projectRoot, [oldPath, newPath]);

  assert.ok(result.tests.includes(newPath));
  assert.ok(result.tests.includes(CURRENT_TREE_TEST));
  assert.deepEqual(result.lanes, ['integration']);
  assert.equal(result.escalated, true);
});

test('the current tree baseline selects the current-tree guard', (t) => {
  const projectRoot = corpusSelectionProject(t);
  const baseline = 'scripts/tests/integration/meta/test-tree-layout.baseline.json';
  writeFixture(projectRoot, baseline);
  const result = selectCorpus(projectRoot, [baseline]);

  assert.deepEqual(result.tests, [CURRENT_TREE_TEST]);
  assert.deepEqual(manifestReasons(result, CURRENT_TREE_TEST), [
    'current test tree authority change',
  ]);
  assert.equal(result.escalated, false);
});
```

- [ ] **Step 2: Run the changed selector tests and observe the old manifest fail**

Run:

```bash
node --test scripts/tests/integration/task-tracker/lib/test-impact-selector.test.mjs
```

Expected: FAIL because the checked-in manifest still selects the deleted
membership guard and has no current-baseline rule.

- [ ] **Step 3: Replace the three migration-era impact rules with one current rule**

In `scripts/task-tracker/test-impact-manifest.json`, replace the rules whose
reasons are `test corpus membership authority change`, `frozen test corpus
authority change`, and `frozen retirement authority and graduation workflow
change` with:

```json
{
  "sources": [
    "scripts/tests/**/*.test.mjs",
    "scripts/tests/integration/meta/test-tree-layout.baseline.json"
  ],
  "tests": ["scripts/tests/integration/meta/test-tree-layout.test.mjs"],
  "reason": "current test tree authority change"
}
```

Run the selector test again. Expected: PASS.

- [ ] **Step 4: Remove the command and remaining current-code references**

Use `apply_patch` to:

- remove `graduate:frozen-tests` from `package.json`;
- remove `scripts/maintenance/graduate-frozen-test-retirements.mjs` from
  `APPLY_SCRIPTS`; and
- replace the obsolete residue-audit example
  `scripts/tests/fixtures/test-corpus-pre-move.json` with the generic current
  path `scripts/tests/fixtures/generated.json`, preserving the assertion that
  generated-looking files outside `docs/research` are audited.

Run:

```bash
node --test scripts/tests/unit/task-tracker/core/residue-audit-scope.test.mjs
node --test scripts/tests/slow/task-tracker/core/maintenance-scripts-strict-argv.test.mjs
```

Expected: PASS with only live maintenance scripts covered.

- [ ] **Step 5: Delete the approved obsolete artifacts**

Delete exactly the approved files and roots:

```bash
git rm -- .github/workflows/graduate-frozen-test-retirements.yml \
  docs/evidence/temporary-test-retirements/2026-08-25-writing-studio-extraction.md \
  scripts/maintenance/graduate-frozen-test-retirements.mjs \
  scripts/tests/lib/frozen-test-retirements.mjs \
  scripts/tests/lib/test-corpus-membership.mjs \
  scripts/tests/integration/meta/frozen-test-retirements.test.mjs \
  scripts/tests/integration/meta/test-corpus-membership.test.mjs \
  scripts/tests/integration/maintenance/graduate-frozen-test-retirements.test.mjs \
  scripts/tests/fixtures/test-corpus-pre-move.json
git rm -r -- scripts/tests/fixtures/test-corpus-post-snapshot \
  scripts/tests/fixtures/test-corpus-frozen-retirements
```

Expected: four receipts, 55 post-snapshot records, the old manifest, shared
evidence, two loaders, three dedicated tests, the command, and the workflow are
staged as deleted. No historical spec, plan, review, or research file is staged.

- [ ] **Step 6: Regenerate the baseline after the three dedicated tests disappear**

Repeat the deterministic baseline-generation command from Task 1 Step 4.

Expected: the final baseline counts match `laneManifest()` and no baseline path
names any of the three deleted dedicated tests.

- [ ] **Step 7: Prove live residue is gone and current guards pass**

Run:

```bash
test ! -e scripts/tests/fixtures/test-corpus-pre-move.json
test ! -e scripts/tests/fixtures/test-corpus-post-snapshot
test ! -e scripts/tests/fixtures/test-corpus-frozen-retirements
test ! -e scripts/tests/lib/test-corpus-membership.mjs
test ! -e scripts/tests/lib/frozen-test-retirements.mjs
test ! -e scripts/maintenance/graduate-frozen-test-retirements.mjs
test ! -e .github/workflows/graduate-frozen-test-retirements.yml
rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' --glob '!.tmp/**' \
  --glob '!docs/superpowers/**' --glob '!docs/research/**' \
  'test-corpus-pre-move|test-corpus-post-snapshot|test-corpus-membership|frozen-test-retire|temporary-test-retirements|graduate:frozen-tests' \
  package.json .github scripts docs README.md || true
node --test \
  scripts/tests/integration/meta/test-tree-layout.test.mjs \
  scripts/tests/integration/meta/package-test-corpus.test.mjs \
  scripts/tests/integration/task-tracker/lib/test-impact-selector.test.mjs \
  scripts/tests/unit/task-tracker/core/residue-audit-scope.test.mjs
npm run lint:test-layout
npm run lint:story-tags
npm run lint:line-cap
npm run lint:test-reach
```

Expected: all explicit absence checks and tests pass. The residue search prints
nothing; references in historical Superpowers and research documents are
deliberately excluded.

- [ ] **Step 8: Review and commit the deletion boundary**

Run:

```bash
git diff --check
git status --short
git diff --stat
git diff --name-status
```

Confirm every changed path is named by Task 2 and no main-checkout file is
involved. Then commit:

```bash
git add package.json \
  scripts/task-tracker/test-impact-manifest.json \
  scripts/tests/integration/task-tracker/lib/test-impact-selector.test.mjs \
  scripts/tests/slow/task-tracker/core/maintenance-scripts-strict-argv.test.mjs \
  scripts/tests/unit/task-tracker/core/residue-audit-scope.test.mjs \
  scripts/tests/integration/meta/test-tree-layout.baseline.json
git add -u -- .github docs/evidence scripts/maintenance scripts/tests
git diff --cached --check
git commit -m "chore: retire historical test corpus scaffolding"
```

Expected: the commit contains only the approved deletions, current wiring, and
final baseline refresh.

---

### Task 3: Run complete verification and prepare corrective delivery

**Files:**

- Verify only: complete AITM repository and package dry-run output.

**Interfaces:**

- Consumes: Tasks 1 and 2.
- Produces: exact local verification, ancestry, and diff evidence for the
  corrective pull request decision.

- [ ] **Step 1: Reconfirm the exact worktree before full verification**

Run:

```bash
test "$(git rev-parse --show-toplevel)" = "$PWD"
test "$(git branch --show-current)" = "claude/articles-book-publication-6a7dfe"
node -e "if (require('node:fs').realpathSync('node_modules/ai-task-manager') !== process.cwd()) process.exit(1)"
git status --short
```

Expected: exact linked worktree, exact existing branch, correct self-link, and
no uncommitted changes.

- [ ] **Step 2: Run focused current-state verification**

```bash
node --test \
  scripts/tests/integration/meta/test-tree-layout.test.mjs \
  scripts/tests/integration/meta/package-test-corpus.test.mjs \
  scripts/tests/integration/task-tracker/lib/test-impact-selector.test.mjs \
  scripts/tests/unit/task-tracker/core/residue-audit-scope.test.mjs
npm run lint:test-layout
npm run lint:story-tags
npm run lint:line-cap
npm run lint:test-reach
```

Expected: PASS with no deleted module or fixture load.

- [ ] **Step 3: Run the complete fast and slow lanes**

```bash
npm run quality
npm run test:slow
```

Expected: both commands exit `0`; report exact test-file and assertion totals
from their fresh output rather than reusing earlier evidence.

- [ ] **Step 4: Audit the package contents**

```bash
npm pack --dry-run --json > .tmp/aitm-baseline-reset-pack.json
node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs';

const [packed] = JSON.parse(readFileSync('.tmp/aitm-baseline-reset-pack.json', 'utf8'));
const paths = packed.files.map(({ path }) => path);
const forbidden = paths.filter((path) =>
  path.startsWith('scripts/tests/') ||
  path.startsWith('scripts/articles/') ||
  path.startsWith('docs/articles/') ||
  path.includes('frozen-test-retire') ||
  path.includes('test-corpus-post-snapshot') ||
  path.includes('test-corpus-pre-move')
);
if (forbidden.length) {
  console.error(forbidden.join('\n'));
  process.exit(1);
}
console.log(JSON.stringify({ files: paths.length, forbidden: forbidden.length }));
NODE
```

Expected: `forbidden` is `0` and the package contains the required runtime
assets already asserted by `package-test-corpus.test.mjs`.

- [ ] **Step 5: Show exact branch and delivery evidence, then stop**

```bash
git fetch origin trunk claude/articles-book-publication-6a7dfe
git status --short --branch
git rev-parse HEAD
git rev-parse origin/trunk
git merge-base --is-ancestor origin/trunk HEAD
git rev-list --left-right --count origin/trunk...HEAD
git log --oneline --decorate origin/trunk..HEAD
git diff --stat origin/trunk...HEAD
git diff --name-status origin/trunk...HEAD
gh pr list --head claude/articles-book-publication-6a7dfe --state open --json number,title,url,headRefOid,baseRefName
```

Expected: exact current refs, ancestry, divergence, complete corrective delta,
and current pull-request state are available for review. Do not push, force
rewrite, open, update, or merge the corrective pull request without the user's
explicit delivery approval.
