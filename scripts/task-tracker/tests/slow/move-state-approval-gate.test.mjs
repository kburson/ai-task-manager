#!/usr/bin/env node
// @story #50
// Integration tests for the plan -> develop approval gate in
// scripts/gh/move-state.mjs. Mirrors the harness in move-state-gate.test.mjs.
//
// Asserts:
//   1. Body without the ticked approval line, current state Analyze -> exit 4
//      with `BLOCKED:` + `plan -> develop requires` in the stderr line
//      (post-#277 the runGuards renderer prefixes the reason with
//      `#<N> is in plan;`, so the substring is no longer literally adjacent
//      to `BLOCKED:` — the regex tolerates either form).
//   2. Body WITH the ticked approval line -> exit 0 + `moved to: develop`.
//   3. Current state != plan (e.g. test) -> gate does NOT fire even
//      without the approval line, so backwards transitions still work.

import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { projectScratchDir, mkdtempProjectIsolated } from '../../lib/scratch-dir.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(__dir, '../../../gh/move-state.mjs');

// Build a body that satisfies both the plan-approved marker AND the deep-dive
// structural gate. Tests that need to isolate one gate can omit the other.
function deepDiveAdequate() {
  const lines = [
    '## Pickup Directive — MANDATORY, DO NOT SKIP',
    '- [x] Deep dive complete',
    '',
    // A real plan->develop issue carries the full prior entry-marker chain.
    // The #252 contiguity guard requires it on the forward move, so the
    // fixture must include it for the approval-gate assertions to be reached.
    '<!-- aitm-entered-backlog: 2026-05-09T09:00:00Z -->',
    '<!-- aitm-entered-refine: 2026-05-09T09:30:00Z -->',
    '<!-- aitm-entered-plan: 2026-05-09T09:45:00Z -->',
    '',
    '<!-- aitm-deep-dive-complete: 2026-05-09T10:00:00Z -->',
    // Post-#324 the plan→develop deep-dive guard also requires a `posted`
    // marker (stamped by ensureDeepDive when the section is published).
    '<!-- aitm-deep-dive-posted: 2026-05-09T10:00:00Z -->',
    '',
    '## Deep-Dive Analysis (2026-05-09)',
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
  // #386 — plan→develop now refuses a body with no Verification Commands
  // section (>= 1 parseable entry). The success-path fixtures route through
  // here, so include one; fail-path fixtures that build bodies inline already
  // expect refusal for their own reason.
  lines.push('', '## Verification Commands', '', '- [ ] `npm run test:all`');
  lines.push('', '<!-- ai-task-manager:fields:start -->', '<!-- ai-task-manager:fields:end -->');
  return lines.join('\n');
}

const PROJECT_ID = 'PVT_x';

function makeSandbox(body, { currentState = 'Analyze' } = {}) {
  const sandbox = mkdtempProjectIsolated('tt-approval-gate-');
  mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify(
      {
        repo: 'o/r',
        projectId: PROJECT_ID,
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

  // Fake gh shim. Responds to:
  //   gh issue view ... --jq .body          -> writes the body
  //   gh api graphql ...                    -> JSON with project Status
  //   anything else                          -> silent success
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
// #747 — runStatusWrite reads Status back after the item-edit and fails
// closed unless it confirms the written optionId. Record each item-edit's
// optionId and reflect it as \`optionId\` on the projectItems read-back so a
// successful move confirms. \`name\` stays the current state for the pre-write
// drift check (which reads name, not optionId).
const STATE_FILE = ${JSON.stringify(path.join(sandbox, '.last-option'))};
const args = process.argv.slice(2);
if (args[0] === 'issue' && args[1] === 'view') {
  // fs.writeSync is required because process.stdout.write is non-blocking
  // when stdout is a pipe; process.exit(0) on the next line would truncate
  // any body that exceeded the pipe high-watermark (~8KB on macOS).
  fs.writeSync(1, BODY);
  process.exit(0);
}
if (args[0] === 'project' && args[1] === 'item-edit') {
  const i = args.indexOf('--single-select-option-id');
  if (i !== -1 && args[i + 1]) fs.writeFileSync(STATE_FILE, args[i + 1]);
  process.exit(0);
}
if (args[0] === 'api' && new RegExp('^repos/[^/]+/[^/]+/issues/[0-9]+/comments$').test(args[1] || '')) {
  // Plan→develop gate fetches the refine-estimate comment via REST.
  // Return a single comment matching the issue number with a non-empty
  // \`### Planned Estimate\` appendix so planPlannedEstimateGate passes.
  const issueNum = (args[1].match(new RegExp('issues/([0-9]+)/comments')) || [])[1] || '100';
  const commentBody = [
    '<!-- aitm-refined-estimate: ' + issueNum + ' -->',
    '### 🛠 Refine estimate',
    '',
    '| Field | Value |',
    '|---|---|',
    '| Size | S |',
    '| Estimate (h) | 1 |',
    '',
    '### Planned Estimate',
    '',
    '| Field | Refine | Plan | Δ |',
    '|---|---|---|---|',
    '| Size | S | S | 0 |',
    '| Estimate (h) | 1 | 1 | 0 |',
    '',
    'no drift observed',
  ].join('\\n');
  fs.writeSync(1, JSON.stringify([{ id: 1, body: commentBody }]));
  process.exit(0);
}
if (args[0] === 'api' && args[1] === 'graphql') {
  // Query payload comes via stdin (--input -). Read it to decide the shape.
  let stdin = '';
  try { stdin = fs.readFileSync(0, 'utf8'); } catch {}
  if (stdin.includes('projectItems')) {
    let opt = '';
    try { opt = fs.readFileSync(STATE_FILE, 'utf8'); } catch {}
    const payload = {
      data: { repository: { issue: { projectItems: { nodes: [
        { project: { id: ${JSON.stringify(PROJECT_ID)} },
          fieldValueByName: { name: ${JSON.stringify(currentState)}, optionId: opt } },
      ] } } } },
    };
    fs.writeSync(1, JSON.stringify(payload));
    process.exit(0);
  }
  fs.writeSync(1, '{"data":{}}');
  process.exit(0);
}
process.exit(0);
`;
  const shimPath = path.join(binDir, 'gh');
  writeFileSync(shimPath, shim);
  chmodSync(shimPath, 0o755);

  return { sandbox, binDir };
}

async function runMove(sandbox, binDir, args, extraEnv = {}) {
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

// 1. Body without approval line, current state = Analyze -> blocked
{
  const body = `## Acceptance Criteria\n- [ ] AC\n\n${deepDiveAdequate()}\n`;
  const { sandbox, binDir } = makeSandbox(body, { currentState: 'Plan' });
  const e = await runMoveExpectFail(sandbox, binDir, ['100', 'develop']);
  assert.equal(e.code, 4, `expected exit 4, got ${e.code}: ${e.stderr}`);
  assert.match(e.stderr, /BLOCKED:.*plan -> develop requires/);
  assert.match(e.stderr, /plan-approve/, 'gate message must name the plan-approve command');
  rmSync(sandbox, { recursive: true });
}

// 2. Body WITH approval marker -> success
{
  const body = `## Acceptance Criteria\n- [ ] AC\n\n${deepDiveAdequate()}\n\n<!-- aitm-plan-approved: 2026-05-11T00:00:00.000Z -->\n`;
  const { sandbox, binDir } = makeSandbox(body, { currentState: 'Plan' });
  const r = await runMove(sandbox, binDir, ['100', 'develop']);
  assert.match(r.stdout, /moved to: develop/);
  rmSync(sandbox, { recursive: true });
}

// 3. TASK_TRACKER_FORCE_DONE=1 is NO LONGER honored — gate refuses regardless
{
  const body = `## Acceptance Criteria\n- [ ] AC\n\n${deepDiveAdequate()}\n`;
  const { sandbox, binDir } = makeSandbox(body, { currentState: 'Plan' });
  const e = await runMoveExpectFail(sandbox, binDir, ['100', 'develop'], {
    TASK_TRACKER_FORCE_DONE: '1',
  });
  assert.equal(e.code, 4, `expected exit 4 even with FORCE_DONE set, got ${e.code}: ${e.stderr}`);
  assert.match(e.stderr, /BLOCKED:.*plan -> develop requires/);
  rmSync(sandbox, { recursive: true });
}

// 4. Current state != plan (e.g. test) -> gate does NOT fire
//    so a transition back to develop from test succeeds without approval line.
{
  const body = `## Acceptance Criteria\n- [ ] AC\n\n${deepDiveAdequate()}\n`;
  const { sandbox, binDir } = makeSandbox(body, { currentState: 'Test' });
  const r = await runMove(sandbox, binDir, ['100', 'develop']);
  assert.match(r.stdout, /moved to: develop/);
  assert.doesNotMatch(r.stderr, /BLOCKED: plan -> develop/);
  rmSync(sandbox, { recursive: true });
}

// 5. Approval present but deep-dive marker missing -> blocked with deep-dive message
{
  // #355 — contiguity guard is now a registry entry guard that fires on every
  // forward move; fixture body must carry the prior-stage entry markers so the
  // deep-dive-missing assertion is the one that surfaces.
  const entryMarkers = [
    '<!-- aitm-entered-backlog: 2026-05-09T09:00:00Z -->',
    '<!-- aitm-entered-refine: 2026-05-09T09:30:00Z -->',
    '<!-- aitm-entered-plan: 2026-05-09T09:45:00Z -->',
  ].join('\n');
  const bodyNoDeepDive = `## Acceptance Criteria\n- [ ] AC\n\n${entryMarkers}\n\n<!-- aitm-plan-approved: 2026-05-11T00:00:00.000Z -->\n`;
  const { sandbox, binDir } = makeSandbox(bodyNoDeepDive, { currentState: 'Plan' });
  const e = await runMoveExpectFail(sandbox, binDir, ['100', 'develop']);
  assert.equal(e.code, 4, `expected exit 4, got ${e.code}: ${e.stderr}`);
  assert.match(e.stderr, /aitm-deep-dive-complete/);
  rmSync(sandbox, { recursive: true });
}

// 6. Deep-dive marker present but section has < 20 non-empty lines -> blocked
{
  const thinDeepDive = [
    '## Pickup Directive — MANDATORY, DO NOT SKIP',
    '- [x] Deep dive complete',
    '',
    // #355 — contiguity guard requires prior-stage entry markers on every
    // forward move; without them the move exits 6 before the substantive-chars
    // floor is reached.
    '<!-- aitm-entered-backlog: 2026-05-09T09:00:00Z -->',
    '<!-- aitm-entered-refine: 2026-05-09T09:30:00Z -->',
    '<!-- aitm-entered-plan: 2026-05-09T09:45:00Z -->',
    '',
    '<!-- aitm-deep-dive-complete: 2026-05-09T10:00:00Z -->',
    // Include posted marker so planExitDeepDiveGuard's posted-presence check
    // passes; the assertion under test is the section-substantive-chars floor.
    '<!-- aitm-deep-dive-posted: 2026-05-09T10:00:00Z -->',
    '',
    '## Deep-Dive Analysis (2026-05-09)',
    '',
    'only a few lines',
    'not enough',
    '',
    '<!-- ai-task-manager:fields:start -->',
    '<!-- ai-task-manager:fields:end -->',
  ].join('\n');
  const body = `## Acceptance Criteria\n- [ ] AC\n\n${thinDeepDive}\n\n<!-- aitm-plan-approved: 2026-05-11T00:00:00.000Z -->\n`;
  const { sandbox, binDir } = makeSandbox(body, { currentState: 'Plan' });
  const e = await runMoveExpectFail(sandbox, binDir, ['100', 'develop']);
  assert.equal(e.code, 4, `expected exit 4, got ${e.code}: ${e.stderr}`);
  assert.match(e.stderr, /deep-dive-complete/);
  rmSync(sandbox, { recursive: true });
}

// 7. Both markers present + adequate section -> success
{
  const body = `## Acceptance Criteria\n- [ ] AC\n\n${deepDiveAdequate()}\n\n<!-- aitm-plan-approved: 2026-05-11T00:00:00.000Z -->\n`;
  const { sandbox, binDir } = makeSandbox(body, { currentState: 'Plan' });
  const r = await runMove(sandbox, binDir, ['100', 'develop']);
  assert.match(r.stdout, /moved to: develop/);
  assert.doesNotMatch(r.stderr, /BLOCKED/);
  rmSync(sandbox, { recursive: true });
}

console.log('move-state-approval-gate.test.mjs: all passed');
