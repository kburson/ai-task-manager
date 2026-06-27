// @story #570
// #570 — c8 code-coverage instrumentation for the automated test suite.
// This config-assertion test is the declared verifier for the demonstrable
// acceptance criteria. It pins the coverage wiring so a future edit that
// silently drops any piece fails the suite:
//   AC1 — `c8` is a devDependency.
//   AC2 — `test:coverage` wraps `node scripts/run-tests.mjs --lane all`.
//   AC3 — `test:coverage:fast` wraps the `fast` lane.
//   AC4 — `.c8rc.json` carries `all:true`, `src` scoped to `scripts`, and the
//          three exclude globs.
//   AC5 — `coverage/` is gitignored.
//   AC6 — text + html reporters are configured.
//   AC8 — CLAUDE.md documents how to run coverage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8');
const pkg = JSON.parse(read('package.json'));
const c8rc = JSON.parse(read('.c8rc.json'));

test('AC1 — c8 is a devDependency', () => {
  assert.ok(pkg.devDependencies?.c8, 'expected devDependencies.c8 to be set');
});

test('AC2 — test:coverage wraps the all lane through c8', () => {
  assert.equal(pkg.scripts['test:coverage'], 'c8 node scripts/run-tests.mjs --lane all');
});

test('AC3 — test:coverage:fast wraps the fast lane through c8', () => {
  assert.equal(pkg.scripts['test:coverage:fast'], 'c8 node scripts/run-tests.mjs --lane fast');
});

test('AC4 — .c8rc.json has all:true, src scoped to scripts, and the exclude globs', () => {
  assert.equal(c8rc.all, true, 'all must be true so untested files count as 0%');
  assert.deepEqual(c8rc.src, ['scripts']);
  for (const glob of ['**/*.test.mjs', '**/tests/**', 'scripts/maintenance/**']) {
    assert.ok(c8rc.exclude.includes(glob), `exclude must cover ${glob}`);
  }
});

test('AC5 — coverage/ is gitignored', () => {
  const ignore = read('.gitignore')
    .split('\n')
    .map((l) => l.trim());
  assert.ok(ignore.includes('coverage/'), 'coverage/ must be present in .gitignore');
});

test('AC6 — text and html reporters are configured', () => {
  assert.ok(Array.isArray(c8rc.reporter), 'reporter must be an array');
  assert.ok(c8rc.reporter.includes('text'), 'text reporter required');
  assert.ok(c8rc.reporter.includes('html'), 'html reporter required');
});

test('AC8 — CLAUDE.md documents how to run coverage', () => {
  assert.match(read('CLAUDE.md'), /test:coverage/);
});
