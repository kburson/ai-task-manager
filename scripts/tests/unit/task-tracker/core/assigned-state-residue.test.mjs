// @story #1206
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

import { isGeneratedResearchArtifact } from '../../../lib/residue-audit-scope.mjs';

const LEGACY_TOKEN = /on[- _]?deck/i;
const SPLIT_LEGACY_TOKEN = /on[ \t]*\r?\n[ \t]*(?:(?:\/\/|#|\*)[ \t]*)?deck/gi;
const SELF = 'scripts/tests/unit/task-tracker/core/assigned-state-residue.test.mjs';

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
    'docs/superpowers/plans/2026-08-11-ready-for-planning-ownership-lifecycle.md': [
      5,
      'approved #1209 compatibility and migration plan',
    ],
    'docs/code-review/562-correctness-concurrency-audit.md': [
      1,
      'immutable historical defect reproduction',
    ],
    'docs/ai-memory/MEMORY.md': [1, 'mirrored factual state-rename history'],
    'docs/ai-memory/project_board_columns_2026_05.md': [2, 'mirrored factual state-rename history'],
    'scripts/gh/init-project-config.sh': [8, 'explicit migration refusal and guidance'],
    'scripts/gh/init-repair.mjs': [5, 'legacy config-key rewrite'],
    'scripts/gh/lib/live-state.mjs': [1, 'raw live-board compatibility boundary'],
    'scripts/lib/self-doc.mjs': [6, 'explicit migration CLI help contract'],
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
    'scripts/tests/unit/task-tracker/lib/agent-review/review-gate.test.mjs': [
      1,
      'historical entry-marker fixture',
    ],
    'scripts/tests/unit/task-tracker/lib/agent-review/validators/timing-log-sequence.test.mjs': [
      4,
      'historical marker timing fixtures',
    ],
    'scripts/task-tracker/lib/assigned-status-migration.mjs': [6, 'migration implementation'],
    'scripts/task-tracker/lib/ready-for-plan-migration.mjs': [
      3,
      'explicit final compatibility-key cutover',
    ],
    'scripts/task-tracker/lib/config-init/config-authoring.mjs': [
      3,
      'legacy config authoring rewrite',
    ],
    'scripts/task-tracker/lib/github-records/lifecycle-transition.mjs': [
      1,
      'immutable v1 capsule replay alias',
    ],
    'scripts/task-tracker/lib/lifecycle-policy/states.mjs': [1, 'raw-state read alias'],
    'scripts/task-tracker/lib/lifecycle-policy/history.mjs': [
      1,
      'historical state-position projection',
    ],
    'scripts/task-tracker/lib/move-state/policy.mjs': [1, 'raw CLI aliases'],
    'scripts/task-tracker/lib/stage-entry-markers.mjs': [4, 'historical marker reader aliases'],
    'scripts/tests/unit/task-tracker/lib/timing-event-map.test.mjs': [
      1,
      'historical timing fixture',
    ],
    'scripts/task-tracker/lib/timing-events/legacy.mjs': [2, 'non-emittable timing read alias'],
    'scripts/task-tracker/lib/timing-ladder.mjs': [1, 'historical timing ladder alias'],
    'scripts/tests/unit/task-tracker/lib/timing-ladder.test.mjs': [1, 'historical timing fixture'],
    'scripts/tests/slow/task-tracker/lib/init-status-palette.test.mjs': [
      12,
      'live-init migration-refusal and ambiguity fixtures',
    ],
    'scripts/tests/slow/task-tracker/core/lifecycle-traversal-e2e.test.mjs': [
      2,
      'historical regression provenance',
    ],
    'scripts/tests/slow/task-tracker/core/maintenance-scripts-strict-argv.test.mjs': [
      1,
      'explicit migration CLI strict-argument manifest',
    ],
    'scripts/tests/unit/task-tracker/core/coverage-heal-entry-markers.test.mjs': [
      4,
      'historical marker healing fixtures',
    ],
    'scripts/tests/unit/task-tracker/core/move-state-assigned.test.mjs': [
      6,
      'raw alias and historical body fixtures',
    ],
    'scripts/tests/unit/task-tracker/core/heal-backlog-schema-drift.test.mjs': [
      1,
      'historical regression provenance',
    ],
    'scripts/tests/unit/task-tracker/core/state-machine.test.mjs': [
      3,
      'raw display-name alias regression',
    ],
    'scripts/tests/unit/task-tracker/lib/active-by-phase-spans.test.mjs': [
      1,
      'historical timing rollup fixture',
    ],
    'scripts/tests/unit/task-tracker/lib/assigned-status-migration.test.mjs': [
      3,
      'migration and historical rebind fixtures',
    ],
    'scripts/tests/unit/task-tracker/lib/body-invariants.test.mjs': [
      3,
      'historical marker preservation fixture',
    ],
    'scripts/tests/unit/task-tracker/lib/bound-state-session-authoritative.test.mjs': [
      2,
      'historical bound-state cache fixtures',
    ],
    'scripts/tests/unit/task-tracker/lib/config-init/config-init.test.mjs': [
      5,
      'legacy config rewrite fixtures',
    ],
    'scripts/tests/unit/task-tracker/lib/config.test.mjs': [6, 'legacy config fallback fixtures'],
    'scripts/tests/unit/task-tracker/lib/coverage-source-edit-gate.test.mjs': [
      4,
      'legacy cache display and config fixtures',
    ],
    'scripts/tests/unit/task-tracker/lib/gh-edit-guard-create-guard.test.mjs': [
      3,
      'historical marker preservation fixture',
    ],
    'scripts/tests/unit/task-tracker/lib/github-records/lifecycle-transition.test.mjs': [
      5,
      'immutable v1 capsule replay fixtures',
    ],
    'scripts/tests/unit/task-tracker/lib/init-repair.test.mjs': [
      4,
      'legacy config repair fixtures',
    ],
    'scripts/tests/unit/task-tracker/lib/ready-for-plan-topology.test.mjs': [
      5,
      'canonical topology and historical-read compatibility contract',
    ],
    'scripts/tests/unit/task-tracker/lib/move-state/sentinel.test.mjs': [
      4,
      'historical move sentinel fixtures',
    ],
    'scripts/tests/unit/task-tracker/lib/source-edit-gate.cache.test.mjs': [
      3,
      'historical volatile-cache fixtures',
    ],
    'scripts/tests/unit/task-tracker/lib/session-state.test.mjs': [
      2,
      'historical session-cache fixtures',
    ],
    'scripts/tests/unit/task-tracker/lib/stage-entry-markers-core.test.mjs': [
      7,
      'historical entry-marker fixtures',
    ],
    'scripts/tests/unit/task-tracker/lib/timing-events-policy.test.mjs': [
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
    if (isGeneratedResearchArtifact(file)) continue;
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
