## Deep-Dive Analysis

### Preserved delivery facts

- `feature/epic/1624` still names the accepted head `2158a289a63b27b9b4d08b8701a16f0b9d3e805d`.
- The branch is unpublished and has no pull request.
- `git merge-tree --write-tree --messages origin/trunk feature/epic/1624` succeeds without conflicts, so a merge-commit PR can preserve the accepted eight-commit history without rewrite.
- Current `origin/trunk` does not contain the accepted head or its resulting tree.

### Terminal-authority mismatch

#1624 carries a completed `aitm.delivered-close/v1` transaction at the accepted SHA, but its only delivery record is the pre-#1632 `aitm.no-commit-delivery/v1` epic receipt. It has no historical PR, delivery intent, or delivery receipt. The existing `--restart-reopened-transaction` path is intentionally inapplicable: it requires a true historical PR/intent/receipt bundle, a different new accepted SHA, and a corrective second delivery.

Treating the close as `unauthorized-close` would also be false. The close ran through AITM's then-valid path; the defect is that the old root-epic policy allowed terminal delivery without trunk delivery.

### Chosen design

Add a separate human-only `close --restart-false-delivery-transaction` recovery mode. It will preserve the completed historical transaction and false no-commit record as immutable evidence, then require all of the following before any protected-marker mutation:

1. one completed eight-step Delivered close transaction for the exact accepted SHA;
2. an OPEN/REOPENED issue in Review with surviving Delivered disposition and a clean, owned post-close binding;
3. one immutable recovery authorization that identifies audit #1633 and recovery story #1635 and names the old transaction and accepted SHA;
4. a newly merged pull request whose exact source head is the same accepted SHA, plus correlated delivery intent/receipt and fresh exact-SHA Test and Review authority;
5. an immutable, read-back-verified false-delivery correction record written before the active close marker is replaced.

The mode will reuse the ordinary eight-step close saga after replacement and remain idempotent across interruptions. It will not alter, relax, or share predicates with `--restart-stale-transaction` or `--restart-reopened-transaction`.

### Execution sequence

1. Implement and deliver the narrow recovery mode under #1635.
2. Publish the exact `feature/epic/1624` head, open its governed PR, and merge it with merge-commit topology so the source history remains intact.
3. Reopen #1624, restore it one sanctioned lifecycle step to Review, bind its preserved worktree, refresh exact-SHA Test/Review evidence if required, and run delivery recovery to write the real intent/receipt.
4. Run the new false-delivery close recovery, verify #1624 is reclosed with a completed replacement transaction, and rerun audit #1633's verifier for #1624 and #1625-#1630.
5. Close #1635 only after all seven audited false-Done rows verify as delivered on current trunk.

### Scope boundary

This newly discovered lifecycle gap is absorbed into #1635 under the user's defect-chain limit. No further defect issue will be created. If the work requires authority broader than this exact historical shape, execution stops for planning.
