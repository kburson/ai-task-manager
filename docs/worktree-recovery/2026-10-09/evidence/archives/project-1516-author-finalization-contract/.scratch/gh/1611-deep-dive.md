## Deep-Dive Analysis (2026-09-11)

The observed failure is isolated to merge-back cleanup after all correctness-critical work already succeeded. The second #1609 merge-back rebased the child, passed 845 unit tests, 158 integration files, and 52 slow files, fast-forwarded `codex/issue-1516-author-finalization-contract` to the rebased child tip `3132787f`, and removed the child worktree. The final `git branch -d codex/issue-1609-finalize-cli-result` refused because that local branch still tracked `origin/codex/issue-1609-finalize-cli-result` at the pre-rebase SHA `e999d16e`, even though the local child tip was contained by the checked-out parent. This leaves a truthful partial-success topology rather than a failed integration.

The defect was initially created as a sibling under #1516, but the epic WIP budget correctly refused Plan while #1609 occupied Review. GitHub's native `addSubIssue(..., replaceParent: true)` mutation was therefore used as the exceptional graph-only recovery allowed by the repository policy. Readback proves #1611 is now a child of #1609, making this the second and final permitted defect depth.

**Files to edit**

- `scripts/tests/unit/task-tracker/merge-back.test.mjs`: add the failing regression for a merged child with a configured divergent upstream and preserve the existing local-only expectation.
- `scripts/task-tracker/merge-back.mjs`: detect a configured upstream immediately before cleanup, unset only that local tracking relationship when present, and retain non-force `git branch -d`.
- `docs/superpowers/specs/2026-09-11-1611-merge-back-upstream-cleanup-design.md`: pin the safety contract and current recovery evidence.
- `docs/superpowers/plans/2026-09-11-1611-merge-back-upstream-cleanup.md`: record the test-first implementation and delivery sequence.

**Step-by-step implementation plan**

1. Create #1611's isolated worktree from the authoritative #1609 branch at the current partially integrated tip.
2. Add a focused fake-git test that returns a remote-tracking ref for the child lookup and expects `branch --unset-upstream` before the existing safe delete.
3. Run the focused test and confirm it fails because merge-back currently goes directly from worktree removal to `branch -d`.
4. Add the smallest upstream-detection helper using `for-each-ref --format=%(upstream) refs/heads/<child>` and conditionally unset tracking.
5. Rerun the focused test and full merge-back unit file, preserving all existing behaviors.
6. Commit the bounded repair, run lint, format, unit, integration, and slow gates, then move #1611 through Test and Review with exact-SHA evidence.
7. Merge #1611 into #1609 locally, restore #1609's original recorded worktree path if needed, rerun merge-back so the repaired cleanup eliminates its tracked branch safely, then close deepest-first.

**Test additions**

- `scripts/tests/unit/task-tracker/merge-back.test.mjs`: a configured divergent upstream is detached before non-force deletion; a child with no upstream does not receive an unnecessary tracking mutation.

The root acceptance criteria already cite the focused unit command and current-topology ancestry command, so no additional root verification entry is needed.

**Identified risks**

- The upstream probe must be exact-ref scoped so similarly named branches cannot influence cleanup.
- Unsetting tracking must happen only after the fast-forward merge succeeds; earlier removal would weaken recovery evidence on a refused merge.
- The repair must never introduce `branch -D`, delete a remote ref, or push a rewritten child branch.
- #1609's old exact-SHA Test and Review evidence remains historical evidence for its original implementation; merge-back reruns the complete local lane set at the rebased integration SHA.
- No further defect may be spawned from #1611; any additional failure must be handled within this bounded repair or surfaced as a hard blocker.

## Dependency Map

Depends on: none

Blocks: #1609 (its child branch cannot satisfy the gated-delivery elimination check until safe cleanup converges)

**Sibling sub-issues to spawn**

None. #1611 is the maximum allowed defect depth and will not create another issue.
