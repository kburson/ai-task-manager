import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = new URL('../../..', import.meta.url).pathname;
const script = join(repoRoot, 'scripts/gh/init-project-config.sh');
const temp = mkdtempSync('/private/tmp/aitm-init-create-');
const binDir = join(temp, 'bin');
const targetDir = join(temp, 'target');
mkdirSync(binDir);
mkdirSync(targetDir);

const ghMock = join(binDir, 'gh');
writeFileSync(ghMock, `#!/bin/bash
set -euo pipefail
echo "$*" >> "${temp}/gh-calls.log"

if [[ "$1 $2" == "auth status" ]]; then
  echo "github.com"
  echo "  - Token scopes: 'repo', 'project'"
  exit 0
fi

if [[ "$1 $2" == "repo view" ]]; then
  if [[ "$*" == *"--json nameWithOwner"* ]]; then
    echo "kburson/new-repo"
  else
    echo "{}"
  fi
  exit 0
fi

if [[ "$1" == "api" && "$2" == "user" ]]; then
  echo "kburson"
  exit 0
fi

if [[ "$1" == "project" && "$2" == "create" ]]; then
  echo '{"id":"PVT_CREATED","number":9,"title":"New Repo Board"}'
  exit 0
fi

if [[ "$1" == "api" && "$2" == "graphql" ]]; then
  args="$*"
  if [[ "$args" == *"--input"* ]]; then
    cat >/dev/null
    echo "F_CREATED"
    exit 0
  fi
  if [[ "$args" == *"projectsV2(first: 50)"* ]]; then
    echo '[]'
    exit 0
  fi
  if [[ "$args" == *"projectV2(number:"* ]]; then
    echo "PVT_CREATED"
    exit 0
  fi
  if [[ "$args" == *"repository(owner:"*" id "* ]]; then
    echo "R_REPO"
    exit 0
  fi
  if [[ "$args" == *"linkProjectV2ToRepository"* ]]; then
    echo '{"data":{"linkProjectV2ToRepository":{"repository":{"nameWithOwner":"kburson/new-repo"}}}}'
    exit 0
  fi
  if [[ "$args" == *"createProjectV2Field"* ]]; then
    echo "F_CREATED"
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
    {"id":"P2","name":"P2","color":"YELLOW","description":""}
  ]},
  {"id":"F_SIZE","name":"Size","options":[
    {"id":"XS","name":"XS","color":"BLUE","description":""},
    {"id":"S","name":"S","color":"GREEN","description":""},
    {"id":"M","name":"M","color":"YELLOW","description":""},
    {"id":"L","name":"L","color":"ORANGE","description":""},
    {"id":"XL","name":"XL","color":"RED","description":""}
  ]},
  {"id":"F_ESTIMATE","name":"Estimate","dataType":"NUMBER"},
  {"id":"F_ACTUAL","name":"Actual Hours","dataType":"NUMBER"},
  {"id":"F_SESSION","name":"Actual Session Time","dataType":"NUMBER"},
  {"id":"F_CONTEXT","name":"Context Length","dataType":"NUMBER"},
  {"id":"F_SEQUENCE","name":"Sequence","dataType":"NUMBER"},
  {"id":"F_START","name":"Start date","dataType":"DATE"},
  {"id":"F_END","name":"End date","dataType":"DATE"}
]
JSON
    exit 0
  fi
  if [[ "$args" == *"updateProjectV2Field"* ]]; then
    echo "F_STATUS"
    exit 0
  fi
  echo '{}'
  exit 0
fi

echo "unexpected gh call: $*" >&2
exit 1
`);
chmodSync(ghMock, 0o755);

const input = [
  '', // use detected repo
  '', // default to new project
  '', // default title
  '', // default Feature Release template
  '', // status field default
  '', // R4R missing — accept default [new] to create it
  '', // spare prompt response
  '', // spare prompt response
  '', // spare prompt response
  '', // spare prompt response
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
assert.match(result.stdout, /No GitHub Projects linked to kburson\/new-repo/);
assert.match(result.stdout, /Feature Release \(recommended\)/);
assert.match(result.stdout, /Applying feature-release project workflow/);
assert.match(result.stdout, /Created project #9/);

const calls = readFileSync(join(temp, 'gh-calls.log'), 'utf8');
assert.match(calls, /project create --owner kburson --title new-repo Board --format json/);

const config = readFileSync(join(targetDir, '.ai-task-manager/task-tracker.json'), 'utf8');
assert.match(config, /"projectId": "PVT_CREATED"/);
