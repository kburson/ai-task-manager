#!/usr/bin/env node
// @story #213
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import path from 'node:path';
import * as installCli from '../../../../../bin/cli.mjs';
import {
  guardBootstrapCommand,
  hookBootstrapCommand,
} from '../../../../task-tracker/lib/guard-entrypoint.mjs';
import { findMainWorktreePath } from '../../../../task-tracker/fleet-registry.mjs';

const tmp = mkdtempSync(path.join(projectScratchDir('test'), 'tt-install-hooks-'));
const settingsPath = path.join(tmp, '.claude', 'settings.json');
const grokHooksPath = path.join(tmp, '.grok', 'hooks', 'aitm.json');
const { patchSettingsJson } = installCli;

assert.equal(
  typeof installCli.patchGrokHooksJson,
  'function',
  'Grok hook patcher must be exported'
);
assert.equal(
  typeof installCli.grokHookCommand,
  'function',
  'Grok hook command helper must be exported'
);

// #869 — lifecycle hooks register via the node_modules-first / repo-relative
// bootstrap shim, matching cli.mjs. Compute the expected commands the same way.
const STOP_CMD = hookBootstrapCommand('scripts/task-tracker/hooks/on-stop.mjs');
const UP_CMD = hookBootstrapCommand('scripts/task-tracker/hooks/on-user-prompt.mjs');

function hasCommand(entries, cmd) {
  return (entries || []).some((e) => e?.hooks?.some((h) => h.command === cmd));
}

