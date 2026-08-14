// @story #793
// Pins the documented assignment policy: new issues default to UNASSIGNED,
// with a defect-spawn `[Y|n]` self-assign exception. Guards against a doc
// regression re-introducing the old "Always assign new issues" convention.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = fileURLToPath(new URL('../../../../..', import.meta.url));
const claudeMd = readFileSync(path.join(repoRoot, './CLAUDE.md'), 'utf8');
const workflowMd = readFileSync(path.join(repoRoot, './docs/guides/workflow.md'), 'utf8');

test('CLAUDE.md no longer mandates auto-assigning new issues', () => {
  assert.doesNotMatch(claudeMd, /Always assign new issues/i);
});

test('CLAUDE.md documents default-unassigned + defect-spawn [Y|n] prompt', () => {
  assert.match(claudeMd, /default to UNASSIGNED/i);
  assert.match(claudeMd, /\[Y\|n\]/);
  assert.match(claudeMd, /defect/i);
});

test('workflow.md no longer mandates auto-assigning new issues', () => {
  assert.doesNotMatch(workflowMd, /Always assign new issues/i);
});

test('workflow.md documents default-unassigned + defect-spawn [Y|n] prompt', () => {
  assert.match(workflowMd, /default to unassigned/i);
  assert.match(workflowMd, /\[Y\|n\]/);
  assert.match(workflowMd, /defect/i);
});
