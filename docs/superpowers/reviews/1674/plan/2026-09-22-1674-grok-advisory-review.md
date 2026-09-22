# #1674 Plan Advisory Review — Grok

Review target: `docs/superpowers/plans/2026-09-22-1674-guidance-cache.md` at commit `863771292adcd25607fff57bc41e9503b0aff23f`.

Authority note: This was a read-only Grok CLI semantic review, not an integrity-bound `ai-peer-review` protocol acceptance. The peer-review doctor reported `APR_IDENTITY_REQUIRED` in this host. The reviewer returned **BLOCK** on the initial plan; the author must resolve the findings and rerun review before Plan approval.

1. The content-hash fallback did not explicitly preserve all mandatory non-stat runtime identity fields. Section 12.3 permits substituting digest/tracking checks for unreliable stat fields, not ignoring package, validator, schema, registry, published digest, or source selection. Require a RED runtime-change case while device/inode is unavailable.
2. The release plan risked treating a committed budget fixture as certification. B2 safety must be exercised on the package under test, and live CI measurements must support the five §20.1 cases with at least 20% unused headroom. A caller-written certificate or claimed CI source is insufficient.
3. The second mid-read source change needed an explicit no-effects indeterminate admission test. Returning a typed result without mapping it to refusal before network, lock, session, guard, or provider effects would not satisfy §12.4.
4. Separate-process parser/validator traps were explicit for manifest and agent paths, but not human and invalid-diagnostic paths. Cover all four fresh-process warm loads, and prove ordinary invalid admission does not open diagnostics.
5. Named ctime and split-index cases needed failure oracles that change chmod/ctime and the shared-index dependency while leaving the split index's own stat unchanged.

The reviewer made no repository edits. Full review text was returned in the Grok CLI session for this worktree; this document records the actionable findings without promoting that advisory session to formal peer-review authority.
