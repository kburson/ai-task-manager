import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectScratchDir } from '../lib/scratch-dir.mjs';

const repoRoot = new URL('../../..', import.meta.url).pathname;
const script = join(repoRoot, 'scripts/gh/log-issue-time.mjs');

const TIMING_COMMENT_BODY = `## ⏱ Timing Log

| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |
|---|---|---|---|---|---|---|
| 2026-05-15 09:00 +00:00 | start | — | — | — | — | started |
| 2026-05-15 09:45 +00:00 | end | 45 | — | 100 | 500 | done |
`;

const ISSUE_BODY_NO_START_TIME =
  '<!-- aitm-fields: {"schema":1,"values":{"startTime":null,"engagedTime":null,"sessionTime":null,"reviewTime":null}} -->';

const ITEM_ID = 'PVTI_FAKE';
const PROJECT_ID = 'PVT_FAKE';
const ENGAGED_FIELD = 'F_ENGAGED';
const SESSION_FIELD = 'F_SESSION';
const START_FIELD = 'F_START';

function makeEnv(opts = {}) {
  const temp = mkdtempSync(join(projectScratchDir('test'), 'aitm-log-time-test-'));
  const binDir = join(temp, 'bin');
  const callLog = join(temp, 'gh-calls.log');
  mkdirSync(binDir);

  const ghMock = join(binDir, 'gh');
  writeFileSync(
    ghMock,
    `#!/bin/bash
set -euo pipefail
echo "$*" >> "${callLog}"

if [[ "$1 $2" == "issue view" && "$*" == *"comments"* ]]; then
  cat <<'JSON'
{"comments":[{"body":"## ⏱ Timing Log\\n\\n| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |\\n|---|---|---|---|---|---|---|\\n| 2026-05-15 09:00 +00:00 | start | — | — | — | — | started |\\n| 2026-05-15 09:45 +00:00 | end | 45 | — | 100 | 500 | done |\\n"}]}
JSON
  exit 0
fi

if [[ "$1 $2" == "issue view" && "$*" == *"body"* ]]; then
  echo '{"body":"<!-- aitm-fields: {\\"schema\\":1,\\"values\\":{\\"startTime\\":null,\\"engagedTime\\":null,\\"sessionTime\\":null,\\"reviewTime\\":null}} -->"}'
  exit 0
fi

if [[ "$1 $2" == "issue edit" ]]; then
  exit 0
fi

if [[ "$1" == "api" && "$2" == "graphql" ]]; then
  # Read stdin to determine which query this is
  input=$(cat)
  if [[ "$input" == *"projectItems"* ]]; then
    cat <<'JSON'
{"data":{"repository":{"issue":{"projectItems":{"nodes":[{"id":"PVTI_FAKE","project":{"id":"PVT_FAKE"}}]}}},"node":{"fields":{"nodes":[{"id":"F_ENGAGED","name":"Engaged Time"},{"id":"F_SESSION","name":"Session Time"},{"id":"F_START","name":"Start time"}]}}}}
JSON
    exit 0
  fi
  # writeProjectFieldValue and other mutations
  echo '{"data":{}}'
  exit 0
fi

exit 0
`
  );
  chmodSync(ghMock, 0o755);

  const aitm = join(temp, '.ai-task-manager');
  mkdirSync(aitm);
  writeFileSync(
    join(aitm, 'task-tracker.json'),
    JSON.stringify({
      repo: 'owner/repo',
      projectId: PROJECT_ID,
      fieldStartTime: START_FIELD,
      fieldIds: { startTime: START_FIELD },
    })
  );

  const env = { ...process.env, PATH: `${binDir}:${process.env.PATH}` };
  return { temp, callLog, env };
}

