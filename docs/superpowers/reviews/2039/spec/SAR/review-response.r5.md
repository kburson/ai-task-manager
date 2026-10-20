# #2039 specification SAR — round 5

- Reviewer: persistent native SAR agent, requested `gpt-6-astra` / `high`.
- Exact input: [spec.r4.md](spec.r4.md), SHA256 `4929d6173286f6da48426796071a5f8dd63fc2395f801e25eb34324e9240c247`.
- Result: revise one actionable finding, F15; addressed in [spec.r5.md](spec.r5.md), SHA256 `3cd8c28e437ea423ec791cf1b4fdeb47f13afbe5f05d3b116da171b823260429`.

## F15 — Preserve completion evidence for earlier timing pairs

**Severity:** important.

**Finding:** R4 requires timing readers to correlate a transition pair with the final body sentinel, but the current sentinel records only the latest transition. A second move would replace it and could make earlier completed pairs appear provisional. Reusing the existing post-sentinel transition-commit comment write would also contradict the stated final-body-last batch ordering unless its consumer contract changes explicitly.

**Evidence:** `scripts/task-tracker/lib/move-state/sentinel.mjs:writeMoveCompleteMarker` strips all prior move-complete sentinels before appending the new one. `transition-commit.mjs` defines immutable transition provenance records; `move-state-core.mjs` writes their comment after verifying the sentinel. Current `isMoveComplete` is a current-state predicate, not a historical completion ledger.

**Disposition:** addressed. Preserve an immutable transition-specific lifecycle receipt in the same final body batch, bound to transition identity, state/visit/actor, timing identity and confirmed prerequisite effect digests. Keep the latest sentinel for current state, preserve older receipts, and teach transition-commit consumers to accept the verified body receipt for new moves. Existing valid transition-commit records remain readable for legacy history; missing proof remains incomplete/Unknown. No extra counter comment, second body write or fabricated pre-Status completion record is introduced. Tests must cover successive transitions, demotion/reentry and a partial second move without losing prior completion or real accrued work.

R5 was formatted before snapshotting. The provider evidence file was reread in its final coherent completed form, including exact deletion results and untested boundaries. No additional provider calls, product tests, code/config changes, Git operations or lifecycle actions were performed by this reviewer. A terminal full-document reread follows.
