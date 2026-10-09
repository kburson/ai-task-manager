Refs #1490

An externally squash-merged multi-commit pull request could never obtain a delivery receipt, so its issue could never close.

## Problem

`classifyMergeMethod` returns `rewritten-one-parent` for any squash. `verifyLiveDelivery` must then resolve that into a concrete method. For a pull request merged outside the governed provider action, `requireAuthorizedBytes` is false and `mergeMethodObservation` is null, so the only remaining path is `provesSingleSourceSquash` — which requires the pull request to hold exactly one source commit, and that commit to have exactly one parent.

Any multi-commit pull request fails the first condition; one whose head is itself a merge commit also fails the second. The classification collapses to `unknown` and delivery throws `delivery-verification:merge-method-unknown`. `close` inherits the refusal.

GitHub supplies no authoritative historical merge method. Verified live against PR #1489: the REST payload exposes `merged`, `merged_by`, `merge_commit_sha`, `mergeable`, `mergeable_state`, and `auto_merge`; none records the method used, and `rebaseable` and `squash_merge_commit_title` are both null after merge. The production adapter correspondingly never sets `pullRequest.mergeMethod`. A topology proof is required rather than preferred.

## Proof

`provesMultiSourceSquash` is a separate async predicate consulted only after every cheaper path has declined. `classifyMergeMethod` stays pure and synchronous. Every condition must hold, and missing or malformed evidence returns false rather than throwing:

1. the merge commit has exactly one parent;
2. the merge SHA differs from the accepted SHA;
3. the merge tree equals the accepted head's tree;
4. the merge parent is an ancestor of the accepted SHA;
5. the source inventory is complete, non-empty, and bound to the accepted SHA.

Condition 4 separates squash from rebase. A rebase replays each source commit onto the base, so the merge SHA is the last replayed commit and its parent is a freshly created rewrite that never existed on the source branch. Condition 1 excludes an ordinary merge, condition 2 a fast-forward, and condition 3 any squash that dropped or reverted accepted content, since a revert necessarily moves the tree.

Deliberately never relied on alone: repository merge settings, commit title or message, one-parent topology, tree equality, and accepted-SHA reachability.

## Scope

One production file. No adapter change was needed — `fetchCompletePullRequestCommits` already requests `tree{oid}` per source commit, `inspectMergeCommit` already returns the merge tree and parents, and `isAncestor` is already a required verification function. `delivery-preflight`, `delivery-authority`, approval, exact-head, and receipt requirements are untouched.

## Known imprecisions, recorded not hidden

A single-commit rebase is topologically identical to a single-commit squash and is reported as a squash; the outcomes are semantically identical. Condition 4 fail-closes on a legitimate squash of a branch never synced with a base that had moved — refusing rather than misclassifying.

## Verification at `d6a3dece`

- New focused suite 8/8, covering both real pull-request shapes plus rebase, ordinary merge, fast-forward, tree mismatch, reverted descendant, and incomplete inventory
- Five existing delivery suites 65/65, unchanged
- Full Unit, Integration, and Slow lanes green in the governed Test sandbox
- `npm run lint` and `npm run format:check` exit 0

Every new fixture deliberately omits `pullRequest.mergeMethod`; setting it would short-circuit through `mergeMethodObservation` and the new code would never execute while the tests still passed. Both positive cases were observed failing with `merge-method-unknown` before the implementation was written.

## Impact

Unblocks delivery receipts and close for #1485 and #1488, and behind them #1226 and the remaining #1220 child chain.
