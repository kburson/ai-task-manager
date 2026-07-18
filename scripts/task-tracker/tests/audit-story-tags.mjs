#!/usr/bin/env node
// @story #309
// CI gate: exits non-zero when any *.test.mjs file is missing a @story tag.

import { readFileSync } from 'fs';
import { discoverTestFiles } from '../lib/discover-test-files.mjs';

// Matches `// @story #NNN` on line 1 or line 2 (after shebang)
const STORY_TAG_RE = /^\/\/ @story #\d/m;

// Discovery is the canonical walker (#872/#875), not a private recursive
// readdirSync. Scope is unchanged — the two test roots this gate has always
// policed — but sourced per-root from `discoverTestFiles` so it can never drift
// from the runner's file set. (Widening this gate to whole-tree coverage is
// tracked separately; it would surface pre-existing untagged co-located tests.)
const roots = ['scripts/task-tracker/tests', 'scripts/providers/tests'];
const files = roots.flatMap((r) => discoverTestFiles({ root: r })).sort();

const untagged = files.filter((f) => !STORY_TAG_RE.test(readFileSync(f, 'utf8')));

if (untagged.length === 0) {
  console.log(`audit-story-tags: all ${files.length} test files carry a @story tag.`);
  process.exit(0);
}

console.error(`audit-story-tags: ${untagged.length} file(s) missing @story tag:`);
for (const f of untagged) console.error(`  ${f}`);
process.exit(1);
