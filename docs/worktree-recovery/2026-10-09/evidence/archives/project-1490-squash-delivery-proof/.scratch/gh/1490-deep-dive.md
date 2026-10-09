### Files to edit

- `scripts/task-tracker/lib/delivery-verification.mjs` — add a multi-source squash proof beside `provesSingleSourceSquash` and consult it from the `rewritten-one-parent` branch of `verifyLiveDelivery`.
- `scripts/tests/unit/task-tracker/lib/delivery-verification-attribution.test.mjs` — extend with the topology cases, or add a focused sibling test file if the fixture surface grows too large for that file's current shape.

Correction to the approved checkpoint plan: **no change to `scripts/task-tracker/verbs/deliver.mjs` is required.** The checkpoint assumed the accepted head tree and an ancestry call would have to be threaded in. Reading the adapter proved otherwise:

- `fetchCompletePullRequestCommits` already requests `tree{oid}` for every source commit, so `pullRequest.sourceCommitEvidence` carries `{message, oid, parents, tree}` per commit. The accepted head tree is the entry whose `oid` equals the accepted SHA.
- `inspectMergeCommit` delegates to `inspectCommitObject`, which returns `{parents, tree, commitTitle, commitMessage}`.
- `input.isAncestor` is already a required verification function.

All six proof inputs are therefore already present at the verification boundary. The change surface is one production file.

### The proof

Implemented as a separate predicate, not by extending `classifyMergeMethod`. That classifier stays pure and synchronous; the new proof is async only because ancestry resolution is. Conjunctive — every condition must hold, and any missing or malformed evidence returns false rather than throwing:

1. the merge commit has exactly one parent;
2. the merge SHA differs from the accepted SHA;
3. the merge commit tree equals the accepted head tree, taken from the source evidence entry whose oid is the accepted SHA;
4. the merge commit parent is an ancestor of the accepted SHA;
5. the source inventory is complete, non-empty, and its recorded head equals the accepted SHA;
6. the merge commit is reachable from the resolved base ref, already enforced upstream in `verifyLiveDelivery` before this point.

Condition 4 is the one doing the discriminating work, and it is the reason this cannot be satisfied by a rebase.

### Why each wrong classification is excluded

An ordinary merge carries two parents with `parents[1]` equal to the accepted head, so `classifyMergeMethod` returns `merge` and never reaches this branch; it also fails condition 1.

A multi-commit rebase replays each source commit onto the base. The merge SHA is the last replayed commit, and its parent is the newly created rewrite of the previous source commit. That object never existed on the source branch, so it cannot be an ancestor of the accepted head, and condition 4 fails.

A fast-forward leaves the merge SHA equal to the accepted SHA and fails condition 2.

A squash that dropped, altered, or reverted accepted content produces a different tree and fails condition 3. This is also what rejects a descendant commit that reverted the approved change: a revert necessarily changes the tree.

Incomplete or unbound source evidence fails condition 5.

Deliberately not relied upon, each individually insufficient: repository merge settings, merge commit title or message, one-parent topology alone, tree equality alone, and accepted-SHA reachability alone.

### Two accepted imprecisions

A single-commit rebase is topologically indistinguishable from a single-commit squash — one commit, identical tree, parent is the base tip — and no local or GitHub evidence separates them. The outcomes are semantically identical. Such a merge is classified as a squash. This is recorded rather than hidden.

Condition 4 fail-closes on a legitimate squash of a branch that was never synced with a base that had moved on, because the merge parent would then not be an ancestor of the accepted head. That refuses rather than misclassifies, which is the correct direction, but it will surprise someone eventually.

### Step-by-step implementation plan

1. Add failing tests reproducing PR #1487's shape: five ordinary source commits, a one-parent rewritten merge commit, merge tree equal to the accepted head tree, merge parent an ancestor of the accepted head. Expect a squash classification.
2. Add failing tests reproducing PR #1489's shape, where the accepted head is itself a merge commit with two parents. Expect a squash classification, proving the proof does not require the accepted head to be a simple commit.
3. Add failing negative tests: multi-commit rebase topology, ordinary two-parent merge, fast-forward, tree mismatch, reverted descendant, and incomplete source inventory.
4. Observe all of the above fail against the current verifier.
5. Implement the predicate and wire it into the `rewritten-one-parent` branch alongside the existing single-source proof, preserving the existing precedence so nothing that resolves today changes.
6. Confirm the existing single-source external-squash, provider-action, current-head, and historical-intent paths remain green.
7. Verify against the two real pull requests using their recorded topology as fixture data.

### Test additions

- `scripts/tests/unit/task-tracker/lib/delivery-verification-attribution.test.mjs` — multi-commit external squash accepted for both real pull-request shapes; rebase, ordinary merge, fast-forward, tree mismatch, reverted descendant, and incomplete inventory each refused; existing recovery paths unchanged.

Note for fixture accuracy: the existing `liveInput` helper sets `pullRequest.mergeMethod: 'squash'`, which short-circuits the proof through `mergeMethodObservation`. The production adapter never sets that field. New tests must omit it, or they will pass without exercising the new code at all.

### Identified risks

The largest risk is a test that appears to prove the new path but actually passes through the existing `mergeMethodObservation` short-circuit. Every new case must leave `mergeMethod` unset on the pull-request fixture.

A second risk is weakening the existing single-source proof while adding the multi-source one. The two must remain independent, with the existing one unchanged and still covered.

A third risk is treating tree equality as sufficient on its own. It is not: a rebase produces the same final tree. Conditions 1 through 5 are sound only in conjunction, and the tests must include a case where tree equality holds but ancestry does not.

### Sibling sub-issues to spawn

None.
