// @chore
import assert from 'node:assert/strict';
import test from 'node:test';

import { planChapters, shiftHeading } from '../../../../../articles/lib/book/headings.mjs';

test('shiftHeading moves only heading lines', () => {
  assert.equal(shiftHeading('## Body', 1), '### Body');
  assert.equal(shiftHeading('### Deep', 2), '##### Deep');
  assert.equal(shiftHeading('## Body', 0), '## Body');
  assert.equal(shiftHeading('not a heading', 2), 'not a heading');
  assert.equal(shiftHeading('#hashtag', 1), '#hashtag');
  assert.throws(() => shiftHeading('##### Deep', 2), RangeError);
});

const article = (slug, over = {}) => ({
  slug,
  title: `Title ${slug}`,
  chapterTitle: null,
  part: null,
  mergeIntoPrevious: false,
  sections: [],
  ...over,
});

test('planChapters gives each article its own chapter by default', () => {
  const chapters = planChapters([article('01'), article('02')]);
  assert.deepEqual(
    chapters.map((c) => [c.number, c.title, c.members.length]),
    [
      [1, 'Title 01', 1],
      [2, 'Title 02', 1],
    ]
  );
  assert.equal(chapters[0].members[0].shift, 0);
});

test('planChapters folds merged articles into the previous chapter', () => {
  const chapters = planChapters([article('01'), article('02', { mergeIntoPrevious: true })]);
  assert.equal(chapters.length, 1);
  assert.equal(chapters[0].members.length, 2);
  assert.equal(chapters[0].members[0].shift, 0);
  assert.equal(chapters[0].members[1].shift, 1);
});

test('planChapters honours chapter title overrides and part boundaries', () => {
  const chapters = planChapters([
    article('01', { part: 'How We Got Here' }),
    article('02', { chapterTitle: 'Custom' }),
  ]);
  assert.equal(chapters[0].part, 'How We Got Here');
  assert.equal(chapters[1].part, null);
  assert.equal(chapters[1].title, 'Custom');
});
