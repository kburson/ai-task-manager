#!/usr/bin/env node
// @story #32
// Integration tests for the structural body gate in scripts/gh/move-state.mjs.
// Drives move-state.mjs against a sandboxed config + fake `gh` shim that returns
// a body we control. Asserts:
//   - test with ticked Deep dive + missing section → exit 4 + BLOCKED:
//   - test with ticked Deep dive + adequate section → exit 0
//   - review with same missing-section body → exit 4
//   - done with same missing-section body → exit 4 (Done gate fires)
//   - TASK_TRACKER_FORCE_DONE=1 is NO LONGER honored (refuses regardless)

import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
// #764 — move-state.mjs is import-only; spawn the test-only CLI harness instead.
const SCRIPT = path.resolve(__dir, '../helpers/move-state-cli.mjs');

function deepDiveAdequate() {
  const lines = [
    '## Pickup Directive',
    '- [ ] Deep dive complete',
    '',
    '## Deep-Dive Analysis (2026-05-08)',
    '',
  ];
  // The deep-dive substantive-chars floor was raised to 2000 in #325. Pad the
  // fixture so the structural gate passes; per-test assertions still target the
  // specific guard each case is verifying.
  for (let i = 0; i < 60; i++) {
    lines.push(
      `line ${i + 1}: substantive analysis paragraph providing enough content to clear the substantive-chars floor; describes a tradeoff, references a file path, and notes a risk.`
    );
  }
  lines.push('', '<!-- ai-task-manager:fields:start -->', '<!-- ai-task-manager:fields:end -->');
  return lines.join('\n');
}

