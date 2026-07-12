// @story #791
// Self-link provisioning for the unscoped `node_modules/ai-task-manager`
// alias that hooks + PreToolUse guards resolve through.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  lstatSync,
  realpathSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import { ensureSelfLink } from '../../lib/ensure-self-link.mjs';

// A dev checkout is detected by `isDevPackage()` via a `.git` entry at the root.
function makeDevRoot(prefix) {
  const root = mkdtempSync(path.join(projectScratchDir('test'), prefix));
  writeFileSync(path.join(root, '.git'), 'gitdir: /nowhere\n');
  return root;
}

const linkOf = (root) => path.join(root, 'node_modules', 'ai-task-manager');

test('dev package, link absent → creates symlink to repo root', () => {
  const root = makeDevRoot('sl-create-');
  try {
    const res = ensureSelfLink({ pkgRoot: root });
    assert.equal(res.changed, true);
    assert.equal(res.reason, 'linked');

    const st = lstatSync(linkOf(root));
    assert.ok(st.isSymbolicLink(), 'target is a symlink');
    assert.equal(realpathSync(linkOf(root)), realpathSync(root), 'resolves to root');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('dev package, link present → idempotent no-op', () => {
  const root = makeDevRoot('sl-idem-');
  try {
    ensureSelfLink({ pkgRoot: root });
    const second = ensureSelfLink({ pkgRoot: root });
    assert.equal(second.changed, false);
    assert.equal(second.reason, 'present');
    // still a valid symlink to root
    assert.ok(lstatSync(linkOf(root)).isSymbolicLink());
    assert.equal(realpathSync(linkOf(root)), realpathSync(root));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('non-dev package (no .git) → skipped, nothing created', () => {
  const root = mkdtempSync(path.join(projectScratchDir('test'), 'sl-consumer-'));
  try {
    const res = ensureSelfLink({ pkgRoot: root });
    assert.equal(res.changed, false);
    assert.equal(res.reason, 'not-dev-package');
    assert.throws(() => lstatSync(linkOf(root)), 'no link created in consumer layout');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('dev package, real directory at target → refuses to clobber', () => {
  const root = makeDevRoot('sl-realdir-');
  try {
    mkdirSync(linkOf(root), { recursive: true });
    writeFileSync(path.join(linkOf(root), 'sentinel.txt'), 'real install\n');

    const res = ensureSelfLink({ pkgRoot: root });
    assert.equal(res.changed, false);
    assert.equal(res.reason, 'real-entry-present');
    // untouched: still a real directory, not a symlink, sentinel intact
    assert.ok(lstatSync(linkOf(root)).isDirectory());
    assert.equal(lstatSync(linkOf(root)).isSymbolicLink(), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('dev package, stale symlink → replaced with correct link', () => {
  const root = makeDevRoot('sl-stale-');
  const elsewhere = mkdtempSync(path.join(projectScratchDir('test'), 'sl-elsewhere-'));
  try {
    mkdirSync(path.join(root, 'node_modules'), { recursive: true });
    symlinkSync(elsewhere, linkOf(root), 'dir');

    const res = ensureSelfLink({ pkgRoot: root });
    assert.equal(res.changed, true);
    assert.equal(res.reason, 'linked');
    assert.equal(realpathSync(linkOf(root)), realpathSync(root));
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(elsewhere, { recursive: true, force: true });
  }
});
