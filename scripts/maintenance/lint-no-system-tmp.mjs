#!/usr/bin/env node
// #304 — Lint guard: forbid system-tmp usage in scripts/.
//
// All scratch space must route through `scripts/task-tracker/lib/scratch-dir.mjs`
// (`projectScratchDir`, `mkdtempProjectIsolated`, `mkdtempOutsideRepo`). The
// only ALLOWED references to `os.tmpdir()` / `tmpdir()` in the codebase are:
//
//   1. The lib itself (`scripts/task-tracker/lib/scratch-dir.mjs`) — where
//      `mkdtempOutsideRepo` legitimately wraps `os.tmpdir()` as the
//      single escape hatch for "outside any git repo" tests.
//   2. This guard.
//
// Anything else is a regression and fails lint.

import { readFileSync } from 'node:fs';

import { discoverFiles } from '../task-tracker/lib/discover-test-files.mjs';

const ALLOWED = new Set([
  'scripts/task-tracker/lib/scratch-dir.mjs',
  'scripts/maintenance/lint-no-system-tmp.mjs',
]);

// All `.mjs` under scripts/, sourced from the canonical walker (#875) instead of
// a private `execSync('find …')`. `excludes` is narrowed to node_modules only so
// fixtures are still scanned — a fixture that writes to system tmp is still a
// regression. Paths are repo-relative POSIX (cwd is the repo root under npm), so
// the ALLOWED and `/tests/` filters below match on that shape.
const files = discoverFiles({ match: /\.mjs$/, excludes: ['node_modules'] });

const offenders = [];

// Token-level patterns. `testsToo: false` patterns skip files under
// `scripts/**/tests/` — test fixtures legitimately contain literal `/tmp/...`
// strings as parser/classifier input (e.g. `gh-edit-guard.test.mjs` verifies
// the guard's handling of system-tmp `--body-file` paths). Those are contract
// literals, not real writes.
const PATTERNS = [
  { re: /\btmpdir\s*\(\s*\)/g, label: '`tmpdir()` call', testsToo: true },
  { re: /\bos\.tmpdir\b/g, label: '`os.tmpdir`', testsToo: true },
  {
    re: /from\s+['"]node:os['"][^;]*\btmpdir\b/g,
    label: '`tmpdir` import from node:os',
    testsToo: true,
  },
  { re: /['"`]\/tmp\//g, label: 'literal `/tmp/` path', testsToo: false },
  { re: /['"`]\/private\/tmp\//g, label: 'literal `/private/tmp/` path', testsToo: false },
];

const isTestFile = (rel) => /\/tests\//.test(rel);

for (const f of files) {
  if (ALLOWED.has(f)) continue;
  const src = readFileSync(f, 'utf8');
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { re, label, testsToo } of PATTERNS) {
      if (!testsToo && isTestFile(f)) continue;
      re.lastIndex = 0;
      if (re.test(line)) {
        offenders.push(
          `${f}:${i + 1}: ${label} — use projectScratchDir/mkdtempProjectIsolated/mkdtempOutsideRepo from lib/scratch-dir.mjs`
        );
        break;
      }
    }
  }
}

if (offenders.length) {
  process.stderr.write(`lint:tmp — ${offenders.length} violation(s):\n`);
  for (const o of offenders) process.stderr.write(`  ${o}\n`);
  process.stderr.write(
    `\nFix: replace with the appropriate helper from scripts/task-tracker/lib/scratch-dir.mjs.\n`
  );
  process.exit(1);
}

console.log(`lint:tmp — ${files.length} file(s) clean`);
