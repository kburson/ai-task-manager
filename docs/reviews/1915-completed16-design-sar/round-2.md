# #1915 completed16 design SAR — round 2

Same reviewer/reviser and manual protocol as round1. Freshly read the entire saved design and affected policy finalizer, original tail sequence, original frame checks, known-prefix decoder, and store partial-fact reader.

Input SHA256: `b5377e500986a959eb218c326ff45a61a6a870aa2a4fa73cecaa662492dce076`
Saved revised SHA256: `985fd1c3080881bf4275c33d835a60e51c440517afcc80475f71adc93ff0a83d`

## Review and correction

Round1 findings1–3 are resolved in the saved revision. One additional Important interaction required correction: policy final re-observation must not run after Core has refused late result custody and returned conservative reporting DATA. The current `policy.mjs:327–334` unconditionally performs final checks/read after Core returns; the store partial-reader itself correctly checks actual holder custody before `observeRevision` (`store.mjs:4641–4665`). Without an explicit finalizer refusal branch, the new design could preserve zero reporting reads but introduce policy reads after the same late substitution.

Corrected the design to require synchronous descriptor comparison before policy final reads and a conservative cleanup-only refusal when execution/reporting already lost custody. This does not authorize stale facts or let a failure result authorize effects. Added no source changes or new implementation plan.

The genuine native tail throws its first refused leaf (`post-commit-tail.mjs:99–107`), supporting the stated stop before step19 effects. Original first-entry result captures remain separate, and the finalizer continues to demand pending authority for intact execution. Another fresh full-design read is required before requesting formatting and exact-byte acceptance. HUMAN approval remains pending.
