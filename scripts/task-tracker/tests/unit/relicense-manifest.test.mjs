// @story #767
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Resolve the repo root from this test file's location so the guard is
// path-independent (works in the dev tree and in an isolated worktree).
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

test('package.json license is AGPL-3.0-or-later', () => {
  assert.equal(
    manifest.license,
    'AGPL-3.0-or-later',
    'relicense contract: package.json "license" must be the SPDX id AGPL-3.0-or-later'
  );
});

test('package.json version is 1.0.0 for the initial scoped publish', () => {
  // The relicense shipped as a freshly *scoped* package (@kburson/ai-task-manager),
  // which is a first publish under a new name and therefore correctly 1.0.0 — not a
  // 2.0.0 in-place breaking bump. See #775.
  assert.equal(
    manifest.version,
    '1.0.0',
    'the scoped @kburson/ai-task-manager package is a fresh first publish; version must be 1.0.0'
  );
});

test('the shipped files list includes the license artifacts', () => {
  const files = manifest.files ?? [];
  for (const artifact of ['LICENSE', 'LICENSE-COMMERCIAL', 'NOTICE']) {
    assert.ok(
      files.includes(artifact),
      `package.json "files" must ship ${artifact} in the published tarball`
    );
  }
});
