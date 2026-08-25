// @chore
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CitationError,
  convertLine,
  parseBibliography,
} from '../../../../articles/lib/book/footnotes.mjs';

test('parseBibliography reads publisher, title, and url', () => {
  const entries = parseBibliography([
    '- DORA. "State of AI-assisted Software Development 2025." https://dora.dev/dora-report-2025/',
    '',
    '- METR. "Measuring the Impact." https://metr.org/blog/x/',
  ]);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], {
    publisher: 'DORA',
    title: 'State of AI-assisted Software Development 2025',
    url: 'https://dora.dev/dora-report-2025/',
    raw: '- DORA. "State of AI-assisted Software Development 2025." https://dora.dev/dora-report-2025/',
  });
});

const makeCtx = (over = {}) => ({
  bibByUrl: new Map([
    ['https://dora.dev/x/', { publisher: 'DORA', title: 'A Report', url: 'https://dora.dev/x/' }],
  ]),
  chapterBySlug: new Map([['05-easy-come-easy-go', 5]]),
  footnotes: [],
  idPrefix: 'c03',
  file: '03-x.md',
  ...over,
});

test('external links become footnotes sourced from the bibliography', () => {
  const ctx = makeCtx();
  const out = convertLine('As shown ([DORA report](https://dora.dev/x/)).', ctx);
  assert.equal(out, 'As shown (DORA report[^c03-1]).');
  assert.deepEqual(ctx.footnotes, [
    { id: 'c03-1', text: 'DORA. "A Report." <https://dora.dev/x/>' },
  ]);
});

test('an external link with no bibliography entry falls back to its label', () => {
  const ctx = makeCtx();
  convertLine('See [Some Page](https://example.com/z).', ctx);
  assert.deepEqual(ctx.footnotes, [{ id: 'c03-1', text: 'Some Page. <https://example.com/z>' }]);
});

test('sibling article links become chapter cross-references', () => {
  const ctx = makeCtx();
  const out = convertLine('see [Easy Come](05-easy-come-easy-go.md) for more.', ctx);
  assert.equal(out, 'see Easy Come (Chapter 5) for more.');
  assert.deepEqual(ctx.footnotes, []);
});

test('images are left alone', () => {
  const ctx = makeCtx();
  assert.equal(convertLine('![alt](assets/x.png)', ctx), '![alt](assets/x.png)');
  assert.deepEqual(ctx.footnotes, []);
});

test('a sibling article link with a heading anchor still resolves to a chapter', () => {
  const ctx = makeCtx();
  const out = convertLine('see [Easy Come](05-easy-come-easy-go.md#a-heading) for more.', ctx);
  assert.equal(out, 'see Easy Come (Chapter 5) for more.');
  assert.deepEqual(ctx.footnotes, []);
});

test('a same-document anchor link is left alone', () => {
  const ctx = makeCtx();
  assert.equal(
    convertLine('see [the pattern](#aitm-and-the-backlog-manager-pattern) below.', ctx),
    'see [the pattern](#aitm-and-the-backlog-manager-pattern) below.'
  );
  assert.deepEqual(ctx.footnotes, []);
});

test('a link that resolves to neither is a loud failure', () => {
  const ctx = makeCtx();
  assert.throws(() => convertLine('[gone](99-not-on-spine.md)', ctx), CitationError);
  assert.throws(() => convertLine('[gone](../guides/workflow.md)', ctx), CitationError);
});

test('footnote numbering continues across calls within a chapter', () => {
  const ctx = makeCtx();
  convertLine('[a](https://example.com/a)', ctx);
  convertLine('[b](https://example.com/b)', ctx);
  assert.deepEqual(
    ctx.footnotes.map((f) => f.id),
    ['c03-1', 'c03-2']
  );
});
