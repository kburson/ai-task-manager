// @story #551
// Package-boundary guard. The published tarball must ship only runtime material:
// no test suites, no archived docs, no maintenance/report-only tooling. This test
// runs `npm pack --dry-run --json`, inspects the entry list, and fails loudly if
// the surface regrows past a ceiling or an excluded path reappears. It backstops
// the `files` allowlist negations in package.json so the boundary cannot silently
// drift (e.g. a new `scripts/**/tests/**` dir leaking back into the package).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

// Walk up from this file to the repo root (the dir holding package.json).
function repoRoot() {
  let dir = dirname(fileURLToPath(import.meta.url)) + '/..';
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, '.git'))) return dir;
    dir = dirname(dir);
  }
  // Fall back to the known relative depth: unit/ -> tests/ -> task-tracker/ -> scripts/ -> root.
  return join(dirname(fileURLToPath(import.meta.url)) + '/..', '..', '..', '..', '..');
}

// The ceiling is set with headroom above the current runtime surface but well
// below the pre-tightening surface (797, of which 427 were test files). A
// regression that re-ships the test suite blows straight past this.
//
// #728 raised this from 400 to 500: shipping the curated durable memory seed
// (`docs/ai-memory/*.md`, ~47 files) is an intentional, one-time surface growth
// to ~442 entries. The seed is bounded (ephemeral trackers and `archive/` are
// excluded), so 500 kept headroom without re-opening the door to the test suite.
//
// #912 raised this from 500 to 550: the two-axis delivery model + epic-branch
// guardrail ship a bounded set of new runtime libs (`close-gates-lineage`,
// `two-axis-delivery`, `gated-delivery`, `tests-lane-split`, `full-auto-merge*`,
// etc.), taking the runtime surface to ~502 entries. 550 restored headroom while
// staying well below the pre-tightening surface (797) — a test-suite re-ship
// still blows straight past it.
//
// #910 raised this from 550 to 600. The branch had crept to its ceiling (zero
// headroom), which made this count assertion intermittently fail under the
// concurrent full suite: a peer test transiently writing an untracked packed-path
// file pushed the momentary `npm pack` count past the limit. We are still in active
// development and cannot predict how much more runtime material we will add, so
// 600 restores comfortable headroom while staying far below the 797 pre-tightening
// surface — a re-shipped test suite still blows straight past it. (#910 also
// dropped `docs/introduction/` from the package, so the live surface fell too.)
//
// #1113 raised this from 600 to 625 for the approved #1067 GitHub-native
// authority sequence. Measured surfaces were 599 on trunk, 606 after Tasks 1-8,
// and 608 with Task 9. The remaining plan names five packed runtime modules and
// three packed documentation artifacts, projecting 616 entries; 625 leaves nine
// entries of bounded contingency while remaining 172 below the 797-entry
// pre-tightening surface. Exclusions and required-entry assertions remain the
// controlling guardrails.
// #1133 later added one focused runtime reconciliation module and measured the
// packed surface at 601 entries, confirming that the same ceiling still leaves
// bounded development headroom well below the pre-tightening surface.
// #1166 adds one shipped Bash-hook policy module; keep the ceiling exact so any
// further package-surface growth still requires an explicit review.
// #1167 adds the shared evidence-provenance runtime module; this one-entry
// increase is the intentional package surface for the write-side contract.
// #1191 adds the issue-resident location marker and its relocation gate; both
// are shipped runtime modules, so the exact packed surface grows by two.
// #1205 adds one shared bounded JSONL scanner used by the word-count and
// active-time lifecycle readers; the exact packed surface grows by one.
// #1206 adds the explicit Assigned Status migration entry point and its
// injected runtime library; both ship so operators can preview/apply it from
// an installed package. The exact packed surface grows by two.
// #1249 adds one shipped maintenance CLI and its pure timing interval authority.
// #1210 intentionally ships two governed verbs, their generic owned-comment
// store, and the task-skill rule that documents the governed surface.
// #1212 intentionally ships five ownership authorities/verbs: canonical
// policy, exact snapshot, Plan commitment guard, assign/transfer, and unassign.
// #1213 intentionally ships the snapshot authority, its guard, and cancel-plan.
const ENTRY_CEILING = 650;

function packedFiles() {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: repoRoot(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const parsed = JSON.parse(out);
  return parsed[0].files.map((f) => f.path);
}

test('package-boundary: no test files are packed', () => {
  const files = packedFiles();
  const tests = files.filter((p) => /\.test\.mjs$/.test(p) || /(^|\/)tests?\//.test(p));
  assert.deepEqual(
    tests,
    [],
    `expected zero packed test files, found ${tests.length}: ${tests.slice(0, 10).join(', ')}`
  );
});

test('package-boundary: excluded directories do not reappear', () => {
  const files = packedFiles();
  // `scripts/articles/` (#1099) is this repo's own article-series publisher. It
  // reads `docs/articles/`, which does not ship, so it is dead weight in an
  // installed package.
  const forbidden = files.filter(
    (p) =>
      /^docs\/archive\//.test(p) ||
      /^scripts\/maintenance\//.test(p) ||
      /^scripts\/articles\//.test(p)
  );
  assert.deepEqual(
    forbidden,
    [],
    `excluded paths leaked back into the package: ${forbidden.slice(0, 10).join(', ')}`
  );
});

// #910 — docs/introduction/ is human onboarding/marketing prose with no runtime
// or installer consumer; it was dropped from the `files` allowlist. Guard the
// removal so the directory cannot silently re-enter the tarball.
test('package-boundary: docs/introduction/ is not packed', () => {
  const files = packedFiles();
  const intro = files.filter((p) => /^docs\/introduction\//.test(p));
  assert.deepEqual(
    intro,
    [],
    `docs/introduction/ leaked back into the package: ${intro.slice(0, 10).join(', ')}`
  );
});

// #910 — the shipped README is the package entry point; once docs/introduction/
// stopped shipping, a relative link into it became a dead link in the tarball.
// Assert the shipped README carries no relative docs/introduction/ link (an
// absolute project URL is fine — it does not depend on packed files).
test('package-boundary: shipped README has no dead docs/introduction link', () => {
  const readme = readFileSync(join(repoRoot(), 'README.md'), 'utf8');
  const deadLinks = readme.match(/\]\(docs\/introduction\//g) || [];
  assert.deepEqual(
    deadLinks,
    [],
    `README links relatively into unshipped docs/introduction/: ${deadLinks.length} occurrence(s)`
  );
});

test('package-boundary: total entry count stays under the ceiling', () => {
  const files = packedFiles();
  assert.ok(
    files.length <= ENTRY_CEILING,
    `packed entry count ${files.length} exceeds ceiling ${ENTRY_CEILING}; ` +
      `the package surface grew — confirm intentional and raise the ceiling, or prune.`
  );
});

test('package-boundary: runtime entry points are still shipped', () => {
  const files = new Set(packedFiles());
  for (const required of [
    'bin/cli.mjs',
    'bin/aitm.mjs',
    'scripts/reports/generate-value-report.mjs',
    'scripts/task-tracker/verbs/start.mjs',
    'scripts/gh/move-state.mjs',
    'skill/adapters/claude/SKILL.md',
    'package.json',
  ]) {
    assert.ok(files.has(required), `required runtime file missing from package: ${required}`);
  }
});
