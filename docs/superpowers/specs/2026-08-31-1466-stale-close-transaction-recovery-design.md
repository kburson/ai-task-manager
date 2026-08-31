# Stale Pre-Terminal Close Transaction Recovery Design

## Status and authority

This design governs issue #1466, discovered while closing #1461. It adds one
explicit recovery transition for a Delivered close transaction whose accepted
SHA became stale after a corrective amend. It does not relax the existing
exact-SHA close gate, protected-marker policy, or terminal convergence rules.

The concrete incident is bounded: #1461 persisted an
`aitm.delivered-close/v1` transaction for an earlier accepted SHA and completed
only `timing`. A production serialization defect then required an amended commit
and fresh exact-SHA Test and Review evidence. Ordinary close correctly refuses
the stale transaction, while the generic issue-body verb correctly refuses to
rewrite the protected marker.

## Command surface

Recovery is requested only through:

```text
npx aitm close #N --restart-stale-transaction
```

The flag is separate from `--repair`. It has no implicit or automatic form and
cannot be combined with forceful authority bypasses. Ordinary `close`, generic
`issue-body`, provider delivery, and no-commit delivery semantics remain
unchanged.

The recovery reason is the canonical machine value
`accepted-sha-corrective-amend`. The first version does not accept free-form
reason text; this keeps retries deterministic and avoids treating prose as
authority.

## Recovery authority

Before any write, the command must establish all of the following from current
authoritative state:

1. The issue is open and its live Project status is Review.
2. The current session is assigned to and bound to the target issue in the
   recorded worktree.
3. The bound checkout is clean and its current 40-character HEAD is the accepted
   delivery SHA.
4. Current-HEAD Test evidence and Review approval are both valid under the
   existing close authorization policy.
5. Exactly one well-formed `aitm.delivered-close/v1` marker exists.
6. Its issue number matches the target, its accepted SHA differs from current
   HEAD, and its review authority is otherwise valid.
7. Its completed steps are a contiguous prefix drawn only from `timing`,
   `estimation`, and `lifecycle`.
8. Live state confirms that no terminal-boundary effect has occurred: the board
   is not Done, disposition is not Delivered, the issue is not closed, terminal
   labels have not been finalized, and the issue binding has not been released.

The command refuses before mutation if any read is unavailable or ambiguous, if
the body has duplicate or conflicting transaction markers, if the old SHA equals
current HEAD, if evidence names another SHA, or if either the durable prefix or
live state has reached `board`, `disposition`, `issue`, `labels`, or `binding`.
Recovery after that boundary is out of scope because replay could contradict a
durable external effect.

## Supersession evidence

Recovery uses an immutable GitHub issue comment as the audit record. The comment
contains a canonical machine-readable
`aitm.delivered-close-supersession/v1` marker with exact keys for:

- issue number;
- old and replacement transaction IDs;
- old accepted SHA;
- old completed-step prefix;
- new accepted SHA and new review authority;
- canonical recovery reason.

The parsed evidence projection also includes the comment's authenticated author
and provider-created timestamp. Those fields come from GitHub's immutable
comment envelope rather than caller-authored marker bytes.

The recovery intent identity is the tuple `(issue, old transaction ID, old SHA,
new SHA, completed prefix, reason)`. Before rewriting the body, the command lists
and parses existing supersession comments:

- no matching record: generate the replacement transaction ID, create the
  comment, then read it back and verify every field plus provider identity;
- one exact matching record: reuse its replacement transaction ID without
  another comment write;
- malformed, duplicate, or conflicting records for the same old transaction:
  refuse.

The provider timestamp is evidence returned by GitHub, not caller-supplied
authority. A lost create response is therefore recoverable by finding the exact
persisted intent on retry.

## Active transaction replacement

Only after the supersession comment is verified may the command replace the
active body marker through the protected internal body mutator. The mutation
must re-read the fresh base body and prove that the old transaction is still
byte-for-byte the transaction named by the audit record. It replaces that one
marker atomically with:

