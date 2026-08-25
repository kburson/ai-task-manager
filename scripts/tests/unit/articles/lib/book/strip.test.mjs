// @chore
import assert from 'node:assert/strict';
import test from 'node:test';

import { applyBookStrip } from '../../../../../articles/lib/book/strip.mjs';

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

test('an exclude span that crosses a section boundary still excludes', () => {
  const scanned = [
    { heading: null, items: [{ kind: 'text', text: 'Keep me.' }] },
    {
      heading: 'Doomed',
      items: [
        { kind: 'marker', verb: 'exclude', attrs: {} },
        { kind: 'text', text: 'Drop me.' },
      ],
    },
    {
      heading: 'Also Doomed',
      items: [
        { kind: 'text', text: 'Drop me too.' },
        { kind: 'marker', verb: 'end', attrs: {} },
        { kind: 'text', text: 'Keep me again.' },
      ],
    },
    {
      heading: 'Later',
      items: [
        { kind: 'marker', verb: 'exclude', attrs: {} },
        { kind: 'text', text: 'Also dropped.' },
        { kind: 'marker', verb: 'end', attrs: {} },
        { kind: 'text', text: 'Still here.' },
      ],
    },
  ];

  const { sections } = applyBookStrip(scanned);
  const text = JSON.stringify(sections);

  assert.equal(text.includes('Drop me.'), false, 'the span drops prose in its opening section');
  assert.equal(text.includes('Drop me too.'), false, 'and keeps dropping in the next section');
  assert.equal(
    sections.some((s) => s.heading === 'Doomed'),
    false,
    'a section wholly inside the span loses its heading too'
  );
  assert.ok(text.includes('Keep me again.'), 'prose after book:end returns');
  assert.equal(text.includes('Also dropped.'), false, 'a later span is not neutered by the first');
  assert.ok(text.includes('Still here.'));
});

test('exclude spans are honoured inside the bibliography section', () => {
  const scanned = [
    {
      heading: 'Bibliography',
      items: [
        { kind: 'marker', verb: 'exclude', attrs: {} },
        { kind: 'text', text: 'No external sources are cited in this piece.' },
        { kind: 'marker', verb: 'end', attrs: {} },
        { kind: 'text', text: '- DORA. "A Report." https://dora.dev/x/' },
      ],
    },
  ];
  const { bibliographyLines } = applyBookStrip(scanned);
  assert.deepEqual(bibliographyLines, ['- DORA. "A Report." https://dora.dev/x/']);
});

test('bibliography blank lines survive, so wrapped entries stay distinguishable', () => {
  const scanned = [
    {
      heading: 'Bibliography',
      items: [
        { kind: 'text', text: '' },
        { kind: 'text', text: '- Beck, Kent. _Extreme Programming Explained._' },
        { kind: 'text', text: '  Addison-Wesley, 1999.' },
      ],
    },
  ];
  const { bibliographyLines } = applyBookStrip(scanned);
  assert.deepEqual(bibliographyLines, [
    '',
    '- Beck, Kent. _Extreme Programming Explained._',
    '  Addison-Wesley, 1999.',
  ]);
});
