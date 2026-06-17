#!/usr/bin/env node
// #442 — Unit tests for the scoped fleet-sandbox-isolation lint guard.
//
// The guard forbids bare `mkdtempSync(path.join(projectScratchDir(...), ...))`
// ONLY in test files that perform a fleet-REGISTERING operation (exec the CLI
// with new/start/resume/#N-bind, call a binding verb, or call registerTask).
// It auto-exempts files that git-init their sandbox (the documented mitigation),
// and honors an inline `// fleet-sandbox-ok:` opt-out. The authoritative leak
// guard is the runtime registry-key check in run-tests.mjs (AC2); this static
// lint is best-effort. See lib/lint-fleet-sandbox-isolation.mjs.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  findFleetSandboxViolations,
  hasRegistrationSignal,
  hasBareScratchMkdtemp,
  gitInitsSandbox,
} from '../lib/lint-fleet-sandbox-isolation.mjs';

const BARE = `const dir = mkdtempSync(path.join(projectScratchDir('test'), 'tt-x-'));`;
const ISOLATED = `const dir = mkdtempProjectIsolated('tt-x-');`;

test('flags a bare scratch mkdtemp in a file that calls registerTask', () => {
  const src = `registerTask(dir, '#5', wt, 'b', 'k');\n${BARE}\n`;
  const v = findFleetSandboxViolations([{ path: 'tests/a.test.mjs', src }]);
  assert.equal(v.length, 1);
  assert.match(v[0].message, /mkdtempProjectIsolated/);
  assert.equal(v[0].line, 2);
});

test('flags a bare scratch mkdtemp in a file that execs the CLI with a #N bind', () => {
  const src = `spawnSync('node', [CLI, '#200'], opts);\n${BARE}\n`;
  const v = findFleetSandboxViolations([{ path: 'tests/slow/cli.test.mjs', src }]);
  assert.equal(v.length, 1);
});

test('flags a bare scratch mkdtemp in a file that execs the CLI new subcommand', () => {
  const src = `spawnSync('node', [CLI, 'new', 'title'], opts);\n${BARE}\n`;
  const v = findFleetSandboxViolations([{ path: 'tests/slow/cli.test.mjs', src }]);
  assert.equal(v.length, 1);
});

test('flags a bare scratch mkdtemp in a file that calls a binding verb', () => {
  const src = `await verbResume(ctx);\n${BARE}\n`;
  const v = findFleetSandboxViolations([{ path: 'tests/resume-seed.test.mjs', src }]);
  assert.equal(v.length, 1);
});

test('does NOT flag a bare scratch mkdtemp in a non-registering test', () => {
  const src = `import { formatDuration } from '../lib/duration.mjs';\n${BARE}\n`;
  const v = findFleetSandboxViolations([{ path: 'tests/duration.test.mjs', src }]);
  assert.equal(v.length, 0);
});

test('does NOT flag a mere import of registerTask without a call', () => {
  const src = `import { registerTask } from '../lib/fleet-registry.mjs';\n${BARE}\n`;
  const v = findFleetSandboxViolations([{ path: 'tests/imports-only.test.mjs', src }]);
  assert.equal(v.length, 0);
});

test('does NOT flag a registering test that already uses mkdtempProjectIsolated', () => {
  const src = `registerTask(dir, '#5', wt, 'b', 'k');\n${ISOLATED}\n`;
  const v = findFleetSandboxViolations([{ path: 'tests/fleet-registry.test.mjs', src }]);
  assert.equal(v.length, 0);
});

test('auto-exempts a registering test that git-inits its sandbox', () => {
  const src = `execFileSync('git', ['init', '-q'], { cwd: dir });\nregisterTask(dir, '#5', wt, 'b', 'k');\n${BARE}\n`;
  const v = findFleetSandboxViolations([{ path: 'tests/concurrent.test.mjs', src }]);
  assert.equal(v.length, 0);
});

test('honors an inline // fleet-sandbox-ok: opt-out on the same line', () => {
  const src = `spawnSync('node', [CLI, '#200'], opts);\n${BARE} // fleet-sandbox-ok: tests no-git path\n`;
  const v = findFleetSandboxViolations([{ path: 'tests/slow/cli.test.mjs', src }]);
  assert.equal(v.length, 0);
});

test('honors an inline // fleet-sandbox-ok: opt-out on the preceding line', () => {
  const src = `spawnSync('node', [CLI, '#200'], opts);\n// fleet-sandbox-ok: tests bare-worktree path\n${BARE}\n`;
  const v = findFleetSandboxViolations([{ path: 'tests/slow/cli.test.mjs', src }]);
  assert.equal(v.length, 0);
});

test('hasRegistrationSignal detects each registering-operation form', () => {
  assert.ok(hasRegistrationSignal(`spawnSync('node', [CLI, 'start'], o);`));
  assert.ok(hasRegistrationSignal(`spawnSync('node', [CLI, '#108'], o);`));
  assert.ok(hasRegistrationSignal(`await verbStart(ctx);`));
  assert.ok(hasRegistrationSignal(`registerTask(d, '#1', w, 'b', 'k');`));
  assert.ok(!hasRegistrationSignal(`import { registerTask } from '../lib/fleet-registry.mjs';`));
  assert.ok(!hasRegistrationSignal(`import { x } from '../lib/duration.mjs';`));
});

test('gitInitsSandbox detects a git init exec', () => {
  assert.ok(gitInitsSandbox(`execFileSync('git', ['init', '-q'], { cwd });`));
  assert.ok(!gitInitsSandbox(`execFileSync('git', ['rev-parse'], { cwd });`));
});

test('hasBareScratchMkdtemp matches bare call, not the isolated helper', () => {
  assert.ok(hasBareScratchMkdtemp(BARE));
  assert.ok(!hasBareScratchMkdtemp(ISOLATED));
});

console.log('lint-fleet-sandbox-isolation.test.mjs: all passed');
