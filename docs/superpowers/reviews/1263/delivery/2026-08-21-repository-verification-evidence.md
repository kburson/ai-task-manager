# Test Corpus Membership Registry Delivery Evidence

Issue [#1338](https://github.com/kburson/ai-task-manager/issues/1338) records the
final repository verification for epic
[#1263](https://github.com/kburson/ai-task-manager/issues/1263). This document is
delivery evidence only; it introduces no product, test, registry, manifest, or
workflow behavior.

## Delivered authority

- The worktree tree matched `origin/trunk` before this evidence document was
  added.
- `scripts/tests/fixtures/test-corpus-pre-move.json` remained byte-identical to
  trunk and retained SHA-256
  `2c89b34b33913d2824d1134ae8b5ab6a22436e4c99ceb1855650eec2e2a9a53f`.
- Live membership reconciliation succeeded with no malformed, misplaced,
  noncanonical, undeclared, missing, duplicate, or overlapping entries.
- The reconciliation totals reported on 2026-08-21 were derived from
  `discoverTestFiles()` at verification time. They are evidence, not authored
  corpus acceptance counts; the live guard continues to derive them from
  discovery.

## Verification

The following gates passed against the delivered Task 1–4 tree:

- focused membership, package-corpus, and test-impact selector tests;
- repository lint, format, and diff checks;
- the complete discovery-backed unit, integration, and slow lanes;
- frozen-manifest comparison against `origin/trunk`; and
- exact live discovery reconciliation.

Governed Test receipt `01M0HG6QFNBVANDMA53PKZRJG1` records the final pre-merge
run at commit `c188a60f`. The merge workflow must produce a new exact-SHA receipt
if the delivered commit changes.

## Independent review

An independent reviewer reported no Critical, Important, or Minor findings. The
review confirmed that the focused and repository-wide evidence was adequate,
the frozen authority was unchanged, reconciliation was exact and discovery
derived, prior child commits were present on trunk, and #1338 was safe to advance
through governed Review and closure.
