// @story #1206
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const LEGACY_TOKEN = /on[- _]?deck/i;
const SPLIT_LEGACY_TOKEN = /on[ \t]*\r?\n[ \t]*(?:(?:\/\/|#|\*)[ \t]*)?deck/gi;
const SELF = 'scripts/task-tracker/tests/unit/core/assigned-state-residue.test.mjs';

// Exact path + matching-line counts are intentional compatibility surface.
// Any new file, removed compatibility seam, or extra occurrence in an allowed
// file fails this test and requires an explicit audit.  Reasons are retained
// alongside the counts so this list remains an architectural allowlist rather
// than a blanket exception for tests or migration code.
const ALLOWLIST = new Map(
  Object.entries({
    '.ai-task-manager/memory/MEMORY.md': [1, 'factual state-rename history'],
    '.ai-task-manager/memory/project_board_columns_2026_05.md': [2, 'factual state-rename history'],
    'docs/migration-history.md': [6, 'published compatibility and operator migration guide'],
    'docs/code-review/562-correctness-concurrency-audit.md': [
      1,
      'immutable historical defect reproduction',
    ],
    'docs/ai-memory/MEMORY.md': [1, 'mirrored factual state-rename history'],
    'docs/ai-memory/project_board_columns_2026_05.md': [2, 'mirrored factual state-rename history'],
    'scripts/gh/init-project-config.sh': [9, 'explicit migration refusal and guidance'],
    'scripts/gh/init-repair.mjs': [5, 'legacy config-key rewrite'],
    'scripts/gh/lib/live-state.mjs': [1, 'raw live-board compatibility boundary'],
    'scripts/lib/self-doc.mjs': [5, 'explicit migration CLI help contract'],
    'scripts/migrate/rename-on-deck-to-assigned.mjs': [3, 'explicit migration CLI'],
    'scripts/task-tracker/lib/command-surface/entrypoints.mjs': [
      1,
      'explicit migration CLI classification',
    ],
    'scripts/task-tracker/heal-entry-markers.mjs': [
      2,
      'historical audit-byte preservation boundary',
    ],
    'scripts/task-tracker/config.mjs': [2, 'one-release config fallback'],
    'scripts/task-tracker/lib/agent-review/review-gate.test.mjs': [
      1,
      'historical entry-marker fixture',
    ],
    'scripts/task-tracker/lib/agent-review/validators/timing-log-sequence.test.mjs': [
      4,
      'historical marker timing fixtures',
    ],
    'scripts/task-tracker/lib/assigned-status-migration.mjs': [6, 'migration implementation'],
    'scripts/task-tracker/lib/config-init/config-authoring.mjs': [
      5,
      'legacy config authoring rewrite',
    ],
    'scripts/task-tracker/lib/github-records/lifecycle-transition.mjs': [
      1,
      'immutable v1 capsule replay alias',
    ],
    'scripts/task-tracker/lib/lifecycle-policy/states.mjs': [1, 'raw-state read alias'],
    'scripts/task-tracker/lib/move-state/policy.mjs': [2, 'raw CLI alias and warning'],
    'scripts/task-tracker/lib/stage-entry-markers.mjs': [4, 'historical marker reader aliases'],
    'scripts/task-tracker/lib/timing-event-map.test.mjs': [1, 'historical timing fixture'],
    'scripts/task-tracker/lib/timing-events/legacy.mjs': [2, 'non-emittable timing read alias'],
    'scripts/task-tracker/lib/timing-ladder.mjs': [1, 'historical timing ladder alias'],
    'scripts/task-tracker/lib/timing-ladder.test.mjs': [1, 'historical timing fixture'],
    'scripts/task-tracker/tests/slow/lib/init-status-palette.test.mjs': [
      16,
      'live-init migration-refusal and ambiguity fixtures',
    ],
    'scripts/task-tracker/tests/slow/core/lifecycle-traversal-e2e.test.mjs': [
      2,
      'historical regression provenance',
    ],
    'scripts/task-tracker/tests/slow/core/maintenance-scripts-strict-argv.test.mjs': [
      1,
      'explicit migration CLI strict-argument manifest',
    ],
    'scripts/task-tracker/tests/unit/core/coverage-heal-entry-markers.test.mjs': [
      4,
      'historical marker healing fixtures',
    ],
    'scripts/task-tracker/tests/unit/core/move-state-assigned.test.mjs': [
      7,
      'raw alias and historical body fixtures',
    ],
    'scripts/task-tracker/tests/unit/core/heal-backlog-schema-drift.test.mjs': [
      1,
      'historical regression provenance',
    ],
    'scripts/task-tracker/tests/unit/core/state-machine.test.mjs': [
      3,
      'raw display-name alias regression',
    ],
    'scripts/task-tracker/tests/unit/lib/active-by-phase-spans.test.mjs': [
      1,
      'historical timing rollup fixture',
    ],
    'scripts/task-tracker/tests/unit/lib/assigned-status-migration.test.mjs': [
      3,
      'migration and historical rebind fixtures',
    ],
    'scripts/task-tracker/tests/unit/lib/body-invariants.test.mjs': [
      3,
      'historical marker preservation fixture',
    ],
    'scripts/task-tracker/tests/unit/lib/bound-state-session-authoritative.test.mjs': [
      2,
      'historical bound-state cache fixtures',
    ],
    'scripts/task-tracker/tests/unit/lib/config-init/config-init.test.mjs': [
      5,
      'legacy config rewrite fixtures',
    ],
    'scripts/task-tracker/tests/unit/lib/config.test.mjs': [7, 'legacy config fallback fixtures'],
    'scripts/task-tracker/tests/unit/lib/coverage-source-edit-gate.test.mjs': [
      5,
      'legacy cache display and config fixtures',
    ],
    'scripts/task-tracker/tests/unit/lib/gh-edit-guard-create-guard.test.mjs': [
      3,
      'historical marker preservation fixture',
    ],
    'scripts/task-tracker/tests/unit/lib/github-records/lifecycle-transition.test.mjs': [
      5,
      'immutable v1 capsule replay fixtures',
    ],
    'scripts/task-tracker/tests/unit/lib/init-repair.test.mjs': [
      5,
      'legacy config repair fixtures',
    ],
    'scripts/task-tracker/tests/unit/lib/move-state/sentinel.test.mjs': [
      4,
      'historical move sentinel fixtures',
    ],
    'scripts/task-tracker/tests/unit/lib/source-edit-gate.cache.test.mjs': [
      3,
      'historical volatile-cache fixtures',
    ],
    'scripts/task-tracker/tests/unit/lib/session-state.test.mjs': [
      2,
      'historical session-cache fixtures',
    ],
    'scripts/task-tracker/tests/unit/lib/stage-entry-markers-core.test.mjs': [
      7,
      'historical entry-marker fixtures',
    ],
    'scripts/task-tracker/tests/unit/lib/timing-events-policy.test.mjs': [
      3,
      'historical timing descriptor fixture',
    ],
    'skill/shared/rules/state-walk.md': [1, 'documented raw-boundary compatibility exception'],
  })
);

function legacyMatches(source) {
  const text = String(source || '');
  const matches = [];
  text.split('\n').forEach((line, index) => {
    if (LEGACY_TOKEN.test(line)) matches.push(`${index + 1}:${line.trim()}`);
  });
  for (const match of text.matchAll(SPLIT_LEGACY_TOKEN)) {
    const line = text.slice(0, match.index).split('\n').length;
    matches.push(`${line}:split:${match[0].replace(/\s+/g, ' ')}`);
  }
  return matches;
}

test('residue matcher catches a legacy state name split across comment lines', () => {
  assert.deepEqual(legacyMatches('current state: On\n// Deck waiting room'), [
    '1:split:On // Deck',
  ]);
});

test('legacy On Deck vocabulary exists only in the audited compatibility allowlist', () => {
  const files = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8' }
  )
    .split('\0')
    .filter(Boolean);
  const residue = new Map();
  for (const file of files) {
    if (file === SELF) continue;
    let source;
    try {
      source = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const matches = legacyMatches(source);
    if (matches.length > 0) residue.set(file, matches);
  }

  const failures = [];
  for (const [file, matches] of residue) {
    const allowed = ALLOWLIST.get(file);
    if (!allowed) {
      failures.push(`UNEXPECTED ${file}\n  ${matches.join('\n  ')}`);
    } else if (matches.length !== allowed[0]) {
      failures.push(
        `COUNT ${file}: expected ${allowed[0]}, found ${matches.length} (${allowed[1]})\n  ${matches.join('\n  ')}`
      );
    }
  }
  for (const [file, [count, reason]] of ALLOWLIST) {
    if (!residue.has(file)) failures.push(`MISSING ${file}: expected ${count} (${reason})`);
  }

  assert.deepEqual(
    failures,
    [],
    `legacy Assigned-state residue audit failed:\n${failures.join('\n')}`
  );
});
