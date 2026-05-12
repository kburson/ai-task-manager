#!/usr/bin/env node
// E2E tests for scripts/gh/ensure-wave-parent.mjs (#43).
//
// Coverage:
//   1. Solo-wave happy path — 3 solos → creates parent, addSubIssue for each.
//   2. All-parented passthrough — 2 children sharing parent #99 → no creation.
//   3. Mixed fan-out rejection → exit 2.
//   4. Multi-parent rejection → exit 2.
//   5. Single-issue passthrough → no-op.
//   6. Idempotency — existing parent with matching wave-id is reused.

import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const HELPER = path.resolve(__dir, '..', '..', 'gh', 'ensure-wave-parent.mjs');

function writeConfig(sandbox) {
  mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify(
      {
        repo: 'test-owner/test-repo',
        projectId: 'PVT_test',
        kanbanFieldId: 'PVTF_x',
        kanbanOptionBacklog: 'OPT_backlog',
        kanbanOptionGroom: 'OPT_groom',
        kanbanOptionAnalyze: 'OPT_analyze',
        kanbanOptionDevelopment: 'OPT_dev',
        kanbanOptionValidate: 'OPT_validate',
        kanbanOptionReview: 'OPT_review',
        kanbanOptionDone: 'OPT_done',
        assignee: '@me',
      },
      null,
      2
    )
  );
}

