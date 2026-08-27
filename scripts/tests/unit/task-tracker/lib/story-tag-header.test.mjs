// @chore
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasPermittedStoryTag,
  moveMalformedStoryTag,
} from '../../../../task-tracker/lib/story-tag-header.mjs';

test('a story tag on line one is permitted', () => {
  assert.equal(hasPermittedStoryTag('// @story #876\n\nimport x;\n'), true);
});

test('a story tag after a shebang is permitted', () => {
  assert.equal(hasPermittedStoryTag('#!/usr/bin/env node\n// @story #876\n'), true);
});

test('a cspell preamble may follow the tag', () => {
  assert.equal(hasPermittedStoryTag('// @story #876\n// cspell:ignore foo\nimport x;\n'), true);
});

test('an untagged file is refused', () => {
  assert.equal(hasPermittedStoryTag('import x;\n'), false);
});

test('a chore tag on line one is permitted', () => {
  assert.equal(hasPermittedStoryTag('// @chore\n\nimport x;\n'), true);
});

test('a chore tag after a shebang is permitted', () => {
  assert.equal(hasPermittedStoryTag('#!/usr/bin/env node\n// @chore\n'), true);
});

test('a cspell preamble may follow a chore tag', () => {
  assert.equal(hasPermittedStoryTag('// @chore\n// cspell:ignore foo\nimport x;\n'), true);
});

test('a chore tag with trailing prose is permitted', () => {
  assert.equal(hasPermittedStoryTag('// @chore book composition path\n'), true);
});

test('a bare @chore without the comment marker is refused', () => {
  assert.equal(hasPermittedStoryTag('@chore\n'), false);
});

test('a chore tag below the first line is refused', () => {
  assert.equal(hasPermittedStoryTag('import x;\n// @chore\n'), false);
});

test('a shebang after a chore tag is still refused', () => {
  assert.equal(hasPermittedStoryTag('// @chore\n#!/usr/bin/env node\n'), false);
});

test('moveMalformedStoryTag leaves an already-valid chore tag alone', () => {
  assert.equal(moveMalformedStoryTag('// @chore\nimport x;\n'), null);
});

test('moveMalformedStoryTag still repairs a out-of-order story tag', () => {
  assert.equal(
    moveMalformedStoryTag('// cspell:ignore foo\n// @story #876\nimport x;\n'),
    '// @story #876\n// cspell:ignore foo\nimport x;\n'
  );
});
