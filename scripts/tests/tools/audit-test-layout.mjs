#!/usr/bin/env node
// @story #876
// Fail-closed gate: every discovered package test must declare one canonical lane.

import { pathToFileURL } from 'node:url';

import { discoverTestFiles } from '../../task-tracker/lib/discover-test-files.mjs';
import {
  canonicalLayoutViolations,
  parseCanonicalTestPath,
} from '../../task-tracker/lib/test-lanes.mjs';

export function auditTestLayout({
  projectRoot = process.cwd(),
  discover = discoverTestFiles,
} = {}) {
  const files = discover({ projectRoot });
  const violations = [
    ...canonicalLayoutViolations(files),
    ...files.filter((file) => {
      const parsed = parseCanonicalTestPath(file);
      return parsed && !parsed.relative.includes('/');
    }),
  ].sort();
  return { files, violations };
}

function main() {
  const { files, violations } = auditTestLayout();

  if (violations.length === 0) {
    console.log(
      `audit-test-layout: all ${files.length} test files declare a canonical ` +
        'scripts/tests/<unit|integration|slow>/ lane.'
    );
    return 0;
  }

  console.error(`audit-test-layout: ${violations.length} noncanonical test file(s):`);
  for (const file of violations) console.error(`  ${file}`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
