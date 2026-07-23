#!/usr/bin/env node
// @story #795
// Three-tier word metric: stay-abreast (monologue + prose + tool-summary chips)
// folded into `count`, and full-expansion (stay + full tool_use inputs + full
// tool_result outputs) returned as `fullExpansion`. Split out of
// word-counter.test.mjs to stay under the 400-line per-file cap.
import { strict as assert } from 'node:assert';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import { countWords, loadMarker, saveMarker } from '../../../word-counter.mjs';

const tmp = mkdtempSync(path.join(projectScratchDir('test'), 'tt-wc-full-'));
const markerPath = path.join(tmp, 'session.json');

// Test 1: stay-abreast folds tool-summary chips into `count`; full-expansion
// adds full tool_use inputs + tool_result outputs on top.
const chipJsonl = path.join(tmp, 'chips.jsonl');
const chipLines = [
  // assistant prose — 2 words (Tier 1)
  JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'running now' }] },
  }),
  // Bash tool_use — chip is `description` ("list the files" = 3 words → stay);
  // input string leaves ("ls -la /tmp" + "list the files" = 6 words → full).
  JSON.stringify({
    type: 'assistant',
    message: {
      content: [
        {
          type: 'tool_use',
          name: 'Bash',
          input: { command: 'ls -la /tmp', description: 'list the files' },
        },
      ],
    },
  }),
  // non-Bash tool_use — chip is `${name} ${file_path}` ("Read /etc/hosts" = 2
  // words → stay); input leaf ("/etc/hosts" = 1 word → full).
  JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/etc/hosts' } }] },
  }),
  // tool_result — 3 words, full-expansion only.
  JSON.stringify({
    type: 'user',
    message: { content: [{ type: 'tool_result', content: 'one two three' }] },
  }),
];
writeFileSync(chipJsonl, chipLines.join('\n') + '\n');
const chipResult = countWords(chipJsonl, 0);
// stay-abreast: 2 (prose) + 3 (Bash chip) + 2 (Read chip) = 7
assert.equal(chipResult.count, 7, `stay-abreast chips: expected 7, got ${chipResult.count}`);
// full: 7 (stay) + 7 (inputs: 6 Bash + 1 Read) + 3 (tool_result) = 17
assert.equal(
  chipResult.fullExpansion,
  17,
  `full-expansion: expected 17, got ${chipResult.fullExpansion}`
);

// Test 2: Bash chip falls back to "Ran command" when no `description`.
const bashFbJsonl = path.join(tmp, 'bash-fallback.jsonl');
writeFileSync(
  bashFbJsonl,
  JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'pwd' } }] },
  }) + '\n'
);
const bashFbResult = countWords(bashFbJsonl, 0);
// stay: "Ran command" = 2 words. full: 2 + input "pwd" (1) = 3.
assert.equal(bashFbResult.count, 2, `Bash fallback chip: expected 2, got ${bashFbResult.count}`);
assert.equal(
  bashFbResult.fullExpansion,
  3,
  `Bash fallback full: expected 3, got ${bashFbResult.fullExpansion}`
);

// Test 3: injection filter applies inside tool_result — an injected result is
// excluded from full-expansion just as it is from stay-abreast.
const injResultJsonl = path.join(tmp, 'inj-result.jsonl');
writeFileSync(
  injResultJsonl,
  [
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'ok' }] } }),
    JSON.stringify({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            content: '<system-reminder>secret injected words here</system-reminder>',
          },
        ],
      },
    }),
  ].join('\n') + '\n'
);
const injResultRes = countWords(injResultJsonl, 0);
assert.equal(injResultRes.count, 1, 'stay-abreast counts only the 1-word prose');
assert.equal(injResultRes.fullExpansion, 1, 'injected tool_result excluded from full-expansion');

// Test 3b: `thinking` blocks are excluded from every tier (they render collapsed
// and off-screen); only the sibling prose counts.
const thinkingJsonl = path.join(tmp, 'thinking.jsonl');
writeFileSync(
  thinkingJsonl,
  JSON.stringify({
    type: 'assistant',
    message: {
      content: [
        { type: 'thinking', thinking: 'a long private reasoning trace not shown to the reader' },
        { type: 'text', text: 'done' },
      ],
    },
  }) + '\n'
);
const thinkingRes = countWords(thinkingJsonl, 0);
assert.equal(thinkingRes.count, 1, 'thinking block excluded from stay-abreast');
assert.equal(thinkingRes.fullExpansion, 1, 'thinking block excluded from full-expansion');

// Test 4: legacy marker (persisted before the full tier) lacks `wordsFull` —
// loadMarker defaults it to `words`, never NaN/undefined.
const legacyMarker = path.join(tmp, 'legacy.json');
writeFileSync(legacyMarker, JSON.stringify({ wordCount: { line: 3, words: 42, task: null } }));
const lm = loadMarker(legacyMarker);
assert.equal(lm.words, 42);
assert.equal(lm.wordsFull, 42, 'legacy marker wordsFull defaults to words');

// Test 5: saveMarker persists an explicit full-expansion cumulative (5th arg).
saveMarker(markerPath, 7, 100, null, 250);
const mf = loadMarker(markerPath);
assert.equal(mf.words, 100);
assert.equal(mf.wordsFull, 250, 'explicit wordsFull round-trips through saveMarker/loadMarker');

rmSync(tmp, { recursive: true });
console.log('word-counter-full-expansion.test.mjs: all passed');
