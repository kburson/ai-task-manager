// @story #1406
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractApplyPatchTargets,
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
  ];
  for (const input of malformedPatches) {
    assert.throws(() => extractApplyPatchTargets(input), MutationParseError);
  }
});
