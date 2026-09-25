# Generic Delivery Waiver With Disclosure

Date: 2026-09-24. Issue: #1787. Status: design for peer review.

## Problem

AITM delivery verification still has failure modes that are either ordinary
catalog requirements or bare verifier throws. The catalog currently marks every
`delivery.*` requirement as non-waivable, and several live predicates in
`delivery-verification.mjs` use categories such as `merge-method`,
`merge-method-unknown`, `merge-method-evidence`, `expected-head-sha`, and
`base-ref` without an addressable requirement ID. That leaves the operator with
only two choices when a delivered issue has a benign, understood delivery
divergence: add another special-case recovery branch, or leave the issue
permanently stranded.

The triggering case was #1784 / PR #1785. AITM authorized a squash intent, the
human merged the exact accepted head in the GitHub UI with a merge commit, and
the verifier correctly refused `delivery-verification:merge-method`. The close
guidance advertised `--reconcile-merge-method`, but that lane is reachable only
for no-live-intent or external recovery shapes; a pending AITM-authored intent
never reaches it. The narrow bug is real, but a second merge-method backdoor is
the wrong primitive.

The required outcome is one generic, evidence-bearing operator escape hatch for
delivery invariants: a delivery predicate refuses by default; a human can record
a current, scoped `workflow-exception` for that named invariant; the verifier can
then emit a truthful waived receipt instead of an ordinary pass.

#1783 overlaps because it asks for the same kind of human authority and truthful
close audit, but its proof problem is different. #1783 is a one-issue
authorization for a no-PR local-trunk close when the accepted SHA is already
trunk-reachable and ordinary PR/provider delivery evidence is absent. #1787 is a
waiver for a named predicate inside PR delivery verification after a delivery
intent exists and the merged PR evidence is available. The shared part should be
the authorization record and close/audit vocabulary; the proof lanes should stay
separate.

## Decision

Extend the existing workflow-exception mechanism to support delivery-invariant
waivers with disclosure. Do not add a new delivery-specific authorization
system, and do not make Full-Auto or agent automation a substitute for the
human waiver.

The design has four coupled pieces:

1. Give every delivery verifier refusal a stable `delivery.*` requirement ID
   and make verifier errors carry that ID.
2. Add only the new PR-verifier waiver requirement IDs as
   `waivable-with-disclosure`, a stricter per-requirement catalog capability
   than ordinary waivable requirements. Do not open an existing family as
   waivable.
3. Evaluate a current workflow-exception at delivery verification time against
   the exact repository, issue, pull request, accepted head SHA, trunk/base ref,
   and named invariant.
4. Emit `waived`, not `passed`, through the delivery intent, receipt, close
   explanation, and issue audit.

This design should not simply fold #1783 into #1787. Instead, define one
operator-authorized delivery exception architecture with two lane-specific
consumers:

- #1787: `delivery.invariant-waiver`, consumed by PR delivery verification when a
  specific verifier predicate fails.
- #1783: `delivery.local-trunk-close-authorization`, consumed by close/delivery
  authority when a no-PR accepted SHA is already trunk-reachable but no ordinary
  PR delivery receipt exists.

Both consumers use the same workflow-exception authority rules, scope binding,
bounded expiry, single-use delivery operation ID, human-message requirement,
and `waived`/`authorized`
audit vocabulary. They must not share the same proof predicate or receipt schema
fields when their evidence differs.

## Scope

In scope:

- stable catalog IDs for all delivery verification predicates;
- workflow-exception validation for delivery invariants;
- `aitm.workflow-exception/v2` creation, validation, and v1/v2 readback,
  including partitioned revision chains in the store, snapshot, and evaluator;
- a durable single-use consumption ledger with readback reconciliation and
  retry-safe burn semantics;
- Codex-only human authority and fail-closed unsupported-host refusal;
- a shared delivery-exception authority contract that #1783 can consume without
  inheriting PR verifier predicates;
- delivery intent and receipt schemas for waived delivery;
- read-only and effect-time behavior for `deliver`, `close`, and explanation;
- deterministic re-verification of completed waived deliveries, plus explicit
  intent v3 / receipt v4 support in reopened and false-delivery close recovery;
- focused fixtures for default refusals, wrong-scope waivers, Full-Auto
  refusal, receipt rendering, and the #1784/#1785 merge-method reproduction.

Out of scope:

- weakening or deleting delivery predicates;
- a per-predicate reconciliation implementation as the primary fix;
- treating no-PR local-trunk close authorization as if it were a failed PR
  verifier predicate;
- changing repository `mergeMethod` configuration;
- hand-editing delivery intent, receipt, or issue state for #1784;
- npm publication or changes to `ai-peer-review`.

## Relationship to #1783

There are three plausible ways to handle the overlap.

| Option | Shape | Result |
| --- | --- | --- |
| A. Merge #1783 fully into #1787 | One issue implements both PR verifier waivers and local-trunk no-PR close authorization | Too broad. It couples two proof systems and risks making local-trunk closure look like a waived PR predicate. |
| B. Keep separate issues with shared authority | #1787 builds the generic delivery-exception authority contract plus PR verifier waiver; #1783 consumes the same contract for local-trunk close | Recommended. It avoids duplicate backdoors while preserving different evidence rules. |
| C. Generalize only #1783 first | Build one-issue local-trunk authorization, defer PR verifier waivers | Insufficient for #1784/#1785 and leaves bare delivery-verifier throws unaddressed. |

The better boundary is Option B. The common module is a delivery-exception
authority resolver, not a universal delivery override. It should answer:

