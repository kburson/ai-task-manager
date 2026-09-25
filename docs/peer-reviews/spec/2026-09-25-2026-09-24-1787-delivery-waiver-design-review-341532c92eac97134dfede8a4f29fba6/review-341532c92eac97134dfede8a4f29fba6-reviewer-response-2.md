<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-341532c92eac97134dfede8a4f29fba6"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-24-1787-delivery-waiver-design.md"
artifact_commit: "787428315484792900c7f7f735a336515a9dd83b"
artifact_blob: "5b9b76ccc484a66d9f13180971fd5422a19e3b6f"
artifact_digest: "sha256:44d60394559dbbfab9cac8e373101e6545185be60d8103c38215a5e8c4947aff"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:d0f549acc4823b1d05dab7c341cd134589222ad56e02a364c14624eb89b42d81"
  identity_source: "declared"
started_at: "2026-09-25T00:57:32.504Z"
submitted_at: "2026-09-25T01:18:15.386Z"
finding_ids: ["R2-F001","R2-F002","R2-F003"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Reviewed the revised artifact at `78742831` / blob `5b9b76cc` against my six
turn-1 findings, the author response, and live source.

All six turn-1 findings are genuinely resolved, and two of the resolutions are
better than what I asked for. Verified section by section:

- **R1-F001 — resolved.** The new **Consumption and Completed-Receipt
  Verification** subsection draws the right line: "`close` and historical
  recovery are verification of an existing terminal transaction, not another use
  of its grant," with "Do not re-resolve current expiry or reject the matching
  burn as replay" and "Later expiry, grant supersession/revocation, or an
  issue-body edit does not retroactively invalidate a completed receipt." The
  three independent close-time refusals I traced are each addressed by name. The
  complementary constraints are also right: "Every added receipt field must be
  reproducible byte-for-byte by `verifyCloseDeliveryReceipt`; retain its
  `canonicalRecordJson` equality check" and "No new receipt field may use
  close-time `now` or current grant liveness." The tampering carve-outs preserve
  the fail-closed direction, and the `mergeMethod ?? intent.mergeMethod` coercion
  removal for the v3/v4 path is specified. "Allocate the intent ID before
  constructing the burn; the burn binds that ID and never hashes a receipt that
  in turn hashes the burn" pre-empts a circularity I had not raised. The
  post-expiry / post-burn close fixture is the right proof.
- **R1-F002 — resolved.** **Record Family and Chain Boundaries** now compares
  against `aitm.delivery-attribution-exception/v1` explicitly, cites
  `verifyWaivedEvidence` as the deterministic-re-verification precedent, and
  gives a real reason for choosing workflow-exception v2 (catalog-named
  requirement decisions plus a no-PR scope for #1783) together with the reason
  generalizing #1755 is not free (its PR number, inventory, mappings, and tokens
  are mandatory — accurate; `PROPOSAL_KEYS` and `validateProposal`,
  `delivery-attribution-exception-record.mjs:16-28,97-136`). The partition
  contract answers the store constraint I raised and the earlier review's
  evaluator constraint with one mechanism, and `expiresAt: null` is now invalid
  for v2. Keeping #1755 migration out of scope is the right call.
- **R1-F003 — resolved.** **Identifiers and Derivation Order** breaks the cycle
  cleanly: ULID `deliveryOperationId` minted first, then `deliveryScope`, then
  `waiverScopeDigest`, then the policy, then the store digest, with "Neither the
  write `operationId` nor its digest is an input to `deliveryScope`." Separating
  the consumption identifier from the store's write-idempotency digest, and
  stating that a grant revision changes the write digest but does not reset
  consumption, is exactly the distinction that was missing.
- **R1-F004 — resolved.** "individually marked `waivable: false` and
  `waivableWithDisclosure: true`. These are mutually exclusive capabilities, not
  an extra flag layered on ordinary waivability," plus "`validateWaiverIds` must
  continue to refuse disclosure-only IDs, and `evaluateWorkflowPolicy` must never
  emit `waived` for one," plus the ordinary-path bypass-negative tests. That is
  the mechanism, not the adjective. (One consequence of this rule is unresolved —
  R2-F001 below.)
- **R1-F005 — resolved, and better than the split I proposed.** Moving
  `merge-method-observation`, `merge-method-evidence`, `merge-method-unknown`,
  `merge-method-unattributable`, and the new `merge-method-source-disagreement`
  into a non-waivable `delivery.verification.merge-method-evidence`, leaving
  `merge-method` alone as the single waivable equality, is a cleaner cut than
  splitting the waivable ID in two. The observation contract — validate provider
  metadata if present, independently derive Git topology, `null` is not an
  inference, disagreement refuses non-waivably, compare proven to authorized only
  after the guards pass — makes the #1784 promise ("the observed topology is
  merge, not squash") enforceable rather than aspirational, which was my actual
  objection. Pinning `providerMergeMethod` including explicit `null` closes the
  deliver/close observation asymmetry.
- **R1-F006 — resolved.** Explicit v3/v4 bundle support in both recovery modules,
  with "Do not replace their version pins with a permissive version range or a
  schema-name-only check" — the right instruction, since the pins are the
  integrity mechanism. The `requireDeliveryReceipt` addition is correctly
  targeted: `close-delivery-receipt.mjs:141` is `if (receipt.result !==
  'delivered') fail('malformed');`, so a `result: "waived"` receipt would be
  rejected there without it. Scoping out the pre-existing v2/v3 attribution
  exclusions is a defensible boundary.

The four findings carried over from the earlier review (`review-5c1846...`) are
also resolved: `resolvedTrunkRef` replaces the volatile SHA and is stated as "the
stable resolved ref name, not its current tip SHA"; `canonicalRecordJson` is
named as the canonicalization with explicit `null` for `pullRequest`; the
guardrail IDs move to a non-waivable `delivery-waiver-guardrail` family with
`delivery.verification.waiver-authority` made mandatory; and **Scope** now names
schema v2 with readback, partitioned writes, the consumption ledger, and
Codex-only fail-closed authority. All five of my optional suggestions were taken
up, including the actionable scope-sections refusal that correctly refuses to
"drop the body-scope check to accommodate legacy issues."

I am not accepting yet. The revision introduces one blocking defect and two
scoping gaps, all localized text changes rather than architecture. Ranked:
the R1-F004 capability rule collides with the v1 payload validator that v2
retains, making every v2 delivery record invalid as specified (R2-F001); the new
mandatory waiver guardrail has no stated throw site and so is not bound by the
coverage test the design relies on (R2-F002); and **Verification Flow** steps 2-3
still read as unconditional live expiry/revocation resolution, which is the
R1-F001 defect surviving in the numbered list an implementer will follow
(R2-F003).

Finding IDs below are turn-2 IDs of this review (`review-341532c9...`); they are
unrelated to the `R2-F00n` labels used by the earlier `review-5c1846...` round.

## Findings

### R2-F001 — Every `aitm.workflow-exception/v2` delivery record is invalid under the v1 payload validator the design says v2 retains

This is the one blocking item, and it is a direct consequence of the R1-F004 fix
meeting the envelope shape the design chose to keep.

Three statements in the revised artifact:

- **Waiver Authority**: "The v2 payload retains the v1 envelope shape and adds
  `deliveryScope`, `waiverScopeDigest`, and the required discriminator
  `scopeKind: "delivery"`."
- **Waiver Authority**: "Each v2 record must name exactly one requirement ID,
  identical to `deliveryScope.requirementId`."
- **Requirement Model**: eligible IDs are `waivable: false` plus
  `waivableWithDisclosure: true`, and "`validateWaiverIds` must continue to refuse
  disclosure-only IDs."

`validateWorkflowExceptionEnvelope` is the single validator for that payload
shape, and it is unconditional (`exception-record.mjs:163-171`):

```js
try {
  requirementIds = validateWaiverIds(payload.requirementIds);
  constraints = validateConstraints(payload.constraints);
} catch (error) {
  fail(error.message.replace(/^workflow-policy:/, 'policy-'));
}
if (requirementIds.length === 0 && constraints.length === 0) fail('empty-policy');
```

`PAYLOAD_KEYS` (`exception-record.mjs:22-34`) is enforced by exact-key match, so
`requirementIds` and `constraints` remain required keys on a v2 payload. Both
placements of the delivery requirement ID now fail:

1. **ID in `payload.requirementIds`.** `validateWaiverIds` (`catalog.mjs:75-89`)
   throws `non-waivable-requirement` for any ID with `waivable: false` — which is
   precisely what the design now mandates for
   `delivery.verification.merge-method`. The envelope validator converts that to
   `fail('policy-non-waivable-requirement:...')`. So the record cannot be created
   (`createWorkflowExceptionEnvelope` validates before returning,
   `exception-record.mjs:237`), cannot be read back (`reconcileOperation` →
   `resolveWorkflowExceptionRecords` → `validateWorkflowExceptionEnvelope`,
   `exception-record.mjs:298-304`), and cannot be projected
   (`toEvaluatorRecord`, line 242).
2. **ID only in `deliveryScope.requirementId`, with `requirementIds: []`.**
   `empty-policy` then fires unless `constraints` is non-empty. The only escape
   is putting a constraint on a delivery record — but the design also states
   "`evaluator.mjs` receives only the ordinary partition," so a deny constraint
   carried on a v2 delivery record would never be evaluated, silently discarding
   the one constraint that made the record valid. That contradicts "Existing deny
   constraints continue to apply to the operation regardless of delivery
   authorization."

Concrete failure: the operator runs `workflow-exception record` for
`delivery.verification.merge-method` on #1784.
`executeWorkflowExceptionWrite` builds the policy and calls
`createWorkflowExceptionEnvelope`, which refuses with
`workflow-exception:policy-non-waivable-requirement:delivery.verification.merge-method`
before any comment is appended. No waiver can ever be recorded, so the #1784
reproduction never reaches the waived receipt the design is built to produce.

**Implementation Notes** does say `exception-record.mjs` is touched "for
`aitm.workflow-exception/v2`, delivery-specific waiver validation," so a branch is
plausibly intended. But the design states the *rule* ("`validateWaiverIds` must
continue to refuse disclosure-only IDs") without naming the validator that
accepts them, and an implementer applying the stated rule to the stated payload
shape produces a dead end. This needs the positive half of the contract: which
validator admits the single disclosure ID for `scopeKind: "delivery"`, and how
the `empty-policy` check is satisfied.

### R2-F002 — The new mandatory waiver guardrail has no stated throw site, so the coverage test the design relies on does not bind it

**Requirement Model** introduces four new categories —
`delivery-waiver-authority`, `delivery-waiver-replay`,
`delivery-waiver-burn-mismatch`, `delivery-waiver-ambiguity` — mapped to
`delivery.verification.waiver-authority`, described as a "mandatory non-waivable
guardrail," and reinforced: "`delivery.verification.attribution-waiver-authority`
and `delivery.verification.waiver-authority` are mandatory guardrails, not escape
hatches."

The enforcement the design leans on is scoped to one module and one function:

> It must not leave a `delivery-verification:*` category without a catalog ID. A
> coverage test should fail when a new `verificationError(...)` category lacks a
> requirement mapping.

`verificationError` is local to `delivery-verification.mjs:112-114`, and
`DeliveryVerificationError` hard-codes the `delivery-verification:` message prefix
(`delivery-verification.mjs:100-109`). But the design places the waiver logic
elsewhere — "a new narrow delivery-exception authority resolver shared by PR
verifier waiver and local-trunk close authorization consumers" — and the
neighbouring modules throw their own prefixed types: `workflow-exception:`
(`exception-record.mjs:49-51`), `workflow-policy:` (`catalog.mjs:65,81`),
`delivery-attribution-exception-record:`
(`delivery-attribution-exception-record.mjs:46-48`).

Two concrete consequences if the resolver raises these four conditions with its
own error type:

1. The mandatory coverage test passes while the mandatory guardrail is
   unimplemented, because the test enumerates `verificationError(...)` call sites
   and these four are not among them. The design's "every category has an
   addressable requirement ID" invariant then holds only for the categories that
   never needed the new ID.
2. Operator output diverges from the requirement the design sets for
   `indeterminate`: "must be distinguishable in operator output, record
   projection, and close explanation." A `delivery-waiver-ambiguity` surfacing as
   `workflow-policy:...` rather than `delivery-verification:...` is
   distinguishable by accident of module, not by design, and the close
   diagnostic in `close.mjs` that the revision now points at this flow would have
   to pattern-match two prefixes.

`merge-method-source-disagreement` does not have this problem — it is plainly a
`delivery-verification.mjs` comparison. The four waiver-authority categories are
the ones needing placement.

### R2-F003 — Verification Flow steps 2-3 still specify unconditional live expiry and revocation resolution

The R1-F001 fix is stated authoritatively in **Consumption and Completed-Receipt
Verification** ("Do not re-resolve current expiry or reject the matching burn as
replay") and in **Command Surface** ("`close` re-reads pinned historical
authority and live delivery facts without consuming the waiver again"). The
numbered procedure an implementer will actually follow was not updated to match:

> 2. load the current workflow-exception decision for the issue;
> 3. validate delivery scope against the live PR, intent, accepted SHA, base ref,
>    trunk/ref target, operation, expiry, revocation, and reason;

Neither step carries an initial-authorization qualifier. The only scoping sentence
in the list is at the end of step 7 — "Completed-receipt verification uses the
pinned-authority path above and performs neither step's writes" — which excludes
the *writes* of steps 6-7 and says nothing about steps 2-3. An implementer
following the list for close-time re-verification loads the current decision and
validates current expiry and revocation, which reintroduces exactly the
unclosable-delivery failure of R1-F001: `resolveWorkflowExceptionRecords` returns
`status: 'expired'` with `active: null` once `now >= expiresAt`
(`exception-record.mjs:348-350`), and expiry is mandatory for v2.

This is a text-scoping defect, not a design defect — the correct rule is already
in the artifact twice. But it sits in the most-followed section, and the earlier
version of this same ambiguity is what produced the blocking finding last turn.

## Required changes

1. **R2-F001** — State how a `scopeKind: "delivery"` v2 payload satisfies
   `exception-record.mjs:163-171`: name the validator that admits exactly one
   `waivableWithDisclosure` ID equal to `deliveryScope.requirementId` (and where
   it sits relative to `validateWaiverIds`, which must keep refusing those IDs on
   the ordinary path), state whether the ID appears in `payload.requirementIds`,
   in `deliveryScope` only, or both, and state how the `empty-policy` check is
   satisfied without relying on a `constraints` entry the partitioned evaluator
   would never see. If v2 delivery records must carry `constraints: []`, say so,
   and reconcile that with "Existing deny constraints continue to apply."
2. **R2-F002** — State where `delivery-waiver-authority`,
   `delivery-waiver-replay`, `delivery-waiver-burn-mismatch`, and
   `delivery-waiver-ambiguity` are raised, and extend the category-coverage
   requirement to that site so the mandatory
   `delivery.verification.waiver-authority` guardrail is actually bound by a
   test. If they are raised outside `delivery-verification.mjs:112-114`, state
   how they reach operator output with the distinguishability the design requires
   for `indeterminate`.
3. **R2-F003** — Scope **Verification Flow** steps 2-3 to initial authorization
   explicitly, and point completed-receipt verification at the pinned-authority
   path from the top of the list rather than only in step 7's closing sentence.

## Optional suggestions

1. `snapshot.mjs` is named for "separate ordinary/delivery projections," but the
   specific function that needs the partition is `authorityRevisions`
   (`snapshot.mjs:71-86`), which filters only on `recordType ===
   'workflow-exception'` and sorts by `payload.revision`. Unpartitioned, a v2
   delivery grant's revision 1 and the ordinary chain's revision 1 merge into one
   flat list with no kind label, and `dispositions` — keyed from the ordinary
   chain's `exception.history` — falls back to `payload.status` for delivery
   records. That list is rendered directly in the read-only report
   (`preflight.mjs:191-193`) and is an input to `snapshotHash`
   (`snapshot.mjs:205`), so recording a delivery waiver also changes the
   provenance hash of unrelated preflight advice. Low blast radius since
   `snapshotHash` is provenance rather than a gate (`preflight.mjs:112,188`), but
   this is the same disclosure surface the design elsewhere requires to "visibly
   distinguish" outcomes.
2. The delivery chain key is `(repository, issue, exceptionKind, requirementId,
   deliveryOperationId)`, and the design says `exception-record.mjs` applies "its
   one-chain rule within that partition." That rule is currently keyed on
   `payload.exceptionId` (`exception-record.mjs:305-308`, `exceptionIds.size !== 1`
   → `invalid('ambiguous-active-records')`), which the partition key does not
   mention. Worth stating whether `exceptionId` must be unique per partition,
   whether it may repeat across partitions, and whether it participates in
   partition identity — `desiredPolicy` includes it in the write digest
   (`exception-store.mjs:29-39,147`), so the answer affects idempotency.
3. `deliveryScope` binds `acceptedHeadSha`, `pullRequest`, `baseRef`, and
   `resolvedTrunkRef`, none of which are in the immutable chain key, so a revision
   may legitimately re-point a grant at a new accepted head under fresh approval.
   The design's burn rules already make that safe after consumption ("Changing the
   grant revision cannot make a consumed operation fresh"). Stating that this
   pre-burn re-scoping is intended, and that it requires a new human statement
   rather than inheriting the prior one, would remove an ambiguity a reader
   otherwise has to derive.

## Decision

revisions-requested
