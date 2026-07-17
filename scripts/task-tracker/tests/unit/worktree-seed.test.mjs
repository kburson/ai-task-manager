// @story #869
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import { inspectSeed } from '../../lib/worktree-seed.mjs';

// A dev checkout is detected by isDevPackage() via a `.git` entry at the root.
function makeDevRoot(prefix) {
  const root = mkdtempSync(path.join(projectScratchDir('test'), prefix));
  writeFileSync(path.join(root, '.git'), 'gitdir: /nowhere\n');
  return root;
}
const linkOf = (root) => path.join(root, 'node_modules', 'ai-task-manager');

test('dev root, no node_modules/ai-task-manager → missing-link', () => {
  const root = makeDevRoot('ws-missing-');
  try {
    assert.equal(inspectSeed({ projectRoot: root }).status, 'missing-link');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('dev root, self-link resolves to root → seeded', () => {
  const root = makeDevRoot('ws-seeded-');
  try {
    mkdirSync(path.join(root, 'node_modules'), { recursive: true });
    symlinkSync('..', linkOf(root), 'dir');
    assert.equal(inspectSeed({ projectRoot: root }).status, 'seeded');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('dev root, link resolves OUTSIDE root → foreign-link (the trunk trap)', () => {
  const root = makeDevRoot('ws-foreign-');
  const elsewhere = mkdtempSync(path.join(projectScratchDir('test'), 'ws-parent-'));
  try {
    mkdirSync(path.join(root, 'node_modules'), { recursive: true });
    symlinkSync(elsewhere, linkOf(root), 'dir'); // points at another tree
    assert.equal(inspectSeed({ projectRoot: root }).status, 'foreign-link');
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(elsewhere, { recursive: true, force: true });
  }
});

test('consumer root (no .git), nothing installed → deps-missing', () => {
  const root = mkdtempSync(path.join(projectScratchDir('test'), 'ws-consumer-'));
  try {
    assert.equal(inspectSeed({ projectRoot: root }).status, 'deps-missing');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('consumer root, real install present → not-applicable', () => {
  const root = mkdtempSync(path.join(projectScratchDir('test'), 'ws-installed-'));
  try {
    mkdirSync(linkOf(root), { recursive: true }); // a real directory, genuine install
    writeFileSync(path.join(linkOf(root), 'package.json'), '{}');
    assert.equal(inspectSeed({ projectRoot: root }).status, 'not-applicable');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
