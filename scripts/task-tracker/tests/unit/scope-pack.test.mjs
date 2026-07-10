// @story #768
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// #768 — prove `npm pack --dry-run` produces the scoped tarball. This is the
// closest local, network-free proxy for "npm publish --dry-run reports the
// scoped name with public access and no name error" (AC). `npm pack --dry-run
// --json` emits the resolved manifest name/version without touching the
// registry.
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..');

test('npm pack --dry-run resolves the scoped @kburson/ai-task-manager name', () => {
  const res = spawnSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(res.status, 0, `npm pack --dry-run failed: ${res.stderr}`);
  const parsed = JSON.parse(res.stdout);
  const entry = Array.isArray(parsed) ? parsed[0] : parsed;
  assert.equal(
    entry.name,
    '@kburson/ai-task-manager',
    'packed tarball must carry the scoped package name'
  );
});
