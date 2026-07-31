#!/usr/bin/env node
// @story #80
// E2E tests for #80 — review-approval prompt.
//
// Coverage:
//   1. verbReview emits `PROMPT_REQUIRED: review-approval #N` on the success path.
//   2. verbReview does NOT emit the marker on the verification-fail path.
//   3. /task reject without --reason → non-zero exit.
//   4. /task reject against an issue NOT in review → non-zero exit + no comment posted.
//   5. /task reject happy path → posts `### ❌ Review rejected` comment.

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
import { buildPlanApprovalAuditComment } from '../../../lib/plan-approval-audit.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const CLI = path.resolve(__dir, '..', 'helpers', 'task-tracker-cli.mjs');

const OPT_REVIEW = 'OPT_review';
const OPT_DEV = 'OPT_dev';
const HEAD_SHA = 'abcdef1234567890abcdef1234567890abcdef12';
const DOD_VERIFIED_MARKER = [
  `<!-- aitm-test-started sha="${HEAD_SHA}" ts="2026-05-16T23:59:00.000Z" -->`,
  `<!-- aitm-dod-verified: ${HEAD_SHA}:2026-05-17T00:00:00.000Z -->`,
].join('\n');
const TRACE_COMMENT = [
  '### 🔗 Commits',
  '',
  `<!-- aitm-commits: ${HEAD_SHA} -->`,
  '',
  '| SHA | Subject | Author | When |',
  '|---|---|---|---|',
  `| [\`${HEAD_SHA.slice(0, 7)}\`](https://github.com/test-owner/test-repo/commit/${HEAD_SHA}) | s | a | t |`,
].join('\n');

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
        kanbanOptionDevelop: OPT_DEV,
        kanbanOptionTest: 'OPT_validate',
        kanbanOptionReview: OPT_REVIEW,
        kanbanOptionDone: 'OPT_done',
        preferences: { gateAssigneeMatch: false },
      },
      null,
      2
    )
  );
  mkdirSync(path.join(sandbox, 'scripts'), { recursive: true });
}

