# No-Commit Delivery Authorization Design

## Problem

AITM explicitly models `audit`, `research`, `spike`, and `epic` as no-commit issue kinds. Their lifecycle evidence is a governed `aitm-deliverable-posted` marker rather than a commit trail. That contract works through Review, but provider delivery and close authorization currently require a pull request and `aitm.delivery-receipt/v1`. A valid no-commit issue therefore cannot reach Done.

## Decision

Add a separate `aitm.no-commit-delivery/v1` authorization record. `/task deliver` will create it only for an issue carrying an explicit no-commit kind marker, after confirming Review evidence and approval. The result is terminal delivery evidence with `action: null`; it never creates a provider intent or asks for a merge.

The record binds:

- repository and issue number;
- explicit no-commit issue kind;
- exact governed deliverable URL;
- accepted Test/Review SHA;
- provider/session provenance and verification time.

The record is stored as one canonical hidden marker at the start of an issue comment, with a short visible summary. Parsing uses exact keys, canonical JSON, bounded strings, canonical timestamps, and the existing record-ID format.

## Delivery Flow

`runDeliver` keeps child-lineage handling first. For a top-level issue, it reads the issue kind. Code-kind issues continue into the existing PR path unchanged. An explicit no-commit kind instead:

1. requires Review state, Agent Review evidence, and an exact deliverable URL marker;
2. resolves the accepted Test/Review SHA and review authorization;
3. reads all issue comments and projects no-commit authorization records;
4. returns the identical record if already authorized, or posts and exactly reads back one new record;
5. returns `delivered` or `already-delivered` with no provider action.

Malformed or conflicting records are refusals. A record for a prior deliverable URL or accepted SHA does not authorize the current issue state.

## Close Flow

Close input loads comments for explicit no-commit kinds even when no pull request exists. The pure close gate branches on the issue body before the PR receipt path. It requires exactly one canonical authorization matching the live repository, issue, kind, deliverable URL, and accepted Review SHA.

Fresh verification recomputes those live values. It does not run PR reachability or merge-byte checks because no merge exists. Code-kind, docs-only, child-lineage, and explicitly authorized local-trunk behavior remain unchanged.

## Alternatives Rejected

- Empty commit and PR: fabricates code delivery and contradicts the issue-kind model.
- Deliverable marker alone: permits evidence authored before Review to skip the explicit Deliver transaction.
- Unionize `aitm.delivery-receipt/v1`: mixes PR and no-commit authorities and raises regression risk for code delivery.

## Testing

Focused Deliver tests cover creation, exact readback, idempotence, absence of provider action, explicit-kind routing, and malformed/missing/stale evidence. Focused Close tests cover exact authorization and refusals for missing, duplicate, conflicting, wrong-issue, wrong-kind, wrong-URL, and wrong-SHA records. Existing delivery and close receipt suites remain the regression proof for commit-bearing behavior.

## Scope Boundary

This does not implement cloud verification receipt v2, merge-tail receipts, provider merge changes, or synthetic commits. It only completes the already-established no-commit lifecycle contract.
