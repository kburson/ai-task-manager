// @chore
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CitationError,
  convertLine,
  footnoteText,
  parseBibliography,
} from '../../../../../articles/lib/book/footnotes.mjs';

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
    suffix: '',
    raw: 'DORA. "State of AI-assisted Software Development 2025." https://dora.dev/dora-report-2025/',
  });
});

test('every list item becomes an entry, whatever shape the citation takes', () => {
  const entries = parseBibliography(
    [
      '- JetBrains, ["ReSharper 20 Years!"](https://blog.jetbrains.com/x/), JetBrains Blog, 2024-07-23.',
      '- Wikipedia, ["Visual Studio Code"](https://en.wikipedia.org/wiki/Visual_Studio_Code).',
      '- Atlassian. "What is backlog refinement?" https://www.atlassian.com/agile/scrum/backlog-refinement',
      '- Thaler, R. H., & Johnson, E. J. (1990). "Gambling with the House Money." _Management Science_.',
      '- Glass, R. L. _Facts and Fallacies of Software Engineering_.',
      '- Beck, Kent. _Extreme Programming Explained: Embrace Change._',
      '  Addison-Wesley, 1999.',
    ],
    '01-x.md'
  );

  assert.equal(entries.length, 6, 'no shape is dropped and the wrapped entry is one entry');

  assert.equal(entries[0].publisher, 'JetBrains');
  assert.equal(entries[0].title, 'ReSharper 20 Years!', 'a title ending in ! still parses');
  assert.equal(entries[0].url, 'https://blog.jetbrains.com/x/');
  assert.equal(entries[0].suffix, 'JetBrains Blog, 2024-07-23.');

  assert.equal(entries[1].suffix, '', 'a bare sentence period is not trailing context');

  assert.equal(entries[2].title, 'What is backlog refinement?', 'a title ending in ? still parses');
  assert.equal(entries[2].url, 'https://www.atlassian.com/agile/scrum/backlog-refinement');

  assert.equal(entries[3].publisher, 'Thaler, R. H., & Johnson, E. J. (1990)');
  assert.equal(entries[3].url, null, 'an author-date entry with no URL is still an entry');

  assert.equal(entries[4].publisher, null, 'an unparseable shape keeps only its raw text');
  assert.equal(entries[4].raw, 'Glass, R. L. _Facts and Fallacies of Software Engineering_.');

  assert.equal(
    entries[5].raw,
    'Beck, Kent. _Extreme Programming Explained: Embrace Change._ Addison-Wesley, 1999.',
    'a line-wrapped entry is joined onto the item it continues'
  );
});

test('a bibliography line that is neither a list item nor a continuation is loud', () => {
  assert.throws(
    () =>
      parseBibliography(
        ['- DORA. "A Report." https://dora.dev/x/', '', 'No external sources are cited here.'],
        '12-x.md'
      ),
    (error) => error instanceof CitationError && /12-x\.md/.test(error.message)
  );
});

test('footnoteText falls back to the raw entry when the shape gave no structure', () => {
  const [structured, bare] = parseBibliography([
    '- DORA. "A Report." https://dora.dev/x/',
    '- Glass, R. L. _Facts and Fallacies_.',
  ]);
  assert.equal(footnoteText(structured), 'DORA. "A Report." <https://dora.dev/x/>');
  assert.equal(footnoteText(bare), 'Glass, R. L. _Facts and Fallacies_.');
});

test('a footnote uses the bibliography entry even when its title ends in a question mark', () => {
  const [entry] = parseBibliography([
    '- Atlassian. "What is backlog refinement?" https://www.atlassian.com/agile/scrum/backlog-refinement',
  ]);
  const ctx = makeCtx({ bibByUrl: new Map([[entry.url, entry]]) });
  convertLine(`See [refinement](${entry.url}).`, ctx);
  assert.deepEqual(ctx.footnotes, [
    {
      id: 'c03-1',
      text: 'Atlassian. "What is backlog refinement?" <https://www.atlassian.com/agile/scrum/backlog-refinement>',
    },
  ]);
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
