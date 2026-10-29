// @story #2106
// @story #2088
// The native command is exercised in an offline fixture, not a genuine worker.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { guardBootstrapCommand } from '../../../../task-tracker/lib/guard-entrypoint.mjs';
import { createRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
const source = fileURLToPath(new URL('../../../../..', import.meta.url));
test('the generated native source-edit loader actually executes the installed-target refusal', () => {
  const root = createRuntimeRootFixture('source-edit-bootstrap-');
  try {
    for (const directory of [
      'bin',
      'scripts',
      'config',
      'guidance',
      'instructions',
      'docs',
      'skill',
    ])
      cpSync(path.join(source, directory), path.join(root, directory), { recursive: true });
    cpSync(path.join(source, 'package.json'), path.join(root, 'package.json'));
    const env = {
      ...process.env,
      CODEX_THREAD_ID: 'source-edit-bootstrap-fixture',
      CODEX_SESSION_ID: 'source-edit-bootstrap-fixture',
    };
    for (const key of [
      'AI_TASK_MANAGER_SESSION_ID',
      'AI_TASK_MANAGER_PROJECT_DIR',
      'TASK_TRACKER_PROJECT_DIR',
      'CLAUDE_PROJECT_DIR',
      'AITM_CAPTURE_PROJECT_DIR',
    ])
      delete env[key];
    const input = JSON.stringify({
      session_id: env.CODEX_THREAD_ID,
      cwd: root,
      tool_name: 'apply_patch',
      tool_input: {
        command:
          '*** Begin Patch\n*** Update File: node_modules/@kburson/ai-task-manager/scripts/task-tracker/activity-guard.mjs\n@@\n-old\n+new\n*** End Patch',
      },
    });
    const options = { cwd: root, env, input, encoding: 'utf8' };
    const direct = spawnSync(
      process.execPath,
      [path.join(root, 'scripts/task-tracker/source-edit-gate.mjs')],
      options
    );
    assert.equal(direct.status, 0, direct.stderr);
    assert.equal(JSON.parse(direct.stdout).decision, 'block');
    assert.match(JSON.parse(direct.stdout).reason, /installed guard/i);
    const bootstrapped = spawnSync(
      '/bin/sh',
      ['-c', guardBootstrapCommand('source-edit-gate')],
      options
    );
    assert.equal(bootstrapped.status, 0, bootstrapped.stderr);
    assert.notEqual(
      bootstrapped.stdout.trim(),
      '',
      'importing the guard must actually run its checks'
    );
    assert.equal(JSON.parse(bootstrapped.stdout).decision, 'block');
    assert.match(JSON.parse(bootstrapped.stdout).reason, /installed guard/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
