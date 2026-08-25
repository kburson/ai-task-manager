// @chore
import assert from 'node:assert/strict';
import test from 'node:test';

import { dedupeSources, renderSources } from '../../../../../articles/lib/book/sources.mjs';

const entry = (publisher, title, url) => ({ publisher, title, url, raw: '' });

test('dedupeSources drops repeat URLs and sorts by publisher then title', () => {
  const merged = dedupeSources([
    [entry('Zed', 'Later', 'https://z.example/1'), entry('Acme', 'Beta', 'https://a.example/2')],
    [entry('Acme', 'Alpha', 'https://a.example/1'), entry('Zed', 'Later', 'https://z.example/1')],
  ]);
  assert.deepEqual(
    merged.map((e) => e.url),
    ['https://a.example/1', 'https://a.example/2', 'https://z.example/1']
  );
});

test('dedupeSources sorts case-insensitively', () => {
  const merged = dedupeSources([
    [entry('beta', 'x', 'https://b/'), entry('Alpha', 'x', 'https://a/')],
  ]);
  assert.deepEqual(
    merged.map((e) => e.publisher),
    ['Alpha', 'beta']
  );
});

test('renderSources emits one bullet per entry', () => {
  const lines = renderSources([entry('Acme', 'Alpha', 'https://a.example/1')]);
  assert.deepEqual(lines, ['- Acme. "Alpha." <https://a.example/1>']);
});

const bib = (over) => ({ publisher: null, title: null, url: null, suffix: '', ...over });

test('entries with no URL dedupe on their raw text rather than colliding on null', () => {
  const a = bib({ raw: 'Glass, R. L. _Facts and Fallacies of Software Engineering_.' });
  const b = bib({ raw: 'Willison, S. (April 2026). An essay on discarding a prototype.' });
  const aAgain = bib({ raw: 'Glass, R. L. _Facts and Fallacies of Software Engineering_ ' });

  const merged = dedupeSources([[a, b], [aAgain]]);
  assert.equal(merged.length, 2, 'two distinct URL-less citations both survive');
  assert.deepEqual(
    merged.map((e) => e.raw.split(',')[0]),
    ['Glass', 'Willison']
  );
});

test('URL-less entries sort by the leading token of their raw text', () => {
  const merged = dedupeSources([
    [
      bib({ raw: 'Willison, S. (April 2026). An essay.' }),
      bib({ publisher: 'Atlassian', title: 'Refinement', url: 'https://x/1', raw: 'x' }),
      bib({ raw: 'Beck, Kent. _Extreme Programming Explained._' }),
    ],
  ]);
  assert.deepEqual(
    merged.map((e) => e.publisher ?? e.raw.split(',')[0]),
    ['Atlassian', 'Beck', 'Willison']
  );
});

test('renderSources emits the raw text for entries it could not structure', () => {
  const lines = renderSources([
    bib({
      publisher: 'JetBrains',
      title: 'ReSharper 20 Years!',
      url: 'https://blog.jetbrains.com/x/',
      suffix: 'JetBrains Blog, 2024-07-23.',
      raw: 'ignored',
    }),
    bib({ raw: 'Glass, R. L. _Facts and Fallacies of Software Engineering_.' }),
  ]);
  assert.deepEqual(lines, [
    '- JetBrains. "ReSharper 20 Years!" <https://blog.jetbrains.com/x/> JetBrains Blog, 2024-07-23.',
    '- Glass, R. L. _Facts and Fallacies of Software Engineering_.',
  ]);
});
