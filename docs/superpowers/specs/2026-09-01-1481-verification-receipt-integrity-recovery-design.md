# Verification Receipt Integrity Recovery Design

Issue: #1481  
Historical provenance: #1170, #1171, #1175  
Status: approved design

## Problem

AITM reuses exact-SHA verification receipts to avoid repeating evidence that is still authoritative. Current receipts bind reuse to the issue, stage, commit, execution environment, provider-required classifications, command identities, and command results. They do not bind reuse to the issue body's complete `## Verification Commands` declaration.

That omission permits a false green: after Test writes a valid receipt, an operator can add, remove, or change a required issue-specific command without changing the commit SHA. The cached receipt still validates, so Test can short-circuit without executing the new declaration.

Issues #1170 and #1171 implemented the missing command-set authority and invalid-marker retirement on a private branch chain. Both issues were closed, but their commits never reached trunk. Current trunk then evolved independently, adding provider metadata, execution provenance, docs-only lane decisions, and newer lifecycle consumers. Recovery must merge the historical semantics forward without replacing those newer contracts.

## Decision

Implement both safeguards as one atomic recovery defect against current trunk:

1. Every reusable receipt carries a canonical projection of the live Verification Commands set.
2. Every authority decision compares that stored projection with a projection derived from the current issue body.
3. Missing or different projections invalidate the receipt with `vc-set-mismatch`.
4. When Test finds a claimed cached Test receipt invalid, it retires that exact marker before starting replacement execution.
5. Retirement ambiguity or failed verification stops the run; Test never executes while invalid evidence remains resident.

The historical branches are reference implementations and test sources. They will not be cherry-picked wholesale because their surrounding receipt and Test code predates material current-trunk behavior.

## Canonical Verification Command Set

`verification-receipt.mjs` will expose one canonicalization helper used by all producers and consumers. Its input is the parsed root Verification Commands entries, not arbitrary issue prose.

For each entry, the canonicalization helper will:

- validate and partition the command through the same command-validation boundary Test uses;
- project the semantic executable identity as an argv array;
- collapse cosmetic command whitespace through the existing normalization path;
- sort projected identities by canonical JSON, making body order irrelevant;
- reject duplicate semantic identities rather than silently collapsing them; and
- reject commands that cannot be converted to an executable identity.

This means reordering lines or changing cosmetic whitespace preserves authority. Adding, removing, or semantically changing a command changes authority.

The projection is stored on the fingerprint as `verificationCommands` and copied into each new receipt. The receipt schema remains readable as `aitm.verification-receipt/v1`; legacy receipts may still be parsed structurally, but live validation treats an absent projection as `vc-set-mismatch`. Structural readability is deliberately separate from authority.

## Validation Data Flow

The current issue body is the authority for what Test promises to run. Consumers must therefore supply the live projection rather than reconstructing expected data from the receipt itself.

The primary flow is:

```text
live issue body
  -> parse root Verification Commands
  -> canonical semantic projection
  -> build current fingerprint
  -> compare with receipt.verificationCommands
  -> reuse or invalidate
```

`test.mjs` already parses the live list before planning execution. It will pass that list into every pre-run, sandbox, completed-run, and persisted-write fingerprint boundary. The fresh-base evidence-write result will be validated again so a concurrent issue-body edit cannot race a green sandbox into accepted evidence.

Other receipt-authority consumers will use their live body similarly:

- Review evidence validation;
- incorporated-close evidence validation;
- docs-only lane-skip proof;
- AC/DoD stamp receipt reuse;
- estimation evidence extraction; and
- the Develop-exit sandbox-proof guard.

A consumer that cannot correlate a receipt with live VC authority must default closed. No consumer may copy the receipt's stored projection into an expected fingerprint, because that would compare evidence with itself.

Provider-required classifications remain a separate dimension. The VC projection answers “what did this issue declare?” while provider classifications answer “which standard lanes must this provider prove?” Both must validate.

## Exact-Identity Retirement

The recovery adds `verification-receipt-retirement.mjs` as a narrow mutation service. Its pure transform accepts:

- expected issue number;
- stage; and
- receipt ID.

It parses validated marker claims, locates exactly one matching marker, and removes only that byte range. No match is an idempotent `already-absent` result. More than one match is ambiguous and throws.

The live operation runs through `mutateIssueBody` on a fresh base. It then verifies the returned written body and fetches the issue body again for independent read-back. If either still contains the target marker, retirement fails.

Test integrates retirement only when all of these are true:

- the issue is already in Test and eligible for cached Test-receipt reuse;
- a receipt marker is claimed for the Test stage; and
- validation rejects it.

If the claim is malformed such that an exact receipt ID cannot be established, Test posts a refusal and returns without sandbox setup or command execution. If retirement throws or read-back fails, Test behaves the same way. A successful retirement updates the in-memory body before the replacement run.

This ordering prevents two misleading states: an invalid marker remaining visible while replacement work runs, and a later failure leaving both stale and partial evidence resident.

## Transition and Concurrency Protection

Two additional checks close timing windows around the main flow.

The Develop-exit sandbox-proof guard will validate the live Test receipt's command authority whenever a Test receipt marker accompanies the DoD verification marker. This prevents an old DoD marker plus a stale receipt from authorizing Develop-to-Test movement after the body changes.

After Test mutates the issue body with a new receipt and auto-ticked evidence, it will validate the exact returned body against current commit and command authority. If the fresh-base mutation reconciled against a concurrently changed VC set, Test refuses the transition and requires another run.

All existing issue-lock, fresh-base mutation, receipt supersession, provider, provenance, and lane-skip behavior remains in force.

## Compatibility

The change intentionally invalidates every legacy receipt that lacks `verificationCommands`. The normal recovery is a new governed Test pass, which writes a current receipt. There is no migration that retroactively blesses old evidence because the historical body declaration at execution time cannot be reconstructed reliably.

Valid current-provider receipts continue to reuse when their SHA, environment, provider requirements, command results, and canonical VC set all match. Docs-only receipts continue to omit legally skipped lanes and retain their positive lane-skip record.

## Error Handling

Receipt validation returns structured reasons. `vc-set-mismatch` covers both an absent legacy projection and a semantic difference, with optional details distinguishing missing from changed data for diagnostics.

Canonicalization failures are default-deny and surface as invalid VC authority. Retirement uses separate refusal reasons for unavailable identity and failed exact retirement. Test comments must state that no replacement execution started.

No error path silently deletes malformed evidence, invents a receipt identity, accepts self-derived authority, or treats an empty command set as green.

## Testing Strategy

Development is test-driven. Focused tests first demonstrate current-trunk failures for:

- added, removed, and changed commands;
- legacy receipts with no projection;
- reordered and whitespace-only equivalent declarations;
- duplicate or invalid command projections;
- current provider metadata coexisting with the projection;
- the original valid-receipt-then-body-change reuse path;
- exact-identity retirement and idempotent absence;
- ambiguity and failed write/read-back refusal;
- no sandbox execution when retirement fails;
- fresh-base body changes during evidence persistence; and
- Develop-exit refusal for stale live authority.

The focused command is the root `vc:1` entry on #1481. Existing Review, close, docs-only, stamp reuse, estimation, package-boundary, and provider suites will be extended where their input contract changes. Final verification runs formatting, lint, the full fast lane, the slow lane, and governed exact-SHA Test.

## Non-Goals

- Reopening or rewriting #1170, #1171, or #1175.
- Restoring the old branch topology.
- Changing provider selection or classification semantics.
- Redesigning receipt storage or introducing a new evidence backend.
- Creating another chained recovery defect.
