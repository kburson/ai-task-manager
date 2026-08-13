// @story #905
// #905 — fail-closed epic-base invariant (design: "Fail-closed guard").
// Pure logic: given the three revs and whether the epic fork is an ancestor of
// the child base (a fact the caller computes via `git merge-base --is-ancestor`),
// decide PASS/REFUSE. A topology table drives the cases the design enumerates.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { evaluateEpicBase } from './epic-base-guard.mjs';

// Tiny commit-ancestry model. Each node maps to its parent (or null at root).
// `isAncestor(a, b)` — is `a` an ancestor-or-equal of `b`? (matches
// `git merge-base --is-ancestor`, which is true when a === b).
const PARENT = {
  G: null, // grandparent / trunk root
  F: 'G', // epic fork point (where the epic left trunk)
  E: 'F', // epic head after one commit
  E2: 'E', // epic head after a sibling merged (epic advanced)
};
function isAncestor(a, b) {
  let cur = b;
  while (cur != null) {
    if (cur === a) return true;
    cur = PARENT[cur];
  }
  return false;
}
function evalTopology({ epicHead, epicFork, childBase }) {
  return evaluateEpicBase({
    epicHead,
    epicFork,
    childBase,
    forkIsAncestorOfChildBase: isAncestor(epicFork, childBase),
  });
}

test('correct child (cut from current epic head) PASSES', () => {
  const r = evalTopology({ epicHead: 'E', epicFork: 'F', childBase: 'E' });
  assert.equal(r.pass, true);
});

test('stale-but-correct child (sibling merged, epic advanced) PASSES', () => {
  // Epic head is now E2; child still cut from the older E. childBase=E is a
  // proper descendant of the fork F → passes; merge-back rebase absorbs catch-up.
  const r = evalTopology({ epicHead: 'E2', epicFork: 'F', childBase: 'E' });
  assert.equal(r.pass, true);
});

test('wrong-base child (the #859 debacle: cut from trunk) REFUSES', () => {
  // childBase == epicFork ⇒ cut from the parent line, not the epic.
  const r = evalTopology({ epicHead: 'E', epicFork: 'F', childBase: 'F' });
  assert.equal(r.pass, false);
  assert.match(r.reason, /wrong-base|parent line|epicFork/i);
});

test('nested wrong-base child (cut from grandparent) REFUSES', () => {
  // childBase == G, which is BEFORE the fork F → F is not an ancestor of G.
  const r = evalTopology({ epicHead: 'E', epicFork: 'F', childBase: 'G' });
  assert.equal(r.pass, false);
});

test('empty epic (head == fork) is a no-op PASS regardless of child base', () => {
  assert.equal(evalTopology({ epicHead: 'F', epicFork: 'F', childBase: 'F' }).pass, true);
  assert.equal(evalTopology({ epicHead: 'F', epicFork: 'F', childBase: 'G' }).pass, true);
});

test('every result carries a human-readable reason string', () => {
  for (const childBase of ['E', 'F', 'G']) {
    const r = evalTopology({ epicHead: 'E', epicFork: 'F', childBase });
    assert.equal(typeof r.reason, 'string');
    assert.ok(r.reason.length > 0);
  }
});

test('missing inputs throw rather than silently pass', () => {
  assert.throws(() => evaluateEpicBase({ epicFork: 'F', childBase: 'E' }), /epicHead/);
  assert.throws(() => evaluateEpicBase({ epicHead: 'E', childBase: 'E' }), /epicFork/);
  assert.throws(() => evaluateEpicBase({ epicHead: 'E', epicFork: 'F' }), /childBase/);
});
