// @story #905
// #905 — PreToolUse epic-base edit-guard. The fail-closed backstop: when an
// agent's worktree is a managed child branch, refuse Edit/Write unless the child
// is based on its epic head. Non-managed branches (trunk, claude/*, epic/story)
// fail OPEN so solo/main work is untouched. Pure decision + injectable evaluation.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { decideEpicBaseEdit, computeEvaluation } from './epic-base-edit-guard.mjs';

// ── decideEpicBaseEdit (pure) ────────────────────────────────────────────────

test('non-gated tool is allowed', () => {
  const r = decideEpicBaseEdit({ toolName: 'Bash', branch: 'feature/child/910', evaluation: null });
  assert.equal(r.decision, 'allow');
});

test('allowlisted scratch path is allowed even on a wrong-base child', () => {
  const r = decideEpicBaseEdit({
    toolName: 'Write',
    branch: 'feature/child/910',
    relPath: '.tmp/plan/notes.md',
    evaluation: { pass: false, reason: 'wrong-base' },
  });
  assert.equal(r.decision, 'allow');
});

test('non-managed branches fail OPEN (solo/main/epic/story unaffected)', () => {
  for (const branch of [
    'trunk',
    'main',
    'claude/task-905-4836e9',
    'feature/epic/905',
    'feature/story/42',
  ]) {
    const r = decideEpicBaseEdit({
      toolName: 'Edit',
      branch,
      relPath: 'scripts/x.mjs',
      evaluation: null,
    });
    assert.equal(r.decision, 'allow', `${branch} should fail open`);
  }
});

test('managed child with a PASSING evaluation is allowed', () => {
  const r = decideEpicBaseEdit({
    toolName: 'Edit',
    branch: 'feature/child/910',
    relPath: 'scripts/x.mjs',
    evaluation: { pass: true, reason: 'on the epic line' },
  });
  assert.equal(r.decision, 'allow');
});

test('managed child with a FAILING evaluation is blocked (fail-closed)', () => {
  const r = decideEpicBaseEdit({
    toolName: 'Edit',
    branch: 'feature/child/910',
    relPath: 'scripts/x.mjs',
    evaluation: { pass: false, reason: 'childBase equals epic fork' },
  });
  assert.equal(r.decision, 'block');
  assert.match(r.reason, /epic|base/i);
});

test('managed child whose base could not be resolved is blocked (fail-closed)', () => {
  const r = decideEpicBaseEdit({
    toolName: 'Write',
    branch: 'feature/child/910',
    relPath: 'scripts/x.mjs',
    evaluation: null, // resolution failed (gh/git error)
  });
  assert.equal(r.decision, 'block');
  assert.match(r.reason, /could not|unresolved|confirm/i);
});

// ── computeEvaluation (wires git + resolver into the invariant) ───────────────

const GRAPH = { 905: { parent: null, children: [910] }, 910: { parent: 905, children: [] } };
const graph = (n) => GRAPH[n] ?? { parent: null, children: [] };

// Ancestry: f0 (fork) → e1 (epic head). A correct child bases on e1; the #859
// wrong-base child bases on f0 itself.
function makeGit(childBase) {
  const descendantsOfFork = new Set(['f0', 'e1']); // f0 is ancestor-or-equal of both
  return (args) => {
    if (args[0] === 'rev-parse' && args[1] === 'feature/epic/905') return 'e1';
    if (args[0] === 'merge-base' && args.includes('--is-ancestor')) {
      const [, , anc, desc] = args;
      if (anc === 'f0' && descendantsOfFork.has(desc)) return '';
      const e = new Error('not ancestor');
      e.status = 1;
      throw e;
    }
    if (args[0] === 'merge-base' && args[1] === 'feature/epic/905' && args[2] === 'trunk')
      return 'f0';
    if (
      args[0] === 'merge-base' &&
      args[1] === 'feature/child/910' &&
      args[2] === 'feature/epic/905'
    )
      return childBase;
    throw new Error(`unexpected git ${args.join(' ')}`);
  };
}

test('computeEvaluation PASSES a child cut from the epic head', () => {
  const evaluation = computeEvaluation('feature/child/910', { graph, git: makeGit('e1') });
  assert.equal(evaluation.pass, true);
});

test('computeEvaluation FAILS the #859 wrong-base child (cut from the fork)', () => {
  const evaluation = computeEvaluation('feature/child/910', { graph, git: makeGit('f0') });
  assert.equal(evaluation.pass, false);
});
