// @story #501
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { syncTemplates } from '../../../../sync-templates.mjs';

function fixture() {
  const root = mkdtempSync(join(projectScratchDir('test'), 'aitm-sync-'));
  const srcDir = join(root, 'templates');
  const destDir = join(root, '.ai-task-manager');
  mkdirSync(srcDir, { recursive: true });
  return { root, srcDir, destDir };
}

test('syncTemplates: a deliberately stale mirror is made byte-identical to its template', () => {
  const { root, srcDir, destDir } = fixture();
  try {
    const canonical = '# canonical pickup directive\nfresh content\n';
    writeFileSync(join(srcDir, 'pickup-directive.md'), canonical, 'utf8');
    // Seed the mirror with DRIFTED content (the bug we are guarding against).
    mkdirSync(destDir, { recursive: true });
    writeFileSync(join(destDir, 'pickup-directive.md'), '# STALE drifted copy\n', 'utf8');

    const results = syncTemplates({
      srcDir,
      destDir,
      files: ['pickup-directive.md'],
    });

    assert.equal(
      readFileSync(join(destDir, 'pickup-directive.md'), 'utf8'),
      canonical,
      'mirror is now byte-identical to the template'
    );
    assert.deepEqual(results, [{ name: 'pickup-directive.md', status: 'synced' }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('syncTemplates: an already-identical mirror reports unchanged (idempotent)', () => {
  const { root, srcDir, destDir } = fixture();
  try {
    const canonical = 'identical bytes\n';
    writeFileSync(join(srcDir, 'pickup-directive.md'), canonical, 'utf8');
    mkdirSync(destDir, { recursive: true });
    writeFileSync(join(destDir, 'pickup-directive.md'), canonical, 'utf8');

    const results = syncTemplates({
      srcDir,
      destDir,
      files: ['pickup-directive.md'],
    });

    assert.deepEqual(results, [{ name: 'pickup-directive.md', status: 'unchanged' }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('syncTemplates: creates the mirror file when absent', () => {
  const { root, srcDir, destDir } = fixture();
  try {
    writeFileSync(join(srcDir, 'definition-of-done.md'), 'dod body\n', 'utf8');

    const results = syncTemplates({
      srcDir,
      destDir,
      files: ['definition-of-done.md'],
    });

    assert.equal(readFileSync(join(destDir, 'definition-of-done.md'), 'utf8'), 'dod body\n');
    assert.deepEqual(results, [{ name: 'definition-of-done.md', status: 'synced' }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('syncTemplates: throws when required dirs are missing', () => {
  assert.throws(() => syncTemplates({ destDir: 'x' }), /srcDir is required/);
  assert.throws(() => syncTemplates({ srcDir: 'x' }), /destDir is required/);
});
