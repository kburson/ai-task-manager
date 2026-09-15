# #1632: Require Trunk Delivery Before Root Done

## Status

Approved by the user's explicit correction on 2026-09-15: issue #1624 must not
have reached Done without a pull request merged to trunk, and delivery is not
established until the accepted work is on trunk.

## Problem

AITM closed root epic #1624 and moved it to Done while its accepted SHA existed
only on a local epic branch. There was no remote feature branch, no pull request,
and no accepted content on `origin/trunk`.

Two independent close-path rules admitted the false result:

- `epic` is a no-commit issue kind, so the close delivery gate accepted a posted
  deliverable record instead of requiring a merged pull-request receipt.
- the lineage Done gate checked a surviving epic's child trail on the epic branch
  itself, even when the epic was a root whose parent delivery target is trunk.

The terminal close transaction faithfully recorded the result of those rules;
the fault is that the rules authorized an undelivered root epic.

## Required Semantics

AITM keeps its intentional integration hierarchy:

- A child story or nested epic may be Done after governed integration into its
  immediate parent epic branch.
- A root epic or standalone feature branch is Done only after authoritative
  delivery to configured trunk.
- Delivery to trunk from a feature branch is pull-request governed. Full-Auto,
  review bypass, local lifecycle markers, and a close journal are never delivery
  authority.
- A true no-commit artifact such as an audit, spike, or research result may use
  its issue-resident deliverable receipt.
- An epic may remain a no-commit kind for Develop/Test, but a root epic may not
  use the no-commit exception at Close: its aggregate child history is a
  commit-bearing delivery.
- An operator-authorized local-trunk lane remains valid only when work is already
  executing on the configured delivery target.

## Design

### Lineage-aware delivery receipt classification

`requireDeliveryReceipt()` will admit the no-commit artifact receipt only when
the issue is not a root epic. A nested epic continues to return through the
existing parent-integration path. A root epic falls through to the same strict
pull-request receipt contract as other top-level branch work.

Consequently, no PR, multiple candidate PRs, an open PR, a wrong head, a wrong
base, a missing merge commit, or an uncorrelated durable receipt all refuse before
any delivered-close transaction or terminal mutation.

### Parent-target epic trail

`lineageDoneGate()` will resolve an epic's Done target with
`resolveDoneTargetBranch()` and run the derived child-trail proof against that
target. The target is trunk for a root epic and the nearest surviving ancestor
epic branch for a nested epic. The epic's own branch is a source, never proof that
the epic was delivered upward.

This proof complements the merged-PR receipt:

- the receipt establishes authoritative provider delivery, exact accepted head,
  target base, merge method, and fresh trunk verification;
- the lineage gate establishes that every delivery-required child is represented
  on the actual parent target.

### Squash compatibility

The accepted feature SHA need not be an ancestor of trunk after a legitimate
squash. A successful close reuses AITM's existing correlated delivery intent and
receipt, complete source-commit evidence, inspected merge commit, and trunk
verification. The derived child-trail remains message-attribution based, relying
on the delivery path's existing requirement that child `[#N]` tokens survive in
the squash commit body.

### Failure and recovery

The new check runs before terminal mutation and is not controlled by the human
review gate. A failure leaves the issue open and out of Done with an actionable
delivery-receipt or lineage blocker.

Issue #1624's historical markers must not be rewritten to pretend delivery
occurred. After #1632 is merged to trunk, its preserved accepted branch will be
published and delivered through a governed pull request. The supported reopened
close recovery path will then correlate fresh delivery evidence with the prior
terminal transaction.

## Compatibility

Unchanged paths:

- audit, research, and spike artifact delivery;
- nested child and nested epic delivery to a parent epic branch;
- explicitly authorized work already on the main delivery target;
- ordinary top-level merged and squash pull-request delivery.

Changed path:

- a root epic can no longer close from a posted deliverable plus an epic-local
  child trail. It must be delivered to trunk.

## Verification

The #1624 regression test must demonstrate that Full-Auto plus a locally complete
epic branch and posted deliverable cannot reach terminal mutation without a PR.
Companion cases must demonstrate successful correlated merged delivery, root
epic child-trail proof on trunk, nested epic parent delivery, and preservation of
genuine no-commit and authorized main-thread lanes.
