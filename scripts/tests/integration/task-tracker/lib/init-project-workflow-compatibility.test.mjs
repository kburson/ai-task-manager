import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';

const repoRoot = new URL('../../../../..', import.meta.url).pathname;
const script = join(repoRoot, 'scripts/gh/init-project-config.sh');

function createHarness({ mode, createProject = false }) {
  const temp = mkdtempSync(join(projectScratchDir('test'), 'aitm-init-workflows-'));
  const binDir = join(temp, 'bin');
  const targetDir = join(temp, 'target');
  const callLog = join(temp, 'gh-calls.log');
  mkdirSync(binDir);
  mkdirSync(targetDir);

  const ghMock = join(binDir, 'gh');
  writeFileSync(
    ghMock,
    `#!/bin/bash
set -euo pipefail
echo "$*" >> "${callLog}"

if [[ "$1 $2" == "auth status" ]]; then
  echo "github.com"
  echo "  - Token scopes: 'repo', 'project'"
  exit 0
fi

if [[ "$1 $2" == "repo view" ]]; then
  if [[ "$*" == *"--json nameWithOwner"* ]]; then
    echo "kburson/workflow-fixture"
  else
    echo '{}'
  fi
  exit 0
fi

if [[ "$1" == "api" && "$2" == "user" ]]; then
  echo "kburson"
  exit 0
fi

if [[ "$1" == "project" && "$2" == "create" ]]; then
  echo '{"id":"PVT_CREATED","number":9,"title":"workflow-fixture Board"}'
  exit 0
fi

if [[ "$1" == "api" && "$2" == "graphql" ]]; then
  args="$*"
  if [[ "$args" == *"--input"* ]]; then
    cat >/dev/null
    echo "F_CREATED"
    exit 0
  fi
  if [[ "$args" == *"repository(owner:"* && "$args" == *"projectsV2(first: 50)"* ]]; then
    echo '[]'
    exit 0
  fi
  if [[ "$args" == *"organization(login:"* && "$args" == *"projectsV2(first: 50)"* ]]; then
    if [[ "${createProject ? 'true' : 'false'}" == "true" ]]; then
      echo '{"data":{"user":{"projectsV2":{"nodes":[]}},"organization":null}}'
    else
      echo '{"data":{"user":{"projectsV2":{"nodes":[{"id":"PVT_OWNER","title":"Workflow Board","number":2}]}},"organization":null}}'
    fi
    exit 0
  fi
  if [[ "$args" == *"projectV2(number:"* ]]; then
    echo "PVT_CREATED"
    exit 0
  fi
  if [[ "$args" == *"workflows(first: 100"* ]]; then
    if [[ "${mode}" == "query-failure" ]]; then
      echo "workflow query failed" >&2
      exit 1
    fi
    if [[ "${mode}" == "incompatible" || "${mode}" == "new-incompatible" ]]; then
      echo '{"data":{"node":{"workflows":{"nodes":[{"name":"Auto-close issue","number":3,"enabled":true}],"pageInfo":{"hasNextPage":false,"endCursor":"3"}}}}}'
      exit 0
    fi
    if [[ "${mode}" == "disabled" ]]; then
      echo '{"data":{"node":{"workflows":{"nodes":[{"name":"Auto-close issue","number":3,"enabled":false}],"pageInfo":{"hasNextPage":false,"endCursor":"3"}}}}}'
      exit 0
    fi
    if [[ "${mode}" == "empty-cursor" ]]; then
      echo '{"data":{"node":{"workflows":{"nodes":[],"pageInfo":{"hasNextPage":true,"endCursor":""}}}}}'
      exit 0
    fi
    if [[ "$args" == *"cursor=CURSOR_1"* ]]; then
      echo '{"data":{"node":{"workflows":{"nodes":[{"name":"Item reopened","number":9,"enabled":true}],"pageInfo":{"hasNextPage":false,"endCursor":"CURSOR_2"}}}}}'
    else
      echo '{"data":{"node":{"workflows":{"nodes":[{"name":"Item added","number":6,"enabled":true}],"pageInfo":{"hasNextPage":true,"endCursor":"CURSOR_1"}}}}}'
    fi
    exit 0
  fi
  if [[ "$args" == *"repository(owner:"* && "$args" == *" id "* ]]; then
    echo "R_REPO"
    exit 0
  fi
  if [[ "$args" == *"linkProjectV2ToRepository"* ]]; then
    echo '{"data":{"linkProjectV2ToRepository":{"repository":{"nameWithOwner":"kburson/workflow-fixture"}}}}'
    exit 0
  fi
  if [[ "$args" == *".data.node.fields.nodes"* || "$args" == *"fields(first:"* ]]; then
    cat <<'JSON'
[
  {"id":"F_STATUS","name":"Status","options":[
    {"id":"O_BACKLOG","name":"Backlog","color":"GRAY","description":""},
    {"id":"O_REFINE","name":"Refine","color":"GREEN","description":""},
    {"id":"O_READY","name":"Ready for Planning","color":"GRAY","description":""},
    {"id":"O_PLAN","name":"Plan","color":"BLUE","description":""},
    {"id":"O_DEVELOP","name":"Develop","color":"YELLOW","description":""},
    {"id":"O_TEST","name":"Test","color":"ORANGE","description":""},
    {"id":"O_REVIEW","name":"Review","color":"BLUE","description":""},
    {"id":"O_DONE","name":"Done","color":"PURPLE","description":""}
  ]},
  {"id":"F_PRIORITY","name":"Priority","options":[
    {"id":"P0","name":"P0","color":"RED","description":""},
    {"id":"P1","name":"P1","color":"ORANGE","description":""},
    {"id":"P2","name":"P2","color":"BLUE","description":""},
    {"id":"P3","name":"P3","color":"GRAY","description":""}
  ]},
  {"id":"F_SIZE","name":"Size","options":[
    {"id":"XS","name":"XS","color":"BLUE","description":""},
    {"id":"S","name":"S","color":"GREEN","description":""},
    {"id":"M","name":"M","color":"YELLOW","description":""},
    {"id":"L","name":"L","color":"ORANGE","description":""},
    {"id":"XL","name":"XL","color":"RED","description":""}
  ]},
  {"id":"F_ESTIMATE","name":"Estimate","dataType":"NUMBER"},
  {"id":"F_ENGAGED","name":"Engaged","dataType":"TEXT"},
  {"id":"F_SESSION","name":"Session","dataType":"TEXT"},
  {"id":"F_REVIEW","name":"Review","dataType":"TEXT"},
  {"id":"F_PLAN","name":"Plan","dataType":"TEXT"},
  {"id":"F_SEQUENCE","name":"Rank","dataType":"NUMBER"},
  {"id":"F_START_TIME","name":"Started","dataType":"TEXT"}
]
JSON
    exit 0
  fi
  if [[ "$args" == *"updateProjectV2Field"* ]]; then
    echo "F_STATUS"
    exit 0
  fi
  if [[ "$args" == *"createProjectV2Field"* ]]; then
    echo "F_CREATED"
    exit 0
  fi
  echo '{}'
  exit 0
fi

echo "unexpected gh call: $*" >&2
exit 1
`
  );
  chmodSync(ghMock, 0o755);

  const input = Array(32).fill('').join('\n') + '\n';
  const result = spawnSync('bash', [script, '--target', targetDir], {
    input,
    encoding: 'utf8',
    timeout: 20_000,
    env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
  });
  const calls = existsSync(callLog) ? readFileSync(callLog, 'utf8') : '';
  return { result, calls, targetDir };
}

