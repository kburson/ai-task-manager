#!/usr/bin/env node
// @story #82
// E2E tests for commit-trail-handler.mjs.
// Mocks git + gh via injected fakes (no PATH shim — handler exports postCommitTrail).
// Then runs the full handler via spawn with stdin payload + git shim for end-to-end.

import { strict as assert } from 'node:assert';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, writeFileSync, chmodSync, rmSync, existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import { projectScratchDir, mkdtempProjectIsolated } from '../../../lib/scratch-dir.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { postCommitTrail } from '../../../commit-trail-handler.mjs';
import { TRAIL_HEADING } from '../../../lib/commit-trail.mjs';
import { createWorkLeaseProvider } from '../../../lib/work-lease/provider.mjs';
import { resolveWorktreeIdentity } from '../../../lib/work-lease/worktree-identity.mjs';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const HANDLER = path.resolve(__dir, '..', '..', 'commit-trail-handler.mjs');
const TRAIL_SESSION_ID = 'commit-trail-handler-test';
const LEDGER_PROJECT_ID = '11111111-1111-4111-8111-111111111111';

function makeFakeGh({ findResponse = null, failCreate = false, failUpdate = false } = {}) {
  const calls = { find: [], create: [], update: [] };
  let remote = findResponse;
  return {
    calls,
    deps: {
      withGovernedEffect: async (_options, callback) =>
        callback({ reverify: async () => ({ allowed: true }) }),
      find: async (issueNumber, repo) => {
        calls.find.push({ issueNumber, repo });
        return remote;
      },
      create: async (issueNumber, repo, body) => {
        calls.create.push({ issueNumber, repo, body });
        if (failCreate) throw new Error('gh create failed');
        remote = { id: 'C_CREATED', body };
      },
      update: async (id, body) => {
        calls.update.push({ id, body });
        if (failUpdate) throw new Error('gh update failed');
        remote = { id, body };
      },
    },
  };
}

// --- postCommitTrail unit-ish tests with injected gh ---