// Build a gh shim that:
//   - returns `bodyOnView` for `issue view ... --json body`
//   - records `issue edit --body-file <path>` to recordedBodyPath
//   - returns `{ projectItems: [{ optionId: stateOptionId }] }` for the
//     getIssueBoardState graphql query
//   - returns empty subIssues/parent envelope for other graphql queries
//   - records every invocation as one JSON line in gh-calls.log
function makeGhShim(
  sandbox,
  { bodyOnView, stateOptionId, recordedBodyPath, traceComment = TRACE_COMMENT, gitStatus = '' }
) {
  const binDir = path.join(sandbox, 'bin');
  mkdirSync(binDir, { recursive: true });
  const callsLog = path.join(sandbox, 'gh-calls.log');
  // Persist mutable body state to disk so the shim's view/edit cycle simulates
  // real gh behavior: `issue view` returns whatever the last `issue edit`
  // wrote, not a frozen fixture. Without this, move-state.mjs's post-success
  // entry-marker stamp re-fetches the fixture and overwrites verb writes.
  const bodyStatePath = path.join(sandbox, 'gh-shim-body.txt');
  writeFileSync(bodyStatePath, bodyOnView);
  const planAuditTemplate = buildPlanApprovalAuditComment({
    issueNumber: 999999,
    ts: '2026-05-10T00:00:00.000Z',
  });
  const gitShim = path.join(binDir, 'git');
  writeFileSync(
    gitShim,
    `#!/usr/bin/env node
import fs from 'node:fs';
const argv = process.argv.slice(2);
if (argv.join(' ') === 'status --porcelain --untracked-files=no') {
  fs.writeSync(1, ${JSON.stringify(gitStatus)});
  process.exit(0);
}
if (argv.join(' ') === 'rev-parse HEAD') {
  fs.writeSync(1, ${JSON.stringify(`${HEAD_SHA}\n`)});
  process.exit(0);
}
// #733 — message-based attribution: 'git log --all --grep=[#N]' must find a
// commit whose subject carries the '[#N]' token (the normal post-#730 state
// once the deliverable is committed). Emit one synthetic attributed commit so
// review-preflight's attribution check passes; the refusal fixtures still fail
// on their own reason (missing trail / dirty worktree), independent of this.
const grepArg = argv.find((a) => a.startsWith('--grep='));
if (argv[0] === 'log' && grepArg) {
  const token = grepArg.slice(7);
  fs.writeSync(1, '0000000000000000000000000000000000000000\\t' + token + ' fixture deliverable\\t2026-05-10T00:00:00Z\\n');
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
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
const argv = process.argv.slice(2);
// Only read stdin for graphql (which uses --input -); otherwise it would hang
// waiting for the parent (execFile leaves stdin as an open empty pipe).
let stdinBody = '';
if (argv[0] === 'api' && argv[1] === 'graphql' && argv.includes('--input') && argv.includes('-')) {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  stdinBody = Buffer.concat(chunks).toString('utf8');
}
appendFileSync(${JSON.stringify(callsLog)}, JSON.stringify({argv, stdinBody}) + '\\n');

if (argv[0] === 'issue' && argv[1] === 'view' && argv.includes('--json')) {
  // #881 — \`--json\` takes ONE comma-joined token, so a combined request arrives
  // as the single arg 'body,comments'. Branching on argv.includes('comments')
  // missed it and fell through to the body-only reply, leaving the Agent Review
  // Gate with zero comments and six spurious required-comments objections.
  const jsonFields = String(argv[argv.indexOf('--json') + 1] || '').split(',');
  if (jsonFields.includes('comments')) {
    const traceComment = ${JSON.stringify(traceComment)};
    // V2 required-comments (#811): the inline Agent Review Gate now demotes
    // any issue reaching Review without all five required report comments. A
    // genuinely review-ready issue has them, so the shim supplies them here.
    // Refusal fixtures fail earlier (preflight/attribution), so this never
    // rescues them.
    const requiredComments = [
      // V3 timing-log-sequence (#812): the log must be a legal walk with a
      // parseable timestamp. A single leading start (a bare reengagement) is
      // the minimal legal walk and, being non-lifecycle, needs no
      // aitm-entered-stage marker to reconcile against.
      { id: 'IC_req_timing', body: '⏱ Timing Log\\n\\n| Timestamp | Event | Detail |\\n| --- | --- | --- |\\n| 2026-05-10 00:00:00 -05:00 | start | bind |' },
      { id: 'IC_req_estimate', body: '<!-- aitm-refined-estimate: 101 -->\\n\\n### Planned Estimate\\n\\n| Field | Value |' },
      {
        id: 'IC_req_audit',
        body: ${JSON.stringify(planAuditTemplate)}.replace(
          '— #999999',
          '— #' + String(argv[2] || '').replace(/^#/, '')
        )
      },
      // V4 new-tests-content (#813): the file bullet needs ≥1 nested test-name
      // bullet, else the gate demotes on an empty report.
      { id: 'IC_req_tests', body: '## New Automated Tests\\n\\n- \`foo.test.mjs\`\\n  - exercises a thing' },
    ];
    const comments = traceComment
      ? [{ id: 'IC_trace', body: traceComment, url: 'https://example.test/comment' }, ...requiredComments]
      : [...requiredComments];
    // Mirror the real \`gh\` contract: reply with every requested field, so a
    // 'body,comments' request carries the live body alongside the comments.
    const payload = { comments };
    if (jsonFields.includes('body')) payload.body = readFileSync(${JSON.stringify(bodyStatePath)}, 'utf8');
    fs.writeSync(1,JSON.stringify(payload));
    process.exit(0);
  }
  const currentBody = readFileSync(${JSON.stringify(bodyStatePath)}, 'utf8');
  if (argv.includes('--jq') || argv.includes('-q')) {
    fs.writeSync(1,currentBody);
  } else {
    fs.writeSync(1,JSON.stringify({ body: currentBody }));
  }
  process.exit(0);
}
if (argv[0] === 'issue' && argv[1] === 'edit') {
  const idx = argv.indexOf('--body-file');
  if (idx >= 0 && argv[idx+1]) {
    const src = argv[idx+1];
    let body;
    if (src === '-') {
      let buf = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (c) => { buf += c; });
      await new Promise((res) => process.stdin.on('end', res));
      body = buf;
    } else {
      body = readFileSync(src, 'utf8');
    }
    writeFileSync(${JSON.stringify(recordedBodyPath)}, body);
    writeFileSync(${JSON.stringify(bodyStatePath)}, body);
  }
  process.exit(0);
}
if (argv[0] === 'issue' && argv[1] === 'comment') {
  process.exit(0);
}
if (argv[0] === 'api' && argv[1] === 'graphql') {
  // Branch by query content (read from stdin).
  // fieldOptionMap query → 'node(id:' with fields
  if (stdinBody.includes('ProjectV2SingleSelectField')) {
    fs.writeSync(1,JSON.stringify({ data: { node: { fields: { nodes: [
      { id: 'PVTF_x', options: [
        { id: 'OPT_backlog', name: 'Backlog' },
        { id: 'OPT_groom', name: 'Groom' },
        { id: 'OPT_analyze', name: 'Analyze' },
        { id: ${JSON.stringify('OPT_DEV')}, name: 'Development' },
        { id: 'OPT_validate', name: 'Validate' },
        { id: ${JSON.stringify('OPT_REVIEW')}, name: 'Review' },
        { id: 'OPT_done', name: 'Done' },
      ] }
    ] } } } }));
    process.exit(0);
  }
  // projectItemForIssue query → nodes { id project { id } }
  // getIssueBoardState query → fieldValueByName { optionId }
  // fetchProjectMeta query (log-issue-time.mjs) → data.node.fields.nodes
  // generic repository.issue query
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
      },
      // fetchProjectMeta reads data.node.fields.nodes for the timing board fields;
      // supplying them here lets runLogIssueTime complete its board-field sync.
      node: { fields: { nodes: [
        { id: 'F_session', name: 'Session Time' },
        { id: 'F_engaged', name: 'Engaged Time' },
        { id: 'F_review', name: 'Review Time' },
        { id: 'F_plan', name: 'Plan Time' },
        { id: 'F_start', name: 'Start time' },
      ] } }
    }
  };
  fs.writeSync(1,JSON.stringify(env));
  process.exit(0);
}
if (argv[0] === 'project' && argv[1] === 'item-edit') {
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

// ─── Test 1: verbReview success path emits the marker ────────────────────────
{
  const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-rap-1-'));
  try {
    writeConfig(sandbox);
    writeFileSync(
      path.join(sandbox, '.ai-task-manager', 'task-tracker-state.json'),
      JSON.stringify({
        active: '#101',
        lastActive: '#101',
        entryStartTs: null,
        wordsAtEntryStart: 0,
      })
    );
    // Well-formed per the V1 agent-review gate (#810): all nine canonical `##`
    // sections in order, each non-empty. The AC/DoD sections carry no evaluable
    // checkboxes, so the evidence + completeness preflight checks stay vacuous
    // and the success path is preserved.
    const fixtureBody = [
      '## User Story',
      'As a maintainer, I want the review gate to accept a well-formed body.',
      '',
      '## Scope',
      'Exercise the review-approval success path.',
      '',
      '## Plan Metadata',
      '- **Size:** S',
      '',
      '## Pickup Directive',
      '- [x] Deep dive complete',
      '',
      '## Deep-Dive Analysis (2026-05-10)',
      '',
      ...Array.from({ length: 25 }, (_, i) => `line ${i + 1}`),
      '',
      '## Acceptance Criteria',
      '',
      '<!-- no acceptance criteria under test -->',
      '',
      '## Verification Commands',
      '',
      '- [ ] `node --version`',
      '',
      '## Definition of Done',
      '',
      '<!-- no definition-of-done items under test -->',
      '',
      '## AITM Progress Markers',
      '',
      DOD_VERIFIED_MARKER,
      '',
      '<!-- ai-task-manager:fields:start -->',
      '<!-- ai-task-manager:fields:end -->',
    ].join('\n');
    const recordedBodyPath = path.join(sandbox, 'recorded-body.md');
    const { binDir } = makeGhShim(sandbox, {
      bodyOnView: fixtureBody,
      stateOptionId: OPT_REVIEW,
      recordedBodyPath,
    });
    const r = await run(sandbox, binDir, ['review', '#101']);
    assert.equal(r.code, 0, `expected exit 0; stderr:\n${r.stderr}`);
    assert.match(
      r.stdout,
      /PROMPT_REQUIRED: review-approval #101/,
      `expected marker in stdout; stdout:\n${r.stdout}\nstderr:\n${r.stderr}`
    );
    console.log('test 1 passed: verbReview emits marker on success');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

// ─── Test 1b: verbReview refuses when canonical commit trace is missing ──────
{
  const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-rap-1b-'));
  try {
    writeConfig(sandbox);
    writeFileSync(
      path.join(sandbox, '.ai-task-manager', 'task-tracker-state.json'),
      JSON.stringify({
        active: '#111',
        lastActive: '#111',
        entryStartTs: null,
        wordsAtEntryStart: 0,
      })
    );
    const fixtureBody = [
      '## Pickup Directive',
      '- [x] Deep dive complete',
      '',
      '## Deep-Dive Analysis (2026-05-10)',
      '',
      ...Array.from({ length: 25 }, (_, i) => `line ${i + 1}`),
      '',
      '### Verification Commands',
      '',
      '- [ ] `node --version`',
      '',
      DOD_VERIFIED_MARKER,
      '',
      '<!-- ai-task-manager:fields:start -->',
      '<!-- ai-task-manager:fields:end -->',
    ].join('\n');
    const recordedBodyPath = path.join(sandbox, 'recorded-body.md');
    const { binDir } = makeGhShim(sandbox, {
      bodyOnView: fixtureBody,
      stateOptionId: OPT_REVIEW,
      recordedBodyPath,
      traceComment: null,
    });
    const r = await run(sandbox, binDir, ['review', '#111']);
    assert.notEqual(r.code, 0, 'review should fail without canonical commit trace');
    assert.match(r.stderr, /missing canonical `### 🔗 Commits` comment/);
    assert.doesNotMatch(r.stdout, /PROMPT_REQUIRED: review-approval/);
    console.log('test 1b passed: verbReview refuses missing canonical commit trace');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

// ─── Test 1c: verbReview refuses tracked uncommitted changes ─────────────────
{
  const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-rap-1c-'));
  try {
    writeConfig(sandbox);
    writeFileSync(
      path.join(sandbox, '.ai-task-manager', 'task-tracker-state.json'),
      JSON.stringify({
        active: '#112',
        lastActive: '#112',
        entryStartTs: null,
        wordsAtEntryStart: 0,
      })
    );
    const fixtureBody = [
      '## Pickup Directive',
      '- [x] Deep dive complete',
      '',
      '## Deep-Dive Analysis (2026-05-10)',
      '',
      ...Array.from({ length: 25 }, (_, i) => `line ${i + 1}`),
      '',
      '### Verification Commands',
      '',
      '- [ ] `node --version`',
      '',
      DOD_VERIFIED_MARKER,
      '',
      '<!-- ai-task-manager:fields:start -->',
      '<!-- ai-task-manager:fields:end -->',
    ].join('\n');
    const recordedBodyPath = path.join(sandbox, 'recorded-body.md');
    const { binDir } = makeGhShim(sandbox, {
      bodyOnView: fixtureBody,
      stateOptionId: OPT_REVIEW,
      recordedBodyPath,
      gitStatus: ' M scripts/x.mjs\n',
    });
    const r = await run(sandbox, binDir, ['review', '#112']);
    assert.notEqual(r.code, 0, 'review should fail with tracked worktree changes');
    assert.match(r.stderr, /tracked worktree changes are uncommitted/);
    assert.doesNotMatch(r.stdout, /PROMPT_REQUIRED: review-approval/);
    console.log('test 1c passed: verbReview refuses tracked worktree changes');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

// ─── Test 2: verbReview verification-fail path does NOT emit the marker ──────
{
  const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-rap-2-'));
  try {
    writeConfig(sandbox);
    writeFileSync(
      path.join(sandbox, '.ai-task-manager', 'task-tracker-state.json'),
      JSON.stringify({
        active: '#102',
        lastActive: '#102',
        entryStartTs: null,
        wordsAtEntryStart: 0,
      })
    );
    const fixtureBody = [
      '## Pickup Directive',
      '- [x] Deep dive complete',
      '',
      '## Deep-Dive Analysis (2026-05-10)',
      '',
      ...Array.from({ length: 25 }, (_, i) => `line ${i + 1}`),
      '',
      '### Verification Commands',
      '',
      '- [ ] `node --version`',
      '',
      '<!-- ai-task-manager:fields:start -->',
      '<!-- ai-task-manager:fields:end -->',
    ].join('\n');
    const recordedBodyPath = path.join(sandbox, 'recorded-body.md');
    const { binDir } = makeGhShim(sandbox, {
      bodyOnView: fixtureBody,
      stateOptionId: OPT_REVIEW,
      recordedBodyPath,
    });
    const r = await run(sandbox, binDir, ['review', '#102']);
    assert.notEqual(r.code, 0, 'verbReview must refuse when aitm-dod-verified marker is missing');
    assert.match(
      r.stderr,
      /missing `aitm-dod-verified` marker/,
      `expected missing-marker refusal; stderr:\n${r.stderr}`
    );
    assert.doesNotMatch(
      r.stdout,
      /PROMPT_REQUIRED: review-approval/,
      `marker must NOT be emitted when refused; stdout:\n${r.stdout}`
    );
    console.log('test 2 passed: verbReview refuses without aitm-dod-verified marker');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

// ─── Test 3: verbReview refuses to auto-mark AC/DoD without evidence ─────────
{
  const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-rap-3-'));
  try {
    writeConfig(sandbox);
    writeFileSync(
      path.join(sandbox, '.ai-task-manager', 'task-tracker-state.json'),
      JSON.stringify({
        active: '#103',
        lastActive: '#103',
        entryStartTs: null,
        wordsAtEntryStart: 0,
      })
    );
    const fixtureBody = [
      '## Acceptance Criteria',
      '',
      '- [x] Fresh install registers direct Node hook commands.',
      '- [ ] Existing installs migrate legacy shell hook commands.',
      '',
      '## Pickup Directive',
      '- [x] Deep dive complete',
      '',
      '## Deep-Dive Analysis (2026-05-10)',
      '',
      ...Array.from({ length: 25 }, (_, i) => `line ${i + 1}`),
      '',
      '### Verification Commands',
      '',
      '- [ ] `node --version`',
      '',
      '## Definition of Done',
      '',
      '- [ ] Acceptance criteria met (including test additions from deep dive)',
      '- [ ] Tests pass; new coverage committed',
      '- [ ] Pre-commit hooks pass',
      '- [ ] Issue body checkboxes ticked',
      '',
      '<!-- aitm-plan-approved: 2026-05-10T00:00:00.000Z -->',
      '',
      DOD_VERIFIED_MARKER,
      '',
      '<!-- ai-task-manager:fields:start -->',
      '<!-- ai-task-manager:fields:end -->',
    ].join('\n');
    const recordedBodyPath = path.join(sandbox, 'recorded-body.md');
    const { binDir } = makeGhShim(sandbox, {
      bodyOnView: fixtureBody,
      stateOptionId: OPT_REVIEW,
      recordedBodyPath,
    });
    const r = await run(sandbox, binDir, ['review', '#103']);
    assert.notEqual(r.code, 0, 'review must fail when AC/DoD lacks automated evidence');
    assert.doesNotMatch(r.stdout, /PROMPT_REQUIRED: review-approval/, `stdout:\n${r.stdout}`);
    assert.match(
      r.stderr,
      /missing `aitm-verified cmd="..."` evidence declaration/,
      `expected missing evidence failure; stderr:\n${r.stderr}`
    );
    assert.equal(
      existsSync(recordedBodyPath),
      false,
      'preflight should refuse before review mutates the issue body'
    );
    console.log('test 3 passed: verbReview refuses AC/DoD without evidence');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

// ─── Test 4: verbReview marks AC/DoD with passing evidence ───────────────────
{
  const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-rap-4-'));
  try {
    writeConfig(sandbox);
    writeFileSync(
      path.join(sandbox, '.ai-task-manager', 'task-tracker-state.json'),
      JSON.stringify({
        active: '#104',
        lastActive: '#104',
        entryStartTs: null,
        wordsAtEntryStart: 0,
      })
    );
    writeFileSync(
      path.join(sandbox, 'package.json'),
      JSON.stringify({
        scripts: {
          test: 'node --version',
          lint: 'node --version',
          'format:check': 'node --version',
        },
      })
    );
    // Well-formed per the V1 agent-review gate (#810): the nine canonical `##`
    // sections in order. The AC evidence markers, VC list, and DoD boxes are the
    // evaluable content the evidence-based auto-tick ticks on the success path.
    const fixtureBody = [
      '## User Story',
      'As a maintainer, I want AC/DoD auto-ticked from passing evidence.',
      '',
      '## Scope',
      'Exercise the evidence-based auto-tick path.',
      '',
      '## Plan Metadata',
      '- **Size:** S',
      '',
      '## Pickup Directive',
      '- [x] Deep dive complete',
      '',
      '## Deep-Dive Analysis (2026-05-10)',
      '',
      ...Array.from({ length: 25 }, (_, i) => `line ${i + 1}`),
      '',
      '## Acceptance Criteria',
      '',
      '- [ ] Fresh install registers direct Node hook commands. <!-- aitm-verified vc-list="vc:1" -->',
      '- [ ] Existing installs migrate legacy shell hook commands. <!-- aitm-verified vc-list="vc:2" -->',
      '',
      '## Verification Commands',
      '',
      // #934: AC verifiers must be targeted — a full-lane command is rejected by
      // the AC-floor. vc:1 backs the "Fresh install" AC with a targeted command.
      '- [ ] `node --test tests/fresh-install.test.mjs` <!-- id=1 -->',
      '- [ ] `npm run lint` <!-- id=2 -->',
      '',
      '## Definition of Done',
      '',
      '- [ ] `npm test`',
      '- [ ] `npm run lint`',
      '- [ ] `npm run format:check`',
      '- [ ] Acceptance criteria met',
      '- [ ] Issue body checkboxes ticked',
      '',
      '## AITM Progress Markers',
      '',
      '<!-- aitm-plan-approved: 2026-05-10T00:00:00.000Z -->',
      '',
      DOD_VERIFIED_MARKER,
      '',
      '<!-- ai-task-manager:fields:start -->',
      '<!-- ai-task-manager:fields:end -->',
    ].join('\n');
    const recordedBodyPath = path.join(sandbox, 'recorded-body.md');
    const { binDir } = makeGhShim(sandbox, {
      bodyOnView: fixtureBody,
      stateOptionId: OPT_REVIEW,
      recordedBodyPath,
    });
    const r = await run(sandbox, binDir, ['review', '#104']);
    assert.equal(r.code, 0, `expected exit 0; stderr:\n${r.stderr}`);
    assert.match(
      r.stdout,
      /PROMPT_REQUIRED: review-approval #104/,
      `expected marker in stdout; stdout:\n${r.stdout}\nstderr:\n${r.stderr}`
    );
    const written = readFileSync(recordedBodyPath, 'utf8');
    for (const label of [
      'Fresh install registers direct Node hook commands.',
      'Existing installs migrate legacy shell hook commands.',
      '`npm test`',
      '`npm run lint`',
      '`npm run format:check`',
      'Acceptance criteria met',
      'Issue body checkboxes ticked',
    ]) {
      assert.match(
        written,
        new RegExp(`- \\[x\\] ${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
      );
    }
    console.log('test 4 passed: verbReview marks AC/DoD with passing evidence');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

// ─── Test 5: /task reject without --reason → exit non-zero ───────────────────
{
  const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-rap-5-'));
  try {
    writeConfig(sandbox);
    // No shim needed — verbReject exits on missing reason before any network call
    // when SKIP_NETWORK is on; we set it explicitly to keep this test hermetic.
    const env = { ...process.env, AI_TASK_MANAGER_PROJECT_DIR: sandbox, TT_SKIP_NETWORK: '1' };
    let code = 0,
      stderr = '';
    try {
      await pexec('node', [CLI, 'reject', '#105'], { env, timeout: 10000 });
    } catch (err) {
      code = err.code ?? 1;
      stderr = err.stderr || '';
    }
    assert.notEqual(code, 0, 'expected non-zero exit when --reason is missing');
    assert.match(
      stderr,
      /reason is required/,
      `expected "reason is required" in stderr; got:\n${stderr}`
    );
    console.log('test 5 passed: /task reject without --reason exits non-zero');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

// ─── Test 6: /task reject when state != review → exit non-zero, no comment ───
{
  const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-rap-6-'));
  try {
    writeConfig(sandbox);
    const recordedBodyPath = path.join(sandbox, 'recorded-body.md');
    const { binDir, callsLog } = makeGhShim(sandbox, {
      bodyOnView: '',
      stateOptionId: OPT_DEV,
      recordedBodyPath,
    });
    const r = await run(sandbox, binDir, ['reject', '#104', '--reason', 'not ready']);
    assert.notEqual(r.code, 0, 'expected non-zero exit when issue is not in review');
    assert.match(
      r.stderr,
      /expected 'review'/,
      `expected wrong-state message; stderr:\n${r.stderr}`
    );
    // No issue comment call should be in the log
    const calls = existsSync(callsLog) ? readFileSync(callsLog, 'utf8') : '';
    const hadComment = calls
      .split('\n')
      .filter(Boolean)
      .some((line) => {
        try {
          const { argv } = JSON.parse(line);
          return argv[0] === 'issue' && argv[1] === 'comment';
        } catch {
          return false;
        }
      });
    assert.equal(
      hadComment,
      false,
      `gh issue comment must not be called on wrong state; calls:\n${calls}`
    );
    console.log('test 6 passed: /task reject refuses wrong state');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

// ─── Test 7: /task reject happy path → posts rejection comment ───────────────
{
  const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-rap-7-'));
  try {
    writeConfig(sandbox);
    const recordedBodyPath = path.join(sandbox, 'recorded-body.md');
    const { binDir, callsLog } = makeGhShim(sandbox, {
      bodyOnView: '',
      stateOptionId: OPT_REVIEW,
      recordedBodyPath,
    });
    const r = await run(sandbox, binDir, [
      'reject',
      '#105',
      '--reason',
      'scope creep — split before merge',
    ]);
    assert.equal(r.code, 0, `expected exit 0; stderr:\n${r.stderr}`);
    assert.match(r.stdout, /rejected — moved back to Develop/, `stdout:\n${r.stdout}`);
    // Verify a `gh issue comment` was made with the rejection marker
    const calls = readFileSync(callsLog, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    const commentCall = calls.find((c) => c.argv[0] === 'issue' && c.argv[1] === 'comment');
    assert.ok(
      commentCall,
      `expected a gh issue comment call; calls:\n${JSON.stringify(calls, null, 2)}`
    );
    const bodyIdx = commentCall.argv.indexOf('--body');
    const commentBody = bodyIdx >= 0 ? commentCall.argv[bodyIdx + 1] : '';
    assert.match(
      commentBody,
      /### ❌ Review rejected/,
      `comment body missing header; body:\n${commentBody}`
    );
    assert.match(
      commentBody,
      /scope creep — split before merge/,
      `comment body missing reason; body:\n${commentBody}`
    );
    console.log('test 7 passed: /task reject happy path posts rejection comment');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

// ─── Test 8: #257 — completeness gate refuses an unticked manual checkbox ────
// Everything review can auto-tick IS ticked (the `node --version` VC), but a
// manual non-lifecycle item remains unticked. The post-auto-tick completeness
// gate (uncheckedPreCloseCheckboxes parity with the close gate) must refuse the
// move into Review and emit NO review-approval prompt.
{
  const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-rap-8-'));
  try {
    writeConfig(sandbox);
    writeFileSync(
      path.join(sandbox, '.ai-task-manager', 'task-tracker-state.json'),
      JSON.stringify({
        active: '#108',
        lastActive: '#108',
        entryStartTs: null,
        wordsAtEntryStart: 0,
      })
    );
    const fixtureBody = [
      '## Pickup Directive',
      '- [x] Deep dive complete',
      '- [ ] Manual reviewer signoff obtained',
      '',
      '## Deep-Dive Analysis (2026-05-10)',
      '',
      ...Array.from({ length: 25 }, (_, i) => `line ${i + 1}`),
      '',
      '### Verification Commands',
      '',
      '- [ ] `node --version`',
      '',
      DOD_VERIFIED_MARKER,
      '',
      '<!-- ai-task-manager:fields:start -->',
      '<!-- ai-task-manager:fields:end -->',
    ].join('\n');
    const recordedBodyPath = path.join(sandbox, 'recorded-body.md');
    const { binDir } = makeGhShim(sandbox, {
      bodyOnView: fixtureBody,
      stateOptionId: OPT_REVIEW,
      recordedBodyPath,
    });
    const r = await run(sandbox, binDir, ['review', '#108']);
    assert.notEqual(r.code, 0, 'review must refuse when a manual checkbox is unticked');
    assert.match(
      r.stderr,
      /Refusing to move #108 to Review/,
      `expected completeness refusal; stderr:\n${r.stderr}`
    );
    assert.match(
      r.stderr,
      /Manual reviewer signoff obtained/,
      `expected the unticked item named; stderr:\n${r.stderr}`
    );
    assert.doesNotMatch(
      r.stdout,
      /PROMPT_REQUIRED: review-approval/,
      `marker must NOT be emitted when refused; stdout:\n${r.stdout}`
    );
    console.log('test 8 passed: completeness gate refuses an unticked manual checkbox');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

console.log('review-approval-prompt.test.mjs: all passed');
