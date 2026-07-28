// @story #1038

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const CONSUMERS = [
  'scripts/task-tracker/gh-timing-comment.mjs',
  'scripts/task-tracker/lib/bind-event.mjs',
  'scripts/task-tracker/lib/timing-rows.mjs',
  'scripts/task-tracker/lib/agent-review/validators/timing-log-sequence.mjs',
  'scripts/task-tracker/lib/heal-timing-log.mjs',
];

test('audited Timing Log consumers delegate lexical pipe-row parsing to the shared leaf', () => {
  for (const file of CONSUMERS) {
    const source = readFileSync(file, 'utf8');
    assert.match(source, /from ['"].*timing-row-reader\.mjs['"]/, `${file} must import the leaf`);
    assert.doesNotMatch(source, /\.split\(\s*['"]\|['"]\s*\)/, `${file} owns pipe splitting`);
    assert.doesNotMatch(
      source,
      /\b(?:TS_PATTERN|TS_LINE_RE|ROW_TS_RE)\b/,
      `${file} owns timing-row timestamp grammar`
    );
  }
});
