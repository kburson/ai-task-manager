// @story #768
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGhEdit } from '../../lib/gh-edit-guard.mjs';

// #768 — the scoped rename changes the published package name but deliberately
// leaves the `node_modules/ai-task-manager` self-symlink and the PreToolUse hook
// paths (which resolve by filesystem directory, not npm name) untouched. This
// guard proves that decoupling held: the gh-edit bash guard still LOADS and
// still REFUSES a direct `gh issue edit --body` write. If the rename had broken
// the module resolution, this import would throw; if the guard had failed open,
// `block` would be false.
test('gh-edit guard still refuses a direct --body write after the scope rename', () => {
  const res = evaluateGhEdit({ command: 'gh issue edit 999 --body "clobber"' });
  assert.equal(res.block, true, 'guard must block direct gh issue edit --body');
  assert.match(res.reason, /mutateIssueBody/, 'refusal must direct to mutateIssueBody');
});

test('gh-edit guard still refuses a --body-file write', () => {
  const res = evaluateGhEdit({ command: 'gh issue edit 999 --body-file /tmp/x.md' });
  assert.equal(res.block, true, 'guard must block direct gh issue edit --body-file');
});

test('gh-edit guard leaves a label-only edit alone (not failing closed on everything)', () => {
  const res = evaluateGhEdit({ command: 'gh issue edit 999 --add-label BLOCKED' });
  assert.equal(res.block, false, 'non-body edits must pass');
});