```text
Is there a current host-verified human authorization for this repository, issue,
accepted SHA, target ref, operation, and named delivery exception kind?
```

Then lane-specific proof decides what that authorization can affect:

- PR verifier waiver: the failed verifier predicate is named and every other PR
  delivery predicate still passes.
- Local-trunk close authorization: the accepted SHA is already reachable from
  the configured trunk target, Test/Review/approval evidence is exact, and the
  absence of a PR receipt is the named exceptional condition.

This keeps the user-facing story consistent: one human-authorized exceptional
delivery decision, two consumers with different evidence.

## Requirement Model

The catalog should distinguish plain waivable requirements from PR-verifier
requirements that are `waivableWithDisclosure`. Existing planning and review
waivers remain ordinary `waivable: true`. Existing hard requirements remain
non-waivable, including the current `delivery-invariant` family:

- `delivery.tests`;
- `delivery.verification-evidence`;
- `delivery.ownership`;
- `delivery.dependencies`;
- `delivery.issue-binding`;
- `delivery.state-contiguity`;
- `delivery.commit-provenance`;
- `delivery.ci`;
- `delivery.safe-delivery`;
- `delivery.external-protection`.

Eligible new PR-verifier IDs must live in the separate `delivery-pr-verifier`
family and be individually marked `waivable: false` and
`waivableWithDisclosure: true`. These are mutually exclusive capabilities, not
an extra flag layered on ordinary waivability. `validateWaiverIds` must continue
to refuse disclosure-only IDs, and `evaluateWorkflowPolicy` must never emit
`waived` for one. Only the delivery authority resolver may produce that result
after checking the v2 delivery scope and disclosure contract. A plain v1 or
ordinary workflow exception naming one of these IDs is invalid.

The non-waivable IDs below belong to `delivery-waiver-guardrail`, with both
capabilities false; they are excluded from `delivery-pr-verifier` even when
their names begin with `delivery.verification.*`. A future family-level capability change must not
be able to turn the existing hard `delivery-invariant` family into a waiver
surface by accident.

Each delivery verifier predicate maps to exactly one stable requirement ID. A
starter mapping should include:

| Verifier category | Requirement ID | Notes |
| --- | --- | --- |
| `authority-sha`, `authority-sha-mismatch` | `delivery.verification.accepted-head` | accepted PR/Test/Review/head agreement |
| `pull-request-not-merged`, `merge-commit-sha`, `merged-at` | `delivery.verification.pr-merged` | merged PR evidence exists and is well formed |
| `pr-number`, `base-ref`, `expected-head-sha` | `delivery.verification.pr-scope` | PR identity, target ref, and accepted head scope |
| `fetch-origin-trunk`, `trunk-reachability` | `delivery.verification.trunk-reachability` | merge commit is reachable from refreshed trunk |
| `merge-method` | `delivery.verification.merge-method` | only the equality of the authorized method to an independently proven observed method |
| `merge-method-observation`, `merge-method-evidence`, `merge-method-unknown`, `merge-method-unattributable`, new `merge-method-source-disagreement` | `delivery.verification.merge-method-evidence` | non-waivable guardrail: valid, known topology and agreement between available provider metadata and Git evidence |
| `merge-before-intent`, `intent-created-at`, `input`, `input-keys` | `delivery.verification.intent-integrity` | authorized intent shape and temporal order |
| `merge-commit-bytes`, `attribution` | `delivery.verification.commit-attribution` | final merge bytes and attribution proof |
| `branch-disposition` | `delivery.verification.branch-disposition` | post-delivery branch deletion/readback |
| `waived-evidence`, `waived-inventory`, `waived-authority` | `delivery.verification.attribution-waiver-authority` | #1755 attribution-waiver self-checks; this ID is never itself waivable |
| new `delivery-waiver-authority`, `delivery-waiver-replay`, `delivery-waiver-burn-mismatch`, `delivery-waiver-ambiguity` | `delivery.verification.waiver-authority` | mandatory non-waivable guardrail for generic waiver validity, scope, chain, replay, and consumption checks |

The `delivery.verification.*` prefix identifies verifier requirements, not a
waivability rule. Per-ID catalog capabilities distinguish disclosure-only
predicates from hard guardrails; the existing flat hard-gate IDs stay unchanged.

Do not add #1783's no-PR condition to this table. Its likely requirement ID is
`delivery.local-trunk-close-authorization`, but it belongs to close/delivery
authority rather than `delivery-verification.mjs` because no PR verifier
predicate failed. It should share the same authority contract and a separate
coverage test proving close consumes it only on the local-trunk lane.

Implementation may split IDs more finely if tests show a predicate needs a
separate operator decision. It must not leave a `delivery-verification:*`
category without a catalog ID. A coverage test should fail when a new
`verificationError(...)` category lacks a requirement mapping, and a second test
should fail when a `delivery.*` catalog ID has no delivery consumer.

`delivery.verification.attribution-waiver-authority` and
`delivery.verification.waiver-authority` are mandatory guardrails, not escape
hatches. A malformed, expired, revoked, wrong-scope, ambiguous, replayed, or
stale waiver must refuse new authorization. Completed-receipt verification uses
the pinned historical authorization rules below. Category coverage should extend
`VERIFICATION_DIAGNOSTICS` with a strict `requirementId` lookup; unlike the current
diagnostic fallback, an unmapped category must fail coverage and must not acquire
an inferred requirement ID.

