// @story #1857
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { mkdirSync, rmSync, readFileSync, writeFileSync, symlinkSync, existsSync, readdirSync } from 'node:fs';
import { createActivatedRuntimeRootFixture, createRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { actionCaptureRoot, captureIssueDir, setActionCaptureEnabled, isActionCaptureEnabled, beginCapturedAction, completeCapturedAction } from '../../../../task-tracker/lib/action-capture.mjs';
import { inspectRuntimeWriterLeases, inspectRuntimeCoordinator, fenceRuntimeWriters } from '../../../../task-tracker/lib/runtime-migration-lock.mjs';
import { classifyCaptureRecord } from '../../../../task-tracker/lib/runtime-capture-catalog.mjs';
import { saveMarker } from '../../../../task-tracker/word-counter.mjs';

test('ordinary writes cannot bootstrap protected coordination before valid activation', () => {
  const root = createRuntimeRootFixture('unactivated-writer-');
  const runtime = path.join(root, '.ai-task-manager', 'runtime');
  const file = path.join(runtime, 'store', 'app', 'codex', 'session-tracking', 'fixture.json');
  try {
    assert.throws(() => saveMarker(file, 0, 0, null, 0, { identity: { provider: 'codex', sid: 'fixture' } }), { code: 'RUNTIME_MIGRATION_REQUIRED' });
    assert.equal(existsSync(runtime), false, 'ordinary writer cannot create bootstrap authority scaffolding');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('action capture uses validated durable binary records, whole publication leases, and refuses volatile aliases or fenced writes', async () => {
  const root = await createActivatedRuntimeRootFixture('capture-durable-');
  const roots = { projectRoot: root, mainRoot: root };
  const context = { projectDir: root, repository: 'fixture/repo', issue: 1857, invocationId: 'fixture', command: 'fixture' };
  try {
    const base = path.join(root, '.ai-task-manager', 'runtime', 'store');
    assert.equal(actionCaptureRoot(root), path.join(base, 'action-capture'));
    const enabled = setActionCaptureEnabled({ ...context, enabled: true });
    assert.equal(isActionCaptureEnabled(context), true);
    const original = readFileSync(enabled.markerPath);
    writeFileSync(enabled.markerPath, '{bad');
    assert.throws(() => isActionCaptureEnabled(context), { code: 'RUNTIME_STATE_CORRUPT' });
    rmSync(enabled.markerPath);
    const volatile = path.join(root, '.tmp', 'capture-enabled.json');
    mkdirSync(path.dirname(volatile), { recursive: true });
    writeFileSync(volatile, original);
    symlinkSync(volatile, enabled.markerPath);
    assert.throws(() => isActionCaptureEnabled(context), { code: 'RUNTIME_OVERRIDE_UNSAFE' });
    rmSync(enabled.markerPath);
    writeFileSync(enabled.markerPath, original);
    const input = { ...context, stdin: Buffer.from([255, 0, 128]), startedAt: '2026-10-01T00:00:00.000Z' };
    Object.defineProperty(input, 'args', { get() {
      assert.equal(inspectRuntimeWriterLeases(roots).length, 1);
      assert.equal(inspectRuntimeCoordinator(roots).status, 'owned');
      return ['issue', 'view', '1857'];
    } });
    const handle = beginCapturedAction(input);
    const result = { exitCode: 0, finishedAt: '2026-10-01T00:00:01.000Z' };
    Object.defineProperty(result, 'stdout', { get() {
      assert.equal(inspectRuntimeWriterLeases(roots).length, 1);
      return Buffer.from([254, 0, 129]);
    } });
    const outcome = completeCapturedAction(handle, result);
    const binary = path.join(handle.actionDir, 'stdout.bin');
    const descriptor = classifyCaptureRecord({ relative: path.relative(base, binary), readSibling: (name) => readFileSync(path.join(handle.actionDir, name)) });
    assert.equal(descriptor.validate(readFileSync(binary)), true);
    assert.equal(outcome.stdout.bytes, 3);
    const sequence = path.join(captureIssueDir(context), '.sequence');
    writeFileSync(sequence, 'nonsense');
    assert.throws(() => beginCapturedAction(input), { code: 'RUNTIME_STATE_CORRUPT' });
    assert.equal(readFileSync(sequence, 'utf8'), 'nonsense');
    writeFileSync(sequence, String(handle.sequence) + '\n');
    const owner = { provider: 'fixture', sid: 'migrator', pid: process.pid, processToken: 'capture-fence' };
    await fenceRuntimeWriters({ ...roots, transactionId: 'capture-fence', approvedPlanDigest: 'sha256:' + 'a'.repeat(64), adapters: { identity: () => owner, writerCensus: () => ({ complete: true, writers: [], claims: [] }) } });
    assert.throws(() => setActionCaptureEnabled({ ...context, enabled: false }), { code: 'RUNTIME_TRANSACTION_INCOMPLETE' });
    assert.deepEqual(readFileSync(enabled.markerPath), original);
    assert.throws(() => beginCapturedAction(input), { code: 'RUNTIME_TRANSACTION_INCOMPLETE' });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('capture shim retains a whole writer lease across the real child command and drains through a fence', async () => {
  const root = await createActivatedRuntimeRootFixture('capture-shim-');
  const roots = { projectRoot: root, mainRoot: root };
  const done = path.join(root, 'child-done');
  const shim = fileURLToPath(new URL('../../../../task-tracker/action-capture-bin/gh', import.meta.url));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !key.startsWith('GIT_') && !['AI_TASK_MANAGER_PROJECT_DIR', 'TASK_TRACKER_PROJECT_DIR', 'CLAUDE_PROJECT_DIR', 'AITM_CAPTURE_PROJECT_DIR'].includes(key)));
  Object.assign(env, { AITM_CAPTURE_REPOSITORY: 'fixture/repo', AITM_CAPTURE_ISSUE: '1857',
    AITM_CAPTURE_INVOCATION_ID: 'shim-fixture', AITM_CAPTURE_REAL_GH: process.execPath });
  const code = 'process.stdout.write("READY");const fs=require("node:fs");const timer=setInterval(()=>{if(fs.existsSync(process.argv[1])){clearInterval(timer);process.stdout.write("DONE");}},10);';
  const child = spawn(process.execPath, [shim, '-e', code, done], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = once(child, 'exit');
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  try {
    await Promise.race([new Promise((resolve) => child.stdout.once('data', resolve)), exited.then(() => assert.fail(stderr))]);
    assert.equal(inspectRuntimeWriterLeases(roots).length, 1, 'capture is still a writer while its external command awaits');
    const owner = { provider: 'fixture', sid: 'migrator', pid: process.pid, processToken: 'shim-fence' };
    const fenced = await fenceRuntimeWriters({ ...roots, transactionId: 'shim-fence', approvedPlanDigest: 'sha256:' + 'a'.repeat(64), adapters: { identity: () => owner, writerCensus: () => ({ complete: true, writers: [], claims: [] }) } });
    assert.notEqual(fenced.status, 'quiesced');
    writeFileSync(done, 'finish');
    const [exitCode] = await exited;
    assert.equal(exitCode, 0, stderr);
    assert.equal(inspectRuntimeWriterLeases(roots).length, 0);
    const directory = path.join(root, '.ai-task-manager', 'runtime', 'store', 'action-capture', 'repositories', 'fixture__repo', 'issue-1857');
    const action = readdirSync(directory).find((name) => /^[0-9]+-/.test(name));
    assert.equal(JSON.parse(readFileSync(path.join(directory, action, 'outcome.json'))).exitCode, 0);
  } finally {
    writeFileSync(done, 'finish');
    await exited;
    rmSync(root, { recursive: true, force: true });
  }
});
