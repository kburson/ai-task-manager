// @chore
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseArticle } from '../../../../../articles/lib/parse-article.mjs';

const SOURCE = `# Title

<!-- book:part title="One" -->

Intro line.

## First

<!-- book:pagebreak -->

Body line.
`;

test('comments are stripped by default', () => {
  const article = parseArticle(SOURCE);
  const all = article.sections.flatMap((s) => s.lines).join('\n');
  assert.equal(all.includes('book:part'), false);
  assert.equal(all.includes('book:pagebreak'), false);
});

test('keepComments preserves marker lines in place', () => {
  const article = parseArticle(SOURCE, { keepComments: true });
  assert.equal(article.title, 'Title');
  assert.deepEqual(article.sections[0].lines, [
    '<!-- book:part title="One" -->',
    '',
    'Intro line.',
  ]);
  assert.equal(article.sections[1].heading, 'First');
  assert.deepEqual(article.sections[1].lines, ['<!-- book:pagebreak -->', '', 'Body line.']);
});
