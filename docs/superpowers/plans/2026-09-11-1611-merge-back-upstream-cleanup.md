# #1611 Merge-Back Upstream Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make governed merge-back safely delete an already-integrated rebased child branch when its configured upstream still points to the pre-rebase commit.

**Architecture:** Keep the current rebase, bounded test lanes, fast-forward merge, and worktree removal intact. Add one exact-ref upstream probe at the final cleanup boundary, conditionally remove only local tracking metadata, and retain non-force `branch -d` as the final ancestry guard.

**Tech Stack:** Node.js ESM, `node:test`, injected Git command adapter, Git worktrees.

## Global Constraints

- #1611 is the maximum permitted defect depth and must not spawn another defect.
- No force deletion, remote-ref deletion, force push, or lifecycle-state bypass.
- No cleanup mutation occurs before successful fast-forward integration and worktree removal.
- All source edits and commits are attributed to #1611 and remain on its recorded worktree until governed merge-back.

---

### Task 1: Pin the tracked-upstream cleanup contract

**Files:**

- Modify: `scripts/tests/unit/task-tracker/merge-back.test.mjs`
- Test: `scripts/tests/unit/task-tracker/merge-back.test.mjs`

**Interfaces:**

- Consumes: `mergeBack({ child, path, deps })` and the existing injected `deps.git(args)` call log.
- Produces: a regression requiring exact-ref upstream detection and ordered safe cleanup.

- [ ] **Step 1: Extend the fake Git adapter with a configurable child upstream**

Change the helper signature and return the configured ref only for the exact lookup:

```js
function makeGit({
  grandparentIsAncestor = true,
  rebaseChildFails = false,
  childUpstream = '',
} = {}) {
  const calls = [];
  const git = (args) => {
    calls.push(args);
    if (
      args[0] === 'for-each-ref' &&
      args[1] === '--format=%(upstream)' &&
      args[2] === 'refs/heads/feature/child/910'
    ) {
      return childUpstream;
    }
    // retain existing behavior
  };
}
```

- [ ] **Step 2: Add the failing tracked-upstream test**

```js
test('#1611: cleanup detaches a configured upstream before safe child deletion', () => {
  const git = makeGit({
    childUpstream: 'refs/remotes/origin/feature/child/910',
  });
  mergeBack({ child: 910, path: '/wt/910', deps: { graph, git, runTests: () => true } });

  const calls = git.calls.map((args) => args.join(' '));
  const removed = calls.indexOf('worktree remove /wt/910');
  const probed = calls.indexOf('for-each-ref --format=%(upstream) refs/heads/feature/child/910');
  const detached = calls.indexOf('branch --unset-upstream feature/child/910');
  const deleted = calls.indexOf('branch -d feature/child/910');

  assert.ok(removed < probed);
  assert.ok(probed < detached);
  assert.ok(detached < deleted);
  assert.ok(!calls.some((call) => call.startsWith('branch -D ')));
});
```

- [ ] **Step 3: Strengthen the existing local-only test**

Add this assertion to the clean fast-forward test:

```js
assert.ok(!kinds.includes('branch --unset-upstream feature/child/910'));
```

- [ ] **Step 4: Run the focused test and verify RED**

Run:

```bash
node --test --test-name-pattern="#1611" scripts/tests/unit/task-tracker/merge-back.test.mjs
```

Expected: FAIL because the tracked-upstream path does not yet call `branch --unset-upstream`.

### Task 2: Implement the smallest safe cleanup change

**Files:**

- Modify: `scripts/task-tracker/merge-back.mjs`
- Test: `scripts/tests/unit/task-tracker/merge-back.test.mjs`

**Interfaces:**

- Consumes: the existing synchronous `git(args)` adapter and resolved `childBranch`.
- Produces: `hasConfiguredUpstream(git, branch) -> boolean` and an ordered cleanup call sequence.

- [ ] **Step 1: Add the exact-ref upstream helper**

Place this beside `isAncestor`:

```js
function hasConfiguredUpstream(git, branch) {
  const upstream = git(['for-each-ref', '--format=%(upstream)', `refs/heads/${branch}`]);
  return Boolean(String(upstream || '').trim());
}
```

- [ ] **Step 2: Conditionally detach tracking at the cleanup boundary**

Replace only the final cleanup block with:

```js
if (path) git(['worktree', 'remove', path]);
if (hasConfiguredUpstream(git, childBranch)) {
  git(['branch', '--unset-upstream', childBranch]);
}
git(['branch', '-d', childBranch]);
```

- [ ] **Step 3: Run the focused test and verify GREEN**

Run:

```bash
node --test --test-name-pattern="#1611" scripts/tests/unit/task-tracker/merge-back.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Run the complete merge-back unit file**

Run:

```bash
node --test scripts/tests/unit/task-tracker/merge-back.test.mjs
```

Expected: all tests pass with zero failures.

### Task 3: Verify, commit, and integrate deepest-first

**Files:**

- Modify: `scripts/task-tracker/merge-back.mjs`
- Modify: `scripts/tests/unit/task-tracker/merge-back.test.mjs`
- Create: `docs/superpowers/specs/2026-09-11-1611-merge-back-upstream-cleanup-design.md`
- Create: `docs/superpowers/plans/2026-09-11-1611-merge-back-upstream-cleanup.md`

**Interfaces:**

- Consumes: the green focused change and #1611's governed lifecycle record.
- Produces: exact-SHA verification evidence, a reviewed child commit, and safe local merge-back into the surviving parent authority.

- [ ] **Step 1: Format and lint before the full test lanes**

Run:

```bash
npm run format:check
npm run lint
```

Expected: both exit zero.

- [ ] **Step 2: Commit the bounded implementation**

Run:

```bash
git add scripts/task-tracker/merge-back.mjs scripts/tests/unit/task-tracker/merge-back.test.mjs docs/superpowers/specs/2026-09-11-1611-merge-back-upstream-cleanup-design.md docs/superpowers/plans/2026-09-11-1611-merge-back-upstream-cleanup.md
git commit -m "[#1611] fix(task): clean tracked child after merge-back"
```

- [ ] **Step 3: Run governed Develop and Test verification**

Run the declared verification commands through `npx aitm test 1611`, including `npm test`, `npm run test:slow`, lint, format, and the focused unit file.

Expected: an exact-commit Test receipt and zero failed commands.

- [ ] **Step 4: Review and approve the exact SHA**

Run the orchestrator Review transition and Full-Auto approval only after all AC and Functional DoD evidence is attached to the exact commit.

- [ ] **Step 5: Merge back and reconcile #1609**

Run `npx aitm merge-back 1611 <recorded-worktree>`. After the child worktree and branch are removed, prove the retained #1609 residue is an ancestor of #1516, detach its stale local upstream with the same reviewed safe sequence, and delete it with non-force `branch -d`. Then close #1611 and resume #1609.
