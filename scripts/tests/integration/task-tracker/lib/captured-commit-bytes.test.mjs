// @story #1558
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { capturedCommitBytes } from '../../../helpers/captured-commit-bytes.mjs';
import { mkdtempOutsideRepo } from '../../../../task-tracker/lib/scratch-dir.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const archive = 'scripts/tests/fixtures/1558/captured-sources';
const manifest = JSON.parse(readFileSync(path.join(root, archive, 'manifest.json'), 'utf8'));

test('historical capture bytes remain verifiable without their Git objects', () => {
  const isolated = mkdtempOutsideRepo('aitm-captured-source-');
  try {
    const manifestPath = path.join(isolated, archive, 'manifest.json');
    mkdirSync(path.dirname(manifestPath), { recursive: true });
    copyFileSync(path.join(root, archive, 'manifest.json'), manifestPath);
    for (const { commit, filePath, sha256 } of manifest.entries) {
      const relative = path.join(archive, commit, `${filePath}.snapshot`);
      const destination = path.join(isolated, relative);
      mkdirSync(path.dirname(destination), { recursive: true });
      copyFileSync(path.join(root, relative), destination);
      const bytes = capturedCommitBytes(isolated, commit, filePath);
      assert.equal(`sha256:${createHash('sha256').update(bytes).digest('hex')}`, sha256);
    }
    const first = manifest.entries[0];
    const snapshot = path.join(isolated, archive, first.commit, `${first.filePath}.snapshot`);
    writeFileSync(snapshot, 'changed');
    assert.throws(
      () => capturedCommitBytes(isolated, first.commit, first.filePath),
      /archive checksum mismatch/
    );
  } finally {
    rmSync(isolated, { recursive: true, force: true });
  }
});
