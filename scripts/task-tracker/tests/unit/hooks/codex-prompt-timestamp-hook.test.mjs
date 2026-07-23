#!/usr/bin/env node
// @story #466
import { strict as assert } from 'node:assert';

import {
  buildPromptTimestampContext,
  runCodexPromptTimestampHook,
} from '../../../hooks/codex-prompt-timestamp.mjs';

const payload = {
  session_id: 'sid-123',
  turn_id: 'turn-456',
  hook_event_name: 'UserPromptSubmit',
  cwd: '/repo',
  prompt: 'please continue',
};

const context = buildPromptTimestampContext(payload, {
  now: () => new Date('2026-06-19T14:00:00.000Z'),
});
assert.match(context, /User prompt submitted at 2026-06-19T14:00:00.000Z/);
assert.match(context, /turn turn-456/);

let stdout = '';
let stderr = '';
const ok = await runCodexPromptTimestampHook({
  stdin: JSON.stringify(payload),
  now: () => new Date('2026-06-19T14:00:00.000Z'),
  stdout: (s) => {
    stdout += s;
  },
  stderr: (s) => {
    stderr += s;
  },
});
assert.equal(ok, 0);
assert.equal(stderr, '');
const parsed = JSON.parse(stdout);
assert.deepEqual(parsed, {
  hookSpecificOutput: {
    hookEventName: 'UserPromptSubmit',
    additionalContext:
      'User prompt submitted at 2026-06-19T14:00:00.000Z (turn turn-456). Use this timestamp when reasoning about conversation drift or relative-time references.',
  },
});

stdout = '';
stderr = '';
const malformed = await runCodexPromptTimestampHook({
  stdin: '{',
  stdout: (s) => {
    stdout += s;
  },
  stderr: (s) => {
    stderr += s;
  },
});
assert.equal(malformed, 0);
assert.equal(stdout, '');
assert.match(stderr, /ignored malformed hook input/);

console.log('codex-prompt-timestamp-hook.test.mjs: all assertions passed');
