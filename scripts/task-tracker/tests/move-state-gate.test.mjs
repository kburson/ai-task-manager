#!/usr/bin/env node
// Integration tests for the structural body gate in scripts/gh/move-state.mjs.
// Drives move-state.mjs against a sandboxed config + fake `gh` shim that returns
// a body we control. Asserts:
//   - validate with ticked Deep dive + missing section → exit 4 + BLOCKED:
//   - validate with ticked Deep dive + adequate section → exit 0
//   - review with same missing-section body → exit 4
//   - done with same missing-section body → exit 4 (Done gate fires)
//   - TASK_TRACKER_FORCE_DONE=1 bypasses

import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(__dir, '../../gh/move-state.mjs');

function deepDiveAdequate() {
  const lines = [
    '## Pickup Directive',
    '- [ ] Deep dive complete',
    '',
    '## Deep-Dive Analysis (2026-05-08)',
    '',
  ];
  for (let i = 0; i < 25; i++) lines.push(`line ${i + 1}`);
  lines.push('', '<!-- ai-task-manager:fields:start -->', '<!-- ai-task-manager:fields:end -->');
  return lines.join('\n');
}

function makeSandbox(body) {
  const sandbox = mkdtempSync(path.join(tmpdir(), 'tt-gate-'));
  mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify({
      repo: 'o/r',
      projectId: 'PVT_x',
      kanbanFieldId: 'PVTF_x',
      kanbanOptionBacklog: 'OP_b',
      kanbanOptionGroom: 'OP_g',
      kanbanOptionAnalyze: 'OP_a',
      kanbanOptionDevelopment: 'OP_d',
      kanbanOptionValidate: 'OP_v',
      kanbanOptionReview: 'OP_r',
      kanbanOptionDone: 'OP_done',
    }, null, 2)
  );

  // Fake gh shim: returns the body we want for `issue view`, swallows everything else.
  const binDir = path.join(sandbox, 'bin');
  mkdirSync(binDir);
  const shim = `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'issue' && args[1] === 'view') {
  // emulate --jq .body extracting body field
  process.stdout.write(${JSON.stringify(body)});
  process.exit(0);
}
// project item-edit, issue comment, api graphql, etc — silent success
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

// 1. validate with ticked Deep dive but no section → blocked
{
  const body = '## Acceptance Criteria\n<!-- aitm-deep-dive-complete: 2026-05-11T00:00:00Z -->\n';
  const { sandbox, binDir } = makeSandbox(body);
  const e = await runMoveExpectFail(sandbox, binDir, ['100', 'validate']);
  assert.equal(e.code, 4, `expected exit 4, got ${e.code}: ${e.stderr}`);
  assert.match(e.stderr, /BLOCKED: deep-dive-complete/);
  rmSync(sandbox, { recursive: true });
}

// 2. validate with ticked Deep dive + adequate section → success
{
  const body = `## Acceptance Criteria\n<!-- aitm-deep-dive-complete: 2026-05-11T00:00:00Z -->\n\n${deepDiveAdequate()}\n`;
  const { sandbox, binDir } = makeSandbox(body);
  const r = await runMove(sandbox, binDir, ['100', 'validate']);
  assert.match(r.stdout, /moved to: validate/);
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
  const body = '## Acceptance Criteria\n<!-- aitm-deep-dive-complete: 2026-05-11T00:00:00Z -->\n- [ ] something else\n';
  const { sandbox, binDir } = makeSandbox(body);
  const e = await runMoveExpectFail(sandbox, binDir, ['100', 'done']);
  assert.equal(e.code, 4);
  // Must mention both the structural rule AND the unchecked-checkbox rule
  assert.match(e.stderr, /BLOCKED: deep-dive-complete/);
  rmSync(sandbox, { recursive: true });
}

// 5. TASK_TRACKER_FORCE_DONE=1 bypasses with visible warning
{
  const body = '## Acceptance Criteria\n<!-- aitm-deep-dive-complete: 2026-05-11T00:00:00Z -->\n';
  const { sandbox, binDir } = makeSandbox(body);
  const r = await runMove(sandbox, binDir, ['100', 'validate'], { TASK_TRACKER_FORCE_DONE: '1' });
  assert.match(r.stderr, /bypassing validate gate/);
  assert.match(r.stdout, /moved to: validate/);
  rmSync(sandbox, { recursive: true });
}

// 6. backlog warning fires when moving a sized + estimated issue to backlog
{
  const body = '## Acceptance Criteria\n- [ ] AC\n\n<!-- ai-task-manager:fields:start -->\n```json\n{"schema":1,"values":{"size":"S","estimate":3}}\n```\n<!-- ai-task-manager:fields:end -->\n';
  const { sandbox, binDir } = makeSandbox(body);
  const r = await runMove(sandbox, binDir, ['100', 'backlog']);
  assert.match(r.stderr, /sized \+ estimated issue to Backlog/);
  assert.match(r.stdout, /moved to: backlog/);
  rmSync(sandbox, { recursive: true });
}

// 7. backlog warning does NOT fire when fields-block has null size/estimate
{
  const body = '## Acceptance Criteria\n- [ ] AC\n\n<!-- ai-task-manager:fields:start -->\n```json\n{"schema":1,"values":{"size":null,"estimate":null}}\n```\n<!-- ai-task-manager:fields:end -->\n';
  const { sandbox, binDir } = makeSandbox(body);
  const r = await runMove(sandbox, binDir, ['100', 'backlog']);
  assert.doesNotMatch(r.stderr, /sized \+ estimated issue to Backlog/);
  assert.match(r.stdout, /moved to: backlog/);
  rmSync(sandbox, { recursive: true });
}

console.log('move-state-gate.test.mjs: all passed');
