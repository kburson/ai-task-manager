#!/usr/bin/env node
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
const CLI = path.resolve(__dir, '..', 'task-tracker.mjs');

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
import { writeFileSync, appendFileSync } from 'node:fs';
const argv = process.argv.slice(2);
let stdinBody = '';
if (argv[0] === 'api' && argv[1] === 'graphql' && argv.includes('--input') && argv.includes('-')) {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  stdinBody = Buffer.concat(chunks).toString('utf8');
}
appendFileSync(${JSON.stringify(callsLog)}, JSON.stringify({argv, stdinBody}) + '\\n');

if (argv[0] === 'issue' && argv[1] === 'view') {
  process.stdout.write(JSON.stringify({ body: ${JSON.stringify(bodyOnView)} }));
  process.exit(0);
}
if (argv[0] === 'issue' && argv[1] === 'edit') { process.exit(0); }
if (argv[0] === 'issue' && argv[1] === 'comment') { process.exit(0); }
if (argv[0] === 'api' && argv[1] === 'graphql') {
  if (stdinBody.includes('ProjectV2SingleSelectField')) {
    process.stdout.write(JSON.stringify({ data: { node: { fields: { nodes: [] } } } }));
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
  process.stdout.write(JSON.stringify(env));
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
].join('\n');

const BODY_WITH_MARKER = BODY_NO_MARKER + '\n<!-- aitm-review-approved: 2026-05-10T00:00:00Z -->\n';

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
  const sandbox = mkdtempSync(path.join(tmpdir(), 'tt-gate-1-'));
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
  const sandbox = mkdtempSync(path.join(tmpdir(), 'tt-gate-2-'));
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
  const sandbox = mkdtempSync(path.join(tmpdir(), 'tt-gate-3-'));
  try {
    writeConfig(sandbox, { gateReviewToDone: false });
    writeState(sandbox, 203);
    const { binDir, callsLog } = makeGhShim(sandbox, {
      bodyOnView: BODY_NO_MARKER,
      stateOptionId: OPT_REVIEW,
    });
    const r = await run(sandbox, binDir, ['close', '#203']);
    // Close may fail later for other reasons, but it must NOT exit 7 or 8.
    assert.notEqual(r.code, 7, `should bypass review-approval gate; stderr:\n${r.stderr}`);
    assert.notEqual(r.code, 8, `should bypass review-approval gate; stderr:\n${r.stderr}`);
    assert.doesNotMatch(r.stdout, /PROMPT_REQUIRED: review-approval/);
    // Bypass should attempt to post a gate-bypass audit row. The find-or-create
    // timing-log path may fail under the shim and fall through to the offline
    // queue; either result is acceptable proof that the bypass branch ran.
    const queuePath = path.join(sandbox, '.ai-task-manager', 'task-tracker-queue.json');
    const calls = existsSync(callsLog) ? readFileSync(callsLog, 'utf8') : '';
    const queueText = existsSync(queuePath) ? readFileSync(queuePath, 'utf8') : '';
    const bypassEvidence =
      /gateReviewToDone=false/.test(calls) || /gateReviewToDone=false/.test(queueText);
    assert.ok(
      bypassEvidence,
      `expected gate-bypassed audit row to be posted or queued; calls:\n${calls}\nqueue:\n${queueText}`
    );
    console.log('test 3 passed: gateReviewToDone=false bypasses gate + posts audit row');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

// ─── Test 4: close with marker present → passes review-approval gate ─────────
{
  const sandbox = mkdtempSync(path.join(tmpdir(), 'tt-gate-4-'));
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

console.log('gates.test.mjs: all passed');
