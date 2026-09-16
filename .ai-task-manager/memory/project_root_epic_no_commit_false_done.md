---
name: project_root_epic_no_commit_false_done
description: 'Root epic #1624 reached Done/Delivered via the no-commit deliverable lane with no real merged PR to trunk; caught by a 14-day audit (#1633), fixed by #1632/#1635.'
metadata:
  node_type: memory
  type: project
---

Discovered 2026-09-15: `close` let a **root** epic (#1624) terminate as Done/Delivered through the no-commit artifact lane (`aitm-deliverable-posted` comment, no PR) even though a root epic's real deliverable requires an actual merged PR to `origin/trunk`. The no-commit lane is legitimate for nested epics (parent-integration branch counts as delivery) and for true no-commit kinds (audit/spike), but was wrongly permissive for a root epic with a feature branch and commits waiting to land.

It was caught only because #1633 shipped a fail-closed, reproducible 14-day Done-to-trunk audit (`scripts/maintenance/audit-done-delivery.mjs`, read-only git/gh adapter, frozen snapshot) that classifies every recent Done marker as verified / false-Done / indeterminate and files a governed recovery issue for each bad one. #1632 then hardened `close-delivery-receipt.mjs` + `close-gates-lineage.mjs` so a root epic falls through to ordinary PR validation (requires a merged PR receipt AND a derived child commit trail on trunk) instead of accepting the no-commit projection. #1635 built a narrow, evidence-gated `--restart-false-delivery-transaction` recovery path to correct #1624's terminal record without rewriting its historical branch/commits.

**Why:** the no-commit deliverable lane exists for issues that genuinely produce no trunk-bound code; it was never meant to be a way for a root epic to skip PR delivery. **How to apply:** when closing a root epic, never accept `aitm-deliverable-posted` alone as proof — require a merged PR receipt on `origin/trunk` plus the child commit trail. If you ever suspect a Done issue never actually landed, run `audit-done-delivery.mjs` rather than trusting the board/checkbox state. See [[project_governed_pr_delivery_is_current]] for the current delivery model this hardened.