// gh shim. Configurable via env JSON file (path passed through GH_SHIM_FIXTURE).
function makeGhShim(sandbox, fixture) {
  const binDir = path.join(sandbox, 'bin');
  mkdirSync(binDir, { recursive: true });
  const callsLog = path.join(sandbox, 'gh-calls.log');
  const fixturePath = path.join(sandbox, 'shim-fixture.json');
  writeFileSync(fixturePath, JSON.stringify(fixture));
  const ghShim = path.join(binDir, 'gh');
  const stateFile = path.join(sandbox, 'shim-state.json');
  writeFileSync(stateFile, JSON.stringify({ added: false }));
  writeFileSync(
    ghShim,
    `#!/usr/bin/env node
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
function loadState() { try { return JSON.parse(readFileSync(${JSON.stringify(stateFile)}, 'utf8')); } catch { return {}; } }
function saveState(s) { writeFileSync(${JSON.stringify(stateFile)}, JSON.stringify(s)); }
const argv = process.argv.slice(2);
let stdinBody = '';
if (argv[0] === 'api' && argv[1] === 'graphql' && argv.includes('--input') && argv.includes('-')) {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  stdinBody = Buffer.concat(chunks).toString('utf8');
}
appendFileSync(${JSON.stringify(callsLog)}, JSON.stringify({argv, stdinBody}) + '\\n');
const fx = JSON.parse(readFileSync(${JSON.stringify(fixturePath)}, 'utf8'));

// gh search issues — return existing parent matches (idempotency probe)
if (argv[0] === 'search' && argv[1] === 'issues') {
  process.stdout.write(JSON.stringify(fx.searchIssues || []));
  process.exit(0);
}

// gh issue create — return URL
if (argv[0] === 'issue' && argv[1] === 'create') {
  process.stdout.write(\`https://github.com/test-owner/test-repo/issues/\${fx.newIssueNumber || 500}\\n\`);
  process.exit(0);
}

// gh issue edit / comment — no-op
if (argv[0] === 'issue' && (argv[1] === 'edit' || argv[1] === 'comment' || argv[1] === 'view')) {
  if (argv[1] === 'view') {
    // create-issue tether may probe; return minimal
    process.stdout.write(JSON.stringify({ body: '', state: 'OPEN', projectItems: { nodes: [] } }));
  }
  process.exit(0);
}

// gh project item-edit / item-add — no-op
if (argv[0] === 'project') {
  process.stdout.write('{}');
  process.exit(0);
}

// gh api graphql — branch on stdinBody
if (argv[0] === 'api' && argv[1] === 'graphql') {
  // Batched parent enumeration query (i0: issue(number:$n0))
  if (/i0: issue\\(number:\\$n0\\)/.test(stdinBody)) {
    const body = JSON.parse(stdinBody);
    const vars = body.variables;
    const repo = {};
    let i = 0;
    while (vars['n' + i] !== undefined) {
      const childN = Number(vars['n' + i]);
      const parentN = (fx.parents || {})[String(childN)] ?? null;
      repo['i' + i] = { number: childN, parent: parentN == null ? null : { number: parentN } };
      i += 1;
    }
    process.stdout.write(JSON.stringify({ data: { repository: repo } }));
    process.exit(0);
  }
  // node-id lookup: query(...) { repository { issue { id } } }
  if (/issue\\(number:\\$n\\)\\{id\\}/.test(stdinBody)) {
    const body = JSON.parse(stdinBody);
    const n = Number(body.variables.n);
    process.stdout.write(JSON.stringify({ data: { repository: { issue: { id: 'ISS_' + n } } } }));
    process.exit(0);
  }
  // addSubIssue mutation
  if (/addSubIssue/.test(stdinBody)) {
    process.stdout.write(JSON.stringify({ data: { addSubIssue: { issue: { id: 'X' }, subIssue: { id: 'Y' } } } }));
    process.exit(0);
  }
  // project-tether internals: fieldOptionMap / projectItemForIssue / writes — return permissive envelopes
  if (/ProjectV2SingleSelectField/.test(stdinBody)) {
    process.stdout.write(JSON.stringify({ data: { node: { fields: { nodes: [
      { id: 'PVTF_x', options: [
        { id: 'OPT_backlog', name: 'Backlog' },
        { id: 'OPT_groom', name: 'Groom' },
        { id: 'OPT_analyze', name: 'Analyze' },
        { id: 'OPT_dev', name: 'Development' },
        { id: 'OPT_validate', name: 'Validate' },
        { id: 'OPT_review', name: 'Review' },
        { id: 'OPT_done', name: 'Done' },
      ] }
    ] } } } }));
    process.exit(0);
  }
  // project-tether: fetchIssue — query($owner,$repo,$issue) { repository { id issue { id ... projectItems } } }
  if (/repository\\(owner:.*\\)\\s*\\{\\s*id\\s*issue/.test(stdinBody)) {
    const body = JSON.parse(stdinBody);
    const n = Number(body.variables.issue);
    process.stdout.write(JSON.stringify({ data: { repository: { id: 'REPO_test', issue: { id: 'ISS_' + n, number: n, title: 't', url: 'u', projectItems: { nodes: [] } } } } }));
    process.exit(0);
  }
  // project-tether: node(id:$project) { ... ProjectV2 ... items { nodes } }
  if (/node\\(id: \\$project\\)/.test(stdinBody) && /items\\(first:/.test(stdinBody)) {
    const body = JSON.parse(stdinBody);
    const st = loadState();
    const nodes = st.added ? [{ id: 'PVTI_new', isArchived: false, content: { number: fx.newIssueNumber || 500, title: 't', url: 'u' } }] : [];
    process.stdout.write(JSON.stringify({ data: { node: {
      title: 'Test Project', url: 'https://github.com/test',
      items: { totalCount: nodes.length, pageInfo: { hasNextPage: false, endCursor: null }, nodes }
    } } }));
    process.exit(0);
  }
  // project-tether: linkProjectV2ToRepository — no-op
  if (/linkProjectV2ToRepository/.test(stdinBody)) {
    process.stdout.write(JSON.stringify({ data: { linkProjectV2ToRepository: { repository: { nameWithOwner: 'test-owner/test-repo' } } } }));
    process.exit(0);
  }
  // project-tether: addProjectV2ItemById mutation
  if (/addProjectV2ItemById/.test(stdinBody)) {
    const st = loadState(); st.added = true; saveState(st);
    process.stdout.write(JSON.stringify({ data: { addProjectV2ItemById: { item: { id: 'PVTI_new' } } } }));
    process.exit(0);
  }
  // project-tether: updateProjectV2ItemFieldValue
  if (/updateProjectV2ItemFieldValue/.test(stdinBody)) {
    process.stdout.write(JSON.stringify({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'PVTI_new' } } } }));
    process.exit(0);
  }
  if (/projectItems/.test(stdinBody)) {
    process.stdout.write(JSON.stringify({ data: { repository: { issue: { id: 'ISS_new', projectItems: { nodes: [{ id: 'PVTI_new', project: { id: 'PVT_test' }, fieldValueByName: { optionId: 'OPT_dev' } }] }, comments: { nodes: [] } } } } }));
    process.exit(0);
  }
  process.stdout.write(JSON.stringify({ data: {} }));
  process.exit(0);
}

process.exit(0);
`
  );
  chmodSync(ghShim, 0o755);
  return { binDir, callsLog };
}

