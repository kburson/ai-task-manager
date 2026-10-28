#!/usr/bin/env node
// @story #807
// One case per AC of #807:
//   AC1 happy path       — sets Rank and prints `✓ #<issue> → rank <n>`, write reaches the gh shim
//   AC2 round-trip       — Rank written to the shim reads back equal to <n>
//   AC3 arg validation   — missing / non-numeric arg exits non-zero with usage
//   AC4 unconfigured     — no Rank field id → warn + exit 0, no write attempted
import { unitRuntimeEntrypointArgs } from '../../../helpers/unit-runtime-root.mjs';
import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { main as setRank } from '../../../../gh/set-rank.mjs';
import { mutateIssueBody } from '../../../../task-tracker/lib/issue-body-mutate.mjs';
import { formatIssueFieldDb, parseIssueFieldDb } from '../../../../task-tracker/issue-field-db.mjs';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const SCRIPT = path.resolve(__dir, '../../../gh/set-rank.mjs');

async function run(args, env = {}) {
  return pexec('node', unitRuntimeEntrypointArgs(SCRIPT, args), {
    env: { ...process.env, TT_SKIP_NETWORK: '0', ...env },
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

// A gh shim that answers the project-tether gql queries and persists every
// number-field write to a log file. TARGET_ITEM is the issue's project item.
function writeGhShim(binDir, argvLog, { itemId, rankFieldId, projectId }) {
  mkdirSync(binDir, { recursive: true });
  const ghShim = path.join(binDir, 'gh');
  const stateFile = `${argvLog}.state.json`;
  writeFileSync(
    stateFile,
    JSON.stringify({
      rank: null,
      body: `## Scope\nPreserve fields.\n${formatIssueFieldDb({ rank: null, estimate: null, engagedTime: null })}\n`,
    })
  );
  writeFileSync(
    ghShim,
    `#!/usr/bin/env node
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
const early = process.argv.slice(2);
if (early[0] === 'issue' && early[1] === 'view') {
  const current = JSON.parse(readFileSync(${JSON.stringify(stateFile)}, 'utf8'));
  appendFileSync(${JSON.stringify(argvLog)}, JSON.stringify({argv: early, body: ''}) + '\\n');
  process.stdout.write(current.body); process.exit(0);
}
let body = '';
process.stdin.on('data', (c) => (body += c));
process.stdin.on('end', () => {
  const argv = process.argv.slice(2);
  appendFileSync(${JSON.stringify(argvLog)}, JSON.stringify({ argv, body }) + '\\n');
  const state = JSON.parse(readFileSync(${JSON.stringify(stateFile)}, 'utf8'));
  const save = () => writeFileSync(${JSON.stringify(stateFile)}, JSON.stringify(state));
  if (argv[0] === 'issue' && argv[1] === 'view') {
    process.stdout.write(state.body); return;
  }
  if (argv[0] === 'issue' && argv[1] === 'edit') {
    state.body = body; save(); process.stdout.write('updated'); return;
  }
  const q = body || argv.join(' ');
  if (/repository\\(owner/.test(q)) {
    // fetchIssue: reverse lookup already surfaces the linked project item.
    process.stdout.write(JSON.stringify({ data: { repository: {
      id: 'REPO_x',
      issue: { id: 'ISSUE_x', number: 807, title: 't', url: 'u',
        projectItems: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [ { id: ${JSON.stringify(itemId)}, project: { id: ${JSON.stringify(projectId)} }, fieldValues: { nodes: state.rank === null ? [] : [{number: state.rank, field: {id: ${JSON.stringify(rankFieldId)}}}], pageInfo:{hasNextPage:false} } } ] } },
    } } }));
  } else if (/updateProjectV2ItemFieldValue/.test(q)) {
    state.rank = JSON.parse(body).variables.val; save();
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
  assert.equal(writes[0], 7, 'rank write requested');
  const observed = JSON.parse(readFileSync(`${argvLog}.state.json`, 'utf8'));
  assert.equal(observed.rank, 7, 'provider field persisted');
  assert.equal(parseIssueFieldDb(observed.body).values.rank, 7, 'native body cache persisted');
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

// #2092: provider I/O is doubled; the canonical fresh-base body writer is real.
function rankHarness(options = {}) {
  const initial = { priority: 'P1', size: 'S', estimate: 2, rank: null, engagedTime: null };
  const state = {
    body: `## Scope\nKeep recovery truthful.\n\n${formatIssueFieldDb(initial)}\n`,
    rank: null,
    writes: 0,
    pushes: 0,
    reads: 0,
    logs: [],
  };
  const original = state.body;
  const deps = {
    skipNetwork: false,
    loadConfig: () => ({ repo: 'o/r', projectId: 'PROJECT', fieldRank: 'RANK' }),
    fetchBody: async () => state.body,
    tetherIssueToProject: async ({ rank }) => {
      state.writes++;
      if (options.writeError) throw new Error('provider write unavailable');
      state.rank = rank;
      if (options.freshEdit) state.body += '\nA concurrent unrelated note.\n';
    },
    readRank: async () => {
      state.reads++;
      if (options.readError) throw new Error('provider read unavailable');
      return options.mismatch || (options.drift && state.reads > 1) ? 7 : state.rank;
    },
    mutateBody: (args) =>
      mutateIssueBody({
        ...args,
        deps: {
          fetchBody: async () => state.body,
          pushBody: async (_repo, _issue, next) => {
            state.pushes++;
            if (options.bodyError) throw new Error('body write unavailable');
            if (!options.lostBody) state.body = next;
          },
        },
      }),
    log: (line) => state.logs.push(line),
    exit: (code) => {
      throw new Error(`exit:${code}`);
    },
  };
  return { state, initial, original, deps };
}

test('#2092: verified rank reaches fresh body without changing other fields', async () => {
  const { state, initial, deps } = rankHarness({ freshEdit: true });
  await setRank(['node', SCRIPT, '2092', '8'], deps);
  assert.equal(state.rank, 8);
  assert.deepEqual(parseIssueFieldDb(state.body).values, { ...initial, rank: 8 });
  assert.match(state.body, /A concurrent unrelated note\./);
  assert.ok(state.reads >= 2, 'independent observations bracket fresh-base write');
  assert.equal(state.pushes, 1);
  assert.equal(state.logs.length, 1);
});

for (const option of ['writeError', 'readError', 'mismatch', 'drift', 'bodyError', 'lostBody']) {
  test(`#2092: ${option} refuses success and preserves unverified body`, async () => {
    const { state, original, deps } = rankHarness({ [option]: true });
    await assert.rejects(() => setRank(['node', SCRIPT, '2092', '8'], deps));
    assert.equal(state.body, original);
    assert.deepEqual(state.logs, []);
    if (['writeError', 'readError', 'mismatch', 'drift'].includes(option))
      assert.equal(state.pushes, 0);
  });
}

test('#2092: network suppression cannot print verified success', async () => {
  const { state, deps } = rankHarness();
  await assert.rejects(() =>
    setRank(['node', SCRIPT, '2092', '8'], { ...deps, skipNetwork: true })
  );
  assert.equal(state.writes, 0);
  assert.deepEqual(state.logs, []);
});
