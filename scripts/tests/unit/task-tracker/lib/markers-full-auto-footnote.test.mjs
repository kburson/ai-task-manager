// @story #1172
// Historical Full-Auto approval footnotes predate the delimiter block. Stale
// approval reconciliation must remove only those canonical unbounded carriers.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import * as markers from '../../../../task-tracker/lib/markers.mjs';

const legacyFootnote = (ts = '2026-08-07T20:30:40Z') =>
  [
    '> ⚙️ **Full-Auto mode enabled: human review skipped.**',
    `> Approval was stamped by an autonomous agent (\`reviewer-unset=1,env=1,tty=1,ci=0\`) at ${ts}.`,
    '> Hidden marker: `aitm-review-approved full-auto="yes"`.',
  ].join('\n');

test('removes every exact legacy unbounded Full-Auto footnote', () => {
  assert.equal(typeof markers.removeLegacyFullAutoFootnote, 'function');
  const body = [
    'before',
    '',
    legacyFootnote(),
    '',
    'middle',
    '',
    legacyFootnote(),
    '',
    'after',
  ].join('\n');

  assert.equal(markers.removeLegacyFullAutoFootnote(body), 'before\n\nmiddle\n\nafter');
});

test('preserves fenced lookalikes, delimited blocks, prose mentions, and unrelated blockquotes', () => {
  assert.equal(typeof markers.removeLegacyFullAutoFootnote, 'function');
  const fenced = ['```md', legacyFootnote(), '```'].join('\n');
  const delimited = markers.buildFullAutoFootnoteBlock({
    ts: '2026-08-08T00:11:31Z',
    signals: 'reviewer-unset=1,env=1,tty=1,ci=0',
  });
  const prose = 'The Full-Auto mode enabled footnote is documented here.';
  const unrelated = '> Approval was stamped by a release manager.';
  const body = [fenced, '', delimited, '', prose, '', unrelated].join('\n');

  assert.equal(markers.removeLegacyFullAutoFootnote(body), body);
});

test('is idempotent when no canonical legacy footnote is present', () => {
  assert.equal(typeof markers.removeLegacyFullAutoFootnote, 'function');
  const body = 'plain body\n\n> unrelated note\n';
  assert.equal(markers.removeLegacyFullAutoFootnote(body), body);
});