async function runHelper(sandbox, binDir, args) {
  const env = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH}`,
    AI_TASK_MANAGER_PROJECT_DIR: sandbox,
    TT_SKIP_NETWORK: '1',
  };
  try {
    const r = await pexec('node', [HELPER, ...args], { env, timeout: 30000 });
    return { code: 0, stdout: r.stdout, stderr: r.stderr };
  } catch (err) {
    return { code: err.code ?? 1, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

function readCalls(callsLog) {
  if (!existsSync(callsLog)) return [];
  return readFileSync(callsLog, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

// ─── Test 1: Solo-wave happy path ─────────────────────────────────────────────
{
  const sandbox = mkdtempSync(path.join(tmpdir(), 'tt-ewp-1-'));
  try {
    writeConfig(sandbox);
    const { binDir, callsLog } = makeGhShim(sandbox, {
      parents: { 10: null, 11: null, 12: null },
      searchIssues: [],
      newIssueNumber: 500,
    });
    const r = await runHelper(sandbox, binDir, [
      '--children',
      '10,11,12',
      '--purpose',
      'wave for X',
    ]);
    assert.equal(r.code, 0, `exit non-zero; stderr:\n${r.stderr}`);
    assert.match(r.stdout, /PARENT: #500/, `expected PARENT: #500; got:\n${r.stdout}`);
    const calls = readCalls(callsLog);
    const created = calls.filter((c) => c.argv[0] === 'issue' && c.argv[1] === 'create');
    assert.equal(created.length, 1, 'should create exactly one parent issue');
    const addSubs = calls.filter((c) => /addSubIssue/.test(c.stdinBody || ''));
    assert.equal(addSubs.length, 3, `expected 3 addSubIssue mutations; saw ${addSubs.length}`);
    console.log('test 1 passed: solo-wave creates parent + 3 addSubIssue calls');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

