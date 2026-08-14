// @story #525
// Documentation invariant: the Full-Auto Doctrine and its three tenets must be
// described in docs/guides/workflow.md so an operator (and the agent) running
// in Full-Auto knows the boundary — exercise trusted judgment, stop only when
// there is no discernible path, and never fabricate evidence to stay automatic.
// This is the R3 doc-canon child of the integrity epic (#521); it cross-
// references the never-fabricate-evidence rule that #516 violated.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const DOC = path.resolve(__dir, '../../../../docs/guides/workflow.md');

test('workflow.md documents the Full-Auto Doctrine section', () => {
  const md = readFileSync(DOC, 'utf8');
  assert.match(md, /Full-Auto Doctrine/);
});

test('workflow.md documents tenet 1 — trusted judgment', () => {
  const md = readFileSync(DOC, 'utf8');
  assert.match(md, /trusted judgment/i);
});

test('workflow.md documents tenet 2 — stop only when no discernible path', () => {
  const md = readFileSync(DOC, 'utf8');
  assert.match(md, /no discernible path/i);
});

test('workflow.md documents tenet 3 — never fabricate to stay automatic', () => {
  const md = readFileSync(DOC, 'utf8');
  assert.match(md, /never fabricate/i);
  // The doctrine must cross-reference the integrity rule #516 violated.
  assert.match(md, /never-fabricate-evidence/);
});
