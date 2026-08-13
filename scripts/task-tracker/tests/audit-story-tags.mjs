#!/usr/bin/env node
// @story #309
// CI gate: exits non-zero when any *.test.mjs file is missing a @story tag.

import { readFileSync } from 'fs';
import path from 'node:path';
import { discoverTestFiles } from '../lib/discover-test-files.mjs';

// Matches `// @story #NNN` on line 1 or line 2 (after shebang)
const STORY_TAG_RE = /^\/\/ @story #\d/m;

export function auditStoryTags({
  projectRoot = process.cwd(),
  discover = discoverTestFiles,
  read = readFileSync,
} = {}) {
  const files = discover({ projectRoot });
  const untagged = files.filter(
    (file) => !STORY_TAG_RE.test(read(path.join(projectRoot, file), 'utf8'))
  );
  return { files, untagged };
}

function main() {
  const { files, untagged } = auditStoryTags();

  if (untagged.length === 0) {
    console.log(`audit-story-tags: all ${files.length} test files carry a @story tag.`);
    return 0;
  }

  console.error(`audit-story-tags: ${untagged.length} file(s) missing @story tag:`);
  for (const file of untagged) console.error(`  ${file}`);
  return 1;
}

process.exit(main());
