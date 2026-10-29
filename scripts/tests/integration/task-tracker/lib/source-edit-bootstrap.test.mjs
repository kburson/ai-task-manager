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

test('canonical hook writer replaces exactly the known dormant command and preserves user hooks', async () => {
  const { readFileSync, mkdirSync, writeFileSync } = await import('node:fs');
  const { patchCodexHooksJson } = await import('../../../../../bin/cli.mjs');
  const predecessor = JSON.parse(
    readFileSync(
      new URL('../../../fixtures/2106-source-edit-predecessor.json', import.meta.url),
      'utf8'
    )
  );
  const root = createRuntimeRootFixture('source-edit-upgrade-');
  try {
    const file = path.join(root, '.codex', 'hooks.json');
    mkdirSync(path.dirname(file), { recursive: true });
    const user = {
      matcher: 'apply_patch',
      hooks: [{ type: 'command', command: 'echo user-owned-check' }],
    };
    writeFileSync(
      file,
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: 'apply_patch|Edit|Write|NotebookEdit',
              hooks: [{ type: 'command', command: predecessor.command }],
            },
            user,
          ],
        },
      })
    );
    patchCodexHooksJson(file);
    const hooks = JSON.parse(readFileSync(file, 'utf8')).hooks.PreToolUse;
    const managed = hooks
      .flatMap((entry) => entry.hooks)
      .filter(
        (entry) =>
          entry.command === predecessor.command ||
          entry.command === guardBootstrapCommand('source-edit-gate')
      );
    assert.equal(
      managed.length,
      1,
      'canonical upgrade must replace the old managed command rather than leave two profiles'
    );
    assert.equal(managed[0].command, guardBootstrapCommand('source-edit-gate'));
    assert.ok(hooks.some((entry) => JSON.stringify(entry) === JSON.stringify(user)));
    const once = readFileSync(file, 'utf8');
    patchCodexHooksJson(file);
    assert.equal(readFileSync(file, 'utf8'), once, 'canonical upgrade is idempotent');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
