// @story #2031
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDecompositionBodyRevision } from '../../../../task-tracker/lib/decomposition-effect-admission.mjs';
const valid = '## Scope\nCurrent work\n\n## Deep-Dive Analysis\nOne reviewed analysis\n';
const duplicated = valid + '\n## Deep-Dive Analysis\nStale duplicate analysis\n';
test('repairing duplicate existing sections requires scoped-deliverable authority rather than making repair impossible', () => {
  assert.equal(classifyDecompositionBodyRevision(duplicated, valid), 'scoped-deliverable');
});
test('introducing duplicate sections still refuses classification', () => {
  assert.throws(() => classifyDecompositionBodyRevision(valid, duplicated), /duplicate section/);
});
