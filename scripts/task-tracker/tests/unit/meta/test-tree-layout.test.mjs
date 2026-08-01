#!/usr/bin/env node
// @story #868
// #868 — the subsystem-nesting layout verifier (vc:1). The flat 622-file
// tests/unit/ (plus tests/integration/ and tests/slow/) was reorganized so every
// *.test.mjs mirrors the source subsystem it covers (lib/, verbs/, gh/, gh/lib/,
// states/, hooks/, maintenance/, lib/agent-review/, lib/move-state/, …), with a
// `core/` bucket for root-level modules and a `meta/` bucket for tree-shape tests
// like this one. This suite is the demonstrable anchor for AC1–AC4 and AC6: it
// asserts, over the LIVE discovery output, that the reorg
//   - left no test file directly in a lane root (AC1),
//   - nested every file under a directory that mirrors a real source subsystem
//     or is the core/meta bucket (AC2),
//   - preserved every file's lane and dropped nothing versus the frozen pre-move
//     census (AC3/AC4 — baseline is a floor: no drop, no relane; new tests may be
//     added),
//   - keeps the three lanes a disjoint partition whose union is the whole
//     canonical discovery set (AC4),
//   - carries git-mv provenance for a sample per subsystem (AC6).
//
// The baseline (test-tree-layout.baseline.json) is the pre-move per-lane basename
// census, computed by applying the real laneOf() to every HEAD test path at the
// moment of the move. Regenerate it ONLY on a deliberate add/remove/relane, via
// .tmp/inspect/gen-layout-baseline.mjs.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LANES, laneManifest, laneOf } from '../../../lib/test-lanes.mjs';
import { discoverTestFiles } from '../../../lib/discover-test-files.mjs';
import { provenanceVerdict, isShallowRepository } from '../../../lib/git-provenance.mjs';
import { countCodeLines } from '../../../lib/count-code-lines.mjs';

// scripts/task-tracker/tests/unit/meta/ → five levels up is the repo root.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../../..');

const LANE_ROOTS = LANES.map((l) => `scripts/task-tracker/tests/${l}`);

const baseline = JSON.parse(
  readFileSync(path.join(HERE, 'test-tree-layout.baseline.json'), 'utf8')
).lanes;

function git(args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });
}

// The lane-root prefix for a lane, e.g. "scripts/task-tracker/tests/unit/".
const laneRootPrefix = (lane) => `scripts/task-tracker/tests/${lane}/`;

// #868 only reorganized files that live UNDER the three lane roots. Co-located
// tests elsewhere in scripts/ (e.g. scripts/gh/*.test.mjs, scripts/providers/
// tests/*) are classified into a lane by laneOf but were never moved by this
// issue — the subsystem-nesting and provenance assertions apply only to the
// files under the lane roots.
const underLaneRoot = (rel, lane) => rel.startsWith(laneRootPrefix(lane));

// A lane subdir S (e.g. "gh/lib") is a valid subsystem mirror iff it is the
// core/meta bucket, or a real source directory exists at scripts/<S> or
// scripts/task-tracker/<S> (the two package roots whose layouts are mirrored).
function isValidSubsystem(sub) {
  if (sub === 'core' || sub === 'meta' || sub === 'fixtures') return true;
  return (
    existsSync(path.join(REPO_ROOT, 'scripts', sub)) ||
    existsSync(path.join(REPO_ROOT, 'scripts', 'task-tracker', sub))
  );
}

test('feature-oriented files keep semantic ownership and stay below the 800-line hard cap', () => {
  const featureFiles = [
    'scripts/task-tracker/tests/unit/lib/chore-mode-contract.test.mjs',
    'scripts/task-tracker/tests/unit/lib/chore-mode-verb.test.mjs',
    'scripts/task-tracker/tests/unit/fixtures/feature-fixtures.test.mjs',
  ];
  for (const rel of featureFiles) {
    assert.ok(manifest.unit.includes(rel), `${rel} must remain in the unit lane`);
    const codeLines = countCodeLines(readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
    assert.ok(codeLines <= 800, `${rel} has ${codeLines} lines, above the hard cap`);
  }
});

const manifest = laneManifest({ projectRoot: REPO_ROOT });

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
      // rel = scripts/task-tracker/tests/<lane>/<sub…>/<file>.test.mjs
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

test('AC3/AC4: no pre-move file was dropped or changed lane (baseline is a floor)', () => {
  for (const lane of LANES) {
    const live = new Set(manifest[lane].map((f) => f.split('/').pop()));
    const dropped = baseline[lane].filter((b) => !live.has(b));
    assert.deepEqual(
      dropped,
      [],
      `${lane} lane lost ${dropped.length} pre-move file(s): ${dropped.slice(0, 8).join(', ')}` +
        ' — a move that drops or relanes a file breaks discovery'
    );
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

test('AC6: git-mv provenance survives for a sampled file from each subsystem', (t) => {
  // #949 — `git log --follow` reconstructs a rename chain by walking commits, so
  // it needs commits. A shallow clone (`actions/checkout` defaults to
  // `fetch-depth: 1`) has exactly one, and this assertion then fails for every
  // sample with no hint that the repository, not the code, is what is wrong.
  // CI now checks out with `fetch-depth: 0` — guarded by
  // meta/ci-workflow-history.test.mjs — so the check genuinely runs there. The
  // skip below covers only workspaces that truly cannot answer.
  const shallow = isShallowRepository(git);
  // Staged rename map (pre-commit, e.g. under verify-develop): new paths that
  // arrived via `git mv`, not a fresh add.
  const stagedRenameTargets = new Set(
    git(['diff', '--cached', '--find-renames', '-M', '--name-status', '--diff-filter=R'])
      .split('\n')
      .filter(Boolean)
      .map((l) => l.split('\t').pop())
  );

  // One sample per (lane, subsystem), restricted to files that existed pre-move
  // (basename in the baseline). meta/ holds only new files and is skipped.
  const samples = [];
  for (const lane of LANES) {
    const base = new Set(baseline[lane]);
    const bySub = new Map();
    for (const rel of manifest[lane]) {
      if (!underLaneRoot(rel, lane)) continue; // co-located test, never moved
      const sub = path.posix.dirname(rel.slice(laneRootPrefix(lane).length));
      if (sub === 'meta') continue;
      if (!base.has(rel.split('/').pop())) continue; // only moved (pre-existing) files
      if (!bySub.has(sub)) bySub.set(sub, rel);
    }
    samples.push(...bySub.values());
  }
  assert.ok(
    samples.length >= 10,
    `expected a sample from each subsystem, got only ${samples.length}`
  );

  const skipped = [];
  for (const sample of samples) {
    const follow = git(['log', '--follow', '--format=%h', '--', sample])
      .split('\n')
      .filter(Boolean);
    const verdict = provenanceVerdict({
      followCount: follow.length,
      stagedRename: stagedRenameTargets.has(sample),
      shallow,
    });
    if (verdict.status === 'skip') {
      skipped.push(sample);
      continue;
    }
    assert.equal(verdict.status, 'ok', `${sample}: ${verdict.reason}`);
  }

  // Report the unanswerable case rather than passing quietly — a silent green
  // here would be indistinguishable from a real proof.
  if (skipped.length) {
    t.diagnostic(
      `provenance unverifiable for ${skipped.length}/${samples.length} sample(s): ` +
        'shallow repository, clone with full history to check'
    );
    t.skip('shallow repository — git-mv provenance is unverifiable here');
  }
});
