// @story #161
// Unit tests for the visible Full-Auto footnote helpers (#161 / D4).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FULL_AUTO_FOOTNOTE_START,
  FULL_AUTO_FOOTNOTE_END,
  buildFullAutoFootnoteBlock,
  hasFullAutoFootnote,
  insertFullAutoFootnote,
  removeFullAutoFootnote,
} from '../../../lib/markers.mjs';

const TS = '2026-05-17T06:23:18Z';
const SIG = 'env=1,tty=0,ci=0';

test('buildFullAutoFootnoteBlock contains delimiters, ts, and signals', () => {
  const block = buildFullAutoFootnoteBlock({ ts: TS, signals: SIG });
  assert.match(block, new RegExp(FULL_AUTO_FOOTNOTE_START.replace(/[!]/g, '\\!')));
  assert.ok(block.includes(FULL_AUTO_FOOTNOTE_END));
  assert.ok(block.includes(TS));
  assert.ok(block.includes(SIG));
  assert.ok(block.includes('Full-Auto mode enabled'));
});

test('hasFullAutoFootnote detects presence', () => {
  assert.equal(hasFullAutoFootnote(''), false);
  assert.equal(hasFullAutoFootnote('plain body'), false);
  assert.equal(
    hasFullAutoFootnote(`x\n${FULL_AUTO_FOOTNOTE_START}\nbody\n${FULL_AUTO_FOOTNOTE_END}\n`),
    true
  );
});

// #178 — body that legitimately contains BOTH delimiters in prose (e.g., a
// deep-dive describing the block format and the matcher regex inline) must
// NOT trip the presence check. Pre-tighten bug: the block regex matched the
// prose-embedded pair, sending insert down the "replace" branch, which then
// destroyed the prose between the two delimiters by overwriting it with the
// real footnote block. This was the corruption that hit #178 itself.
test('hasFullAutoFootnote ignores prose-embedded start+end pair (backtick-wrapped)', () => {
  const body = [
    'Scope describes the matcher: `' + FULL_AUTO_FOOTNOTE_START + '` and',
    '`' + FULL_AUTO_FOOTNOTE_END + '` are the delimiters used by the regex.',
    '',
    'No real block on its own line — both mentions are wrapped in backticks.',
  ].join('\n');
  assert.equal(hasFullAutoFootnote(body), false);
});

test('insertFullAutoFootnote inserts (not replaces) when both delimiters appear only in prose (#178 corruption regression)', () => {
  const body = [
    '## Scope',
    'The matcher regex is `' +
      FULL_AUTO_FOOTNOTE_START +
      '[\\s\\S]*?' +
      FULL_AUTO_FOOTNOTE_END +
      '\\n?/g`.',
    'Both delimiters are mentioned here in prose; neither sits alone on its own line.',
    '',
    '#### Lifecycle (auto-ticked at Review/Close)',
    '- [x] Passed final human review',
    '- [x] Story closed and moved to Done',
    '- [x] Timing data flushed to issue',
    '',
    '## Tail',
  ].join('\n');
  const out = insertFullAutoFootnote(body, { ts: TS, signals: SIG });
  // Prose mentions preserved verbatim — original sentence intact.
  assert.ok(
    out.includes(
      'Both delimiters are mentioned here in prose; neither sits alone on its own line.'
    ),
    'prose between mentions must not be overwritten'
  );
  // Exactly one real block was inserted (at Lifecycle anchor), so total
  // start-delimiter count = prose mention (1) + real block (1) = 2.
  const escaped = FULL_AUTO_FOOTNOTE_START.replace(/[!*+?^${}()|[\]\\]/g, '\\$&');
  const startMatches = out.match(new RegExp(escaped, 'g'));
  assert.equal(startMatches.length, 2, 'prose mention + one real block');
  const lifeIdx = out.indexOf('#### Lifecycle');
  const tailIdx = out.indexOf('## Tail');
  // Find the index of the real block's start delimiter (the one that sits
  // alone on its own line, not the prose-embedded one).
  const realStartIdx = out.indexOf('\n' + FULL_AUTO_FOOTNOTE_START + '\n');
  assert.ok(
    realStartIdx > lifeIdx && realStartIdx < tailIdx,
    'real block anchored after Lifecycle, before Tail'
  );
});

test('hasFullAutoFootnote ignores prose mention of start delimiter alone', () => {
  const body = `Some scope text mentions the marker \`${FULL_AUTO_FOOTNOTE_START}\` in a code span.\nNo real block here.`;
  assert.equal(hasFullAutoFootnote(body), false);
});

