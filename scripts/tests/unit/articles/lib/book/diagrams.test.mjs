// @chore
import assert from 'node:assert/strict';
import test from 'node:test';

import { extractBookDiagrams } from '../../../../../articles/lib/book/diagrams.mjs';

const text = (t) => ({ kind: 'text', text: t });

test('extractBookDiagrams replaces fences with image references', () => {
  const sections = [
    {
      heading: 'Body',
      items: [
        text('Before.'),
        text('```mermaid'),
        text('flowchart LR'),
        text('  A --> B'),
        text('```'),
        text('After.'),
      ],
    },
  ];
  const { sections: out, diagrams } = extractBookDiagrams(sections, '03-slug');

  assert.deepEqual(diagrams, [
    { code: 'flowchart LR\n  A --> B', imageName: '03-slug-diagram-1.png' },
  ]);
  assert.deepEqual(out[0].items, [
    text('Before.'),
    text('![](03-slug-diagram-1.png){.book-diagram}'),
    text('After.'),
  ]);
});

test('extractBookDiagrams numbers diagrams across sections in document order', () => {
  const fence = () => [text('```mermaid'), text('graph TD'), text('```')];
  const { diagrams } = extractBookDiagrams(
    [
      { heading: 'One', items: fence() },
      { heading: 'Two', items: fence() },
    ],
    '04-slug'
  );
  assert.deepEqual(
    diagrams.map((d) => d.imageName),
    ['04-slug-diagram-1.png', '04-slug-diagram-2.png']
  );
});

test('extractBookDiagrams leaves non-mermaid fences alone', () => {
  const items = [text('```json'), text('{}'), text('```')];
  const { sections, diagrams } = extractBookDiagrams([{ heading: 'B', items }], '05-slug');
  assert.deepEqual(sections[0].items, items);
  assert.deepEqual(diagrams, []);
});

test('an unterminated mermaid fence is a loud failure', () => {
  assert.throws(
    () =>
      extractBookDiagrams(
        [{ heading: 'B', items: [text('```mermaid'), text('graph TD')] }],
        '06-s'
      ),
    /unterminated/
  );
});