The shared delivery-exception authority resolver is the raising site for the four
`delivery-waiver-*` categories in the table. It must expose a closed category
registry and a typed failure carrying `category`, `requirementId`, `outcome`
(`missing` or `indeterminate`), and a bounded remediation. All four categories
always carry `delivery.verification.waiver-authority`; callers cannot replace
that ID with the waivable predicate's ID. Invalid authority/scope uses
`delivery-waiver-authority`, reuse by a different transaction uses
`delivery-waiver-replay`, conflicting pinned consumption uses
`delivery-waiver-burn-mismatch`, and ambiguous/unreadable chain or consumption
evidence uses `delivery-waiver-ambiguity` with outcome `indeterminate`.

The PR verifier translates this typed failure into `DeliveryVerificationError`
with the same category, requirement ID, outcome, and remediation, without
consulting waiver authority for that guardrail. Other delivery consumers,
including #1783, consume the same structured fields directly. Operator output,
close explanation, and record projections use those fields, never error-prefix
parsing. No grant present is still an ordinary failed-predicate decision, not an
authority exception. Extend coverage beyond `verificationError(...)` sites:
enumerate the resolver's closed registry, test every raising branch and its
non-waivable mapping, and test PR translation and direct-consumer rendering,
including `indeterminate`. New unmapped resolver categories must fail the suite.

## Waiver Authority

Delivery waivers require `aitm.workflow-exception/v2` records and the existing
GitHub-native comment chain. Version 1 remains readable for existing
non-delivery workflow exceptions, but it must not be used for delivery waivers:
its payload key set is closed and its `scopeIdentity` is derived only from the
issue body. The shared delivery-exception authority contract is used by both
#1787 and #1783. A valid delivery exception has all ordinary workflow-exception
protections plus delivery-specific scope:

- repository and issue number;
- exception kind, such as `delivery.invariant-waiver` or
  `delivery.local-trunk-close-authorization`;
- pull request number when delivery is PR-based, and explicit `null` otherwise;
- accepted head SHA;
- target/base ref and resolved trunk ref identity;
- one named delivery requirement ID or local-trunk authorization ID;
- a single-use `deliveryOperationId`, with bounded expiry as an additional lifetime
  limit rather than a substitute for replay defense;
- substantive non-placeholder human reason;
- host-verified Codex user-message authority;
- recording actor separated from authorizing principal.

The v2 payload retains the v1 envelope shape and adds `deliveryScope`,
`waiverScopeDigest`, and the required discriminator `scopeKind: "delivery"`.
V1 remains the ordinary-exception schema; v2 is delivery-only in this issue.
For v2, `expiresAt: null` is invalid: expiry must be a canonical timestamp later
than recording and later than the initial authorization burn. Its canonical
delivery scope preimage is:

```json
{
  "schema": "aitm.delivery-exception-scope/v1",
  "repository": "owner/name",
  "issue": 1787,
  "exceptionKind": "delivery.invariant-waiver",
  "pullRequest": 1785,
  "acceptedHeadSha": "<40-hex>",
  "baseRef": "trunk",
  "resolvedTrunkRef": "origin/trunk",
  "requirementId": "delivery.verification.merge-method",
  "deliveryOperationId": "<ULID>"
}
```

`waiverScopeDigest` is `sha256:` followed by the lowercase SHA-256 digest of the
UTF-8 bytes of `canonicalRecordJson(deliveryScope)`, using
`scripts/task-tracker/lib/github-records/canonical-json.mjs`. All keys are
required; `pullRequest` is explicitly `null` for #1783, never omitted.
`resolvedTrunkRef` is the stable resolved ref name, not its current tip SHA.
Unrelated trunk commits must not change this preimage. Live reachability is a
separate verifier predicate, not a volatile scope field. It
supplements the existing body-derived `scopeIdentity`; it does not replace or
weaken it. At initial authorization the evaluator must require both the ordinary issue-body
`scopeIdentity` and the delivery-specific `waiverScopeDigest` to match current
facts. Existing v1 readers in `exception-store.mjs` and `snapshot.mjs` remain
backward-compatible by accepting v1 records for their current non-delivery use
cases and v2 records only when their schema discriminator is recognized.

The operator may not authorize a wildcard such as all delivery invariants, all
future deliveries, all heads for an issue, or all PRs in a repository. Each v2
record must name exactly one requirement ID, identical to
`deliveryScope.requirementId`. One PR transaction may waive only that one ID;
every other predicate must pass. Multiple delivery records can coexist, but
cannot be accumulated into a multi-invariant override of one transaction.

`validateWorkflowExceptionEnvelope` must dispatch on the exact payload schema
and discriminator before checking the schema-specific key set or requirement
capability. V1 continues to use `validateWaiverIds` and `validateConstraints`
unchanged. For a v2 `delivery.invariant-waiver`, add
`validateDeliveryWaiverIds(requirementIds, deliveryScope)` in the catalog module:
it requires exactly one ID in `payload.requirementIds`, identical to
`deliveryScope.requirementId`, whose catalog entry has `waivable: false` and
`waivableWithDisclosure: true`. It rejects ordinary waiver IDs, guardrails,
unknown IDs, duplicates, and a mismatched exception kind. This structural
validator admits the payload; it does not authorize delivery without the
resolver's scope and human-authority checks.

V2 must have `constraints: []`; non-empty constraints are invalid rather than
silently ignored. The validated single delivery requirement satisfies the v2
non-empty-policy rule, so v2 does not call the ordinary waiver validator or rely
on a constraint to pass `empty-policy`. V1 keeps its existing non-empty-policy
rule. Writers, parsers, readback, and typed projections must all use this same
schema-dispatched validation. Ordinary deny constraints remain in the separately
evaluated v1 partition and continue to block the operation; v2 cannot carry or
override them. A future #1783 kind-specific validator must explicitly admit its
own local-trunk ID under the same dispatch contract. Unknown kinds refuse, and
local-trunk authority cannot validate as a PR invariant waiver.

