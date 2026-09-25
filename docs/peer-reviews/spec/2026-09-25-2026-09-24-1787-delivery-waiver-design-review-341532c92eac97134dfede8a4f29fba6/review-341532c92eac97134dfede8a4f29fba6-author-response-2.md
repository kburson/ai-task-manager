<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-341532c92eac97134dfede8a4f29fba6"
role: "author"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-24-1787-delivery-waiver-design.md"
artifact_commit: "787428315484792900c7f7f735a336515a9dd83b"
artifact_blob: "5b9b76ccc484a66d9f13180971fd5422a19e3b6f"
artifact_digest: "sha256:44d60394559dbbfab9cac8e373101e6545185be60d8103c38215a5e8c4947aff"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "GPT-6 Astra"
  session_fingerprint: "sha256:015bfd8c5a7e03183ff143d1019edf10c1146f744166fa600689464d04103b2b"
  identity_source: "runtime"
started_at: "2026-09-25T00:56:41.461Z"
submitted_at: "2026-09-25T01:20:55.161Z"
finding_ids: []
answered_finding_ids: ["R2-F001","R2-F002","R2-F003"]
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

All three turn-2 findings are accepted and resolved with explicit contracts.
The revised design names the positive v2 validator, binds resolver failures to
the guardrail coverage tests, and dispatches historical verification before the
initial-authorization procedure. The three optional clarifications are included.

## Finding dispositions

### R2-F001: Accepted

Rechecked `exception-record.mjs:150-173`: exact keys and the call to
`validateWaiverIds` are unconditional, and `empty-policy` cannot be satisfied by
the proposed delivery ID under that path. The spec now requires schema and
discriminator dispatch before these checks. V1 keeps its existing validator;
v2 uses the new catalog function
`validateDeliveryWaiverIds(requirementIds, deliveryScope)`.

For the PR waiver kind, the v2 ID appears in both the one-element
`payload.requirementIds` array and `deliveryScope.requirementId`, with exact
equality required. Its catalog entry must be disclosure-only. Ordinary IDs,
guardrails, unknown IDs, duplicates, and mismatched kinds refuse. This positive
structural validation does not grant authority; the resolver still proves scope
and human approval. V2 requires `constraints: []`, and its one validated
requirement satisfies its non-empty-policy rule. Existing deny constraints remain
in the ordinary partition, where they continue to apply. The write/parse/readback
tests now include positive v2 round trips and negative v1, kind, ID, and constraint
cases. Future #1783 validation has an explicit kind-specific dispatch contract.

### R2-F002: Accepted

Rechecked `DeliveryVerificationError`, its local `verificationError` factory,
and the diagnostic defaults. The shared delivery-exception authority resolver
is now explicitly the raising site for all four generic waiver categories.
It owns a closed category registry and typed failures containing category,
requirement ID, outcome, and bounded remediation. Every one maps to the hard
`delivery.verification.waiver-authority` ID.

The PR verifier translates those fields into `DeliveryVerificationError` and
cannot consult waiver authority for the guardrail itself. Direct consumers use
the same fields without matching error prefixes. The spec assigns conditions to
each category, distinguishes no grant from invalid authority, and makes ambiguous
or unreadable evidence `indeterminate`. Coverage now enumerates the resolver
registry and raising branches in addition to verifier sites, and verifies PR
translation and direct-consumer rendering. A missing guardrail mapping fails
coverage even if no local `verificationError` call mentions it.

### R2-F003: Accepted

The numbered procedure did retain the ambiguity identified by the review.
**Verification Flow** now dispatches first from verified durable transaction
state. Completed receipts go directly to pinned historical verification;
confirmed-burn/no-receipt retries go directly to their pinned retry rules.
Neither enters the initial-authorization procedure or its current grant resolver.

The numbered list explicitly applies only to new, unconsumed transactions, and
steps 2 and 3 each say initial authorization. Current expiry and revocation
checks are confined there. Added a test requirement that historical and
confirmed-burn retry paths never call the initial current-grant resolver.

## Changes made

Updated Requirement Model, Waiver Authority, Verification Flow, and Tests.
The optional clarifications specify that `authorityRevisions` is partitioned,
the overall snapshot hash may represent both histories without merging their
dispositions, each delivery partition has one unique immutable exception ID,
and pre-burn re-scoping requires a new exact human approval. The exception ID
does not replace the existing partition key, and revising a consumed operation
cannot reset it.

## Declined changes and rationale

None.

## Verification

Read the complete sealed reviewer response before editing. Rechecked the exact
envelope validation and empty-policy path, verifier error class and local factory,
and `snapshot.mjs:71-86` authority history projection. Inspected Git status before
editing and preserved the prior review's untracked files.

`git diff --check` passed. This remains a specification-only revision; behavioral
tests named in the design are required future implementation tests, not tests
claimed to have passed. Package-owned response frontmatter is unchanged.
