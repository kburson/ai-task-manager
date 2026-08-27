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

// scripts/tests/<lane>/meta/ → four levels up is the repo root.
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

function writeFixture(projectRoot, relPath) {
  const absPath = path.join(projectRoot, relPath);
  mkdirSync(path.dirname(absPath), { recursive: true });
  writeFileSync(absPath, '// @story #876\n');
}

test('layout audit rejects a discovered test outside the canonical lane tree', () => {
  const projectRoot = mkdtempProjectIsolated('audit-test-layout-');
  writeFixture(projectRoot, 'scripts/tests/unit/gh/canonical.test.mjs');
  writeFixture(projectRoot, 'scripts/gh/misplaced.test.mjs');

  const result = spawnSync(process.execPath, [LAYOUT_AUDIT], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /scripts\/gh\/misplaced\.test\.mjs/);
  assert.doesNotMatch(result.stderr, /scripts\/tests\/unit\/gh\/canonical\.test\.mjs/);
});

test('layout audit rejects a test placed directly in a canonical lane root', () => {
  const projectRoot = mkdtempProjectIsolated('audit-test-layout-loose-');
  writeFixture(projectRoot, 'scripts/tests/unit/loose.test.mjs');

  const result = spawnSync(process.execPath, [LAYOUT_AUDIT], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /scripts\/tests\/unit\/loose\.test\.mjs/);
});

test('line-cap audit still examines a misplaced test discovered outside the canonical tree', () => {
  const projectRoot = mkdtempProjectIsolated('audit-test-line-cap-');
  const oversized = [
    '// @story #876',
    ...Array.from({ length: 801 }, (_, index) => `export const line${index} = ${index};`),
  ].join('\n');
  const relPath = 'scripts/gh/oversized.test.mjs';
  const absPath = path.join(projectRoot, relPath);
  mkdirSync(path.dirname(absPath), { recursive: true });
  writeFileSync(absPath, `${oversized}\n`);

  const result = spawnSync(process.execPath, [LINE_CAP_AUDIT], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /scripts\/gh\/oversized\.test\.mjs/);
});

test('a hidden support-subtree test cannot evade discovery, the runner, or any audit', () => {
  const projectRoot = mkdtempProjectIsolated('audit-test-hidden-fixture-');
  const relPath = 'scripts/tests/fixtures/hidden.test.mjs';
  const absPath = path.join(projectRoot, relPath);
  mkdirSync(path.dirname(absPath), { recursive: true });
  writeFileSync(
    absPath,
    `${Array.from({ length: 801 }, (_, index) => `export const hidden${index} = ${index};`).join('\n')}\n`
  );

  const discovered = discoverTestFiles({ projectRoot });
  assert.ok(discovered.includes(relPath), `${relPath} must remain visible to canonical discovery`);
  assert.throws(
    () => laneFiles('all', { projectRoot }),
    new RegExp(relPath.replaceAll('/', '\\/'))
  );

  for (const audit of [LAYOUT_AUDIT, STORY_AUDIT, LINE_CAP_AUDIT]) {
    const result = spawnSync(process.execPath, [audit], { cwd: projectRoot, encoding: 'utf8' });
    assert.equal(result.status, 1, `${audit} must reject ${relPath}: ${result.stderr}`);
    assert.match(result.stderr, /scripts\/tests\/fixtures\/hidden\.test\.mjs/);
  }
});

// The lane-root prefix for a lane, e.g. "scripts/tests/unit/task-tracker/".
const laneRootPrefix = (lane) => `scripts/tests/${lane}/`;

// #876 places every discovered test under exactly one canonical lane root.
const underLaneRoot = (rel, lane) => rel.startsWith(laneRootPrefix(lane));

