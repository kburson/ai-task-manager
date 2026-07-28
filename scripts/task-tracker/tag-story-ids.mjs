#!/usr/bin/env node
// @story #309
// Run-once script: prepend `// @story #NNN` to every *.test.mjs file.
// Uses git log to find the issue that created each file; falls back to #309.
// Shebang lines are preserved on line 1; the @story tag follows on line 2.

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

import { discoverTestFiles } from './lib/discover-test-files.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';

const FALLBACK_STORY = '#309';
const STORY_TAG_RE = /^\/\/ @story #\d/;
const SHEBANG_RE = /^#!.+/;
const ISSUE_RE = /#(\d+)/;

if (import.meta.url === `file://${process.argv[1]}` && wantsHelp(process.argv.slice(2))) {
  emitSelfDoc('tag-story-ids');
  process.exit(0);
}

function findCreationIssue(filePath) {
  try {
    const log = execSync(
      `git log --diff-filter=A --oneline --follow -- ${JSON.stringify(filePath)}`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    if (!log) return FALLBACK_STORY;
    const m = log.match(ISSUE_RE);
    return m ? `#${m[1]}` : FALLBACK_STORY;
  } catch {
    return FALLBACK_STORY;
  }
}

function insertTag(content, storyTag) {
  const lines = content.split('\n');
  const storyLine = `// @story ${storyTag}`;
  if (SHEBANG_RE.test(lines[0])) {
    // Insert after shebang
    lines.splice(1, 0, storyLine);
  } else {
    // Prepend
    lines.unshift(storyLine);
  }
  return lines.join('\n');
}

function fixMisplacedTag(content) {
  // Fix files where @story was incorrectly placed before a shebang
  const lines = content.split('\n');
  if (STORY_TAG_RE.test(lines[0]) && lines.length > 1 && SHEBANG_RE.test(lines[1])) {
    const storyLine = lines[0];
    const rest = lines.slice(1);
    // Move: shebang first, then story tag
    rest.splice(1, 0, storyLine);
    return rest.join('\n');
  }
  return null; // no fix needed
}

// Discovery is the canonical walker (#875) instead of a private recursive
// readdirSync; same repo-relative `*.test.mjs` set the runner sees. This
// run-once script operates on "the repo I am run in", so discovery is rooted at
// `process.cwd()` — matching the prior cwd-relative `readdirSync` walk. Under
// npm cwd is the repo root (identical to the canonical default), and the
// coverage harness drives it as a child process with a fixture cwd.
const roots = ['scripts/task-tracker/tests', 'scripts/providers/tests'];
const files = roots
  .flatMap((r) => discoverTestFiles({ root: r, projectRoot: process.cwd() }))
  .sort();

let tagged = 0;
let fixed = 0;
let skipped = 0;
const noIssue = [];

for (const file of files) {
  const content = readFileSync(file, 'utf8');

  // Fix already-tagged files where shebang ordering is wrong
  const fixedContent = fixMisplacedTag(content);
  if (fixedContent !== null) {
    writeFileSync(file, fixedContent);
    fixed++;
    continue;
  }

  if (STORY_TAG_RE.test(content)) {
    skipped++;
    continue;
  }

  const story = findCreationIssue(file);
  if (story === FALLBACK_STORY) noIssue.push(file);
  writeFileSync(file, insertTag(content, story));
  tagged++;
}

console.log(
  `Tagged: ${tagged}, Fixed shebang order: ${fixed}, Skipped (already correct): ${skipped}`
);
if (noIssue.length > 0) {
  console.log(`\nFiles using fallback ${FALLBACK_STORY} (no creation commit found):`);
  for (const f of noIssue) console.log(`  ${f}`);
}
