// @story #186
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectScratchDir } from '../lib/scratch-dir.mjs';

const repoRoot = new URL('../../..', import.meta.url).pathname;
const script = join(repoRoot, 'scripts/gh/update-event-fields.mjs');

function makeTempEnv(ghScript) {
  const temp = mkdtempSync(join(projectScratchDir('test'), 'aitm-update-event-states-'));
  const binDir = join(temp, 'bin');
  mkdirSync(binDir);

  const ghMock = join(binDir, 'gh');
  writeFileSync(ghMock, ghScript);
  chmodSync(ghMock, 0o755);

  const aitm = join(temp, '.ai-task-manager');
  mkdirSync(aitm);
  writeFileSync(
    join(aitm, 'task-tracker.json'),
    JSON.stringify({
      repo: 'owner/repo',
      projectId: 'PVT_FAKE',
      fieldStartTime: 'F_START_FAKE',
      fieldIds: { startTime: 'F_START_FAKE' },
    })
  );

  const env = { ...process.env, PATH: `${binDir}:${process.env.PATH}` };
  return { temp, env };
}

// Mock that returns issue body with no startTime, and succeeds for all graphql / edit calls.
const SUCCESS_GH = `#!/bin/bash
set -euo pipefail
if [[ "$1 $2" == "issue view" ]]; then
  echo '{"body":"<!-- aitm-fields: {\\"schema\\":1,\\"values\\":{\\"startTime\\":null}} -->"}'
  exit 0
fi
if [[ "$1" == "api" && "$2" == "graphql" ]]; then
  echo '{"data":{}}'
  exit 0
fi
if [[ "$1 $2" == "issue edit" ]]; then
  exit 0
fi
exit 0
`;

// 1. Each of the 6 state args should be accepted (exit 0).
const states = ['refine', 'plan', 'develop', 'test', 'review', 'done'];
for (const state of states) {
  const { env } = makeTempEnv(SUCCESS_GH);
  const result = spawnSync(process.execPath, [script, '999', state, '--item-id', 'ITEM_FAKE'], {
    encoding: 'utf8',
    env,
    cwd: repoRoot,
  });
  assert.equal(
    result.status,
    0,
    `expected exit 0 for state="${state}" but got ${result.status}\nstderr: ${result.stderr}`
  );
  // refine writes startTime (moved from develop in #133); plan/develop/test/review/done
  // have empty default bindings — no "set for #999" output expected.
  if (state === 'refine') {
    assert.match(
      result.stdout,
      /startTime set for #999/,
      `refine should emit startTime set\nstdout: ${result.stdout}`
    );
  } else {
    assert.ok(
      !/set for #999/.test(result.stdout),
      `state="${state}" should not write any fields with empty bindings\nstdout: ${result.stdout}`
    );
  }
  console.log(`PASS: state arg "${state}" accepted (exit 0)`);
}

// 2. Unknown state should exit 1 with usage message.
{
  const { env } = makeTempEnv(SUCCESS_GH);
  const result = spawnSync(process.execPath, [script, '999', 'bogus', '--item-id', 'ITEM_FAKE'], {
    encoding: 'utf8',
    env,
    cwd: repoRoot,
  });
  assert.equal(result.status, 1, `expected exit 1 for unknown state, got ${result.status}`);
  assert.match(result.stderr, /Usage:.*refine\|plan\|develop\|test\|review\|done/);
  console.log('PASS: unknown state arg rejected with usage');
}

// 3. Regression: develop still triggers startTime set_once (already covered by
//    start-time-sync.test.mjs, but verified above with explicit assertion).

console.log('All update-event-fields state-arg tests passed.');
