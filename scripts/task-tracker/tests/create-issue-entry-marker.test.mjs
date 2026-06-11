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
import { projectScratchDir } from '../lib/scratch-dir.mjs';
import { spawnSync } from 'node:child_process';

const repoRoot = new URL('../../..', import.meta.url).pathname;
const script = join(repoRoot, 'scripts/gh/create-issue.mjs');

// Minimal canonical body that passes the issue-body verifier.
const CANONICAL_BODY = [
  '## Scope',
  'Test scope.',
  '',
  '## Acceptance Criteria',
  '- [ ] something',
  '',
  '### Definition of Done',
  '- [ ] npm test',
  '',
  '## Pickup Directive — MANDATORY, DO NOT SKIP',
  '> Follow: `.ai-task-manager/pickup-directive.md`',
  '',
].join('\n');

// gh mock that copies the --body-file content to a known capture path so the
// test can assert what was actually posted to `gh issue create`.
function setup() {
  const temp = mkdtempSync(join(projectScratchDir('test'), 'aitm-create-em-'));
  const binDir = join(temp, 'bin');
  mkdirSync(binDir, { recursive: true });
  mkdirSync(join(temp, '.ai-task-manager'), { recursive: true });

  const cfg = { repo: 'kburson/ai-task-manager', projectId: 'PVT_TEST', assignee: '@me' };
  writeFileSync(join(temp, '.ai-task-manager/task-tracker.json'), JSON.stringify(cfg, null, 2));

  const capturedBodyPath = join(temp, 'captured-body.md');

  const ghMock = join(binDir, 'gh');
  writeFileSync(
    ghMock,
    `#!/bin/bash
set -euo pipefail
if [[ "$1 $2" == "issue create" ]]; then
  # Find --body-file argument and copy its contents to the capture path.
  args=("$@")
  for (( i=0; i<\${#args[@]}; i++ )); do
    if [[ "\${args[$i]}" == "--body-file" ]]; then
      cp "\${args[$((i+1))]}" "${capturedBodyPath}"
      break
    fi
  done
  echo "https://github.com/kburson/ai-task-manager/issues/9999"
  exit 0
fi
if [[ "$1" == "api" ]]; then
  cat >/dev/null
  echo '{}'
  exit 0
fi
echo "unexpected gh call: $*" >&2
exit 1
`
  );
  chmodSync(ghMock, 0o755);

  const tetherStub = join(temp, 'project-tether-stub.mjs');
  writeFileSync(tetherStub, `#!/usr/bin/env node\nprocess.exit(0);\n`);
  chmodSync(tetherStub, 0o755);

  return { temp, binDir, capturedBodyPath, tetherStub };
}

function runCreate(ctx, extraArgs) {
  const bodyFile = join(ctx.temp, 'input-body.md');
  writeFileSync(bodyFile, CANONICAL_BODY);
  return spawnSync(
    'node',
    [script, '--title', 'test', '--body-file', bodyFile, '--label', 'bug', ...extraArgs],
    {
      encoding: 'utf8',
      cwd: ctx.temp,
      env: {
        ...process.env,
        PATH: `${ctx.binDir}:${process.env.PATH}`,
        CREATE_ISSUE_TETHER_SCRIPT: ctx.tetherStub,
      },
    }
  );
}

test('#221: default (no --status) stamps aitm-entered-backlog on the posted body', () => {
  const ctx = setup();
  const result = runCreate(ctx, []);
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.ok(existsSync(ctx.capturedBodyPath), 'gh mock captured the body file');
  const posted = readFileSync(ctx.capturedBodyPath, 'utf8');
  assert.match(
    posted,
    /<!--\s*aitm-entered-backlog(?::\s*[0-9TZ:.-]+|\s+ts="[^"]*")\s*-->/,
    'posted body contains aitm-entered-backlog marker'
  );
});

test('#272: --status flag is rejected (all issues born in backlog)', () => {
  const ctx = setup();
  const result = runCreate(ctx, ['--status', 'refine', '--priority', 'p2']);
  assert.notEqual(result.status, 0, '--status must be refused');
  assert.match(
    result.stderr,
    /--status is no longer accepted/,
    'rejection message references the #272 deprecation'
  );
});

test('#272: --status develop is rejected (no backdoor to other stages on create)', () => {
  const ctx = setup();
  const result = runCreate(ctx, ['--status', 'develop']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--status is no longer accepted/);
});

test('#221: stampEntryMarker is idempotent — pre-existing marker is not duplicated', async () => {
  // Direct unit-level idempotency check: re-stamping the same (stage, ts) yields
  // the same body string (no duplicate marker).
  const { stampEntryMarker } = await import('../lib/stage-entry-markers.mjs');
  const ts = '2026-05-26T00:00:00.000Z';
  const once = stampEntryMarker(CANONICAL_BODY, 'backlog', ts);
  const twice = stampEntryMarker(once, 'backlog', ts);
  assert.equal(twice, once, 're-stamping with same ts is a no-op');
  // Exactly one backlog marker.
  const matches = once.match(/aitm-entered-backlog/g) || [];
  assert.equal(matches.length, 1, 'exactly one backlog marker after single stamp');
});
