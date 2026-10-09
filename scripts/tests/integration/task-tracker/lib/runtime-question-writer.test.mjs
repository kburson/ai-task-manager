// @story #1857
import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, readFileSync, writeFileSync, symlinkSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createActivatedRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { statePath } from '../../../../task-tracker/paths.mjs';
import { saveState, loadState } from '../../../../task-tracker/state.mjs';
import { currentSessionId } from '../../../../task-tracker/word-counter.mjs';
import { recordAskPause, finalizeAskResume, pendingAskPath } from '../../../../task-tracker/hooks/on-ask.mjs';
import { inspectRuntimeWriterLeases } from '../../../../task-tracker/lib/runtime-migration-lock.mjs';

test('question publication leases cover awaits while human wait is unleased and volatile marker aliases refuse', async () => {
  const root = await createActivatedRuntimeRootFixture('question-durable-');
  const cwd = process.cwd();
  const aliases = ['AI_TASK_MANAGER_PROJECT_DIR', 'TASK_TRACKER_PROJECT_DIR', 'CLAUDE_PROJECT_DIR', 'AITM_CAPTURE_PROJECT_DIR'];
  const previous = new Map(aliases.map((key) => [key, process.env[key]]));
  try {
    process.chdir(root);
    aliases.forEach((key) => delete process.env[key]);
    const sid = currentSessionId();
    const env = { ...process.env, AI_TASK_MANAGER_SESSION_ID: sid };
    const roots = { projectRoot: root, mainRoot: root };
    const file = statePath(root);
    const observedAt = Date.now();
    saveState({ active: '#1857', entryStartTs: new Date(observedAt - 1000).toISOString(), wordsAtEntryStart: 0, lastWordMarker: 3, lastFullWordMarker: 5 }, file);
    const context = {
      projectDir: root, statePath: file,
      flushActiveToGH: async () => {
        assert.equal(inspectRuntimeWriterLeases(roots).length, 1, 'pause publication retains its operation lease');
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(inspectRuntimeWriterLeases(roots).length, 1);
        return { ts: new Date(observedAt).toISOString(), row: 'fixture pause' };
      },
      safePostTiming: async () => {
        assert.equal(inspectRuntimeWriterLeases(roots).length, 1, 'resume publication retains its operation lease');
        await new Promise((resolve) => setImmediate(resolve));
        return { ok: true };
      },
    };
    assert.equal((await recordAskPause({ env, deps: { context } })).status, 'ok');
    assert.equal(inspectRuntimeWriterLeases(roots).length, 0, 'human answer wait is not an active writer');
    const marker = pendingAskPath(sid, root);
    const original = readFileSync(marker);
    const alias = path.join(root, '.tmp', 'question.json');
    mkdirSync(path.dirname(alias), { recursive: true });
    writeFileSync(alias, original);
    rmSync(marker);
    symlinkSync(alias, marker);
    await assert.rejects(finalizeAskResume({ env, deps: { context } }), { code: 'RUNTIME_OVERRIDE_UNSAFE' });
    rmSync(marker);
    writeFileSync(marker, original);
    assert.equal((await finalizeAskResume({ env, deps: { context } })).status, 'ok');
    assert.ok(loadState(file).entryStartTs);
    assert.equal(inspectRuntimeWriterLeases(roots).length, 0);
  } finally {
    process.chdir(cwd);
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
});
