// @story #2014
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRuntimeRootFixture } from '../../helpers/runtime-root-fixture.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
// Shipping a missing/changed recovery module or an archive diverging from source must fail.
test('normal package includes supported recovery help and its complete inventory matches source bytes and integrity', () => {
  const root = createRuntimeRootFixture('retained-package-');
  try {
    const metadata = JSON.parse(
      execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', root], {
        cwd: project,
        encoding: 'utf8',
        timeout: 60000,
      })
    );
    const entries = Array.isArray(metadata) ? metadata : Object.values(metadata);
    assert.equal(entries.length, 1);
    const [packed] = entries;
    const archive = path.join(root, packed.filename);
    assert.equal(
      'sha512-' + createHash('sha512').update(readFileSync(archive)).digest('base64'),
      packed.integrity
    );
    const extracted = path.join(root, 'extracted');
    mkdirSync(extracted);
    execFileSync('tar', ['-xzf', archive, '-C', extracted]);
    const packageDir = path.join(extracted, 'package');
    const mismatches = () =>
      packed.files
        .filter(
          ({ path: file }) =>
            !readFileSync(path.join(project, file)).equals(
              readFileSync(path.join(packageDir, file))
            )
        )
        .map(({ path: file }) => file);
    assert.deepEqual(mismatches(), []);
    const recovery = 'scripts/task-tracker/lib/epic-rank-wave-restore-worktree.mjs';
    assert.ok(packed.files.some(({ path: file }) => file === recovery));
    const help = execFileSync(
      process.execPath,
      [path.join(packageDir, 'bin/aitm.mjs'), 'epic-wave', 'help'],
      { cwd: project, encoding: 'utf8', timeout: 30000 }
    );
    assert.match(help, /restore-worktree/);
    assert.match(help, /retainedDigest/);
    writeFileSync(path.join(packageDir, recovery), 'tampered source');
    assert.deepEqual(mismatches(), [recovery]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
