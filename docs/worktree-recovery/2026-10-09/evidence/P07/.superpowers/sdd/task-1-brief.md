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

