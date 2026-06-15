#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { projectScratchDir } from '../lib/scratch-dir.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(__dir, '../../gh/set-priority.mjs');

async function run(args, env = {}) {
  return pexec('node', [SCRIPT, ...args], {
    env: { ...process.env, ...env },
  });
}

async function runExpectFail(args, env = {}) {
  try {
    await run(args, env);
    assert.fail('Expected non-zero exit but succeeded');
  } catch (e) {
    return e;
  }
}

// Test: missing args prints usage and exits non-zero
{
  const e = await runExpectFail([]);
  assert.match(e.stderr + e.stdout, /Usage/i, 'missing args should print usage');
}

// Test: non-numeric issue number prints usage and exits non-zero
{
  const e = await runExpectFail(['abc', 'p1'], { TT_SKIP_NETWORK: '1' });
  assert.match(e.stderr + e.stdout, /Usage/i, 'non-numeric issue should print usage');
}

// Test: unknown priority exits non-zero
{
  const e = await runExpectFail(['123', 'p9'], { TT_SKIP_NETWORK: '1' });
  assert.match(e.stderr + e.stdout, /Unknown priority/i, 'invalid priority should print error');
}

// Test: valid priority with TT_SKIP_NETWORK prints success without hitting GH
{
  const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-sp-'));
  mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify(
      {
        repo: 'test-owner/test-repo',
        projectId: 'PVT_test123',
        priorityFieldId: 'PVTF_prio',
        priorityOptionP0: 'PVTO_p0',
        priorityOptionP1: 'PVTO_p1',
        priorityOptionP2: 'PVTO_p2',
        priorityOptionP3: 'PVTO_p3',
      },
      null,
      2
    )
  );
  for (const priority of ['p0', 'p1', 'p2', 'p3', 'P0', 'P1', 'P2', 'P3']) {
    const r = await run(['123', priority], {
      TT_SKIP_NETWORK: '1',
      AI_TASK_MANAGER_PROJECT_DIR: sandbox,
    });
    assert.match(r.stdout, /P[0123]/, `priority ${priority} should print success`);
  }
  rmSync(sandbox, { recursive: true });
}

// Test: when issue is in multiple projects, only the configured projectId is selected.
{
  const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-sp-multi-'));
  const TARGET_PROJECT = 'PVT_target';
  const OTHER_PROJECT = 'PVT_other';
  const TARGET_ITEM = 'PVTI_target_item';
  const OTHER_ITEM = 'PVTI_other_item';

  mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify(
      {
        repo: 'test-owner/test-repo',
        projectId: TARGET_PROJECT,
        priorityFieldId: 'PVTF_prio',
        priorityOptionP0: 'PVTO_p0',
        priorityOptionP1: 'PVTO_p1',
        priorityOptionP2: 'PVTO_p2',
      },
      null,
      2
    )
  );

  const binDir = path.join(sandbox, 'bin');
  mkdirSync(binDir, { recursive: true });
  const argvLog = path.join(sandbox, 'gh-argv.log');
  const ghShim = path.join(binDir, 'gh');
  writeFileSync(
    ghShim,
    `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
const argv = process.argv.slice(2);
appendFileSync(${JSON.stringify(argvLog)}, JSON.stringify(argv) + '\\n');
if (argv[0] === 'api' && argv[1] === 'graphql') {
  process.stdout.write(JSON.stringify({ data: { repository: { issue: { projectItems: { nodes: [
    { id: ${JSON.stringify(OTHER_ITEM)}, project: { id: ${JSON.stringify(OTHER_PROJECT)} } },
    { id: ${JSON.stringify(TARGET_ITEM)}, project: { id: ${JSON.stringify(TARGET_PROJECT)} } },
  ] } } } } }));
} else {
  process.stdout.write('{}');
}
`
  );
  chmodSync(ghShim, 0o755);

  await run(['123', 'p1'], {
    PATH: `${binDir}:${process.env.PATH}`,
    AI_TASK_MANAGER_PROJECT_DIR: sandbox,
  });

  const lines = readFileSync(argvLog, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  const editCall = lines.find((a) => a[0] === 'project' && a[1] === 'item-edit');
  assert.ok(editCall, 'expected a project item-edit call');
  const idIdx = editCall.indexOf('--id');
  assert.equal(
    editCall[idIdx + 1],
    TARGET_ITEM,
    'should select item from configured projectId, not the first one'
  );
  const projIdx = editCall.indexOf('--project-id');
  assert.equal(
    editCall[projIdx + 1],
    TARGET_PROJECT,
    '--project-id should match configured projectId'
  );

  rmSync(sandbox, { recursive: true });
}

console.log('set-priority.test.mjs: all passed');
