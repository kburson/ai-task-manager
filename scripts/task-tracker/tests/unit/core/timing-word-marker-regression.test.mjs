#!/usr/bin/env node
// @story #152
// Regression: every `buildRow({ ... wordMarker: 0 ... })` site in
// scripts/task-tracker/verbs/*.mjs must carry an inline justifying comment
// on the `wordMarker: 0` line. Sites that flow live word counts MUST NOT use
// the literal `wordMarker: 0` — they have to compute (e.g.
// `s.wordsAtEntryStart + deltaWords` or call `getWordCount`).
//
// Background: see issue #152. Hard-coded `wordMarker: 0` had crept across
// close / promote / reject / demote / reconcile / review / new — those rows
// reported `0` in the "Word Marker" column of the ⏱ Timing Log. This test
// locks the cleanup in.
//
// Accepted justifying-comment markers (case-sensitive, present on the same
// line as `wordMarker: 0,` or on the line immediately above):
//   - "// wordMarker:0 ok"  (free-form trailing text after `ok` permitted)
//   - "// wordMarker:0 audit row" (audit-only sites)

import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const VERBS_DIR = path.resolve(__dirname, '..', '..', 'verbs');

const JUSTIFY_RE = /\/\/\s*wordMarker:0\s+(ok|audit row)\b/;

function scanFile(filePath) {
  const src = readFileSync(filePath, 'utf8');
  const lines = src.split('\n');
  const offenders = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/wordMarker:\s*0\s*,/.test(line)) continue;
    const justifiedOnLine = JUSTIFY_RE.test(line);
    const prev = i > 0 ? lines[i - 1] : '';
    const justifiedAbove = JUSTIFY_RE.test(prev);
    if (!justifiedOnLine && !justifiedAbove) {
      offenders.push({ file: filePath, line: i + 1, text: line.trim() });
    }
  }
  return offenders;
}

const files = readdirSync(VERBS_DIR)
  .filter((f) => f.endsWith('.mjs'))
  .map((f) => path.join(VERBS_DIR, f));

const allOffenders = files.flatMap(scanFile);

if (allOffenders.length > 0) {
  console.error('Unjustified `wordMarker: 0` sites:');
  for (const o of allOffenders) {
    console.error(`  ${path.relative(process.cwd(), o.file)}:${o.line}  ${o.text}`);
  }
  console.error(
    '\nEach site must either compute a live wordMarker, or carry an inline justifying comment:'
  );
  console.error('  // wordMarker:0 ok — <reason>');
  console.error('  // wordMarker:0 audit row — <reason>');
}

assert.equal(
  allOffenders.length,
  0,
  `expected 0 unjustified wordMarker:0 sites, found ${allOffenders.length}`
);

console.log(`timing-word-marker-regression: PASS (${files.length} verbs scanned)`);
