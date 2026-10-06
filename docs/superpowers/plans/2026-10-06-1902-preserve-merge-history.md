# Preserve Reviewed Merge History Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans in the assigned #1902 worktree. No additional agents.

**Goal:** Preserve the reviewed child SHA and merge topology when the integration parent is already contained in the child.

**Architecture:** Reuse the existing isAncestor predicate in the child worktree before child synchronization. Skip only unnecessary rebase; divergent synchronization, verification, exact-head checks, parent checkout authority, ff-only integration and cleanup stay intact.

**Tech Stack:** Node.js ESM, node:test, real Git linked worktrees and the existing configured project verification fixture.

**Spec:** GitHub issue #1902 Scope, Fix Direction and Acceptance Criteria.

## Story Intent

- **Beneficiary:** release operator
- **Capability:** integrate an already synchronized child at its reviewed commit
- **Need:** unnecessary rebase destroys its accepted merge ancestry
- **Value or failure prevented:** accepted history and exact verification remain intact during fast-forward delivery

## Global Constraints

- No installed-module patches, graph authority changes, alternate merge strategy, synthetic receipt, approval waiver or unrelated transport change.
- Preserve the current rebase/conflict behavior when the child does not contain the parent.
- Preserve authenticated verification, verified-head/race refusal, parent checkout authority, ff-only integration and cleanup semantics.
- Host affected/TIA tests only; full suites run exclusively in CI, with an 800-second maximum.
- Root owns native Test serialization, Review, approval, delivery and Close.

## Review Focus

- A reviewed child merge has two parents and already contains the integration tip; integration retains its exact SHA and second parent.
- A divergent clean child still synchronizes through rebase before actual verification.
- A divergent conflicting child refuses before verification, parent integration or cleanup.
- Verification failure or HEAD/parent-checkout movement refuses integration.
- Preserve-worktree retains the child's checkout/branch/upstream; ordinary cleanup remains safe and unchanged.

### Task 1: Guard only unnecessary child rebase

**Files:**

- Modify: scripts/task-tracker/merge-back.mjs
- Modify: scripts/tests/unit/task-tracker/merge-back.test.mjs
- Modify: scripts/tests/integration/task-tracker/merge-back-cli.test.mjs
- Verify unchanged: scripts/tests/integration/task-tracker/merge-back-verification.test.mjs

**Interfaces:**

- Consumes: mergeBack({ child, path, preserveWorktree, deps }), existing isAncestor(git, ancestorRef, descendantRef), and runMergeBackCommand(argv, deps).
- Produces: unchanged API/result shape with preserved merge-containing HEAD on the already synchronized path.

- [ ] Step 1: Add a real Git regression to the existing CLI integration fixture and observe RED before production edits. Create a side commit from the parent tip, then merge it into the child with --no-ff. Require actual provider verification and parent integration at the original reviewed SHA.

```js
const f = fixture(
  t,
  "import {execFileSync} from 'node:child_process'; import {writeFileSync} from 'node:fs'; writeFileSync('verified.txt',execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim());"
);
f.git(f.child, 'checkout', '-b', 'codex/fixture-side', f.before);
writeFileSync(path.join(f.child, 'side.txt'), 'side contribution');
f.git(f.child, 'add', 'side.txt');
f.git(f.child, 'commit', '-qm', 'side contribution');
const secondParent = f.git(f.child, 'rev-parse', 'HEAD');
f.git(f.child, 'checkout', 'codex/fixture-child');
f.git(f.child, 'merge', '--no-ff', '-m', 'reviewed merge', 'codex/fixture-side');
const reviewed = f.git(f.child, 'rev-parse', 'HEAD');
await run(['910', f.child, '--preserve-worktree'], f.deps);
assert.equal(f.git(f.parent, 'rev-parse', 'HEAD'), reviewed);
assert.equal(readFileSync(path.join(f.child, 'verified.txt'), 'utf8'), reviewed);
assert.equal(f.git(f.child, 'rev-parse', 'HEAD^2'), secondParent);
```

- [ ] Step 2: Run the real regression with node --test --test-name-pattern, retaining the actual SHA mismatch or lost topology failure. Add divergent success/conflict cases and retain existing verification failure/head-race/checkout authority tests.

- [ ] Step 3: Guard the existing child rebase without changing its error, verification or cleanup boundaries. Update descriptive source comments.

```js
if (!isAncestor(wtGit, epicBranch, childBranch)) {
  try {
    wtGit(['rebase', epicBranch, childBranch]);
  } catch (err) {
    throw new Error(
      `merge-back: rebase conflict rebasing ${childBranch} onto ${epicBranch}: ${err.message}`
    );
  }
}
```

- [ ] Step 4: Update the unit fake's separate child ancestry outcome so existing rebase-required tests model genuine divergence. Keep custom branch authority assertions inspecting the rebase call after the new ancestry probe. Run the exact affected VC1 and all destination checks.

```sh
node --test scripts/tests/unit/task-tracker/merge-back.test.mjs scripts/tests/integration/task-tracker/merge-back-cli.test.mjs scripts/tests/integration/task-tracker/merge-back-verification.test.mjs
npm run lint
npm run format:check
git diff --check
```

- [ ] Step 5: Commit with [#1902], record the real commit trace, publish and open a draft PR with Refs #1902. Run native per-AC verification only from the genuine active Develop binding. Hand exact source/verification/CI and pause/release receipts to root; no native Test, Review or Close as agent.

```sh
git add scripts/task-tracker/merge-back.mjs scripts/tests/unit/task-tracker/merge-back.test.mjs scripts/tests/integration/task-tracker/merge-back-cli.test.mjs docs/superpowers/plans/2026-10-06-1902-preserve-merge-history.md
git commit -m "[#1902] Preserve reviewed child history when parent is already contained"
```

## Author Self-Review

The implementation has one behavioral seam and no public API change. Real Git proves the positive topology guarantee; divergent/failure tests preserve refusal boundaries. No plan task delegates implementation or runs full host suites. Fixture provider execution proves fixture behavior and does not claim production CI or native delivery acceptance.
