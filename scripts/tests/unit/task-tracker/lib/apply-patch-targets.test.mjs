// @story #1406
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractApplyPatchTargets,
  extractApplyPatchText,
  MutationParseError,
} from '../../../../task-tracker/lib/apply-patch-targets.mjs';

test('extracts every apply_patch destination', () => {
  const patchText = `*** Begin Patch
*** Update File: docs/old.md
@@
-old
+new
*** Move to: docs/new.md
*** Add File: src/create.mjs
+created
*** Delete File: src/delete.mjs
*** End Patch`;
  assert.deepEqual(extractApplyPatchTargets(patchText), [
    'docs/old.md',
    'docs/new.md',
    'src/create.mjs',
    'src/delete.mjs',
  ]);
});

test('rejects malformed apply_patch input or input with no destination', () => {
  const malformedPatches = [
    '',
    '*** Begin Patch\n*** End Patch',
    '*** Begin Patch\n*** Rename File: a\n*** End Patch',
    '*** Begin Patch\n*** Add File: ../escape\n*** End Patch',
    '*** Add File: a',
    '*** Begin Patch\n*** Add File: docs/a.md \n*** End Patch',
  ];
  for (const input of malformedPatches) {
    assert.throws(() => extractApplyPatchTargets(input), MutationParseError);
  }
});

test('accepts exactly one optional terminal line ending', () => {
  const patch = '*** Begin Patch\n*** Add File: docs/proof.md\n+proof\n*** End Patch';
  for (const ending of ['', '\n', '\r\n']) {
    assert.deepEqual(extractApplyPatchTargets(patch + ending), ['docs/proof.md']);
  }
  for (const ending of ['\n\n', '\r\n\r\n', ' ', '\n ']) {
    assert.throws(() => extractApplyPatchTargets(patch + ending), MutationParseError);
  }
});

test('shared patch transport accepts legacy object and freeform envelopes', () => {
  const patch = '*** Begin Patch\n*** Delete File: docs/old.md\n*** End Patch\n';
  for (const toolInput of [
    patch,
    { patch },
    { input: patch },
    { text: patch },
    { patch, input: patch },
    { patch: '', input: patch },
  ]) {
    assert.equal(extractApplyPatchText(toolInput), patch);
  }
  for (const toolInput of [{}, { patch: '' }, { patch, text: patch + ' ' }, 42]) {
    assert.throws(() => extractApplyPatchText(toolInput), MutationParseError);
  }
});