function runInstalledCommand(command, { cwd = process.cwd(), input, env = process.env } = {}) {
  const prefix = 'node -e "';
  assert.ok(command.startsWith(prefix) && command.endsWith('"'), command);
  const program = command.slice(prefix.length, -1);
  return spawnSync(process.execPath, ['-e', program], {
    cwd,
    env,
    input: JSON.stringify(input),
    encoding: 'utf8',
  });
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
mkdirSync(path.dirname(grokHooksPath), { recursive: true });
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
// #792 — the command is now the node_modules → repo-relative existence-pick
// bootstrap form, not a bare `node node_modules/…` invocation.
const SOURCE_EDIT_GATE_CMD = guardBootstrapCommand('source-edit-gate');

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
const ON_ASK_PAUSE_CMD = hookBootstrapCommand('scripts/task-tracker/hooks/on-ask.mjs', 'pause');
const ON_ASK_RESUME_CMD = hookBootstrapCommand('scripts/task-tracker/hooks/on-ask.mjs', 'resume');

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

// #241 — installer must register the stop-audit-pause-resume hook under Stop,
// alongside the on-stop hook, once each and idempotently.
const STOP_AUDIT_CMD = hookBootstrapCommand(
  'scripts/task-tracker/hooks/stop-audit-pause-resume.mjs'
);

rmSync(settingsPath, { force: true });
patchSettingsJson(settingsPath);
let s4 = JSON.parse(readFileSync(settingsPath, 'utf8'));
const stopAuditEntries = (entries) =>
  (entries || []).filter((e) => e?.hooks?.some((h) => h.command === STOP_AUDIT_CMD));
assert.equal(stopAuditEntries(s4.hooks?.Stop).length, 1, 'stop-audit hook registered once');
assert.equal(hasCommand(s4.hooks?.Stop, STOP_CMD), true, 'on-stop hook still present alongside');

patchSettingsJson(settingsPath);
patchSettingsJson(settingsPath);
s4 = JSON.parse(readFileSync(settingsPath, 'utf8'));
assert.equal(
  stopAuditEntries(s4.hooks.Stop).length,
  1,
  'stop-audit hook is idempotent across re-installs'
);

writeFileSync(
  grokHooksPath,
  JSON.stringify({
    custom: { preserve: true },
    hooks: { CustomEvent: [{ command: 'user-hook' }] },
  }),
  'utf8'
);
installCli.patchGrokHooksJson(grokHooksPath);
installCli.patchGrokHooksJson(grokHooksPath);
const grokHooks = JSON.parse(readFileSync(grokHooksPath, 'utf8'));
assert.deepEqual(grokHooks.custom, { preserve: true }, 'Grok hook patch preserves unrelated JSON');
assert.deepEqual(
  grokHooks.hooks.CustomEvent,
  [{ command: 'user-hook' }],
  'Grok hook patch preserves unrelated event entries'
);
const timingCommand = installCli.grokHookCommand('timing');
const grokTimingEntries = Object.values(grokHooks.hooks)
  .flat()
  .filter((entry) => hasCommand([entry], timingCommand));
assert.ok(grokTimingEntries.length > 0, 'Grok hook patch registers timing through the bridge');
for (const entries of Object.values(grokHooks.hooks)) {
  assert.ok(
    entries.filter((entry) => hasCommand([entry], timingCommand)).length <= 1,
    'Grok timing bridge command is not duplicated within an event'
  );
}

function installedGrokCommand(event, handlerName) {
  const command = installCli.grokHookCommand(handlerName);
  assert.equal(
    (grokHooks.hooks[event] ?? []).filter((entry) => hasCommand([entry], command)).length,
    1,
    `${event} must contain the installed ${handlerName} command`
  );
  return command;
}

const nativeBase = {
  hookEventName: 'pre_tool_use',
  sessionId: 'grok-installed-command',
  timestamp: '2026-08-19T06:30:00.000Z',
};
for (const [handlerName, input, env] of [
  [
    'bash-guard',
    {
      ...nativeBase,
      toolName: 'run_terminal_command',
      toolInput: { command: 'rm -rf /' },
    },
    process.env,
  ],
  [
    'source-edit-gate',
    { ...nativeBase, toolName: 'write', toolInput: { file_path: 'README.md' } },
    { ...process.env, AI_TASK_MANAGER_PROJECT_DIR: tmp },
  ],
  [
    'agent-guard',
    {
      ...nativeBase,
      toolName: 'spawn_subagent',
      toolInput: { isolation: 'none' },
    },
    { ...process.env, PWD: findMainWorktreePath(process.cwd()) },
  ],
]) {
  const result = runInstalledCommand(installedGrokCommand('PreToolUse', handlerName), {
    input,
    env,
  });
  assert.equal(result.status, 2, `${handlerName}: ${result.stderr}`);
  assert.equal(JSON.parse(result.stdout).decision, 'deny', handlerName);
}

for (const [event, nativeEvent] of [
  ['SessionStart', 'session_start'],
  ['PreCompact', 'pre_compact'],
  ['PostCompact', 'post_compact'],
]) {
  const result = runInstalledCommand(installedGrokCommand(event, 'timing'), {
    input: {
      hookEventName: nativeEvent,
      sessionId: `grok-${nativeEvent}`,
      timestamp: `2026-08-19T06:31:0${nativeEvent.length % 10}.000Z`,
    },
    env: { ...process.env, AI_TASK_MANAGER_PROJECT_DIR: tmp },
  });
  assert.equal(result.status, 0, `${event}: ${result.stderr}`);
}

const missingBridge = runInstalledCommand(installCli.grokHookCommand('bash-guard'), {
  cwd: tmp,
  input: {
    ...nativeBase,
    toolName: 'run_terminal_command',
    toolInput: { command: 'rm -rf /' },
  },
});
assert.equal(missingBridge.status, 2, missingBridge.stderr);
assert.equal(JSON.parse(missingBridge.stdout).decision, 'deny');

const staleGrokHooksPath = path.join(tmp, '.grok-stale', 'hooks', 'aitm.json');
const bashCommand = installCli.grokHookCommand('bash-guard');
mkdirSync(path.dirname(staleGrokHooksPath), { recursive: true });
writeFileSync(
  staleGrokHooksPath,
  JSON.stringify({
    hooks: {
      PreToolUse: [
        { matcher: 'obsolete-bash-matcher', hooks: [{ type: 'command', command: bashCommand }] },
      ],
    },
  })
);
installCli.patchGrokHooksJson(staleGrokHooksPath);
const refreshedGrokHooks = JSON.parse(readFileSync(staleGrokHooksPath, 'utf8'));
assert.equal(
  refreshedGrokHooks.hooks.PreToolUse.filter((entry) => hasCommand([entry], bashCommand)).length,
  1,
  'Grok hook refresh replaces an obsolete matcher by bridge command identity'
);
assert.equal(
  refreshedGrokHooks.hooks.PreToolUse.find((entry) => hasCommand([entry], bashCommand)).matcher,
  'Bash'
);

const legacyMemoryHooksPath = path.join(tmp, '.grok-legacy-memory', 'hooks', 'aitm.json');
const legacyMemoryCommand =
  'node node_modules/ai-task-manager/scripts/task-tracker/hooks/grok-wire.mjs --handler memory-index';
const currentMemoryCommand = installCli.grokHookCommand('memory-index');
mkdirSync(path.dirname(legacyMemoryHooksPath), { recursive: true });
writeFileSync(
  legacyMemoryHooksPath,
  JSON.stringify({
    hooks: {
      PostCompact: [
        {
          matcher: 'manual|auto',
          hooks: [{ type: 'command', command: legacyMemoryCommand }],
        },
      ],
    },
  })
);
installCli.patchGrokHooksJson(legacyMemoryHooksPath, { memoryIndexHook: false });
const refreshedMemoryHooks = JSON.parse(readFileSync(legacyMemoryHooksPath, 'utf8'));
assert.equal(
  hasCommand(refreshedMemoryHooks.hooks.PostCompact, legacyMemoryCommand),
  false,
  'normal reinstall removes the obsolete bare memory-index command'
);
assert.equal(
  hasCommand(refreshedMemoryHooks.hooks.PostCompact, currentMemoryCommand),
  true,
  'normal reinstall migrates an existing optional memory-index hook to the safe bootstrap'
);
assert.equal(
  hasCommand(refreshedMemoryHooks.hooks.SessionStart, currentMemoryCommand),
  false,
  'normal reinstall does not add a second optional memory-index event without opt-in'
);

function grokEntries(event, matcher, handlerName) {
  const command = installCli.grokHookCommand(handlerName);
  return (grokHooks.hooks[event] ?? []).filter(
    (entry) => entry.matcher === matcher && hasCommand([entry], command)
  );
}

for (const [event, matcher, handlerName] of [
  ['SessionStart', 'startup|resume|clear|compact', 'seed'],
  ['SessionStart', 'startup|resume|clear|compact', 'timing'],
  ['PreCompact', 'manual|auto', 'timing'],
  ['PostCompact', 'manual|auto', 'timing'],
  ['PreToolUse', 'Bash', 'bash-guard'],
  ['PreToolUse', 'Bash', 'activity-guard'],
  ['PreToolUse', 'Edit|Write|NotebookEdit|search_replace|write', 'activity-guard'],
  ['PreToolUse', 'Edit|Write|NotebookEdit|search_replace|write', 'source-edit-gate'],
  ['PreToolUse', 'Agent|Task|spawn_subagent', 'agent-guard'],
]) {
  assert.equal(
    grokEntries(event, matcher, handlerName).length,
    1,
    `${event} ${matcher} must register ${handlerName} exactly once`
  );
}

const memoryGrokHooksPath = path.join(tmp, '.grok-memory', 'hooks', 'aitm.json');
installCli.patchGrokHooksJson(memoryGrokHooksPath, { memoryIndexHook: true });
installCli.patchGrokHooksJson(memoryGrokHooksPath, { memoryIndexHook: true });
const memoryGrokHooks = JSON.parse(readFileSync(memoryGrokHooksPath, 'utf8'));
const memoryCommand = installCli.grokHookCommand('memory-index');
for (const [event, matcher] of [
  ['SessionStart', 'startup|resume|clear|compact'],
  ['PostCompact', 'manual|auto'],
]) {
  assert.equal(
    (memoryGrokHooks.hooks[event] ?? []).filter(
      (entry) => entry.matcher === matcher && hasCommand([entry], memoryCommand)
    ).length,
    1,
    `${event} memory-index bridge command must be idempotent`
  );
}

rmSync(tmp, { recursive: true });
console.log('install-hooks.test.mjs: all passed');
