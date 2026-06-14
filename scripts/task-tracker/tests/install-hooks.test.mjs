#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { projectScratchDir } from '../lib/scratch-dir.mjs';
import path from 'node:path';
import { patchSettingsJson } from '../../../bin/cli.mjs';

const tmp = mkdtempSync(path.join(projectScratchDir('test'), 'tt-install-hooks-'));
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

// #327 — installer must register source-edit-gate.mjs as a PreToolUse hook
// matching Edit/Write/NotebookEdit, and must be idempotent across re-runs.
const SOURCE_EDIT_GATE_CMD =
  'node node_modules/ai-task-manager/scripts/task-tracker/source-edit-gate.mjs';

// Reset to a clean slate.
rmSync(settingsPath, { force: true });
patchSettingsJson(settingsPath);
let s2 = JSON.parse(readFileSync(settingsPath, 'utf8'));
const gateEntries = (s2.hooks?.PreToolUse || []).filter(
  (h) => h.matcher === 'Edit|Write|NotebookEdit' && hasCommand([h], SOURCE_EDIT_GATE_CMD)
);
assert.equal(gateEntries.length, 1, 'source-edit-gate registered once on fresh install');

patchSettingsJson(settingsPath);
patchSettingsJson(settingsPath);
s2 = JSON.parse(readFileSync(settingsPath, 'utf8'));
const gateEntriesAfter = (s2.hooks.PreToolUse || []).filter(
  (h) => h.matcher === 'Edit|Write|NotebookEdit' && hasCommand([h], SOURCE_EDIT_GATE_CMD)
);
assert.equal(gateEntriesAfter.length, 1, 'source-edit-gate is idempotent across re-installs');

// #240 — installer must register the AskUserQuestion pause/resume hooks under
// PreToolUse / PostToolUse (matcher 'AskUserQuestion'), idempotently.
const ON_ASK_PAUSE_CMD =
  'node node_modules/ai-task-manager/scripts/task-tracker/hooks/on-ask.mjs pause';
const ON_ASK_RESUME_CMD =
  'node node_modules/ai-task-manager/scripts/task-tracker/hooks/on-ask.mjs resume';

function askEntries(entries, cmd) {
  return (entries || []).filter((h) => h.matcher === 'AskUserQuestion' && hasCommand([h], cmd));
}

// Fresh install registers both, once each.
rmSync(settingsPath, { force: true });
patchSettingsJson(settingsPath);
let s3 = JSON.parse(readFileSync(settingsPath, 'utf8'));
assert.equal(
  askEntries(s3.hooks?.PreToolUse, ON_ASK_PAUSE_CMD).length,
  1,
  'AskUserQuestion pause hook registered once on fresh install'
);
assert.equal(
  askEntries(s3.hooks?.PostToolUse, ON_ASK_RESUME_CMD).length,
  1,
  'AskUserQuestion resume hook registered once on fresh install'
);

// Idempotent across re-installs.
patchSettingsJson(settingsPath);
patchSettingsJson(settingsPath);
s3 = JSON.parse(readFileSync(settingsPath, 'utf8'));
assert.equal(
  askEntries(s3.hooks.PreToolUse, ON_ASK_PAUSE_CMD).length,
  1,
  'AskUserQuestion pause hook is idempotent across re-installs'
);
assert.equal(
  askEntries(s3.hooks.PostToolUse, ON_ASK_RESUME_CMD).length,
  1,
  'AskUserQuestion resume hook is idempotent across re-installs'
);

rmSync(tmp, { recursive: true });
console.log('install-hooks.test.mjs: all passed');
