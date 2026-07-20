#!/usr/bin/env node
// @story #866
// #866 — Unit tests for the "test file exercises no code in this repo" lint.
//
// The detector reports every `*.test.mjs` that references no repo source module
// — no import of, and no spawned/resolved path to, any non-test `.mjs`. Such a
// test never appears in the c8 report (`.c8rc.json` scopes `src` to `scripts/`
// with `all: true`) yet costs a process spawn on every full run. Reach is NOT
// import: the CLI tests reach product code by spawning it, which c8 still
// measures — so the detector accepts a spawned/resolved `.mjs` path as reach and
// DEFAULT-ALLOWs on ambiguity. See lib/lint-test-coverage-reach.mjs.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  extractSourceModuleRefs,
  reachesRepoSource,
  findNoReachTestFiles,
} from '../../lib/lint-test-coverage-reach.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../..');

// A doc-only test body: imports only node:*, asserts on a markdown file read as
// text. It reaches NO repo source module.
const DOC_ONLY = [
  `import { readFileSync } from 'node:fs';`,
  `import { test } from 'node:test';`,
  `test('workflow doc mentions the gate', () => {`,
  `  const doc = readFileSync('docs/guides/workflow.md', 'utf8');`,
  `  assert.match(doc, /some standard/);`,
  `});`,
].join('\n');

// A test that reaches source by a static import specifier.
const IMPORT_REACH = `import { parseVerificationCommands } from '../../lib/verification-commands.mjs';\n`;

// A test that reaches source ONLY by spawning a CLI path (c8 still measures it).
const SPAWN_REACH = `const r = execFileSync('node', ['scripts/task-tracker/task-tracker.mjs', 'status']);\n`;

// A cache-busting dynamic import with a `?t=` tail after `.mjs` — must count.
const CACHE_BUST_REACH =
  'const m = await import(`../../lib/guard-registry.mjs?t=${Date.now()}`);\n';

// Importing/spawning ANOTHER test file is not reaching product code.
const TEST_ONLY_REF = `import { helper } from '../../lib/other-thing.test.mjs';\n`;

test('flags a doc-only test that reaches no repo source module', () => {
  const offenders = findNoReachTestFiles([{ path: 'tests/unit/doc-only.test.mjs', src: DOC_ONLY }]);
  assert.equal(offenders.length, 1);
  assert.equal(offenders[0].file, 'tests/unit/doc-only.test.mjs');
  assert.match(offenders[0].message, /exercises no code/);
});

test('detector fails on known-bad input (reachesRepoSource is false)', () => {
  assert.equal(reachesRepoSource(DOC_ONLY), false);
  assert.deepEqual(extractSourceModuleRefs(DOC_ONLY), []);
});

test('passes a test that reaches source via a static import specifier', () => {
  assert.equal(reachesRepoSource(IMPORT_REACH), true);
  assert.deepEqual(
    findNoReachTestFiles([{ path: 'tests/unit/a.test.mjs', src: IMPORT_REACH }]),
    []
  );
});

test('passes a test that reaches product code ONLY by spawning it', () => {
  assert.equal(reachesRepoSource(SPAWN_REACH), true);
  assert.ok(extractSourceModuleRefs(SPAWN_REACH).includes('scripts/task-tracker/task-tracker.mjs'));
});

test('counts a cache-busting dynamic import with a ?t= tail after .mjs', () => {
  assert.equal(reachesRepoSource(CACHE_BUST_REACH), true);
  assert.ok(extractSourceModuleRefs(CACHE_BUST_REACH).includes('../../lib/guard-registry.mjs'));
});

test('does NOT count a reference to another *.test.mjs as reach', () => {
  assert.equal(reachesRepoSource(TEST_ONLY_REF), false);
});

test('DEFAULT-ALLOW: a .mjs named only in prose/comment is not a reach signal', () => {
  // A comment mentioning a filename with surrounding words never sits inside a
  // quote anchored to the opening delimiter, so it is not counted — but neither
  // does the file get condemned solely on a quoted path elsewhere.
  const commentOnly = `// see scripts/task-tracker/lib/foo.mjs for details\nconst x = 1;\n`;
  assert.equal(reachesRepoSource(commentOnly), false);
});

test('package.json wires lint:test-reach into the aggregate lint script', () => {
  const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  assert.equal(
    pkg.scripts['lint:test-reach'],
    'node scripts/maintenance/lint-test-coverage-reach.mjs'
  );
  assert.match(pkg.scripts.lint, /npm run lint:test-reach/);
});

test('workflow.md documents the lint and the standard it enforces', () => {
  const doc = readFileSync(path.join(REPO_ROOT, 'docs/guides/workflow.md'), 'utf8');
  assert.match(doc, /lint:test-reach/);
  assert.match(doc, /exercises no code/i);
});

console.log('lint-test-coverage-reach.test.mjs: all passed');
