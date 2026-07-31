#!/usr/bin/env node
// @story #58
// Tests for the human-gate config flags introduced in #58.
//
//   gateAnalysisToDevelopment (boolean, default true)
//     - false: runApprove auto-approves without prompt, returns 'gate-bypassed'.
//
//   gateReviewToDone (boolean, default true)
//     - true + no review-approval marker:   verbClose exits 7, prints PROMPT_REQUIRED.
//     - true + --answer yes + no marker:    verbClose exits 8, refuses --answer bypass.
//     - false:                              verbClose posts a gate-bypassed audit row.

import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync, existsSync } from 'node:fs';
import { projectScratchDir, mkdtempProjectIsolated } from '../../../lib/scratch-dir.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const CLI = path.resolve(__dir, '..', 'helpers', 'task-tracker-cli.mjs');

const OPT_REVIEW = 'OPT_review';
const OPT_DEV = 'OPT_dev';

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
  return { binDir, callsLog };
}

async function run(sandbox, binDir, args) {
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

const BODY_NO_MARKER = [
  '## Acceptance Criteria',
  '- [x] all done',
  '',
  '## Pickup Directive',
  '- [x] Deep dive complete',
  '',
  '<!-- aitm-entered-review ts="2026-05-10T00:00:00Z" -->',
  '',
].join('\n');

const REVIEW_SHA = 'abcdef1234567890abcdef1234567890abcdef12';
const REVIEW_EPOCH = 'review:1:2026-05-10T00:00:00Z';
const BODY_WITH_MARKER = [
  BODY_NO_MARKER,
  `<!-- aitm-dod-verified sha="${REVIEW_SHA}" ts="2026-05-10T00:01:00Z" -->`,
  `<!-- aitm-agent-review-proof schema="1" epoch="${REVIEW_EPOCH}" sha="${REVIEW_SHA}" ts="2026-05-10T00:02:00Z" validators="unit" result="pass" -->`,
  `<!-- aitm-review-approved schema="1" epoch="${REVIEW_EPOCH}" proof-sha="${REVIEW_SHA}" ts="2026-05-10T00:03:00Z" provenance="human" -->`,
  '',
].join('\n');

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

// ─── Test 1: close with no marker, gateReviewToDone=true → exit 7 ────────────
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
    assert.equal(r.code, 7, `expected exit 7; stderr:\n${r.stderr}\nstdout:\n${r.stdout}`);
    assert.match(r.stdout, /PROMPT_REQUIRED: review-approval #201/);
    assert.match(r.stderr, /no human review approval recorded/);
    console.log('test 1 passed: close without marker → exit 7 + PROMPT_REQUIRED');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

// ─── Test 2: close with --answer yes and no marker → exit 8 ──────────────────
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
    assert.equal(r.code, 8, `expected exit 8; stderr:\n${r.stderr}\nstdout:\n${r.stdout}`);
    assert.match(r.stderr, /--answer yes.*cannot satisfy a human-gate prompt/);
    console.log('test 2 passed: --answer yes is rejected at review-approval gate');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

// ─── Test 3: close with gateReviewToDone=false → bypass audit, no exit 7/8 ───
{
  const sandbox = mkdtempProjectIsolated('tt-gate-3-');
  try {
    writeConfig(sandbox, { gateReviewToDone: false });
    writeState(sandbox, 203);
    const { binDir, callsLog } = makeGhShim(sandbox, {
      bodyOnView: BODY_NO_MARKER,
      stateOptionId: OPT_REVIEW,
    });
    const r = await run(sandbox, binDir, ['close', '#203', '--force']);
    // Close may fail later for other reasons, but it must NOT exit 7 or 8.
    assert.notEqual(r.code, 7, `should bypass review-approval gate; stderr:\n${r.stderr}`);
    assert.notEqual(r.code, 8, `should bypass review-approval gate; stderr:\n${r.stderr}`);
    assert.doesNotMatch(r.stdout, /PROMPT_REQUIRED: review-approval/);
    // #516 — the bypass is now recorded as a body audit marker
    // (`aitm-gate-bypassed`) written via `gh issue edit --body-file -`, not a
    // ⏱ Timing Log row. Proof the bypass branch ran: an issue-edit call whose
    // body payload carries the marker (and its `gateReviewToDone=false` detail).
    const calls = existsSync(callsLog) ? readFileSync(callsLog, 'utf8') : '';
    const bypassEvidence = /aitm-gate-bypassed/.test(calls) && /gateReviewToDone=false/.test(calls);
    assert.ok(
      bypassEvidence,
      `expected aitm-gate-bypassed audit marker in an issue-edit body payload; ` +
        `code=${r.code}; stdout:\n${r.stdout}\nstderr:\n${r.stderr}\ncalls:\n${calls}`
    );
    console.log('test 3 passed: gateReviewToDone=false bypasses gate + writes audit marker');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

// ─── Test 4: close with marker present → passes review-approval gate ─────────
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
    // The gate itself should not fire — exit 7/8 are reserved for the gate.
    assert.notEqual(r.code, 7, `marker present must pass gate; stderr:\n${r.stderr}`);
    assert.notEqual(r.code, 8, `marker present must pass gate; stderr:\n${r.stderr}`);
    assert.doesNotMatch(r.stdout, /PROMPT_REQUIRED: review-approval/);
    console.log('test 4 passed: marker present passes review-approval gate');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

// ─── Test 5 (#682): a hostile session-gate file in the invoking *cwd* must not
//     leak into the gate resolution. The session store resolves its dir via
//     getProjectDir() (paths.mjs), so with AI_TASK_MANAGER_PROJECT_DIR pointed
//     at a clean sandbox, a cwd-relative `.tmp/aitm/gates/*.json` that flips
//     reviewToDone=false is ignored and Test-1's close-without-marker still
//     yields exit 7. Pre-fix (cwd-relative DEFAULT_DIR) this leaked → the gate
//     bypassed and the close no longer exited 7. ────────────────────────────
{
  const sandbox = mkdtempProjectIsolated('tt-gate-5-');
  const hostileCwd = mkdtempProjectIsolated('tt-gate-5-cwd-');
  try {
    // Clean project sandbox: gateReviewToDone defaults TRUE, no session override.
    writeConfig(sandbox);
    writeState(sandbox, 205);
    const { binDir } = makeGhShim(sandbox, {
      bodyOnView: BODY_NO_MARKER,
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
      AI_TASK_MANAGER_PROJECT_DIR: sandbox,
      AI_TASK_MANAGER_SESSION_ID: hostileSid,
      TT_SKIP_NETWORK: '',
    };
    let r;
    try {
      const out = await pexec('node', [CLI, 'close', '#205'], {
        env,
        cwd: hostileCwd,
        timeout: 30000,
      });
      r = { code: 0, stdout: out.stdout, stderr: out.stderr };
    } catch (err) {
      r = { code: err.code ?? 1, stdout: err.stdout || '', stderr: err.stderr || '' };
    }

    assert.equal(
      r.code,
      7,
      `hostile cwd session file must not leak; expected exit 7, got ${r.code}; stderr:\n${r.stderr}\nstdout:\n${r.stdout}`
    );
    assert.match(r.stdout, /PROMPT_REQUIRED: review-approval #205/);
    console.log('test 5 passed: hostile cwd session-gate file is isolated (exit 7 preserved)');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
    rmSync(hostileCwd, { recursive: true, force: true });
  }
}

console.log('gates.test.mjs: all passed');
