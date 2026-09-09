# BLOCKED Disposition and Native Dependency Readiness Design

**Issue:** #1557
**Status:** Approved
**Date:** 2026-09-08

## Problem

AITM currently represents an issue dependency with three repository-specific
carriers:

1. an `aitm-blocked-by` issue-body marker;
2. a `BLOCKED` issue label; and
3. a `Blocked By` GitHub Project text field.

The body marker is the runtime authority. The label and field mirror it. This
duplicates a relationship GitHub now supports natively and makes GitHub's
Dependencies UI informational to AITM. A dependency added through that UI does
not participate in lifecycle gates or `pull-next` selection.

The current auto-unpark behavior is also destructive. When an upstream issue
reaches Done, AITM removes its reference from dependent bodies and eventually
removes the label. That loses durable evidence of the relationship.

The desired workflow has two valid delivery boundaries:

- a standalone issue is Done only after its delivery reaches trunk; and
- an epic child is Done after its delivery reaches the parent epic's feature
  branch, before that feature branch reaches trunk.

AITM already implements those Done semantics in `close-gates-lineage.mjs`.
Dependency readiness should consume the resulting AITM Status rather than
introduce a second branch or commit check.

## Goals

1. Make GitHub native issue dependencies the sole live dependency authority.
2. Add exact option `BLOCKED` to the Project `Disposition` single-select field.
3. Derive `Disposition = BLOCKED` when at least one native dependency is not
   AITM Status `Done`.
4. Clear the transient Disposition when every native dependency is Done or no
   dependencies remain, while retaining the native links.
5. Preserve all current forward lifecycle dependency gates from Ready for
   Planning through Review.
6. Make `aitm block` an idempotent set union and `aitm unblock` an idempotent
   set subtraction, including an explicit remove-all form.
7. Reconcile the projection eagerly for AITM mutations and Done transitions,
   and lazily at normal workflow touch points.
8. Provide an explicit, auditable, interruption-safe migration for unambiguous
   open legacy records.
9. Preserve historical snapshot and incident readers without allowing legacy
   carriers to remain runtime authority.

## Non-goals

- A webhook, daemon, poller, or background synchronization service.
- A commit hook or per-commit dependency gate.
- Deleting the existing `Blocked By` Project field or `BLOCKED` label
  definition.
- Rewriting closed issue history.
- Automatically interpreting a label-only issue as a dependency relationship.
- Changing AITM's existing standalone-versus-epic-child Done semantics.
- Deriving readiness directly from branch ancestry, PR state, or GitHub issue
  open/closed state.
- Rolling back a verified native dependency mutation when a later projection,
  comment, or cleanup step fails.

## Selected authority model

GitHub's native `blockedBy` and `blocking` connections are the only live graph
authority.

AITM Project Status is the only readiness authority for nodes in that graph.
A dependency is satisfied only when its configured-project Status normalizes to
`done`. An open GitHub issue in AITM Done is satisfied. A closed GitHub issue
whose configured-project Status is not Done remains unsatisfied until the
existing close-convergence workflow repairs it. A missing, malformed,
ambiguous, truncated, or unreadable Status fails closed.

`Disposition` is a transient projection of that graph and those statuses:

| Native dependency state                | Current Disposition  | Projection action                                      |
| -------------------------------------- | -------------------- | ------------------------------------------------------ |
| One or more dependencies are not Done  | empty or `BLOCKED`   | write or retain `BLOCKED`                              |
| All dependencies are Done              | `BLOCKED`            | clear the field                                        |
| No dependencies                        | `BLOCKED`            | clear the field                                        |
| Any dependency or Status is unreadable | non-terminal         | require/retain `BLOCKED`; return unknown-state failure |
| Any graph state                        | terminal Disposition | preserve the terminal value                            |

The terminal values remain exactly `Delivered`, `Replaced`, `Discarded`,
`Duplicate`, and `Incorporated`. `BLOCKED` must not be added to
`TERMINAL_DISPOSITIONS`.

The native relationship remains after satisfaction. It is durable provenance
that the downstream issue depended on the upstream issue; only the transient
visual projection is cleared.

## GitHub dependency adapter

A new `native-dependencies.mjs` module owns all native graph I/O and
normalization. Other workflow code must not parse raw `gh` output or assemble
dependency flags independently.

### Read contract

Production reads use:

```text
gh issue view <N> -R <owner/repo> --json blockedBy,blocking
```

The current GitHub CLI returns each relation as a connection-shaped object:

```json
{
  "nodes": [],
  "totalCount": 0
}
```

