// @story #869
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  realpathSync,
  lstatSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import { runSeedCheck } from '../../../ensure-worktree-seeded.mjs';

function makeDevRoot(prefix) {
  const root = mkdtempSync(path.join(projectScratchDir('test'), prefix));
  writeFileSync(path.join(root, '.git'), 'gitdir: /nowhere\n');
  return root;
}
const linkOf = (root) => path.join(root, 'node_modules', 'ai-task-manager');
const PAYLOAD = JSON.stringify({ hook_event_name: 'SessionStart' });

test('missing-link → heals, ends seeded, exit 0, no additionalContext', async () => {
  const root = makeDevRoot('ehs-missing-');
  let out = '';
  try {
    const code = await runSeedCheck({
      cwd: root,
      stdin: PAYLOAD,
      stdout: (s) => (out += s),
      stderr: () => {},
    });
    assert.equal(code, 0);
    assert.ok(lstatSync(linkOf(root)).isSymbolicLink(), 'link created');
    assert.equal(realpathSync(linkOf(root)), realpathSync(root), 'resolves to worktree');
    assert.equal(out, '', 'seeded → silent, no additionalContext');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('foreign-link → replaced, resolves to worktree not the foreign tree', async () => {
  const root = makeDevRoot('ehs-foreign-');
  const elsewhere = mkdtempSync(path.join(projectScratchDir('test'), 'ehs-parent-'));
  try {
    mkdirSync(path.join(root, 'node_modules'), { recursive: true });
    symlinkSync(elsewhere, linkOf(root), 'dir');
    const code = await runSeedCheck({
      cwd: root,
      stdin: PAYLOAD,
      stdout: () => {},
      stderr: () => {},
    });
    assert.equal(code, 0);
    assert.equal(realpathSync(linkOf(root)), realpathSync(root));
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(elsewhere, { recursive: true, force: true });
  }
});

test('--check (heal:false) on missing-link → reports, creates nothing, exit 0', async () => {
  const root = makeDevRoot('ehs-check-');
  let out = '';
  try {
    const code = await runSeedCheck({
      cwd: root,
      stdin: PAYLOAD,
      heal: false,
      stdout: (s) => (out += s),
      stderr: () => {},
    });
    assert.equal(code, 0);
    assert.throws(() => lstatSync(linkOf(root)), 'nothing created under --check');
    assert.match(out, /additionalContext/, 'reports the un-seeded state');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('consumer deps-missing → non-fatal, emits npm ci remedy in additionalContext', async () => {
  const root = mkdtempSync(path.join(projectScratchDir('test'), 'ehs-consumer-'));
  let out = '';
  try {
    const code = await runSeedCheck({
      cwd: root,
      stdin: PAYLOAD,
      stdout: (s) => (out += s),
      stderr: () => {},
    });
    assert.equal(code, 0, 'never fatal');
    // #869 findings conclusion (c): the unscoped `node_modules/ai-task-manager`
    // path is a dev-checkout artifact with no distinct consumer install
    // mechanism, so the deps-missing remedy stays the plain `npm ci` diagnostic
    // (no scoped-alias wording). Lock the exact string so any future change to
    // the consumer story must revisit this decision explicitly.
    assert.ok(
      out.includes(`Run \`npm ci\` in ${root} to install ai-task-manager.`),
      'remedy is the plain npm ci diagnostic, no scoped alias'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
