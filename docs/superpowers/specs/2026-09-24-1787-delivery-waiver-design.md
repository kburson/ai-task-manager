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
2. Open the delivery requirement family only as `waivable-with-disclosure`, a
   stricter catalog capability than ordinary waivable requirements.
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
expiry or operation ID, human-message requirement, and `waived`/`authorized`
audit vocabulary. They must not share the same proof predicate or receipt schema
fields when their evidence differs.

## Scope

In scope:

- stable catalog IDs for all delivery verification predicates;
- workflow-exception validation for delivery invariants;
- a shared delivery-exception authority contract that #1783 can consume without
  inheriting PR verifier predicates;
- delivery intent and receipt schemas for waived delivery;
- read-only and effect-time behavior for `deliver`, `close`, and explanation;
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

The catalog should distinguish plain waivable requirements from delivery
requirements that are `waivableWithDisclosure`. Existing planning and review
waivers remain ordinary `waivable: true`. Existing non-delivery hard requirements
remain non-waivable.

Each delivery verifier predicate maps to exactly one stable requirement ID. A
starter mapping should include:

| Verifier category | Requirement ID | Notes |
| --- | --- | --- |
| `authority-sha`, `authority-sha-mismatch` | `delivery.accepted-head` | accepted PR/Test/Review/head agreement |
| `pull-request-not-merged`, `merge-commit-sha`, `merged-at` | `delivery.pr-merged` | merged PR evidence exists and is well formed |
| `pr-number`, `base-ref`, `expected-head-sha` | `delivery.pr-scope` | PR identity, target ref, and accepted head scope |
| `fetch-origin-trunk`, `trunk-reachability` | `delivery.trunk-reachability` | merge commit is reachable from refreshed trunk |
| `merge-method-observation`, `merge-method-evidence`, `merge-method-unknown`, `merge-method`, `merge-method-unattributable` | `delivery.merge-method` | topology and declared-method agreement |
| `merge-before-intent`, `intent-created-at`, `input`, `input-keys` | `delivery.intent-integrity` | authorized intent shape and temporal order |
| `merge-commit-bytes`, `attribution` | `delivery.commit-attribution` | final merge bytes and attribution proof |
| `branch-disposition` | `delivery.branch-disposition` | post-delivery branch deletion/readback |
| `waived-evidence`, `waived-inventory`, `waived-authority` | `delivery.waiver-authority` | waiver record self-checks; this ID is never itself waivable |

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

`delivery.waiver-authority` is a guardrail ID, not an escape hatch. A malformed,
expired, revoked, wrong-scope, ambiguous, or stale waiver must always refuse.

## Waiver Authority

Delivery waivers reuse `aitm.workflow-exception/v1` records and the existing
GitHub-native comment chain. The shared delivery-exception authority contract is
used by both #1787 and #1783. A valid delivery exception has all ordinary
workflow-exception protections plus delivery-specific scope:

- repository and issue number;
- exception kind, such as `delivery.invariant-waiver` or
  `delivery.local-trunk-close-authorization`;
- pull request number when delivery is PR-based, and explicit `null` otherwise;
- accepted head SHA;
- target/base ref and resolved trunk ref identity;
- one named delivery requirement ID or local-trunk authorization ID;
- a single-use operation ID or bounded expiry;
- substantive non-placeholder human reason;
- host-verified user-message authority where the platform supports it;
- recording actor separated from authorizing principal.

The operator may not authorize a wildcard such as all delivery invariants, all
future deliveries, all heads for an issue, or all PRs in a repository. A record
with multiple delivery requirement IDs is invalid unless each requirement shares
the exact same issue, PR, head, base, operation, and reason; the safer
implementation path is one record per named invariant.

The evaluator should expose delivery waivers through a typed result:

```text
passed  - ordinary verifier evidence satisfied the invariant
waived  - current workflow-exception authorizes this exact invariant and scope
blocked - known failure with no valid waiver
indeterminate - authority or evidence cannot be read safely
```

Consumers must not infer a waiver from prose, labels, Full-Auto mode, local
files, branch names, or a caller-supplied `--reason`. A `--reason` may help
prepare or explain an exception request; it is not authority by itself.

For #1783, the resolver must additionally prove that the authorization statement
names the local-trunk lane rather than a PR delivery waiver. A user approving a
merge-method waiver must not accidentally authorize a no-PR close, and a user
approving a one-issue local-trunk close must not waive PR verifier predicates.

## Verification Flow

The delivery verifier stays fail-closed. It should evaluate predicates in the
same order as today and still compute the observed failure from provider and Git
evidence before considering a waiver. When a predicate fails:

1. translate the verifier category to its requirement ID;
2. load the current workflow-exception decision for the issue;
3. validate delivery scope against the live PR, intent, accepted SHA, base ref,
   trunk/ref target, operation, expiry, revocation, and reason;
