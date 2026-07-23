// @story #653
// Coverage + behaviour for `scripts/task-tracker/hooks/codex-prompt-timestamp.mjs`,
// the Codex `UserPromptSubmit` hook that injects the prompt-submission timestamp
// as additional developer context.
//
// Two complementary surfaces:
//   1. The exported functions (`buildPromptTimestampContext`,
//      `runCodexPromptTimestampHook`) are imported and called directly with
//      injected `now`/`stdin`/`stdout`/`stderr` fakes — no real clock, no real
//      fds. This drives the parse-error, wrong-event, turn-present, and
//      turn-absent branches deterministically.
//   2. The executable guard (`isMain` + `readStdin`'s `readFileSync(0)`) only
//      runs when the file is the process entrypoint, so it is driven as a child
//      process via `spawnSync(node, [hook])` with stdin piped in.
//
// The pre-existing `codex-prompt-timestamp-hook.test.mjs` (#466) covers the
// happy path + malformed input; this file adds the uncovered branches to clear
// the Group G (#587) ≥80% bar.

import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  buildPromptTimestampContext,
  runCodexPromptTimestampHook,
} from '../../../hooks/codex-prompt-timestamp.mjs';

const HOOK = fileURLToPath(new URL('../../../hooks/codex-prompt-timestamp.mjs', import.meta.url));
const FIXED = () => new Date('2026-06-29T05:00:00.000Z');

function runHook(stdin) {
  return spawnSync(process.execPath, [HOOK], { input: stdin, encoding: 'utf8' });
}

// ---------------------------------------------------------------------------
// 1. buildPromptTimestampContext
// ---------------------------------------------------------------------------

test('buildPromptTimestampContext appends the turn suffix when turn_id present', () => {
  const ctx = buildPromptTimestampContext({ turn_id: 'turn-789' }, { now: FIXED });
  assert.match(ctx, /User prompt submitted at 2026-06-29T05:00:00.000Z/);
  assert.match(ctx, /\(turn turn-789\)/);
});

test('buildPromptTimestampContext omits the turn suffix when turn_id absent', () => {
  const ctx = buildPromptTimestampContext({}, { now: FIXED });
  assert.match(ctx, /User prompt submitted at 2026-06-29T05:00:00.000Z\. Use this timestamp/);
  assert.doesNotMatch(ctx, /turn/);
});

test('buildPromptTimestampContext defaults payload and clock when omitted', () => {
  const ctx = buildPromptTimestampContext();
  assert.match(ctx, /^User prompt submitted at \d{4}-\d{2}-\d{2}T/);
  assert.doesNotMatch(ctx, /turn/);
});

// ---------------------------------------------------------------------------
// 2. runCodexPromptTimestampHook
// ---------------------------------------------------------------------------

test('runCodexPromptTimestampHook emits hookSpecificOutput for UserPromptSubmit', async () => {
  let stdout = '';
  let stderr = '';
  const code = await runCodexPromptTimestampHook({
    stdin: JSON.stringify({ hook_event_name: 'UserPromptSubmit', turn_id: 't1' }),
    now: FIXED,
    stdout: (s) => (stdout += s),
    stderr: (s) => (stderr += s),
  });
  assert.equal(code, 0);
  assert.equal(stderr, '');
  assert.deepEqual(JSON.parse(stdout), {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext:
        'User prompt submitted at 2026-06-29T05:00:00.000Z (turn t1). Use this timestamp when reasoning about conversation drift or relative-time references.',
    },
  });
});

test('runCodexPromptTimestampHook short-circuits a non-UserPromptSubmit event', async () => {
  let stdout = '';
  let stderr = '';
  const code = await runCodexPromptTimestampHook({
    stdin: JSON.stringify({ hook_event_name: 'SessionStart' }),
    now: FIXED,
    stdout: (s) => (stdout += s),
    stderr: (s) => (stderr += s),
  });
  assert.equal(code, 0);
  assert.equal(stdout, '');
  assert.equal(stderr, '');
});

test('runCodexPromptTimestampHook treats empty stdin as an empty payload', async () => {
  let stdout = '';
  const code = await runCodexPromptTimestampHook({
    stdin: '',
    now: FIXED,
    stdout: (s) => (stdout += s),
    stderr: () => {},
  });
  assert.equal(code, 0);
  // No hook_event_name → falls through to emit context.
  assert.deepEqual(JSON.parse(stdout).hookSpecificOutput.hookEventName, 'UserPromptSubmit');
});

test('runCodexPromptTimestampHook reports malformed JSON to stderr and returns 0', async () => {
  let stdout = '';
  let stderr = '';
  const code = await runCodexPromptTimestampHook({
    stdin: 'not json',
    stdout: (s) => (stdout += s),
    stderr: (s) => (stderr += s),
  });
  assert.equal(code, 0);
  assert.equal(stdout, '');
  assert.match(stderr, /ignored malformed hook input/);
});

// ---------------------------------------------------------------------------
// 3. Executable entrypoint (isMain guard + readStdin real fd)
// ---------------------------------------------------------------------------

test('hook run as a process emits context for a piped UserPromptSubmit payload', () => {
  const res = runHook(JSON.stringify({ hook_event_name: 'UserPromptSubmit', turn_id: 'tX' }));
  assert.equal(res.status, 0);
  const parsed = JSON.parse(res.stdout);
  assert.equal(parsed.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(parsed.hookSpecificOutput.additionalContext, /\(turn tX\)/);
});

test('hook run as a process ignores malformed stdin without failing', () => {
  const res = runHook('{ broken');
  assert.equal(res.status, 0);
  assert.equal(res.stdout, '');
  assert.match(res.stderr, /ignored malformed hook input/);
});
