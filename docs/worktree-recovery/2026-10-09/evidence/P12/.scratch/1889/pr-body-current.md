Native start/resume/switch claimed an occupancy generation but dropped it before saving the per-session binding, causing genuine epic rank-wave preparation to reject its own parent session. Persist the successful claim's exact generation through every bind path, retain it only in the owning session, and clear an old generation when generic state writes change issues.

Refs #1889

Validation: 37 affected checks pass, including normally packed offline consumer binding, collision/rollback isolation, lane-layout purity and timing-emitter characterization. Full CI run 37266476621 succeeded on 9bb4a2806b47ef53d30c15cc1f0dc4e05d9efc30, covering unit, all three integration shards and all three slow shards. Independent exact-commit machine review found no actionable issues. The initial affected run and CI failures remain recorded; they are not represented as passing.

Native Test validated the complete CI artifacts at the same commit (receipt 01M45849ZV2BW76MHYX40WVVG3). This change preserves rank-wave authorization checks; completed-member lineage and wave publication are outside its scope.
