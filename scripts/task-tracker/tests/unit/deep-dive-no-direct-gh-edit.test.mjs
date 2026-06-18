#!/usr/bin/env node
// @story #324
// #324 / #325 follow-on regression: `lib/deep-dive.mjs` must NOT contain a
// direct `gh issue edit` invocation. All body writes from this module must
// route through `mutateIssueBody`.
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.resolve(here, '..', '../lib/deep-dive.mjs'), 'utf8');

assert.equal(
  /gh\s+issue\s+edit/.test(src),
  false,
  '#324: lib/deep-dive.mjs must not call `gh issue edit` directly — route writes through mutateIssueBody'
);

console.log('deep-dive-no-direct-gh-edit.test.mjs: passed');
