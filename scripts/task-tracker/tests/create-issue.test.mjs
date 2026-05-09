import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const repoRoot = new URL('../../..', import.meta.url).pathname;
const script = join(repoRoot, 'scripts/gh/create-issue.mjs');

function setup({ withProjectId = true, tetherExitCode = 0, ghCreateOverride = null } = {}) {
  const temp = mkdtempSync(join(tmpdir(), 'aitm-create-'));
  const binDir = join(temp, 'bin');
  mkdirSync(binDir, { recursive: true });
  mkdirSync(join(temp, '.ai-task-manager'), { recursive: true });

  const cfg = { repo: 'kburson/ai-task-manager', assignee: '@me' };
  if (withProjectId) cfg.projectId = 'PVT_TEST';
  writeFileSync(join(temp, '.ai-task-manager/task-tracker.json'), JSON.stringify(cfg, null, 2));

  const ghCallsLog = join(temp, 'gh-calls.log');
  const tetherLog = join(temp, 'tether-calls.log');

  const ghScript = ghCreateOverride ?? `
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
  writeFileSync(ghMock, `#!/bin/bash
set -euo pipefail
echo "$@" >> "${ghCallsLog}"
${ghScript}
`);
  chmodSync(ghMock, 0o755);

  // Stub project-tether.mjs as a node script that records argv and exits with configured code.
  const tetherStub = join(temp, 'project-tether-stub.mjs');
  writeFileSync(tetherStub, `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
appendFileSync(${JSON.stringify(tetherLog)}, process.argv.slice(2).join(' ') + '\\n');
process.exit(${tetherExitCode});
`);
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
  writeFileSync(bodyFile, '## Scope\nIssue <this-issue-#> closes <parent-epic-#>.\n');

  const result = spawnSync('node', [script, '--title', 'test', '--body-file', bodyFile, '--priority', 'p1', '--label', 'bug', '--label', 'p1'], {
    encoding: 'utf8',
    cwd: ctx.temp,
    env: { ...process.env, PATH: `${ctx.binDir}:${process.env.PATH}`, CREATE_ISSUE_TETHER_SCRIPT: ctx.tetherStub },
  });

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /issues\/9999/);

  const ghCalls = readLines(ctx.ghCallsLog);
  // 1st call = issue create, 2nd call = api PATCH (placeholder substitution)
  assert.equal(ghCalls.length, 2, `expected 2 gh calls, got ${ghCalls.length}: ${ghCalls.join(' | ')}`);
  assert.match(ghCalls[0], /issue create/);
  assert.match(ghCalls[0], /--title test/);
  assert.match(ghCalls[0], /--label bug/);
  assert.match(ghCalls[0], /--label p1/);
  assert.match(ghCalls[0], /--assignee @me/);
  assert.match(ghCalls[1], /api -X PATCH \/repos\/kburson\/ai-task-manager\/issues\/9999 --input -/);

  const tetherCalls = readLines(ctx.tetherLog);
  assert.equal(tetherCalls.length, 1);
  assert.match(tetherCalls[0], /--issue 9999/);
  assert.match(tetherCalls[0], /--status backlog/);
  assert.match(tetherCalls[0], /--priority p1/);
});

test('missing projectId: exits non-zero before calling gh', () => {
  const ctx = setup({ withProjectId: false });
  const bodyFile = join(ctx.temp, 'body.md');
  writeFileSync(bodyFile, '## Scope\nx');

  const result = spawnSync('node', [script, '--title', 'test', '--body-file', bodyFile], {
    encoding: 'utf8',
    cwd: ctx.temp,
    env: { ...process.env, PATH: `${ctx.binDir}:${process.env.PATH}`, CREATE_ISSUE_TETHER_SCRIPT: ctx.tetherStub },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /projectId/);
  assert.equal(readLines(ctx.ghCallsLog).length, 0, 'gh must NOT be called when projectId missing');
});

test('tether failure: prints recovery command and exits non-zero', () => {
  const ctx = setup({ tetherExitCode: 7 });
  const bodyFile = join(ctx.temp, 'body.md');
  writeFileSync(bodyFile, '## Scope\nno placeholders here\n');

  const result = spawnSync('node', [script, '--title', 'test', '--body-file', bodyFile, '--priority', 'p2'], {
    encoding: 'utf8',
    cwd: ctx.temp,
    env: { ...process.env, PATH: `${ctx.binDir}:${process.env.PATH}`, CREATE_ISSUE_TETHER_SCRIPT: ctx.tetherStub },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /created but tether failed/);
  assert.match(result.stderr, /rerun: node /);
  assert.match(result.stderr, /--issue 9999/);
});

test('--parent flag forwards to project-tether', () => {
  const ctx = setup();
  const bodyFile = join(ctx.temp, 'body.md');
  writeFileSync(bodyFile, '## Scope\nno placeholders\n');

  const result = spawnSync('node', [script, '--title', 'test', '--body-file', bodyFile, '--priority', 'p1', '--parent', '42'], {
    encoding: 'utf8',
    cwd: ctx.temp,
    env: { ...process.env, PATH: `${ctx.binDir}:${process.env.PATH}`, CREATE_ISSUE_TETHER_SCRIPT: ctx.tetherStub },
  });

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  const tetherCalls = readLines(ctx.tetherLog);
  assert.equal(tetherCalls.length, 1);
  assert.match(tetherCalls[0], /--parent 42/);
});

test('--no-tether: skips tether step entirely', () => {
  const ctx = setup({ withProjectId: false });
  const bodyFile = join(ctx.temp, 'body.md');
  writeFileSync(bodyFile, '## Scope\nx\n');

  const result = spawnSync('node', [script, '--title', 'test', '--body-file', bodyFile, '--no-tether'], {
    encoding: 'utf8',
    cwd: ctx.temp,
    env: { ...process.env, PATH: `${ctx.binDir}:${process.env.PATH}`, CREATE_ISSUE_TETHER_SCRIPT: ctx.tetherStub },
  });

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.equal(readLines(ctx.tetherLog).length, 0, 'tether must NOT be called with --no-tether');
  // gh issue create must still have been called
  assert.match(readLines(ctx.ghCallsLog)[0] ?? '', /issue create/);
});
