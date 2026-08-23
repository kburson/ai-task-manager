#!/usr/bin/env node
// @story #438
// #438 AC6 — CI lane wiring.
//
// The five sibling AC suites only protect against regression if they actually
// execute in CI. Discovery is now the single recursive walker
// (lib/discover-test-files.mjs) partitioned into lanes by lib/test-lanes.mjs
// (#860 / #872-875), and `npm run test:slow` (`--lane slow`) runs the slow
// partition. After the #868 subsystem-nesting reorg these suites live under
// tests/slow/<subsystem>/; this test uses the real lane manifest and asserts
// all six #438 files are classified into the slow lane regardless of subdir.
//
// #864 — `test:all` is retired. The suite is runnable only as bounded sections
// (`test:unit`, `test:integration`, `test:slow`); `--lane all` survives ONLY as
// the internal coverage/divergence union reached through `test:coverage`, never a
// `test:all` script. This suite pins that package.json shape so the monolith
// cannot be re-introduced.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { laneManifest } from '../../../../task-tracker/lib/test-lanes.mjs';
import { buildMmdcArgs } from '../../../../articles/lib/diagrams.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const repoRoot = path.resolve(__dir, '../../../..');

const AC_FILES = [
  'lifecycle-traversal-e2e.test.mjs', // AC1
  'config-completeness-invariant.test.mjs', // AC2
  'body-write-roundtrip.test.mjs', // AC3
  'recovery-path-independence.test.mjs', // AC4
  'deadlock-regression.test.mjs', // AC5
  'ci-lane-wiring.test.mjs', // AC6 (this file)
];

test('AC6: all six #438 suites are discovered and classified into the slow lane', () => {
  // Mirror the runner's real discovery: the recursive walker + laneOf taxonomy.
  // Match on basename so the assertion is independent of each suite's subdir.
  const slowBasenames = new Set(laneManifest().slow.map((f) => f.split('/').pop()));
  for (const f of AC_FILES) {
    assert.ok(slowBasenames.has(f), `${f} must be discovered and classified into the slow lane`);
  }
});

test('#864: the suite is runnable only in bounded sections — no test:all script', () => {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.equal(
    pkg.scripts['test:all'],
    undefined,
    'test:all must NOT exist — a single unbounded run breaches the 10-min ceiling'
  );
  assert.match(pkg.scripts['test:unit'], /--lane unit/, 'test:unit must invoke the unit section');
  assert.match(
    pkg.scripts['test:integration'],
    /--lane integration/,
    'test:integration must invoke the integration section'
  );
  assert.match(pkg.scripts['test:slow'], /--lane slow/, 'test:slow must invoke the slow lane');
});

test('#864: --lane all survives ONLY as the internal coverage union', () => {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  // The union lane is still reachable — the divergence guard and c8 coverage need
  // it — but only through test:coverage, never a bare test:all run-script.
  assert.match(
    pkg.scripts['test:coverage'],
    /--lane all/,
    'test:coverage keeps the internal all-lane union (one c8 process over every file)'
  );
  const allLaneScripts = Object.entries(pkg.scripts)
    .filter(([, cmd]) => /--lane all\b/.test(cmd))
    .map(([name]) => name);
  assert.deepEqual(
    allLaneScripts.sort(),
    ['test:coverage'],
    'test:coverage must be the ONLY script invoking --lane all'
  );
});

test('#1388: hosted Mermaid sandbox configuration is confined to the slow CI job', () => {
  const workflow = readFileSync(path.join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
  const [fastBlock, slowBlock] = workflow.split(/^ {2}slow:\s*$/m);
  assert.ok(slowBlock, 'ci.yml must define the slow job');
  assert.doesNotMatch(
    fastBlock,
    /AITM_MERMAID_PUPPETEER_CONFIG/,
    'fast CI must keep the ordinary Mermaid launch defaults'
  );
  assert.match(
    slowBlock,
    /AITM_MERMAID_PUPPETEER_CONFIG:\s*\.github\/puppeteer-ci\.json/,
    'slow CI must opt into the repository-owned Puppeteer configuration'
  );

  const config = JSON.parse(
    readFileSync(path.join(repoRoot, '.github', 'puppeteer-ci.json'), 'utf8')
  );
  assert.deepEqual(config, {
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
});

test('#1388: Mermaid launcher adds the Puppeteer config only when explicitly requested', () => {
  const ordinary = buildMmdcArgs({ input: 'in.mmd', outPath: 'out.png', configPath: '' });
  assert.deepEqual(ordinary, ['-i', 'in.mmd', '-o', 'out.png', '-b', 'transparent', '-s', '3']);

  const configured = buildMmdcArgs({
    input: 'in.mmd',
    outPath: 'out.png',
    configPath: '.github/puppeteer-ci.json',
  });
  assert.deepEqual(configured.slice(-2), [
    '--puppeteerConfigFile',
    path.join(repoRoot, '.github', 'puppeteer-ci.json'),
  ]);
});
