# #1915 completed16 design SAR — round 1

Protocol: manual same-agent review/revision. Reviewer/reviser: delegated agent `1915_design_sar`; assignment supplied GPT-6 Astra, medium. This is not package-attested identity, independent SPR/XPR, or human approval.

Input artifact: `docs/superpowers/specs/2026-10-11-1915-completed16-resumption-design.md`
Input SHA256: `345b4ea831a3fc212ab48249ccd1e82c02a6af2968dd0112b5973c3ce1da0d1c`
Saved revised SHA256: `b5377e500986a959eb218c326ff45a61a6a870aa2a4fa73cecaa662492dce076`
Source basis: controller-supplied HEAD `f0ee67268f9fa9d07c7b0b960ea86bddea77eb78`; no Git command was run by this reviewer. Actual source files were read locally.

## Findings and dispositions

1. Important — execution progress and policy finalization were underspecified. `policy.mjs:270–277` compares the entire snapshot to the admission snapshot; `policy.mjs:327–334` also compares the final observation to the old state. `stage-execution.mjs:3005–3034` rejects ordinals above16. Merely authorizing a set of17/18 snapshots leaves rollback/skip ambiguity and the final check still rejects genuine advancement. Corrected: ordered invocation-bound progress, precise landed intermediates, fresh final full-history reconstruction against that cursor, unchanged authority, and no reuse of the1–16 decoder on new17/18. Ordinary/admission-only behavior remains unchanged.
2. Important — existing-read lock lifetime did not explicitly end before tail dispatch. `store.mjs:3601–3608` and `3805–3813` acquire/release the same timing resource lock for transition and dispatch; cache uses the active-task checkpoint lock at4402–4449. Corrected: existing-read release in its own finally, retained comparison custody under the outer interlock, dispatch release before cache, and explicit handoff/refusal qualification. No nested lock or production transport activation is authorized.
3. Important — existing partial reporting cannot accept a separate resume frame. `move-state-core.mjs:898–943` requires original preparation registration/returns and `4660–4715` owns cancellation, reporting and cleanup. Reusing this unchanged would lose verified existing facts or tempt historical membership fabrication; late cache/read substitution must also fail before reporting reads. Corrected: distinct lexical resume report holder, cancellation/join, descriptor checks before reads, independent store reconstruction and actual return custody, truthful existing partial fields, conservative refusal and post-report cleanup.

All three findings were corrected by this same reviewer in the saved design. No source, tests, plan, configuration or lifecycle files were edited. No test or implementation-completion claim is made. Review remains open for a fresh round over the entire saved revision, followed by controller formatting and exact-byte final review. HUMAN approval is still required before an implementation plan.
