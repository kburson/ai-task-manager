// @story #524
// Documentation invariant: the Defect-First / Suite-Must-Grow doctrine and the
// aitm-defect-repro-test marker convention must be described in
// docs/guides/workflow.md so the engineering behavior behind the R1
// Demonstrable-AC Standard is discoverable, not folded silently into the TDD
// skill.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const DOC = path.resolve(__dir, '../../../../docs/guides/workflow.md');

test('workflow.md documents the Defect-First rule', () => {
  const md = readFileSync(DOC, 'utf8');
  assert.match(md, /Defect-First/);
  // Every defect starts with a failing test that reproduces it, then green.
  assert.match(md, /failing test that reproduces it/i);
});

test('workflow.md documents the Suite-Must-Grow rule', () => {
  const md = readFileSync(DOC, 'utf8');
  assert.match(md, /Suite-Must-Grow/);
  // Regression is a floor; new behavior ships with new targeted tests.
  assert.match(md, /floor/i);
  assert.match(md, /test:all/);
});

test('workflow.md documents the aitm-defect-repro-test marker convention', () => {
  const md = readFileSync(DOC, 'utf8');
  assert.match(md, /aitm-defect-repro-test/);
});
