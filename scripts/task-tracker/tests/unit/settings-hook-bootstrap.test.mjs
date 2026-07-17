// @story #869
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import { patchSettingsJson } from '../../../../bin/cli.mjs';

function allCommands(settings) {
  const out = [];
  for (const entries of Object.values(settings.hooks ?? {})) {
    for (const e of entries) for (const h of e.hooks ?? []) out.push(h.command);
  }
  return out;
}

test('patchSettingsJson emits no bare `node node_modules/…` hook command', () => {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'settings-'));
  const p = path.join(dir, 'settings.json');
  try {
    patchSettingsJson(p, { memoryIndexHook: true });
    const settings = JSON.parse(readFileSync(p, 'utf8'));
    const bare = allCommands(settings).filter((c) => /^node node_modules\//.test(c));
    assert.deepEqual(bare, [], `bare-path hook commands must be gone: ${bare.join(', ')}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('patchSettingsJson registers the SessionStart seed check via the shim', () => {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'settings-seed-'));
  const p = path.join(dir, 'settings.json');
  try {
    patchSettingsJson(p, {});
    const settings = JSON.parse(readFileSync(p, 'utf8'));
    const cmds = allCommands(settings);
    assert.ok(
      cmds.some((c) => c.includes('ensure-worktree-seeded.mjs') && c.startsWith('node -e "')),
      'seed check present as a node -e shim'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