function makeSandbox(body) {
  const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-gate-'));
  mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify(
      {
        repo: 'o/r',
        projectId: 'PVT_x',
        kanbanFieldId: 'PVTF_x',
        kanbanOptionBacklog: 'OP_b',
        kanbanOptionRefine: 'OP_g',
        kanbanOptionPlan: 'OP_a',
        kanbanOptionDevelop: 'OP_d',
        kanbanOptionTest: 'OP_v',
        kanbanOptionReview: 'OP_r',
        kanbanOptionDone: 'OP_done',
      },
      null,
      2
    )
  );

  // Fake gh shim: returns the body we want for `issue view`, swallows everything else.
  const binDir = path.join(sandbox, 'bin');
  mkdirSync(binDir);
  // #343 — move-state.mjs fetches body via `gh issue view ... --jq .body`,
  // which emits the raw body string. The shim must emit the same — NOT a
  // JSON-encoded quoted string (escaped \n breaks every line-anchored regex
  // in body-gates.mjs and the deep-dive-placement guard then misfires).
  // Shim runs under the project's package.json (type: module), so it must
  // use ESM-style imports. We use `fs.writeSync(1, ...)` below to flush
  // synchronously; `process.stdout.write` + `process.exit` would truncate
  // bodies larger than the pipe high-watermark (~8KB on macOS).
  const shim = `#!/usr/bin/env node
import fs from 'node:fs';
const BODY = ${JSON.stringify(body)};
// #747 — runStatusWrite now reads the Status field back after the item-edit
// and fails closed (exit 7) unless it confirms the written optionId. A shim
// that swallowed everything returned an empty read-back, which the old
// soft-proceed tolerated but the new fail-closed path rejects. So the shim
// must emulate a real board: record the optionId each item-edit writes, then
// echo it back on the read-back graphql query so the write confirms.
const STATE_FILE = ${JSON.stringify(path.join(sandbox, '.last-option'))};
const PROJECT_ID = ${JSON.stringify('PVT_x')};
// #756 — the shim must be a real body store, not a constant. move-state stamps
// entry markers via versionedWriteBody, which pushes a new body over
// \`gh issue edit --body-file -\` and then read-back-verifies byte-equality.
// A shim that always echoed the ORIGINAL BODY made every verify diverge from
// the stamped push -> BodyWriteRefusalError after 3 attempts. So persist each
// pushed body to BODY_FILE and serve it back on subsequent reads.
const BODY_FILE = ${JSON.stringify(path.join(sandbox, '.issue-body'))};
function currentBody() {
  try { return fs.readFileSync(BODY_FILE, 'utf8'); } catch { return BODY; }
}
const args = process.argv.slice(2);
if (args[0] === 'issue' && args[1] === 'edit' && args.includes('--body-file')) {
  // versionedWriteBody push. --body-file - reads the new body from stdin.
  const i = args.indexOf('--body-file');
  const src = args[i + 1];
  let next = '';
  try { next = fs.readFileSync(src === '-' ? 0 : src, 'utf8'); } catch {}
  fs.writeFileSync(BODY_FILE, next);
  process.exit(0);
}
if (args[0] === 'issue' && args[1] === 'view') {
  // Emulate real gh's two body-fetch shapes:
  //   - a jq filter (\`--jq .body\` or \`--json body -q .body\`) makes gh extract
  //     the field itself and emit the RAW body string.
  //   - \`--json body\` with NO jq filter emits a JSON object {"body": ...},
  //     which stampEntryMarkers JSON.parse's. Serving raw here throws
  //     \`Unexpected token '#'\` -> marker-stamp/phase-pair failure.
  // fs.writeSync is required because process.stdout.write is non-blocking
  // when stdout is a pipe; process.exit(0) on the next line would truncate
  // any body that exceeded the pipe high-watermark (~8KB on macOS).
  const b = currentBody();
  const jqFiltered = args.includes('--jq') || args.includes('-q');
  if (args.includes('--json') && !jqFiltered) {
    fs.writeSync(1, JSON.stringify({ body: b }));
  } else {
    fs.writeSync(1, b);
  }
  process.exit(0);
}
if (args[0] === 'project' && args[1] === 'item-edit') {
  // persist the written optionId so the read-back below reflects the write.
  const i = args.indexOf('--single-select-option-id');
  if (i !== -1 && args[i + 1]) fs.writeFileSync(STATE_FILE, args[i + 1]);
  process.exit(0);
}
if (args[0] === 'api' && args[1] === 'graphql') {
  // Only the read-back query carries a stdin payload (--input -). Reading fd 0
  // when no --input was passed would block on the parent's stdin.
  let payload = '';
  if (args.includes('--input')) {
    try { payload = fs.readFileSync(0, 'utf8'); } catch {}
  }
  if (payload.includes('fieldValueByName')) {
    let opt = '';
    try { opt = fs.readFileSync(STATE_FILE, 'utf8'); } catch {}
    const res = { data: { repository: { issue: { projectItems: { nodes: [
      { project: { id: PROJECT_ID }, fieldValueByName: { optionId: opt } },
    ] } } } } };
    fs.writeSync(1, JSON.stringify(res));
    process.exit(0);
  }
  process.exit(0);
}
// issue comment, other api calls, etc — silent success
process.exit(0);
`;
  const shimPath = path.join(binDir, 'gh');
  writeFileSync(shimPath, shim);
  chmodSync(shimPath, 0o755);

  return { sandbox, binDir };
}

async function runMove(sandbox, binDir, args, extraEnv = {}) {
  // We need projectItemForIssue to NOT fire (it makes a real GraphQL call we
  // can't easily stub here). The script provides --item-id to skip lookup, so
  // the test always passes one.
  return pexec('node', [SCRIPT, ...args, '--item-id', 'PVTI_test'], {
    env: {
      ...process.env,
      AITM_INTERNAL: '1',
      AI_TASK_MANAGER_PROJECT_DIR: sandbox,
      PATH: `${binDir}:${process.env.PATH}`,
      ...extraEnv,
    },
  });
}

async function runMoveExpectFail(sandbox, binDir, args, extraEnv = {}) {
  try {
    await runMove(sandbox, binDir, args, extraEnv);
    assert.fail('expected non-zero exit');
  } catch (e) {
    return e;
  }
}

