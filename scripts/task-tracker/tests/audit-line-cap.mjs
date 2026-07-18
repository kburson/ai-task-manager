#!/usr/bin/env node
// @story #310
// CI gate: exits non-zero when any *.test.mjs exceeds ADR §4 hard limit.
// The limit is measured in lines of *code* (blank and comment-only lines are
// excluded) so guiding comments never push a documented test over the cap.
import { readFileSync } from 'node:fs';
import { countCodeLines } from '../lib/count-code-lines.mjs';
import { discoverTestFiles, DEFAULT_EXCLUDES } from '../lib/discover-test-files.mjs';

const HARD_LIMIT = 400;
const ROOTS = ['scripts/task-tracker/tests', 'scripts/providers/tests'];

// Discovery is the canonical walker (#875) instead of a private recursive
// readdirSync. The prior walk skipped `slow/` (integration tests have a
// different size profile), so that exclusion is preserved by adding `slow` to
// the canonical default excludes. Repo-relative POSIX paths (cwd is the repo
// root under npm) match the prior `relative('.', …)` reporting shape.
const EXCLUDES = [...DEFAULT_EXCLUDES, 'slow'];

const violations = [];
for (const root of ROOTS) {
  for (const file of discoverTestFiles({ root, excludes: EXCLUDES })) {
    const lines = countCodeLines(readFileSync(file, 'utf8'));
    if (lines > HARD_LIMIT) {
      violations.push({ file, lines });
    }
  }
}

if (violations.length === 0) {
  console.log(`audit-line-cap: all test files within ${HARD_LIMIT}-line code-LOC limit`);
  process.exit(0);
} else {
  console.error(
    `audit-line-cap: ${violations.length} file(s) exceed ${HARD_LIMIT}-line code-LOC limit:`
  );
  for (const { file, lines } of violations) {
    console.error(`  ${lines} code lines  ${file}`);
  }
  process.exit(1);
}