The adapter returns a canonical sorted unique array of positive issue numbers.
It rejects the read when:

- the connection or node list is absent;
- `totalCount` is not a non-negative integer;
- `nodes.length` does not equal `totalCount`;
- a node lacks a positive issue number;
- a node belongs to another repository;
- duplicate or conflicting node identities make the payload ambiguous; or
- the provider indicates pagination or another incomplete result.

The adapter accepts dependency-injection seams so unit tests can exercise every
malformed and partial response without changing live GitHub state.

### Mutation contract

Production mutations use the native GitHub CLI flags:

```text
gh issue edit <A> -R <owner/repo> --add-blocked-by <B>
gh issue edit <A> -R <owner/repo> --remove-blocked-by <B>
```

Callers calculate a desired set from a fresh read. The adapter applies only the
missing additions or present removals. After mutation, it rereads the entire
connection and compares it with the exact desired sorted set. A command exit of
zero without matching readback is a failure.

The adapter rejects self-dependencies before mutation. It validates every
referenced issue in the configured repository. A dependency may already be
Done; adding it is still valid provenance and projection immediately resolves
to empty.

## Disposition projector

A new `dependency-disposition.mjs` module composes three existing capabilities:

- native dependency reads;
- configured-project Status reads; and
- Project single-select field reads, writes, and clears.

It exposes one reconciliation operation for an issue. The operation:

1. reads the complete native `blockedBy` set;
2. reads every dependency's AITM Status;
3. derives `blocked`, `ready`, or `unknown`;
4. reads the dependent issue's current Disposition;
5. returns `terminal-preserved` without mutation for a terminal value;
6. writes `BLOCKED` for `blocked`;
7. clears a current `BLOCKED` value for `ready`;
8. rereads Disposition and verifies the expected projection; and
9. returns a structured result including unfinished references and failures.

An unknown dependency state fails closed. If the field currently contains a
non-terminal value other than `BLOCKED`, reconciliation refuses to overwrite it
and reports the unexpected value. This avoids silently erasing a future
operator-defined workflow value.

Project writes use the existing `writeProjectFieldValue` and
`clearProjectFieldValue` primitives. Installation/repair must ensure the exact
`BLOCKED` option exists before runtime use. A missing option or field ID is an
explicit init-repair error, not a label fallback.

## `aitm block`

Public usage remains:

```text
aitm block [A] --by B,C
```

The operation is a set union:

```text
desired = existing native blockedBy ∪ requested
```

Behavior:

1. resolve `A` from the positional issue or active binding;
2. parse, normalize, sort, and deduplicate `B,C`;
3. reject an empty list, invalid references, and `A` itself;
4. read the complete existing native set;
5. add only requested references not already present;
6. verify exact desired-set readback;
7. reconcile `A`'s Disposition from the verified native set; and
8. post one audit comment for each newly added relationship.

Re-running the same command produces no duplicate relationship or comment.
Existing unrelated dependencies remain. If every requested reference already
exists, the command is an idempotent no-op for the graph but still reconciles
Disposition so a previous partial failure can heal.

## `aitm unblock`

Public usage remains:

```text
aitm unblock [A] --by B,C
aitm unblock [A]
```

With `--by`, the operation is set subtraction:

```text
desired = existing native blockedBy − requested
```

Without `--by`, the explicit remove-all form uses:

```text
desired = ∅
```

Only present requested references are removed. Missing references are an
idempotent no-op. Unrelated dependencies remain. The command verifies exact
desired-set readback, reconciles Disposition from the remaining set, and posts
audit comments only for relationships actually removed.

The command no longer means "mark the work ready." Removing one edge may leave
other unfinished dependencies, so the projected Disposition may remain
`BLOCKED`.

## Lifecycle gate behavior

The existing `blocked-by-not-done` exit guard stays registered at every current
forward exit from Ready for Planning through Review:

- Ready for Planning to Plan;
- Plan to Develop;
- Develop to Test;
- Test to Review; and
- Review to Done.

Backlog and Refine remain available for shaping blocked work. Reverse moves and
the sanctioned unblock command remain recovery paths.

At each guarded exit, the guard reads the live native dependency set and every
dependency Status. It refuses when any dependency is not Done and names each
reference plus normalized state. It also refuses when the graph or any Status
is unreadable. A missing dependency reader is no longer a fail-open success.

The guard invokes projection reconciliation from the same observation. If the
native set is ready but clearing a stale `BLOCKED` value fails, the transition
returns a projection partial failure and is retried; the authoritative graph is
unchanged. This keeps the board projection convergent without inventing a
second dependency rule.

