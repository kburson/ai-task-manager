#!/usr/bin/env node
// Codex `UserPromptSubmit` hook — injects the prompt submission timestamp as
// additional developer context. Codex documents context injection for this
// event; it does not document in-place mutation of the submitted user prompt.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

export function buildPromptTimestampContext(payload = {}, { now = () => new Date() } = {}) {
  const ts = now().toISOString();
  const turn = payload.turn_id ? ` (turn ${payload.turn_id})` : '';
  return `User prompt submitted at ${ts}${turn}. Use this timestamp when reasoning about conversation drift or relative-time references.`;
}

export async function runCodexPromptTimestampHook({
  stdin = readStdin(),
  now = () => new Date(),
  stdout = (s) => process.stdout.write(s),
  stderr = (s) => process.stderr.write(s),
} = {}) {
  let payload;
  try {
    payload = JSON.parse(stdin || '{}');
  } catch {
    stderr('[task-tracker] codex-prompt-timestamp ignored malformed hook input\n');
    return 0;
  }

  if (payload.hook_event_name && payload.hook_event_name !== 'UserPromptSubmit') {
    return 0;
  }

  const additionalContext = buildPromptTimestampContext(payload, { now });
  stdout(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext,
      },
    }) + '\n'
  );
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runCodexPromptTimestampHook()
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(`[task-tracker] codex-prompt-timestamp failed: ${err.message}\n`);
      process.exit(0);
    });
}
