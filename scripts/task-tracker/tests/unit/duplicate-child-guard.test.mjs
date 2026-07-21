// @story #921 — Guard against duplicate sub-issue creation.
//
// Covers the pure decision core (normalizeTitle / titleSimilarity /
// evaluateDuplicateChild / formatDuplicateRefusal) and the create-issue.mjs
// wiring driven end-to-end via `--dry-run` + an injected sibling list, so both
// the refuse-by-default and --allow-duplicate-child-override branches are
// proven without any `gh` dependency.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import {
  normalizeTitle,
  titleSimilarity,
  evaluateDuplicateChild,
  formatDuplicateRefusal,
  DUPLICATE_CHILD_EXIT_CODE,
} from '../../../gh/lib/duplicate-child-guard.mjs';

const repoRoot = new URL('../../../..', import.meta.url).pathname;
const script = join(repoRoot, 'scripts/gh/create-issue.mjs');

// ── Pure core ──────────────────────────────────────────────────────────────

test('normalizeTitle strips a known kind/epic prefix and stopwords', () => {
  const set = normalizeTitle('🐞 [BUG] Guard against the duplicate creation');
  // prefix gone, stopwords ("against", "the") dropped, topic tokens kept.
  assert.ok(set.has('guard'));
  assert.ok(set.has('duplicate'));
  assert.ok(set.has('creation'));
  assert.ok(!set.has('the'));
});

test('titleSimilarity scores an exact-modulo-prefix pair at 1.0', () => {
  const s = titleSimilarity('🧑‍🧒‍🧒 [Epic] Add retry to the fetch layer', 'Add retry to fetch layer');
  assert.equal(s, 1);
});

test('titleSimilarity scores an unrelated pair below the default threshold', () => {
  const s = titleSimilarity('Add retry to the fetch layer', 'Document the release process');
  assert.ok(s < 0.7, `expected < 0.7, got ${s}`);
});

test('containment catches a duplicate that only adds a qualifier word', () => {
  // superset ⊇ subset → containment 1.0 even though jaccard < 1.
  const s = titleSimilarity(
    'enumerate parent epic children',
    'enumerate parent epic children before fanout'
  );
  assert.ok(s >= 0.7, `expected >= 0.7, got ${s}`);
});

test('evaluateDuplicateChild refuses by default and names the colliding sibling', () => {
  const { refuse, matches } = evaluateDuplicateChild({
    newTitle: 'enumerate parent epic children',
    siblings: [
      { number: 913, title: 'enumerate parent epic children before fanout', state: 'OPEN' },
      { number: 999, title: 'something entirely different', state: 'OPEN' },
    ],
  });
  assert.equal(refuse, true);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].number, 913);
  const msg = formatDuplicateRefusal(912, matches);
  assert.match(msg, /#913/);
  assert.match(msg, /--allow-duplicate-child/);
});

test('evaluateDuplicateChild with overridden:true returns refuse:false but keeps matches', () => {
  const { refuse, matches } = evaluateDuplicateChild({
    newTitle: 'enumerate parent epic children',
    siblings: [{ number: 913, title: 'enumerate parent epic children', state: 'OPEN' }],
    overridden: true,
  });
  assert.equal(refuse, false);
  assert.equal(matches.length, 1, 'override suppresses refusal but still reports the match');
});

test('a CLOSED / NOT_PLANNED sibling with an identical title does NOT refuse', () => {
  const { refuse, matches } = evaluateDuplicateChild({
    newTitle: 'enumerate parent epic children',
    siblings: [{ number: 917, title: 'enumerate parent epic children', state: 'CLOSED' }],
  });
  assert.equal(refuse, false);
  assert.equal(matches.length, 0);
});

test('matches are sorted by descending score then ascending number', () => {
  const { matches } = evaluateDuplicateChild({
    newTitle: 'add retry to fetch layer',
    siblings: [
      { number: 30, title: 'add retry to fetch layer now', state: 'OPEN' }, // containment 1.0
      { number: 20, title: 'add retry to fetch layer', state: 'OPEN' }, // 1.0
      { number: 10, title: 'add retry to fetch layer', state: 'OPEN' }, // 1.0
    ],
  });
  // #20 and #10 both score 1.0 → ascending number; #30 also 1.0 (containment).
  assert.deepEqual(
    matches.map((m) => m.number),
    [10, 20, 30]
  );
});

// ── CLI wiring (create-issue.mjs, --dry-run + injected siblings) ────────────

// Minimal project + section files so validateArgs passes and, on the override
// path, preflight renders a body. No `gh` is invoked: the guard consumes the
// injected AITM_DUP_CHILD_SIBLINGS_JSON, and --dry-run/--no-tether skip all I/O.
function cliSetup() {
  const temp = mkdtempSync(join(projectScratchDir('test'), 'aitm-dupguard-'));
  mkdirSync(join(temp, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    join(temp, '.ai-task-manager/task-tracker.json'),
    JSON.stringify({ repo: 'kburson/ai-task-manager', projectId: 'PVT_TEST' }, null, 2)
  );
  writeFileSync(join(temp, 'scope.md'), 'Some scope text.\n');
  writeFileSync(join(temp, 'ac.md'), '- [ ] first criterion\n');
  writeFileSync(join(temp, 'plan.md'), 'key: value\n');
  return temp;
}

function runCreate(temp, { title, siblings, extraArgs = [] }) {
  return spawnSync(
    'node',
    [
      script,
      '--title',
      title,
      '--shape',
      'sub-issue',
      '--scope-file',
      join(temp, 'scope.md'),
      '--ac-file',
      join(temp, 'ac.md'),
      '--plan-metadata-file',
      join(temp, 'plan.md'),
      '--parent',
      '912',
      '--dry-run',
      '--no-tether',
      ...extraArgs,
    ],
    {
      encoding: 'utf8',
      cwd: temp,
      env: {
        ...process.env,
        AI_TASK_MANAGER_PROJECT_DIR: undefined,
        AITM_DUP_CHILD_SIBLINGS_JSON: JSON.stringify(siblings),
      },
    }
  );
}

test('CLI: duplicating create is REFUSED by default with exit 7 naming the collision', () => {
  const temp = cliSetup();
  const result = runCreate(temp, {
    title: 'child alpha',
    siblings: [{ number: 913, title: 'child alpha', state: 'OPEN' }],
  });
  assert.equal(
    result.status,
    DUPLICATE_CHILD_EXIT_CODE,
    `expected exit ${DUPLICATE_CHILD_EXIT_CODE}, got ${result.status}\n${result.stderr}`
  );
  assert.match(result.stderr, /refusing to create sub-issue under epic #912/i);
  assert.match(result.stderr, /#913/);
});

test('CLI: --allow-duplicate-child OVERRIDES the guard (exit 0, body rendered)', () => {
  const temp = cliSetup();
  const result = runCreate(temp, {
    title: 'child alpha',
    siblings: [{ number: 913, title: 'child alpha', state: 'OPEN' }],
    extraArgs: ['--allow-duplicate-child'],
  });
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}\n${result.stderr}`);
  assert.doesNotMatch(result.stderr, /refusing to create sub-issue/i);
  assert.match(result.stdout, /Pickup Directive/);
});

test('CLI: a non-duplicating create passes the guard (exit 0)', () => {
  const temp = cliSetup();
  const result = runCreate(temp, {
    title: 'a completely unrelated piece of work',
    siblings: [{ number: 913, title: 'child alpha', state: 'OPEN' }],
  });
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}\n${result.stderr}`);
});