No gate is added to individual Git commits. If a dependency is added while a
story is already in Develop, worktree edits and commits remain possible. The
dependency is enforced at the next forward lifecycle transition.

## Feature-branch satisfaction

Dependency readiness deliberately asks only whether the upstream issue is AITM
Done.

For a child of an epic, the existing close lineage gate establishes Done after
the child's attributed delivery is reachable from the immediate parent epic's
integration branch. A downstream child can therefore start while the parent
feature branch is still awaiting final validation and its PR to trunk.

For a standalone issue, the existing close lineage gate establishes Done only
after trunk delivery. The dependency projector and guard do not need to know
which delivery boundary applied; the upstream lifecycle already certified it.

## Eager and lazy reconciliation

### Eager touch points

Reconciliation runs immediately after:

- successful `aitm block` set verification;
- successful `aitm unblock` set verification; and
- an upstream issue reaches AITM Done.

For Done, AITM reads the completed issue's native `blocking` connection and
reconciles every dependent issue. It does not remove any relationship. The Done
move is already committed, so dependent projection failures are surfaced but
do not roll the upstream issue backward.

### Lazy touch points

Reconciliation also runs when:

- an issue is bound or resumed;
- `pull-next` evaluates a child;
- a dependency guard evaluates a forward transition; and
- block/unblock is retried after a partial result.

This covers dependencies added or removed through the GitHub UI without adding
a service. The native graph becomes authoritative immediately. The Disposition
may be visually stale only until the next touchpoint.

Bind remains durable even if projection repair fails. The bind output must name
the partial failure so the operator can retry a dedicated touchpoint. In
contrast, a guarded forward transition fails until both dependency readiness
and its required projection readback succeed.

## `pull-next` and epic admission

`pull-next` must use live native dependency state, including dependencies that
are not siblings of the current epic. It may select a Ready-for-Planning child
only when:

- its current refinement evidence is valid;
- its Rank is finite;
- its native dependency connection is complete;
- every dependency's configured-project Status is Done; and
- no existing active-child budget rule refuses the pull.

Ordering remains blocker-first, then Rank ascending. The blocker-first set is
derived from native relationships among enumerated children, while readiness
uses Status lookups for every referenced issue. Unknown or incomplete evidence
makes the child ineligible and produces the existing no-eligible/ambiguous
diagnostic rather than treating it as unblocked.

Wave admission and WIP checks consume the same enriched dependency shape. No
consumer may fall back to body-marker parsing.

## Refinement snapshot compatibility

Current refinement snapshot schema 2 embeds the legacy blocker set in its
digest and marker. Keeping that field would copy native graph state into a
second durable authority and would make an operational dependency edit look
like stale product refinement.

New snapshots therefore use schema 3 and exclude dependencies from:

- the digest inputs;
- the serialized snapshot properties; and
- current-refinement equality checks.

Scope, acceptance criteria, required planning fields, labels, and rationale
remain covered exactly as today.

Readers continue to parse schema 1 and schema 2. Their embedded blocker fields
are historical compatibility evidence only. Existing parked issues do not need
a bulk snapshot rewrite merely because runtime authority moves to GitHub.
Migration and shelving code may recognize the historical values when proving a
strict legacy conversion, but new dependency changes never author or refresh
those values.

## Legacy migration

The new repository-wide command is explicit:

```text
aitm migrate-dependencies --dry-run
aitm migrate-dependencies --apply
```

Dry-run is read-only and is the default-safe inspection mode. Apply requires
the explicit flag; the two flags are mutually exclusive.

### Candidate classes

The migration enumerates issues and classifies them as:

- `strict-open`: an open issue with one valid strict `aitm-blocked-by` marker;
- `closed-history`: a closed issue carrying legacy evidence;
- `ambiguous-label-only`: an open issue with the `BLOCKED` label but no strict
  marker;
- `already-native`: an open strict candidate whose required native edges
  already exist; or
- `malformed`: an issue with conflicting, duplicate, or unparsable marker
  evidence.

Only `strict-open` and `already-native` candidates mutate under `--apply`.
Closed history is reported and untouched. Label-only and malformed issues are
reported without mutation.

### Per-issue apply order

Each issue is processed independently in this order:

1. read and validate the strict marker;
2. union its references into the native `blockedBy` set;
3. verify exact native readback;
4. reconcile and verify Disposition;
5. clear the installed legacy `Blocked By` field value, when configured;
6. remove the legacy `BLOCKED` label from the issue; and
7. remove the strict body marker last through versioned body mutation.

