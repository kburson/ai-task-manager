// @story #1859
import assert from 'node:assert/strict';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { mkdtempProjectIsolated } from '../../../task-tracker/lib/scratch-dir.mjs';
import { capturedCommitBytes } from '../../helpers/captured-commit-bytes.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const archive = 'scripts/tests/fixtures/1558/captured-sources';
const commit = '95db22a0306ddbf8bc07c79b8e547778efd68c5d';
const file = 'scripts/maintenance/capture-guidance-lifecycle.mjs';
function isolated(t) {
  const dir = mkdtempProjectIsolated('capture-archive-');
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(path.join(root, archive), path.join(dir, archive), { recursive: true });
  return dir;
}

test('historical capture bytes remain reproducible without any original Git objects', (t) => {
  const dir = isolated(t);
  for (const [sha, filePath] of [
    ['1b300cd8121b33631c5c3119daed583eb1d636fb', 'skill/SKILL.md'],
    [
      '1b300cd8121b33631c5c3119daed583eb1d636fb',
      'docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance.md',
    ],
    [commit, file],
  ]) {
    assert.deepEqual(
      capturedCommitBytes(dir, sha, filePath),
      capturedCommitBytes(root, sha, filePath)
    );
  }
});

test('a missing Git object never permits changed archived bytes', (t) => {
  const dir = isolated(t);
  writeFileSync(path.join(dir, archive, commit, file + '.snapshot'), 'changed archive');
  assert.throws(() => capturedCommitBytes(dir, commit, file), /checksum mismatch/);
});

test('a missing Git object never permits an undeclared archive entry', (t) => {
  const dir = isolated(t);
  const manifestPath = path.join(dir, archive, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath));
  manifest.entries = manifest.entries.filter((entry) => entry.commit !== commit);
  writeFileSync(manifestPath, JSON.stringify(manifest));
  assert.throws(() => capturedCommitBytes(dir, commit, file), /archive lacks/);
});
