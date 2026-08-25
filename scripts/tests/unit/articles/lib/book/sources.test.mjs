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