The body marker is the migration retry token. If any earlier step fails, it
remains and a rerun resumes safely. Once the marker is removed, all earlier
native and cleanup state has already been verified. Native additions are
idempotent, field clear and label removal are idempotent, and body mutation is
fresh-base/version guarded.

The migration emits a per-issue result and a summary. Any partial or ambiguous
item produces a non-zero apply result without rolling back successful native
edges on other issues.

## Installation and existing projects

Both canonical field-definition files add:

```json
{
  "name": "BLOCKED",
  "color": "RED",
  "description": "Waiting on unfinished issue dependencies."
}
```

`ensureDispositionField` already updates an existing single-select definition
additively. It preserves every observed existing option ID and value and
appends the missing canonical option. Tests lock that behavior.

The `Blocked By` definition is removed from new-install provisioning. Existing
project fields and existing `fieldBlockedBy` configuration are not deleted.
Migration may use that configured ID to clear legacy values. Runtime dependency
logic must not require it, warn when it is absent, or write new values to it.

The repository does not delete the `BLOCKED` label definition. New runtime
paths stop adding it, and migration removes it only from strict converted
issues. Unrelated or ambiguous label uses remain for human review.

## Partial failure semantics

Native dependency state is retained after a verified mutation even when a later
step fails. Results distinguish at least:

- `added`, `removed`, or `idempotent` graph status;
- `projected`, `cleared`, `terminal-preserved`, or `projection-partial`;
- exact added, removed, remaining, unfinished, and unknown reference lists; and
- the failing step and provider message.

Commands exit non-zero for native readback mismatch, unknown dependency state,
or projection partial failure. Retrying starts with a fresh native read and
converges from what actually landed.

Audit comment failure is reported separately and does not roll back a verified
graph or projection. Done fan-out remains best-effort because the upstream Done
transition has committed; later lazy touch points provide repair.

No error path reconstructs the native graph from the old label, field, body
marker, Plan Metadata prose, issue state, or local cache.

## Command and documentation surfaces

Command dispatch, help data, command contracts, argument metadata, routing
identity, and generated self-documentation must all describe the native
behavior. Public help should say:

- `block` adds native dependency relationships and reconciles Disposition;
- `unblock --by` removes selected relationships;
- `unblock` without `--by` removes all relationships; and
- `migrate-dependencies` converts strict open legacy records only.

Operator documentation must replace claims that the marker is authoritative or
that Done removes dependency evidence. The guard architecture table continues
to list `blocked-by-not-done`, but its evidence source becomes native GitHub
dependencies and configured-project Status.

## Verification strategy

Focused tests cover:

- native connection normalization, completeness, identity, and set readback;
- additive Disposition installation/repair;
- BLOCKED/empty projection and terminal safety;
- block union, unblock subtraction, remove-all, duplicates, and retries;
- all five registered lifecycle exit slots;
- UI-added relationships with no legacy carriers;
- cross-epic and non-sibling dependency statuses in `pull-next`;
- eager Done fan-out and every lazy touchpoint;
- dependency-free refinement schema 3 with schema-1/schema-2 compatibility;
- migration dry-run/apply, cleanup order, interruption recovery, closed
  history, malformed markers, and ambiguous label-only issues;
- retained feature-branch child Done semantics in `close-gates-lineage`; and
- help/config/documentation consistency.

The issue's root Verification Commands bind these focused files to the
acceptance criteria. Completion also requires lint, format, the fast test lane,
the slow lane, and final commit-trail inspection.

## Rollout

1. Ship additive Disposition repair, native runtime support, and the migration
   command together.
2. Run `aitm init-repair` to add `BLOCKED` without disturbing existing options.
3. Run `aitm migrate-dependencies --dry-run` and review every strict,
   closed-history, malformed, and label-only classification.
4. Run `aitm migrate-dependencies --apply` only after the dry-run is accepted.
5. Re-run dry-run; it should report no remaining strict-open mutations and keep
   ambiguous items unchanged.
6. Use native GitHub Dependencies or `aitm block`/`aitm unblock` for all new
   relationships.

For the current repository audit, open issue #842 is the known strict-marker
candidate. Open issue #1240 is label-only and must be reported without
mutation. Closed marker history remains untouched.

## Decision summary

This design treats dependency relationships, readiness, and presentation as
three separate concerns:

- GitHub native Dependencies own the graph.
- AITM Status Done owns satisfaction, including epic feature-branch delivery.
- Disposition `BLOCKED` is a repairable transient projection.

That separation removes duplicate authority, preserves provenance, retains the
existing lifecycle safety boundary, and supports eventual UI consistency
without introducing a background service.
