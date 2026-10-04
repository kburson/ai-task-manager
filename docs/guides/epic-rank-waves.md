# Authorized epic rank waves

Sequential child execution remains the default. The registered `epic-wave`
command can adopt rank-level execution for one epic and authorize concurrent
children at one exact rank. It does not start sessions or change lifecycle state.
Each child keeps its own implementation, PR, CI and review obligations.

After adoption, **every lower rank must actually be Done** before any target
enters Plan or Develop. This requires the configured board's Done column,
GitHub CLOSED with COMPLETED disposition, and no pending close recovery.
Review, a pending PR, Ready for Planning and Closed Not Planned cannot satisfy
this barrier. A rank without a concurrency grant retains a sequential budget
under the same strict lower-rank barrier. A present invalid grant refuses;
revocation or expiry never resurrects an older authorization.

## Prepare and record

Bind a genuine parent session through the normal task workflow. All members
need genuine native child bindings in distinct physical worktrees and branches
of the same Git common directory. Their sessions must differ from the parent
and peers. Location markers establish physical lineage; current occupancy and
native session evidence establish session and generation identity.

Create a project-local selector containing these exact keys:

```json
{
  "schema": "aitm.epic-wave-selector/v1",
  "rank": 2,
  "expiresAt": null
}
```

Run `npx aitm epic-wave prepare 107 --input-file .scratch/gh/wave-selector.json --json`.
The result supplies a closed proposal and its digest. Preserve that proposal
exactly, including its generated operation ID, full graph, complete same-rank
membership, parent and child bindings. `expiresAt: null` means non-expiring;
a finite expiry must be a valid UTC timestamp after record creation.

The write request has exactly `schema`, `proposal`, `expectedProposalDigest`,
`source` and `previousDigest`. Its schema is `aitm.epic-wave-request/v1`.
Use the prepared proposal and digest. For initial authorization,
`previousDigest` is null; later revisions name the exact prior digest.

`source` is a closed `aitm.rank-wave-source/v1` object with `sessionId` and
`messages`. Each message has exactly `messageId` and `statementHash`.
References identify one to eight chronological native Codex messages, with
exact `sha256:` hashes of their statements. The host verifies native identity,
repository linkage, role, exact text and ordering. Request flags, agent relays,
quoted instructions and invented references cannot supply authority.

Human scope must uniquely identify the epic, rank and complete membership.
Earlier authentic scope plus later enablement can establish permission.
A displayed exact proposal or labeled alternatives can also be accepted by
an authentic human reply; an ambiguous unlabeled choice refuses. Revocation
requires human revocation intent, rather than reusing enablement permission.

Run `npx aitm epic-wave record 107 --input-file .scratch/gh/wave-request.json --json`.
The command rechecks the graph, source and bindings under the shared parent
lock, writes one immutable GitHub record, reconciles the governed orchestration
pointer, then verifies read-back. Both the comment and matching body pointer
are required for admission. Editing a marker alone cannot authorize a wave.

## Inspect, revoke and recover

`show` takes a selector with exactly `schema` and `rank`:

```json
{
  "schema": "aitm.epic-wave-selector/v1",
  "rank": 2
}
```

Run `npx aitm epic-wave show 107 --input-file .scratch/gh/wave-show.json --json`.
Show and Explain are read-only. Their observations grant no execution authority.
Plan, Promote and pull-next collect fresh observations before effects.

`revoke` takes a prepared write request with a new operation ID, authentic
revocation source, and the prior record's exact digest. It appends a revision;
it does not delete prior records or silently finish active implementations.
Revoked authority blocks later admissions, including Plan-to-Develop.

If comment publication succeeds but the body write or read-back fails, use
`resume` with exactly these keys:

```json
{
  "schema": "aitm.epic-wave-resume/v1",
  "operationId": "the-original-operation-id",
  "digest": "the-original-record-digest",
  "commentNodeId": "the-original-comment-node-id"
}
```

Run `npx aitm epic-wave resume 107 --input-file .scratch/gh/wave-resume.json --json`.
Resume repairs only the same observed current record and pointer. Repeated
resume is idempotent and posts no second comment. Graph drift, tampering,
expiry or a newer revision refuses repair of an older authorization.
An unknown comment-write outcome remains indeterminate under its original
operation ID. Inspect current history; do not invent a receipt, change IDs or
blindly post again. The durable operation journal prevents a second write.

A scoped `revoke` names the exact prior digest and preserves its graph, members
and implementation bindings. It can withdraw that scope after graph or worker
drift; it grants no admission. Use the retained proposal with a new operation
ID and current parent identity. For an expired grant, set the revocation
proposal expiry to `null`. If revocation publication is interrupted, resume
its exact current revocation record. An older authorization cannot be resumed.

## Completion, handoff and refresh

The frozen graph includes child IDs, ranks, dependencies and refinement
identity. Ordinary state progress, AC ticks and verification runs preserve
that identity. Changes to semantic scope, AC declarations, refinement identity,
membership, ranks or dependencies require a new proposal and authentic human
authorization later than the prior revision. The registered transaction adopts
the fresh full graph; grants tied to the old graph remain unusable. Re-enabling
a revoked or expired grant likewise requires a later human instruction.

