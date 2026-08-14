// @story #459
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
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { spawnSync } from 'node:child_process';

const repoRoot = new URL('../../../../..', import.meta.url).pathname;
const script = join(repoRoot, 'scripts/gh/create-issue.mjs');

const CANONICAL_TAIL = [
  '',
  '## Story Origin',
  '- **kind**: code',
  '',
  '## Plan Metadata',
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
  '> Follow: `.ai-task-manager/templates/pickup-directive.md`',
  '',
].join('\n');

function setup({ ghCreateOverride = null } = {}) {
  const temp = mkdtempSync(join(projectScratchDir('test'), 'aitm-create-459-'));
  const binDir = join(temp, 'bin');
  mkdirSync(binDir, { recursive: true });
  mkdirSync(join(temp, '.ai-task-manager'), { recursive: true });

  const cfg = { repo: 'kburson/ai-task-manager', assignee: '@me', projectId: 'PVT_TEST' };
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

  const tetherStub = join(temp, 'project-tether-stub.mjs');
  writeFileSync(
    tetherStub,
    `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
appendFileSync(${JSON.stringify(tetherLog)}, process.argv.slice(2).join(' ') + '\\n');
process.exit(0);
`
  );
  chmodSync(tetherStub, 0o755);

  return { temp, binDir, ghCallsLog, tetherLog, tetherStub };
}

function readLines(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
}

test('partial success: gh exits nonzero but prints issue URL → exit 6 with recovery message', () => {
  const partialSuccessGh = `
if [[ "$1 $2" == "issue create" ]]; then
  echo "https://github.com/kburson/ai-task-manager/issues/457"
  exit 1
fi
echo "unexpected gh call: $*" >&2
exit 1
`;
  const ctx = setup({ ghCreateOverride: partialSuccessGh });
  const bodyFile = join(ctx.temp, 'body.md');
  writeFileSync(bodyFile, '## Scope\nx\n' + CANONICAL_TAIL);

  const result = spawnSync(
    'node',
    [script, '--title', 'dup-test', '--body-file', bodyFile, '--priority', 'p1'],
    {
      encoding: 'utf8',
      cwd: ctx.temp,
      env: {
        ...process.env,
        AI_TASK_MANAGER_PROJECT_DIR: ctx.temp,
        PATH: `${ctx.binDir}:${process.env.PATH}`,
        CREATE_ISSUE_TETHER_SCRIPT: ctx.tetherStub,
      },
    }
  );

  assert.equal(
    result.status,
    6,
    `expected exit 6 (partial-success), got ${result.status}\n${result.stderr}`
  );
  assert.match(result.stderr, /^AITM_CREATED_ISSUE=457$/m);
  assert.match(result.stderr, /partial-success: #457/);
  assert.match(result.stderr, /tether\/update #457 before retrying/i);
  assert.equal(
    readLines(ctx.tetherLog).length,
    0,
    'tether must NOT run after partial-success exit'
  );
});

test('genuine failure: gh exits nonzero with no URL in stdout → non-zero exit, no partial-success message', () => {
  const genuineFailGh = `
if [[ "$1 $2" == "issue create" ]]; then
  echo "some unrelated error output without a URL" >&2
  exit 1
fi
echo "unexpected gh call: $*" >&2
exit 1
`;
  const ctx = setup({ ghCreateOverride: genuineFailGh });
  const bodyFile = join(ctx.temp, 'body.md');
  writeFileSync(bodyFile, '## Scope\nx\n' + CANONICAL_TAIL);

  const result = spawnSync(
    'node',
    [script, '--title', 'fail-test', '--body-file', bodyFile, '--priority', 'p1'],
    {
      encoding: 'utf8',
      cwd: ctx.temp,
      env: {
        ...process.env,
        AI_TASK_MANAGER_PROJECT_DIR: ctx.temp,
        PATH: `${ctx.binDir}:${process.env.PATH}`,
        CREATE_ISSUE_TETHER_SCRIPT: ctx.tetherStub,
      },
    }
  );

  assert.notEqual(result.status, 0, 'must exit nonzero on genuine failure');
  assert.notEqual(result.status, 6, 'must NOT exit 6 (no partial-success) when no URL in stdout');
  assert.doesNotMatch(result.stderr, /partial-success/i);
});
