#!/usr/bin/env node
// @story #807
// One case per AC of #807:
//   AC1 happy path       — sets Rank and prints `✓ #<issue> → rank <n>`, write reaches the gh shim
//   AC2 round-trip       — Rank written to the shim reads back equal to <n>
//   AC3 arg validation   — missing / non-numeric arg exits non-zero with usage
//   AC4 unconfigured     — no Rank field id → warn + exit 0, no write attempted
import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const SCRIPT = path.resolve(__dir, '../../../gh/set-rank.mjs');

async function run(args, env = {}) {
  return pexec('node', [SCRIPT, ...args], { env: { ...process.env, ...env } });
}
async function runExpectFail(args, env = {}) {
  try {
    await run(args, env);
    assert.fail('Expected non-zero exit but succeeded');
  } catch (e) {
    return e;
  }
}

// A gh shim that answers the project-tether gql queries and persists every
// number-field write to a log file. TARGET_ITEM is the issue's project item.
function writeGhShim(binDir, argvLog, { itemId, rankFieldId, projectId }) {
  mkdirSync(binDir, { recursive: true });
  const ghShim = path.join(binDir, 'gh');
  writeFileSync(
    ghShim,
    `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
let body = '';
process.stdin.on('data', (c) => (body += c));
process.stdin.on('end', () => {
  const argv = process.argv.slice(2);
  appendFileSync(${JSON.stringify(argvLog)}, JSON.stringify({ argv, body }) + '\\n');
  const q = body || argv.join(' ');
  if (/repository\\(owner/.test(q)) {
    // fetchIssue: reverse lookup already surfaces the linked project item.
    process.stdout.write(JSON.stringify({ data: { repository: {
      id: 'REPO_x',
      issue: { id: 'ISSUE_x', number: 807, title: 't', url: 'u',
        projectItems: { nodes: [ { id: ${JSON.stringify(itemId)}, project: { id: ${JSON.stringify(projectId)} } } ] } },
    } } }));
  } else if (/updateProjectV2ItemFieldValue/.test(q)) {
    process.stdout.write(JSON.stringify({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: ${JSON.stringify(itemId)} } } } }));
  } else {
    process.stdout.write('{}');
  }
});
`
  );
  chmodSync(ghShim, 0o755);
}

function sandboxWithRankField() {
  const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-sr-'));
  mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify(
      { repo: 'test-owner/test-repo', projectId: 'PVT_test', fieldRank: 'PVTF_rank' },
      null,
      2
    )
  );
  return sandbox;
}

// Pull every persisted rank write (field === PVTF_rank) out of the shim log.
function rankWrites(argvLog) {
  const lines = readFileSync(argvLog, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  return lines
    .map((l) => {
      try {
        return JSON.parse(l.body);
      } catch {
        return null;
      }
    })
    .filter((v) => v?.variables?.field === 'PVTF_rank')
    .map((v) => v.variables.val);
}

// AC1 — happy path: sets Rank, prints confirmation, write reaches the shim.
{
  const sandbox = sandboxWithRankField();
  const binDir = path.join(sandbox, 'bin');
  const argvLog = path.join(sandbox, 'gh-argv.log');
  writeGhShim(binDir, argvLog, {
    itemId: 'PVTI_x',
    rankFieldId: 'PVTF_rank',
    projectId: 'PVT_test',
  });

  const r = await run(['807', '42'], {
    PATH: `${binDir}:${process.env.PATH}`,
    AITM_GH_TEST_DOUBLE_BIN: binDir,
    AI_TASK_MANAGER_PROJECT_DIR: sandbox,
  });
  assert.match(r.stdout, /✓ #807 → rank 42/, 'prints the confirmation line');
  const writes = rankWrites(argvLog);
  assert.ok(writes.includes(42), 'a rank=42 write reached the gh shim');
  rmSync(sandbox, { recursive: true });
}

// AC2 — round-trip: the value written to the shim reads back equal to <n>.
{
  const sandbox = sandboxWithRankField();
  const binDir = path.join(sandbox, 'bin');
  const argvLog = path.join(sandbox, 'gh-argv.log');
  writeGhShim(binDir, argvLog, {
    itemId: 'PVTI_x',
    rankFieldId: 'PVTF_rank',
    projectId: 'PVT_test',
  });

  await run(['807', '7'], {
    PATH: `${binDir}:${process.env.PATH}`,
    AITM_GH_TEST_DOUBLE_BIN: binDir,
    AI_TASK_MANAGER_PROJECT_DIR: sandbox,
  });
  const writes = rankWrites(argvLog);
  assert.equal(writes.length, 1, 'exactly one rank write');
  assert.equal(writes[0], 7, 'rank read back from the shim equals the value set');
  rmSync(sandbox, { recursive: true });
}

// AC3 — missing / non-numeric argument exits non-zero with usage.
{
  const eNone = await runExpectFail([]);
  assert.match(eNone.stderr + eNone.stdout, /Usage/i, 'no args → usage');

  const eNoRank = await runExpectFail(['807'], { TT_SKIP_NETWORK: '1' });
  assert.match(eNoRank.stderr + eNoRank.stdout, /Usage/i, 'missing rank → usage');

  const eBadIssue = await runExpectFail(['abc', '5'], { TT_SKIP_NETWORK: '1' });
  assert.match(eBadIssue.stderr + eBadIssue.stdout, /Usage/i, 'non-numeric issue → usage');

  const eBadRank = await runExpectFail(['807', 'xyz'], { TT_SKIP_NETWORK: '1' });
  assert.match(eBadRank.stderr + eBadRank.stdout, /Usage/i, 'non-numeric rank → usage');
}

// AC4 — no Rank field id configured → warn + exit 0, no write attempted.
{
  const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-sr-noc-'));
  mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify({ repo: 'test-owner/test-repo', projectId: 'PVT_test' }, null, 2)
  );
  const binDir = path.join(sandbox, 'bin');
  const argvLog = path.join(sandbox, 'gh-argv.log');
  writeGhShim(binDir, argvLog, { itemId: 'PVTI_x', rankFieldId: '', projectId: 'PVT_test' });

  const r = await run(['807', '9'], {
    PATH: `${binDir}:${process.env.PATH}`,
    AITM_GH_TEST_DOUBLE_BIN: binDir,
    AI_TASK_MANAGER_PROJECT_DIR: sandbox,
  });
  assert.match(r.stderr, /no Rank field id configured/i, 'warns about unconfigured Rank field');
  let logged = '';
  try {
    logged = readFileSync(argvLog, 'utf8');
  } catch {
    logged = '';
  }
  assert.doesNotMatch(logged, /updateProjectV2ItemFieldValue/, 'no write mutation attempted');
  rmSync(sandbox, { recursive: true });
}

console.log('set-rank.test.mjs: all passed');
