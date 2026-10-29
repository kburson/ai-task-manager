// @story #2088
// @story #2106
// Offline subprocess fixtures; these are not genuine native host receipts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { setActiveTask, getActiveTask } from '../../../../task-tracker/session-state.mjs';
import { parseDoctorArgs } from '../../../../package/doctor.mjs';

const source = fileURLToPath(new URL('../../../../..', import.meta.url));
const sid = 'runtime-proof-offline-fixture';
function fixture() {
  const root = createRuntimeRootFixture('runtime-proof-');
  for (const name of ['bin', 'scripts', 'guidance', 'config', 'instructions', 'docs', 'skill']) {
    cpSync(path.join(source, name), path.join(root, name), { recursive: true });
  }
  cpSync(path.join(source, 'package.json'), path.join(root, 'package.json'));
  execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('git', [
    '-C',
    root,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.test',
    'commit',
    '-qm',
    'Fixture',
  ]);
  const env = { ...process.env, CODEX_THREAD_ID: sid, CODEX_SESSION_ID: sid };
  for (const key of [
    'AI_TASK_MANAGER_SESSION_ID',
    'AI_TASK_MANAGER_PROJECT_DIR',
    'TASK_TRACKER_PROJECT_DIR',
    'CLAUDE_PROJECT_DIR',
    'AITM_CAPTURE_PROJECT_DIR',
    'AITM_GRAPHQL_USAGE',
    'TT_FULL_AUTO',
  ])
    delete env[key];
  setActiveTask(
    sid,
    {
      issue: '#2088',
      worktreePath: root,
      worktreeBranch: 'main',
      bindingGenerationId: 'runtime-fixture-generation',
      entryStartTs: new Date().toISOString(),
      kanbanState: 'develop',
    },
    root
  );
  // Use the actual fixture branch; global Git init defaults can differ.
  const branch = execFileSync('git', ['-C', root, 'branch', '--show-current'], {
    encoding: 'utf8',
  }).trim();
  setActiveTask(sid, { ...getActiveTask(sid, root), worktreeBranch: branch }, root);
  return { root, env };
}
function hook(f, nonce, flag = '--runtime-proof') {
  const result = spawnSync(
    process.execPath,
    [path.join(f.root, 'scripts/task-tracker/activity-guard.mjs')],
    {
      cwd: f.root,
      env: f.env,
      encoding: 'utf8',
      input: JSON.stringify({
        session_id: sid,
        cwd: f.root,
        tool_name: 'Bash',
        tool_input: { command: `npx aitm doctor --json ${flag} ${nonce}` },
      }),
    }
  );
  assert.equal(result.status, 0, result.stderr);
  const output = result.stdout.trim() ? JSON.parse(result.stdout) : null;
  assert.notEqual(output?.decision, 'block', result.stdout);
  return output;
}
function cli(f, nonce, flag = '--runtime-proof') {
  const result = spawnSync(
    process.execPath,
    [path.join(f.root, 'bin/aitm.mjs'), 'doctor', '--json', flag, nonce],
    { cwd: f.root, env: f.env, encoding: 'utf8' }
  );
  assert.ok(result.stdout.trim(), result.stderr);
  return { code: result.status, proof: JSON.parse(result.stdout) };
}
function receipt(f, nonce) {
  return path.join(f.root, '.tmp/aitm/native-runtime-proof', sid, nonce + '.json');
}

test('runtime diagnostic has a separate strict public argument form', () => {
  const nonce = 'a'.repeat(32);
  assert.deepEqual(parseDoctorArgs(['--json', '--runtime-proof', nonce]), {
    json: true,
    runtimeProof: nonce,
  });
  for (const args of [
    ['--runtime-proof', nonce],
    ['--json', '--runtime-proof', nonce, '--binding-proof', nonce],
    ['--json', '--runtime-proof', '../escape'],
  ])
    assert.throws(() => parseDoctorArgs(args));
});

test('offline hook and CLI preserve binding and compare actual observed helper bytes', () => {
  const f = fixture();
  try {
    const before = getActiveTask(sid, f.root),
      nonce = 'b'.repeat(32);
    const emitted = hook(f, nonce);
    assert.ok(emitted?.hookSpecificOutput, 'new hook must emit a runtime observation');
    const { code, proof } = cli(f, nonce);
    assert.equal(code, 0, JSON.stringify(proof));
    assert.equal(proof.schema, 'aitm.native-runtime-proof/v1');
    assert.equal(proof.binding.matches, true);
    assert.equal(proof.runtime.sameObservedHelper, true);
    assert.equal(proof.runtime.scope, 'observed-helper-only-not-whole-runtime');
    assert.equal(Object.hasOwn(proof, 'healthy'), false);
    assert.equal(
      proof.runtime.hook.callerMetadata.url,
      new URL('scripts/task-tracker/activity-guard.mjs', 'file://' + f.root + '/').href
    );
    assert.equal(
      proof.runtime.cli.callerMetadata.url,
      new URL('scripts/package/doctor.mjs', 'file://' + f.root + '/').href
    );
    assert.deepEqual(getActiveTask(sid, f.root), before);
    assert.equal(cli(f, nonce).code, 1, 'replay refuses');
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('old binding observation cannot satisfy new mode and old mode remains compatible', () => {
  const f = fixture();
  try {
    const nonce = 'c'.repeat(32);
    hook(f, nonce, '--binding-proof');
    assert.equal(cli(f, nonce).code, 1);
    const old = cli(f, nonce, '--binding-proof');
    assert.equal(old.code, 0, JSON.stringify(old.proof));
    assert.equal(old.proof.schema, 'aitm.native-binding-proof/v1');
    assert.equal(old.proof.healthy, true);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('runtime mode refuses stale, malformed, oversized, null and helper mismatch observations', () => {
  const f = fixture();
  try {
    const cases = [
      (value) => {
        value.observedAt = Date.now() - 61000;
      },
      (value) => {
        value.schema = 'aitm.native-binding-proof/v1';
      },
      (value) => {
        value.runtimeObservation = null;
      },
      (value) => {
        value.runtimeObservation.extra = true;
      },
      (value) => {
        value.runtimeObservation.processFacts = null;
      },
      (value) => {
        value.runtimeObservation.helperModule.file.sha256 = '0'.repeat(64);
      },
      (value) => {
        value.extra = 'unexpected';
      },
      (value) => {
        value.runtimeObservation.padding = 'x'.repeat(70000);
      },
    ];
    for (let index = 0; index < cases.length; index++) {
      const nonce = (index + 1).toString(16).repeat(32);
      hook(f, nonce);
      const file = receipt(f, nonce);
      const value = JSON.parse(readFileSync(file, 'utf8'));
      cases[index](value);
      writeFileSync(file, JSON.stringify(value));
      const result = cli(f, nonce);
      assert.equal(result.code, 1, JSON.stringify(result.proof));
      assert.equal(result.proof.diagnosticPassed, false);
    }
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
