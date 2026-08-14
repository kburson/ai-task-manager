// @story #523
// Documentation invariant: the Demonstrable-AC Standard must be described in
// docs/guides/workflow.md so the Refine→Plan exit rule is discoverable, not
// only enforced in code.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const DOC = path.resolve(__dir, '../../../../docs/guides/workflow.md');

test('workflow.md documents the Demonstrable-AC Standard', () => {
  const md = readFileSync(DOC, 'utf8');
  assert.match(md, /Demonstrable-AC Standard/);
});

test('workflow.md explains the verifier-or-invalid-tag rule and the test:all exclusion', () => {
  const md = readFileSync(DOC, 'utf8');
  assert.match(md, /aitm-verified cmd=/);
  assert.match(md, /invalid — non-demonstrable/);
  assert.match(md, /test:all/);
});