// 1. --dry-run shows startTime from earliest timing row without writing
{
  const { env } = makeEnv();
  const result = spawnSync(process.execPath, [script, '999', '--dry-run'], {
    encoding: 'utf8',
    env,
    cwd: repoRoot,
  });

  assert.equal(result.status, 0, `dry-run failed\n${result.stderr}`);
  assert.match(result.stdout, /Start Time.*2026-05-15 09:00/, 'dry-run shows start timestamp');
  assert.match(result.stdout, /Dry run — no writes performed/);
  console.log('PASS: dry-run shows repaired startTime from earliest timing row');
}

// 2. Live run writes startTime to the board when missing
{
  const { callLog, env } = makeEnv();
  const result = spawnSync(process.execPath, [script, '999'], {
    encoding: 'utf8',
    env,
    cwd: repoRoot,
  });

  assert.equal(result.status, 0, `live run failed\n${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /Start Time \(repaired\).*2026-05-15 09:00/);
  assert.match(result.stdout, /Fields updated/);

  const calls = readFileSync(callLog, 'utf8');
  assert.ok(
    calls.includes('api graphql'),
    `should have called gh api graphql for field writes\n${calls}`
  );
  console.log('PASS: live run repairs missing startTime from earliest timing row');
}

// 3. No repair when startTime already set in issue body DB
{
  const temp2 = mkdtempSync(join(projectScratchDir('test'), 'aitm-log-time-noop-'));
  const binDir2 = join(temp2, 'bin');
  const callLog2 = join(temp2, 'gh-calls.log');
  mkdirSync(binDir2);

  const ghMock2 = join(binDir2, 'gh');
  writeFileSync(
    ghMock2,
    `#!/bin/bash
set -euo pipefail
echo "$*" >> "${callLog2}"

if [[ "$1 $2" == "issue view" && "$*" == *"comments"* ]]; then
  cat <<'JSON'
{"comments":[{"body":"## ⏱ Timing Log\\n\\n| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |\\n|---|---|---|---|---|---|---|\\n| 2026-05-15 09:00 +00:00 | start | — | — | — | — | started |\\n| 2026-05-15 09:45 +00:00 | end | 45 | — | 100 | 500 | done |\\n"}]}
JSON
  exit 0
fi
if [[ "$1 $2" == "issue view" && "$*" == *"body"* ]]; then
  echo '{"body":"<!-- aitm-fields: {\\"schema\\":1,\\"values\\":{\\"startTime\\":\\"2026-05-01 08:00 +00:00\\",\\"engagedTime\\":null,\\"sessionTime\\":null,\\"reviewTime\\":null}} -->"}'
  exit 0
fi
if [[ "$1 $2" == "issue edit" ]]; then exit 0; fi
if [[ "$1" == "api" && "$2" == "graphql" ]]; then
  input=$(cat)
  if [[ "$input" == *"projectItems"* ]]; then
    echo '{"data":{"repository":{"issue":{"projectItems":{"nodes":[{"id":"PVTI_FAKE","project":{"id":"PVT_FAKE"}}]}}},"node":{"fields":{"nodes":[{"id":"F_SESSION","name":"Session Time"},{"id":"F_START","name":"Start time"}]}}}}'
    exit 0
  fi
  echo '{"data":{}}'
  exit 0
fi
exit 0
`
  );
  chmodSync(ghMock2, 0o755);

  const aitm2 = join(temp2, '.ai-task-manager');
  mkdirSync(aitm2);
  writeFileSync(
    join(aitm2, 'task-tracker.json'),
    JSON.stringify({
      repo: 'owner/repo',
      projectId: PROJECT_ID,
      fieldStartTime: START_FIELD,
      fieldIds: { startTime: START_FIELD },
    })
  );

  const result = spawnSync(process.execPath, [script, '999'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${binDir2}:${process.env.PATH}` },
    cwd: repoRoot,
  });

  assert.equal(result.status, 0, `noop run failed\n${result.stderr}`);
  assert.ok(
    !result.stdout.includes('Start Time (repaired)'),
    'should NOT repair when startTime already set'
  );
  console.log('PASS: no repair when startTime already present in issue body DB');
}

console.log('All log-issue-time tests passed.');
