# #2040 independent code review round 1

Reviewer: gpt-6-astra / high, fresh context. The completed report below is verbatim.

### Scope and strengths

Reviewed exact range `5df02b678caef3c01950017ccbef4a20d51127bf..107ccad26d4ec8d8e0755b8f8cc38e0029dc48bf` against active Task 1 / #2040 and its accepted native-observation contracts.

The implementation preserves the unedited seed, opaque edit IDs, independent UTF-8 hashing, canonical copied identity, immutable observations and read-only ownership. Missing latest metadata and tombstones refuse without fallback. Scope remains appropriately bounded.

### Issues

**Critical:** None.

**Important — Reject contradictory pagination metadata for edited histories.**

- **Location:** `scripts/task-tracker/lib/story-cache/native-observation.mjs:67-73`
- The optional `pageInfo` validation checks contradictions only when `totalCount === 0`. An edited connection with one returned node, `totalCount: 1`, and `hasNextPage: true` is accepted as a complete observation, despite explicitly claiming another node beyond its total. Likewise, `totalCount: 3`, one returned node, and `hasNextPage: false` is accepted.
- I reproduced both cases independently: each returned `revision.mode: 'edited'` and would receive `provenance.complete: true`.
- This violates the selected scope’s refusal of inconsistent supplied metadata. Diagnostic counts need not become revision versions to validate internal connection consistency.
- **Fix:** When optional page metadata is present, validate consistency between the bounded `first:1` result, count and continuation flag. Preserve the supported case of one current node with older history (`totalCount > 1`, `hasNextPage: true`) and compatibility when `pageInfo` is absent. Add edited-history regression cases.

**Minor:** None.

### Independent verification

- Exact targeted verifier: **36 passed, 0 failed**.
- Additional read-only probes reproduced both pagination inconsistencies.
- Additional probes confirmed impossible calendar dates and `24:00:00` timestamps refuse.
- Exact-range `git diff --check` passed.
- No files or repository state were changed.

The TDD record distinguishes the missing-module failure, erroneous digest expectation and later behavioral failures honestly. I did not independently witness or reconstruct its historical red/green sequence.

### Declined to judge

- Snapshot transport, root GraphQL errors, census and budgets: owned by #2052.
- Cross-snapshot drift and equal-count inventory replacement: owned by #2053.
- Reconciliation, digest-only policy, publication and activation: later capabilities.
- Provider behavior beyond retained evidence, including latest-history deletion: no live provider verification performed.
- Native lifecycle approvals, delivery receipts, CI and prerequisite ancestry equivalence: treated as supplied evidence, not independently revalidated.
- Cross-resource identity membership: belongs to snapshot transport; this review assessed local identity validation and preservation.

### Assessment

**Ready to merge: With fixes.**

The component is focused and its existing tests pass, but explicit edited-history pagination contradictions currently become complete observations. Fix that refusal gap before accepting #2040.

## Author disposition

Accepted Important. The count is not a revision version, but supplied connection metadata must be internally consistent before provenance can claim completeness. Add and observe the two edited-history refusals failing, then extend the existing optional-page validation without requiring pageInfo when absent or traversing history. Preserve the supported one-node result with older history.

Accepted scope limitations: snapshot transport, cross-resource membership and root errors remain #2052; drift remains #2053; reconciliation and publication remain later leaves. Those capabilities must be independently verified by their owners, not treated as shipped here. Cost if wrong: a later consumer cannot assume this pure observation proves complete census or write authority. Latest-history deletion remains an offline refusal scenario rather than a live provider claim. Native lifecycle/CI and ancestry evidence remain the author's native results, not reviewer-reverified authority; exact-head delivery gates remain mandatory. No deferred Minor findings.
