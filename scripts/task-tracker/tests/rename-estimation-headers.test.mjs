#!/usr/bin/env node
// Unit tests for the pure-function core of the rename-estimation-headers
// back-fill script: `rewriteCommentBody` + `commentNeedsRewrite`.

import { strict as assert } from 'node:assert';
import {
  rewriteCommentBody,
  commentNeedsRewrite,
} from '../../maintenance/rename-estimation-headers.mjs';

// 1. Rewrites the visible Groom-estimate header.
{
  const before = '### 🛠 Groom estimate\n\n| Field | Value |\n';
  const after = rewriteCommentBody(before);
  assert.equal(after, '### 🛠 Refine estimate\n\n| Field | Value |\n');
  assert.equal(commentNeedsRewrite(before), true);
  assert.equal(commentNeedsRewrite(after), false);
}

// 2. Rewrites the visible Analysis re-estimate header.
{
  const before = '### 🔁 Analysis re-estimate\n\nDeep dive surfaced …\n';
  const after = rewriteCommentBody(before);
  assert.equal(after, '### 🔁 Plan re-estimate\n\nDeep dive surfaced …\n');
}

// 3. Rewrites the explanatory body lines together with the headers.
{
  const before = [
    '<!-- aitm-groom-estimate: 5 -->',
    '### 🛠 Groom estimate',
    '',
    'Initial provisional sizing at Groom (refined at Analyze).',
    '',
    'Provisional — Analyze will re-evaluate and post a `### 🔁 Analysis re-estimate` comment if the bucket shifts.',
  ].join('\n');
  const after = rewriteCommentBody(before);
  assert.ok(after.includes('### 🛠 Refine estimate'));
  assert.ok(after.includes('Initial provisional sizing at Refine (refined at Plan).'));
  assert.ok(after.includes('Provisional — Plan will re-evaluate'));
  assert.ok(after.includes('`### 🔁 Plan re-estimate`'));
  assert.ok(
    after.includes('<!-- aitm-groom-estimate: 5 -->'),
    'hidden marker must NOT be touched'
  );
  assert.ok(!after.includes('Groom estimate'));
  assert.ok(!after.includes('Analysis re-estimate'));
  assert.ok(!after.includes('refined at Analyze'));
}

// 4. Idempotent: re-running on a rewritten body is a no-op.
{
  const before = '### 🛠 Groom estimate\nbody\n';
  const once = rewriteCommentBody(before);
  const twice = rewriteCommentBody(once);
  assert.equal(once, twice);
  assert.equal(commentNeedsRewrite(once), false);
}

// 5. Non-matching body returns identical content.
{
  const before = 'just a normal comment\n';
  assert.equal(rewriteCommentBody(before), before);
  assert.equal(commentNeedsRewrite(before), false);
}

// 6. Mixed match — only the matching substrings change.
{
  const before = 'lead-in\n### 🛠 Groom estimate\nbetween\n### 🔁 Analysis re-estimate\ntrail';
  const after = rewriteCommentBody(before);
  assert.equal(
    after,
    'lead-in\n### 🛠 Refine estimate\nbetween\n### 🔁 Plan re-estimate\ntrail'
  );
}

console.log('rename-estimation-headers.test.mjs: all passed');
