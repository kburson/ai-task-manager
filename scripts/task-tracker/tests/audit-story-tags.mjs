#!/usr/bin/env node
// @story #309
// CI gate: exits non-zero when any *.test.mjs file is missing a @story tag.

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// Matches `// @story #NNN` on line 1 or line 2 (after shebang)
const STORY_TAG_RE = /^\/\/ @story #\d/m;

function findTestFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...findTestFiles(full));
    } else if (entry.endsWith('.test.mjs')) {
      results.push(full);
    }
  }
  return results;
}

const roots = ['scripts/task-tracker/tests', 'scripts/providers/tests'];
const files = roots
  .flatMap((r) => {
    try {
      return findTestFiles(r);
    } catch {
      return [];
    }
  })
  .sort();

const untagged = files.filter((f) => !STORY_TAG_RE.test(readFileSync(f, 'utf8')));

if (untagged.length === 0) {
  console.log(`audit-story-tags: all ${files.length} test files carry a @story tag.`);
  process.exit(0);
}

console.error(`audit-story-tags: ${untagged.length} file(s) missing @story tag:`);
for (const f of untagged) console.error(`  ${f}`);
process.exit(1);