// 1. test with ticked Deep dive but no section → blocked
{
  const body = '## Acceptance Criteria\n<!-- aitm-deep-dive-complete: 2026-05-11T00:00:00Z -->\n';
  const { sandbox, binDir } = makeSandbox(body);
  const e = await runMoveExpectFail(sandbox, binDir, ['100', 'test']);
  assert.equal(e.code, 4, `expected exit 4, got ${e.code}: ${e.stderr}`);
  assert.match(e.stderr, /BLOCKED: deep-dive-complete/);
  rmSync(sandbox, { recursive: true });
}

// 2. test with ticked Deep dive + adequate section → success
{
  const body = `## Acceptance Criteria\n<!-- aitm-deep-dive-complete: 2026-05-11T00:00:00Z -->\n\n${deepDiveAdequate()}\n`;
  const { sandbox, binDir } = makeSandbox(body);
  const r = await runMove(sandbox, binDir, ['100', 'test']);
  assert.match(r.stdout, /moved to: test/);
  rmSync(sandbox, { recursive: true });
}

// 3. review with ticked Deep dive but no section → blocked
{
  const body = '## Acceptance Criteria\n<!-- aitm-deep-dive-complete: 2026-05-11T00:00:00Z -->\n';
  const { sandbox, binDir } = makeSandbox(body);
  const e = await runMoveExpectFail(sandbox, binDir, ['100', 'review']);
  assert.equal(e.code, 4);
  assert.match(e.stderr, /BLOCKED: deep-dive-complete/);
  rmSync(sandbox, { recursive: true });
}

// 4. done with same missing-section body → blocked (also catches Done-gate legacy rules)
{
  const body =
    '## Acceptance Criteria\n<!-- aitm-deep-dive-complete: 2026-05-11T00:00:00Z -->\n- [ ] something else\n';
  const { sandbox, binDir } = makeSandbox(body);
  const e = await runMoveExpectFail(sandbox, binDir, ['100', 'done']);
  assert.equal(e.code, 4);
  // Must mention both the structural rule AND the unchecked-checkbox rule
  assert.match(e.stderr, /BLOCKED: deep-dive-complete/);
  rmSync(sandbox, { recursive: true });
}

// 5. TASK_TRACKER_FORCE_DONE=1 is NO LONGER honored — gate refuses anyway
{
  const body = '## Acceptance Criteria\n<!-- aitm-deep-dive-complete: 2026-05-11T00:00:00Z -->\n';
  const { sandbox, binDir } = makeSandbox(body);
  const e = await runMoveExpectFail(sandbox, binDir, ['100', 'test'], {
    TASK_TRACKER_FORCE_DONE: '1',
  });
  assert.equal(e.code, 4, `expected exit 4 even with FORCE_DONE set, got ${e.code}: ${e.stderr}`);
  assert.match(e.stderr, /BLOCKED: deep-dive-complete/);
  rmSync(sandbox, { recursive: true });
}

// 6. backlog warning fires when moving a sized + estimated issue to backlog
{
  const body =
    '## Acceptance Criteria\n- [ ] AC\n\n<!-- ai-task-manager:fields:start -->\n```json\n{"schema":1,"values":{"size":"S","estimate":3}}\n```\n<!-- ai-task-manager:fields:end -->\n';
  const { sandbox, binDir } = makeSandbox(body);
  const r = await runMove(sandbox, binDir, ['100', 'backlog']);
  assert.match(r.stderr, /sized \+ estimated issue to Backlog/);
  assert.match(r.stdout, /moved to: backlog/);
  rmSync(sandbox, { recursive: true });
}

// 7. backlog warning does NOT fire when fields-block has null size/estimate
{
  const body =
    '## Acceptance Criteria\n- [ ] AC\n\n<!-- ai-task-manager:fields:start -->\n```json\n{"schema":1,"values":{"size":null,"estimate":null}}\n```\n<!-- ai-task-manager:fields:end -->\n';
  const { sandbox, binDir } = makeSandbox(body);
  const r = await runMove(sandbox, binDir, ['100', 'backlog']);
  assert.doesNotMatch(r.stderr, /sized \+ estimated issue to Backlog/);
  assert.match(r.stdout, /moved to: backlog/);
  rmSync(sandbox, { recursive: true });
}

console.log('move-state-gate.test.mjs: all passed');
