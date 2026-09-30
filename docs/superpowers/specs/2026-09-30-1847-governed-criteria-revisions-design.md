# Governed acceptance-criteria revisions

Issue: [#1847](https://github.com/kburson/ai-task-manager/issues/1847).
Date: 2026-09-30.
Status: **revised Backlog draft; pending Refine acceptance**.
Source baseline: `4187a64fae6319808ec350f3beb0f126fc36769b`.
Revision: SAR round 2 revision by the same reviewing agent.

This is a Backlog design input. Drafting, committing, attaching, reviewing, or
revising it confers no Refine acceptance, Plan approval, implementation authority,
estimate, size, priority, or label decision. At Refine, accept or revise the
bounded design and derive those fields through normal workflow commands.

## Problem and outcome

An approved requirement correction can contradict existing acceptance criteria.
Ordinary issue-body editing correctly refuses protected-marker removal, but
does not supply a supported operation for retiring obsolete verifier declarations
and affected proof. In ai-peer-review #124, session startup/resume handshakes
replaced per-command hooks. Its old unchecked criteria still declare the old
verifiers. Copying those declarations to new text or checking the obsolete
criteria would misrepresent what was verified.

Provide a human-authorized transaction that archives the previous contract,
replaces selected criteria with unchecked declarations, retires invalid current
proof and approvals, and requires normal verification of the corrected contract.
Keep ordinary marker, checkbox, and proof-introduction protections intact.

The operation must remain recoverable after interruption without restoring
retired proof or silently transferring the original human authorization to a
different proposal.

## Inspected baseline and required extensions

The following are integration surfaces, not claims that the proposed operation
already exists:

- `scripts/task-tracker/verbs/issue-body.mjs` exposes ordinary replacement
  operations. `issue-body-mutate.mjs` independently enforces marker loss,
  checkbox proof, proof introduction, section loss, and marker advances.
- `versioned-issue-write.mjs` supplies fresh reads, versioning, bounded retry,
  conflict checks, and read-back. It is not GitHub server-side compare-and-swap.
- `ac-evidence.mjs` distinguishes verifier declarations from execution evidence.
  A short label-derived key cannot identify a revised criterion.
- `verification-receipt-retirement.mjs` demonstrates exact receipt retirement.
  Its internal allowance is not a public invariant bypass.
- `workflow-policy/authority-resolver.mjs` supplies an existing authorization
  pattern: `aitm.authorization-source/v1`, a `codex-session/v1` source,
  an exact user-message reference and statement hash, injection filtering, and
  `host-verified-user-message` provenance.
- `issue-mutator-lock.mjs` supplies an advisory issue lock and reentrancy
  conventions. Existing lock placement, age-based reclamation, and inherited
  environment flags are not sufficient proof of the stronger revision lock
  contract specified below.
- `github-records/contract-source.mjs` distinguishes legacy body authority from
  directory-backed contracts. Legacy resolution does not supply a canonical
  coordinator grant.
- `github-records/capsule-chain.mjs` detects conflicting appends. It does not
  atomically reserve a GitHub chain head.
- `github-records/delivery-contract.mjs` supplies semantic amendment and complete
  canonical proof invalidation. `amendContract` resets lifecycle projections and
  accepted record IDs.
- `github-records/contract-write.mjs` persists selected contract operations but
  does not yet expose semantic amendment as an operation.
- At this baseline, `verbs/plan-approve.mjs` refuses directory authority in Plan.
  Canonical revision support therefore includes a bounded canonical Plan-approval
  adapter in this issue; it cannot rely on the baseline refusal path.

All required extensions below belong to #1847's proposed scope. This draft does
not create a prerequisite issue chain or authorize implementation.

## Alternatives and selected scope

**A — dedicated revision transaction, selected.** Exact proposals, attributable
human authorization, archived history, explicit invalidation, and recovery.

**B — override ordinary replacement, rejected.** An unrestricted marker-loss or
proof-reset flag would let routine edits erase authority.

**C — manual rewrite and rerun tests, rejected.** It does not bind authorization
to the revised contract or prevent old approvals from qualifying.

Version one supports legacy-body and canonical-contract authority within one
cooperative local writer domain: one registered Git common directory and its
linked worktrees on one host. It does not provide distributed locking across
hosts or independent clones.

Canonical amendments use complete current-proof invalidation. Legacy revisions
may preserve an unaffected individual proof only under the exact dependency
conditions below. Both formats preserve historical execution facts.

## Interface

Register `criteria-revise` actions:

- `prepare`: read-only proposal, archive-size assessment, impact report, and exact
  human approval statement.
- `apply`: apply one sealed proposal with verified human authorization.
- `status`: read-only authoritative transaction classification.
- `recover`: continue an exact interrupted transaction, abort an untouched one,
  or apply an explicitly authorized forward-repair proposal.

`prepare` and `status` must not acquire mutation locks, publish comments, execute
verifiers, or modify task binding.

Preparation takes an explicit issue, a reason, exact AC occurrence replacements,
and the root VC changes needed by those replacements. AC selection includes its
current occurrence and exact old bytes/digest; the occurrence is a match
precondition, not a durable identity. VC selection uses unambiguous root IDs.
Duplicate headings, duplicate logical identities, ambiguous occurrences, missing
referenced VC IDs, unsupported authority, and unresolved declarations refuse.

The parser accepts a closed request shape. It does not accept a complete
replacement issue body, arbitrary marker or section selectors, execution proof,
invariant-disable flags, or executable callbacks. Replacement VC command strings
are inert declaration data. Neither preparation nor application executes them.

The mutation request has exactly these top-level fields:

- `schema`: `aitm.criteria-revision/v1`.
- `action`: `apply` or one supported `recover` mode.
- `proposal`: the sealed proposal object.
- `authorizationSource`: an `aitm.authorization-source/v1` reference.

A proposal contains exactly the following named domains:

- `schema`, `repository`, `issue`, `transactionId`, `operationId`, and `reason`.
- `mode`: `revision`, `resume`, `abort`, or `forward-repair`.
- `priorTransaction`: null for a new revision; otherwise an exact transaction and
  event reference.
- `executor`: host session and worktree identity.
- `writerDomain`: registered host/common-directory identity.
- `authority`: source kind, authority locator, current coordinator identity and
  epoch when canonical, and exact current authority hashes.
- `before`: stage, issue state, body version/hash, contract epoch/hash,
  capsule head where present, and protected source bindings.
- `edits`: typed AC replacements and root VC changes.
- `identityMap`: exact old-to-new criterion identity mapping.
- `invalidation`: typed proof and approval identities with dispositions.
- `archive`: complete required original bytes and parsed identities.
- `writeSet`: ordered, deterministic resource before/after hashes and planned
  record identities.
- `after`: expected semantic contract digest and revision identity.
- `proposalDigest`: SHA-256 of canonical serialization of the preceding fields.

Nested shapes are closed and versioned with the proposal schema. Unknown fields
or unsupported nested variants refuse. Request validators, record validators,
and renderers share the same field definitions.

The tool derives archives, identities, invalidation, and the write set from
fresh authority; supplied values must reproduce those derivations exactly.
The operation does not trust caller-asserted invalidation or caller-supplied
proof. A transaction ID names one original revision and its recovery lineage.
Its original prepared proposal is immutable. Each initial or recovery operation
has its own operation ID; reusing an operation ID with different proposal bytes
is a conflict. A second original preparation under the same transaction ID also
conflicts. Authorized recovery may introduce a new operation/proposal digest
under that transaction only through the state transitions specified below.

## Exact human authorization and trust boundary

Version one uses the existing trusted Codex user-message source pattern.
It does not introduce user signing keys, a new identity service, or a GitHub
comment-as-human-approval shortcut.

Prepare renders this exact statement, with concrete values:

`Approve criteria-revise <mode> for <repository>#<issue>, transaction
<transactionId>, proposal <proposalDigest>, executor <sessionId>.`

The runtime resolves the source through its host-selected session/transcript
loader. The mutation request cannot select a transcript path, inject a loader,
or supply the observed message contents. Require one matching human user
message, the exact statement hash, and the exact rendered approval statement.
Assistant messages, injected tool text, booleans, model assertions, Full-Auto,
and unrelated earlier approvals do not qualify.

Record the source session/message reference and verified statement separately
from the executing session. Preserve a host-provided principal when available;
when the adapter supplies no named principal, record that absence and use the
verified user-message reference as attribution. Do not invent a human identity.

The adapter trusts the host's ownership and integrity of its user-message
history. It does not claim protection against a compromised host or an actor
who can rewrite that trusted history. If the runtime cannot establish this
boundary, the source is unavailable or ambiguous, or the adapter is unsupported,
refuse before preparing a durable transaction.

Revalidate authorization immediately before durable preparation and before the
first authority-changing write. A proposal prepared in a different session
needs authorization naming the actual executor.

Read-only status and historical audit do not require access to an old transcript.
A new executor, unavailable original authorization source, changed authority
epoch, or changed proposal requires a new exact human approval through the
recovering session. The old approval remains history and is never relabeled.

## Stage and editing boundaries

| Current state               | Prepare               | Apply                                          |
| --------------------------- | --------------------- | ---------------------------------------------- |
| Backlog                     | Yes                   | No; draft-only                                 |
| Refine                      | Yes                   | Yes                                            |
| Ready for Planning          | Yes                   | Yes                                            |
| Plan                        | Yes                   | Yes                                            |
| Develop                     | Yes                   | Yes                                            |
| Test or Review              | Yes                   | No; normal one-step demotions to Develop first |
| Done, closed, or delivered  | Read-only explanation | No                                             |
| Active lifecycle transition | Read-only explanation | No                                             |

Revision does not move stages. A prepared proposal becomes stale after a stage
change and must be regenerated.

Version one changes Acceptance Criteria and only the root Verification Commands
entries needed by the correction. AC deletion, splitting, or replacement must
be explicit in the proposal. A VC deletion is permitted only when the resulting
contract has no remaining reference to it. Changed or replacement criteria
require valid declaration-only citations. Unchanged legacy criteria may retain
validated execution properties under the preservation rule below; the command
does not strip those properties merely to make every citation declaration-only.

Scope, User Story, Story Intent, and linked plan content remain separately
governed inputs. Seal their current source bindings; refuse application if they
change after preparation. If the correction requires their amendment, perform
those edits separately and prepare against the resulting authority.

Every semantic revision invalidates existing Plan approval, whether or not
those other inputs change. In Refine or Ready for Planning, obtain approval at
the normal later Plan stage. In Plan, obtain fresh approval there. From Develop,
demote normally to Plan and obtain fresh approval before returning to Develop.
Develop exit and downstream authority cannot qualify without that approval.

An issue whose canonical contract is still draft remains draft after revision;
the operation cannot seal it or create execution proof. Its revision and
contract epoch advance, definitions change through a validated draft amendment,
and its current proof projections remain empty. Sealed canonical contracts use
the amended sealed-contract path. Both paths are in scope.

## Semantic identity and digest

Use SHA-256 over canonical JSON for the semantic contract. The digest domain is
an ordered list of AC, root VC, and DoD definitions, containing:

- Durable criterion identity.
- Exact visible requirement text with execution properties and checkbox state
  excluded.
- Parsed declaration form and referenced VC identities.
- Exact resolved verifier command bytes.
- Explicit source bindings used to determine evidence validity.

Preserve meaningful whitespace and command bytes; do not infer semantic
equivalence from label normalization. Checkbox state, execution timestamps,
receipt IDs, current-proof properties, and body-version counters are outside
this digest and remain separately checked authority.

At the first revision, legacy preparation derives occurrence identities for all
existing AC/VC/DoD items from the exact before-body digest, section, occurrence,
and original bytes. Freeze and archive this complete identity map. Replacement
identities derive from the transaction and replacement ordinal. Later reads and
revisions resolve surviving identities from that map and its explicit successor
mappings; they do not recompute IDs from a body changed by proof stamping,
checkbox updates, timing, or version increments. An unmappable or ambiguous
survivor refuses revision until explicitly resolved in the proposal. Do not reuse
short label hashes or shifting list positions as durable revision identity.

Canonical criteria retain existing logical IDs only for unchanged definitions.
Changed or replaced criteria receive new logical IDs. A VC may retain its ID
with changed command bytes, but every dependent proof is then invalid.
Canonical retired-ID protections remain active.

Store a monotonic revision identity in addition to the semantic digest.
Returning to identical text in a later revision never makes an old aggregate
receipt or approval current again.

## Current-proof invalidation and historical preservation

Archive required original body, contract, declarations, proof, approval, and
authority bytes before any current-authority change. Classify declarations,
execution properties, individual proof, aggregate proof, approval, timing,
lifecycle entry, and coordination separately.

Split consolidated declaration/execution markers without copying execution
properties into replacement declarations. Replacement ACs are unchecked.

| Authority or evidence                               | Legacy-body revision                                                                     | Canonical-contract revision                         |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Changed AC proof                                    | Retire and uncheck                                                                       | Complete current-proof reset                        |
| Proof dependent on changed VC or source binding     | Retire and uncheck, including unchanged AC/DoD text                                      | Complete current-proof reset                        |
| Unaffected individual AC/VC/DoD proof               | Preserve only after exact identity, text, declaration, command, and source-binding match | Preserve historically; require new current evidence |
| Aggregate AC/checkbox assertions                    | Invalidate                                                                               | Invalidate                                          |
| Plan approval                                       | Invalidate                                                                               | Invalidate                                          |
| Test, Agent Review, Final Review approval           | Invalidate regardless of HEAD equality                                                   | Invalidate regardless of HEAD equality              |
| Historical execution, timing, lifecycle-entry facts | Preserve as history                                                                      | Preserve as history                                 |
| Delivery records                                    | Never remove to enable editing                                                           | Never remove to enable editing                      |

Uncertain legacy dependencies are retired. No proof is preserved solely because
labels, VC IDs, or HEAD are equal.

For each preserved legacy individual proof, the derived invalidation manifest
records a `preserved-individual` disposition with its archived proof identity
and bytes hash, surviving criterion identity, declaration/command/source hashes,
and destination revision. Consumers accept that exact existing proof in the
new revision only when this verified disposition and every current dependency
still match. This is an eligibility decision about the original execution, not
a new execution receipt or a claim that the proof was originally revision-bound.
A caller cannot add a proof or choose its disposition. An unclassified old proof
refuses qualification. Aggregate evidence is never eligible through this rule.

Canonical amendment increments the contract epoch, resets all lifecycle
projections, and clears accepted record IDs, following existing amendment
semantics. Do not carry old accepted record IDs into the new epoch. Add the
missing semantic-amendment persistence operation, using the existing pure
amendment validation and canonical record/projection ordering.

Plan, Test, Review, and completion consumers must check current revision identity
and semantic digest. Canonical consumers also check contract and authority
epochs. For an issue with revision history, unbound old aggregate evidence cannot
qualify. The sole legacy individual-proof exception is the exact preservation
disposition above. Canonical individual evidence has no carry-forward exception.
For never-revised issues, existing compatibility behavior remains governed by
their existing contracts.

## Canonical Plan approval

Canonical support includes resolving the baseline `plan-approve` incompatibility
within #1847.

Refactor Plan approval's evaluation into shared source-binding checks plus
authority-specific persistence. Keep normal stage, linked-plan, story/intent,
planning-evidence, provenance, and forecast requirements. Load canonical AC/VC
definitions through the contract-source resolver rather than body projections.

Persist canonical Plan approval as a registered `plan-approval` capsule with
a closed `aitm.plan-approval-binding/v1` payload:

- Current revision identity and semantic contract digest.
- Current contract epoch.
- User Story, Story Intent, and linked-plan source bindings required by the
  shared Plan policy.
- Approval provenance and its existing supporting authority/audit references.

Repository, issue, actor, grant, authority epoch, predecessor, and creation time
come from the validated record envelope. The canonical accepted-record
projection may reference the newly created approval record only after all
checks and read-back succeed.

The Plan exit guard and downstream revision guard consume that canonical
approval. A body marker is a projection, not substitute authority. Legacy Plan
approval receives the same revision/digest binding in its supported marker or
record representation.

This operation does not approve a revision proposal. Revision authorization and
Plan approval are distinct acts with distinct evidence.

## Writer ownership and serialization

Coordinator authorization answers who may act. A mutation lock answers which
admitted operation may act now. Neither a grant nor a prepared GitHub comment
alone is a distributed mutex.

Version one's supported mutation topology is one registered local Git common
directory and its linked worktrees on one host. The runtime derives the
common-directory identity; requests cannot choose arbitrary lock roots.
Independent clones, foreign hosts, unregistered domains, and unknown topology
may inspect status but refuse revision mutation.

Establish this writer-domain registration through the existing trusted host
configuration boundary, outside the mutation request. The registration states
the repository and the one admitted local domain. A legacy issue uses this
domain and its active task/session ownership; it does not acquire a fictitious
canonical coordinator grant. Canonical issues additionally require current
coordinator authorization for the exact issue and operation.

Add a strict repository/issue mutation interlock shared by every relevant writer
in that domain. Place its lock under the common Git directory, so linked
worktrees cannot create independent same-issue locks. Use atomic local lock
acquisition. Lock order is: all required strict interlocks sorted by normalized
repository then numeric issue, then existing issue locks in the same order, then
resource-local locks. Release in reverse order. A public mutating entry point
acquires the strict interlock before entering an existing issue-locked delegate;
a lower-level writer must not acquire it for the first time while an existing
issue/resource lock is held. Nested calls reuse the runtime capability. An
operation needing additional issues determines that set before locking, or
releases its locks and restarts authoritative reads with the expanded set; it
never extends a held set out of order.

For this interlock:

- Age alone never authorizes stealing a live or uncertain lock.
- An orphan can be reclaimed only after proving the local holder has exited and
  rechecking that the holder identity has not changed.
- Unknown liveness refuses; a human must stop the holder before retrying.
- Reentrancy requires the exact held lock capability for the repository, issue,
  and invocation. A bare inherited environment string is insufficient.
- Nested operations receive the capability from the owning runtime; the public
  request cannot mint it.

Acquire the interlock before authoritative reads that justify a mutation and
hold it through final verification. Existing in-flight writers finish first.
Later writers acquire the lock, observe a pending revision, and refuse before
their effects. Every covered writer must join this admission path; deployment
with mixed writer versions is unsupported.

Before first use, the operator must quiesce older cooperative clients and route
all governed writers through the registered domain. This is a documented
deployment boundary, not a claim that GitHub can discover every external writer.

Do not transfer the registered domain to another host or independent clone while
a revision is pending. Recovery from another linked checkout on the registered
host is supported. Cross-host pending-transaction recovery is outside version
one; read-only diagnosis remains available.

Direct GitHub edits and writers ignoring the protocol are outside this
cooperative guarantee. Detect their drift at each read/write boundary and retain
the fence. Do not claim server-side atomicity or prevention of ungoverned edits.

## Durable revision log and fence

Use an append-only revision event log in GitHub issue comments for both authority
formats. This log accompanies the resolved contract; it does not convert legacy
issues into directory-backed contracts.

Register a closed `aitm.criteria-revision-event/v1` envelope containing:

- Repository, issue, transaction ID, operation ID, event ID, and predecessor
  event ID.
- Event kind: `prepared`, `recovery-authorized`, `applied`, or `aborted`.
- Proposal digest and exact proposal/archive payload or its verified predecessor
  reference.
- Human authorization provenance, executing session, writer domain, and observed
  authority.
- Exact resource observations and terminal outcome where applicable.

Preparation publishes the complete sealed proposal and archive. A
`recovery-authorized` event publishes its complete recovery proposal, current
observation, and any additional archive; referring only to a local recovery file
is insufficient. Terminal events reference the original preparation and the
currently effective operation. No event overwrites an earlier one.

The issue has one ordered revision-event chain. An original `prepared` follows
the preceding terminal event, or null for the first transaction. It makes that
transaction pending and its initial operation effective. While pending,
`recovery-authorized` may advance the same transaction to a new operation ID;
it names the exact preceding event, original proposal digest, observed
resource-vector digest, new sealed recovery proposal, and new approval source.
It replaces the effective operation, not the original archive. A further recovery
can replace it under the same rule. No new original transaction may start while
one is pending.

`applied` or `aborted` terminates the root transaction once, referencing its
original preparation and latest effective operation. An applied repair records
both the originally intended result and the explicitly approved repaired result;
only the latter is current. It closes the original pending fence rather than
leaving an unterminated parent transaction. Abort remains limited to the exact
untouched original authority. Later distinct revisions begin new transactions.

Same ID/different bytes, duplicate event identity, ambiguous heads, missing
referenced events, illegal transitions, or conflicting terminal outcomes block
mutation and downstream authority. Event IDs and event bytes are fixed before
each publication attempt; transport retry reconciles that identity before any
repeat write.

The log loader enumerates all relevant comments with complete pagination and
validates the full referenced chain. Incomplete or unavailable reads are
indeterminate, not absence. A protected body pointer to the applied revision
accelerates lookup but cannot replace chain validation.

A verified `prepared` event without a verified terminal event is a pending fence.
Only the transaction owner or a verified recovery operation may perform the
enumerated writes while pending. All other covered mutations refuse.

The event log is append-only by protocol. GitHub comment storage is not
physically immutable; the cooperative trust boundary applies to historical
records as well.

## Application transaction

1. Acquire the strict mutation interlock. Resolve the live contract authority,
   task/session ownership, stage, delivery status, authorization, and revision log.
   Refuse an active lifecycle transition, conflicting transaction, or mismatched
   domain. Recompute every sealed precondition for a new revision. Recovery
   instead validates its sealed observed resource vector and the recognized
   effective write-set prefix; it does not require already-completed resources
   to equal the original before-state.
2. Verify the complete archive and all rendered record/body size and secret
   policies. Unknown formats or incomplete archives refuse before any durable
   preparation. Never truncate or silently redact required evidence.
3. Append and read back the `prepared` event. Re-list the log and verify its
   unique current head before changing contract authority.
4. Apply only the sealed write set. Canonical order is amendment capsule,
   canonical contract projection, affected remaining authority projections, then
   issue-body projection. Legacy order is the one versioned body transformation
   plus any explicitly enumerated authority records. Preserve planned record IDs.
5. Read back every affected resource and validate the entire expected after-state,
   not merely replacement text. Recheck stage, delivery status, grant when
   present, revision head, and executing authority.
6. Append and read back `applied`, referencing the prepared event and verified
   resource hashes. Only this verified terminal state releases the fence.

The body transformation receives an internal, transaction-derived capability for
the exact enumerated retirements and checkbox resets. Ordinary mutation callers
cannot request that capability. All unrelated invariants remain active.

Versioned writes do not rebase the revision onto a changed body. A conflicting
fresh read stops the operation and leaves the fence. Body-version normalization
must be deterministic and included in the planned after-state.

No verifier runs during this transaction. Successful application establishes
corrected declarations and retired authority, not passing tests.

## Recovery, abort, and forward repair

Status classifies the resource vector: revision-log head, canonical capsule head,
canonical contract projection, other affected authority, issue body, and terminal
event. A body-only comparison cannot authorize recovery.

| Observed state                                                                  | Permitted operation                                                                                                              |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| No prepared event and exact before-state                                        | Apply normally; no transaction exists yet                                                                                        |
| Prepared; all authoritative resources exactly before                            | Resume sealed writes, or explicitly authorized abort                                                                             |
| Planned amendment capsule exists; contract projection is before                 | Verify capsule identity and resume the next planned write                                                                        |
| Canonical contract is after; body or other planned projections are before       | Resume only the remaining recognized write-set prefix                                                                            |
| All affected resources exactly after; terminal absent                           | Verify all authority and append the same transaction's applied event                                                             |
| Terminal publication uncertain                                                  | Reconcile by exact event ID and bytes; never blindly append another terminal event                                               |
| Verified applied or aborted                                                     | Return that terminal outcome without repeating effects                                                                           |
| Any resource outside the planned prefix, duplicate identity, or authority drift | Retain fence; prepare explicit forward repair                                                                                    |
| Original executor or authorization unavailable                                  | Require exact recovery authorization for the new executor                                                                        |
| Required canonical grant expired, revoked, or replaced                          | No resume under old grant; establish valid current authority through its governed path, then authorize forward repair against it |

A resume preserves the effective operation's approved target bytes, criterion
identity map, and planned resource identities; it cannot regenerate them from
the partially changed body. A forward repair carries a newly derived write set
for its exact observed state. Replay the validated event chain to select the
currently effective plan, and compare progress against that plan's prefix.
After an authorized repair, a later resume uses the repair plan rather than
reverting to the original target. The original proposal remains the historical
root, not an alternative executable plan. Both retain the original transaction ID and use a new operation
ID when publishing a recovery proposal. Expected event-head changes caused by
that operation's own authorization/terminal events are verified as transitions,
not misclassified as third-party resource drift.

A recovery in the original session may reuse the original approval only while
the original executor, source, proposal, and authority remain valid. Another
session obtains a new host-verified user approval naming the original transaction,
the observed resource-vector digest, the exact recovery proposal, and the new
executor. Append `recovery-authorized` before resumed effects. Preserve the
original authorizer and executor separately.

A recovery authorization changes who may complete the enumerated transaction;
it does not grant unrestricted coordinator power. Canonical operations still
require a valid current coordinator grant. Normal authority restoration or
replacement, when required, remains governed by its existing policy and cannot
be synthesized by the revision command.

Permit only these narrow operations through a pending fence:

- Read-only status and proposal generation.
- Transaction-bound resume or abort.
- Transaction-bound forward repair with new human authorization.
- Necessary governed coordinator restoration/replacement, explicitly linked to
  the pending transaction; this does not itself release the fence.

Forward repair is a new sealed proposal linked to the pending transaction and
exact observed authority. It cannot silently accept unrelated text as the
approved correction. Its authorized after-state must preserve archived history,
retain or increase required invalidation, and perform only AC/VC correction and
the associated authority/projection repairs allowed by this specification.
Ordinary unrelated edits remain blocked.

A repair involving a replaced canonical grant uses the supported current
authority and records the predecessor grant/epoch. If the canonical projection
has not been brought into valid current authority by the governed authority
path, repair refuses rather than rewriting coordinator metadata itself. Status
reports `revision-authority-unavailable` with the pending transaction preserved
when that governed path is unavailable. Recovery is conditional on valid current
authority; it does not promise to bootstrap a revoked or nonexistent coordinator.

Abort is permitted only when no contract, proof, approval, or projection change
has occurred and the exact original authority is still present. The prepared
archive remains history. Partial application requires forward completion or
forward repair. Never roll back retired proof into current authority.

Interrupted clients may resume only after reacquiring the interlock and resolving
the current event head. A prior executor loses permission to write once a
successor recovery event is accepted.

## Consumer integration and compatibility

The implementation must maintain an explicit producer/consumer inventory.
At minimum, integrate the revision log, pending fence, lock admission, and current
revision binding at these boundaries:

| Boundary                                                      | Required behavior                                                                |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Ordinary issue-body edits and low-level governed body writers | Join interlock; refuse pending revision; retain ordinary invariants              |
| AC, VC, and DoD execution/stamping                            | Refuse pending; bind generated proof to current definitions and revision         |
| Plan approval and Plan exit                                   | Require current revision/digest and normal planning/source checks                |
| Test and Agent Review                                         | Refuse pending; reject pre-revision aggregate evidence                           |
| Final Review approval                                         | Bind to current revision as well as existing commit/review requirements          |
| Promote, demote, and lifecycle transition effects             | Refuse pending except the specified recovery-authority path                      |
| Delivery and close                                            | Refuse pending, stale Plan approval, or unbound pre-revision aggregate authority |
| Canonical contract writes and record dispositions             | Join interlock; enforce canonical epoch and revision                             |
| Projection repair and reconciliation                          | Cannot clear the fence or resurrect retired claims                               |
| Read-only status/explain                                      | Report pending, stale, unsupported, or indeterminate truthfully                  |

The inventory includes internal helpers, delegated subprocesses, and repair
entry points; command-name checks alone are insufficient. The runtime publishes
one shared revision observation to policy consumers rather than independent
optimistic interpretations.

For canonical Plan approval and revised lifecycle evidence, register the new
schemas and readers together. Old readers are not admitted writers for
revision-enabled operation. Unknown revision schemas or unsupported bindings
fail closed; no legacy fallback may bypass a recognized revision fence.

## Explain and audit behavior

Expose typed `criteria-revision-required`, `revision-pending`,
`revision-conflict`, `revision-authorization-required`,
`revision-approval-stale`, and `revision-topology-unsupported` outcomes with
registered next actions.

Pending status reports the last verified event, observed resource state, current
owner, and permitted recovery action. Unavailable authority is indeterminate.
It must not advise a generic marker-loss bypass, direct stage jump, or approval
reconstruction from old receipts.

Audit records contain repository/issue, transaction, original and recovering
executors, authorization references, reason, time, exact proposal digests,
predecessors, original bytes, proof/approval identities, and terminal outcome.
Respect existing secret and storage policies. Archives that cannot be preserved
completely refuse before preparation.

## Verification design

Use #124-shaped fixtures without changing the live consumer.

Required contract and proof cases:

- An authorized Develop correction retires obsolete unchecked declarations;
  replacements are unchecked and contain no inherited execution properties.
- Consolidated and legacy proof classify correctly; missing or malformed
  declarations cannot produce zero-command green.
- Changed shared VC bytes invalidate every dependent AC/DoD item.
- Legacy unchanged individual proof survives only with every required binding
  equal; canonical unchanged individual proof remains historical and is rerun.
- A later return to old text cannot revive an earlier aggregate approval.
- Proof stamping and checkbox/version changes do not change surviving legacy
  criterion identities or the semantic contract digest.
- A legacy preserved individual proof qualifies only through its exact derived
  disposition; it cannot carry aggregate authority or survive dependency drift.
- Ordinary edits continue refusing marker loss and fabricated proof.
- Targeted retirement cannot remove anything outside the derived write set.

Required authority and concurrency cases:

- Wrong or injected message sources, assistant-origin approval, stale exact
  statements, unsupported hosts, foreign bindings, malformed requests, and
  conflicting transaction IDs refuse.
- Two linked worktrees and two sibling invocations contend on one strict lock.
- An old live holder is not stolen by age; unknown liveness refuses.
- Revision versus ordinary writer and revision versus stage transition
  interleavings yield serialized outcomes without stale proof.
- An inherited flag cannot forge revision interlock ownership.
- Nested and multi-issue operations follow the specified lock order without
  acquiring a strict interlock beneath an existing issue/resource lock.
- Foreign hosts, independent clones, and mixed unsupported writers refuse
  within the documented admission boundary.

Required interruption cases:

- Inject failure before and after every event, capsule, projection, body write,
  and read-back.
- Recognize each exact planned write-set prefix without duplicate archives or
  capsules.
- Recover from another linked checkout and a different session using a new
  exact authorization.
- Exercise expired/replaced canonical authority, unavailable old transcript,
  uncertain terminal publication, and third-party drift.
- Prove abort only before authority change and forward repair after partial
  application.
- A new executor uses a distinct recovery operation under the original
  transaction; repeated recovery preserves one effective operation and one
  terminal outcome. Applied repair closes the original fence.
- Interrupted recovery resumes its archived effective proposal, not a new
  derivation from partially changed authority.
- Prove every covered consumer respects a pending fence.

Required lifecycle cases:

- Legacy and canonical revised fixtures obtain fresh normal Plan approval and
  pass AC, Test, Review, delivery, and close with newly generated evidence.
- Canonical Plan approval uses the real authority-specific adapter; a stubbed
  success or manually seeded approval record does not satisfy the test.
- Preserve canonical draft status during an early-stage revision.
- Test/Review revisions require normal demotions before application.
- Delivered, closed, Done, or actively transitioning issues refuse.

Existing #1847 root verification commands remain the initial test contract.
Refine/deep dive may add focused coverage through governed issue operations.
Writing, reviewing, or revising this draft satisfies no implementation checkbox.

## Refine acceptance and exclusions

Refine must confirm the bounded local writer topology is acceptable for the
intended consumer, verify the trusted host adapter against real runtime message
format, and complete the concrete producer/consumer inventory. These are
validation and sizing obligations for this design, not unspecified substitutes
for its authorization, serialization, invalidation, or recovery rules.

Size the canonical Plan-approval adapter, amendment persistence, strict local
interlock integration, revision records, and recovery tests as part of #1847.
Do not assume those extensions already exist or hide them behind an unfiled
prerequisite.

Exclude live ai-peer-review #124 edits, ai-peer-review package work, AITM #1841
records, distributed writer coordination, cross-host pending recovery,
user-managed signing infrastructure, generic invariant disabling, automatic
revision approval, stage skips, and unrelated refactoring.

SAR is iterative review and revision by the same agent. Subsequent rounds review
the committed revised artifact and either revise it again or record no remaining
material design findings. SAR convergence remains draft feedback; Refine
acceptance and later implementation/lifecycle approval remain separate.
