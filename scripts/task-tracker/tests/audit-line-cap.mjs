#!/usr/bin/env node
// @story #310
// CI gate: exits non-zero when any *.test.mjs exceeds ADR §4 hard limit.
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const HARD_LIMIT = 400;
const ROOTS = ['scripts/task-tracker/tests', 'scripts/providers/tests'];

function collectTestFiles(dir) {
  let results = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry === 'slow') continue; // slow/ integration tests have different size profile
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results = results.concat(collectTestFiles(full));
    } else if (entry.endsWith('.test.mjs')) {
      results.push(full);
    }
  }
  return results;
}

const violations = [];
for (const root of ROOTS) {
  for (const file of collectTestFiles(root)) {
    const lines = readFileSync(file, 'utf8').split('\n').length;
    if (lines > HARD_LIMIT) {
      violations.push({ file: relative('.', file), lines });
    }
  }
}

if (violations.length === 0) {
  console.log(`audit-line-cap: all test files within ${HARD_LIMIT}-line limit`);
  process.exit(0);
} else {
  console.error(`audit-line-cap: ${violations.length} file(s) exceed ${HARD_LIMIT}-line limit:`);
  for (const { file, lines } of violations) {
    console.error(`  ${lines} lines  ${file}`);
  }
  process.exit(1);
}
