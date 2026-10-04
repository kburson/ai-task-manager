// @story #1861 #728 #1615
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseNpmPackReport } from '../../../helpers/npm-pack-report.mjs';

// Resolve the repo root from this test file's location so the check is
// path-independent (dev tree or isolated worktree).
const HERE = dirname(fileURLToPath(import.meta.url)) + '/..';
const ROOT = join(HERE, '..', '..', '..', '..');

test('package.json excludes repository documentation and memory seeds', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const files = manifest.files ?? [];
  assert.ok(files.includes('!docs/**'));
  assert.deepEqual(
    files.filter((file) => file.startsWith('docs/')),
    []
  );
});

test('npm pack leaves repository memory seeds out of the runtime package', () => {
  // `npm pack --dry-run --json` resolves the real published file list offline
  // (no tarball written, no registry contact) and reports it as JSON.
  const raw = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, npm_config_loglevel: 'silent' },
  });
  const report = parseNpmPackReport(raw, {
    expectedPackageName: '@kburson/ai-task-manager',
  });
  const entries = report.files.map((f) => f.path);

  assert.deepEqual(
    entries.filter((entry) => entry.startsWith('docs/ai-memory/')),
    []
  );
});
