Root cause: the external GitHub-default squash fallback proves the complete observed bracket-token set, source-commit inventory, accepted head, squash topology, tree identity, and trunk reachability, but then requires the merge title's leading token to equal the issue currently being delivered. On a shared carrier pull request that condition makes only the title-leading issue recoverable even when a secondary issue is explicitly present in the same exact authorized source-token set.

### Files to inspect and edit

- `scripts/task-tracker/lib/delivery-verification.mjs`: narrow the default multi-source squash attribution predicate without changing canonical trailers, merge attribution, or other delivery proofs.
- `scripts/tests/unit/task-tracker/lib/delivery-default-squash-attribution.test.mjs`: add focused predicate coverage for a secondary target and its fail-closed boundaries.
- `scripts/tests/unit/task-tracker/verbs/deliver-default-squash-recovery.test.mjs`: prove record consequences at the verb boundary, including exact two-record success and zero-write refusal.
- `docs/superpowers/specs/2026-09-10-1583-secondary-squash-recovery-design.md`: record the ratified security boundary and rejected alternatives.
- `docs/superpowers/plans/2026-09-10-1583-secondary-squash-recovery.md`: record the test-first execution sequence and governed lifecycle checks.

### Implementation sequence

1. Add a failing pure-verifier case whose target is a secondary issue, whose merge title leads with a different authorized token, and whose complete observed token set exactly equals the source-derived authorized set.
2. Add a failing verb-boundary case for the same shape and assert that success writes exactly one external delivery intent followed by one delivery receipt.
3. Add or retain negative cases proving refusal when the target token is absent from the authorized set, the title-leading token is unauthorized, the observed set has an extra or missing token, the inventory is incomplete, a canonical trailer is malformed, or topology does not prove a squash. Refusals must write zero records.
4. Change only the default multi-source squash predicate: construct the authorized set from `intent.attributionTokens`, require both the target token and title-leading token to be members, and preserve exact observed-set equality. Do not synthesize the target into an incomplete authorized set.
5. Run the focused tests RED before production editing, then GREEN after the minimal predicate change.
6. Run governed Develop iteration verification, inspect the diff, commit with #1583 attribution, and execute all issue verification commands and functional DoD evidence stamps at the committed SHA.
7. Drive Test, Review, Full-Auto approval, hosted CI, governed delivery, and closure before retrying #1580.

### Risks and controls

- Risk: accepting an unrelated issue merely because it appears in merge text. Control: require the target to already be in the complete source-derived authorized token set and retain exact set equality.
- Risk: weakening canonical `Attribution:` bytes. Control: the fallback remains disabled whenever any canonical-looking trailer is present; canonical handling is unchanged.
- Risk: accepting a bare issue reference or pull-request number. Control: continue using the shared bracket-token attribution regex only.
- Risk: partial recovery records on refusal. Control: verb-boundary tests assert zero comments and no intent or receipt events for negative cases.
- Risk: broadening merge or rebase recovery. Control: change only the proven multi-source squash predicate; topology, accepted-head, tree, inventory, and trunk checks remain prerequisites.

### Dependencies and lifecycle

#1583 has no implementation dependency beyond current trunk, which already contains the recovery framework from #1490 and #1574. It is the native blocker of #1580. Completion unblocks the ordered chain #1580 → #1578 → #1577 → #1546 → epic #1531. The repair must not alter those issues' parentage, fabricate an incorporated disposition, or rewrite their accepted evidence.
