#!/usr/bin/env node
// @story #58
// Tests for the human-gate config flags introduced in #58 and the immutable
// review-authorization ordering introduced in #1381.
//
//   gateAnalysisToDevelopment (boolean, default true)
//     - false: runApprove auto-approves without prompt, returns 'gate-bypassed'.
//
//   Before any legacy prompt or bypass path, close resolves immutable accepted
//   delivery evidence and review authorization. Missing approval evidence is a
//   deterministic refusal and cannot be manufactured by --answer or a local
//   gate toggle.

import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync, existsSync } from 'node:fs';
import {
  projectScratchDir,
  mkdtempProjectIsolated,
} from '../../../../task-tracker/lib/scratch-dir.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const CLI = path.resolve(__dir, '../../../task-tracker/task-tracker.mjs');

const OPT_REVIEW = 'OPT_review';
const OPT_DEV = 'OPT_dev';
const HEAD = 'a'.repeat(40);

function writeConfig(sandbox, extra = {}) {
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
        kanbanOptionDevelop: OPT_DEV,
        kanbanOptionTest: 'OPT_validate',
        kanbanOptionReview: OPT_REVIEW,
        kanbanOptionDone: 'OPT_done',
        fullAutoMerge: { mechanism: 'local-trunk-lane', operatorAuthorized: true },
        preferences: { gateAssigneeMatch: false },
        ...extra,
      },
      null,
      2
    )
  );
}

function makeGhShim(sandbox, { bodyOnView, stateOptionId }) {
  const binDir = path.join(sandbox, 'bin');
  mkdirSync(binDir, { recursive: true });
  const callsLog = path.join(sandbox, 'gh-calls.log');
  const ghShim = path.join(binDir, 'gh');
  writeFileSync(
    ghShim,
    `#!/usr/bin/env node
import fs from 'node:fs';
import { appendFileSync } from 'node:fs';
const argv = process.argv.slice(2);
let stdinBody = '';
const readsStdin =
  (argv[0] === 'api' && argv[1] === 'graphql' && argv.includes('--input') && argv.includes('-')) ||
  (argv[0] === 'issue' && argv[1] === 'edit' && argv.includes('--body-file') && argv.includes('-'));
if (readsStdin) {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  stdinBody = Buffer.concat(chunks).toString('utf8');
}
appendFileSync(${JSON.stringify(callsLog)}, JSON.stringify({argv, stdinBody}) + '\\n');

if (argv[0] === 'issue' && argv[1] === 'view') {
  fs.writeSync(1, JSON.stringify({ body: ${JSON.stringify(bodyOnView)} }));
  process.exit(0);
}
if (argv[0] === 'issue' && argv[1] === 'edit') { process.exit(0); }
if (argv[0] === 'issue' && argv[1] === 'comment') { process.exit(0); }
if (argv[0] === 'api' && argv[1] === 'graphql') {
  if (stdinBody.includes('ProjectV2SingleSelectField')) {
    fs.writeSync(1, JSON.stringify({ data: { node: { fields: { nodes: [] } } } }));
    process.exit(0);
  }
  const env = {
    data: {
      repository: {
        issue: {
          id: 'ISS_test',
          subIssues: { nodes: [] },
          parent: null,
          projectItems: { nodes: [{ id: 'PVTI_test', project: { id: 'PVT_test' }, fieldValueByName: { optionId: ${JSON.stringify(stateOptionId)} } }] },
          comments: { nodes: [] }
        }
      }
    }
  };
  fs.writeSync(1, JSON.stringify(env));
  process.exit(0);
}
process.exit(0);
`
  );
  chmodSync(ghShim, 0o755);
  const gitShim = path.join(binDir, 'git');
  writeFileSync(
    gitShim,
    `#!/usr/bin/env node
import fs from 'node:fs';
const argv = process.argv.slice(2);
if (argv[0] === 'branch' && argv[1] === '--show-current') fs.writeSync(1, 'trunk\\n');
else if (argv[0] === 'rev-parse' && argv[1] === 'HEAD') fs.writeSync(1, ${JSON.stringify(`${HEAD}\n`)});
else if (argv[0] === 'rev-parse' && argv[1] === '--show-toplevel') fs.writeSync(1, ${JSON.stringify(`${sandbox}\n`)});
else if (argv[0] === 'status') fs.writeSync(1, '');
else if (argv[0] === 'worktree' && argv[1] === 'list') fs.writeSync(1, ${JSON.stringify(`${sandbox} ${HEAD} [trunk]\n`)});
else if (argv[0] === 'log') fs.writeSync(1, '[#201] test\\n');
process.exit(0);
`
  );
  chmodSync(gitShim, 0o755);
  return { binDir, callsLog };
}

