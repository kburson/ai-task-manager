#!/usr/bin/env node
// @story #310
// CI gate: new non-slow test files may not exceed ADR §4's 400 code-LOC limit.
// Legacy exceptions are frozen at exact repo-relative paths and may shrink,
// but may never grow. A rename is therefore a new file, not an inherited
// exception. The pre-existing `slow/` exclusion is intentionally preserved.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { countCodeLines } from '../lib/count-code-lines.mjs';
import { discoverTestFiles, DEFAULT_EXCLUDES } from '../lib/discover-test-files.mjs';

export const HARD_LIMIT = 400;
export const ROOTS = ['scripts/task-tracker/tests', 'scripts/providers/tests'];
export const EXCLUDES = [...DEFAULT_EXCLUDES, 'slow'];
export const BASELINE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'line-cap-baseline.json'
);

export function classifyLineCap({ file, lines, baseline, hardLimit = HARD_LIMIT }) {
  if (lines <= hardLimit) return { status: 'within-cap' };
  const frozen = baseline[file];
  if (!Number.isInteger(frozen)) return { status: 'new-oversize', limit: hardLimit };
  if (lines > frozen) return { status: 'legacy-growth', limit: frozen };
  return { status: 'grandfathered', limit: frozen };
}

export function auditLineCaps({ baseline, roots = ROOTS } = {}) {
  const frozen = baseline ?? JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const seen = new Set();
  const violations = [];
  let grandfathered = 0;

  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const file of discoverTestFiles({ root, excludes: EXCLUDES })) {
      const repoPath = file.split(path.sep).join('/');
      seen.add(repoPath);
      const lines = countCodeLines(readFileSync(file, 'utf8'));
      const result = classifyLineCap({ file: repoPath, lines, baseline: frozen });
      if (result.status === 'grandfathered') grandfathered += 1;
      else if (result.status !== 'within-cap')
        violations.push({ file: repoPath, lines, ...result });
    }
  }

  for (const file of Object.keys(frozen)) {
    if (!seen.has(file)) violations.push({ file, status: 'stale-baseline' });
  }
  return { grandfathered, violations };
}

function main() {
  const { grandfathered, violations } = auditLineCaps();
  if (violations.length === 0) {
    console.log(
      `audit-line-cap: all new test files within ${HARD_LIMIT} code LOC; ` +
        `${grandfathered} frozen legacy exception(s) did not grow`
    );
    return 0;
  }

  console.error(`audit-line-cap: ${violations.length} violation(s):`);
  for (const violation of violations) {
    if (violation.status === 'stale-baseline') {
      console.error(`  stale baseline  ${violation.file}`);
    } else {
      console.error(
        `  ${violation.lines} code lines  ${violation.file} ` +
          `(${violation.status}; limit ${violation.limit})`
      );
    }
  }
  return 1;
}

const isMain = (() => {
  try {
    return fileURLToPath(import.meta.url) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
})();

if (isMain) process.exitCode = main();
