#!/usr/bin/env node
// @story #1324

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WIRE = path.resolve(__dirname, '../../../../task-tracker/hooks/grok-wire.mjs');
const wireModule = await import('../../../../task-tracker/hooks/grok-wire.mjs').catch(() => null);
assert.ok(wireModule, 'Grok wire bridge module must exist');

const { normalizeGrokEnvelope, runGrokHandler, translateGrokDecision } = wireModule;

const normalized = normalizeGrokEnvelope({
  hookEventName: 'pre_tool_use',
  sessionId: 'grok-sid',
  toolName: 'run_terminal_command',
  toolInput: { command: 'rm -rf /' },
  timestamp: '2026-08-18T20:00:00.000Z',
  promptId: 'prompt-1',
});
assert.deepEqual(normalized, {
  hook_event_name: 'PreToolUse',
  session_id: 'grok-sid',
  tool_name: 'Bash',
  tool_input: { command: 'rm -rf /' },
  prompt_id: 'prompt-1',
  event_timestamp: '2026-08-18T20:00:00.000Z',
});

for (const [nativeEvent, sharedEvent] of [
  ['session_start', 'SessionStart'],
  ['pre_compact', 'PreCompact'],
  ['post_compact', 'PostCompact'],
]) {
  assert.equal(normalizeGrokEnvelope({ hookEventName: nativeEvent }).hook_event_name, sharedEvent);
}
for (const [nativeTool, sharedTool] of [
  ['search_replace', 'Edit'],
  ['write', 'Write'],
  ['spawn_subagent', 'Agent'],
]) {
  assert.equal(normalizeGrokEnvelope({ toolName: nativeTool }).tool_name, sharedTool);
}

assert.deepEqual(
  translateGrokDecision({ status: 0, stdout: '{"decision":"block","reason":"x"}', stderr: '' }),
  { status: 2, stdout: '{"decision":"deny","reason":"x"}', stderr: '' }
);
assert.deepEqual(translateGrokDecision({ status: 0, stdout: '', stderr: '' }), {
  status: 0,
  stdout: '',
  stderr: '',
});

const missing = runGrokHandler({ handlerName: 'not-allowlisted', input: normalized });
assert.equal(missing.status, 2);
assert.equal(JSON.parse(missing.stdout).decision, 'deny');

const crashed = runGrokHandler({
  handlerName: 'bash-guard',
  input: normalized,
  spawnHandler: () => ({ status: 1, stdout: '', stderr: 'synthetic boom' }),
});
assert.equal(crashed.status, 0, 'an existing shared handler crash remains diagnostic fail-open');
assert.match(crashed.stderr, /synthetic boom/);

const malformed = spawnSync(process.execPath, [WIRE, '--handler', 'bash-guard'], {
  input: '{bad json',
  encoding: 'utf8',
});
assert.equal(malformed.status, 2);
assert.equal(JSON.parse(malformed.stdout).decision, 'deny');

const denied = spawnSync(process.execPath, [WIRE, '--handler', 'bash-guard'], {
  input: JSON.stringify({
    hookEventName: 'pre_tool_use',
    sessionId: 'grok-sid',
    toolName: 'run_terminal_command',
    toolInput: { command: 'rm -rf /' },
  }),
  encoding: 'utf8',
});
assert.equal(denied.status, 2);
assert.equal(JSON.parse(denied.stdout).decision, 'deny');

const allowed = spawnSync(process.execPath, [WIRE, '--handler', 'source-edit-gate'], {
  input: JSON.stringify({
    hookEventName: 'pre_tool_use',
    sessionId: 'grok-sid',
    toolName: 'write',
    toolInput: { file_path: '.tmp/grok-wire-allowed.txt' },
  }),
  encoding: 'utf8',
});
assert.equal(allowed.status, 0, allowed.stderr);

console.log('grok-wire.test.mjs: all passed');
