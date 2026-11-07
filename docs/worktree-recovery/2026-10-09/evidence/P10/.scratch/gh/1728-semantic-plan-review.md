## Semantic Plan Review — #1728 (2026-09-21)

Accepted for Full-Auto implementation, limited to Task 1 of the pinned `2026-09-21-1663-authority-evaluation-split.md` at `8a24aa38`. The parent split plan received independent Grok review and follow-up acceptance before issue hydration; this child does not introduce a new scope or claim package-protocol peer-review acceptance.

The deep dive confirms the boundary: an attempt-scoped read-only collector, with complete source and identity provenance, canonical content digest including normalization inputs, typed unavailable/incompatible outcomes, and no ready decision. The tests must assert attempted effects from an out-of-band ledger even if a fake transport throws. The existing guard registry, promotion verb, and complete two-pass evaluator belong to dependent #1729 and are excluded here. No new nested issue is needed for this one independently reviewable capability. The 8-hour Size M estimate remains within the split threshold and matches the one-unit plan. The issue-local forecast record is `01M31KYEN1FR011ZM9PBMND81F`.

Review result: approve Plan→Develop for #1728 under Full-Auto; retain #1729 blocked until this child is accepted and merged into `feature/epic/1663`.
