#!/usr/bin/env node
// @story #309
// Run-once script: prepend `// @story #NNN` to every *.test.mjs file.
// Uses git log to find the issue that created each file; falls back to #309.
// Shebang lines are preserved on line 1; the @story tag follows on line 2.

import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { discoverTestFiles } from './lib/discover-test-files.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';

const FALLBACK_STORY = '#309';
const STORY_TAG_RE = /^\/\/ @story #\d/m;
const SHEBANG_RE = /^#!.+/;
const ISSUE_RE = /#(\d+)/;

export function findCreationIssue(filePath, { exec = execFileSync } = {}) {
  try {
    const log = exec('git', ['log', '--diff-filter=A', '--oneline', '--follow', '--', filePath], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (!log) return FALLBACK_STORY;
    const m = log.match(ISSUE_RE);
    return m ? `#${m[1]}` : FALLBACK_STORY;
  } catch {
    return FALLBACK_STORY;
  }
}

export function insertTag(content, storyTag) {
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

export function fixMisplacedTag(content) {
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

export function repairStoryTags({
  projectRoot = process.cwd(),
  discover = discoverTestFiles,
  read = readFileSync,
  write = writeFileSync,
  findIssue = findCreationIssue,
} = {}) {
  const files = discover({ projectRoot });
  let tagged = 0;
  let fixed = 0;
  let skipped = 0;
  const noIssue = [];

  for (const file of files) {
    const filePath = path.join(projectRoot, file);
    const content = read(filePath, 'utf8');

    // Fix already-tagged files where shebang ordering is wrong
    const fixedContent = fixMisplacedTag(content);
    if (fixedContent !== null) {
      write(filePath, fixedContent);
      fixed++;
      continue;
    }

    if (STORY_TAG_RE.test(content)) {
      skipped++;
      continue;
    }

    const story = findIssue(file);
    if (story === FALLBACK_STORY) noIssue.push(file);
    write(filePath, insertTag(content, story));
    tagged++;
  }

  return { tagged, fixed, skipped, noIssue };
}

export function main(argv = process.argv.slice(2)) {
  if (wantsHelp(argv)) {
    emitSelfDoc('tag-story-ids');
    return 0;
  }

  const { tagged, fixed, skipped, noIssue } = repairStoryTags();
  console.log(
    `Tagged: ${tagged}, Fixed shebang order: ${fixed}, Skipped (already correct): ${skipped}`
  );
  if (noIssue.length > 0) {
    console.log(`\nFiles using fallback ${FALLBACK_STORY} (no creation commit found):`);
    for (const file of noIssue) console.log(`  ${file}`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
