<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-341532c92eac97134dfede8a4f29fba6"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-24-1787-delivery-waiver-design.md"
artifact_commit: "21a07908370219e64b7aeeaa216c55bb4f009c02"
artifact_blob: "137b412ff616343887e341cc909afb5dffa10972"
artifact_digest: "sha256:4e2ab1c13b159dbd7d5c6d529b8b04a59f721eb9a3dd3dafa06a8c26a136a937"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "GPT-6 Astra"
  session_fingerprint: "sha256:015bfd8c5a7e03183ff143d1019edf10c1146f744166fa600689464d04103b2b"
  identity_source: "runtime"
started_at: "2026-09-25T00:56:41.461Z"
submitted_at: "2026-09-25T01:12:08.029Z"
finding_ids: []
answered_finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004","R1-F005","R1-F006"]
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Astra 6 author revision of the #1787 design after the independent Opus 5 review.
All six sealed findings are accepted and addressed. The four outstanding findings
from the earlier review are also addressed below. No implementation or plan review
has started.

This review is the requested Astra 6 / Opus 5 continuation. The prior review,
`review-5c1846703362de090f3843bf4a5f75e8`, remains preserved as historical evidence;
its author identity was GPT-5, and its unsubmitted response is not presented as an
Astra submission. The installed protocol cannot replace that participant without
a signed replacement grant, so this review started from the same committed spec.

## Finding dispositions

### R1-F001: Accepted

Verified `close-delivery-receipt.mjs:157-215` reruns verification and compares
canonical receipt bytes, and `verifyWaivedEvidence` supplies the existing pinned
authorization precedent. Added separate initial-authorization and completed-receipt
paths in **Consumption and Completed-Receipt Verification**. Initial burn checks
current scope, expiry, and revocation; re-verification validates the exact pinned
grant and burn, including authorization-time validity, without consuming again or
requiring the grant still to be current. A retry with an existing matching terminal
receipt returns it idempotently. Historical tampering and live delivery mismatch
still refuse. Later revocation cannot erase an already-authorized transaction.

The spec retains canonical byte equality, prohibits close-time values in receipt
fields, and requires v3/v4 receipt acceptance in `requireDeliveryReceipt`.
**Verification Flow** removes the v3/v4 `mergeMethod ?? intent.mergeMethod`
coercion, defines null provider observations explicitly, and preserves pinned
receipt bytes when optional metadata availability changes. Added post-expiry,
post-burn close, failed-write retry, and metadata-availability fixtures. Original
intent authorization evidence is retained when a waiver intent supersedes an
already-merged pending intent; waiver time cannot replace original authorization
time in the merge-before-intent predicate.

### R1-F002: Accepted

Verified #1755's `PROPOSAL_KEYS`, ULID checks, required expiry, authority guard,
canonical proposal digest, and grant chain in
`delivery-attribution-exception-record.mjs`. Added an explicit comparison and
decision in **Record Family and Chain Boundaries**. Workflow-exception v2 remains
the chosen host because it connects named catalog requirements and the operator
workflow with the PR and no-PR consumers. Generalizing #1755 also needs a new
schema because its PR, inventory, mappings, and tokens are mandatory. #1755 remains
compatible and separate; its historical grants are not reinterpreted.

Verified the store's `revision-required` and resolver's issue-wide chain restriction.
The new spec partitions validated records before writes, chain resolution,
idempotency readback, snapshots, or evaluation. Ordinary v1 retains its single
chain. V2 uses one chain per exact exception-kind/requirement/delivery-operation
key, with immutable keys, one root/head, contiguous revisions, and refusal of
cross-chain links. A review bundle and delivery grant coexist. Multiple delivery
chains do not permit multiple waived IDs in one transaction. V2 explicitly rejects
null expiry. The shared consumption ID is a ULID, distinct from the write digest.

### R1-F003: Accepted

Verified `desiredPolicy`, `policyOf`, and the hash/readback path in
`exception-store.mjs`. Introduced `deliveryOperationId`, minted independently
before the scope digest. The existing store `operationId` remains a `sha256:`
write-idempotency token. The derivation order is delivery ULID, scope, scope digest,
full desired policy, then store write digest. Full scope, discriminator, and digest
participate in policy equality and write hashing. No write digest occurs in its
own preimage. Burn uniqueness uses repository/issue/delivery-operation, so a grant
revision cannot reset consumption. Tests cover retry determinism, scope sensitivity,
revision replay, and ambiguous append/readback.

