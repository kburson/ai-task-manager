<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-341532c92eac97134dfede8a4f29fba6"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-24-1787-delivery-waiver-design.md"
artifact_commit: "21a07908370219e64b7aeeaa216c55bb4f009c02"
artifact_blob: "137b412ff616343887e341cc909afb5dffa10972"
artifact_digest: "sha256:4e2ab1c13b159dbd7d5c6d529b8b04a59f721eb9a3dd3dafa06a8c26a136a937"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:d0f549acc4823b1d05dab7c341cd134589222ad56e02a364c14624eb89b42d81"
  identity_source: "declared"
started_at: "2026-09-25T00:57:32.504Z"
submitted_at: "2026-09-25T01:05:58.528Z"
finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004","R1-F005","R1-F006"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Independent review of `docs/superpowers/specs/2026-09-24-1787-delivery-waiver-design.md`
at `21a07908` / blob `137b412f`. Every claim below was checked against live
source in this worktree.

The core judgment — that a second merge-method backdoor is the wrong primitive,
and that the right primitive is one human-authorized, evidence-bearing,
narrowly-scoped delivery exception that produces a `waived` outcome rather than a
pass — is correct, and the artifact argues it well. The Option B boundary against
#1783 is the right call for the reasons given. Several of the artifact's factual
claims about the current code are accurate, which is worth recording because they
are load-bearing:

- `catalog.mjs:18-27` does mark all ten `delivery.*` IDs `waivable: false`, in
  family `delivery-invariant`. Accurate.
- The verifier categories named in **Problem** (`merge-method`,
  `merge-method-unknown`, `merge-method-evidence`, `expected-head-sha`,
  `base-ref`) exist and carry no catalog ID. Accurate.
- The category→requirement table is **complete**: I enumerated all 25 distinct
  `verificationError(...)` categories in `delivery-verification.mjs` (lines
  166-864) and every one appears in the table. That is a real piece of rigor.
- Record version arithmetic is right: `delivery-records.mjs:11-15` pins intent
  v1/v2 and receipt v1/v2/v3, so intent v3 and receipt v4 are the correct next
  versions.
- `CONSUMER_DECLARATIONS` is the right extension point, and extending it is not
  optional — `assertConsumerCoverage` (`consumer-coverage.mjs:44-49`) throws
  `unmapped-requirements` for any catalog ID with no consumer, so all nine new
  IDs must be declared or the whole assertion fails.
- The Codex-only authority claim is exact: `exception-record.mjs:83-100` accepts
  only `origin === 'codex-session-transcript'` with
  `verificationLevel === 'host-verified-user-message'`.
- The `--reconcile-merge-method` unreachability claim is exact. `deliver.mjs:1095`
  gates the historical lane on `live === null || live.record.provider === 'external'`,
  and `deliver.mjs:1517-1527` gates the external-recovery lane on
  `liveIntent === null`. A pending AITM-authored live intent reaches neither.

I am requesting revisions. Two of my six required changes are architectural
rather than textual, and both stem from the same omission: the design specifies
its authority mechanism without reconciling it against the two places in this
codebase that already constrain it — `close`'s byte-identical receipt
recomputation, and #1755's existing delivery-scoped exception record family.
As written, the design's own rules make a waived delivery **unable to close**
(R1-F001). Ranked by consequence: the close-revalidation conflict (R1-F001); the
unexamined #1755 precedent plus concrete store incompatibilities (R1-F002); a
circular digest derivation (R1-F003); the `waivableWithDisclosure` ordinary-path
bypass (R1-F004); one requirement ID covering two independent evidence sources
(R1-F005); and downstream exact-version consumers that cannot read the new
records (R1-F006).

