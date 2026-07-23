#!/usr/bin/env node
// @story #908 (epic #912)
// vc:4 — the Full-Auto merge path is documented in both guides.
//
// AC4 requires workflow.md and settings-guide.md to describe the chosen merge
// path and the required GitHub/branch-protection/permission configuration. This
// asserts the concrete anchors exist so the docs cannot silently drift away from
// the shipped behavior.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..', '..');

function read(rel) {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

test('workflow.md documents the Full-Auto PR merge + local-trunk sync section', () => {
  const doc = read('docs/guides/workflow.md');
  assert.match(doc, /### Full-Auto PR merge \+ local-trunk sync/);
  // The chosen mechanism (GitHub auto-merge) and the classifier rationale.
  assert.match(doc, /--auto/);
  assert.match(doc, /auto-merge/i);
  // The trunk re-sync decision.
  assert.match(doc, /origin\/trunk/);
  assert.match(doc, /full-auto-merge\.mjs/);
});

test('settings-guide.md documents the fullAutoMerge config block', () => {
  const doc = read('docs/guides/settings-guide.md');
  assert.match(doc, /### `fullAutoMerge`/);
  assert.match(doc, /gh-auto-merge/);
  assert.match(doc, /local-trunk-lane/);
  assert.match(doc, /operatorAuthorized/);
  assert.match(doc, /mergeMethod/);
});

test('settings-guide.md documents the required repo/branch-protection settings', () => {
  const doc = read('docs/guides/settings-guide.md');
  assert.match(doc, /Allow auto-merge/i);
  assert.match(doc, /branch-protection/i);
  assert.match(doc, /required status check/i);
});

test('both docs cross-reference the delivering story #908', () => {
  assert.match(read('docs/guides/workflow.md'), /#908/);
  assert.match(read('docs/guides/settings-guide.md'), /#908/);
});
