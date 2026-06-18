// @story #309
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';

const repoRoot = new URL('../../../..', import.meta.url).pathname;
const script = join(repoRoot, 'scripts/gh/init-project-config.sh');
const temp = mkdtempSync(join(projectScratchDir('test'), 'aitm-init-create-'));
const binDir = join(temp, 'bin');
const targetDir = join(temp, 'target');
mkdirSync(binDir);
mkdirSync(targetDir);

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
    cat >> "${temp}/gh-input.log"
    printf '\n===PAYLOAD-BOUNDARY===\n' >> "${temp}/gh-input.log"
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
  {"id":"F_ESTIMATE","name":"Estimate","dataType":"NUMBER"},
  {"id":"F_SEQUENCE","name":"Sequence","dataType":"NUMBER"}
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
`
);
chmodSync(ghMock, 0o755);

// Every interactive prompt accepts its default on an empty line (detected repo,
// new project, default title, Feature Release template, and "[new]" create
// choices for fields not present on the mock board). Supply a generous margin
// of empty lines so the run never runs short regardless of how many missing
// fields the config loop creates; extra lines are harmless.
const input = Array(24).fill('').join('\n') + '\n';

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

// ── #233 AC6: assert the rendered field set ────────────────────────────────
// Single-select create payloads (sent via `gh api graphql --input -`) are
// captured verbatim. jq pretty-prints the payload, so allow whitespace between
// JSON tokens while keeping the literal spaces inside each description value.
const inputLog = readFileSync(join(temp, 'gh-input.log'), 'utf8');
const optionMatch = (name, color, description) =>
  new RegExp(
    `"name":\\s*"${name}"[\\s\\S]*?"color":\\s*"${color}"[\\s\\S]*?"description":\\s*"${description}"`
  );

// AC2/AC6: Priority and Size are created as single-select with every option
// carrying both a color and a non-empty description sourced from
// config/project-fields.default.json.
assert.match(inputLog, /"name":\s*"Priority"/, 'Priority single-select not created');
assert.match(inputLog, optionMatch('P0', 'RED', 'Critical - blocking'));
assert.match(inputLog, optionMatch('P1', 'ORANGE', 'High - this sprint'));
assert.match(inputLog, optionMatch('P2', 'BLUE', 'Normal - backlog'));
assert.match(inputLog, /"name":\s*"Size"/, 'Size single-select not created');
assert.match(inputLog, optionMatch('XS', 'BLUE', '1-2 hours'));
assert.match(inputLog, optionMatch('XL', 'RED', '24\\+ hours'));

// AC3/AC4: timing fields and the start-time field are created as TEXT, by their
// canonical names, and NO DATE or NUMBER field is ever created (the config loop
// owns the schema; estimate/sequence map to the existing NUMBER fields).
for (const name of ['Engaged', 'Session', 'Review', 'Plan', 'Started', 'Blocked By']) {
  assert.match(
    calls,
    new RegExp(`dataType:TEXT[\\s\\S]*?name=${name}\\b`),
    `${name} not created as TEXT`
  );
}
assert.doesNotMatch(calls, /dataType:DATE/, 'installer must not create any DATE field');
assert.doesNotMatch(calls, /dataType:NUMBER/, 'installer must not create any NUMBER field');
// AC1: the legacy apply_project_template "End date" field is gone for good.
assert.doesNotMatch(calls, /End date/, 'legacy End date field must not be created');
