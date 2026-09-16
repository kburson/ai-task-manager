// @story #767
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Resolve the repo root from this test file's location so the guard is
// path-independent (works in the dev tree and in an isolated worktree).
const HERE = dirname(fileURLToPath(import.meta.url)) + '/..';
const ROOT = join(HERE, '..', '..', '..', '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

test('package.json license is AGPL-3.0-or-later', () => {
  assert.equal(
    manifest.license,
    'AGPL-3.0-or-later',
    'relicense contract: package.json "license" must be the SPDX id AGPL-3.0-or-later'
  );
});

test('package.json version is pre-1.0 while the package remains unpublished', () => {
  // The package has never been published (tarball-only local installs so far), so
  // it stays under semver's 0.x pre-release range until a deliberate GA cut.
  assert.match(
    manifest.version,
    /^0\./,
    'the package is unpublished and pre-GA; version must stay in the 0.x range until a deliberate 1.0.0 GA cut'
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
