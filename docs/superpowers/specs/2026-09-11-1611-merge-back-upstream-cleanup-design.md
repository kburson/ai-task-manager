# #1611 Merge-Back Upstream Cleanup Design

## Status

Approved for Full-Auto implementation under issue #1611. This is the second and final defect depth beneath #1516: `#1516 -> #1609 -> #1611`.

## Problem

`merge-back` rebases a child onto its parent, runs every bounded test lane, fast-forwards the parent, removes the child worktree, and then deletes the local child branch with `git branch -d`. When the child was previously pushed, its local branch can still track the old remote tip. Git then refuses `branch -d` because the rebased local tip is not merged into its configured upstream, even though that tip is already contained by the checked-out parent. The command reports failure after integration and worktree cleanup have succeeded.

The #1609 attempt demonstrated this exact topology at `3132787fb519d5da9795c91661fd2816688f65ff`: 845 unit tests, 158 integration files, and 52 slow files passed; #1516 fast-forwarded; the #1609 worktree was removed; only its local branch remained because `origin/codex/issue-1609-finalize-cli-result` still named pre-rebase SHA `e999d16e2b5bf8d9bed82f834633eebf5034f6c8`.

## Decision

Immediately before the existing local branch deletion, query the exact local child ref with:

```text
git for-each-ref --format=%(upstream) refs/heads/<child-branch>
```

If and only if that query returns a nonempty upstream ref, remove the local tracking association:

```text
git branch --unset-upstream <child-branch>
```

Then run the unchanged non-force deletion:

```text
git branch -d <child-branch>
```

The order is load-bearing. Upstream metadata remains available through rebase, tests, checkout, and fast-forward. It is removed only after successful integration and worktree removal. `branch -d` continues to prove that the child tip is contained by the checked-out parent.

## Safety Properties

- Never use `git branch -D`.
- Never update, force-push, or delete a remote ref.
- Scope the upstream lookup to `refs/heads/<exact-child-branch>`.
- Preserve the local-only path: an empty lookup causes no tracking mutation.
- Preserve every existing rebase, bounded-test, and `--ff-only` gate.
- Do not create another defect from #1611.

## Verification

The focused unit test must prove both paths:

1. A tracked child calls `branch --unset-upstream` after worktree removal and before `branch -d`.
2. An untracked child still calls `branch -d` without calling `branch --unset-upstream`.

The complete AITM unit, integration, slow, lint, and format gates remain required before Review.