### Record Family and Chain Boundaries

#1755 already provides `aitm.delivery-attribution-exception/v1` in
`delivery-attribution-exception-record.mjs`: exact PR scope, a proposal digest,
ULID operation identity, bounded expiry, grant/revision/revocation chains, and
host-verified authority. Its `verifyWaivedEvidence` consumer is also the precedent
for deterministic re-verification of pinned authorization. Reuse those patterns
and canonical/authority helpers where their contracts match.

The choice of workflow-exception v2 is intentional: #1787 needs the catalog's
named requirement decisions and existing operator workflow, while #1783 needs an
explicit no-PR scope. Generalizing #1755 would require a new schema too, because
its PR number, source inventory, attribution mappings, and tokens are mandatory.
Migrating those historical attribution grants is outside #1787. Keep #1755's
records and consumers compatible, with no cross-grant interpretation; the new
common authority contract serves #1787 and #1783, not a retroactive schema union.

Partition validated records before chain resolution, writes, readback, snapshot
projection, or ordinary policy evaluation. The ordinary v1 partition retains
its current single-chain and single-active-record rules. Each delivery v2 chain
is keyed by `(repository, issue, exceptionKind, requirementId,
deliveryOperationId)`. Revisions and revocations address that exact chain, keep
the key immutable, and cannot supersede a record in another partition. Each key
must have one root and one unambiguous head with contiguous revision links;
forks, duplicate heads, and cross-chain references refuse. Unknown or malformed
schema/discriminator combinations refuse parsing rather than silently becoming
ordinary exceptions or disappearing during partitioning.

Each delivery partition has one immutable `exceptionId`, unique among delivery
partitions for the issue. It identifies the grant chain but does not replace or
extend the scope-partition key. A second exception ID in one partition, or reuse
of an exception ID in another, is invalid. Before consumption, a revision may
change non-key scope fields only with a fresh human approval for the new exact
proposal; it never inherits approval for the previous scope. Once consumed,
neither revision nor re-scoping restores availability of the operation.

`exception-store.mjs` must select the addressed partition before its
`revision-required` check and operation readback. `exception-record.mjs` must
apply its one-chain rule within that partition, not over every comment on the
issue. `snapshot.mjs` projects ordinary policy and delivery decisions separately;
`evaluator.mjs` receives only the ordinary partition and cannot grant a delivery
waiver. A valid delivery record must neither revoke nor make an existing review
bundle ambiguous. Distinct delivery chains may coexist; the resolver selects
only the exact requested key. Two failed requirement IDs in one transaction
still refuse, even if each has a separately valid grant. Existing deny constraints
continue to apply to the operation regardless of delivery authorization.

In `snapshot.mjs`, partition `authorityRevisions` as well as the active decision.
Ordinary revision history retains its current meaning; delivery history includes
its explicit kind and partition identity with dispositions from its own chain.
Render both histories distinctly. The overall `snapshotHash` may change when
delivery history changes because it represents the full snapshot, but ordinary
history and its dispositions must not be relabeled or merged with delivery ones.

### Identifiers and Derivation Order

The shared #1787/#1783 consumption identifier is a ULID `deliveryOperationId`,
minted once during preparation and retained across retries of that delivery
transaction. It is not the workflow store's existing `operationId`, which stays
a `sha256:` write-idempotency digest. #1755's ULID `operationId` is analogous to
the new delivery identifier but is interpreted only under its own schema.

Derive the v2 write in this order: mint/select `deliveryOperationId`; construct
`deliveryScope`; compute `waiverScopeDigest`; construct the desired policy,
including the full scope and digest; finally compute the store `operationId`
over action, repository, issue, revision, status, and that policy, using the
existing canonical hash convention. Neither the write `operationId` nor its
digest is an input to `deliveryScope`. The store's policy equality, idempotency
hash, and transport readback must include both new scope fields and the
discriminator. Different scopes cannot reuse a write-idempotency result.
Revising a grant changes the write digest but does not reset consumption of its
delivery operation.

The evaluator should expose delivery waivers through a typed result:

```text
satisfied     - ordinary verifier evidence satisfied the invariant
waived        - current workflow-exception authorizes this exact invariant and scope
missing       - known failure with no valid waiver
indeterminate - authority or evidence cannot be read safely
```

These names align with the existing policy evaluator vocabulary where possible:
`satisfied`, `waived`, and `missing` map directly to `POLICY_OUTCOMES`;
`indeterminate` is delivery-specific and represents unsafe or unreadable
authority/evidence rather than an ordinary missing waiver.

Consumers must not infer a waiver from prose, labels, Full-Auto mode, local
files, branch names, or a caller-supplied `--reason`. A `--reason` may help
prepare or explain an exception request; it is not authority by itself.

For #1783, the resolver must additionally prove that the authorization statement
names the local-trunk lane rather than a PR delivery waiver. A user approving a
merge-method waiver must not accidentally authorize a no-PR close, and a user
approving a one-issue local-trunk close must not waive PR verifier predicates.

For #1787, host authority is intentionally Codex-only. Current
`aitm.workflow-exception/v1` authority validation accepts only
`codex-session-transcript` with `host-verified-user-message`, and the authority
resolver only loads `codex-session/v1`. This design does not extend the origin
enum, reference grammar, or adapter set. Delivery waiver preparation from an
unsupported host must fail closed and tell the operator to capture the approval
in a supported Codex session. A future issue may add Claude, GitHub, or other
host adapters, but #1787 does not lower the verification level to do so.

