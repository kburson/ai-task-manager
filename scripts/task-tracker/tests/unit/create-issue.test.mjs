// @story #29
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  writeFileSync,
  chmodSync,
  readFileSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import { spawnSync } from 'node:child_process';

const repoRoot = new URL('../../../..', import.meta.url).pathname;
const script = join(repoRoot, 'scripts/gh/create-issue.mjs');

// Minimal canonical body that passes the issue-body verifier added in #200.
// Use this in tests that exercise create-issue end-to-end with --body-file.
const CANONICAL_TAIL = [
  '',
  '## Acceptance Criteria',
  '- [ ] something',
  '',
  '### Definition of Done',
  '',
  '#### Functional (verified at Test)',
  '- [ ] npm test',
  '',
  '#### Lifecycle (auto-ticked at Review/Close)',
  '- [ ] Story closed and moved to Done',
  '',
  '## Pickup Directive — MANDATORY, DO NOT SKIP',
  '> Follow: `.ai-task-manager/pickup-directive.md`',
  '',
].join('\n');

function setup({ withProjectId = true, tetherExitCode = 0, ghCreateOverride = null } = {}) {
  const temp = mkdtempSync(join(projectScratchDir('test'), 'aitm-create-'));
  const binDir = join(temp, 'bin');
  mkdirSync(binDir, { recursive: true });
  mkdirSync(join(temp, '.ai-task-manager'), { recursive: true });

  const cfg = { repo: 'kburson/ai-task-manager', assignee: '@me' };
  if (withProjectId) cfg.projectId = 'PVT_TEST';
  writeFileSync(join(temp, '.ai-task-manager/task-tracker.json'), JSON.stringify(cfg, null, 2));

  const ghCallsLog = join(temp, 'gh-calls.log');
  const tetherLog = join(temp, 'tether-calls.log');

  const ghScript =
    ghCreateOverride ??
    `
if [[ "$1 $2" == "issue create" ]]; then
  echo "https://github.com/kburson/ai-task-manager/issues/9999"
  exit 0
fi
if [[ "$1" == "api" && "$3" == "PATCH" ]]; then
  cat >/dev/null
  echo '{}'
  exit 0
fi
echo "unexpected gh call: $*" >&2
exit 1
`;

  const ghMock = join(binDir, 'gh');
  writeFileSync(
    ghMock,
    `#!/bin/bash
set -euo pipefail
echo "$@" >> "${ghCallsLog}"
${ghScript}
`
  );
  chmodSync(ghMock, 0o755);

  // Stub project-tether.mjs as a node script that records argv and exits with configured code.
  const tetherStub = join(temp, 'project-tether-stub.mjs');
  writeFileSync(
    tetherStub,
    `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
appendFileSync(${JSON.stringify(tetherLog)}, process.argv.slice(2).join(' ') + '\\n');
process.exit(${tetherExitCode});
`
  );
  chmodSync(tetherStub, 0o755);

  return { temp, binDir, ghCallsLog, tetherLog, tetherStub };
}

function readLines(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
}

test('happy path: creates, tethers, substitutes placeholders', () => {
  const ctx = setup();
  const bodyFile = join(ctx.temp, 'body.md');
  writeFileSync(
    bodyFile,
    '## Scope\nIssue <this-issue-#> closes <parent-epic-#>.\n' + CANONICAL_TAIL
  );

  const result = spawnSync(
    'node',
    [
      script,
      '--title',
      'test',
      '--body-file',
      bodyFile,
      '--priority',
      'p1',
      '--label',
      'bug',
      '--label',
      'p1',
    ],
    {
      encoding: 'utf8',
      cwd: ctx.temp,
      env: {
        ...process.env,
        AI_TASK_MANAGER_PROJECT_DIR: undefined,
        PATH: `${ctx.binDir}:${process.env.PATH}`,
        CREATE_ISSUE_TETHER_SCRIPT: ctx.tetherStub,
      },
    }
  );

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /issues\/9999/);

  const ghCalls = readLines(ctx.ghCallsLog);
  // 1st call = issue create, 2nd call = api PATCH (placeholder substitution)
  assert.equal(
    ghCalls.length,
    2,
    `expected 2 gh calls, got ${ghCalls.length}: ${ghCalls.join(' | ')}`
  );
  assert.match(ghCalls[0], /issue create/);
  assert.match(ghCalls[0], /--title test/);
  assert.match(ghCalls[0], /--label bug/);
  assert.match(ghCalls[0], /--label p1/);
  assert.match(ghCalls[0], /--assignee @me/);
  assert.match(
    ghCalls[1],
    /api -X PATCH \/repos\/kburson\/ai-task-manager\/issues\/9999 --input -/
  );

  const tetherCalls = readLines(ctx.tetherLog);
  assert.equal(tetherCalls.length, 1);
  assert.match(tetherCalls[0], /--issue 9999/);
  assert.match(tetherCalls[0], /--status backlog/);
  assert.match(tetherCalls[0], /--priority p1/);
});

