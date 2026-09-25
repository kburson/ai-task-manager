<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-5c1846703362de090f3843bf4a5f75e8"
role: "reviewer"
turn: 2
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
  session_fingerprint: "sha256:1bf95f25d0438754a0aab1190a195d819a88179354ae4c65e9aefc50a6026d6d"
  identity_source: "declared"
started_at: "2026-09-24T20:10:06.614Z"
submitted_at: "2026-09-24T20:51:46.961Z"
finding_ids: ["R2-F001","R2-F002","R2-F003","R2-F004"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

All five turn-1 findings are genuinely resolved, and the resolutions are
substantive rather than cosmetic. Verified against the revised artifact at
`21a07908`:

- **R1-F001 — resolved.** **Decision** item 2 now reads "Do not open an existing
  family as waivable," **Requirement Model** enumerates all ten existing hard
  `delivery-invariant` IDs as staying non-waivable, the new IDs move to a
  separate `delivery-pr-verifier` family with per-requirement marking, and
  **Tests** asserts the ten stay non-waivable. This is exactly the right shape.
- **R1-F002 — resolved.** The design now requires `aitm.workflow-exception/v2`,
  states plainly why v1 cannot be used (closed payload key set, body-only
  `scopeIdentity`), gives a concrete canonical preimage, and specifies that
  `waiverScopeDigest` *supplements* rather than replaces `scopeIdentity`. The
  supplement-not-replace choice is the correct one.
- **R1-F003 — resolved.** Codex-only is now an explicit, documented decision with
  fail-closed behavior on unsupported hosts and a test, rather than an unexamined
  "where the platform supports it." I agree with choosing the limitation over
  lowering the verification level, even though it means the waiver cannot be
  minted from a non-Codex session driving `deliver`.
- **R1-F004 — resolved.** Single-use is now correctly framed as new work, with a
  named burn point, a retry-after-burn rule, ledger keying, and a replay test.
  The burn point ("after all non-waived delivery evidence has been revalidated
  and immediately before the waived receipt is written") is well chosen.
- **R1-F005 — resolved.** `indeterminate` is now step 4 of **Verification Flow**,
  is explicitly fail-closed, writes no receipt, must be distinguishable from
  `missing`, and has a test.

The optional suggestions were also taken up where they touched blocking text:
the `delivery.verification.*` prefix, the `CONSUMER_DECLARATIONS` pointer, and
the vocabulary alignment with `POLICY_OUTCOMES`.

I am not accepting yet, because the revision introduces two new concrete defects
and leaves two gaps that the newly-specified mechanisms expose. None is
architectural; all four are localized text changes. Ranked by consequence:
a volatile field inside the new scope preimage that would make waivers expire
whenever anything else lands on trunk (R2-F001); the one requirement ID that
must never be waivable sitting inside the family the same section declares
uniformly waivable (R2-F002); an unaddressed collision between the new
delivery exception and the evaluator's single-active-record model (R2-F003);
and **Scope** not having grown to cover the v2 schema and the consumption ledger
that this revision just added (R2-F004).

## Findings

### R2-F001 — `resolvedTrunkSha` in the scope preimage makes every waiver expire on unrelated trunk activity

**Waiver Authority** defines the canonical delivery scope preimage to include:

```json
"baseRef": "trunk",
"resolvedTrunkSha": "<40-hex>",
```

and then rules that "The evaluator must require both the ordinary issue-body
`scopeIdentity` and the delivery-specific `waiverScopeDigest` to match current
facts."

`waiverScopeDigest` is the digest of the whole preimage, so matching it against
current facts means recomputing every field from live state, including
`resolvedTrunkSha`. Trunk tip is not a property of the delivery being waived —
it advances whenever any other issue merges.

Concrete failure: an operator prepares and records a
`delivery.verification.merge-method` waiver for #1784/PR #1785 at 10:00, when
`origin/trunk` is at `abc123`. An unrelated PR merges at 10:05, moving
`origin/trunk` to `def456`. At 10:10 the operator runs `deliver`; the evaluator
recomputes the preimage with `def456`, `waiverScopeDigest` mismatches, and the
waiver is refused as stale scope. Nothing about the waived delivery changed. On
an active repository this makes the feature unusable in practice, and the
failure presents as a confusing "stale-scope" refusal rather than anything the
operator can act on.

This looks like a translation error rather than an intended design. My turn-1
text and the surviving prose in **Waiver Authority** both say "target/base ref
and resolved trunk **ref identity**," and **Verification Flow** step 3 says
"trunk/ref **target**." A resolved trunk ref identity in this codebase is a ref
name — `resolveTrunkRef`, default `origin/trunk` — not a SHA. The preimage
rendered it as a 40-hex SHA, converting a stable identifier into a volatile one.

The invariant the waiver actually needs to bind is that the *merge commit* is
reachable from the trunk target, which `delivery.verification.trunk-reachability`
already owns as a live predicate and which is monotonic once true.

### R2-F002 — The one never-waivable guardrail ID is placed inside the family declared uniformly waivable

**Requirement Model** states the family rule:

> The new PR-verifier IDs must live in a separate family, for example
> `delivery-pr-verifier`, and must be individually marked
> `waivableWithDisclosure: true`.

The table that defines those new PR-verifier IDs includes a row mapping
`waived-evidence`, `waived-inventory`, and `waived-authority` to
`delivery.verification.attribution-waiver-authority`, annotated "this ID is
never itself waivable," and the following paragraph repeats that it "is a
guardrail ID, not an escape hatch."

So the same section says every member of the new family is
`waivableWithDisclosure: true` and that one named member of it must never be
waivable. An implementer applying the family rule uniformly — which is what the
rule tells them to do — produces a catalog in which the self-checks guarding
waiver validity are themselves waivable. That is the R1-F001 failure mode
reproduced at single-ID scale, and it is the worst possible ID to get wrong,
because `validateWaiverIds` (`catalog.mjs:75-89`) consults only the per-item
flag and would then admit a waiver of the checks that establish whether waivers
are well formed.

Related and unresolved in the same paragraph: the design says #1787 "**may** add
a separate non-waivable guardrail ID for generic delivery-waiver self-checks if
implementation needs to distinguish failure messages by waiver kind." That
permissive framing no longer fits, because this revision made generic-waiver
self-checks mandatory — **Waiver Authority** now requires refusal for a
"replayed" waiver and defines burn-record-mismatch behavior on retry. Those
failures need an addressable requirement ID under the same rule that every
verifier refusal gets one.

### R2-F003 — The new delivery exception collides with the evaluator's single-active-record model

The design adds a second, differently-shaped exception kind that can be active on
an issue, but never says how it coexists with an ordinary workflow exception on
the same issue.

`workflow-policy/evaluator.mjs:110-126` permits exactly one active record. When
`activeRecords.length > 1` it pushes an `ambiguous-active-records` conflict,
never populates `waiverIds`, and the conflict flows into `blockers`, so
`status` becomes `blocked`.

Concrete failure: an issue carries an active `no-review/v1` bundle exception
(`review.design`, `review.implementation`, `review.peer`,
`review.semantic-resident`, plus `approval.human-completion`) recorded during
planning. At delivery a `delivery.verification.merge-method` waiver is recorded
as a second active record. The evaluator now reports
`ambiguous-active-records` — which blocks not just the delivery waiver but the
already-granted review exception as well, taking the issue from "two valid
authorizations" to "no valid authorizations."

The design needs to state which model it intends: delivery exceptions are
partitioned from ordinary ones and evaluated separately (most likely given they
are a distinct schema with a distinct discriminator); or the single-record rule
is relaxed to one active record *per exception kind*; or delivery scope must be
folded into a superseding revision of the existing record. **Waiver Authority**
already says "A record with multiple delivery requirement IDs is invalid unless
[...] the safer implementation path is one record per named invariant" — which
makes multiple concurrent active records the *expected* steady state for an
issue needing two waivers, so this cannot be left implicit.

### R2-F004 — `Scope` was not updated for the work this revision added

**Scope** is unchanged from turn 1. Its in-scope bullets still describe stable
catalog IDs, workflow-exception validation for delivery invariants, the shared
authority contract, delivery intent and receipt schemas, read-only and
effect-time behavior, and focused fixtures.

The revision added three pieces of work that no bullet covers, and that the
author's own response describes as new: a new record schema version
(`aitm.workflow-exception/v2`, with v1/v2 readback across `exception-store.mjs`
and `snapshot.mjs`); a durable single-use consumption ledger with retry-safe burn
semantics; and Codex-only authority with fail-closed unsupported-host refusal.

**Implementation Notes** lists all three, but implementation notes are advisory
touch points — **Scope** is the section a plan and an estimate are built from.
"Workflow-exception validation for delivery invariants" reads as validation
logic against an existing schema, which materially understates a new record
version plus a new durable ledger. Since the issue needs `Estimate` and `Size`
set before work starts, an under-stated scope section has a direct downstream
cost.

## Required changes

1. **R2-F001** — Replace `resolvedTrunkSha` in the canonical preimage with the
   stable trunk ref identity (the `resolveTrunkRef` name, e.g. `origin/trunk`),
   and if a commit-level binding is wanted, bind the *merge commit* SHA rather
   than the trunk tip. State explicitly that no field of the preimage may be a
   value that changes through activity unrelated to the waived delivery, and add
   a test that a waiver stays valid after unrelated commits land on trunk.
2. **R2-F002** — Move `delivery.verification.attribution-waiver-authority` (and
   any generic-waiver guardrail ID) out of the `delivery-pr-verifier` family, or
   state an explicit per-ID exception to the family rule, so the "must be
   individually marked `waivableWithDisclosure: true`" sentence cannot be applied
   to it. Change the "may add a separate non-waivable guardrail ID" sentence to a
   requirement, since replay and burn-record-mismatch refusals are now mandatory
   and need an addressable ID.
3. **R2-F003** — Specify how a delivery exception record coexists with an
   ordinary active workflow exception on the same issue, given
   `evaluator.mjs:110-126` treats two active records as
   `ambiguous-active-records` and blocks. Say whether delivery records are
   partitioned from the ordinary active-record set, whether the constraint
   becomes one-active-per-exception-kind, or whether superseding revision is
   required, and add a test for an issue holding both a review-bundle exception
   and a delivery waiver.
4. **R2-F004** — Extend **Scope** to name the three newly added work items:
   `aitm.workflow-exception/v2` plus v1/v2 readback, the durable single-use
   consumption ledger with retry-safe burn semantics, and Codex-only authority
   with unsupported-host fail-closed refusal.

## Optional suggestions

1. Two stale uses of the retired `passed` vocabulary remain after the alignment
   to `satisfied` / `waived` / `missing` / `indeterminate`. **Implementation
   Notes** says close and action-decision consumers should "consume `passed`
   versus `waived`," and **Decision** item 4 says "Emit `waived`, not `passed`."
   Neither is load-bearing, but the first names a value an implementer will look
   for and not find.
2. The preimage is specified as a JSON literal whose digest must be reproducible
   across sessions, but the canonicalization is not named. This repo already has
   `scripts/task-tracker/lib/github-records/canonical-json.mjs`
   (`canonicalRecordJson`), which `exception-record.mjs` already uses for exactly
   this purpose. Citing it — and stating whether an absent `pullRequest` is
   `null` or omitted — removes a class of digest-mismatch bugs before they exist.
3. Worth considering whether every ID in the new family should be equally
   waivable. **Relationship to #1783** requires that for a waived delivery
   "every other PR delivery predicate still passes," and the #1784 walkthrough
   leans on that: the receipt's credibility comes from asserting the PR head is
   the accepted Test and Review SHA and the merge commit is trunk-reachable. If
   `delivery.verification.accepted-head` or
   `delivery.verification.intent-integrity` are themselves waivable, that
   surrounding evidence can be waived away and the disclosure becomes hollow.
   Marking those two non-waivable, or putting them behind an additional
   justification tier, would keep the waiver mechanism's own foundations intact.
   This is a judgment call and I would not block on it.
4. The focused suite filenames in **Tests** were not extended for the new
   behaviors. `delivery-waiver-authority.test.mjs` and
   `delivery-waiver-scope.test.mjs` can reasonably host the non-Codex refusal and
   consumed-replay cases, but naming where the consumption-ledger tests live
   would make the plan's first slice obvious.

## Decision

revisions-requested
