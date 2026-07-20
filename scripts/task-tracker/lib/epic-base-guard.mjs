// #905 — the fail-closed epic-base invariant (design: "Fail-closed guard").
//
// This is the pure decision core. The caller (the PreToolUse edit-guard) resolves
// three revs from live git and one derived boolean, then asks: is this child
// worktree cut from its epic's line, or from the parent line by mistake (the #859
// debacle)?
//
//   epicHead                    — HEAD of the epic branch
//   epicFork                    — merge-base(epic, parent): where the epic left its parent
//   childBase                   — merge-base(child, epic): where the child left the epic
//   forkIsAncestorOfChildBase   — `git merge-base --is-ancestor epicFork childBase`
//
// PASS when either:
//   (a) epicHead === epicFork          → the epic has not diverged from its parent
//                                        yet; there is no epic line to be off of, so
//                                        any child base is vacuously fine (no-op).
//   (b) epicFork is an ancestor of childBase  AND  childBase !== epicFork
//                                        → the child branched from a *proper*
//                                        descendant of the fork, i.e. from the epic
//                                        line, not from the fork point itself.
// REFUSE otherwise. Keeping this pure/injectable lets the topology table tests run
// with zero real git.

function req(v, name) {
  if (v === undefined || v === null) {
    throw new Error(`epic-base-guard: ${name} is required`);
  }
  return v;
}

export function evaluateEpicBase({
  epicHead,
  epicFork,
  childBase,
  forkIsAncestorOfChildBase,
} = {}) {
  req(epicHead, 'epicHead');
  req(epicFork, 'epicFork');
  req(childBase, 'childBase');

  // (a) Empty epic: nothing has landed on the epic beyond its fork, so there is
  // no epic line for a child to be based off of. No-op pass.
  if (epicHead === epicFork) {
    return {
      pass: true,
      reason: 'empty-epic: epic head equals its fork point; no epic line to protect (no-op)',
    };
  }

  // (b) Child cut from the fork point itself — the #859 debacle: the child was
  // branched off the parent line (trunk) instead of the epic. REFUSE.
  if (childBase === epicFork) {
    return {
      pass: false,
      reason:
        'wrong-base: child base equals the epic fork point — cut from the parent line, ' +
        'not the epic. Recut the child from the epic head.',
    };
  }

  // (b) Child base is not a descendant of the fork at all (e.g. cut from a
  // grandparent, before the epic forked). REFUSE.
  if (!forkIsAncestorOfChildBase) {
    return {
      pass: false,
      reason:
        'wrong-base: child base is not a descendant of the epic fork point — it does ' +
        'not sit on the epic line. Recut the child from the epic head.',
    };
  }

  // Proper descendant of the fork, and not the fork itself → on the epic line.
  return {
    pass: true,
    reason: 'child base descends from the epic fork point; it sits on the epic line',
  };
}