// ─── Test 2: All-parented passthrough ─────────────────────────────────────────
{
  const sandbox = mkdtempSync(path.join(tmpdir(), 'tt-ewp-2-'));
  try {
    writeConfig(sandbox);
    const { binDir, callsLog } = makeGhShim(sandbox, {
      parents: { 20: 99, 21: 99 },
      searchIssues: [],
    });
    const r = await runHelper(sandbox, binDir, ['--children', '20,21', '--purpose', 'irrelevant']);
    assert.equal(r.code, 0, `exit non-zero; stderr:\n${r.stderr}`);
    assert.match(r.stdout, /PARENT: #99/);
    const calls = readCalls(callsLog);
    assert.equal(
      calls.filter((c) => c.argv[0] === 'issue' && c.argv[1] === 'create').length,
      0,
      'should NOT create a new parent'
    );
    assert.equal(
      calls.filter((c) => /addSubIssue/.test(c.stdinBody || '')).length,
      0,
      'should NOT addSubIssue'
    );
    console.log('test 2 passed: all-parented passthrough emits existing parent, no creation');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

// ─── Test 3: Mixed fan-out rejection ──────────────────────────────────────────
{
  const sandbox = mkdtempSync(path.join(tmpdir(), 'tt-ewp-3-'));
  try {
    writeConfig(sandbox);
    const { binDir, callsLog } = makeGhShim(sandbox, {
      parents: { 30: null, 31: 99 },
    });
    const r = await runHelper(sandbox, binDir, ['--children', '30,31', '--purpose', 'mixed']);
    assert.equal(r.code, 2, `expected exit 2; got ${r.code}; stderr:\n${r.stderr}`);
    assert.match(r.stderr, /mixed-fanout/);
    const calls = readCalls(callsLog);
    assert.equal(calls.filter((c) => c.argv[0] === 'issue' && c.argv[1] === 'create').length, 0);
    console.log('test 3 passed: mixed-fanout rejection');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

// ─── Test 4: Multi-parent rejection ───────────────────────────────────────────
{
  const sandbox = mkdtempSync(path.join(tmpdir(), 'tt-ewp-4-'));
  try {
    writeConfig(sandbox);
    const { binDir } = makeGhShim(sandbox, {
      parents: { 40: 99, 41: 100 },
    });
    const r = await runHelper(sandbox, binDir, ['--children', '40,41', '--purpose', 'multi']);
    assert.equal(r.code, 2, `expected exit 2; got ${r.code}; stderr:\n${r.stderr}`);
    assert.match(r.stderr, /multi-parent/);
    console.log('test 4 passed: multi-parent rejection');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

// ─── Test 5: Single-issue passthrough ─────────────────────────────────────────
{
  const sandbox = mkdtempSync(path.join(tmpdir(), 'tt-ewp-5-'));
  try {
    writeConfig(sandbox);
    const { binDir, callsLog } = makeGhShim(sandbox, { parents: { 50: null } });
    const r = await runHelper(sandbox, binDir, ['--children', '50', '--purpose', 'singleton']);
    assert.equal(r.code, 0, `exit non-zero; stderr:\n${r.stderr}`);
    assert.match(r.stdout, /NO_WAVE_PARENT_NEEDED/);
    const calls = readCalls(callsLog);
    assert.equal(calls.filter((c) => c.argv[0] === 'issue' && c.argv[1] === 'create').length, 0);
    console.log('test 5 passed: single-issue passthrough');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

// ─── Test 6: Idempotency — existing wave-id reused ────────────────────────────
{
  const sandbox = mkdtempSync(path.join(tmpdir(), 'tt-ewp-6-'));
  try {
    writeConfig(sandbox);
    // compute the wave-id the helper will compute for [60, 61]
    const { createHash } = await import('node:crypto');
    const sorted = [60, 61].sort((a, b) => a - b);
    const h = createHash('sha1').update(sorted.join(',')).digest('hex').slice(0, 10);
    const waveIdValue = `${sorted.join('-')}.${h}`;
    const fakeParentBody = `prelude\n<!-- wave-id: ${waveIdValue} -->\nepilog`;
    const { binDir, callsLog } = makeGhShim(sandbox, {
      parents: { 60: null, 61: null },
      searchIssues: [{ number: 777, body: fakeParentBody }],
    });
    const r = await runHelper(sandbox, binDir, ['--children', '60,61', '--purpose', 'idempotent']);
    assert.equal(r.code, 0, `exit non-zero; stderr:\n${r.stderr}`);
    assert.match(
      r.stdout,
      /PARENT: #777/,
      `expected reused parent #777; got:\n${r.stdout}\nstderr:\n${r.stderr}`
    );
    const calls = readCalls(callsLog);
    assert.equal(
      calls.filter((c) => c.argv[0] === 'issue' && c.argv[1] === 'create').length,
      0,
      'should NOT create a duplicate parent'
    );
    console.log('test 6 passed: idempotent retry reuses parent #777');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

console.log('ensure-wave-parent: all tests passed');
