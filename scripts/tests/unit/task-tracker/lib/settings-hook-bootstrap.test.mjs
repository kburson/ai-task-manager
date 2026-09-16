// @story #1631
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { patchSettingsJson } from '../../../../../bin/cli.mjs';
import { CLAUDE_BASH_ALLOWLIST } from '../../../../../bin/lib/claude-bash-allowlist.mjs';

function allCommands(settings) {
  const out = [];
  for (const entries of Object.values(settings.hooks ?? {})) {
    for (const e of entries) for (const h of e.hooks ?? []) out.push(h.command);
  }
  return out;
}

test('patchSettingsJson emits scoped-first managed hook commands', () => {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'settings-'));
  const p = path.join(dir, 'settings.json');
  try {
    patchSettingsJson(p, { memoryIndexHook: true });
    const settings = JSON.parse(readFileSync(p, 'utf8'));
    const managedCommands = allCommands(settings).filter((command) =>
      command.includes('task-tracker')
    );
    assert.ok(managedCommands.length > 0, 'expected generated managed commands');
    for (const command of managedCommands) {
      assert.doesNotMatch(command, /node_modules\/ai-task-manager\//);
      assert.match(command, /node_modules\/@kburson\/ai-task-manager\//);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('patchSettingsJson leaves worktree seed checks to repository hooks', () => {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'settings-seed-'));
  const p = path.join(dir, 'settings.json');
  try {
    patchSettingsJson(p, {});
    const settings = JSON.parse(readFileSync(p, 'utf8'));
    const cmds = allCommands(settings);
    assert.equal(
      cmds.some((c) => c.includes('ensure-worktree-seeded.mjs')),
      false,
      'consumer settings must not install repository worktree seed checks'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Claude allowlist permits scoped installed operational scripts', () => {
  assert.ok(
    CLAUDE_BASH_ALLOWLIST.includes('Bash(node node_modules/@kburson/ai-task-manager/scripts/**)'),
    'allowlist must include scoped installed operational scripts'
  );
});
