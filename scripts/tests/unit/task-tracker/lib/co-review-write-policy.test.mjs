// @story #1325
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  MutationParseError,
  extractApplyPatchTargets,
  extractBashWriteTargets,
} from '../../../../task-tracker/lib/mutation-targets.mjs';
import { evaluateCoReviewWrite } from '../../../../task-tracker/lib/co-review-write-policy.mjs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';

test('apply_patch parser extracts add, update, delete, move, and multiple targets', () => {
  const patchText = `*** Begin Patch
*** Add File: .tmp/review/new.md
+new
*** Update File: src/a.mjs
@@
-old
+new
*** Move to: src/b.mjs
*** Delete File: src/c.mjs
*** End Patch`;
  assert.deepEqual(extractApplyPatchTargets(patchText), [
    '.tmp/review/new.md',
    'src/a.mjs',
    'src/b.mjs',
    'src/c.mjs',
  ]);
});

test('apply_patch parser rejects malformed, unsupported, empty, and traversing patches', () => {
  for (const input of [
    '',
    '*** Begin Patch\n*** End Patch',
    '*** Begin Patch\n*** Rename File: a\n*** End Patch',
    '*** Begin Patch\n*** Add File: ../escape\n*** End Patch',
    '*** Add File: a',
  ]) {
    assert.throws(() => extractApplyPatchTargets(input), MutationParseError);
  }
});

test('bash parser reports complete destinations and ambiguous mutations', () => {
  const root = '/repo';
  assert.deepEqual(extractBashWriteTargets('printf x > .tmp/review.md && touch src/a', root), {
    targets: ['/repo/.tmp/review.md', '/repo/src/a'],
    ambiguousMutation: false,
  });
  assert.equal(
    extractBashWriteTargets('node -e "writeFileSync(x,y)"', root).ambiguousMutation,
    true
  );
  assert.equal(extractBashWriteTargets('printf x > "$TARGET"', root).ambiguousMutation, true);
  for (const command of [
    "sed -i 's/old/new/' src/a.mjs",
    'dd if=input.bin of=src/output.bin',
    'curl https://example.test/file --output src/file.bin',
    'git apply changes.patch',
  ]) {
    assert.equal(
      extractBashWriteTargets(command, root).ambiguousMutation,
      true,
      `${command} must not fall through as read-only`
    );
  }
});

function policyFixture() {
  const projectDir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-review-policy-'));
  const dir = path.join(projectDir, '.tmp', 'review-protocol');
  mkdirSync(dir, { recursive: true });
  const pending = path.join(dir, 'round-2-reviewer-review.md');
  const grant = {
    protocolId: 'p1',
    dir,
    worktree: projectDir,
    pendingReviewPath: pending,
    claimedRole: 'reviewer',
    claimedProvider: 'grok',
    claimedSid: 'sid-1',
  };
  const rows = { p1: grant };
  const evaluate = (overrides = {}) =>
    evaluateCoReviewWrite({
      projectDir,
      worktreePath: projectDir,
      provider: 'grok',
      sid: 'sid-1',
      toolName: 'Write',
      targets: [pending],
      readIndex: () => rows,
      resolveGrant: () => grant,
      ...overrides,
    });
  return { projectDir, dir, pending, grant, rows, evaluate };
}

test('exact pending artifact is allowed only for the claimed provider session', () => {
  const { pending, evaluate } = policyFixture();
  assert.equal(evaluate().decision, 'allow');
  assert.equal(evaluate({ sid: 'other', resolveGrant: () => null }).decision, 'deny');
  assert.equal(evaluate({ provider: 'codex', resolveGrant: () => null }).decision, 'deny');
  assert.equal(evaluate({ targets: [pending, '/repo/src/a.mjs'] }).decision, 'deny');
});

test('authority files and other protocol or tmp targets deny before ordinary allowances', () => {
  const { projectDir, dir, evaluate } = policyFixture();
  for (const target of [
    path.join(projectDir, '.tmp/aitm/fleet/occupancy.json'),
    path.join(projectDir, '.tmp/aitm/fleet/co-review-index.json'),
    path.join(dir, 'state.json'),
    path.join(projectDir, '.tmp/other.md'),
  ]) {
    assert.equal(evaluate({ targets: [target] }).decision, 'deny');
  }
});

test('malformed or ambiguous reviewer mutations fail closed', () => {
  const { evaluate } = policyFixture();
  assert.equal(
    evaluate({ parseError: new MutationParseError('bad patch'), targets: [] }).decision,
    'deny'
  );
  assert.equal(evaluate({ ambiguousMutation: true, targets: [] }).decision, 'deny');
});

test('first creation is canonicalized through the registered parent and symlink drift denies later', () => {
  const { pending, dir, evaluate } = policyFixture();
  assert.equal(evaluate().decision, 'allow');
  const elsewhere = path.join(path.dirname(dir), 'elsewhere.md');
  writeFileSync(elsewhere, 'x');
  symlinkSync(elsewhere, pending);
  assert.equal(evaluate().decision, 'deny');
});

test('a symlink alias to the pending artifact is not the exact granted path', () => {
  const { projectDir, pending, evaluate } = policyFixture();
  writeFileSync(pending, 'review', 'utf8');
  const alias = path.join(projectDir, 'pending-alias.md');
  symlinkSync(pending, alias);
  assert.equal(evaluate({ targets: [alias] }).decision, 'deny');
});

test('ordinary non-authority writes are not applicable when no reviewer grant is active', () => {
  const { projectDir, evaluate } = policyFixture();
  assert.equal(
    evaluate({
      targets: [path.join(projectDir, 'src/a.mjs')],
      resolveGrant: () => null,
      readIndex: () => ({}),
    }).decision,
    'not-applicable'
  );
});
