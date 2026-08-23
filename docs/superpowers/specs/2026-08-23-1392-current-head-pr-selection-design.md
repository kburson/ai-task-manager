# Current-Head Pull Request Selection Design

## Problem

GitHub retains PR #1385 and PR #1391 for the same governed branch. Only #1391 points to the current local head, but delivery fetches both branch-associated PRs and rejects the array before applying its existing exact-head validation.

## Decision

Fetch all branch-associated PR snapshots, then select those whose `headRefOid` exactly equals `localHeadSha`. Pass only that selection into the existing delivery preflight and require its existing one-PR invariant.

This preserves historical visibility while making the delivery identity the pair of branch and exact head. It also preserves merged recovery because selection is independent of open or merged state.

## Alternatives Rejected

1. Query only open PRs. This would break post-merge receipt recovery.
2. Add a manual PR-number override. This would add mutable operator input where exact-head evidence already identifies the PR.
3. Pick the newest PR. Time ordering is weaker than the immutable head SHA and can conceal duplicate current-head PRs.

## Error Handling

When multiple branch-associated PRs are discovered, zero exact-head matches and multiple exact-head matches remain `delivery-preflight:pull-request-count` refusals. A sole discovered PR is retained so the existing preflight can continue reporting the more specific `head-mismatch` diagnostic. The selector does not guess, use the first of multiple results, or fall back to a historical head when branch history is ambiguous.

## Testing

A focused delivery test will provide one historical merged PR at an old SHA and one open PR at local HEAD, then require the action to name the current PR. Existing one-PR tests continue covering normal and merged recovery. Additional focused cases require zero and duplicate exact-head matches to retain the count refusal.

## Scope Boundaries

No branch rename, PR override, state-only filtering, action-envelope change, or relaxation of Test, Review, check, and dirty-path gates is included.
