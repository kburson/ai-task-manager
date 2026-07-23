// @story #415
// #415 — guards the canonical Status palette in scripts/gh/init-project-config.sh.
//
// Two layers:
//   1. Static: the script's single canonical palette constant must equal the
//      verified-live mapping, and the former drift sites must no longer carry
//      their own hardcoded colors. This fails if anyone re-introduces a second
//      divergent palette.
//   2. Behavioral: run the installer against a board that mirrors the broken
//      real-world install case (default "Todo"/"In Progress" names + wrong stage
//      colors) and assert the emitted updateProjectV2Field payload renames and
//      recolors every managed option to canonical values WHILE preserving each
//      matched option's id (so items in those columns are not orphaned).

import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import { spawnSync } from 'node:child_process';

const repoRoot = new URL('../../../../..', import.meta.url).pathname;
const script = join(repoRoot, 'scripts/gh/init-project-config.sh');
const scriptSrc = readFileSync(script, 'utf8');

const EXPECTED = [
  { name: 'Backlog', color: 'GRAY' },
  { name: 'On Deck', color: 'GRAY' },
  { name: 'Refine', color: 'GREEN' },
  { name: 'Plan', color: 'BLUE' },
  { name: 'Develop', color: 'YELLOW' },
  { name: 'Test', color: 'ORANGE' },
  { name: 'Review', color: 'BLUE' },
  { name: 'Done', color: 'PURPLE' },
];

// ── Layer 1: static palette + no-drift ────────────────────────────────────
{
  const m = scriptSrc.match(/CANONICAL_STATUS_PALETTE='(\[[\s\S]*?\])'/);
  assert.ok(m, 'CANONICAL_STATUS_PALETTE constant not found in script');
  const palette = JSON.parse(m[1]);
  assert.deepEqual(
    palette.map(({ name, color }) => ({ name, color })),
    EXPECTED,
    'canonical palette name+color mapping diverged from the verified-live board'
  );

  // The existing-field create path must derive colors from the canonical source,
  // not carry its own hardcoded color literals (the #415 drift bug).
  assert.doesNotMatch(
    scriptSrc,
    /STATES_TO_CREATE\+=\("(?:Backlog|On Deck|Refine|Plan|Develop|Test|Review|Done):[A-Z]+"\)/,
    'STATES_TO_CREATE still hardcodes colors — it must use canon_color so it cannot drift'
  );
  assert.match(
    scriptSrc,
    /STATES_TO_CREATE\+=\("Refine:\$\(canon_color Refine\)"\)/,
    'STATES_TO_CREATE should source colors from canon_color (single palette)'
  );
  // The fresh-field path must feed the canonical constant, not a second literal.
  assert.match(
    scriptSrc,
    /create_project_field_if_missing "Status" "SINGLE_SELECT" "\$CANONICAL_STATUS_PALETTE"/,
    'fresh-field path should pass CANONICAL_STATUS_PALETTE'
  );
}

// ── Layer 2: behavioral rename + recolor with id preservation ─────────────
const temp = mkdtempSync(join(projectScratchDir('test'), 'aitm-palette-'));
const binDir = join(temp, 'bin');
const targetDir = join(temp, 'target');
const inputsDir = join(temp, 'inputs');
spawnSync('mkdir', ['-p', binDir, targetDir, inputsDir], { check: true });

// Board mirroring the broken real-world install: all 8 columns already
// exist (so STATES_TO_CREATE is empty and no refetch is needed), but with the
// GitHub default names "Todo"/"In Progress" and pre-fix wrong colors (incl.
// "On Deck" carrying a wrong BLUE so normalization must recolor it to GRAY).
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
    body="$(cat)"
    n=$(ls "${inputsDir}" | wc -l | tr -d ' ')
    printf '%s' "$body" > "${inputsDir}/\${n}.json"
    if [[ "$body" == *"updateProjectV2Field"* ]]; then
      echo "F_STATUS"
    else
      echo "F_CREATED"
    fi
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
    {"id":"O_ON_DECK","name":"On Deck","color":"BLUE","description":""},
    {"id":"O_TODO","name":"Todo","color":"GREEN","description":""},
    {"id":"O_PLAN","name":"Plan","color":"PURPLE","description":""},
    {"id":"O_PROGRESS","name":"In Progress","color":"YELLOW","description":""},
    {"id":"O_TEST","name":"Test","color":"ORANGE","description":""},
    {"id":"O_REVIEW","name":"Review","color":"PURPLE","description":""},
    {"id":"O_DONE","name":"Done","color":"PURPLE","description":""}
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
    '', // estimate field default
    '', // engaged field default
    '', // session field default
    '', // review field default
    '', // plan field default
    '', // rank field default
    '', // started field default
    '',
    '',
    '',
  ].join('\n') + '\n';

const result = spawnSync('bash', [script, '--target', targetDir], {
  input,
  encoding: 'utf8',
  env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
});

assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);

// Find the normalize payload among captured --input bodies.
const payloads = readdirSync(inputsDir)
  .map((f) => JSON.parse(readFileSync(join(inputsDir, f), 'utf8')))
  .filter((p) => typeof p.query === 'string' && p.query.includes('updateProjectV2Field'));
assert.ok(payloads.length > 0, 'no updateProjectV2Field mutation was emitted');

const opts = payloads[payloads.length - 1].variables.opts;

// First 8 (managed) options, in canonical order, with canonical name + color.
assert.deepEqual(
  opts.slice(0, 8).map(({ name, color }) => ({ name, color })),
  EXPECTED,
  'normalize payload did not rewrite managed options to the canonical palette'
);

// id-preservation: the default "Todo"/"In Progress" options were renamed in
// place (their original ids reused), not deleted and recreated.
const byName = Object.fromEntries(opts.map((o) => [o.name, o]));
assert.equal(byName.Refine.id, 'O_TODO', 'Refine must reuse the matched "Todo" option id');
assert.equal(
  byName.Develop.id,
  'O_PROGRESS',
  'Develop must reuse the matched "In Progress" option id'
);
assert.equal(
  byName['On Deck'].id,
  'O_ON_DECK',
  'On Deck must reuse the matched "On Deck" option id (recolored in place, not recreated)'
);
// Every managed option carries an id (in-place edit, never create).
for (const o of opts.slice(0, 8)) {
  assert.ok(o.id && o.id.length > 0, `managed option ${o.name} must carry an id`);
}

console.log('init-status-palette: OK');