function assertNoPostSelectionMutations({ calls, targetDir }) {
  assert.doesNotMatch(calls, /linkProjectV2ToRepository/);
  assert.doesNotMatch(calls, /createProjectV2Field|updateProjectV2Field/);
  assert.equal(existsSync(join(targetDir, '.ai-task-manager/task-tracker.json')), false);
  assert.equal(existsSync(join(targetDir, '.ai-task-manager/project-fields.json')), false);
  assert.equal(existsSync(join(targetDir, '.ai-task-manager/project-field-events.json')), false);
  assert.equal(existsSync(join(targetDir, '.github/ISSUE_TEMPLATE/task.yml')), false);
  assert.equal(existsSync(join(targetDir, '.github/ISSUE_TEMPLATE/bug.yml')), false);
}

test('queries every workflow page before project linking and local configuration writes', () => {
  const run = createHarness({ mode: 'compatible' });
  assert.equal(run.result.status, 0, `${run.result.stderr}\n${run.result.stdout}`);
  assert.match(run.result.stdout, /Fetching project fields/);

  const firstPage = run.calls.indexOf('workflows(first: 100');
  const secondPage = run.calls.indexOf('cursor=CURSOR_1');
  const link = run.calls.indexOf('linkProjectV2ToRepository');
  assert.ok(firstPage >= 0, 'first workflow page must be queried');
  assert.ok(secondPage > firstPage, 'second workflow page must follow the first');
  assert.ok(link > secondPage, 'project link must follow the complete workflow inventory');
  assert.equal(existsSync(join(run.targetDir, '.ai-task-manager/task-tracker.json')), true);
  assert.equal(existsSync(join(run.targetDir, '.github/ISSUE_TEMPLATE/task.yml')), true);
});

test('enabled incompatible workflows refuse with exact remediation before mutation', () => {
  const run = createHarness({ mode: 'incompatible' });
  assert.notEqual(run.result.status, 0);
  assert.match(`${run.result.stderr}\n${run.result.stdout}`, /Auto-close issue/);
  assert.match(`${run.result.stderr}\n${run.result.stdout}`, /Disable these workflows.*rerun/s);
  assertNoPostSelectionMutations(run);
});

test('disabled incompatible workflows do not block initialization', () => {
  const run = createHarness({ mode: 'disabled' });
  assert.equal(run.result.status, 0, `${run.result.stderr}\n${run.result.stdout}`);
  assert.match(run.result.stdout, /Fetching project fields/);
});

test('workflow query failure refuses because compatibility could not be verified', () => {
  const run = createHarness({ mode: 'query-failure' });
  assert.notEqual(run.result.status, 0);
  assert.match(`${run.result.stderr}\n${run.result.stdout}`, /compatibility could not be verified/i);
  assertNoPostSelectionMutations(run);
});

test('an incomplete pagination cursor refuses before mutation', () => {
  const run = createHarness({ mode: 'empty-cursor' });
  assert.notEqual(run.result.status, 0);
  assert.match(`${run.result.stderr}\n${run.result.stdout}`, /compatibility could not be verified/i);
  assertNoPostSelectionMutations(run);
});

test('a newly created project is inspected before link or template mutation', () => {
  const run = createHarness({ mode: 'new-incompatible', createProject: true });
  assert.notEqual(run.result.status, 0);
  assert.match(run.calls, /project create --owner kburson/);
  assert.match(run.calls, /workflows\(first: 100/);
  assertNoPostSelectionMutations(run);
});
