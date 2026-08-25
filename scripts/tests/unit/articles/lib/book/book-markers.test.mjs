// @chore
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MarkerError,
  parseMarkerLine,
  scanSections,
  validateArticle,
} from '../../../../../articles/lib/book/markers.mjs';

test('parseMarkerLine reads verbs and quoted attributes', () => {
  assert.deepEqual(parseMarkerLine('<!-- book:pagebreak -->', 'f.md'), {
    verb: 'pagebreak',
    attrs: {},
  });
  assert.deepEqual(parseMarkerLine('<!-- book:part title="How We Got Here" -->', 'f.md'), {
    verb: 'part',
    attrs: { title: 'How We Got Here' },
  });
  assert.deepEqual(parseMarkerLine('<!-- book:include path=fragments/a.md -->', 'f.md'), {
    verb: 'include',
    attrs: { path: 'fragments/a.md' },
  });
  assert.equal(parseMarkerLine('<!-- markdownlint-disable MD034 -->', 'f.md'), null);
  assert.equal(parseMarkerLine('ordinary prose', 'f.md'), null);
});

test('parseMarkerLine rejects unknown verbs and inline markers', () => {
  assert.throws(() => parseMarkerLine('<!-- book:chaptr title="x" -->', 'f.md'), MarkerError);
  assert.throws(() => parseMarkerLine('prose <!-- book:pagebreak --> more', 'f.md'), MarkerError);
});

test('scanSections splits text from markers and ignores fenced code', () => {
  const sections = [
    { heading: null, lines: ['<!-- book:chapter title="Ch" -->', 'prose'] },
    { heading: 'Body', lines: ['```', '<!-- book:pagebreak -->', '```', 'after'] },
  ];
  const scanned = scanSections(sections, 'f.md');
  assert.deepEqual(scanned[0].items, [
    { kind: 'marker', verb: 'chapter', attrs: { title: 'Ch' } },
    { kind: 'text', text: 'prose' },
  ]);
  assert.deepEqual(
    scanned[1].items.map((i) => i.kind),
    ['text', 'text', 'text', 'text']
  );
});

test('validateArticle rejects structural mistakes', () => {
  const withMarker = (heading, verb, attrs = {}) => [
    { heading: null, items: [{ kind: 'text', text: 'x' }] },
    { heading, items: [{ kind: 'marker', verb, attrs }] },
  ];

  assert.throws(
    () =>
      validateArticle(withMarker('Body', 'part', { title: 'P' }), { file: 'f.md', isFirst: false }),
    /preamble/
  );
  assert.throws(
    () =>
      validateArticle(
        [{ heading: null, items: [{ kind: 'marker', verb: 'merge-into-previous', attrs: {} }] }],
        {
          file: 'f.md',
          isFirst: true,
        }
      ),
    /first article/
  );
  assert.throws(
    () =>
      validateArticle(
        [{ heading: null, items: [{ kind: 'marker', verb: 'exclude', attrs: {} }] }],
        {
          file: 'f.md',
          isFirst: false,
        }
      ),
    /unclosed/
  );
  assert.throws(
    () =>
      validateArticle([{ heading: null, items: [{ kind: 'marker', verb: 'end', attrs: {} }] }], {
        file: 'f.md',
        isFirst: false,
      }),
    /without a matching/
  );
  assert.throws(
    () =>
      validateArticle([{ heading: null, items: [{ kind: 'marker', verb: 'demote', attrs: {} }] }], {
        file: 'f.md',
        isFirst: false,
      }),
    /integer/
  );
});

test('validateArticle accepts a well-formed article', () => {
  const scanned = [
    {
      heading: null,
      items: [
        { kind: 'marker', verb: 'part', attrs: { title: 'One' } },
        { kind: 'text', text: 'prose' },
      ],
    },
    {
      heading: 'Body',
      items: [
        { kind: 'marker', verb: 'exclude', attrs: {} },
        { kind: 'text', text: 'dropped' },
        { kind: 'marker', verb: 'end', attrs: {} },
      ],
    },
  ];
  assert.doesNotThrow(() => validateArticle(scanned, { file: 'f.md', isFirst: true }));
});
