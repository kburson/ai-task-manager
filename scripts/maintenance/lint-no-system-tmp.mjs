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
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve('scripts');

const ALLOWED = new Set([
  path.resolve('scripts/task-tracker/lib/scratch-dir.mjs'),
  path.resolve('scripts/maintenance/lint-no-system-tmp.mjs'),
]);

// All `.mjs` files in scripts/.
const files = execSync(`find ${ROOT} -type f -name '*.mjs'`, { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean);

const offenders = [];

// Token-level patterns. Each entry: { re, label }.
const PATTERNS = [
  { re: /\btmpdir\s*\(\s*\)/g, label: '`tmpdir()` call' },
  { re: /\bos\.tmpdir\b/g, label: '`os.tmpdir`' },
  { re: /from\s+['"]node:os['"][^;]*\btmpdir\b/g, label: '`tmpdir` import from node:os' },
];

for (const f of files) {
  const abs = path.resolve(f);
  if (ALLOWED.has(abs)) continue;
  const src = readFileSync(abs, 'utf8');
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { re, label } of PATTERNS) {
      re.lastIndex = 0;
      if (re.test(line)) {
        offenders.push(
          `${path.relative(process.cwd(), abs)}:${i + 1}: ${label} — use projectScratchDir/mkdtempProjectIsolated/mkdtempOutsideRepo from lib/scratch-dir.mjs`
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
