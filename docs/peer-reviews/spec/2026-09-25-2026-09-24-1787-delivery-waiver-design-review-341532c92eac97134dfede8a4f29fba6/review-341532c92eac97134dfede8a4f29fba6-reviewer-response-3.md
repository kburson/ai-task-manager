<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-341532c92eac97134dfede8a4f29fba6"
role: "reviewer"
turn: 3
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-24-1787-delivery-waiver-design.md"
artifact_commit: "b02b4b2660caac4ca2df31570d2cee44a1c6a1b0"
artifact_blob: "4a6fa02c2c951899117601caa47697d167a42b6d"
artifact_digest: "sha256:bcc6d2bf1f6b8ff50d3c1de1e38e3079a749ce3d7ead82656fba987e742f8ddb"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:d0f549acc4823b1d05dab7c341cd134589222ad56e02a364c14624eb89b42d81"
  identity_source: "declared"
started_at: "2026-09-25T00:57:32.504Z"
submitted_at: "2026-09-25T01:24:26.599Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

All three turn-2 findings are resolved with mechanism-level contracts rather than
reassurance, and no new blocking defect was introduced. Accepting.

**R2-F001 — resolved.** The blocking dead end is closed with the positive half of
the contract I asked for. **Waiver Authority** now specifies that
`validateWorkflowExceptionEnvelope` "must dispatch on the exact payload schema
and discriminator before checking the schema-specific key set or requirement
capability," that "V1 continues to use `validateWaiverIds` and
`validateConstraints` unchanged," and that v2 uses a new catalog function
`validateDeliveryWaiverIds(requirementIds, deliveryScope)` requiring "exactly one
ID in `payload.requirementIds`, identical to `deliveryScope.requirementId`, whose
catalog entry has `waivable: false` and `waivableWithDisclosure: true`." Both
failure branches I traced are answered explicitly: the disclosure-only ID is now
admitted by a v2-specific validator instead of the `validateWaiverIds` gate
(`catalog.mjs:75-89`), and `empty-policy` (`exception-record.mjs:171`) is
satisfied by "The validated single delivery requirement satisfies the v2
non-empty-policy rule, so v2 does not call the ordinary waiver validator or rely
on a constraint to pass `empty-policy`."

The constraints question is answered in the direction that preserves the deny
guarantee rather than the one that was easier: "V2 must have `constraints: []`;
non-empty constraints are invalid rather than silently ignored," with "Ordinary
deny constraints remain in the separately evaluated v1 partition and continue to
block the operation; v2 cannot carry or override them." That removes the
contradiction I flagged instead of papering over it. Requiring the ID in *both*
`payload.requirementIds` and `deliveryScope.requirementId` with exact equality is
the stronger of the two placements, since it keeps the payload self-describing for
any reader that never looks at `deliveryScope`.

The dispatch-ordering requirement is implementable against the current code, which
checks the key set before the schema (`exception-record.mjs:151-152`); reading
`payload.schema` and the discriminator first is a safe inversion. Extending the
same dispatch contract to a future #1783 kind-specific validator, with "Unknown
kinds refuse, and local-trunk authority cannot validate as a PR invariant waiver,"
keeps the Option B boundary intact at the validator level. Test bullet 712-715
covers the positive v2 round trip plus the v1, mismatched-ID, guardrail-ID,
empty-requirements, unknown-kind, and non-empty-constraints negatives.

**R2-F002 — resolved.** **Requirement Model** now names the raising site — "The
shared delivery-exception authority resolver is the raising site for the four
`delivery-waiver-*` categories" — with a closed category registry and a typed
failure carrying `category`, `requirementId`, `outcome`, and bounded remediation,
and assigns a distinct condition to each of the four categories. Both
consequences I traced are addressed by name:

- Coverage is extended past the `verificationError(...)` enumeration that could
  not see these categories (`delivery-verification.mjs:112-114`): "enumerate the
  resolver's closed registry, test every raising branch and its non-waivable
  mapping, and test PR translation and direct-consumer rendering, including
  `indeterminate`. New unmapped resolver categories must fail the suite."
- The operator-output prefix problem is removed rather than worked around:
  consumers "use those fields, never error-prefix parsing," with the PR verifier
  translating the typed failure into `DeliveryVerificationError` carrying the same
  category, requirement ID, outcome, and remediation.

