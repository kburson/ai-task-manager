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
  { name: 'Assigned', color: 'GRAY' },
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
    /STATES_TO_CREATE\+=\("(?:Backlog|Assigned|Refine|Plan|Develop|Test|Review|Done):[A-Z]+"\)/,
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
// "Assigned" carrying a wrong BLUE so normalization must recolor it to GRAY).
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
      if [[ "$AITM_TEST_ASSIGNED_SHAPE" == "missing" ]]; then
        touch "${temp}/assigned-created"
      fi
      echo "F_STATUS"
    else
      echo "F_CREATED"
    fi
    exit 0
  fi
  if [[ "$args" == *"repository(owner:"*"projectsV2(first: 50)"* ]]; then
    if [[ "\${AITM_TEST_PROJECT_MODE:-linked}" == "unlinked-selection" ]]; then
      echo '[]'
    else
      echo '[{"id":"PVT_LINKED","title":"Linked Board","number":2,"linked":true}]'
    fi
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
    ASSIGNED_OPTIONS='    {"id":"O_ASSIGNED","name":"Assigned","color":"BLUE","description":""},'
    if [[ "$AITM_TEST_ASSIGNED_SHAPE" == "legacy" ]]; then
      ASSIGNED_OPTIONS='    {"id":"O_ASSIGNED","name":"On Deck","color":"BLUE","description":""},'
    elif [[ "$AITM_TEST_ASSIGNED_SHAPE" == "both" ]]; then
      ASSIGNED_OPTIONS='    {"id":"O_ASSIGNED","name":"On Deck","color":"BLUE","description":""},
    {"id":"O_ASSIGNED_DUP","name":"Assigned","color":"GRAY","description":""},'
    elif [[ "$AITM_TEST_ASSIGNED_SHAPE" == "duplicate-legacy" ]]; then
      ASSIGNED_OPTIONS='    {"id":"O_ASSIGNED","name":"On Deck","color":"BLUE","description":""},
    {"id":"O_ASSIGNED_DUP","name":"On Deck","color":"GRAY","description":""},'
    elif [[ "$AITM_TEST_ASSIGNED_SHAPE" == "duplicate-canonical" ]]; then
      ASSIGNED_OPTIONS='    {"id":"O_ASSIGNED","name":"Assigned","color":"BLUE","description":""},
    {"id":"O_ASSIGNED_DUP","name":"Assigned","color":"GRAY","description":""},'
    elif [[ "$AITM_TEST_ASSIGNED_SHAPE" == "missing" && ! -f "${temp}/assigned-created" ]]; then
      ASSIGNED_OPTIONS=''
    fi
    cat <<JSON
