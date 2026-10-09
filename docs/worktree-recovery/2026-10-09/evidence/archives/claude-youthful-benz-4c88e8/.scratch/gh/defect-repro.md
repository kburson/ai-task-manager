Observed live on #680 (2026-09-09).

1. `.ai-task-manager/task-tracker.json` declares `fullAutoMerge.mergeMethod: "squash"`. The GitHub repository allows all three merge methods (`allow_merge_commit`, `allow_squash_merge`, `allow_rebase_merge` all true), so the UI presents all three buttons.
2. Drive an issue to Review with its work on a branch, and open a pull request.
3. Merge that pull request **from the GitHub UI using "Create a merge commit"** rather than squash. The resulting merge commit has two parents.
4. Run `close`.

**Expected:** either the close succeeds against a receipt describing what actually happened, or a named recovery path exists to reconcile the divergence.

**Actual:**

```
close  → close-delivery-receipt:missing
deliver → delivery-verification:merge-method
```

The issue is stranded. `deliver`'s already-merged external-recovery lane cannot help, because it builds its delivery intent from `fullAutoMerge.mergeMethod` and then requires the observed method to equal it. No `close` flag reaches the condition: `--repair` addresses PR closing-reference auto-close, `--restart-stale-transaction` and `--restart-reopened-transaction` address transaction shapes, and none of them addresses a method mismatch. The merge cannot be redone.

The only way out is `close --force`, which bypasses the whole close gate rather than reconciling this one divergence.
