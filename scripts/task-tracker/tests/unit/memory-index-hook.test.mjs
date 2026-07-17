// @story #728
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import { buildMemoryIndexContext, runMemoryIndexHook } from '../../hooks/memory-index.mjs';
import { patchSettingsJson } from '../../../../bin/cli.mjs';
import { hookBootstrapCommand } from '../../lib/guard-entrypoint.mjs';

// #869 — lifecycle hooks register via the node_modules-first / repo-relative
// bootstrap shim, matching cli.mjs. Compute the expected command the same way.
const MEMORY_INDEX_HOOK_CMD = hookBootstrapCommand('scripts/task-tracker/hooks/memory-index.mjs');

function tmp() {
  return mkdtempSync(join(projectScratchDir('test'), 'aitm-idx-'));
}

test('buildMemoryIndexContext prefixes the recall instruction over the index body', () => {
  const dir = tmp();
  try {
    const p = join(dir, 'MEMORY.md');
    writeFileSync(p, '- [A](feedback_a.md) — hook a\n- [B](reference_b.md) — hook b\n');
    const ctx = buildMemoryIndexContext({ indexPath: p });
    assert.match(ctx, /recall on demand/i, 'the recall-on-demand preface is present');
    assert.match(ctx, /feedback_a\.md/, 'the index body is included');
    assert.match(ctx, /grep/i, 'preface tells the reader to grep the memory dir');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('buildMemoryIndexContext returns null when the index is missing or empty', () => {
  const dir = tmp();
  try {
    assert.equal(buildMemoryIndexContext({ indexPath: join(dir, 'nope.md') }), null);
    const empty = join(dir, 'MEMORY.md');
    writeFileSync(empty, '   \n\n');
    assert.equal(buildMemoryIndexContext({ indexPath: empty }), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runMemoryIndexHook emits additionalContext on SessionStart, only the index', async () => {
  const dir = tmp();
  try {
    const memDir = join(dir, '.ai-task-manager', 'memory');
    mkdirSync(memDir, { recursive: true });
    writeFileSync(join(memDir, 'MEMORY.md'), '- [A](feedback_a.md) — hook a\n');
    // A per-fact file that must NEVER be emitted.
    writeFileSync(join(memDir, 'feedback_a.md'), 'FULL SECRET CORPUS BODY');

    let out = '';
    const code = await runMemoryIndexHook({
      stdin: JSON.stringify({ hook_event_name: 'SessionStart' }),
      cwd: dir,
      stdout: (s) => (out += s),
    });
    assert.equal(code, 0);
    const parsed = JSON.parse(out);
    assert.equal(parsed.hookSpecificOutput.hookEventName, 'SessionStart');
    assert.match(parsed.hookSpecificOutput.additionalContext, /feedback_a\.md/);
    assert.doesNotMatch(
      parsed.hookSpecificOutput.additionalContext,
      /FULL SECRET CORPUS BODY/,
      'the full per-fact corpus is never emitted — only the index'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runMemoryIndexHook is silent for non-SessionStart/PostCompact events', async () => {
  const dir = tmp();
  try {
    const memDir = join(dir, '.ai-task-manager', 'memory');
    mkdirSync(memDir, { recursive: true });
    writeFileSync(join(memDir, 'MEMORY.md'), '- [A](feedback_a.md)\n');
    let out = '';
    const code = await runMemoryIndexHook({
      stdin: JSON.stringify({ hook_event_name: 'PreCompact' }),
      cwd: dir,
      stdout: (s) => (out += s),
    });
    assert.equal(code, 0);
    assert.equal(out, '', 'no output for an unrelated event');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('patchSettingsJson registers the index hook only when memoryIndexHook=true', () => {
  const dir = tmp();
  try {
    const settingsPath = join(dir, 'settings.json');

    patchSettingsJson(settingsPath, { memoryIndexHook: false });
    let settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    const hasHook = (s) =>
      ['SessionStart', 'PostCompact'].every((ev) =>
        (s.hooks[ev] || []).some((h) =>
          h.hooks?.some((inner) => inner.command === MEMORY_INDEX_HOOK_CMD)
        )
      );
    assert.equal(hasHook(settings), false, 'no index hook when seed selection was none');

    // Re-run with the flag on; the hook is now registered on both events.
    patchSettingsJson(settingsPath, { memoryIndexHook: true });
    settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    assert.equal(hasHook(settings), true, 'index hook registered on SessionStart + PostCompact');

    // Idempotent: a third run does not duplicate.
    patchSettingsJson(settingsPath, { memoryIndexHook: true });
    settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    for (const ev of ['SessionStart', 'PostCompact']) {
      const count = settings.hooks[ev].filter((h) =>
        h.hooks?.some((inner) => inner.command === MEMORY_INDEX_HOOK_CMD)
      ).length;
      assert.equal(count, 1, `exactly one index-hook entry on ${ev}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
