// @story #1169
// cspell:ignore EISSUELOCKED
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  issueLockPath,
  THIS_HOST,
  withIssueLock,
} from '../../../../task-tracker/issue-mutator-lock.mjs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';

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

function makeProject() {
  const projectDir = mkdtempSync(path.join(projectScratchDir('test'), 'test-entry-lock-'));
  scratchProjects.push(projectDir);
  return projectDir;
}

function acquireAs(sessionId) {
  return (options, work) => withIssueLock({ ...options, sessionId }, work);
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
    projectDir: makeProject(),
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
  const projectDir = makeProject();
  const entered = deferred();
  const release = deferred();
  const first = runTestWithEntryInterlock({
    cfg: { repo: 'o/r' },
    issueNumber: 1169,
    projectDir,
    deps: {
      acquireIssueLock: acquireAs('holding-test-run'),
      runVerbTest: async () => {
        entered.resolve();
        await release.promise;
        return { status: 'passed' };
      },
    },
  });
  await entered.promise;

  await assert.rejects(
    runTestWithEntryInterlock({
      cfg: { repo: 'o/r' },
      issueNumber: 1169,
      projectDir,
      deps: {
        acquireIssueLock: acquireAs('contending-test-run'),
        runVerbTest: async () => ({ status: 'unexpected-entry' }),
      },
    }),
    (error) => {
      assert.equal(error.code, 'EISSUELOCKED');
      assert.match(error.message, /issue 1169 locked by session holding-test-run \(held since /);
      return true;
    }
  );

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

test('a dead same-host holder is reclaimed through the #656 liveness path', async () => {
  const projectDir = makeProject();
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
  const result = await runTestWithEntryInterlock({
    cfg: { repo: 'o/r' },
    issueNumber,
    projectDir,
    deps: {
      runVerbTest: async () => {
        entered = true;
        return { status: 'already-verified' };
      },
    },
  });

  assert.equal(result.status, 'already-verified');
  assert.equal(entered, true);
});

test('different issues can both hold their Test entry interlocks concurrently', async () => {
  const projectDir = makeProject();
  const release = deferred();
  const bothEntered = deferred();
  const entered = new Set();

  const run = (issueNumber) =>
    runTestWithEntryInterlock({
      cfg: { repo: 'o/r' },
      issueNumber,
      projectDir,
      deps: {
        acquireIssueLock: acquireAs(`run-${issueNumber}`),
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
