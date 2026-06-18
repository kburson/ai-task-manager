// @story #309
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import { spawnSync } from 'node:child_process';

const repoRoot = new URL('../../../..', import.meta.url).pathname;
const script = join(repoRoot, 'scripts/gh/init-project-config.sh');
const temp = mkdtempSync(join(projectScratchDir('test'), 'aitm-init-'));
const binDir = join(temp, 'bin');
const targetDir = join(temp, 'target');
spawnSync('mkdir', ['-p', binDir, targetDir], { check: true });

const ghMock = join(binDir, 'gh');
writeFileSync(
  ghMock,
  `#!/bin/bash
set -euo pipefail
echo "$*" >> "${temp}/gh-calls.log"

if [[ "$1 $2" == "auth status" ]]; then
  echo "github.com"
  echo "  - Token scopes: 'repo', 'project'"
  exit 0
fi

if [[ "$1 $2" == "repo view" ]]; then
  if [[ "$*" == *"--json nameWithOwner"* ]]; then
    echo "kburson/ai-task-manager"
  else
    echo "{}"
  fi
  exit 0
fi

if [[ "$1" == "api" && "$2" == "user" ]]; then
  echo "kburson"
  exit 0
fi

if [[ "$1" == "api" && "$2" == "graphql" ]]; then
  args="$*"
  if [[ "$args" == *"--input"* ]]; then
    cat >/dev/null
    echo "F_CREATED"
    exit 0
  fi
  if [[ "$args" == *"repository(owner:"*"projectsV2(first: 50)"* ]]; then
    echo '[{"id":"PVT_LINKED","title":"Linked Board","number":2,"linked":true}]'
    exit 0
  fi
  if [[ "$args" == *"organization(login:"* && "$args" == *"projectsV2(first: 50)"* ]]; then
    echo '{"data":{"user":{"projectsV2":{"nodes":[{"id":"PVT_OWNER","title":"Owner Board","number":5}]}},"organization":null}}'
    exit 0
  fi
  if [[ "$args" == *"projectV2(number:"* ]]; then
    echo '{"id":"PVT_LINKED","title":"Linked Board","number":2}'
    exit 0
  fi
  if [[ "$args" == *"repository(owner:"*" id "* ]]; then
    echo "R_REPO"
    exit 0
  fi
  if [[ "$args" == *"linkProjectV2ToRepository"* ]]; then
    echo '{"data":{"linkProjectV2ToRepository":{"repository":{"nameWithOwner":"kburson/ai-task-manager"}}}}'
    exit 0
  fi
  if [[ "$args" == *".data.node.fields.nodes"* || "$args" == *"fields(first:"* ]]; then
    cat <<'JSON'
[
  {"id":"F_STATUS","name":"Status","options":[
    {"id":"O_BACKLOG","name":"Backlog","color":"GRAY","description":""},
    {"id":"O_READY","name":"Ready","color":"BLUE","description":""},
    {"id":"O_PROGRESS","name":"In Progress","color":"YELLOW","description":""},
    {"id":"O_REVIEW","name":"In Review","color":"ORANGE","description":""},
    {"id":"O_DONE","name":"Done","color":"GREEN","description":""}
  ]},
  {"id":"F_PRIORITY","name":"Priority","options":[
    {"id":"P0","name":"P0","color":"RED","description":""},
    {"id":"P1","name":"P1","color":"ORANGE","description":""},
    {"id":"P2","name":"P2","color":"YELLOW","description":""},
    {"id":"P3","name":"P3","color":"GRAY","description":""}
  ]},
  {"id":"F_SIZE","name":"Size","options":[
    {"id":"S","name":"S","color":"GREEN","description":""},
    {"id":"M","name":"M","color":"BLUE","description":""},
    {"id":"L","name":"L","color":"PURPLE","description":""},
    {"id":"XL","name":"XL","color":"RED","description":""}
  ]},
  {"id":"F_ESTIMATE","name":"Estimate","dataType":"NUMBER"},
  {"id":"F_ENGAGED","name":"Engaged","dataType":"TEXT"},
  {"id":"F_SESSION","name":"Session","dataType":"TEXT"},
  {"id":"F_REVIEW","name":"Review","dataType":"TEXT"},
  {"id":"F_PLAN","name":"Plan","dataType":"TEXT"},
  {"id":"F_SEQUENCE","name":"Rank","dataType":"NUMBER"},
  {"id":"F_START_TIME","name":"Start time","dataType":"TEXT"}
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

const input =
  [
    '', // use detected repo
    '1', // select linked project
    '', // status field default
    '', // estimate field default (auto-matched)
    '', // engaged field default (Engaged text, auto-matched)
    '', // session field default (Session text, auto-matched)
    '', // review field default (Review text, auto-matched)
    '', // plan field default (Plan text, auto-matched)
    '', // rank field default (auto-matched)
    '', // started field default (Start time → Started alias match)
    '', // spare prompt response
    '', // spare prompt response
    '', // spare prompt response
  ].join('\n') + '\n';

const result = spawnSync('bash', [script, '--target', targetDir], {
  input,
  encoding: 'utf8',
  env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
});

assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
assert.match(result.stdout, /Available GitHub Projects:/);
assert.match(result.stdout, /Linked Board/);
assert.match(result.stdout, /Owner Board/);
assert.doesNotMatch(result.stderr, /array .* and object .* cannot be added/);

const config = readFileSync(join(targetDir, '.ai-task-manager/task-tracker.json'), 'utf8');
assert.match(config, /"projectId": "PVT_LINKED"/);
// #404 — config-writer maps the P3 ("Chore") option through to priorityOptionP3.
assert.match(config, /"priorityOptionP3": "P3"/);

const generatedTaskTemplate = readFileSync(
  join(targetDir, '.github/ISSUE_TEMPLATE/task.yml'),
  'utf8'
);
const generatedBugTemplate = readFileSync(
  join(targetDir, '.github/ISSUE_TEMPLATE/bug.yml'),
  'utf8'
);
for (const template of [generatedTaskTemplate, generatedBugTemplate]) {
  assert.match(template, /label: Estimate/);
  assert.match(template, /label: Rank/);
  assert.doesNotMatch(template, /Engaged Time/);
  assert.doesNotMatch(template, /Session Time/);
  assert.doesNotMatch(template, /Context Length/);
}
