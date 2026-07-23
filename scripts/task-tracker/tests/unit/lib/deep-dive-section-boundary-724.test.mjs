// @story #724
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { replaceDeepDiveSection } from '../../../lib/deep-dive.mjs';

const BODY = `## Pickup Directive

Follow: some directive

---

<!-- aitm-deep-dive-posted: 2026-07-01 -->
## Deep-Dive Analysis (2026-07-01)

Old prose that should be replaced.

## Acceptance Criteria

- [ ] AC one
- [ ] AC two

## What I want

Some unrelated content that must survive.

## Why it matters

More unrelated content that must survive.

## Notes

Even more unrelated content that must survive.

## Environment

Node v22.

<!-- aitm-entered-backlog: 2026-06-01T00:00:00Z -->
<!-- aitm-fields:start
{"foo":"bar"}
aitm-fields:end -->
`;

test('replaceDeepDiveSection preserves unrelated ## sections that sit between the deep-dive section and a distant aitm-* marker (#718 shape)', () => {
  const result = replaceDeepDiveSection(BODY, 'New prose replacing the old.');

  assert.ok(!result.includes('Old prose that should be replaced.'));
  assert.ok(result.includes('New prose replacing the old.'));

  for (const heading of [
    '## Acceptance Criteria',
    '## What I want',
    '## Why it matters',
    '## Notes',
    '## Environment',
  ]) {
    assert.ok(result.includes(heading), `expected ${heading} to survive`);
  }

  assert.ok(result.includes('- [ ] AC one'));
  assert.ok(result.includes('- [ ] AC two'));
  assert.ok(result.includes('Some unrelated content that must survive.'));
  assert.ok(result.includes('More unrelated content that must survive.'));
  assert.ok(result.includes('Even more unrelated content that must survive.'));
  assert.ok(result.includes('Node v22.'));
  assert.ok(result.includes('<!-- aitm-entered-backlog: 2026-06-01T00:00:00Z -->'));
  assert.ok(result.includes('aitm-fields:start'));
});

test('replaceDeepDiveSection still stops at an immediately-trailing aitm-* marker when no intervening ## sections exist', () => {
  const body = `<!-- aitm-deep-dive-posted: 2026-07-01 -->
## Deep-Dive Analysis (2026-07-01)

Old prose.

<!-- aitm-deep-dive-complete: 2026-07-01 -->
`;
  const result = replaceDeepDiveSection(body, 'New prose.');
  assert.ok(!result.includes('Old prose.'));
  assert.ok(result.includes('New prose.'));
  assert.ok(result.includes('<!-- aitm-deep-dive-complete: 2026-07-01 -->'));
});