// A lane subdir S (e.g. "gh/lib") is a valid subsystem mirror iff it is the
// core/meta bucket, or a real source directory exists at scripts/<S> or
// scripts/task-tracker/<S> (the two package roots whose layouts are mirrored).
function isValidSubsystem(sub) {
  if (
    sub === 'core' ||
    sub === 'meta' ||
    sub === 'fixtures' ||
    sub === 'task-tracker/core' ||
    sub === 'task-tracker/characterization'
  ) {
    return true;
  }
  const taskTrackerRelative = sub.startsWith('task-tracker/')
    ? sub.slice('task-tracker/'.length)
    : sub;
  return (
    existsSync(path.join(REPO_ROOT, 'scripts', sub)) ||
    existsSync(path.join(REPO_ROOT, 'scripts', 'task-tracker', sub)) ||
    existsSync(path.join(REPO_ROOT, 'scripts', taskTrackerRelative)) ||
    existsSync(path.join(REPO_ROOT, 'scripts', 'task-tracker', taskTrackerRelative))
  );
}

test('feature-oriented files keep semantic ownership after their lane correction', () => {
  const featureFiles = [
    'scripts/tests/integration/task-tracker/lib/chore-mode-contract.test.mjs',
    'scripts/tests/integration/task-tracker/lib/chore-mode-verb.test.mjs',
    'scripts/tests/integration/fixtures/feature-fixtures.test.mjs',
  ];
  for (const rel of featureFiles) {
    assert.ok(manifest.integration.includes(rel), `${rel} belongs in the integration lane`);
    const codeLines = countCodeLines(readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
    assert.ok(codeLines <= 800, `${rel} has ${codeLines} lines, above the hard cap`);
  }
});

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

test('AC1: no *.test.mjs file remains directly in a lane root', () => {
  for (const root of LANE_ROOTS) {
    const abs = path.join(REPO_ROOT, root);
    if (!existsSync(abs)) continue;
    const loose = readdirSync(abs, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.test.mjs'))
      .map((e) => e.name);
    assert.deepEqual(
      loose,
      [],
      `${root}/ must hold no loose *.test.mjs (found ${loose.length}); every file nests under a subsystem`
    );
  }
});

test('AC2: every lane subdirectory mirrors a real source subsystem (or is core/meta)', () => {
  for (const lane of LANES) {
    for (const rel of manifest[lane]) {
      if (!underLaneRoot(rel, lane)) continue; // co-located test, not part of this reorg
      // rel = scripts/tests/unit/task-tracker/<lane>/<sub…>/<file>.test.mjs
      const afterRoot = rel.slice(laneRootPrefix(lane).length);
      const sub = path.posix.dirname(afterRoot);
      assert.notEqual(sub, '.', `${rel} sits in the lane root — AC1 nesting violated`);
      assert.ok(
        isValidSubsystem(sub),
        `${rel}: subdir "${sub}" mirrors no source subsystem and is not core/meta`
      );
    }
  }
});

test('AC4: the three lanes are a disjoint partition whose union is the whole discovery set', () => {
  const canonical = new Set(discoverTestFiles({ projectRoot: REPO_ROOT }));
  const seen = new Map(); // path -> lane, to catch any double-classification
  for (const lane of LANES) {
    for (const rel of manifest[lane]) {
      assert.equal(
        laneOf(rel),
        lane,
        `${rel} is in the ${lane} manifest but laneOf says ${laneOf(rel)}`
      );
      assert.ok(!seen.has(rel), `${rel} appears in both ${seen.get(rel)} and ${lane} lanes`);
      seen.set(rel, lane);
    }
  }
  // Union == canonical discovery: nothing discovered is unlaned, nothing laned is undiscovered.
  const unionOnly = [...seen.keys()].filter((p) => !canonical.has(p));
  const canonicalOnly = [...canonical].filter((p) => !seen.has(p));
  assert.deepEqual(
    unionOnly,
    [],
    `manifest has files the canonical walker does not: ${unionOnly.slice(0, 8)}`
  );
  assert.deepEqual(
    canonicalOnly,
    [],
    `canonical walker has files no lane claims: ${canonicalOnly.slice(0, 8)}`
  );
});