[
  {"id":"F_STATUS","name":"Status","options":[
    {"id":"O_BACKLOG","name":"Backlog","color":"GRAY","description":""},
\$ASSIGNED_OPTIONS
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

const input = ['', '1', '', ...Array(24).fill('')].join('\n') + '\n';

const result = spawnSync('bash', [script, '--target', targetDir], {
  input,
  encoding: 'utf8',
  env: {
    ...process.env,
    AITM_TEST_ASSIGNED_SHAPE: 'canonical',
    PATH: `${binDir}:${process.env.PATH}`,
  },
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
  byName['Assigned'].id,
  'O_ASSIGNED',
  'Assigned must reuse the matched "Assigned" option id (recolored in place, not recreated)'
);
// Every managed option carries an id (in-place edit, never create).
for (const o of opts.slice(0, 8)) {
  assert.ok(o.id && o.id.length > 0, `managed option ${o.name} must carry an id`);
}

function updatePayloads() {
  return readdirSync(inputsDir)
    .map((f) => JSON.parse(readFileSync(join(inputsDir, f), 'utf8')))
    .filter((p) => typeof p.query === 'string' && p.query.includes('updateProjectV2Field'));
}

function projectMutationPayloads() {
  return readdirSync(inputsDir)
    .map((f) => JSON.parse(readFileSync(join(inputsDir, f), 'utf8')))
    .filter((p) => typeof p.query === 'string' && /^\s*mutation\b/.test(p.query));
}

function projectMutationCount() {
  const inlineMutations = readFileSync(join(temp, 'gh-calls.log'), 'utf8')
    .split('\n')
    .filter((line) => /\bmutation\(/.test(line)).length;
  return projectMutationPayloads().length + inlineMutations;
}

function ghCallLines() {
  return readFileSync(join(temp, 'gh-calls.log'), 'utf8').split('\n');
}

function runAssignedShape(
  shape,
  { conflictingConfig = false, explicitProject = false, projectMode = 'linked', label = shape } = {}
) {
  const runTarget = join(temp, `target-${label}`);
  spawnSync('mkdir', ['-p', runTarget], { check: true });
  if (conflictingConfig) {
    const configDir = join(runTarget, '.ai-task-manager');
    spawnSync('mkdir', ['-p', configDir], { check: true });
    writeFileSync(
      join(configDir, 'task-tracker.json'),
      JSON.stringify({
        kanbanOptionOnDeck: 'O_LEGACY_CONFIG',
        kanbanOptionAssigned: 'O_CANONICAL_CONFIG',
      })
    );
  }
  const args = [script, '--target', runTarget];
  if (explicitProject) args.push('--project', 'kburson:5');
  const run = spawnSync('bash', args, {
    input: explicitProject ? ['', '', ...Array(24).fill('')].join('\n') + '\n' : input,
    encoding: 'utf8',
    env: {
      ...process.env,
      AITM_TEST_ASSIGNED_SHAPE: shape,
      AITM_TEST_PROJECT_MODE: projectMode,
      PATH: `${binDir}:${process.env.PATH}`,
    },
  });
  return { ...run, target: runTarget };
}

// A board with neither spelling may create Assigned normally.  The first
// Status mutation includes the new option without an id; the mock then exposes
// its created id on the script's refetch so init can finish normally.
const missingResult = runAssignedShape('missing');
assert.equal(missingResult.status, 0, `${missingResult.stderr}\n${missingResult.stdout}`);
assert.ok(
  updatePayloads().some(({ variables }) =>
    variables.opts.some(({ id, name }) => name === 'Assigned' && id == null)
  ),
  'a fresh board should create the canonical Assigned option'
);

// An unambiguous legacy board may finish config authoring with the stable old
// option id, but it may not rename the board.  Palette normalization stays off
// and the operator receives package-resolved dry-run/apply commands.
const beforeLegacy = updatePayloads().length;
const legacy = runAssignedShape('legacy');
assert.equal(legacy.status, 0, `${legacy.stderr}\n${legacy.stdout}`);
assert.match(legacy.stdout + legacy.stderr, /rename-on-deck-to-assigned\.mjs.*--apply/);
assert.equal(
  updatePayloads().length,
  beforeLegacy,
  'legacy-only board must emit zero updateProjectV2Field mutations'
);
const legacyConfig = JSON.parse(
  readFileSync(join(legacy.target, '.ai-task-manager/task-tracker.json'), 'utf8')
);
assert.equal(legacyConfig.kanbanOptionAssigned, 'O_ASSIGNED');
assert.ok(!('kanbanOptionOnDeck' in legacyConfig));

// Both spellings are ambiguous even to the explicit migration, so init fails
// closed before mutation and tells the operator to resolve the duplicate first.
const beforeBoth = updatePayloads().length;
const both = runAssignedShape('both');
assert.notEqual(both.status, 0, 'both-spellings board should fail closed');
assert.match(both.stdout + both.stderr, /both 'On Deck' and 'Assigned'/);
assert.match(both.stdout + both.stderr, /resolve the ambiguous duplicate/i);
assert.match(both.stdout + both.stderr, /rename-on-deck-to-assigned\.mjs/);
assert.equal(
  updatePayloads().length,
  beforeBoth,
  'both-spellings board must emit zero updateProjectV2Field mutations'
);

// Final-review regressions: every ambiguous input must fail before choosing an
// option id or issuing a project mutation. A selector lets the TDD RED phase
// execute each shell-level contract independently even when all three fail.
const reviewCase = process.env.AITM_REVIEW_CASE || '';

if (!reviewCase || reviewCase === 'duplicate-legacy') {
  const before = projectMutationCount();
  const duplicateLegacy = runAssignedShape('duplicate-legacy');
  assert.notEqual(duplicateLegacy.status, 0, 'duplicate On Deck options should fail closed');
  assert.match(duplicateLegacy.stdout + duplicateLegacy.stderr, /duplicate.*On Deck/i);
  assert.equal(
    projectMutationCount(),
    before,
    'duplicate On Deck options must emit zero project mutations'
  );
}

if (!reviewCase || reviewCase === 'duplicate-canonical') {
  const before = projectMutationCount();
  const duplicateCanonical = runAssignedShape('duplicate-canonical');
  assert.notEqual(duplicateCanonical.status, 0, 'duplicate Assigned options should fail closed');
  assert.match(duplicateCanonical.stdout + duplicateCanonical.stderr, /duplicate.*Assigned/i);
  assert.equal(
    projectMutationCount(),
    before,
    'duplicate Assigned options must emit zero project mutations'
  );
}

if (!reviewCase || reviewCase === 'conflicting-config') {
  const before = projectMutationCount();
  const conflictingConfig = runAssignedShape('conflicting-config', { conflictingConfig: true });
  assert.notEqual(conflictingConfig.status, 0, 'conflicting config ids should fail closed');
  assert.match(
    conflictingConfig.stdout + conflictingConfig.stderr,
    /kanbanOptionOnDeck conflicts with kanbanOptionAssigned/i
  );
  assert.equal(
    projectMutationCount(),
    before,
    'conflicting config ids must emit zero project mutations'
  );
}

// Second-pass review regressions exercise the real existing-project selection
// branches. Link mutations must remain deferred until the selected Status
// field has passed ambiguity validation.
const secondPassCase = process.env.AITM_SECOND_PASS_CASE || '';

if (!secondPassCase || secondPassCase === 'explicit-duplicate-legacy') {
  const before = projectMutationCount();
  const duplicateLegacy = runAssignedShape('duplicate-legacy', {
    explicitProject: true,
    label: 'explicit-duplicate-legacy',
  });
  assert.notEqual(duplicateLegacy.status, 0, 'explicit duplicate On Deck should fail closed');
  assert.match(duplicateLegacy.stdout + duplicateLegacy.stderr, /duplicate.*On Deck/i);
  assert.equal(
    projectMutationCount(),
    before,
    'explicit duplicate On Deck must refuse before every project mutation'
  );
}

if (!secondPassCase || secondPassCase === 'unlinked-duplicate-canonical') {
  const before = projectMutationCount();
  const duplicateCanonical = runAssignedShape('duplicate-canonical', {
    projectMode: 'unlinked-selection',
    label: 'unlinked-duplicate-canonical',
  });
  assert.notEqual(duplicateCanonical.status, 0, 'unlinked duplicate Assigned should fail closed');
  assert.match(duplicateCanonical.stdout + duplicateCanonical.stderr, /duplicate.*Assigned/i);
  assert.equal(
    projectMutationCount(),
    before,
    'unlinked duplicate Assigned must refuse before every project mutation'
  );
}

if (!secondPassCase || secondPassCase === 'explicit-canonical-link-order') {
  const beforeLines = ghCallLines().length;
  const canonical = runAssignedShape('canonical', {
    explicitProject: true,
    label: 'explicit-canonical-link-order',
  });
  assert.equal(canonical.status, 0, `${canonical.stderr}\n${canonical.stdout}`);
  const calls = ghCallLines().slice(beforeLines);
  const linkIndexes = calls
    .map((line, index) => (line.includes('linkProjectV2ToRepository') ? index : -1))
    .filter((index) => index >= 0);
  const statusReadIndex = calls.findIndex((line) => line.includes('fields(first: 30)'));
  assert.equal(linkIndexes.length, 1, 'canonical explicit selection should link exactly once');
  assert.ok(statusReadIndex >= 0, 'canonical explicit selection should read Status fields');
  assert.ok(
    linkIndexes[0] > statusReadIndex,
    'canonical explicit selection must link only after Status ambiguity validation'
  );
}

console.log('init-status-palette: OK');