test('missing projectId: exits non-zero before calling gh', () => {
  const ctx = setup({ withProjectId: false });
  const bodyFile = join(ctx.temp, 'body.md');
  writeFileSync(bodyFile, '## Scope\nx\n' + CANONICAL_TAIL);

  const result = spawnSync('node', [script, '--title', 'test', '--body-file', bodyFile], {
    encoding: 'utf8',
    cwd: ctx.temp,
    env: {
      ...process.env,
      AI_TASK_MANAGER_PROJECT_DIR: undefined,
      PATH: `${ctx.binDir}:${process.env.PATH}`,
      CREATE_ISSUE_TETHER_SCRIPT: ctx.tetherStub,
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /projectId/);
  assert.equal(readLines(ctx.ghCallsLog).length, 0, 'gh must NOT be called when projectId missing');
});

test('tether failure: prints recovery command and exits non-zero', () => {
  const ctx = setup({ tetherExitCode: 7 });
  const bodyFile = join(ctx.temp, 'body.md');
  writeFileSync(bodyFile, '## Scope\nno placeholders here\n' + CANONICAL_TAIL);

  const result = spawnSync(
    'node',
    [script, '--title', 'test', '--body-file', bodyFile, '--priority', 'p2'],
    {
      encoding: 'utf8',
      cwd: ctx.temp,
      env: {
        ...process.env,
        AI_TASK_MANAGER_PROJECT_DIR: undefined,
        PATH: `${ctx.binDir}:${process.env.PATH}`,
        CREATE_ISSUE_TETHER_SCRIPT: ctx.tetherStub,
      },
    }
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /created but tether failed/);
  assert.match(result.stderr, /rerun: node /);
  assert.match(result.stderr, /--issue 9999/);
});

test('--parent flag forwards to project-tether', () => {
  const ctx = setup();
  const bodyFile = join(ctx.temp, 'body.md');
  writeFileSync(bodyFile, '## Scope\nno placeholders\n' + CANONICAL_TAIL);

  const result = spawnSync(
    'node',
    [script, '--title', 'test', '--body-file', bodyFile, '--priority', 'p1', '--parent', '42'],
    {
      encoding: 'utf8',
      cwd: ctx.temp,
      env: {
        ...process.env,
        AI_TASK_MANAGER_PROJECT_DIR: undefined,
        PATH: `${ctx.binDir}:${process.env.PATH}`,
        CREATE_ISSUE_TETHER_SCRIPT: ctx.tetherStub,
      },
    }
  );

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  const tetherCalls = readLines(ctx.tetherLog);
  assert.equal(tetherCalls.length, 1);
  assert.match(tetherCalls[0], /--parent 42/);
});

test('--no-tether: skips tether step entirely', () => {
  const ctx = setup({ withProjectId: false });
  const bodyFile = join(ctx.temp, 'body.md');
  writeFileSync(bodyFile, '## Scope\nx\n' + CANONICAL_TAIL);

  const result = spawnSync(
    'node',
    [script, '--title', 'test', '--body-file', bodyFile, '--no-tether'],
    {
      encoding: 'utf8',
      cwd: ctx.temp,
      env: {
        ...process.env,
        AI_TASK_MANAGER_PROJECT_DIR: undefined,
        PATH: `${ctx.binDir}:${process.env.PATH}`,
        CREATE_ISSUE_TETHER_SCRIPT: ctx.tetherStub,
      },
    }
  );

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.equal(readLines(ctx.tetherLog).length, 0, 'tether must NOT be called with --no-tether');
  // gh issue create must still have been called
  assert.match(readLines(ctx.ghCallsLog)[0] ?? '', /issue create/);
});

// #247 — a Done epic must not grow new children. The parent-state gate fires
// before body materialization, so the sub-issue is never created.
test('--shape sub-issue: refuses creation under a Done parent epic', () => {
  // Fake gh returns a project Status of "Done" for the parent epic's graphql
  // query, and would echo a created-issue URL if creation were (wrongly) reached.
  const doneParentGh = `
if [[ "$1" == "api" && "$2" == "graphql" ]]; then
  cat >/dev/null
  echo '{"data":{"repository":{"issue":{"projectItems":{"nodes":[{"project":{"id":"PVT_TEST"},"fieldValues":{"nodes":[{"name":"Done","field":{"name":"Status"}}]}}]}}}}}'
  exit 0
fi
if [[ "$1 $2" == "issue create" ]]; then
  echo "https://github.com/kburson/ai-task-manager/issues/9999"
  exit 0
fi
echo "unexpected gh call: $*" >&2
exit 1
`;
  const ctx = setup({ ghCreateOverride: doneParentGh });

  const result = spawnSync(
    'node',
    [
      script,
      '--title',
      'child',
      '--shape',
      'sub-issue',
      '--scope-file',
      join(ctx.temp, 'scope.md'),
      '--ac-file',
      join(ctx.temp, 'ac.md'),
      '--plan-metadata-file',
      join(ctx.temp, 'plan.md'),
      '--parent',
      '5',
    ],
    {
      encoding: 'utf8',
      cwd: ctx.temp,
      env: {
        ...process.env,
        AI_TASK_MANAGER_PROJECT_DIR: undefined,
        PATH: `${ctx.binDir}:${process.env.PATH}`,
        CREATE_ISSUE_TETHER_SCRIPT: ctx.tetherStub,
      },
    }
  );

  assert.equal(result.status, 2, `expected exit 2, got ${result.status}\n${result.stderr}`);
  assert.match(result.stderr, /epic is at "done"/i);
  // Creation must NOT have happened.
  assert.equal(
    readLines(ctx.ghCallsLog).some((l) => /issue create/.test(l)),
    false,
    'gh issue create must NOT run when the parent epic is Done'
  );
});

// #247 — the gate can be overridden for legitimate internal/testing use.
test('--shape sub-issue: AITM_SKIP_PARENT_STATE_GATE=1 bypasses the Done-parent check', () => {
  const doneParentGh = `
if [[ "$1" == "api" && "$2" == "graphql" ]]; then
  cat >/dev/null
  echo '{"data":{"repository":{"issue":{"projectItems":{"nodes":[{"project":{"id":"PVT_TEST"},"fieldValues":{"nodes":[{"name":"Done","field":{"name":"Status"}}]}}]}}}}}'
  exit 0
fi
echo "unexpected gh call: $*" >&2
exit 1
`;
  const ctx = setup({ ghCreateOverride: doneParentGh });
  // With the gate bypassed, execution proceeds to body materialization; we stop
  // there by pointing --scope-file at a missing path so preflight fails (exit
  // != 2). The point is only that the refusal message does NOT appear.
  const result = spawnSync(
    'node',
    [
      script,
      '--title',
      'child',
      '--shape',
      'sub-issue',
      '--scope-file',
      join(ctx.temp, 'missing-scope.md'),
      '--ac-file',
      join(ctx.temp, 'missing-ac.md'),
      '--plan-metadata-file',
      join(ctx.temp, 'missing-plan.md'),
      '--parent',
      '5',
    ],
    {
      encoding: 'utf8',
      cwd: ctx.temp,
      env: {
        ...process.env,
        AI_TASK_MANAGER_PROJECT_DIR: undefined,
        PATH: `${ctx.binDir}:${process.env.PATH}`,
        CREATE_ISSUE_TETHER_SCRIPT: ctx.tetherStub,
        AITM_SKIP_PARENT_STATE_GATE: '1',
      },
    }
  );

  assert.doesNotMatch(result.stderr, /epic is at "done"/i);
});