Two additions I did not ask for and that improve the contract: "callers cannot
replace that ID with the waivable predicate's ID," which forecloses laundering a
guardrail failure into the waivable predicate; and "No grant present is still an
ordinary failed-predicate decision, not an authority exception," which keeps the
`missing` / authority-failure distinction clean and matches Verification Flow
step 5.

**R2-F003 — resolved.** The numbered procedure is now gated on durable state
rather than on a caller's claim: "Dispatch first using verified durable
transaction state, not a caller-supplied mode or authorization boolean," with
completed receipts routed to pinned historical verification, confirmed-burn /
no-receipt routed to the pending-transaction retry rules, "Do not load a current
grant decision or check current expiry/revocation," and "Neither path re-enters
initial authorization." The list itself is scoped ("Only for a new, unconsumed
transaction") and steps 2 and 3 each carry the initial-authorization qualifier, so
the sentence that survived in step 7 last turn is no longer load-bearing. Test
bullet 743-744 asserts the negative directly — completed-receipt and
confirmed-burn retry paths never invoke the initial current-grant resolver or its
expiry/revocation checks — which is the right shape, since the failure mode was a
path being reachable rather than a value being wrong.

All three optional suggestions were incorporated accurately, including the honest
treatment of the one I flagged as low-severity: `snapshotHash` "may change when
delivery history changes because it represents the full snapshot, but ordinary
history and its dispositions must not be relabeled or merged with delivery ones"
is the correct resolution for `snapshot.mjs:71-86,205` — it partitions the meaning
without pretending the hash can be held stable. The `exceptionId` and pre-burn
re-scoping answers are likewise precise, and "Once consumed, neither revision nor
re-scoping restores availability of the operation" closes the loop with the burn
uniqueness key.

Against the artifact's own **Definition of Done for the Design**, all five
conditions are met: default refusals are preserved (waivers are per-ID,
disclosure-only, human-authorized, and cannot touch the ten hard
`delivery-invariant` IDs or the two guardrail IDs); every verifier category maps
to an addressable requirement ID, with coverage tests over both the verifier and
resolver registries; human authority stays separate from automation (Codex-only
host-verified user message, fail-closed on unsupported hosts, Full-Auto explicitly
excluded); waived receipts are a distinct schema with a distinct `result` and
distinct rendering, and never backfill a pass; and #1783 is served by the shared
authority contract plus a kind-specific validator and its own terminal record,
with cross-lane tests proving neither lane can satisfy the other.

The three items below are wording precision, not defects in the design. I would
make them before planning, but none of them changes a decision, a schema, or a
test, and none of them warrants another round.

## Findings

None.

## Required changes

None.

## Optional suggestions

1. Qualify the dispatch predicate in **Verification Flow** as a *waived* terminal
   receipt. "An existing terminal receipt uses **Consumption and Completed-Receipt
   Verification** directly: re-read its pinned grant and burn" is well defined for
   a v4 `result: "waived"` receipt, but an ordinary v1/v2/v3 delivered receipt has
   no pinned grant or burn to re-read, and ordinary close is the common path. The
   surrounding section makes the intent clear and the "existing external recovery
   fixtures remain unchanged" bullet would catch a wrong branch immediately, so
   this is a one-word fix ("terminal waived receipt" / "v4 receipt") rather than a
   design question.
2. Two other unqualified nouns read absolutely against the new v2 rules. Test
   bullet 697-699 says "ordinary `validateWaiverIds`, workflow-exception writes,
   and the ordinary evaluator refuse disclosure-only IDs," which bullet 712-715
   then contradicts on its face by requiring a successful v2 write; naming the
   first as v1/ordinary-path writes removes the apparent conflict. Similarly,
   **Decision** item 3 still summarizes the mechanism as "Evaluate a current
   workflow-exception at delivery verification time," which is now true only of
   initial authorization — the same class of residual the R2-F003 fix cleaned out
   of the numbered list.
3. Consider requiring the envelope validator to recompute `waiverScopeDigest` from
   `deliveryScope` and refuse a mismatch, the way #1755 does for its proposal
   (`delivery-attribution-exception-record.mjs:160-161`, `if
   (record.proposalDigest !== built.proposalDigest) fail('proposal-digest')`).
   `payloadHash` (`exception-record.mjs:184`) already prevents post-write tampering
   with either field, and the resolver validates `deliveryScope` against live facts
   at initial authorization, so the exposure is narrow: a buggy writer could emit a
   self-inconsistent record in which the digest is a non-authoritative duplicate of
   the scope. Since the design already says to reuse #1755's patterns "where their
   contracts match," this one matches exactly.

## Decision

accepted