test('insertFullAutoFootnote inserts block when only prose-mention of start delimiter exists (#178 regression)', () => {
  const body = [
    '## Scope',
    `The bug is that ${FULL_AUTO_FOOTNOTE_START} is mentioned in this prose,`,
    'which used to fool the presence check.',
    '',
    '#### Lifecycle (auto-ticked at Review/Close)',
    '- [x] Passed final human review',
    '- [x] Story closed and moved to Done',
    '- [x] Timing data flushed to issue',
    '',
    '## Tail',
  ].join('\n');
  const out = insertFullAutoFootnote(body, { ts: TS, signals: SIG });
  // Exactly two occurrences of FULL_AUTO_FOOTNOTE_START: the prose mention
  // (preserved verbatim) and the real block (newly inserted).
  const escaped = FULL_AUTO_FOOTNOTE_START.replace(/[!*+?^${}()|[\]\\]/g, '\\$&');
  const matches = out.match(new RegExp(escaped, 'g'));
  assert.equal(matches.length, 2, 'expected prose mention + real block');
  // Real block must contain end delimiter, payload, and Lifecycle anchor.
  assert.ok(out.includes(FULL_AUTO_FOOTNOTE_END), 'end delimiter present');
  assert.ok(out.includes(TS), 'timestamp present');
  assert.ok(out.includes(SIG), 'signals present');
  // Block sits after Lifecycle subsection, before Tail heading.
  const lifeIdx = out.indexOf('#### Lifecycle');
  const tailIdx = out.indexOf('## Tail');
  const endIdx = out.indexOf(FULL_AUTO_FOOTNOTE_END);
  assert.ok(endIdx > lifeIdx && endIdx < tailIdx, 'block anchored after Lifecycle, before Tail');
});

test('insertFullAutoFootnote anchors after Lifecycle subsection checklist', () => {
  const body = [
    '## Acceptance Criteria',
    '- [x] do thing',
    '',
    '### Definition of Done',
    '',
    '#### Lifecycle (auto-ticked at Review/Close)',
    '- [x] Passed final human review',
    '- [x] Story closed and moved to Done',
    '- [x] Timing data flushed to issue',
    '',
    '## Next Section',
    'content',
  ].join('\n');
  const out = insertFullAutoFootnote(body, { ts: TS, signals: SIG });
  const blockIdx = out.indexOf(FULL_AUTO_FOOTNOTE_START);
  const lifeIdx = out.indexOf('#### Lifecycle');
  const nextIdx = out.indexOf('## Next Section');
  assert.ok(blockIdx > lifeIdx, 'block after Lifecycle heading');
  assert.ok(blockIdx < nextIdx, 'block before next section');
  assert.ok(out.includes('- [x] Timing data flushed to issue'));
});

test('insertFullAutoFootnote anchors at end of DoD when no Lifecycle subsection', () => {
  const body = [
    '## Acceptance Criteria',
    '- [x] do thing',
    '',
    '### Definition of Done',
    '- [x] code merged',
    '',
    '## Other Heading',
    'tail',
  ].join('\n');
  const out = insertFullAutoFootnote(body, { ts: TS, signals: SIG });
  const blockIdx = out.indexOf(FULL_AUTO_FOOTNOTE_START);
  const dodIdx = out.indexOf('### Definition of Done');
  const otherIdx = out.indexOf('## Other Heading');
  assert.ok(blockIdx > dodIdx);
  assert.ok(blockIdx < otherIdx);
});

test('insertFullAutoFootnote appends to end when no DoD or Lifecycle', () => {
  const body = '## Just A Body\nno DoD here.';
  const out = insertFullAutoFootnote(body, { ts: TS, signals: SIG });
  assert.ok(out.includes(FULL_AUTO_FOOTNOTE_START));
  assert.ok(out.indexOf(FULL_AUTO_FOOTNOTE_START) > body.length - 5);
});

test('insertFullAutoFootnote is idempotent — replaces existing block in place', () => {
  const body = [
    '#### Lifecycle (auto-ticked at Review/Close)',
    '- [x] Passed final human review',
    '',
    FULL_AUTO_FOOTNOTE_START,
    '> stale',
    FULL_AUTO_FOOTNOTE_END,
    '',
    '## Tail',
  ].join('\n');
  const out = insertFullAutoFootnote(body, { ts: TS, signals: SIG });
  // Only one block.
  const matches = out.match(
    new RegExp(FULL_AUTO_FOOTNOTE_START.replace(/[!*+?^${}()|[\]\\]/g, '\\$&'), 'g')
  );
  assert.equal(matches.length, 1);
  assert.ok(out.includes(TS));
  assert.ok(out.includes(SIG));
  assert.ok(!out.includes('> stale'));
  // Re-invocation is stable.
  const out2 = insertFullAutoFootnote(out, { ts: TS, signals: SIG });
  assert.equal(out2, out);
});

test('removeFullAutoFootnote strips the block; no-op if absent', () => {
  const body = `x\n${FULL_AUTO_FOOTNOTE_START}\n> z\n${FULL_AUTO_FOOTNOTE_END}\ny`;
  const out = removeFullAutoFootnote(body);
  assert.ok(!out.includes(FULL_AUTO_FOOTNOTE_START));
  assert.ok(!out.includes(FULL_AUTO_FOOTNOTE_END));
  assert.equal(removeFullAutoFootnote('plain'), 'plain');
});
