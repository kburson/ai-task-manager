# SAR #1901 — author response to round 1

Reviewer: Astra 6 (`gpt-6-astra`), high effort.
Review notes: [Round 1](2026-10-08-1901-astra-sar-round-01.md).
Reviewed source: `d2580b330`; artifact SHA-256 `3fe0baba8d5a6c2b420413efd415cb7b7044ac6f27a67b0ecfb8aeef25f9b0df`.

## Dispositions

| Finding | Disposition | Revised contract |
| --- | --- | --- |
| SAR-1901-R1-01, P1 | Accepted after checking appendActorRow and immutable actor-flush journal behavior | Immutable source evidence is distinct from the mutable duration projection. Late events retain timestamps, deterministic source ordering and reallocate affected slices together. Original journal replay acknowledges its valid current projection without duplicate credit. Immutable source conflicts refuse. |
| SAR-1901-R1-02, P1 | Accepted after checking validateOutcomeTimingSource and outcome derivation | Preserve old-schema derivation/validation semantics. Protect both exact prefix and suffix referenced by sealed timing snapshots. Refuse apply or reallocation when protected bytes would change or reference discovery is incomplete. Permit preview/export and valid append-only successors. |
| SAR-1901-R1-03, P2 | Accepted after checking actor and legacy rollup branches | Engaged equals Active; Plan/Review are Active subsets; Idle remains separate. Closed slices in ongoing visits contribute. Unknown is scoped to affected projections. Sum seconds across visits before Math.round(seconds / 60) for new-model board values; keep board codecs and old outcome semantics. |

## Evidence and scope

The author re-read `gh-timing-comment.mjs`, `actor-flush-journal.mjs`, `estimation/outcome-record.mjs` and `timing-rollup.mjs` before applying these corrections. The source confirms that actor replay compares mutable row bytes, sealed source validation checks exact prefix/suffix, and legacy/actor scalar formulas differ.

The revised specification adds explicit publication identity/reallocation, sealed-source compatibility, public scalar formulas and required regression cases. These are design changes only. No product code, timing-history repair, sealed evidence mutation, Plan approval or implementation verification was performed.

The inability to apply changes to a sealed historical timing prefix is an explicit scope boundary: calculate/export it, retain the authoritative bytes, and require a separately designed lineage extension for in-place repair.

## Verification and next pass

Format and whitespace checks are run before the revision commit. They establish document hygiene, not correctness of an implementation. Astra must review the complete revised specification in round 2; this response does not declare convergence or approval.