I also independently reached two findings that the prior review round
(`review-5c1846703362de090f3843bf4a5f75e8`, turn 2) already raised and that
remain open against this unchanged artifact: `resolvedTrunkSha` in the scope
preimage is a volatile field (that round's R2-F001), and a second active
delivery exception collides with `evaluator.mjs:110-126`'s single-active-record
model (that round's R2-F003). I confirm both, including the conclusion that
"resolved trunk ref identity" should be the `resolveTrunkRef` **name**, not a
SHA. I am not re-filing them as new findings; R1-F001 and R1-F002 below depend
on the first and R1-F002 interacts with the second, so both must be fixed
regardless.

## Findings

### R1-F001 — `close` re-verifies and requires a byte-identical receipt, so single-use burn plus mandatory expiry plus effect-time revalidation makes a waived delivery unclosable

This is the finding I would fix first, because it breaks the feature's end state
rather than an edge case.

Three rules in the artifact are individually reasonable and jointly fatal:

- **Waiver Authority**: "The delivery resolver must record consumption before
  writing a terminal delivery receipt [...] A second completed delivery attempt
  using the same waiver must refuse as replayed even when every scope field still
  matches."
- **Waiver Authority**: "a single-use operation ID, with bounded expiry as an
  additional lifetime limit."
- **Command Surface**: "`deliver` and `close` re-read and revalidate at effect
  time."

Now the code they land in. `close` does not read the stored receipt and trust
it. `verifyCloseDeliveryReceipt` (`close-delivery-receipt.mjs:157-215`) re-runs
the **entire** delivery verification against live provider and Git evidence and
then requires the recomputed receipt to be byte-identical to the stored one:

```js
const verified = await verifyDeliveredPullRequest({ /* live pullRequest, stored intent */ });
if (
  canonicalRecordJson(buildDeliveryReceipt(verified.receiptInput)) !==
  canonicalRecordJson(receipt)
) {
  fail('fresh-receipt-mismatch');
}
```

For a waived delivery, the waived predicate still fails at close — that is the
whole point; the divergence is immutable. So `close` must consult the waiver
again. Under the artifact's rules, each of the following independently refuses:

1. **Consumed.** The burn ledger is keyed by `waiverRecordId`, `waiverRevision`,
   `operationId`, repository, issue, and accepted head SHA — every one of which
   is identical at close time. The artifact's retry escape hatch is explicitly
   unavailable here: it permits resuming only when "no terminal receipt exists,"
   and at close a terminal receipt is exactly what does exist.
2. **Expired.** Bounded expiry is mandatory. `resolveWorkflowExceptionRecords`
   (`exception-record.mjs:348-350`) returns `status: 'expired'` with
   `active: null` once `now >= expiresAt`. Any delivered-but-not-yet-closed issue
   whose waiver expires can never close, and the expiry window is a property of
   the approval, not of how long review takes.
3. **Stale scope.** With `resolvedTrunkSha` in the preimage, recomputing
   `waiverScopeDigest` at close will mismatch after any unrelated trunk merge.

Concrete failure for the artifact's own reproduction case: operator records a
`delivery.verification.merge-method` waiver for #1784/PR #1785 and runs
`deliver`; the burn is written, the waived receipt v4 is written, `deliver`
succeeds. Operator then runs `close`. `verifyCloseDeliveryReceipt` re-verifies,
`delivery.verification.merge-method` fails again, the resolver re-reads the
waiver, finds `operationId` already consumed with a terminal receipt present, and
refuses as replayed. #1784 is now stranded *after* a successful waived delivery —
the same stranding the design exists to eliminate, moved one step later and made
harder to diagnose.

The codebase already contains the correct pattern, and the artifact does not use
it. #1755's re-verification path, `verifyWaivedEvidence`
(`delivery-verification.mjs:521-565`), is deliberately **time-independent**: it
takes no `now`, never calls `resolveActiveDeliveryAttributionException`, and
instead validates the authorization record's structure and its exact agreement
with fields *pinned into the intent* at authorization time —
`intent.exceptionRecordId`, `intent.proposalDigest`, `intent.operationId`,
`intent.sourceDigest`, `intent.mappings`, `intent.attributionTokens` — refusing
if `exceptionRecord.kind === 'revocation'`. Even the expiry check in that family
is write-time only (`delivery-attribution-exception-record.mjs:157-158` compares
`createdAt` against `expiresAt`, not against `now`). That is precisely what makes
a #1755 waived delivery survive `close`'s byte-identical recomputation.

The artifact is already half-way to this pattern: intent v3 carries
`waiverRecordId`, `waiverRevision`, `waiverOperationId`, `waiverReasonDigest`,
and `waiverScopeDigest`, which are exactly the pinning fields. What is missing is
the statement that re-verification validates against the **pinned** authorization
deterministically, and that liveness/expiry/burn are evaluated **once**, at the
authorizing `deliver`, not again at `close`.

There is a second, quieter instance of the same problem in the same function.
`close-delivery-receipt.mjs:195` passes:

```js
mergeMethod: pullRequest.mergeMethod ?? intent.mergeMethod,
```

So at close, provider-reported merge method is **coerced to the intent** when the
provider omits it. Deliver and close therefore do not necessarily observe the
same merge-method evidence. Any waived-receipt field derived from the observation
(`observedMergeMethod`, `observedFailureCategory`) must be reproducible under
both, or close fails `fresh-receipt-mismatch` for reasons unrelated to the
waiver.

### R1-F002 — The design never evaluates #1755's existing delivery-scoped exception record family, and the workflow-exception store it chose instead cannot hold a second exception

**Decision** says "Extend the existing workflow-exception mechanism," and
**Waiver Authority** then specifies `aitm.workflow-exception/v2` with a
`deliveryScope` object, a `waiverScopeDigest`, exact-scope matching, bounded
expiry, a single-use operation ID, and host-verified-user-message authority.

That description is a near-exact restatement of a record family #1755 already
shipped. `aitm.delivery-attribution-exception/v1`
(`delivery-attribution-exception-record.mjs`) already provides, for one delivery
scope:

- scope binding to `repository`, `issueNumber`, `prNumber`, `baseRef`, `headRef`,
  `headSha`, `sourceDigest`, `operationId` (`PROPOSAL_KEYS`, lines 16-28), with
  exact-match enforcement in `scopeMatches` (lines 188-201) and a hard
  `fail('scope')` on mismatch at parse time (line 235);
- a canonical digest over the scope (`proposalDigest`, lines 139-144, via
  `canonicalRecordJson`);
- `authority.level !== 'host-verified-user-message'` → `fail('authority')`
  (line 164);
- mandatory bounded expiry — `instant(proposal.expiresAt)` (line 112) rejects
  `null`;
- a grant/revision/revocation chain with single-root, single-child, monotonic
  ordering, and inactive-on-expiry resolution
  (`resolveActiveDeliveryAttributionException`, lines 247-311);
- comment tamper detection: edited-comment refusal, canonical-bytes equality,
  and render-round-trip equality (lines 205-243);
- a bounded comment-size guard (`upperBoundDeliveryAttributionCommentBytes`).

The artifact mentions #1755 three times — the `waived-*` guardrail categories,
`attributionDisposition: "waived"`, and "do not reuse that field" — all about the
**receipt**. It never mentions this record family, and neither
`delivery-attribution-exception-record.mjs` nor
`delivery-attribution-exception.mjs` appears in **Implementation Notes**. So the
design's central architectural choice is made without comparing against the
closest existing precedent, which already solves what **Risks** names as "the
main engineering risk" ("a too-broad scope identity [...] must bind to the
delivery operation details, not just the issue body").

This matters because the chosen host is a poor fit in three concrete ways:

1. **One exception chain per issue.** `resolveWorkflowExceptionRecords`
   (`exception-record.mjs:305-308`) returns `invalid('ambiguous-active-records')`
   when `exceptionIds.size !== 1`, and `executeWorkflowExceptionWrite` with
   `action: 'record'` returns `blocked` / `revision-required` whenever a head
   already exists (`exception-store.mjs:117-120`). An issue that already carries
   any active workflow exception — a `no-plan/v1` or `no-review/v1` bundle — can
   therefore not be given a delivery waiver at all, and forcing one in breaks the
   pre-existing exception too. The only mechanism the store offers is `revise`,
   which merges the planning waiver and the delivery waiver into a single record,
   directly contradicting **Waiver Authority**'s "the safer implementation path is
   one record per named invariant." (The prior round raised the evaluator half of
   this as R2-F003; the store half is the harder constraint, because it blocks the
   *write*, not just the evaluation.)
2. **Incompatible `operationId` types.** #1755's `operationId` is a ULID
   (`ID_RE`, `delivery-attribution-exception-record.mjs:10,100`). Workflow
   exception's is `sha256:<64-hex>` (`HASH_RE`, `exception-record.mjs:157`) and is
   content-derived. The artifact's preimage shows `"operationId": "sha256:<digest>"`.
   A single "shared delivery-exception authority contract" spanning #1787 and
   #1783 cannot have two incompatible operation-id types without saying which one
   it is.
3. **Expiry optionality inverts.** `exception-record.mjs:175-182` explicitly
   permits `payload.expiresAt === null`. The artifact requires bounded expiry for
   delivery waivers but never says the v2 delivery path must reject `null`, so the
   v1 validator would accept an immortal delivery waiver.

I am not asserting that generalizing #1755's family is the right answer — it has
its own cost, notably that it is PR-shaped (`prNumber` is required and positive),
which #1783's no-PR lane cannot satisfy without a version bump. What I am
asserting is that a design whose stated purpose is "avoid duplicate backdoors"
and "one delivery-exception authority architecture" cannot leave the existing
delivery-exception authority record family unexamined.

### R1-F003 — The scope preimage and the store-derived `operationId` are circularly defined

**Waiver Authority** places `operationId` **inside** the canonical delivery scope
preimage whose digest is `waiverScopeDigest`:

```json
{
  "schema": "aitm.delivery-exception-scope/v1",
  ...
  "operationId": "sha256:<digest>"
}
```

But `operationId` is not an input in this mechanism — `exception-store.mjs:146-147`
derives it from the entire desired policy:

```js
const revision = head === null ? 1 : head.payload.revision + 1;
const opId = operationId({ action, repository, issue, revision, status, ...policy });
```

where `policy` (`desiredPolicy`, lines 29-39) spans `exceptionId`,
`scopeIdentity`, `requirementIds`, `constraints`, `reason`, `authorization`, and
`expiresAt`. If the v2 `deliveryScope` — which contains `operationId` and
`waiverScopeDigest` — is part of the policy, then `opId` depends on itself. If it
is excluded from the policy, then `opId` no longer covers the delivery scope, and
two records differing only in delivery scope collide on `operationId`, which the
store treats as the *same* write (`exception-store.mjs:148-160` returns
`existing` for a matching `operationId`).

There is a second-order problem in the same code path: this `operationId` is a
**write-idempotency / transport-reconciliation** token, not a consumption token.
`reconcileOperation` (lines 57-66) deliberately re-finds a record by
`operationId` after an ambiguous append so a retried write is not duplicated, and
a `revise` deterministically produces a *new* `operationId`. Attaching "single
use, burn before terminal receipt" semantics to this field overloads a value
whose existing contract is "reused across retries of the same write." The
delivery burn ledger needs its own identifier, minted independently of the store's
content digest.

### R1-F004 — `waivableWithDisclosure` is not specified as excluded from the ordinary waiver path, and the current code would honor it there

**Decision** item 2 and **Requirement Model** describe
`waivableWithDisclosure: true` as "a stricter per-requirement catalog capability
than ordinary waivable requirements," and **Tests** asks that catalog validation
accept the new IDs "through the `waivable-with-disclosure` path." Neither states
the necessary negative: that the **ordinary** path must continue to refuse them.

Today there is exactly one gate and one consumer, and both are permissive by
construction:

- `validateWaiverIds` (`catalog.mjs:75-89`) throws only when
  `!requirement.waivable`. A new ID declared `waivable: true` alongside
  `waivableWithDisclosure: true` passes it.
- `evaluateWorkflowPolicy` (`evaluator.mjs:136-147`) then returns
  `POLICY_OUTCOMES.WAIVED` for any baseline requirement present in the record's
  `requirementIds`, having validated only repository, issue number, body-derived
  `scopeIdentity`, expiry, and authority presence (`validateRecord`, lines 19-52).
  It knows nothing of PR number, accepted head SHA, base ref, or
  `waiverScopeDigest`.

Concrete failure: an implementer writes
`item('delivery.verification.merge-method', 'delivery-pr-verifier', true)` and
adds the disclosure flag as an additional property — a natural reading of
"individually marked `waivableWithDisclosure: true`". A plain
`workflow-exception record` naming that ID in `requirementIds` now validates, and
any consumer that routes the ID through `evaluateWorkflowPolicy` gets `waived`
with **no** delivery scope binding whatsoever. Every protection in **Waiver
Authority** — PR number, accepted head, base ref, operation, disclosure receipt —
is bypassed, and the bypass is a one-word diff that no test in the artifact's
list would catch, because the listed catalog test asserts the disclosure path
accepts these IDs and that the ten legacy IDs stay non-waivable, not that the
ordinary path rejects the new ones.

The artifact needs to state the mechanism, not the adjective: new IDs are
`waivable: false` plus `waivableWithDisclosure: true`; `validateWaiverIds`
continues to refuse them; `evaluateWorkflowPolicy` can never emit `waived` for a
disclosure-only ID; only the delivery resolver may.

### R1-F005 — `delivery.verification.merge-method` covers two independent throw sites with different evidence sources, so one waiver can mask their disagreement

The table maps five categories to one ID. Two of those categories are
`merge-method`, which is thrown from two structurally different places:

- `assertMergedPullRequest` (`delivery-verification.mjs:190-201`) compares
  **provider-reported metadata** `pullRequest.mergeMethod` against
  `intent.mergeMethod`.
- The topology path (`delivery-verification.mjs:663-664`) compares the
  **Git-derived** classification from `classifyMergeMethod` (parent count and
  parent identity, lines 207-231) against `intent.mergeMethod`.

These are independent evidence sources, and their agreement with each other is a
meaningful integrity signal: provider metadata saying `squash` while the commit
has two parents whose second is the accepted head means one of the two is wrong
or tampered with. A single waiver on `delivery.verification.merge-method` waives
both comparisons, so that disagreement is absorbed silently, and the receipt's
`observedFailureCategory` records only whichever site threw first — the provider
one, since it runs earlier.

This also makes one of the artifact's own #1784 guarantees unenforceable as
stated. **Verification Flow** promises the verifier "must still prove [...] the
observed topology is merge, not squash." Under the named ID, the predicate that
performs that proof is inside the waiver's blast radius. Topology is still
*observed* and can still be *recorded*, but nothing in the design keeps it
*required* to agree with the provider's account of the same merge.

**Requirement Model** anticipates the shape of the fix ("Implementation may split
IDs more finely if tests show a predicate needs a separate operator decision"),
but leaves it to implementation discretion. Given that merge-method is the single
motivating case for the entire issue, the split belongs in the design.

### R1-F006 — Two recovery consumers pin intent v1 and receipt v1 exactly, so a waived delivery cannot be reopened or recovered

**Records and Schemas** says existing versions "remain readable," and **Tests**
asks that "existing external recovery fixtures remain unchanged." Both are
satisfiable while leaving the new records unreadable by the recovery lanes.

`reopened-close-recovery.mjs:309-317` requires exact equality:

```js
intent.schema !== 'aitm.delivery-intent/v1' ||
receipt.schema !== 'aitm.delivery-receipt/v1'
```

`false-delivery-close-recovery.mjs:147-148` does the same, and line 124 pins
`aitm.no-commit-delivery/v1`.

Concrete failure: #1784 closes on a waived intent v3 / receipt v4. It is later
reopened. `validateDeliveryBundle` refuses the bundle because the schemas are v3
and v4, so the reopened-close recovery lane cannot certify the historical
delivery — the issue is stranded again, by the same class of exact-version pin
that the design is otherwise careful about. Neither module appears in
**Implementation Notes**.

I note this pin already excludes intent v2 and receipts v2/v3, so it is a
pre-existing pattern rather than something #1787 introduces. But #1787 is the
issue that adds the versions, and a design that lists eleven touch points should
say whether these two lanes are taught the new shapes, deliberately left pinned,
or tracked separately.

## Required changes

1. **R1-F001** — Specify that waived-delivery re-verification is deterministic and
   time-independent, validating the **pinned** authorization recorded in intent v3
   (`waiverRecordId`, `waiverRevision`, `waiverOperationId`, `waiverScopeDigest`,
   `waiverReasonDigest`) rather than re-resolving liveness. State that expiry and
   single-use consumption are evaluated exactly once, at the authorizing
   `deliver`, and that `close` must not treat an already-burned waiver backing an
   existing terminal receipt as a replay. Cite `verifyWaivedEvidence`
   (`delivery-verification.mjs:521-565`) as the precedent. State that every field
   the waived receipt adds must be byte-reproducible by
   `verifyCloseDeliveryReceipt` (`close-delivery-receipt.mjs:207-213`), and
   address the `pullRequest.mergeMethod ?? intent.mergeMethod` coercion at
   `close-delivery-receipt.mjs:195` so deliver and close observe merge method
   identically. Add a test that a waived delivery closes successfully after its
   waiver's `expiresAt` has passed and after the burn is recorded.
2. **R1-F002** — Add an explicit comparison against
   `aitm.delivery-attribution-exception/v1`
   (`delivery-attribution-exception-record.mjs`) and justify hosting delivery
   waivers on `aitm.workflow-exception/v2` instead of generalizing that family.
   The justification must resolve: the one-chain-per-issue write constraint
   (`exception-store.mjs:117-120`, `exception-record.mjs:305-308`) for an issue
   that already holds a planning or review exception; which `operationId` type the
   shared contract uses (ULID versus `sha256:` content digest); and that
   `expiresAt: null`, which `exception-record.mjs:175-182` permits, is invalid for
   delivery-scope records.
3. **R1-F003** — Remove `operationId` from the canonical scope preimage or define
   the derivation order that breaks the cycle with
   `exception-store.mjs:146-147`, and state whether `deliveryScope` participates
   in the store's `operationId` digest. Introduce a distinct identifier for the
   single-use consumption ledger rather than reusing the store's write-idempotency
   `operationId`, whose existing contract is reuse across retries
   (`exception-store.mjs:57-66,148-160`).
4. **R1-F004** — State the mechanism for `waivableWithDisclosure`: new IDs are
   `waivable: false`, `validateWaiverIds` (`catalog.mjs:75-89`) continues to
   refuse them, and `evaluateWorkflowPolicy` (`evaluator.mjs:136-147`) can never
   emit `waived` for a disclosure-only ID — only the delivery resolver may. Add a
   test that an ordinary `workflow-exception record` naming a
   `delivery.verification.*` ID is refused.
5. **R1-F005** — Split `delivery.verification.merge-method` into the
   provider-metadata equality predicate
   (`delivery-verification.mjs:190-201`) and the Git-topology equality predicate
   (`delivery-verification.mjs:663-664`), or state that when either is waived the
   other's observation must still be recorded and the two observations must agree,
   with disagreement always refusing. Reconcile this with the **Verification
   Flow** promise that the #1784 verifier "must still prove [...] the observed
   topology is merge, not squash."
6. **R1-F006** — State the disposition of `reopened-close-recovery.mjs:309-317`
   and `false-delivery-close-recovery.mjs:147-148`, which pin intent v1 and
   receipt v1 exactly and therefore cannot read a waived delivery: taught the new
   shapes in this issue, deliberately left pinned with the consequence stated, or
   tracked as a follow-on. Add the modules to **Implementation Notes** if the
   first.

## Optional suggestions

1. `computeScopeIdentity` requires all three of `## User Story`, `## Scope`, and
   `## Acceptance Criteria` to be present and non-empty, throwing
   `workflow-policy:scope-sections` otherwise (`scope-identity.mjs:41-46`).
   Because the design mandates the body-derived `scopeIdentity` in addition to
   `waiverScopeDigest`, any issue missing one of those sections — web-authored and
   legacy issues most of all — can never carry a delivery waiver, and the failure
   presents as `indeterminate`, which the design correctly makes fail-closed and
   terminal. That is the permanent-strand outcome the issue exists to remove,
   reached by a different route. Worth naming the remediation. (#1784 itself has
   all three sections, so the motivating case is unaffected.)
2. `VERIFICATION_DIAGNOSTICS` (`delivery-verification.mjs:74-88`) is already a
   category-keyed table of `{ predicate, recoveryAction }`, currently populated
   for three categories. Extending it with `requirementId` gives one table instead
   of two parallel maps. One caution: the `DeliveryVerificationError` constructor
   (lines 90-100) applies a **default** for unlisted categories
   (`predicate: category`). A defaulted `requirementId` would defeat the coverage
   test the design asks for, so the requirement-ID lookup must be strict even
   though the sibling fields are not.
3. The burn is specified as a durable write, and durable writes here are GitHub
   comments, so an ambiguous append is expected rather than exceptional — the
   store already models exactly this with `transport-ambiguity` and
   `readback-mismatch` (`exception-store.mjs:180-194`). Combined with
   "`indeterminate` [...] must refuse and must not write a delivery receipt," an
   ambiguous burn write consumes the operator's one-shot authorization while
   refusing the delivery. Worth stating whether the human must re-approve, or
   whether an ambiguous burn is reconciled by read-back before it counts as
   consumed.
4. **Records and Schemas** requires renderers to "visibly distinguish" four
   outcomes but does not name where. `close.mjs:4702` is the text that currently
   advertises `--reconcile-merge-method`, and **Command Surface** already calls
   for narrowing it; pointing the renderer requirement at the same site would keep
   the two edits together.
5. Prior-round finding R2-F001 (`resolvedTrunkSha` volatility) and R2-F003
   (single-active-record collision) are unresolved against this artifact revision.
   I reached both independently and agree with both, including that "resolved
   trunk ref identity" should be the `resolveTrunkRef` name (`origin/trunk` by
   default, `trunk-ref.mjs:98-110`) rather than a 40-hex SHA. R1-F001 depends on
   the first being fixed: with a volatile field in the preimage, close-time
   revalidation of `waiverScopeDigest` fails for reasons unrelated to the waiver.

## Decision

revisions-requested
