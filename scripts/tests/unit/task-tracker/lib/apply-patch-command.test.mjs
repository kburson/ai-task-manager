// @story #2106
// @story #2088
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractApplyPatchText,
  extractApplyPatchTargets,
  MutationParseError,
} from '../../../../task-tracker/lib/apply-patch-targets.mjs';
const patch = '*** Begin Patch\n*** Add File: docs/native-proof.md\n+proof\n*** End Patch';
test('native command envelope reaches the existing patch destination parser', () => {
  assert.equal(extractApplyPatchText({ command: patch }), patch);
  assert.deepEqual(extractApplyPatchTargets(extractApplyPatchText({ command: patch })), [
    'docs/native-proof.md',
  ]);
});
test('native command cannot conceal conflicting aliases or non-string payloads', () => {
  for (const input of [
    { command: 42, patch },
    { command: null, patch },
    { command: [], patch },
    { command: patch, input: patch + '\n' },
    { command: patch, text: 'foreign' },
  ])
    assert.throws(() => extractApplyPatchText(input), MutationParseError);
  assert.equal(extractApplyPatchText({ command: patch, patch }), patch);
});
test('native command retains traversal and empty-patch refusal', () => {
  for (const value of [
    '',
    '*** Begin Patch\n*** End Patch',
    patch.replace('docs/native-proof.md', '../escape'),
  ])
    assert.throws(
      () => extractApplyPatchTargets(extractApplyPatchText({ command: value })),
      MutationParseError
    );
});
