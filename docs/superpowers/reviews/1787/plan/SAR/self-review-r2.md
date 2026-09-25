---
review_type: SAR
reviewer: Codex author, same session
filepath: docs/superpowers/plans/2026-09-24-1787-delivery-waiver.md
commit_sha: c15e40abcc63dfafb23017e7cad7c68fc071e747
reviewed_file_sha256: aabb22f04fd44971ded6ee7f9e0c71bdd52a775dd065b731e59968c84340c984
uncommitted_changes: false
turn_ordinal: SAR r2
finding_count: 2
verdict: changes-required
---

# Delivery Waiver Plan SAR, Round 2

## Scope and Prior Findings

Re-read the committed [plan](../../../../plans/2026-09-24-1787-delivery-waiver.md)
against the accepted spec, original SAR findings, and current record, authority,
request-parser, and close code. This remains same-author self-review, not
independent peer consensus or runtime verification.

- SAR-01 is addressed by the explicit validated v1-to-v3 graph transition and
  full-history positive/negative fixtures. Ordinary divergence remains a refusal.
- SAR-02 is addressed by pre-publication reservation, issue-wide predecessor
  ownership, exact readback, and two-host tests that include the intent writes.
  Burn still requires fresh authority and all non-waived facts.

## Findings

### SAR-03: Separate Immutable Burn Identity From the Journal Tip (P1)

**Plan location at reviewed commit:** lines 119-124 and 343.

The API returns only `journalOid`, while the receipt pins a burn's "journal OID."
The journal necessarily advances for receipt requesting/completion, and the
round-one issue-wide journal can also advance for unrelated operations. A retry
or close using the latest read OID therefore changes the receipt reference even
though the burn has not changed. The current close code compares reconstructed
canonical receipt bytes exactly (`close-delivery-receipt.mjs:210`); this ambiguity
can strand every newly completed receipt or cause an implementation to weaken
that comparison.

**Required correction:** Give the burn's historical commit its own immutable
`burnOid`, separate from the mutable CAS cursor. Derive it from the first burn
event, verify ancestry, and carry it unchanged through replay. Test receipt
reproduction after both same-operation completion and unrelated issue events.

**Disposition:** Accepted. Shared interfaces, journal replay, receipt schema
instructions, and close regression coverage now make this distinction explicit.
The OID is derived from the commit, not inserted into its own hashed payload.

### SAR-04: Make Revise/Revoke Approval Preparation Executable (P2)

**Plan location at reviewed commit:** lines 280-282 and 296.

Preparation's closed input has neither an action nor an exception/prior-revision
selector. Yet its exact human statement and proposal digest must bind all of
those facts, and the returned v2 request has no explicit prior revision. The
existing CLI infers record/revise/revoke from the command; it has no preparation
mode to supply these missing inputs. Thus an implementer must invent a contract
or leave operators unable to prepare a valid revision/revocation. Tests that
inject a made-up digest would hide that gap.

**Required correction:** Specify action and prior-record selection in the
closed preparation input and request; define a canonical approval preimage,
command/schema/action agreement, and stale-selector checks. Exercise the whole
prepare/approve/write/readback path for all actions, including revocation of
expired authority. Keep v1 grammar and the accepted v2 envelope schema unchanged.

**Disposition:** Accepted. Task 5 now defines those contracts, stable IDs on
retry, historical digest reconstruction, and end-to-end action fixtures.

## Verification and Limits

- Round-one plan/review Markdown checks and whitespace checks passed before
  commit. The current delivery-record suite remains 25/25 from the preceding
  baseline run; no new runtime code has been introduced or certified.
- Verified the current request key sets and action dispatch in
  `scripts/task-tracker/verbs/workflow-exception.mjs:26` and historical receipt
  equality in `scripts/task-tracker/lib/close-delivery-receipt.mjs:210`.
- Prior findings are closed as planning corrections, not executable proofs.
- The accepted spec is untouched. Journal choice and cross-provider plan
  acceptance remain separate review gates.

The accompanying corrections require another full SAR pass.