async function run(sandbox, binDir, args) {
  const env = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH}`,
    AITM_GH_TEST_DOUBLE_BIN: binDir,
    AI_TASK_MANAGER_PROJECT_DIR: sandbox,
    TT_SKIP_NETWORK: '',
  };
  try {
    const r = await pexec('node', [CLI, ...args], { env, cwd: sandbox, timeout: 30000 });
    return { code: 0, stdout: r.stdout, stderr: r.stderr };
  } catch (err) {
    return { code: err.code ?? 1, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

const TEST_RECEIPT = Buffer.from(JSON.stringify({ stage: 'test', commitSha: HEAD })).toString(
  'base64url'
);

const BODY_NO_MARKER = [
  '## Acceptance Criteria',
  '- [x] all done',
  '',
  '## Pickup Directive',
  '- [x] Deep dive complete',
  '',
  '- [x] Agent Review Passed <!-- aitm-verified gate="agent-review" result="pass" -->',
  `<!-- aitm-verification-receipt stage="test" data="${TEST_RECEIPT}" -->`,
].join('\n');

const BODY_WITH_MARKER =
  BODY_NO_MARKER +
  `\n<!-- aitm-review-approved ts="2026-05-10T00:00:00Z" approved-sha="${HEAD}" -->\n`;
const BODY_WITH_FULL_AUTO_MARKER =
  BODY_NO_MARKER +
  `\n<!-- aitm-review-approved ts="2026-05-10T00:00:00Z" approved-sha="${HEAD}" full-auto="yes" signals="session=1" -->\n`;

function writeState(sandbox, issueNum) {
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker-state.json'),
    JSON.stringify({
      active: `#${issueNum}`,
      lastActive: `#${issueNum}`,
      entryStartTs: null,
      wordsAtEntryStart: 0,
    })
  );
}

