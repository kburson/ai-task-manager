#!/usr/bin/env node
// @story #158
// Source-level lock for #158 (D2).
//
// Prevents regression to raw cross-unit subtraction in the Review delta
// renderer. The old code computed `actNum - estNum` where `actNum` was
// minutes (engagedTime) and `estNum` was hours (estimate). The new code
// normalizes both to seconds in `computeReviewDelta`. If anyone reintroduces
// the raw `*Num - *Num` shape, this test fails loudly.

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(__dirname, '..', '..', 'lib', 'review-delta.mjs'), 'utf8');

assert.ok(
  !/actNum\s*-\s*estNum/.test(src),
  'lib/review-delta.mjs must not contain raw `actNum - estNum` — use second-precision compute via computeReviewDelta'
);

assert.ok(
  !/\|\s*Hours\s*\|/.test(src),
  'lib/review-delta.mjs must not render a `| Hours |` column — use `| Story effort |` with H:MM:SS values'
);

assert.ok(
  !/Drivers:\s+see review notes/.test(src),
  'lib/review-delta.mjs must not emit dead-end "Drivers: see review notes." placeholder — omit the section when drivers is empty'
);

console.log('review-delta-source-lock.test.mjs: all passed');
