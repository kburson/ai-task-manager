#!/usr/bin/env node
// @story #309
import { createCommittedLegacyRootFixture } from '../../../helpers/legacy-runtime-root-fixture.mjs';
import {
  withUnitRuntimeRoot,
  unitRuntimeEntrypointArgs,
} from '../../../helpers/unit-runtime-root.mjs';
import { initializeFixtureActor } from '../../../helpers/fixture-actor.mjs';
import { loadState } from '../../../../task-tracker/state.mjs';
initializeFixtureActor(import.meta.url);
import { strict as assert } from 'node:assert';
import '../../../fixtures/offline-gh-auto.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import {
  projectScratchDir,
  mkdtempProjectIsolated,
} from '../../../../task-tracker/lib/scratch-dir.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

await withUnitRuntimeRoot(async () => {
  async function lifecycleFixture(prefix) {
    const root = await createCommittedLegacyRootFixture(prefix);
    writeFileSync(path.join(root, '.git', 'info', 'exclude'), '.ai-task-manager/\n.tmp/\n');
    return root;
  }
  const pexec = promisify(execFile);
  const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
  const CLI = path.resolve(__dir, '../../../task-tracker/task-tracker.mjs');

  const sandbox = await lifecycleFixture('tt-lifecycle-');
  mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify({ repo: 'test-owner/test-repo' }, null, 2)
  );
  const env = { ...process.env, AI_TASK_MANAGER_PROJECT_DIR: sandbox, TT_SKIP_NETWORK: '1' };

  let r = await pexec('node', unitRuntimeEntrypointArgs(CLI, ['#321']), { env, cwd: sandbox });
  assert.match(r.stdout, /Active: #321/);

  r = await pexec('node', unitRuntimeEntrypointArgs(CLI, ['review', '#321']), {
    env,
    cwd: sandbox,
  });
  assert.doesNotMatch(r.stdout, /PROMPT_REQUIRED: review-approval/);

  let state = loadState(path.join(sandbox, '.tmp', 'aitm', 'state', 'task-tracker-state.json'));
  // A no-network probe has not completed agent Review, so it must not pause for
  // human approval. The issue stays bound and its timing segment remains open.
  assert.equal(state.active, '#321');
  assert.equal(typeof state.entryStartTs, 'string');
  assert.equal(state.lastActive, '#321');

  r = await pexec('node', unitRuntimeEntrypointArgs(CLI, ['close', '#321']), { env, cwd: sandbox });
  assert.match(r.stdout, /Closed #321/);

  r = await pexec('node', unitRuntimeEntrypointArgs(CLI, ['help']), { env, cwd: sandbox });
  assert.match(r.stdout, /\/task review #N/);
  assert.match(r.stdout, /\/task close \[#N\]/);

  // #142: `close #N` with a different active task must REFUSE (exit 7,
  // PROMPT_REQUIRED: bind-mismatch). The prior silent-cross-close behavior
  // was the bug being fixed — see scripts/tests/unit/task-tracker/lib/close-cross-close.test.mjs.
  {
    const sandbox2 = await lifecycleFixture('tt-close-target-');
    mkdirSync(path.join(sandbox2, '.ai-task-manager'), { recursive: true });
    writeFileSync(
      path.join(sandbox2, '.ai-task-manager', 'task-tracker.json'),
      JSON.stringify({ repo: 'test-owner/test-repo' }, null, 2)
    );
    const env2 = { ...process.env, AI_TASK_MANAGER_PROJECT_DIR: sandbox2, TT_SKIP_NETWORK: '1' };

    await pexec('node', unitRuntimeEntrypointArgs(CLI, ['#385']), { env: env2, cwd: sandbox2 });
    let st = loadState(path.join(sandbox2, '.tmp', 'aitm', 'state', 'task-tracker-state.json'));
    assert.equal(st.active, '#385');

    let refusalErr = null;
    try {
      await pexec('node', unitRuntimeEntrypointArgs(CLI, ['close', '#386']), {
        env: env2,
        cwd: sandbox2,
      });
    } catch (e) {
      refusalErr = e;
    }
    assert.ok(refusalErr, 'cross-close must refuse with non-zero exit');
    assert.equal(refusalErr.code, 7, 'cross-close refusal must exit 7');
    assert.match(refusalErr.stdout, /PROMPT_REQUIRED: bind-mismatch #385:#386/);

    st = loadState(path.join(sandbox2, '.tmp', 'aitm', 'state', 'task-tracker-state.json'));
    assert.equal(st.active, '#385', 'active session must remain #385 after refusal');

    rmSync(sandbox2, { recursive: true });
  }

  // Bug fix: `close #N` with no active task closes the named issue (existing behavior).
  {
    const sandbox3 = await lifecycleFixture('tt-close-noactive-');
    mkdirSync(path.join(sandbox3, '.ai-task-manager'), { recursive: true });
    writeFileSync(
      path.join(sandbox3, '.ai-task-manager', 'task-tracker.json'),
      JSON.stringify({ repo: 'test-owner/test-repo' }, null, 2)
    );
    const env3 = { ...process.env, AI_TASK_MANAGER_PROJECT_DIR: sandbox3, TT_SKIP_NETWORK: '1' };

    const closeResult = await pexec('node', unitRuntimeEntrypointArgs(CLI, ['close', '#400']), {
      env: env3,
      cwd: sandbox3,
    });
    assert.match(closeResult.stdout, /Closed #400/);

    const st = loadState(path.join(sandbox3, '.tmp', 'aitm', 'state', 'task-tracker-state.json'));
    assert.equal(st.active, null, 'active should be cleared when closing the only/active issue');

    rmSync(sandbox3, { recursive: true });
  }

  rmSync(sandbox, { recursive: true });
  console.log('lifecycle.test.mjs: all passed');
});
