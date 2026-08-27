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
