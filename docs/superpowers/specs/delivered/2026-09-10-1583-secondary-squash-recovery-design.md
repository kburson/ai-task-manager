# #1583 Secondary Squash Recovery Design

## Context

AITM can recover delivery evidence after an externally performed GitHub squash only when it can reconstruct a delivery intent and prove the accepted head, complete source-commit inventory, merge topology, resulting tree, trunk reachability, and issue attribution. The GitHub-default multi-source squash fallback compares the bracketed issue-token set observed in the merge title and body with the source-derived authorized set.

PR #1582 is a legitimate shared carrier for epic #1531 and several blocking defects. Its default squash message contains the exact bracket-token set derived from all 58 source commit subjects, but its title leads with `[#1531]`. The current predicate additionally requires that leading token to equal the issue being delivered, so recovery for #1580 refuses despite exact attribution and already-recorded Test, Review, and approval evidence.

## Decision

For the existing external, proven multi-source squash fallback:

- construct the authorized set only from `intent.attributionTokens`;
- require the current target token to be present in that authorized set;
- require the merge title's leading bracket token to be present in that authorized set;
- require the bracket-token set observed across the merge title and body to equal the authorized set exactly; and
- retain every upstream accepted-head, inventory, topology, tree, trunk, Test, and Review proof.

The verifier must not synthesize the target into the authorized set. A caller that omits the target from its complete source-derived tokens must fail closed.

## Security Boundary

This change applies only when all of the following are already true:

1. the delivery provider is `external`;
2. the pull request is proved to be a multi-source squash from complete commit evidence;
3. the merge body makes no canonical `Attribution:` claim;
4. the target issue and title-leading issue are both authorized by the source-derived set; and
5. no bracketed token is missing or extra.

Canonical trailers remain byte-exact and retain precedence. Single-source squash proof, default merge-commit proof, governed provider-action bytes, and incident-ledger authority are unchanged. Parenthesized pull-request references and bare issue references remain non-attributing because the shared `\[#(\d+)\]` primitives are unchanged.

## Alternatives Rejected

### Treat the merge-title issue as the only owner

Rejected because it prevents exact recovery for every legitimately attributed secondary issue in a shared carrier and forces either fabricated delivery or false lineage.

### Add the target to the expected set during verification

Rejected because it hides an incomplete or unauthorized intent. The target must already exist in the complete source-derived token set.

### Use incorporated closure or incident authority

Rejected because this is normal multi-issue delivery, not the narrowly governed #1381 convergence incident. No incident record or disposition should be invented.

### Change issue parentage retroactively

Rejected because #1577, #1578, and #1580 are independent blocking defects with their own lifecycle evidence. Changing their parents after merge would launder delivery history.

## Verification

Focused pure-verifier and verb-boundary tests must prove:

- a secondary target succeeds when it and the title-leading token are authorized and the observed set is exact;
- an absent target, unauthorized leading token, missing or extra observed token, incomplete source inventory, malformed canonical trailer, or unproved squash refuses;
- refusal writes no intent or receipt;
- success writes exactly one external intent followed by one receipt; and
- existing top-level and canonical-trailer recovery stays green.

Repository Develop, lint, format, fast, and slow verification must remain green.

## Lifecycle

Issue #1583 blocks #1580. After #1583 is delivered and Done, AITM must retry #1580's existing exact-SHA delivery recovery without rewriting its evidence. Successful recovery then unwinds #1580 → #1578 → #1577 → #1546 → #1531 in governed dependency order.
