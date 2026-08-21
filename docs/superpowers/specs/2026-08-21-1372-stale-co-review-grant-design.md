# Stale Co-Review Grant Resolution Design

<!-- cspell:ignore ENOENT prefiltering -->

**Issue:** #1372  
**Status:** Approved for implementation under Full-Auto authorization  
**Reviewers:** Codex author, Claude reviewer

## Context

The live #939 co-review has a healthy protocol, a claimed Claude reviewer turn,
and immutable round-two review evidence. Its reviewer commands nevertheless
fail before execution because `resolveReviewerGrant` canonicalizes filesystem
paths for every active index row before it checks the row's provider and session
identity. An unrelated test runtime that no longer exists can therefore throw
`ENOENT` and wedge a valid exact-session lookup.

The write-policy guard correctly treats an exception as an invalid grant. The
defect is earlier: unrelated rows reach the fallible filesystem predicate.

## Invariant

Grant resolution must ignore rows that cannot represent the requesting
provider/session without touching their filesystem paths. Once a row matches
that durable identity, all existing runtime and worktree validation remains
fail-closed. A missing path on the requesting grant must still throw rather
than being skipped.

## Considered Approaches

### 1. Filter durable identity before filesystem validation

First require an active lifecycle, reviewer claim role, exact provider, exact
session id, and a pending review path. Only matching candidates proceed to
runtime/worktree canonicalization and live-protocol validation.

This is the selected approach. It changes predicate order without weakening
the validation applied to any candidate that could authorize the request.

### 2. Catch and skip canonicalization failures

This would prevent stale rows from throwing, but it would also silently skip a
corrupt identity-matching grant. That changes fail-closed behavior and is
rejected.

### 3. Prune stale rows during lookup

This would mix authorization with shared-index mutation, require new ownership
and locking rules, and create cleanup races. Index compaction is outside #1372
and this approach is rejected.

## Design

`resolveReviewerGrant` will evaluate each row in two phases:

1. Apply only durable, non-filesystem predicates:
   - lifecycle is `active`;
   - claimed role is `reviewer`;
   - claimed provider equals the requesting provider;
   - claimed session id equals the requesting session id; and
   - a pending review path is present.
2. For rows that pass phase one, apply the existing location predicate:
   - exact canonical runtime and worktree roots when a runtime is supplied; or
   - the existing worktree comparison for non-runtime lookup.
3. Preserve the existing live reviewer-claim, owner-handoff-commit, and
   ambiguity checks unchanged.

No exception from canonicalizing an identity-matching row will be caught or
suppressed. The caller's guard will continue converting such failures into a
denied grant.

## Test Strategy

Direct index tests will establish both sides of the security boundary:

- An earlier unrelated active row with a deleted runtime plus a later healthy
  exact provider/session row resolves the healthy grant.
- A deleted runtime or worktree on the exact provider/session row still throws.

Existing write-policy and reviewer-command-boundary tests will verify that the
sanctioned absolute reviewer command remains accepted without changing the
guard's negative cases. The repository fast and slow suites, lint, and format
checks remain delivery gates.

## Recovery of #939

The repair will not recreate, import, edit, or delete #939 protocol evidence.
After #1372 reaches trunk, the fresh Claude session will use the existing
generated absolute handoff against the preserved runtime. Success requires a
healthy integrity result and the same immutable reviewer evidence.

## Out of Scope

- Index pruning, compaction, or cleanup policy.
- Rewriting historical stale rows.
- Weakening path checks for the requesting grant.
- Implementing #939's governed PR delivery behavior.

## Decision Record

Codex and Claude independently confirmed the predicate-order root cause and
agreed that identity prefiltering plus an explicit matching-stale fail-closed
regression is the narrow repair. Full-Auto authorization permits the governed
workflow to continue without an additional manual gate.