4. if no exact waiver exists, throw the same delivery refusal with the
   requirement ID included;
5. if an exact waiver exists, continue only far enough to build a truthful
   waived receipt. Do not mark the predicate as satisfied.

Waiver handling should be local to delivery invariants. Existing review,
approval, CI, ownership, dependency, state, clean-tree, and provider-action gates
remain required unless they already have their own explicit workflow-exception
contract. A delivery waiver cannot authorize a missing Test receipt, missing
human approval, absent PR, wrong issue binding, or unmerged content unless the
named delivery invariant is exactly the one being waived.

For the #1784/#1785 reproduction, `delivery.merge-method` is the named invariant.
The verifier must still prove:

- the merged PR is the intended PR;
- the PR head is the accepted Test and Review SHA;
- the merge commit is reachable from trunk;
- the observed topology is merge, not squash;
- the human waiver is scoped to that issue, PR, SHA, base, and invariant.

Only the equality requirement between authorized method and observed topology is
waived. The receipt must say so.

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
- `waiverOperationId`;
- `waiverReasonDigest`;
- `waiverScopeDigest`;
- `observedFailureCategory`;
- the ordinary merge method and observed merge method when the waived predicate
  concerns topology.

Use `aitm.delivery-receipt/v4` for the corresponding terminal receipt. It should
include:

- `result: "waived"`;
- `waivedRequirementId`;
- `observedFailureCategory`;
- `waiverRecordId`, `waiverRevision`, and authority reference;
- authorizing principal when verifiable and recording actor separately;
- the human reason or a bounded excerpt plus digest, matching the existing
  record privacy/size conventions;
- the live delivery evidence that still passed.

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
advisory. `deliver` and `close` re-read and revalidate at effect time.

## Local-Trunk Consumer Sketch

#1783 should consume the shared authority contract through a local-trunk-specific
resolver. It should be eligible only when all of the following are true:

- the issue is in the correct terminal pre-close state with exact Test, Review,
  and human approval evidence;
- the accepted SHA is reachable from the configured trunk target;
- no ordinary PR delivery receipt exists for the issue;
- the authorization record names `delivery.local-trunk-close-authorization`;
- the authorization binds the exact repository, issue, accepted SHA, trunk/ref
  target, operation ID or expiry, and human reason;
- project-wide `fullAutoMerge` settings are not mutated or consulted as the
  authority for this one-off close;
- Full-Auto and agent-authored messages cannot satisfy the authorization.

This is not a waiver of `delivery.merge-method`, `delivery.pr-scope`, or any PR
verifier predicate. It is a different exceptional delivery authority for one
already-delivered local-trunk outcome. The implementation plan may split #1783
into its own issue if project sequencing prefers, but #1787's design should
define the shared authority contract so #1783 does not grow a second backdoor.

## Tests

Focused tests should cover:

- catalog validation accepts delivery IDs only through the
  `waivable-with-disclosure` path and still refuses `delivery.waiver-authority`;
- every `verificationError(...)` category maps to a stable requirement ID;
- every delivery requirement ID has a consumer mapping;
- no waiver present preserves the current refusal category and exit behavior;
- malformed, expired, revoked, ambiguous, wrong-issue, wrong-repository,
  wrong-PR, wrong-head, wrong-base, wrong-invariant, empty-reason, wildcard, and
  stale-scope records refuse;
- Full-Auto and agent-authored text cannot authorize a delivery waiver;
- the #1784/#1785 shape reaches a waived receipt only for
  `delivery.merge-method` and only after the other delivery evidence passes;
- the same waiver cannot close a different issue, PR, head, repo, ref, or
  operation;
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

- `scripts/task-tracker/lib/workflow-policy/catalog.mjs` for the catalog
  capability and delivery requirement IDs;
- `scripts/task-tracker/lib/workflow-policy/evaluator.mjs` and
  `exception-record.mjs` for delivery-specific waiver validation;
- a new narrow delivery-exception authority resolver shared by PR verifier
  waiver and local-trunk close authorization consumers;
- `scripts/task-tracker/lib/delivery-verification.mjs` for category-to-ID
  mapping and waived-result propagation;
- `scripts/task-tracker/lib/delivery-records.mjs` for intent v3, receipt v4,
  exact validators, parsers, projections, and renderers;
- `scripts/task-tracker/lib/no-commit-delivery-record.mjs` or a new adjacent
  local-trunk record module if #1783 is implemented in the same plan;
- `scripts/task-tracker/verbs/deliver.mjs` for effect-time loading, retry
  equivalence, remediation, and receipt writing;
- close and action-decision delivery consumers so explanation and close consume
  `passed` versus `waived` without re-parsing prose;
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
