#!/usr/bin/env node
// @story #219
// #219 — Integration: assignee guard end-to-end through the CLI.
//
// Two scenarios via the task-tracker.mjs CLI with a gh shim:
//   1. gateAssigneeMatch=true + issue assigned to someone else → exit 10
//   2. gateAssigneeMatch=false + same fixture → guard skipped, no exit 10

import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const CLI = path.resolve(__dir, '..', '..', 'task-tracker.mjs');

function writeConfig(sandbox, preferences = {}) {
  mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify(
      {
        repo: 'test-owner/test-repo',
        projectId: 'PVT_test',
        kanbanFieldId: 'PVTF_x',
        kanbanOptionBacklog: 'OPT_backlog',
        kanbanOptionDevelop: 'OPT_dev',
        kanbanOptionReview: 'OPT_review',
        kanbanOptionDone: 'OPT_done',
        preferences,
      },
      null,
      2
    )
  );
}

function writeState(sandbox, issueNum) {
  // #573: the global ledger lives under `.tmp/aitm/state/`.
  mkdirSync(path.join(sandbox, '.tmp', 'aitm', 'state'), { recursive: true });
  writeFileSync(
    path.join(sandbox, '.tmp', 'aitm', 'state', 'task-tracker-state.json'),
    JSON.stringify({
      active: `#${issueNum}`,
      lastActive: `#${issueNum}`,
      entryStartTs: null,
      wordsAtEntryStart: 0,
    })
  );
}

function makeGhShim(sandbox, { assignees, currentUser = 'kburson' }) {
  const binDir = path.join(sandbox, 'bin');
  mkdirSync(binDir, { recursive: true });
  const ghShim = path.join(binDir, 'gh');
  const assigneeNodes = assignees.map((a) => ({ login: a }));
  writeFileSync(
    ghShim,
    `#!/usr/bin/env node
const argv = process.argv.slice(2);
let stdinBody = '';
if (argv[0] === 'api' && argv[1] === 'graphql') {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  stdinBody = Buffer.concat(chunks).toString('utf8');
}
if (argv[0] === 'api' && argv[1] === 'user') {
  process.stdout.write(${JSON.stringify(currentUser)});
  process.exit(0);
}
if (argv[0] === 'api' && argv[1] === 'graphql') {
  if (stdinBody.includes('assignees')) {
    process.stdout.write(JSON.stringify({ data: { repository: { issue: { assignees: { nodes: ${JSON.stringify(assigneeNodes)} } } } } }));
    process.exit(0);
  }
  process.stdout.write(JSON.stringify({ data: { repository: { issue: { id: 'ISS', body: '', projectItems: { nodes: [{ id: 'PVTI', project: { id: 'PVT_test' }, fieldValueByName: { optionId: 'OPT_dev' } }] }, comments: { nodes: [] }, subIssues: { nodes: [] }, parent: null } } } }));
  process.exit(0);
}
if (argv[0] === 'issue' && argv[1] === 'view') {
  process.stdout.write(JSON.stringify({ body: '' }));
  process.exit(0);
}
process.exit(0);
`
  );
  chmodSync(ghShim, 0o755);
  return { binDir };
}

async function runCli(sandbox, binDir, args) {
  const env = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH}`,
    AI_TASK_MANAGER_PROJECT_DIR: sandbox,
    TT_SKIP_NETWORK: '',
  };
  try {
    const r = await pexec('node', [CLI, ...args], { env, timeout: 30000 });
    return { code: 0, stdout: r.stdout, stderr: r.stderr };
  } catch (err) {
    return { code: err.code ?? 1, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

// Test 1: guard ON + issue assigned to another user → exit 10.
{
  const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-assignee-1-'));
  try {
    writeConfig(sandbox, { gateAssigneeMatch: true });
    writeState(sandbox, 219);
    const { binDir } = makeGhShim(sandbox, { assignees: ['alice'], currentUser: 'kburson' });
    const r = await runCli(sandbox, binDir, ['pause', '#219']);
    assert.equal(r.code, 10, `expected exit 10; stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stdout, /PROMPT_REQUIRED: assignee-mismatch #219 assigned-to-other alice/);
    assert.match(r.stderr, /assigned to alice/);
    assert.match(r.stderr, /gh issue edit 219 --add-assignee @me/);
    console.log('test 1: guard ON + foreign assignee → exit 10 OK');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

// Test 2: guard OFF → bypassed; no assignee refusal.
{
  const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-assignee-2-'));
  try {
    writeConfig(sandbox, { gateAssigneeMatch: false });
    writeState(sandbox, 219);
    const { binDir } = makeGhShim(sandbox, { assignees: ['alice'], currentUser: 'kburson' });
    const r = await runCli(sandbox, binDir, ['pause', '#219']);
    assert.notEqual(r.code, 10, `guard must not fire when disabled; stderr:\n${r.stderr}`);
    assert.doesNotMatch(r.stdout, /assignee-mismatch/);
    console.log('test 2: guard OFF → bypass OK');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

console.log('assignee-guard.integration.test.mjs: ok');
