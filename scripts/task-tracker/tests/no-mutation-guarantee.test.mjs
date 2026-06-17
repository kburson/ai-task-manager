#!/usr/bin/env node
// @story #77
// Regression tripwire: the review-delta hook is read-only. If anyone later
// adds a `writeProjectFieldValue(` call to `lib/apply-review-delta.mjs` or
// to the `verbClose` block in `task-tracker.mjs`, this test fails loudly.
//
// The check is a coarse substring scan — not a proof, but enough to catch
// accidental regressions from the obvious mutation entry points.

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function assertNoMutation(label, source, banned) {
  for (const pat of banned) {
    const idx = source.indexOf(pat);
    if (idx >= 0) {
      const lineNo = source.slice(0, idx).split('\n').length;
      assert.fail(`${label}: forbidden substring ${JSON.stringify(pat)} at line ${lineNo}`);
    }
  }
}

// 1. apply-review-delta.mjs source must contain neither field-writer nor body-editor.
{
  const src = readFileSync(path.join(root, 'lib/apply-review-delta.mjs'), 'utf8');
  // Strip comments so the header docs that mention the banned symbols don't false-positive.
  const stripped = src
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  assertNoMutation('apply-review-delta.mjs', stripped, [
    'writeProjectFieldValue(',
    "'issue', 'edit'",
    '"issue", "edit"',
  ]);
}

// 2. verbClose body must contain no writeProjectFieldValue call.
{
  const src = readFileSync(path.join(root, 'verbs/close.mjs'), 'utf8');
  assert.ok(
    /export async function verbClose\b/.test(src),
    'verbClose export not found in verbs/close.mjs'
  );
  assertNoMutation('verbClose', src, ['writeProjectFieldValue(']);
}

console.log('no-mutation-guarantee.test.mjs: all passed');
