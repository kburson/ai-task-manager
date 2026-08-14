#!/usr/bin/env node
// @story #310
// CI gate: exits non-zero when any *.test.mjs exceeds ADR §4 hard limit.
// The limit is measured in lines of *code* (blank and comment-only lines are
// excluded) so guiding comments never push a documented test over the cap.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { countCodeLines } from '../../task-tracker/lib/count-code-lines.mjs';
import { discoverTestFiles } from '../../task-tracker/lib/discover-test-files.mjs';

const SOFT_LIMIT = 400;
const HARD_LIMIT = 800;
export function auditLineCap({
  projectRoot = process.cwd(),
  discover = discoverTestFiles,
  read = readFileSync,
} = {}) {
  const files = discover({ projectRoot });
  const violations = [];
  const advisories = [];
  for (const file of files) {
    const lines = countCodeLines(read(path.join(projectRoot, file), 'utf8'));
    if (lines > HARD_LIMIT) {
      violations.push({ file, lines });
    } else if (lines > SOFT_LIMIT) {
      advisories.push({ file, lines });
    }
  }
  return { files, violations, advisories };
}

function main() {
  const { violations, advisories } = auditLineCap();
  if (violations.length === 0) {
    console.log(`audit-line-cap: all test files within ${HARD_LIMIT}-line code-LOC limit`);
    for (const { file, lines } of advisories) {
      console.warn(
        `audit-line-cap: review ${lines}-line feature file above soft ${SOFT_LIMIT}: ${file}`
      );
    }
    return 0;
  }

  console.error(
    `audit-line-cap: ${violations.length} file(s) exceed ${HARD_LIMIT}-line code-LOC limit:`
  );
  for (const { file, lines } of violations) {
    console.error(`  ${lines} code lines  ${file}`);
  }
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
