// @story #1049
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONSERVATIVE_APPLY_PATCH_TARGET,
  resolveSourceToolTargets,
} from '../../../lib/source-tool-targets.mjs';

const PATCH = [
  '*** Begin Patch',
  '*** Update File: src/one.mjs',
  '@@',
  '-old',
  '+new',
  '*** Add File: docs/two.md',
  '+new',
  '*** Move to: docs/renamed.md',
  '*** End Patch',
].join('\n');

test('standard edit tools retain their native path payloads', () => {
  assert.deepEqual(resolveSourceToolTargets('Edit', { file_path: 'src/one.mjs' }), {
    exact: true,
    targets: ['src/one.mjs'],
  });
  assert.deepEqual(resolveSourceToolTargets('NotebookEdit', { notebook_path: 'work.ipynb' }), {
    exact: true,
    targets: ['work.ipynb'],
  });
});

test('apply_patch accepts freeform, patch, and input payload shapes and returns every target', () => {
  const expected = {
    exact: true,
    targets: ['src/one.mjs', 'docs/two.md', 'docs/renamed.md'],
  };
  assert.deepEqual(resolveSourceToolTargets('apply_patch', PATCH), expected);
  assert.deepEqual(resolveSourceToolTargets('apply_patch', { patch: PATCH }), expected);
  assert.deepEqual(resolveSourceToolTargets('apply_patch', { input: PATCH }), expected);
});

test('pathless, malformed, and ambiguous apply_patch payloads classify conservatively', () => {
  const expected = {
    exact: false,
    targets: [CONSERVATIVE_APPLY_PATCH_TARGET],
  };
  assert.deepEqual(resolveSourceToolTargets('apply_patch', {}), expected);
  assert.deepEqual(resolveSourceToolTargets('apply_patch', 'not a patch'), expected);
  assert.deepEqual(
    resolveSourceToolTargets('apply_patch', { patch: PATCH, input: `${PATCH}\nconflict` }),
    expected
  );
});