### Consumption and Completed-Receipt Verification

Single-use is new work. The resolver must persist an append-only consumption
record before writing a terminal receipt. Its uniqueness key is repository,
issue, and `deliveryOperationId`; its immutable payload binds `waiverRecordId`,
`waiverRevision`, `waiverScopeDigest`, `waiverReasonDigest`, accepted head SHA,
the exact intent ID, merge commit SHA for the PR lane, and authorization time.
Changing the grant revision cannot make a consumed operation fresh.

The burn point is after all non-waived evidence and current authority have been
validated and immediately before receipt creation. Expiry, revocation, current
body scope, and grant liveness are checked at this initial authorization point.
Serialize consumption for the same operation; concurrent attempts must not
produce two terminal transactions. A write exception is not proof of failure:
reconcile by exact durable readback, as `exception-store.mjs` already does for
ambiguous comment appends. One exact matching burn permits continuation; missing,
conflicting, duplicated, or unreadable evidence yields `indeterminate` and no
receipt until reconciled. Never silently mint a replacement operation on retry.

After a confirmed burn, a retry may finish the same intent only, using its pinned
authorization, when no terminal receipt exists. If a matching terminal receipt
already exists (including a lost successful write response), return that receipt
idempotently without another burn or receipt. A different intent or transaction
reusing the operation refuses as replayed. An indeterminate receipt write must
also reconcile by readback before any append retry.

`close` and historical recovery are verification of an existing terminal
transaction, not another use of its grant. Following `verifyWaivedEvidence`
(`delivery-verification.mjs`), validate the exact immutable grant revision and
consumption evidence pinned into intent v3 and receipt v4. Check that authorization
time preceded expiry, that the grant was active at that time, that its recorded
body scope and delivery scope match the pinned evidence, and that every digest,
record link, intent ID, operation, and delivery identity agrees. Do not re-resolve
current expiry or reject the matching burn as replay. Later expiry, grant
supersession/revocation, or an issue-body edit does not retroactively invalidate
a completed receipt; tampering with historical evidence, a revocation effective
before authorization, or mismatched current PR/head/target/merge facts does refuse.
Re-read durable evidence at effect time and re-run all non-waived delivery
predicates against live provider/Git facts. This is pinned historical authority,
not trust in a stored pass or a caller-supplied authorization boolean.

Every added receipt field must be reproducible byte-for-byte by
`verifyCloseDeliveryReceipt`; retain its `canonicalRecordJson` equality check.
No new receipt field may use close-time `now` or current grant liveness.
The intent pins the canonical grant revision (or immutable resolvable reference
plus digest), including body scope and authority evidence, and the expected
consumption key. The receipt additionally pins the confirmed burn and its digest.
Allocate the intent ID before constructing the burn; the burn binds that ID and
never hashes a receipt that in turn hashes the burn.

## Verification Flow

The delivery verifier stays fail-closed. It should evaluate predicates in the
same order as today and still compute the observed failure from provider and Git
evidence before considering a waiver, except that merge-method equality follows
the required evidence-source agreement checks below.

Dispatch first using verified durable transaction state, not a caller-supplied
mode or authorization boolean. An existing terminal receipt uses **Consumption
and Completed-Receipt Verification** directly: re-read its pinned grant and burn,
validate historical authorization and current non-waived delivery facts, and
reproduce its receipt. Do not load a current grant decision or check current
expiry/revocation. A confirmed burn with no receipt uses that same subsection's
pending-transaction retry rules. Neither path re-enters initial authorization.

Only for a new, unconsumed transaction, when a predicate fails:

1. translate the verifier category to its requirement ID;
2. load the current workflow-exception decision for initial authorization only;
3. for this initial authorization, validate delivery scope against the live PR,
   intent, accepted SHA, base ref, trunk/ref target, operation, current expiry,
   current revocation, and reason;
4. if authority or evidence cannot be read safely, refuse with a distinct
   indeterminate result and include the requirement ID;
5. if no exact waiver exists, throw the same delivery refusal with the
   requirement ID included;
6. if an exact waiver exists, retain a provisional `waived` decision and finish
   every other predicate, including all evidence and waiver guardrails;
7. only after the complete verification succeeds, confirm the single-use burn
   and write the truthful waived receipt. Do not mark the waived predicate as
   satisfied.

`indeterminate` is fail-closed. It is not an ordinary `missing` waiver and must
be distinguishable in operator output, record projection, and close explanation,
so an operator can tell "authority unreadable" from "no waiver was recorded."
`deliver` and `close` must refuse on `indeterminate` and must not write a
delivery receipt.

Waiver handling should be local to delivery invariants. Existing review,
approval, CI, ownership, dependency, state, clean-tree, and provider-action gates
remain required unless they already have their own explicit workflow-exception
contract. A delivery waiver cannot authorize a missing Test receipt, missing
human approval, absent PR, wrong issue binding, or unmerged content unless the
named delivery invariant is exactly the one being waived.

For the #1784/#1785 reproduction, `delivery.verification.merge-method` is the
named invariant. The verifier must still prove:

- the merged PR is the intended PR;
- the PR head is the accepted Test and Review SHA;
- the merge commit is reachable from trunk;
- the observed topology is merge, not squash;
- the human waiver is scoped to that issue, PR, SHA, base, and invariant.