// 1. First commit → creates comment
{
  const fake = makeFakeGh();
  const info = { sha: 'abc12340000000', subject: 's1', author: 'a', ts: 't1', isWorktree: false };
  const r = await postCommitTrail({ issueNumber: '1', repo: 'o/r', info, deps: fake.deps });
  assert.equal(r.action, 'created');
  assert.equal(fake.calls.create.length, 1);
  const body = fake.calls.create[0].body;
  assert.match(body, /### 🔗 Commits/);
  assert.match(body, /abc123/);
  assert.match(body, /\[`abc123`\]\(https:\/\/github\.com\/o\/r\/commit\/abc12340000000\)/);
  assert.match(body, /<!-- aitm-commits shas="abc12340000000" -->/);
}

// 2. Second commit → updates existing comment
{
  const initial =
    '### 🔗 Commits\n\n<!-- aitm-commits: abc12340000000 -->\n\n| SHA | Subject | Author | When |\n|---|---|---|---|\n| `abc123` | s1 | a | t1 |\n';
  const fake = makeFakeGh({ findResponse: { id: 'C_1', body: initial } });
  const info = { sha: 'def56780000000', subject: 's2', author: 'a', ts: 't2', isWorktree: false };
  const r = await postCommitTrail({ issueNumber: '1', repo: 'o/r', info, deps: fake.deps });
  assert.equal(r.action, 'updated');
  assert.equal(fake.calls.update.length, 1);
  const body = fake.calls.update[0].body;
  assert.match(body, /abc123/);
  assert.match(body, /def567/);
  assert.match(body, /<!-- aitm-commits shas="abc12340000000,def56780000000" -->/);
}

// 3a. Re-fire with same SHA on a LEGACY (caveat-less) trail → reconciled:
// #732 back-fills the informational-ledger caveat, so the body changes and a
// single update lands even though no new SHA row is added.
{
  const initial =
    '### 🔗 Commits\n\n<!-- aitm-commits: abc12340000000 -->\n\n| SHA | Subject | Author | When |\n|---|---|---|---|\n| `abc123` | s1 | a | t1 |\n';
  const fake = makeFakeGh({ findResponse: { id: 'C_1', body: initial } });
  const info = { sha: 'abc12340000000', subject: 's1', author: 'a', ts: 't1', isWorktree: false };
  const r = await postCommitTrail({ issueNumber: '1', repo: 'o/r', info, deps: fake.deps });
  assert.equal(r.action, 'reconciled');
  assert.equal(fake.calls.update.length, 1);
  assert.match(fake.calls.update[0].body, /aitm-ledger-caveat/);
  assert.match(fake.calls.update[0].body, /git log --all --grep='\[#1\]'/);
}

// 3b. Re-fire with same SHA on a trail that ALREADY carries the caveat →
// true noop-duplicate: nothing to reconcile, no update.
{
  const initial =
    '### 🔗 Commits\n\n<!-- aitm-ledger-caveat -->\n> caveat\n\n<!-- aitm-commits: abc12340000000 -->\n\n| SHA | Subject | Author | When |\n|---|---|---|---|\n| `abc123` | s1 | a | t1 |\n';
  const fake = makeFakeGh({ findResponse: { id: 'C_1', body: initial } });
  const info = { sha: 'abc12340000000', subject: 's1', author: 'a', ts: 't1', isWorktree: false };
  const r = await postCommitTrail({ issueNumber: '1', repo: 'o/r', info, deps: fake.deps });
  assert.equal(r.action, 'noop-duplicate');
  assert.equal(fake.calls.update.length, 0);
}

// 4. Worktree fire on first commit → 6-col table
{
  const fake = makeFakeGh();
  const info = {
    sha: 'abc',
    subject: 's',
    author: 'a',
    ts: 't',
    branch: 'feat/x',
    worktree: '/tmp/wt',
    isWorktree: true,
  };
  await postCommitTrail({ issueNumber: '1', repo: 'o/r', info, deps: fake.deps });
  const body = fake.calls.create[0].body;
  assert.match(body, /Branch \| Worktree/);
  assert.match(body, /feat\/x/);
}

// 5. Worktree fire on existing 4-col table → preserves 4-col schema
{
  const initial =
    '### 🔗 Commits\n\n<!-- aitm-commits: aaa -->\n\n| SHA | Subject | Author | When |\n|---|---|---|---|\n| `aaa` | s1 | a | t1 |\n';
  const fake = makeFakeGh({ findResponse: { id: 'C_1', body: initial } });
  const info = {
    sha: 'bbb',
    subject: 's2',
    author: 'a',
    ts: 't2',
    branch: 'b',
    worktree: '/w',
    isWorktree: true,
  };
  await postCommitTrail({ issueNumber: '1', repo: 'o/r', info, deps: fake.deps });
  const body = fake.calls.update[0].body;
  assert.doesNotMatch(body, /Branch \| Worktree/);
}

// --- Full handler E2E via spawn ---

function setupSandbox({ active = '#42', repo = 'o/r' } = {}) {
  const sandbox = mkdtempProjectIsolated('aitm-trail-');
  mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
  const config = {
    repo,
    ledgerProjectId: LEDGER_PROJECT_ID,
    workLease: { authority: 'local' },
  };
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify(config)
  );
  if (active) {
    // #573: the global ledger lives under `.tmp/aitm/state/`.
    mkdirSync(path.join(sandbox, '.tmp', 'aitm', 'state'), { recursive: true });
    writeFileSync(
      path.join(sandbox, '.tmp', 'aitm', 'state', 'task-tracker-state.json'),
      JSON.stringify({
        active,
        lastActive: active,
        entryStartTs: new Date().toISOString(),
        wordsAtEntryStart: 0,
      })
    );
    const issueId = String(active).replace(/^#/, '');
    const hostId = os.hostname();
    const worktree = resolveWorktreeIdentity(sandbox, { hostId });
    const store = createWorkLeaseProvider({ config, projectDir: sandbox });
    const lease = store.acquire({
      projectId: LEDGER_PROJECT_ID,
      issueId,
      mode: 'write',
      idempotencyKey: `commit-trail:${issueId}`,
      requestedAt: new Date().toISOString(),
      ttlMs: 900_000,
      holder: {
        principalKind: 'worker',
        provider: 'codex',
        agentRunId: TRAIL_SESSION_ID,
        sessionId: TRAIL_SESSION_ID,
        hostId,
        worktreeId: worktree.worktreeId,
        pathHash: worktree.pathHash,
        branch: 'trunk',
        pid: process.pid,
      },
    });
    store.close();
    const sessionDir = path.join(sandbox, '.tmp', 'aitm', 'sessions', TRAIL_SESSION_ID);
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(
      path.join(sessionDir, 'active-task.json'),
      JSON.stringify({
        issue: active,
        kanbanState: 'develop',
        lease: {
          projectId: LEDGER_PROJECT_ID,
          leaseId: lease.leaseId,
          fencingToken: lease.fencingToken,
          worktreeId: worktree.worktreeId,
        },
      })
    );
  }
  return sandbox;
}

// Git+gh shim. The shim logs every invocation to LOG_PATH so the test can assert.
function makeShim(sandbox, { gitOutputs = {}, ghBehavior = 'success' } = {}) {
  const binDir = path.join(sandbox, 'bin');
  mkdirSync(binDir, { recursive: true });
  // Opt this bin/ directory into ESM so shim bodies can use `import` (project
  // convention — see docs/guides/test-authoring.md).
  writeFileSync(path.join(binDir, 'package.json'), JSON.stringify({ type: 'module' }));
  const logPath = path.join(sandbox, 'shim.log');
  writeFileSync(logPath, '');
  const remotePath = path.join(sandbox, 'remote-trail.txt');
  writeFileSync(remotePath, '');

  const gitShim = path.join(binDir, 'git');
  writeFileSync(
    gitShim,
    `#!/usr/bin/env node
import fs from 'node:fs';
const args = process.argv.slice(2).join(' ');
fs.appendFileSync(${JSON.stringify(logPath)}, 'git ' + args + '\\n');
const outputs = ${JSON.stringify(gitOutputs)};
for (const [pattern, output] of Object.entries(outputs)) {
  if (args.startsWith(pattern)) {
    fs.writeSync(1, output);
    process.exit(0);
  }
}
if (args.startsWith('worktree list --porcelain -z')) {
  fs.writeSync(1, 'worktree ' + ${JSON.stringify(sandbox)} + '\\0HEAD test\\0branch refs/heads/trunk\\0\\0');
  process.exit(0);
}
process.exit(0);
`
  );
  chmodSync(gitShim, 0o755);

  const ghShim = path.join(binDir, 'gh');
  writeFileSync(
    ghShim,
    `#!/usr/bin/env node
import fs from 'node:fs';
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(logPath)}, 'gh ' + args.join(' ') + '\\n');
const behavior = ${JSON.stringify(ghBehavior)};
if (behavior === 'fail') {
  process.stderr.write('gh: simulated failure\\n');
  process.exit(1);
}
// 'issue view ... --json comments' → return no comments by default
if (args[0] === 'issue' && args[1] === 'view') {
  const body = fs.readFileSync(${JSON.stringify(remotePath)}, 'utf8');
  fs.writeSync(1, JSON.stringify({
    comments: body ? [{ id: 'C_REMOTE', url: 'https://example.test/comment', body }] : []
  }));
  process.exit(0);
}
if (args[0] === 'issue' && args[1] === 'comment') {
  const bodyIndex = args.indexOf('--body');
  fs.writeFileSync(${JSON.stringify(remotePath)}, bodyIndex === -1 ? '' : args[bodyIndex + 1]);
  process.exit(0);
}
if (args[0] === 'api' && args[1] === 'graphql') {
  const bodyArg = args.find((arg) => arg.startsWith('body='));
  if (bodyArg) fs.writeFileSync(${JSON.stringify(remotePath)}, bodyArg.slice('body='.length));
  process.exit(0);
}
process.exit(0);
`
  );
  chmodSync(ghShim, 0o755);

  return { binDir, logPath };
}

function readLog(p) {
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

async function runHandler(payload, { sandbox, binDir, env = {} }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [HANDLER], {
      cwd: sandbox,
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH}`,
        AI_TASK_MANAGER_PROJECT_DIR: sandbox,
        AI_TASK_MANAGER_APP_NAME: 'codex',
        AI_TASK_MANAGER_SESSION_ID: TRAIL_SESSION_ID,
        ...env,
      },
    });
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

const cleanups = [];

try {
  // E2E-1: successful git commit → triggers git + gh calls
  {
    const sandbox = setupSandbox();
    cleanups.push(sandbox);
    const { binDir, logPath } = makeShim(sandbox, {
      gitOutputs: {
        'rev-parse HEAD': 'abc1234fffffffff0000000000000000000\n',
        'log -1': 'abc1234fffffffff0000000000000000000\tfeat: x\tkendrick\t2026-05-10T14:32:11Z\n',
        'rev-parse --abbrev-ref HEAD': 'trunk\n',
        'rev-parse --git-dir': '.git\n',
        'rev-parse --git-common-dir': '.git\n',
        'rev-parse --show-toplevel': sandbox + '\n',
      },
    });
    const payload = {
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m "feat: x"' },
      tool_response: { exit_code: 0 },
      cwd: sandbox,
    };
    const r = await runHandler(payload, { sandbox, binDir });
    assert.equal(r.code, 0);
    const log = readLog(logPath);
    assert.match(log, /git rev-parse HEAD/);
    assert.match(log, /gh issue view 42/);
    assert.match(log, /gh issue comment 42/);
  }

  // E2E-2: exit_code != 0 → no git/gh calls
  {
    const sandbox = setupSandbox();
    cleanups.push(sandbox);
    const { binDir, logPath } = makeShim(sandbox);
    const payload = {
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m "x"' },
      tool_response: { exit_code: 1 },
      cwd: sandbox,
    };
    await runHandler(payload, { sandbox, binDir });
    assert.equal(readLog(logPath), '');
  }

  // E2E-3: --amend → no git/gh calls
  {
    const sandbox = setupSandbox();
    cleanups.push(sandbox);
    const { binDir, logPath } = makeShim(sandbox);
    const payload = {
      tool_name: 'Bash',
      tool_input: { command: 'git commit --amend --no-edit' },
      tool_response: { exit_code: 0 },
      cwd: sandbox,
    };
    await runHandler(payload, { sandbox, binDir });
    assert.equal(readLog(logPath), '');
  }

  // E2E-4: no active issue → no git/gh calls
  {
    const sandbox = setupSandbox({ active: null });
    cleanups.push(sandbox);
    const { binDir, logPath } = makeShim(sandbox);
    const payload = {
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m "x"' },
      tool_response: { exit_code: 0 },
      cwd: sandbox,
    };
    await runHandler(payload, { sandbox, binDir });
    assert.equal(readLog(logPath), '');
  }

  // E2E-5: non-Bash tool → no calls
  {
    const sandbox = setupSandbox();
    cleanups.push(sandbox);
    const { binDir, logPath } = makeShim(sandbox);
    const payload = {
      tool_name: 'Edit',
      tool_input: { command: 'git commit -m "x"' },
      tool_response: { exit_code: 0 },
      cwd: sandbox,
    };
    await runHandler(payload, { sandbox, binDir });
    assert.equal(readLog(logPath), '');
  }

  // E2E-6: gh failure → handler still exits 0 (silent)
  {
    const sandbox = setupSandbox();
    cleanups.push(sandbox);
    const { binDir } = makeShim(sandbox, {
      gitOutputs: {
        'rev-parse HEAD': 'abc1234\n',
        'log -1': 'abc1234\ts\ta\tt\n',
        'rev-parse --abbrev-ref HEAD': 'trunk\n',
        'rev-parse --git-dir': '.git\n',
        'rev-parse --git-common-dir': '.git\n',
        'rev-parse --show-toplevel': sandbox + '\n',
      },
      ghBehavior: 'fail',
    });
    const payload = {
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m x' },
      tool_response: { exit_code: 0 },
      cwd: sandbox,
    };
    const r = await runHandler(payload, { sandbox, binDir });
    assert.equal(r.code, 0);
  }

  // E2E-7: not a git commit → no calls
  {
    const sandbox = setupSandbox();
    cleanups.push(sandbox);
    const { binDir, logPath } = makeShim(sandbox);
    const payload = {
      tool_name: 'Bash',
      tool_input: { command: 'git status' },
      tool_response: { exit_code: 0 },
      cwd: sandbox,
    };
    await runHandler(payload, { sandbox, binDir });
    assert.equal(readLog(logPath), '');
  }

  console.log('commit-trail-handler: ok');
} finally {
  for (const s of cleanups) {
    try {
      rmSync(s, { recursive: true, force: true });
    } catch {}
  }
}
