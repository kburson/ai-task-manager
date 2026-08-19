#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const EVENTS = Object.freeze({
  session_start: 'SessionStart',
  pre_tool_use: 'PreToolUse',
  pre_compact: 'PreCompact',
  post_compact: 'PostCompact',
});

const TOOLS = Object.freeze({
  run_terminal_command: 'Bash',
  search_replace: 'Edit',
  write: 'Write',
  spawn_subagent: 'Agent',
});

const HANDLERS = Object.freeze({
  seed: fileURLToPath(new URL('../ensure-worktree-seeded.mjs', import.meta.url)),
  timing: fileURLToPath(new URL('../hook-handler.mjs', import.meta.url)),
  'memory-index': fileURLToPath(new URL('./memory-index.mjs', import.meta.url)),
  'bash-guard': fileURLToPath(new URL('../bash-guard.mjs', import.meta.url)),
  'activity-guard': fileURLToPath(new URL('../activity-guard.mjs', import.meta.url)),
  'source-edit-gate': fileURLToPath(new URL('../source-edit-gate.mjs', import.meta.url)),
  'agent-guard': fileURLToPath(new URL('../agent-guard.mjs', import.meta.url)),
});

function deny(reason) {
  return {
    status: 2,
    stdout: JSON.stringify({ decision: 'deny', reason }),
    stderr: '',
  };
}

export function normalizeGrokEnvelope(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Grok hook envelope must be an object');
  }
  const nativeEvent = input.hookEventName ?? input.hook_event_name;
  const nativeTool = input.toolName ?? input.tool_name;
  return {
    hook_event_name: EVENTS[nativeEvent] ?? nativeEvent,
    session_id: input.sessionId ?? input.session_id,
    tool_name: TOOLS[nativeTool] ?? nativeTool,
    tool_input: input.toolInput ?? input.tool_input,
    prompt_id: input.promptId ?? input.prompt_id,
    event_timestamp: input.timestamp ?? input.eventTimestamp ?? input.event_timestamp,
  };
}

export function translateGrokDecision(result) {
  const translated = {
    status: result.status ?? 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
  if (!translated.stdout.trim()) return translated;
  try {
    const payload = JSON.parse(translated.stdout);
    if (payload?.decision === 'block') {
      return {
        ...translated,
        status: 2,
        stdout: JSON.stringify({ ...payload, decision: 'deny' }),
      };
    }
  } catch {
    return translated;
  }
  return translated;
}

export function runGrokHandler({
  handlerName,
  input,
  spawnHandler = spawnSync,
  cwd = process.cwd(),
  env = process.env,
} = {}) {
  const handlerPath = HANDLERS[handlerName];
  if (!handlerPath || !existsSync(handlerPath)) {
    return deny(`Grok hook handler is unavailable: ${handlerName || '(missing)'}`);
  }

  const result = spawnHandler(process.execPath, [handlerPath], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    cwd,
    env,
  });
  const normalizedResult = {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
  const translated = translateGrokDecision(normalizedResult);
  if (translated.status === 2) return translated;
  if (normalizedResult.status !== 0) {
    const diagnostic = `[grok-wire] shared handler ${handlerName} crashed; failing open`;
    return {
      status: 0,
      stdout: normalizedResult.stdout,
      stderr: [normalizedResult.stderr.trim(), diagnostic].filter(Boolean).join('\n') + '\n',
    };
  }
  return translated;
}

function runCli() {
  const handlerIndex = process.argv.indexOf('--handler');
  const handlerName = handlerIndex >= 0 ? process.argv[handlerIndex + 1] : null;
  let nativeInput;
  try {
    nativeInput = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    const result = deny('Malformed Grok hook envelope');
    process.stdout.write(result.stdout);
    process.exit(result.status);
  }

  let input;
  try {
    input = normalizeGrokEnvelope(nativeInput);
  } catch (error) {
    const result = deny(error.message);
    process.stdout.write(result.stdout);
    process.exit(result.status);
  }
  const result = runGrokHandler({ handlerName, input });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();
