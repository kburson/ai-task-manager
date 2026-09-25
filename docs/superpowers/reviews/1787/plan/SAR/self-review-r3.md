---
review_type: SAR
reviewer: Codex author, same session
filepath: docs/superpowers/plans/2026-09-24-1787-delivery-waiver.md
commit_sha: c07f5a57985b5c75338e9cdc810195c9dea55968
reviewed_file_sha256: d2bd0f970a41fc6706f300c65b0e0b202322598ff035d7a352217e4092c31fa6
uncommitted_changes: false
turn_ordinal: SAR r3
finding_count: 2
verdict: changes-required
---

# Delivery Waiver Plan SAR, Round 3

## Scope and Prior Findings

Reviewed the whole committed [plan](../../../../plans/2026-09-24-1787-delivery-waiver.md)
again, with particular attention to construction order, exact schemas, historical
reproduction, request grammar, and the separate no-PR consumer. SAR-01 through
SAR-04 remain addressed: graph transition, intent ownership, immutable burn OID,
and full preparation/action binding have explicit tests and owners.

Checked the v2 revocation proposal against the existing envelope validator's
`expiresAt > createdAt` rule. Its separately approved future tombstone expiry
does not revive the old grant; status remains revoked, and historical authority
continues to use the original burn instant. No schema relaxation is required.

## Findings

### SAR-05: Separate Pre-Burn Verification From Terminal Receipt Assembly (P1)

**Plan locations:** Shared Interfaces; Task 7 record builders; Task 8 interfaces
and motivating test; Task 9 effect ordering.

The plan's only concrete generic-verification fixture supplies pinned records,
and its return exposes receipt input. But a v4 receipt requires a confirmed burn,
while the burn must follow complete verification. There is no precise fresh
verification contract that runs without a burn. An implementer can inadvertently
make initial delivery require consumption evidence that cannot exist yet, or
construct a provisional receipt without the required terminal authority.

**Required correction:** Define a fresh fact-only verification result with no
terminal receipt input, a separate complete pinned path, and an explicit pure
receipt-input assembler after confirmed consumption. Specify and test the full
fresh sequence without fabricated burn fixtures or caller mode booleans.

**Disposition:** Accepted. Tasks 7-9 and Shared Interfaces now distinguish
`verifiedFacts` from terminal input, define `buildWaivedReceiptInput`, and require
verify -> reserve/confirm intent -> fresh verify -> burn -> receipt assembly ->
publication. Historical retries reconstruct only from a real confirmed burn.

### SAR-06: Do Not Promise PR Journal State to the No-PR Consumer (P2)

**Plan locations:** Task 6 exact event/burn schemas and #1783 Handoff.

The handoff promises the operation-journal interfaces to #1783 without stating
that their event shape and state machine require an original PR intent and a
merge commit. A no-PR consumer cannot populate those fields honestly. Reusing the
state machine as written would recreate the PR/no-PR conflation the accepted
spec explicitly rejects, while permissive nulls would weaken the PR schema.

**Required correction:** Separate reusable authority/transport/operation-key
primitives from the PR-specific consumption schema. Assign explicit local-trunk
events and version-aware journal dispatch to #1783; keep unknown schemas refused
and prohibit fabricated PR fields.

**Disposition:** Accepted. The handoff now makes that boundary explicit without
implementing #1783 or altering the accepted spec.

## Verification and Limits

Round-two documentation formatting, targeted Markdown lint, and whitespace
checks passed before its commit. Re-read the exact current envelope expiry
validator and delivery verifier/close receipt assembly contracts. These checks
support the planning findings; future fresh/pinned runtime fixtures are not yet
implemented or passing by virtue of this review.

This is author self-review only. The accompanying corrections require another
complete SAR pass, and Opus plan review remains pending.