### R1-F004: Accepted

Verified the ordinary `validateWaiverIds` gate and evaluator waiver-set path.
The spec now mandates `waivable: false` with `waivableWithDisclosure: true` for
eligible delivery IDs, ordinary-path refusal at write and evaluation, and delivery
resolver ownership of the disclosed outcome. The three guardrail IDs have both
capabilities false in a separate family. Added ordinary-path bypass-negative tests.

### R1-F005: Accepted

Verified both equality sites at `assertMergedPullRequest` and Git classification.
Chose the review's allowed alternative: keep one equality ID, but first require
independent Git topology and agreement with any available provider observation.
The equality cannot short-circuit evidence collection. Unknown topology, invalid
metadata, missing required evidence, and source disagreement are addressed by the
new hard `delivery.verification.merge-method-evidence` ID. Only the comparison of
the proven method to the authorized method can be waived. The #1784 walkthrough
therefore still requires proven merge topology. Added disagreement and missing
metadata fixtures and deterministic close-time observation rules.

### R1-F006: Accepted

Verified exact v1 pins in both recovery modules. Chose explicit v3/v4 support in
this issue, with the shared pinned-authorization validator and existing exact
bundle correlations retained. Unknown and mismatched pairs refuse. Scope, Tests,
and Implementation Notes now include both recovery modules. Repairing their
pre-existing attribution v2/v3 exclusions remains outside this issue; the new
waiver pair is covered without widening all version checks.

### Prior review turn 2

- Finding 1 (volatile scope): Replaced `resolvedTrunkSha` with stable `resolvedTrunkRef`,
  named `canonicalRecordJson`, specified explicit null PR identity for #1783,
  and required validity after unrelated trunk advancement.
- Finding 2 (guardrail capability): Moved self-check IDs into a non-waivable guardrail family and made
  `delivery.verification.waiver-authority` mandatory for generic authority,
  replay, burn mismatch, and ambiguity failures.
- Finding 3 (active-record collision): Resolved the evaluator and store collisions through the
  same validated partition contract, with coexistence and cross-chain tests.
- Finding 4 (scope completeness): Scope now explicitly includes schema v2/readback, partitioned writes,
  the durable consumption ledger, and Codex-only fail-closed host authority.

## Changes made

Updated Scope, Requirement Model, Waiver Authority, Verification Flow, Records
and Schemas, Command Surface, Tests, and Implementation Notes. Added explicit
family comparison, partitioning, derivation, consumption, and deterministic
re-verification subsections. The #1783 Option B boundary is retained.

Optional suggestions incorporated: strict requirement lookup in the existing
diagnostics table; actionable repair for missing issue scope sections; ambiguous
burn and receipt-write reconciliation; and the close diagnostic/renderer location.
The focused suite list now names consumption and re-verification tests.

## Declined changes and rationale

No required finding declined. General migration of #1755 records and a multi-ID
waived receipt are deliberately excluded. Retaining one waived ID per transaction
matches the existing proposed schemas and the promise that all other predicates
must pass. Generalizing those contracts would require a separate design decision.

## Verification

Read the full sealed reviewer response and verified its six source claims in this
worktree before editing. Inspected `evaluator.mjs`, `catalog.mjs`,
`exception-store.mjs`, `exception-record.mjs`, `snapshot.mjs`,
`delivery-attribution-exception-record.mjs`, `delivery-verification.mjs`,
`delivery-records.mjs`, `close-delivery-receipt.mjs`, and both recovery modules.

`node scripts/dev-env/verify-local-worktree.mjs` passed (Node 26.8.1 and correct
self-link). `git diff --check` passed after the spec revision. Reviewed remaining
operation-ID references to separate delivery consumption from store idempotency.
The author response preserves all package-owned frontmatter. This is a design-only
revision: proposed behavioral tests are implementation requirements, not claimed
passing tests. No implementation suite was run or represented as passing.
