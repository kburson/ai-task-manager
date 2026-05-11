#!/usr/bin/env node
// Integration tests for the analyze -> development approval gate in
// scripts/gh/move-state.mjs. Mirrors the harness in move-state-gate.test.mjs.
//
// Asserts:
//   1. Body without the ticked approval line, current state Analyze -> exit 4
//      with `BLOCKED: analyze -> development requires`.
//   2. Body WITH the ticked approval line -> exit 0 + `moved to: development`.
//   3. TASK_TRACKER_FORCE_DONE=1 bypasses with audible warning.
//   4. Current state != analyze (e.g. validate) -> gate does NOT fire even
//      without the approval line, so backwards transitions still work.

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

// Build a body that satisfies the deep-dive structural gate so we isolate the
// approval-gate behaviour. The dev-state target also needs the deep-dive
// section to be present + adequate.
function deepDiveAdequate() {
  const lines = [
    '## Pickup Directive',
    '- [x] Deep dive complete',
    '',
    '## Deep-Dive Analysis (2026-05-09)',
    '',
  ];
  for (let i = 0; i < 25; i++) lines.push(`line ${i + 1}`);
  lines.push('', '<!-- ai-task-manager:fields:start -->', '<!-- ai-task-manager:fields:end -->');
  return lines.join('\n');
}

const PROJECT_ID = 'PVT_x';

function makeSandbox(body, { currentState = 'Analyze' } = {}) {
  const sandbox = mkdtempSync(path.join(tmpdir(), 'tt-approval-gate-'));
  mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify({
      repo: 'o/r',
      projectId: PROJECT_ID,
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

  // Fake gh shim. Responds to:
  //   gh issue view ... --jq .body          -> writes the body
  //   gh api graphql ...                    -> JSON with project Status
  //   anything else                          -> silent success
  const binDir = path.join(sandbox, 'bin');
  mkdirSync(binDir);
  const shim = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === 'issue' && args[1] === 'view') {
  process.stdout.write(${JSON.stringify(body)});
  process.exit(0);
}
if (args[0] === 'api' && args[1] === 'graphql') {
  // Query payload comes via stdin (--input -). Read it to decide the shape.
  let stdin = '';
  try { stdin = fs.readFileSync(0, 'utf8'); } catch {}
  if (stdin.includes('projectItems')) {
    const payload = {
      data: { repository: { issue: { projectItems: { nodes: [
        { project: { id: ${JSON.stringify(PROJECT_ID)} },
          fieldValueByName: { name: ${JSON.stringify(currentState)} } },
      ] } } } },
    };
    process.stdout.write(JSON.stringify(payload));
    process.exit(0);
  }
  process.stdout.write('{"data":{}}');
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
  const { sandbox, binDir } = makeSandbox(body, { currentState: 'Analyze' });
  const e = await runMoveExpectFail(sandbox, binDir, ['100', 'development']);
  assert.equal(e.code, 4, `expected exit 4, got ${e.code}: ${e.stderr}`);
  assert.match(e.stderr, /BLOCKED: analyze -> development requires/);
  rmSync(sandbox, { recursive: true });
}

// 2. Body WITH approval marker -> success
{
  const body = `## Acceptance Criteria\n- [ ] AC\n\n${deepDiveAdequate()}\n\n<!-- aitm-plan-approved: 2026-05-11T00:00:00.000Z -->\n`;
  const { sandbox, binDir } = makeSandbox(body, { currentState: 'Analyze' });
  const r = await runMove(sandbox, binDir, ['100', 'development']);
  assert.match(r.stdout, /moved to: development/);
  rmSync(sandbox, { recursive: true });
}

// 3. TASK_TRACKER_FORCE_DONE=1 bypasses the gate even when not approved
{
  const body = `## Acceptance Criteria\n- [ ] AC\n\n${deepDiveAdequate()}\n`;
  const { sandbox, binDir } = makeSandbox(body, { currentState: 'Analyze' });
  const r = await runMove(sandbox, binDir, ['100', 'development'], { TASK_TRACKER_FORCE_DONE: '1' });
  assert.match(r.stderr, /bypassing analyze->development approval gate/);
  assert.match(r.stdout, /moved to: development/);
  rmSync(sandbox, { recursive: true });
}

// 4. Current state != analyze (e.g. validate) -> gate does NOT fire
//    so a transition back to development from validate succeeds without approval line.
{
  const body = `## Acceptance Criteria\n- [ ] AC\n\n${deepDiveAdequate()}\n`;
  const { sandbox, binDir } = makeSandbox(body, { currentState: 'Validate' });
  const r = await runMove(sandbox, binDir, ['100', 'development']);
  assert.match(r.stdout, /moved to: development/);
  assert.doesNotMatch(r.stderr, /BLOCKED: analyze -> development/);
  rmSync(sandbox, { recursive: true });
}

console.log('move-state-approval-gate.test.mjs: all passed');
