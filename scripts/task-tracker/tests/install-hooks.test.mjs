#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { patchSettingsJson } from '../../../bin/cli.mjs';

const tmp = mkdtempSync(path.join(tmpdir(), 'tt-install-hooks-'));
const settingsPath = path.join(tmp, '.claude', 'settings.json');

const STOP_CMD = 'node node_modules/ai-task-manager/scripts/task-tracker/hooks/on-stop.mjs';
const UP_CMD = 'node node_modules/ai-task-manager/scripts/task-tracker/hooks/on-user-prompt.mjs';

function hasCommand(entries, cmd) {
  return (entries || []).some((e) => e?.hooks?.some((h) => h.command === cmd));
}

// Test 1: fresh install registers both hooks
patchSettingsJson(settingsPath);
let s = JSON.parse(readFileSync(settingsPath, 'utf8'));
assert.equal(hasCommand(s.hooks?.Stop, STOP_CMD), true, 'Stop hook registered');
assert.equal(
  hasCommand(s.hooks?.UserPromptSubmit, UP_CMD),
  true,
  'UserPromptSubmit hook registered'
);

// Test 2: re-running installer does not duplicate entries
patchSettingsJson(settingsPath);
patchSettingsJson(settingsPath);
s = JSON.parse(readFileSync(settingsPath, 'utf8'));
const stopMatches = (s.hooks.Stop || []).filter((e) =>
  e?.hooks?.some((h) => h.command === STOP_CMD)
);
const upMatches = (s.hooks.UserPromptSubmit || []).filter((e) =>
  e?.hooks?.some((h) => h.command === UP_CMD)
);
assert.equal(stopMatches.length, 1, 'Stop hook not duplicated on re-install');
assert.equal(upMatches.length, 1, 'UserPromptSubmit hook not duplicated on re-install');

// Test 3: user pre-existing hooks for the same events are preserved
mkdirSync(path.dirname(settingsPath), { recursive: true });
writeFileSync(
  settingsPath,
  JSON.stringify(
    {
      hooks: {
        Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'echo user-stop' }] }],
        UserPromptSubmit: [{ matcher: '', hooks: [{ type: 'command', command: 'echo user-up' }] }],
      },
    },
    null,
    2
  )
);
patchSettingsJson(settingsPath);
s = JSON.parse(readFileSync(settingsPath, 'utf8'));
assert.equal(hasCommand(s.hooks.Stop, 'echo user-stop'), true, 'user Stop hook preserved');
assert.equal(hasCommand(s.hooks.Stop, STOP_CMD), true, 'our Stop hook added alongside');
assert.equal(hasCommand(s.hooks.UserPromptSubmit, 'echo user-up'), true);
assert.equal(hasCommand(s.hooks.UserPromptSubmit, UP_CMD), true);

rmSync(tmp, { recursive: true });
console.log('install-hooks.test.mjs: all passed');
