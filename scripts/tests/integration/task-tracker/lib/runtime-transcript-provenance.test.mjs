// @story #1857
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { createActivatedRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { transcriptDir, jsonlPath, currentSessionId, aiAppName, appStateDir } from '../../../../task-tracker/word-counter.mjs';
import { listProviders, getProvider } from '../../../../providers/index.mjs';

test('transcript evidence cannot be redirected to volatile artifacts or physical aliases', async () => {
  const root = await createActivatedRuntimeRootFixture('transcript-provenance-');
  const cwd = process.cwd();
  const keys = ['AI_TASK_MANAGER_PROJECT_DIR','TASK_TRACKER_PROJECT_DIR','CLAUDE_PROJECT_DIR','AITM_CAPTURE_PROJECT_DIR','AI_TASK_MANAGER_TRANSCRIPT_DIR'];
  const prior = new Map(keys.map((key) => [key, process.env[key]]));
  try {
    process.chdir(root);
    keys.forEach((key) => delete process.env[key]);
    const volatile = path.join(root, '.scratch', 'transcripts');
    mkdirSync(volatile, { recursive: true });
    process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR = volatile;
    assert.throws(() => transcriptDir(), { code: 'RUNTIME_OVERRIDE_UNSAFE' });
    delete process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR;
    const local = path.join(appStateDir(), 'session-transcripts');
    mkdirSync(path.dirname(local), { recursive: true });
    symlinkSync(volatile, local);
    assert.throws(() => jsonlPath(currentSessionId()), { code: 'RUNTIME_OVERRIDE_UNSAFE' });
    rmSync(local);
    mkdirSync(local);
    const file = path.join(local, currentSessionId() + '.jsonl');
    writeFileSync(file, '');
    assert.equal(transcriptDir(), local);
    assert.equal(jsonlPath(currentSessionId()), file);
    assert.ok(aiAppName());
  } finally {
    process.chdir(cwd);
    for (const [key, value] of prior) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    rmSync(root, { recursive: true, force: true });
  }
});
test('all provider cursor namespaces are durable runtime stores', () => {
  for (const provider of listProviders())
    assert.equal(getProvider(provider).stateDir, '.ai-task-manager/runtime/store/app/' + provider);
});
