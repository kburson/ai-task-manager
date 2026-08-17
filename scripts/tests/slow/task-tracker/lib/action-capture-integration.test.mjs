// @story #1295
// cspell:ignore FWYYERKWZZZ
import assert from 'node:assert/strict';
import { execFile, spawn, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  captureIssueDir,
  setActionCaptureEnabled,
  summarizeActionCorpus,
} from '../../../../task-tracker/lib/action-capture.mjs';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const SHIM = path.join(ROOT, 'scripts', 'task-tracker', 'action-capture-bin', 'gh');

function fixture() {
  const projectDir = mkdtempProjectIsolated('action-capture-integration-');
  mkdirSync(path.join(projectDir, '.ai-task-manager'), { recursive: true });
  mkdirSync(path.join(projectDir, '.tmp', 'aitm', 'state'), { recursive: true });
  writeFileSync(
    path.join(projectDir, '.ai-task-manager', 'task-tracker.json'),
    `${JSON.stringify({ repo: 'o/r' })}\n`
  );
  writeFileSync(
    path.join(projectDir, '.tmp', 'aitm', 'state', 'task-tracker-state.json'),
    `${JSON.stringify({ active: '#42' })}\n`
  );
  const realGh = path.join(projectDir, 'fake-gh');
  writeFileSync(
    realGh,
    `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const bodyAt = args.indexOf('--body-file');
const inputAt = args.indexOf('--input');
const readsStdin = (bodyAt >= 0 && args[bodyAt + 1] === '-') || (inputAt >= 0 && args[inputAt + 1] === '-');
const input = readsStdin ? fs.readFileSync(0) : Buffer.alloc(0);
const output = bodyAt >= 0 ? fs.readFileSync(args[bodyAt + 1]) : input;
process.stdout.write(output);
process.stderr.write(process.env.FAKE_GH_STDERR || '');
process.exit(Number(process.env.FAKE_GH_EXIT || 0));
`
  );
  chmodSync(realGh, 0o755);
  return { projectDir, realGh };
}

function captureEnv(projectDir, realGh, overrides = {}) {
  return {
    ...process.env,
    AITM_CAPTURE_REAL_GH: realGh,
    AITM_CAPTURE_PROJECT_DIR: projectDir,
    AITM_CAPTURE_REPOSITORY: 'o/r',
    AITM_CAPTURE_ISSUE: '42',
    AITM_CAPTURE_INVOCATION_ID: '01M08F6FWYYERKWZZZ1AH15W99',
    AITM_CAPTURE_COMMAND: 'integration-test',
    ...overrides,
  };
}

test('shim preserves exact request, stdout, stderr, and exit while recording body-file bytes', () => {
  const { projectDir, realGh } = fixture();
  setActionCaptureEnabled({ projectDir, repository: 'o/r', issue: 42, enabled: true });
  const markdown = Buffer.from('# Exact body\n\nTrailing spaces survive.  \n');
  const bodyPath = path.join(projectDir, 'body.md');
  writeFileSync(bodyPath, markdown);

  const result = spawnSync(SHIM, ['issue', 'edit', '42', '--body-file', bodyPath], {
    cwd: projectDir,
    env: captureEnv(projectDir, realGh, {
      FAKE_GH_STDERR: 'remote diagnostic\n',
      FAKE_GH_EXIT: '23',
    }),
    input: Buffer.alloc(0),
  });

  assert.equal(result.status, 23);
  assert.deepEqual(result.stdout, markdown);
  assert.equal(result.stderr.toString(), 'remote diagnostic\n');
  const issueDir = captureIssueDir({ projectDir, repository: 'o/r', issue: 42 });
  const [actionName] = readdirSync(issueDir).filter((name) => /^\d{6}-/.test(name));
  const actionDir = path.join(issueDir, actionName);
  const intent = JSON.parse(readFileSync(path.join(actionDir, 'intent.json'), 'utf8'));
  const outcome = JSON.parse(readFileSync(path.join(actionDir, 'outcome.json'), 'utf8'));
  assert.equal(intent.mutationKind, 'issue-body');
  assert.equal(intent.request.files[0].kind, 'body-file');
  assert.deepEqual(readFileSync(path.join(actionDir, intent.request.files[0].file)), markdown);
  assert.equal(outcome.exitCode, 23);
  assert.deepEqual(readFileSync(path.join(actionDir, outcome.stdout.file)), markdown);
  assert.deepEqual(
    readFileSync(path.join(actionDir, outcome.stderr.file)),
    Buffer.from('remote diagnostic\n')
  );
});

test('shim preserves piped stdin and fails open when capture metadata is invalid', () => {
  const { projectDir, realGh } = fixture();
  const input = Buffer.from('{"query":"query { viewer { login } }"}\n');
  const result = spawnSync(SHIM, ['api', 'graphql', '--input', '-'], {
    cwd: projectDir,
    env: captureEnv(projectDir, realGh, { AITM_CAPTURE_ISSUE: 'invalid' }),
    input,
  });

  assert.equal(result.status, 0);
  assert.deepEqual(result.stdout, input);
  assert.match(result.stderr.toString(), /capture unavailable; continuing without capture/);
});

test('shim does not wait for EOF on an unused execFile stdin pipe', async () => {
  const { projectDir, realGh } = fixture();
  setActionCaptureEnabled({ projectDir, repository: 'o/r', issue: 42, enabled: true });
  const result = await new Promise((resolve) => {
    execFile(
      SHIM,
      ['issue', 'view', '42'],
      {
        cwd: projectDir,
        env: captureEnv(projectDir, realGh),
        timeout: 1_000,
        encoding: 'buffer',
      },
      (error, stdout, stderr) => resolve({ error, stdout, stderr })
    );
  });

  assert.equal(result.error, null);
  assert.deepEqual(result.stdout, Buffer.alloc(0));
  assert.deepEqual(result.stderr, Buffer.alloc(0));
  const summary = summarizeActionCorpus({ projectDir, repository: 'o/r', issue: 42 });
  assert.equal(summary.complete, 1);
});

function runConcurrentShim(args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(SHIM, args, options);
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal }));
    child.stdin.end();
  });
}

test('concurrent shim processes allocate unique ordered action directories', async () => {
  const { projectDir, realGh } = fixture();
  setActionCaptureEnabled({ projectDir, repository: 'o/r', issue: 42, enabled: true });
  const env = captureEnv(projectDir, realGh);
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      runConcurrentShim(['issue', 'view', String(index + 1)], {
        cwd: projectDir,
        env,
        stdio: ['pipe', 'ignore', 'pipe'],
      })
    )
  );
  assert.ok(results.every(({ code, signal }) => code === 0 && signal === null));

  const summary = summarizeActionCorpus({ projectDir, repository: 'o/r', issue: 42 });
  assert.equal(summary.actions, 8);
  assert.equal(summary.complete, 8);
  const actionNames = readdirSync(
    captureIssueDir({ projectDir, repository: 'o/r', issue: 42 })
  ).filter((name) => /^\d{6}-/.test(name));
  assert.deepEqual(
    actionNames.map((name) => Number(name.slice(0, 6))).sort((a, b) => a - b),
    [1, 2, 3, 4, 5, 6, 7, 8]
  );
});
