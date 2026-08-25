// @chore
import assert from 'node:assert/strict';
import test from 'node:test';

import { applyBookStrip } from '../../../../articles/lib/book/strip.mjs';

const text = (t) => ({ kind: 'text', text: t });
const marker = (verb, attrs = {}) => ({ kind: 'marker', verb, attrs });

test('applyBookStrip removes channel sections and lifts the bibliography', () => {
  const scanned = [
    { heading: null, items: [text('_Part 3 of a series of articles on X_'), text('Opening.')] },
    { heading: 'Body', items: [text('Prose.')] },
    { heading: 'Series Link', items: [text('The next article...')] },
    { heading: 'Series Roadmap', items: [text('| a | b |')] },
    { heading: 'LinkedIn Article Shape', items: [text('hook')] },
    { heading: 'Bibliography', items: [text('- Pub. "T." https://e.com/a')] },
  ];

  const { sections, bibliographyLines } = applyBookStrip(scanned);

  assert.deepEqual(
    sections.map((s) => s.heading),
    [null, 'Body']
  );
  assert.deepEqual(sections[0].items, [text('Opening.')]);
  assert.deepEqual(bibliographyLines, ['- Pub. "T." https://e.com/a']);
});

test('applyBookStrip drops exclude spans and their markers', () => {
  const scanned = [
    {
      heading: 'Body',
      items: [
        text('keep one'),
        marker('exclude'),
        text('drop me'),
        marker('end'),
        text('keep two'),
      ],
    },
  ];
  const { sections } = applyBookStrip(scanned);
  assert.deepEqual(sections[0].items, [text('keep one'), text('keep two')]);
});

test('applyBookStrip drops a section that becomes empty', () => {
  const scanned = [
    { heading: null, items: [text('intro')] },
    { heading: 'Gone', items: [marker('exclude'), text('all of it'), marker('end')] },
  ];
  const { sections } = applyBookStrip(scanned);
  assert.deepEqual(
    sections.map((s) => s.heading),
    [null]
  );
});
