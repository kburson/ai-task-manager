// @story #869
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('claude stub carries a Step 0 seed directive above the node_modules reads', () => {
  const src = readFileSync('bin/cli.mjs', 'utf8');
  // claudeStub() must include a Step 0 section that names the seed check script.
  // The bound spans the authored prose block (~600 chars from the heading to the
  // script reference) — wide enough to keep both in the same section, tight
  // enough that the name can't drift into an unrelated part of the file.
  assert.match(src, /Step 0[\s\S]{0,800}ensure-worktree-seeded/);
});