Plan and Develop require the exact worker occupancy generation. During Test
or Review, an actual parent replacement claim can supervise a peer after the
old worker has discharged its claim. Parent identity and child physical lineage
must be verified. A completed peer retains authenticated lineage without a
live worker lease. Retain its physical worktree and branch until the wave ends;
a missing checkout or detached branch refuses lineage verification.

To replace one implementation session, prepare the current proposal and use
`refresh`. Preserve graph, membership, parent, expiry and original source.
Only one child session/generation may change; physical worktree, branch,
provider and common directory remain fixed. The runtime must positively
observe the replacement claim and prove the old worker is no longer active
on that generation. An input assertion of discharge is insufficient.

## Locking and refusals

All wave writes and execution admissions use a lock beneath the physical Git
common directory. It is acquired before any child issue lock and held through
fresh observation, the one-edge effect and read-back. Linked worktrees contend
on the same lock; nested calls carry an ephemeral verified context. A live,
unknown or abandoned holder is never automatically evicted. Repair ownership
through the governing runtime workflow before retrying.

The CLI returns structured statuses and `rank-wave-*` refusal codes for stale
or unreadable graphs, incomplete publication, source mismatch, revoked or
expired authority, lower ranks not Done, dependencies, identity collisions and
unverified generations. A refused write exits 4; an indeterminate write exits 6.
Explain preserves the `rank-wave-admission-refused` blocker and its exact
reason. Repair the named obligation through its registered action, then retry.

### Recovering a crashed admission holder

The parent lock covers wave writes and the R4P-to-Plan and Plan-to-Develop
admission edges. A child's long Test or Close delegate holds only its child
issue lock, so peers can continue admission. Detached lifecycle checkouts can
resolve the common lock, but detached branches remain invalid wave bindings.

Use `npx aitm epic-wave lock-show 107 --json` to inspect the physical common-dir
lock. This operation is read-only and takes no input file. To release a crashed
holder, bind the genuine parent through the task workflow and save the exact
returned observation in a request with schema
`aitm.epic-admission-lock-release/v1` and an `observation` property. Then run
`npx aitm epic-wave lock-release 107 --input-file .scratch/gh/dead-lock.json --json`.
Release rechecks the same host, a provably dead PID, exact holder bytes, and the
observed directory and file identities. It retains a read-only holder descriptor
through the effect. Live, foreign-host, unknown or physically replaced evidence
refuses; automatic admission never evicts a holder. Unknown ownership needs
investigation, not deletion or a manufactured observation.

### Source retention and replacement authority

Retain native transcripts for current authority on the admission host. Missing
current native source still refuses: a GitHub comment or its digest alone
cannot replace authentic human authority. Historical revision structure,
digests and immutable comment provenance remain verified in full. Refresh
inherits its latest authorization source and cannot become a new permission.

If a superseded transcript is unavailable, prepare and record a new proposal
with a fresh authentic human instruction later than the previous revision and
its exact `previousDigest`. The new authorization supersedes the old human
scope; readers verify the new source and retain all historical records. This
registered path also allows a new genuine parent session to adopt the exact
proposal with fresh human authority. Refresh cannot replace the parent. Edited,
missing or conflicting comment history remains a refusal.

Authorization references cannot omit a later human reversal. The host examines
all later unreferenced human statements for wave-specific reversals, retaining at
most one relevant refusal. Unrelated CI/push requests, another rank's permission,
and conversation length do not invalidate the grant. Explicit epic/rank/member
reversals and immediate terse replies withdrawing permission still refuse.
Historical verification uses the record creation cutoff; current admission also
checks later wave-specific instructions. Quoted and
injected material remains untrusted. A labeled selection must be the entire
reply or a label with a simple affirmative response, never a single-letter word
at the beginning of ordinary prose.

Priority and issue-label changes are refinement changes, including adding a
CI label. They require a fresh proposal and authorization; BLOCKED is excluded
because it is handled by separate governed dependency evidence. Legacy epics
retain strict refinement checks. Plan size/estimate projection applies only to
the rank-wave adapter's Plan-or-later observations.

`show` prints valid revoked, expired and incomplete states with exit 4 because
none supplies ready admission authority. This is a read-only result, not a
mutation failure. `lock-show` reports ownership without asserting admission
readiness. All comment transport errors currently lack definitive no-write
proof and remain indeterminate: inspect the original operation and reconcile
an actual matching comment with `resume`; do not retry by changing IDs.

A direct permission must be an unqualified instruction or explicit approval;
questions, negation and deferred/conditional requests cannot grant admission.
A displayed proposal must have positive permission intent. Whole replies such
as `Yes.` or an exact choice must correlate with the actual preceding assistant
message in the native transcript. Omitting an intervening question cannot attach
its answer to an older proposal. A terse unscoped reversal applies only when it
immediately follows the last referenced message without another assistant turn;
sequential test-run instructions and neutral scoped status messages do not
withdraw parallel-story permission. Positive permission must describe story
admission, not parallel tests, and comparative or either-or proposals refuse.
