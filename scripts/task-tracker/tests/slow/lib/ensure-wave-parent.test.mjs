#!/usr/bin/env node
// @story #43
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
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const HELPER = path.resolve(__dir, '..', '..', '..', 'gh', 'ensure-wave-parent.mjs');

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
        kanbanOptionRefine: 'OPT_groom',
        kanbanOptionPlan: 'OPT_analyze',
        kanbanOptionDevelop: 'OPT_dev',
        kanbanOptionTest: 'OPT_validate',
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
import fs from 'node:fs';
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
  fs.writeSync(1,JSON.stringify(fx.searchIssues || []));
  process.exit(0);
}

// gh issue create — return URL
if (argv[0] === 'issue' && argv[1] === 'create') {
  fs.writeSync(1,\`https://github.com/test-owner/test-repo/issues/\${fx.newIssueNumber || 500}\\n\`);
  process.exit(0);
}

// gh issue edit / comment — no-op
if (argv[0] === 'issue' && (argv[1] === 'edit' || argv[1] === 'comment' || argv[1] === 'view')) {
  if (argv[1] === 'view') {
    // create-issue tether may probe; return minimal
    fs.writeSync(1,JSON.stringify({ body: '', state: 'OPEN', projectItems: { nodes: [] } }));
  }
  process.exit(0);
}

// gh project item-edit / item-add — no-op
if (argv[0] === 'project') {
  fs.writeSync(1,'{}');
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
    fs.writeSync(1,JSON.stringify({ data: { repository: repo } }));
    process.exit(0);
  }
  // node-id lookup: query(...) { repository { issue { id } } }
  if (/issue\\(number:\\$n\\)\\{id\\}/.test(stdinBody)) {
    const body = JSON.parse(stdinBody);
    const n = Number(body.variables.n);
    fs.writeSync(1,JSON.stringify({ data: { repository: { issue: { id: 'ISS_' + n } } } }));
    process.exit(0);
  }
  // addSubIssue mutation
  if (/addSubIssue/.test(stdinBody)) {
    fs.writeSync(1,JSON.stringify({ data: { addSubIssue: { issue: { id: 'X' }, subIssue: { id: 'Y' } } } }));
    process.exit(0);
  }
  // project-tether internals: fieldOptionMap / projectItemForIssue / writes — return permissive envelopes
  if (/ProjectV2SingleSelectField/.test(stdinBody)) {
    fs.writeSync(1,JSON.stringify({ data: { node: { fields: { nodes: [
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
    const st = loadState();
    const projectNodes = st.added ? [{ id: 'PVTI_new', project: { id: 'PVT_test', title: 'Test Project', url: 'https://github.com/test' } }] : [];
    fs.writeSync(1,JSON.stringify({ data: { repository: { id: 'REPO_test', issue: { id: 'ISS_' + n, number: n, title: 't', url: 'u', projectItems: { nodes: projectNodes } } } } }));
    process.exit(0);
  }
  // project-tether: node(id:$project) { ... ProjectV2 ... items { nodes } }
  if (/node\\(id: \\$project\\)/.test(stdinBody) && /items\\(first:/.test(stdinBody)) {
    const body = JSON.parse(stdinBody);
    const st = loadState();
    const nodes = st.added ? [{ id: 'PVTI_new', isArchived: false, content: { number: fx.newIssueNumber || 500, title: 't', url: 'u' } }] : [];
    fs.writeSync(1,JSON.stringify({ data: { node: {
      title: 'Test Project', url: 'https://github.com/test',
      items: { totalCount: nodes.length, pageInfo: { hasNextPage: false, endCursor: null }, nodes }
    } } }));
    process.exit(0);
  }
  // project-tether: linkProjectV2ToRepository — no-op
  if (/linkProjectV2ToRepository/.test(stdinBody)) {
    fs.writeSync(1,JSON.stringify({ data: { linkProjectV2ToRepository: { repository: { nameWithOwner: 'test-owner/test-repo' } } } }));
    process.exit(0);
  }
  // project-tether: addProjectV2ItemById mutation
  if (/addProjectV2ItemById/.test(stdinBody)) {
    const st = loadState(); st.added = true; saveState(st);
    fs.writeSync(1,JSON.stringify({ data: { addProjectV2ItemById: { item: { id: 'PVTI_new' } } } }));
    process.exit(0);
  }
  // project-tether: updateProjectV2ItemFieldValue
  if (/updateProjectV2ItemFieldValue/.test(stdinBody)) {
    fs.writeSync(1,JSON.stringify({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'PVTI_new' } } } }));
    process.exit(0);
  }
  if (/projectItems/.test(stdinBody)) {
    fs.writeSync(1,JSON.stringify({ data: { repository: { issue: { id: 'ISS_new', projectItems: { nodes: [{ id: 'PVTI_new', project: { id: 'PVT_test' }, fieldValueByName: { optionId: 'OPT_dev' } }] }, comments: { nodes: [] } } } } }));
    process.exit(0);
  }
  fs.writeSync(1,JSON.stringify({ data: {} }));
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
  const helperUrl = new URL(`file://${HELPER}`).href;
  const runner = `
    import { runEnsureWaveParent } from ${JSON.stringify(helperUrl)};
    let liveBody = '';
    const withGovernedEffect = async (_options, callback) =>
      callback({ leaseContext: { projectId: 'PVT_test', leaseId: 'lease-test', fencingToken: '1', worktreeId: 'wt-test' }, reverify: async () => {} });
    try {
      await runEnsureWaveParent({
        rawArgs: ${JSON.stringify(args)},
        deps: {
          withGovernedEffect,
          projectDir: ${JSON.stringify(sandbox)},
          env: process.env,
          createIssueDeps: {
            body: {
              fetchBody: async () => liveBody,
              pushBody: async (_repo, _issue, next) => { liveBody = next; },
            },
            tether: { retryDelayMs: 0 },
          },
        },
      });
    } catch (error) {
      process.stderr.write(error.message + '\\n');
      process.exitCode = error.exitCode || 1;
    }
  `;
  try {
    const r = await pexec('node', ['--input-type=module', '--eval', runner], {
      env,
      timeout: 30000,
    });
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
  const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-ewp-1-'));
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
      '--anchor',
      '900',
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
  const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-ewp-2-'));
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
  const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-ewp-3-'));
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
  const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-ewp-4-'));
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
  const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-ewp-5-'));
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
  const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-ewp-6-'));
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
    const r = await runHelper(sandbox, binDir, [
      '--children',
      '60,61',
      '--purpose',
      'idempotent',
      '--anchor',
      '900',
    ]);
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

// ─── Test 7 (#459 Bug B): search query must NOT contain HTML comment syntax ────
{
  const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-ewp-7-'));
  try {
    writeConfig(sandbox);
    const { binDir, callsLog } = makeGhShim(sandbox, {
      parents: { 70: null, 71: null },
      searchIssues: [],
      newIssueNumber: 800,
    });
    // Run with two solo children — triggers findExistingParentByWaveId search.
    await runHelper(sandbox, binDir, [
      '--children',
      '70,71',
      '--purpose',
      'search-query-test',
      '--anchor',
      '900',
    ]);
    const calls = readCalls(callsLog);
    const searchCall = calls.find((c) => c.argv[0] === 'search' && c.argv[1] === 'issues');
    assert.ok(searchCall, 'expected a gh search issues call');
    // The search query argument must not contain HTML comment wrappers.
    const queryArg = searchCall.argv.join(' ');
    assert.ok(
      !queryArg.includes('<!--') && !queryArg.includes('-->'),
      `search query must not contain HTML comment syntax; got: ${queryArg}`
    );
    // The query must still contain the plain wave-id marker text.
    assert.match(queryArg, /wave-id:/, 'search query must contain plain "wave-id:" text');
    console.log('test 7 passed: search query does not contain HTML comment syntax');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

// ─── Test 8 (#1049): production chain Nth-stale + durable retry ───────────────
{
  const { runEnsureWaveParent } = await import(new URL(`file://${HELPER}`).href);
  const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-ewp-8-'));
  const cfg = {
    repo: 'test-owner/test-repo',
    projectId: 'PVT_test',
    kanbanFieldId: 'PVTF_status',
    kanbanOptionBacklog: 'OPT_backlog',
    kanbanOptionDevelop: 'OPT_develop',
  };

  function makeFixture() {
    const state = {
      parent: null,
      creates: 0,
      projectAdded: false,
      projectAdds: 0,
      body: '',
      links: new Set(),
      linkAttempts: 0,
      title: 'Wave: governed',
      titleUpdates: 0,
      timing: null,
      timingCreates: 0,
    };
    const runGql = async (query, variables) => {
      if (/addSubIssue/.test(query)) {
        state.linkAttempts += 1;
        if (state.links.has(variables.child)) {
          const error = new Error('already linked');
          error.code = 'already-linked';
          throw error;
        }
        state.links.add(variables.child);
        return { addSubIssue: { issue: { id: variables.parent } } };
      }
      if (/updateIssue/.test(query)) {
        state.title = variables.title;
        state.titleUpdates += 1;
        return { updateIssue: { issue: { id: variables.id } } };
      }
      if (/node\(id:\$id\).*title/.test(query.replace(/\s+/g, ''))) {
        return { node: { title: state.title } };
      }
      if (/linkProjectV2ToRepository/.test(query)) {
        return { linkProjectV2ToRepository: { repository: { nameWithOwner: cfg.repo } } };
      }
      if (/addProjectV2ItemById/.test(query)) {
        state.projectAdded = true;
        state.projectAdds += 1;
        return { addProjectV2ItemById: { item: { id: 'PVTI_parent' } } };
      }
      if (/updateProjectV2ItemFieldValue/.test(query)) {
        return { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'PVTI_parent' } } };
      }
      if (/projectItems\(first: 50\)/.test(query)) {
        const number = Number(variables.issue);
        return {
          repository: {
            id: 'REPO_test',
            issue: {
              id: `ISS_${number}`,
              number,
              title: state.title,
              url: `https://example.test/issues/${number}`,
              projectItems: {
                nodes: state.projectAdded
                  ? [
                      {
                        id: 'PVTI_parent',
                        project: { id: cfg.projectId, title: 'Test', url: 'u' },
                      },
                    ]
                  : [],
              },
            },
          },
        };
      }
      if (/items\(first: 100/.test(query)) {
        return {
          node: {
            title: 'Test',
            url: 'u',
            items: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [],
            },
          },
        };
      }
      if (/issue\(number:\$n\)\{id\}/.test(query.replace(/\s+/g, ''))) {
        return { repository: { issue: { id: `ISS_${variables.n}` } } };
      }
      throw new Error(`unexpected GraphQL operation: ${query}`);
    };
    const createIssueDeps = {
      createIssue: async ({ bodyContent }) => {
        state.creates += 1;
        state.parent = 500;
        state.body = bodyContent;
        return state.parent;
      },
      tether: { runGql, retryDelayMs: 0 },
      body: {
        fetchBody: async () => state.body,
        pushBody: async (_repo, _issue, next) => {
          state.body = next;
        },
      },
    };
    const deps = {
      projectDir: sandbox,
      env: {},
      classify: async () => ({ kind: 'all-solo', solos: [10, 11] }),
      runGql,
      findExistingParentByWaveId: async () => state.parent,
      createIssueDeps,
      timing: {
        findTimingComment: async () => state.timing,
        createTimingComment: async (_issue, _repo, body) => {
          state.timing = { id: 'TIMING_1', body };
          state.timingCreates += 1;
        },
        updateTimingComment: async (_id, _repo, body) => {
          state.timing = { id: 'TIMING_1', body };
        },
      },
    };
    return { state, deps };
  }

  function authority(staleAt = Infinity) {
    let verifies = 0;
    return async (options, callback) => {
      assert.equal(options.issueId, '900');
      return callback({
        leaseContext: {
          projectId: cfg.projectId,
          leaseId: 'lease-controller',
          fencingToken: '42',
          worktreeId: 'wt-controller',
        },
        reverify: async () => {
          verifies += 1;
          if (verifies === staleAt) {
            const error = new Error(`stale controller at effect ${verifies}`);
            error.code = 'fence-stale';
            throw error;
          }
        },
      });
    };
  }

  async function run(fixture, withGovernedEffect) {
    return runEnsureWaveParent({
      rawArgs: ['--children', '10,11', '--purpose', 'governed', '--anchor', '900'],
      cfg,
      deps: { ...fixture.deps, withGovernedEffect },
    });
  }

  try {
    for (const staleAt of [4, 10, 11, 13]) {
      const fixture = makeFixture();
      await assert.rejects(run(fixture, authority(staleAt)), (error) => {
        assert.equal(error.code, 'fence-stale');
        return true;
      });
      const result = await run(fixture, authority());
      assert.equal(result.parentNumber, 500);
      assert.equal(fixture.state.creates, 1, `staleAt=${staleAt}: no duplicate parent`);
      assert.equal(fixture.state.projectAdds, 1, `staleAt=${staleAt}: no duplicate project add`);
      assert.equal(fixture.state.links.size, 2, `staleAt=${staleAt}: both children durable`);
      assert.match(fixture.state.title, /^🧑‍🧒‍🧒 \[Epic\] /);
      assert.equal(fixture.state.titleUpdates, 1, `staleAt=${staleAt}: one title mutation`);
      assert.equal(fixture.state.timingCreates, 1, `staleAt=${staleAt}: one timing create`);
      assert.match(fixture.state.body, /aitm-entered-develop/);
    }
    console.log(
      'test 8 passed: production create/tether/body/reparent/title/timing chain fences Nth stale and retries without duplicates'
    );
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

console.log('ensure-wave-parent: all tests passed');
