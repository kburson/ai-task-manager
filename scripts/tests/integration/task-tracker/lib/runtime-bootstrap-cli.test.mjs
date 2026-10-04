// @story #1857
import { initializeFixtureActor } from '../../../helpers/fixture-actor.mjs';
initializeFixtureActor(import.meta.url);
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { parseRuntimeMigrationInvocation } from '../../../../task-tracker/lib/runtime-migration-admission.mjs';

const executable = fileURLToPath(new URL('../../../../../bin/aitm.mjs', import.meta.url));
test('registered recovery grammar requires exact observation or plan and refuses unrelated capabilities', () => {
  const digest = 'sha256:' + 'a'.repeat(64);
  for (const args of [
    ['initialize-plan'],
    ['initialize-apply', '--approved-plan', digest, '--plan-file', 'observed.json'],
    ['initialize-resume', '--approved-plan', digest],
    ['recover-coordinator', '--observed', digest],
    [
      'recover-coordinator',
      '--observed',
      digest,
      '--transaction',
      'migration-one',
      '--approved-plan',
      digest,
    ],
    ['recover-writer', '--observed', digest, '--lease', 'abcd-1234'],
  ])
    assert.equal(parseRuntimeMigrationInvocation(['migrate-runtime', ...args])?.mode, args[0]);
  for (const args of [
    ['initialize-apply', '--approved-plan', digest],
    ['initialize-plan', '--plan-file', 'input'],
    ['initialize-resume', '--approved-plan', digest, '--plan-file', 'input'],
    ['recover-coordinator'],
    ['recover-coordinator', '--observed', digest, '--transaction', 'one'],
    ['recover-writer', '--observed', digest],
    ['recover-writer', '--observed', digest, '--lease', '../escape'],
    ['status', '--observed', digest],
    ['apply', '--observed', digest],
  ])
    assert.equal(parseRuntimeMigrationInvocation(['migrate-runtime', ...args]), null);
});

test('registered runtime planner remains reachable without binding or valid control and publishes no authority', () => {
  const root = createRuntimeRootFixture('1857-bootstrap-cli-');
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !key.startsWith('GIT_') &&
        ![
          'AI_TASK_MANAGER_PROJECT_DIR',
          'TASK_TRACKER_PROJECT_DIR',
          'CLAUDE_PROJECT_DIR',
          'AITM_CAPTURE_PROJECT_DIR',
        ].includes(key)
    )
  );
  try {
    const source = path.join(root, '.tmp', 'aitm', 'state', 'task-tracker-state.json');
    mkdirSync(path.dirname(source), { recursive: true });
    writeFileSync(source, '{bad legacy state');
    const control = path.join(root, '.ai-task-manager', 'runtime', 'control.json');
    mkdirSync(path.dirname(control), { recursive: true });
    writeFileSync(control, '{bad control');
    const guidance = path.join(root, '.ai-task-manager', 'aitm-guidance.yml');
    writeFileSync(guidance, 'not valid guidance');
    const result = spawnSync(process.execPath, [executable, 'migrate-runtime', 'plan'], {
      cwd: root,
      env,
      encoding: 'utf8',
      timeout: 30000,
    });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    const plan = JSON.parse(result.stdout);
    assert.equal(plan.schema, 'aitm.runtime-migration-plan/v1');
    assert.equal(plan.projectRoot, root);
    assert.ok(plan.blockers.some((entry) => entry.code === 'destination-exists'));
    assert.ok(plan.blockers.some((entry) => entry.code === 'unsupported-schema'));
    assert.equal(readFileSync(source, 'utf8'), '{bad legacy state');
    assert.equal(readFileSync(control, 'utf8'), '{bad control');
    assert.deepEqual(readdirSync(path.dirname(control)), ['control.json']);
    const invalid = spawnSync(
      process.execPath,
      [executable, 'migrate-runtime', 'apply', '--anything'],
      { cwd: root, env, encoding: 'utf8', timeout: 30000 }
    );
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /RUNTIME_MIGRATION_USAGE/);
    assert.equal(readFileSync(source, 'utf8'), '{bad legacy state');
    const writers = path.join(path.dirname(control), 'migrations', 'writers');
    mkdirSync(writers, { recursive: true });
    const status = spawnSync(process.execPath, [executable, 'migrate-runtime', 'status'], {
      cwd: root,
      env,
      encoding: 'utf8',
      timeout: 30000,
    });
    assert.equal(status.status, 0, status.stderr);
    assert.deepEqual(JSON.parse(status.stdout).writers, []);
    const recover = spawnSync(
      process.execPath,
      [
        executable,
        'migrate-runtime',
        'recover-coordinator',
        '--observed',
        'sha256:' + 'a'.repeat(64),
      ],
      { cwd: root, env, encoding: 'utf8', timeout: 30000 }
    );
    assert.notEqual(recover.status, 0);
    assert.match(recover.stderr, /RUNTIME_COORDINATOR_RECOVERY_REQUIRED/);
    const initialize = spawnSync(
      process.execPath,
      [executable, 'migrate-runtime', 'initialize-plan'],
      { cwd: root, env, encoding: 'utf8', timeout: 30000 }
    );
    assert.notEqual(initialize.status, 0);
    assert.match(initialize.stderr, /RUNTIME_EMPTY_INIT_REFUSED/);
    writeFileSync(path.join(writers, 'unknown.json'), '{}');
    const malformed = spawnSync(process.execPath, [executable, 'migrate-runtime', 'status'], {
      cwd: root,
      env,
      encoding: 'utf8',
      timeout: 30000,
    });
    assert.match(malformed.stderr, /RUNTIME_CONTROL_INVALID/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
