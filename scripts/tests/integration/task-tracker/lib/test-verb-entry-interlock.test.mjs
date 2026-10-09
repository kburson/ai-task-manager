// @story #1169
// cspell:ignore EISSUELOCKED
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { createActivatedRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { fileURLToPath } from 'node:url';

import {
  issueLockPath,
  THIS_HOST,
  withIssueLock,
} from '../../../../task-tracker/issue-mutator-lock.mjs';

const testVerbModule = await import('../../../../task-tracker/verbs/test.mjs');
const testFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(testFile), '../../../../..');
const scratchProjects = [];

function runTestWithEntryInterlock(options) {
  assert.equal(
    typeof testVerbModule.runTestWithEntryInterlock,
    'function',
    'the Test verb must expose one entry-interlock wrapper'
  );
  return testVerbModule.runTestWithEntryInterlock(options);
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function makeProject() {
  const projectDir = await createActivatedRuntimeRootFixture('test-entry-lock-');
  scratchProjects.push(projectDir);
  return projectDir;
}

function reapedPid() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
    child.once('error', reject);
    child.once('close', () => resolve(child.pid));
  });
}

after(() => {
  for (const projectDir of scratchProjects) {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test('takes the issue interlock before the receipt path and serializes an exact-SHA no-op', async () => {
  const events = [];
  const result = await runTestWithEntryInterlock({
    cfg: { repo: 'o/r' },
    issueNumber: 1169,
    projectDir: await makeProject(),
    deps: {
      acquireIssueLock: async (options, work) => {
        events.push(`lock:${options.issue}:${options.verb}`);
        return work();
      },
      runVerbTest: async () => {
        events.push('receipt-read');
        return { status: 'already-verified', receipt: { receiptId: 'receipt-1' } };
      },
    },
  });

  assert.equal(result.status, 'already-verified');
  assert.deepEqual(events, ['lock:1169:test', 'receipt-read']);
});

test('a second invocation for the same issue refuses and names the holding run', async () => {
  const projectDir = await makeProject();
  process.env.AI_TASK_MANAGER_SESSION_ID = 'holding-test-run';
  process.env.AI_TASK_MANAGER_APP_NAME = 'claude';
  const entered = deferred();
  const release = deferred();
  const first = runTestWithEntryInterlock({
    cfg: { repo: 'o/r' },
    issueNumber: 1169,
    projectDir,
    deps: {
      runVerbTest: async () => {
        entered.resolve();
        await release.promise;
        return { status: 'passed' };
      },
    },
  });
  await entered.promise;

  // Use a genuine second OS process without an inherited ownership proof.
  const env = {
    ...process.env,
    AI_TASK_MANAGER_PROJECT_DIR: projectDir,
    AI_TASK_MANAGER_SESSION_ID: 'contending-test-run',
    AI_TASK_MANAGER_APP_NAME: 'claude',
  };
  delete env.AITM_ISSUE_LOCK_HELD;
  delete env.AITM_ISSUE_LOCK_PROOF;
  const moduleUrl = new URL('../../../../task-tracker/verbs/test.mjs', import.meta.url).href;
  const source = `import {runTestWithEntryInterlock} from ${JSON.stringify(moduleUrl)};
    try { await runTestWithEntryInterlock({cfg:{repo:'o/r'}, issueNumber:1169,
      projectDir:${JSON.stringify(projectDir)}, deps:{runVerbTest:async()=>{throw Error('unexpected-entry')}}});
      process.exitCode=2; } catch(e) { console.log(JSON.stringify({code:e.code,message:e.message})); }`;
  const output = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', source], {
      cwd: projectDir,
      env,
    });
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (data) => (stdout += data));
    child.stderr.on('data', (data) => (stderr += data));
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0 ? resolve(stdout) : reject(Error(stderr || `child exit ${code}`))
    );
  });
  const refusal = JSON.parse(output);
  assert.equal(refusal.code, 'EISSUELOCKED');
  assert.ok(refusal.message.includes('issue 1169 locked by session holding-test-run (held since '));

  release.resolve();
  assert.equal((await first).status, 'passed');
});

test('the Test entry interlock has no force, environment, or config bypass', () => {
  const source = readFileSync(path.join(repoRoot, 'scripts/task-tracker/verbs/test.mjs'), 'utf8');
  const start = source.indexOf('export async function runTestWithEntryInterlock');
  const end = source.indexOf('export async function verbTest', start);
  assert.ok(start >= 0 && end > start, 'entry wrapper must be a distinct auditable function');
  const wrapper = source.slice(start, end);

  assert.match(wrapper, /acquireIssueLock\s*\(/);
  assert.doesNotMatch(wrapper, /process\.env|config|override|bypass|force/i);
});

test('a dead same-host legacy holder requires explicit observed recovery', async () => {
  const projectDir = await makeProject();
  const issueNumber = 6561169;
  const lockPath = issueLockPath(issueNumber, projectDir);
  const pid = await reapedPid();
  mkdirSync(lockPath, { recursive: true });
  writeFileSync(
    path.join(lockPath, 'holder.json'),
    `${JSON.stringify({
      sessionId: 'crashed-test-run',
      pid,
      host: THIS_HOST,
      startToken: 'dead-process-token',
      acquiredAt: new Date().toISOString(),
      verb: 'test',
    })}\n`
  );

  let entered = false;
  const holderPath = path.join(lockPath, 'holder.json');
  const before = readFileSync(holderPath, 'utf8');
  await assert.rejects(
    runTestWithEntryInterlock({
      cfg: { repo: 'o/r' },
      issueNumber,
      projectDir,
      deps: {
        runVerbTest: async () => {
          entered = true;
          return { status: 'already-verified' };
        },
      },
    }),
    { code: 'RUNTIME_LOCK_RECOVERY_REQUIRED' }
  );
  assert.equal(entered, false);
  assert.equal(readFileSync(holderPath, 'utf8'), before);
});

test('different issues can both hold their Test entry interlocks concurrently', async () => {
  const projectDir = await makeProject();
  const release = deferred();
  const bothEntered = deferred();
  const entered = new Set();

  const run = (issueNumber) =>
    runTestWithEntryInterlock({
      cfg: { repo: 'o/r' },
      issueNumber,
      projectDir,
      deps: {
        runVerbTest: async () => {
          entered.add(issueNumber);
          if (entered.size === 2) bothEntered.resolve();
          await release.promise;
          return { status: 'passed', issueNumber };
        },
      },
    });

  const first = run(116901);
  const second = run(116902);
  await bothEntered.promise;
  assert.deepEqual([...entered].sort(), [116901, 116902]);
  release.resolve();
  assert.deepEqual(
    (await Promise.all([first, second])).map(({ issueNumber }) => issueNumber),
    [116901, 116902]
  );
});
