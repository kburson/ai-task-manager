// @chore
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  annotateLines,
  buildMatcher,
  renderLinkedIndex,
} from '../../../../articles/lib/book/index-terms.mjs';

const TERMS = [
  { term: 'Evidence gate', aliases: ['evidence gates'], seeAlso: [], definition: 'x' },
  { term: 'Agent fleet', aliases: [], seeAlso: [], definition: 'y' },
];

const location = { chapter: 3, section: 'Body' };

test('annotateLines injects one latex index entry per term per section', () => {
  const matcher = buildMatcher(TERMS);
  const hits = new Map();
  const seen = new Set();
  const out = annotateLines(
    ['An evidence gate is a check.', 'Another evidence gate appears.', 'The agent fleet runs.'],
    matcher,
    { target: 'pdf', location, hits, seen }
  );
  assert.equal(out[0], 'An evidence gate is a check.\\index{Evidence gate}');
  assert.equal(out[1], 'Another evidence gate appears.');
  assert.equal(out[2], 'The agent fleet runs.\\index{Agent fleet}');
  assert.deepEqual([...hits.keys()], ['Evidence gate', 'Agent fleet']);
});

test('a fresh section seen-set allows the same term to be indexed again', () => {
  const matcher = buildMatcher(TERMS);
  const hits = new Map();
  annotateLines(['an evidence gate'], matcher, { target: 'pdf', location, hits, seen: new Set() });
  annotateLines(['an evidence gate'], matcher, {
    target: 'pdf',
    location: { chapter: 4, section: 'Other' },
    hits,
    seen: new Set(),
  });
  assert.equal(hits.get('Evidence gate').length, 2);
});

test('anchor target emits html anchors instead of latex', () => {
  const matcher = buildMatcher(TERMS);
  const out = annotateLines(['an evidence gate'], matcher, {
    target: 'anchor',
    location,
    hits: new Map(),
    seen: new Set(),
  });
  assert.equal(out[0], 'an evidence gate<a id="ix-evidence-gate-3-1"></a>');
});

test('none target records hits without touching the prose', () => {
  const matcher = buildMatcher(TERMS);
  const hits = new Map();
  const out = annotateLines(['an evidence gate'], matcher, {
    target: 'none',
    location,
    hits,
    seen: new Set(),
  });
  assert.equal(out[0], 'an evidence gate');
  assert.equal(hits.get('Evidence gate').length, 1);
});

test('matching skips fenced code and existing links', () => {
  const matcher = buildMatcher(TERMS);
  const hits = new Map();
  const out = annotateLines(['```', 'an evidence gate', '```'], matcher, {
    target: 'pdf',
    location,
    hits,
    seen: new Set(),
  });
  assert.deepEqual(out, ['```', 'an evidence gate', '```']);
  assert.equal(hits.size, 0);
});

test('renderLinkedIndex lists terms alphabetically with chapter and section', () => {
  const hits = new Map([
    ['Evidence gate', [{ chapter: 3, section: 'Body' }]],
    ['Agent fleet', [{ chapter: 1, section: 'Intro' }]],
  ]);
  const lines = renderLinkedIndex(hits);
  assert.equal(lines[0], '- **Agent fleet** — Chapter 1 (Intro)');
  assert.equal(lines[1], '- **Evidence gate** — Chapter 3 (Body)');
});