Only the equality requirement between authorized method and observed topology is
waived. The receipt must say so.

The two existing `merge-method` throw sites must share a single observation
contract. First validate provider metadata if present, then independently derive
Git topology. A missing provider method is `null`, not an inference that it
equals the intent. Known topology is mandatory; malformed metadata, unknown
topology, unavailable evidence, or disagreement between non-null provider method
and topology refuses under `delivery.verification.merge-method-evidence` and
cannot be waived. Only compare the proven observed method to the authorized
intent method after those guards pass. A merge-method waiver therefore covers
one equality, never a disagreement between evidence sources.

Pin `providerMergeMethod` (including explicit `null`), `observedMergeMethod`, and
`observedFailureCategory` at authorization. Deliver and close must use the same
normalizer; remove the `pullRequest.mergeMethod ?? intent.mergeMethod` coercion
for the v3/v4 path in `close-delivery-receipt.mjs`. During re-verification, live
provider metadata, when present, must still agree with live topology and any
pinned non-null provider observation. If an optional provider field disappears
or becomes available, do not rewrite the pinned observation in the receipt:
validate the available evidence and reproduce the authorized snapshot exactly.
Live Git topology must equal the pinned observation in all cases.

## Records and Schemas

Delivery intent and receipt records should add a general delivery waiver
disposition rather than overloading #1755's attribution-only fields. #1787's PR
verifier waiver should use delivery intent/receipt versions because it repairs a
delivery transaction. #1783 may instead need a new version of the existing
`aitm.no-commit-delivery/v1` or a local-trunk authorization receipt, because its
terminal evidence is not a PR intent.

Use `aitm.delivery-intent/v3` for a waived delivery invariant. It should include
the existing intent fields plus:

- `deliveryDisposition: "waived"`;
- `waivedRequirementId`;
- `waiverRecordId`;
- `waiverRevision`;
- `deliveryOperationId` (ULID, never the exception store's write `operationId`);
- `waiverReasonDigest`;
- `waiverScopeDigest`;
- `observedFailureCategory`;
- the ordinary merge method and observed merge method when the waived predicate
  concerns topology.

The v3 intent also identifies the original authorized intent and its immutable
authorization timestamp. When v3 supersedes a pending intent after the PR has
merged, temporal checks use that original authorization evidence; the later
waiver-recording time must not be treated as the original merge authorization.
Missing or contradictory original intent evidence remains a refusal.

Use `aitm.delivery-receipt/v4` for the corresponding terminal receipt. It should
include:

- `result: "waived"`;
- `waivedRequirementId`;
- `observedFailureCategory`;
- `waiverRecordId`, `waiverRevision`, and authority reference;
- `deliveryOperationId`, `waiverScopeDigest`, `waiverReasonDigest`, and the
  canonical grant and consumption evidence needed for pinned re-verification;
- authorizing principal when verifiable and recording actor separately;
- the human reason or a bounded excerpt plus digest, matching the existing
  record privacy/size conventions;
- the live delivery evidence that still passed.

Both schemas remain singular in `waivedRequirementId`. Multiple waived IDs in
one PR transaction are outside this issue and must refuse rather than discard
all but the first failure. Existing hard Test/Review/head, issue binding, merged
PR, target, and reachability requirements of close remain required; a waiver
does not substitute for the evidence needed to establish its own exact scope.

Existing `aitm.delivery-intent/v1`, `v2`, `aitm.delivery-receipt/v1`, `v2`, and
`v3` remain readable. #1755's `attributionDisposition: "waived"` remains the
attribution-specific receipt shape. The new generic delivery waiver should not
reuse that field for non-attribution invariants because doing so would blur
which predicate was waived.

For #1783, do not unionize the PR delivery receipt shape merely to reuse #1787's
v4. A local-trunk close authorization should render as its own typed terminal
record with accepted SHA, trunk target, operation ID, authority record, and
`result: "authorized-local-trunk"` or an equally explicit non-ordinary result.
Close can treat both records as terminal delivery authority only after checking
their exact lane-specific schemas.

Renderers must visibly distinguish:

- ordinary delivery passed;
- attribution waived under #1755;
- a delivery invariant waived under #1787;
- delivery blocked or indeterminate.

Close output must consume this typed disposition. A waived delivery receipt is a
valid terminal delivery receipt for the exact issue only, but it never satisfies
text that asks whether all delivery invariants passed normally.

`requireDeliveryReceipt` must explicitly accept a valid v4 `result: "waived"`
paired with a v3 intent; it must not require `result: "delivered"` for this
schema. `reopened-close-recovery.mjs` and `false-delivery-close-recovery.mjs` must
also gain explicit v3/v4 bundle support in #1787, using the same pinned-waiver
validator and existing exact PR/head/intent/receipt correlation. Do not replace
their version pins with a permissive version range or a schema-name-only check.
Preserve existing accepted combinations and refuse unknown or mismatched pairs.
General repair of their pre-existing v2/v3 attribution-version exclusions is
outside this issue; #1787 must cover the new pair it introduces.

## Command Surface

The safest operator flow is a two-step workflow-exception flow rather than
teaching `deliver` to accept authority directly:

1. `workflow-exception prepare` (or an equivalent existing verb) prints the exact
   issue/PR/SHA/ref/invariant proposal and the user statement to approve.
2. The human sends the exact approval through a supported host.
3. `workflow-exception record` writes the durable record.
4. `deliver` consumes the current record if the same predicate fails.

`deliver` may report a structured remediation when a delivery invariant blocks:
the category, requirement ID, observed scope, and the supported preparation
command. It must not write a waiver, infer approval from the retry, or accept
`--reason` as sufficient authority. The existing `--reconcile-merge-method`
help should either be narrowed to its truly reachable historical/external lanes
or superseded by guidance that points merge-method divergence at the generic
delivery-waiver flow.

`workflow-preflight` should be able to report whether a proposed delivery waiver
record is current for the live scope, but preflight remains read-only and
advisory. `deliver` revalidates current authority at the first burn; `close`
re-reads pinned historical authority and live delivery facts without consuming
the waiver again. Missing `User Story`, `Scope`, or `Acceptance Criteria` sections
must produce an actionable scope-preparation refusal: repair the issue through
the supported issue workflow, then prepare a fresh proposal for human approval.
Do not drop the body-scope check to accommodate legacy issues. Close's existing
`--reconcile-merge-method` diagnostic in `close.mjs` must point to this flow and
render its typed waived/blocked/indeterminate results.

## Local-Trunk Consumer Sketch

#1783 should consume the shared authority contract through a local-trunk-specific
resolver. It should be eligible only when all of the following are true:

- the issue is in the correct terminal pre-close state with exact Test, Review,
  and human approval evidence;
- the accepted SHA is reachable from the configured trunk target;
- no ordinary PR delivery receipt exists for the issue;
- the authorization record names `delivery.local-trunk-close-authorization`;
- the authorization binds the exact repository, issue, accepted SHA, trunk/ref
  target, single-use `deliveryOperationId`, bounded expiry, and human reason;
- project-wide `fullAutoMerge` settings are not mutated or consulted as the
  authority for this one-off close;
- Full-Auto and agent-authored messages cannot satisfy the authorization.

This is not a waiver of `delivery.verification.merge-method`,
`delivery.verification.pr-scope`, or any PR verifier predicate. It is a
different exceptional delivery authority for one already-delivered local-trunk
outcome. The implementation plan may split #1783 into its own issue if project
sequencing prefers, but #1787's design should define the shared authority
contract so #1783 does not grow a second backdoor.

## Tests

Focused tests should cover:

- catalog validation accepts only the new `delivery.verification.*` PR-verifier
  IDs through the `waivable-with-disclosure` path, keeps the ten existing hard
  `delivery-invariant` IDs non-waivable, and still refuses waiver-authority
  guardrail IDs;
- ordinary `validateWaiverIds`, workflow-exception writes, and the ordinary
  evaluator refuse disclosure-only IDs; no plain record can obtain a delivery
  waiver without the typed v2 resolver;
- every `verificationError(...)` category maps to a stable requirement ID;
- every authority-resolver category and raising branch maps to the mandatory
  non-waivable guardrail, including translation into PR verifier errors and
  structured `indeterminate` rendering by direct consumers;
- every delivery requirement ID has a consumer mapping by extending
  `CONSUMER_DECLARATIONS` rather than building a duplicate coverage mechanism;
- no waiver present preserves the current refusal category and exit behavior;
- malformed, expired, revoked, ambiguous, wrong-issue, wrong-repository,
  wrong-PR, wrong-head, wrong-base, wrong-invariant, empty-reason, wildcard, and
  stale-scope records refuse;
- v2 delivery records reject `expiresAt: null`; v1 expiry optionality remains
  unchanged;
- a v2 payload with one matching disclosure-only requirement and empty
  constraints is created, parsed, and read back successfully, while that ID on
  v1, mismatched IDs, guardrail IDs, empty requirements, unknown kinds, and
  non-empty v2 constraints refuse; ordinary deny constraints still block;
- a waiver stays current when unrelated commits advance the same trunk ref,
  while a changed target ref still refuses;
- a review-bundle exception and delivery waiver can be recorded, read back,
  revised, and evaluated on the same issue without colliding; multiple delivery
  chains remain isolated, and duplicate heads/cross-chain links refuse;
- delivery exception IDs cannot cross partitions; pre-burn re-scoping requires
  a fresh approval; ordinary and delivery revision histories render separately;
- minting the delivery ULID, then scope digest, then write-idempotency digest is
  deterministic on retry, acyclic, and sensitive to every delivery scope field;
- unsupported non-Codex authority refuses rather than degrading to a weaker
  verification level;
- Full-Auto and agent-authored text cannot authorize a delivery waiver;
- the #1784/#1785 shape reaches a waived receipt only for
  `delivery.verification.merge-method` and only after the other delivery
  evidence passes;
- the same waiver cannot close a different issue, PR, head, repo, ref, or
  operation;
- replaying the same correctly scoped waiver after one completed waived delivery
  refuses for a different transaction; retrying the original intent returns its
  exact terminal receipt without writing another burn or receipt;
- consumption is serialized per operation, survives ambiguous append/readback,
  and cannot be reset by revising the grant; conflicting burns refuse;
- confirmed-burn/no-receipt retries and ambiguous receipt writes reconcile
  without consuming a second approval;
- a waived receipt re-verifies and closes byte-identically after expiry and
  unrelated trunk activity, with its matching burn already recorded; tampered
  grant/burn evidence and mismatched current delivery facts still refuse;
- completed-receipt and confirmed-burn retry paths never invoke the initial
  current-grant resolver or its expiry/revocation checks;
- provider metadata and Git topology disagreement, unknown topology, or invalid
  provider metadata cannot be waived; absent metadata is not backfilled from
  the intent, and changes in optional metadata availability do not change the
  pinned receipt bytes;
- reopened-close and false-delivery-close recovery validate v3/v4 waived
  bundles and refuse mixed versions, mismatched heads, or invalid pinned grants;
- two failed requirement IDs cannot be hidden in a singular waived receipt;
- superseding a pending intent with v3 preserves the original merge authorization
  time and validates its evidence rather than comparing merge time to waiver time;
- indeterminate authority or evidence refuses with a distinguishable result and
  writes no delivery receipt;
- a waived receipt renders as waived in deliver output, close output, issue
  audit, and parsed record projection;
- ordinary delivery, #1755 attribution waiver, historical reconstruction, and
  existing external recovery fixtures remain unchanged;
- #1783 local-trunk authorization cannot satisfy a PR verifier waiver, and #1787
  PR verifier waiver cannot authorize no-PR close;
- a local-trunk close fixture consumes the same authority resolver but produces a
  local-trunk-specific terminal record, not a PR delivery receipt;
- read-only preflight writes no comments, mutates no timer/binding state, and
  launches no providers.

The issue's verification commands are the right eventual focused suite names:

```sh
node --test scripts/tests/unit/task-tracker/lib/delivery-verification-catalog-ids.test.mjs
node --test scripts/tests/unit/task-tracker/lib/delivery-waiver-scope.test.mjs
node --test scripts/tests/unit/task-tracker/lib/delivery-waiver-authority.test.mjs
node --test scripts/tests/unit/task-tracker/lib/delivery-waiver-consumption.test.mjs
node --test scripts/tests/unit/task-tracker/lib/delivery-waiver-reverification.test.mjs
node --test scripts/tests/unit/task-tracker/lib/delivery-waived-receipt.test.mjs
node --test scripts/tests/unit/task-tracker/lib/delivery-default-refusals.test.mjs
node --test scripts/tests/integration/task-tracker/delivery-waiver-merge-method.integration.test.mjs
npm test
npm run test:slow
npm run lint
npm run format:check
```

The implementation plan should start with characterization tests for the current
refusal and record rendering before changing catalog semantics.

## Implementation Notes

Likely touch points:

- `scripts/task-tracker/lib/workflow-policy/catalog.mjs` for per-requirement
  `waivableWithDisclosure`, the separate `delivery-pr-verifier` family, and the
  non-waivable `delivery-waiver-guardrail` family and delivery requirement IDs;
- `scripts/task-tracker/lib/workflow-policy/evaluator.mjs` and
  `exception-record.mjs` for `aitm.workflow-exception/v2`, delivery-specific
  waiver validation, Codex-only authority refusal, and v1/v2 readback;
- `workflow-policy/exception-store.mjs` and `snapshot.mjs` for partitioned
  writes/readback, chain selection, and separate ordinary/delivery projections;
- `delivery-attribution-exception-record.mjs` and
  `delivery-attribution-exception.mjs` as the #1755 scope/authority precedent,
  preserving their historical schemas and consumer behavior;
- a new narrow delivery-exception authority resolver shared by PR verifier
  waiver and local-trunk close authorization consumers;
- a durable consumption record or ledger for single-use delivery waiver
  operation IDs and retry-safe burn semantics;
- `scripts/task-tracker/lib/delivery-verification.mjs` for category-to-ID
  mapping and waived-result propagation;
- `scripts/task-tracker/lib/delivery-records.mjs` for intent v3, receipt v4,
  exact validators, parsers, projections, and renderers;
- `scripts/task-tracker/lib/no-commit-delivery-record.mjs` or a new adjacent
  local-trunk record module if #1783 is implemented in the same plan;
- `scripts/task-tracker/verbs/deliver.mjs` for effect-time loading, retry
  equivalence, remediation, and receipt writing;
- close and action-decision delivery consumers so explanation and close consume
  typed `satisfied` versus `waived` decisions and schema-specific receipt results
  without re-parsing prose;
- `close-delivery-receipt.mjs` for explicit v3/v4 receipt acceptance, pinned
  authorization re-verification, and consistent merge-method observations;
- `reopened-close-recovery.mjs` and `false-delivery-close-recovery.mjs` for
  explicit v3/v4 bundle validation;
- operator guidance and command help for the supported waiver flow and the
  narrowed `--reconcile-merge-method` lane.

The plan should avoid moving all delivery predicates into a new policy engine.
Delivery verification remains the owner of provider/Git facts; workflow-policy
owns waiver authority; delivery records own durable projection. The boundary is
the typed requirement decision passed between them.

## Risks

The main product risk is turning a truthful waiver into a hidden pass. The
schema and renderer must make this hard to do: `waived` is a first-class outcome
and never backfills pass markers.

The main engineering risk is a too-broad scope identity. A delivery waiver must
bind to the delivery operation details, not just the issue body. Reusing the
ordinary workflow-exception scope without delivery extensions would let unrelated
PR/head changes inherit the waiver.

The second engineering risk is duplicating waiver interpretation in `deliver`,
`close`, and explanation. The implementation should expose one typed delivery
waiver resolver and require consumers to use it.

The #1783 overlap creates a third risk: over-generalizing the exception until it
becomes a broad close bypass. Avoid that by making the shared resolver prove only
human authority and common scope, then requiring each lane to prove its own
delivery facts before it can write a terminal record.

## Definition of Done for the Design

This design is ready for planning only after peer review accepts that:

- it preserves default delivery refusals;
- it gives every delivery predicate an addressable requirement ID;
- it keeps human authority separate from agent automation and Full-Auto;
- it makes waived delivery receipts visibly different from ordinary passes;
- it can satisfy #1783 through the same authority pattern without merging the
  no-PR and PR-based delivery predicates into one ambiguous branch.