// ─── Test 1: missing immutable approval refuses before prompt/mutation ───────
{
  const sandbox = mkdtempProjectIsolated('tt-gate-1-');
  try {
    writeConfig(sandbox);
    writeState(sandbox, 201);
    const { binDir } = makeGhShim(sandbox, {
      bodyOnView: BODY_NO_MARKER,
      stateOptionId: OPT_REVIEW,
    });
    const r = await run(sandbox, binDir, ['close', '#201']);
    assert.equal(r.code, 1, `expected exit 1; stderr:\n${r.stderr}\nstdout:\n${r.stdout}`);
    assert.match(r.stderr, /review-authorization-missing/);
    assert.doesNotMatch(r.stdout, /PROMPT_REQUIRED/);
    console.log('test 1 passed: missing approval refuses before prompt');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

// ─── Test 2: --answer cannot manufacture immutable approval ─────────────────
{
  const sandbox = mkdtempProjectIsolated('tt-gate-2-');
  try {
    writeConfig(sandbox);
    writeState(sandbox, 202);
    const { binDir } = makeGhShim(sandbox, {
      bodyOnView: BODY_NO_MARKER,
      stateOptionId: OPT_REVIEW,
    });
    const r = await run(sandbox, binDir, ['close', '#202', '--answer', 'yes']);
    assert.equal(r.code, 1, `expected exit 1; stderr:\n${r.stderr}\nstdout:\n${r.stdout}`);
    assert.match(r.stderr, /review-authorization-missing/);
    assert.doesNotMatch(r.stdout, /PROMPT_REQUIRED/);
    console.log('test 2 passed: --answer cannot manufacture approval');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

// ─── Test 3: gateReviewToDone=false cannot bypass immutable authorization ────
{
  const sandbox = mkdtempProjectIsolated('tt-gate-3-');
  try {
    writeConfig(sandbox, { gateReviewToDone: false });
    writeState(sandbox, 203);
    const { binDir, callsLog } = makeGhShim(sandbox, {
      bodyOnView: BODY_NO_MARKER,
      stateOptionId: OPT_REVIEW,
    });
    const r = await run(sandbox, binDir, ['close', '#203']);
    assert.equal(r.code, 1, `expected authorization refusal; stderr:\n${r.stderr}`);
    assert.match(r.stderr, /review-authorization-missing/);
    assert.doesNotMatch(r.stdout, /PROMPT_REQUIRED/);
    // Authorization is resolved before any bypass audit/body mutation.
    const calls = existsSync(callsLog) ? readFileSync(callsLog, 'utf8') : '';
    assert.doesNotMatch(calls, /aitm-gate-bypassed/);
    console.log('test 3 passed: gate toggle cannot bypass immutable authorization');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

// ─── Test 4: exact-SHA human approval passes immutable authorization ─────────
{
  const sandbox = mkdtempProjectIsolated('tt-gate-4-');
  try {
    writeConfig(sandbox);
    writeState(sandbox, 204);
    const { binDir } = makeGhShim(sandbox, {
      bodyOnView: BODY_WITH_MARKER,
      stateOptionId: OPT_REVIEW,
    });
    const r = await run(sandbox, binDir, ['close', '#204']);
    assert.doesNotMatch(r.stderr, /review-authorization-missing/);
    assert.doesNotMatch(r.stdout, /PROMPT_REQUIRED/);
    console.log('test 4 passed: exact-SHA human approval passes authorization');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

// ─── Test 5 (#682): a hostile session-gate file in the invoking *cwd* must not
//     leak into the gate resolution. The session store resolves its dir via
//     getProjectDir() (paths.mjs), so with AI_TASK_MANAGER_PROJECT_DIR pointed
//     at a clean sandbox, a cwd-relative `.tmp/aitm/gates/*.json` that flips
//     reviewToDone=false cannot create immutable approval evidence. ──────────
{
  const sandbox = mkdtempProjectIsolated('tt-gate-5-');
  const hostileCwd = mkdtempProjectIsolated('tt-gate-5-cwd-');
  try {
    // Clean project sandbox: gateReviewToDone defaults TRUE, no session override.
    writeConfig(sandbox);
    writeState(sandbox, 205);
    const { binDir } = makeGhShim(sandbox, {
      bodyOnView: BODY_WITH_FULL_AUTO_MARKER,
      stateOptionId: OPT_REVIEW,
    });

    // Seed a HOSTILE session-gate file at the cwd-relative location the pre-fix
    // store read from. Pin the session id so the filename is deterministic.
    const hostileSid = 'hostile-cwd-sid-682';
    const hostileGatesDir = path.join(hostileCwd, '.tmp', 'aitm', 'gates');
    mkdirSync(hostileGatesDir, { recursive: true });
    writeFileSync(
      path.join(hostileGatesDir, `task-tracker.session.${hostileSid}.json`),
      JSON.stringify({
        sessionId: hostileSid,
        lastPromptedParent: null,
        gates: { analysisToDevelopment: false, reviewToDone: false },
        updatedAt: new Date(0).toISOString(),
      })
    );

    // Run close from the hostile cwd, but with the project dir isolated to the
    // clean sandbox and the pinned session id in env.
    const env = {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      AITM_GH_TEST_DOUBLE_BIN: binDir,
      AI_TASK_MANAGER_PROJECT_DIR: sandbox,
      AI_TASK_MANAGER_SESSION_ID: hostileSid,
      TT_SKIP_NETWORK: '',
    };
    let r;
    try {
      const out = await pexec('node', [CLI, 'close', '#205', '--allow-foreign-worktree'], {
        env,
        cwd: hostileCwd,
        timeout: 30000,
      });
      r = { code: 0, stdout: out.stdout, stderr: out.stderr };
    } catch (err) {
      r = { code: err.code ?? 1, stdout: err.stdout || '', stderr: err.stderr || '' };
    }

    assert.equal(r.code, 1, `expected exit 1; stderr:\n${r.stderr}\nstdout:\n${r.stdout}`);
    assert.match(r.stderr, /review-authorization-missing/);
    assert.doesNotMatch(r.stdout, /PROMPT_REQUIRED/);
    console.log('test 5 passed: hostile cwd session file cannot enable Full-Auto standing');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
    rmSync(hostileCwd, { recursive: true, force: true });
  }
}

console.log('gates.test.mjs: all passed');
