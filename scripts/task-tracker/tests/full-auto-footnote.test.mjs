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
} from '../lib/markers.mjs';

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
