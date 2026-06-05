import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectScratchDir } from '../lib/scratch-dir.mjs';

const repoRoot = new URL('../../..', import.meta.url).pathname;
const script = join(repoRoot, 'scripts/gh/update-event-fields.mjs');

function makeTempEnv(ghScript) {
  const temp = mkdtempSync(join(projectScratchDir('test'), 'aitm-start-time-sync-'));
  const binDir = join(temp, 'bin');
  mkdirSync(binDir);

  const ghMock = join(binDir, 'gh');
  writeFileSync(ghMock, ghScript);
  chmodSync(ghMock, 0o755);

  // Minimal config that update-event-fields.mjs needs
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

// 1. update-event-fields.mjs exits 1 when the project-field write fails
{
  const { env } = makeTempEnv(`#!/bin/bash
set -euo pipefail
# Fail on any GraphQL call (simulates a GH API error during field write)
if [[ "$1" == "api" && "$2" == "graphql" ]]; then
  echo "GraphQL request failed: service unavailable" >&2
  exit 1
fi
# issue view --json body returns a body with no startTime
if [[ "$1 $2" == "issue view" ]]; then
  echo '{"body":"<!-- aitm-fields: {\\"schema\\":1,\\"values\\":{\\"startTime\\":null}} -->"}'
  exit 0
fi
exit 0
`);

  const result = spawnSync(process.execPath, [script, '999', 'refine', '--item-id', 'ITEM_FAKE'], {
    encoding: 'utf8',
    env,
    cwd: repoRoot,
  });

  assert.equal(result.status, 1, `expected exit 1 but got ${result.status}\n${result.stderr}`);
  assert.match(
    result.stderr,
    /event field update failed/,
    `stderr should contain "event field update failed"\n${result.stderr}`
  );
  console.log('PASS: update-event-fields exits 1 on field-write failure');
}

// 2. update-event-fields.mjs exits 0 when all writes succeed
{
  const { env } = makeTempEnv(`#!/bin/bash
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
`);

  const result = spawnSync(process.execPath, [script, '999', 'refine', '--item-id', 'ITEM_FAKE'], {
    encoding: 'utf8',
    env,
    cwd: repoRoot,
  });

  assert.equal(result.status, 0, `expected exit 0 but got ${result.status}\n${result.stderr}`);
  assert.match(result.stdout, /startTime set for #999/);
  console.log('PASS: update-event-fields exits 0 on success');
}

// 3. set_once guard: if startTime is already in the issue body DB, skip the write
{
  const { env } = makeTempEnv(`#!/bin/bash
set -euo pipefail
if [[ "$1 $2" == "issue view" ]]; then
  echo '{"body":"<!-- aitm-fields: {\\"schema\\":1,\\"values\\":{\\"startTime\\":\\"2026-01-01 09:00 +00:00\\"}} -->"}'
  exit 0
fi
# Should never be called for a GraphQL write
if [[ "$1" == "api" && "$2" == "graphql" ]]; then
  echo "unexpected graphql call" >&2
  exit 1
fi
exit 0
`);

  const result = spawnSync(process.execPath, [script, '999', 'refine', '--item-id', 'ITEM_FAKE'], {
    encoding: 'utf8',
    env,
    cwd: repoRoot,
  });

  assert.equal(result.status, 0, `expected exit 0 but got ${result.status}\n${result.stderr}`);
  assert.ok(
    !result.stdout.includes('startTime set'),
    `set_once should skip write when value already present\n${result.stdout}`
  );
  console.log('PASS: set_once guard skips write when startTime already set');
}

// 4. refine binding fires on backlog→refine transition (#133)
{
  const { env } = makeTempEnv(`#!/bin/bash
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
`);

  const result = spawnSync(process.execPath, [script, '999', 'refine', '--item-id', 'ITEM_FAKE'], {
    encoding: 'utf8',
    env,
    cwd: repoRoot,
  });

  assert.equal(result.status, 0, `expected exit 0 but got ${result.status}\n${result.stderr}`);
  assert.match(result.stdout, /startTime set for #999/);
  console.log('PASS: refine binding fires on backlog→refine');
}

// 5. develop transition no longer triggers startTime write (binding moved to refine)
{
  const { env } = makeTempEnv(`#!/bin/bash
set -euo pipefail
if [[ "$1 $2" == "issue view" ]]; then
  echo '{"body":"<!-- aitm-fields: {\\"schema\\":1,\\"values\\":{\\"startTime\\":null}} -->"}'
  exit 0
fi
if [[ "$1" == "api" && "$2" == "graphql" ]]; then
  echo "unexpected graphql call" >&2
  exit 1
fi
exit 0
`);

  const result = spawnSync(process.execPath, [script, '999', 'develop', '--item-id', 'ITEM_FAKE'], {
    encoding: 'utf8',
    env,
    cwd: repoRoot,
  });

  assert.equal(result.status, 0, `expected exit 0 but got ${result.status}\n${result.stderr}`);
  assert.ok(
    !result.stdout.includes('startTime set'),
    `develop should not trigger startTime write\n${result.stdout}`
  );
  console.log('PASS: develop binding is empty — no startTime write');
}

console.log('All start-time-sync tests passed.');