```text
schema:          aitm.delivered-close/v1
transactionId:   a fresh UUID
issueNumber:     the target issue
acceptedSha:     current verified HEAD
reviewAuthority: current verified Review authority
completedSteps:  []
```

Here "fresh" means the replacement UUID first persisted in the supersession
comment. A retry must reuse that UUID; it must not generate a second replacement
identity.

The returned authoritative body is parsed and compared field-for-field with the
new transaction. A stale base, missing marker, competing marker change, or
readback mismatch refuses. The generic issue-body verb remains unable to alter
either protected close authority or its audit records.

If the audit comment exists but body replacement failed, a retry reuses the
comment and retries the guarded replacement. If the body already contains the
fresh transaction and the matching audit record exists, recovery adopts that
state and does not rotate the transaction ID again. A fresh body transaction
without its matching verified supersession record is invalid and refuses.

## Close continuation

After successful replacement, control returns to the existing Delivered close
saga. The saga starts from an empty completed list and re-executes the established
idempotent order:

```text
timing -> estimation -> lifecycle -> board -> disposition -> issue -> labels -> binding
```

The earlier pre-terminal prefix is deliberately not copied to the new
transaction. Its writes are already designed to converge, and replay proves the
fresh transaction against current state rather than asserting that old-SHA
checkpoints authorize the new SHA. Each successful step is checkpointed through
the existing transaction writer. No new terminal operation is introduced.

## Implementation boundaries

Pure parsing, validation, intent matching, and body replacement transforms
belong in `scripts/task-tracker/lib/close-convergence.mjs` or a narrowly scoped
companion module. Production orchestration and dependency injection belong in
`scripts/task-tracker/verbs/close.mjs`. Help data must document the flag,
preconditions, refusal boundary, and recovery semantics.

The implementation must reuse existing delivery-gate, Review authorization,
dirty-worktree, binding, Project-state, disposition, issue-state, label, and
body-mutation authorities. It must not reproduce weaker parallel checks or use
raw `gh issue edit` to change protected body bytes.

## Failure and idempotence matrix

| Observed state                                         | Result                                                 |
| ------------------------------------------------------ | ------------------------------------------------------ |
| No transaction or same-SHA transaction                 | Refuse; recovery is unnecessary or malformed use       |
| Stale valid transaction, pre-terminal prefix, no audit | Write and verify audit, replace marker, continue close |
| Matching audit, old marker still active                | Reuse audit, replace marker, continue close            |
| Matching audit and matching fresh marker               | Adopt fresh marker, continue close                     |
| Conflicting audit or marker                            | Refuse before terminal mutation                        |
| Durable or live terminal boundary crossed              | Refuse; no automated restart                           |
| Audit write succeeds but response is lost              | Retry discovers and reuses exact intent                |
| Body write response is lost                            | Retry adopts only the exact audited fresh transaction  |
| Any authoritative read fails                           | Refuse closed                                          |

## Verification contract

Tests must first fail for the missing behavior, then prove:

- flag parsing and isolation from ordinary `close` and `--repair`;
- every authority precondition and every terminal-boundary refusal;
- strict old-transaction and supersession-record parsing;
- audit-before-body ordering and readback verification;
- exact fresh transaction shape and empty completed list;
- lost-response retries, matching-intent reuse, and conflict refusal;
- normal close replay from `timing` through `binding` without duplicate durable
  effects;
- generic issue-body protection and ordinary close behavior remain unchanged.

The issue verification commands are the two targeted close suites followed by
the fast, integration, and slow lanes, lint, and format checks. The live
acceptance trace is complete only when #1461 uses this path, obtains the fresh
transaction at its current accepted SHA, converges to Done, and leaves the
immutable supersession comment plus completed replacement transaction as audit
evidence.

## Out of scope

- Restart after any terminal-boundary step or contradictory live terminal state.
- Editing or deleting the historical transaction comment.
- Weakening exact-SHA Test, Review, delivery, or protected-marker authority.
- Manufacturing a pull request or delivery receipt for a shared governed branch.
- General transaction migration, arbitrary rollback, or free-form body repair.
