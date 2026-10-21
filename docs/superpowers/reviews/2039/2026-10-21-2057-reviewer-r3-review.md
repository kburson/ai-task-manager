### Strengths

- The repair is narrowly scoped: eight production lines, one compatibility regression, and an audit update.
- Physical Git discovery uses the established read-only resolver and checks the shared common Git directory, supporting linked worktrees.
- Existing local-cache, registry-identity, and registry-directory evidence still enters the full configuration, scope, ownership, manifest, dirty-state, and acknowledgment checks.
- The new integration test verifies successful legacy release without initializing cache or registry authority.
- The audit correctly distinguishes earlier CI evidence from acceptance of this changed source.

### Issues

#### Critical (Must Fix)

None verified.

#### Important (Should Fix)

1. **[P1] The legacy shortcut overlooks retained per-issue writer presence evidence.**

   **File:** `scripts/task-tracker/lib/story-cache/writer-handoff-bindings.mjs:110-114`

   `hasEvidence` checks the local cache, shared registry identity, and shared registry directory, but omits durable `story-writer-<scope-hash>.presence.json` records in the shared `aitm` directory. Those records are deliberately separate from the registry directory. Existing `inspectStoryWriterScope` treats their presence as authority evidence and refuses when the corresponding registry identity is unavailable (`scripts/task-tracker/lib/story-cache/writer-registry.mjs:402-407`).

   **Independent reproduction against the exact repair:**

   - Created a real Git fixture with a linked worktree.
   - Acquired a native writer and committed dirty cache data with an uncertain publication journal.
   - Preserved the local cache, registry directory, and registry identity under other names, leaving the native per-issue presence record in `.git/aitm`.
   - Kept the repository configuration valid.
   - Base `178bdff4d9f9fe8391c904f9866f0b84ef180b3d` refused with `STORY_WRITER_UNAVAILABLE / registry-identity-missing`.
   - Head `c7bb727010fcb392ffbca1f2b0b856e75fde1f66` allowed settlement.
   - `releaseIssueBindings` consequently invoked its terminal-ledger writer once.
   - The same base refusal/head allowance occurred from the linked worktree after its local cache namespace was preserved elsewhere.
   - The retained dirty publication bytes remained unchanged.

   **Impact:** Partial loss or relocation of cache and registry files is mistaken for a legacy repository with no native authority. This permits automatic binding release despite surviving evidence of unresolved native ownership, violating the accepted requirement that lost or uncertain authority refuse release.

   **Recommendation:** Include retained writer presence records in the read-only shared evidence census before allowing the legacy return. Once any authority evidence exists, missing configuration must also refuse. Keep inspection conservative for unsafe or unreadable namespace entries and avoid creating registry or store directories. Add regressions for presence-only evidence with valid and missing configuration, including a linked-root observation.

#### Minor (Nice to Have)

None verified.

### Independent verification

Reviewed the complete diff from:

- Base: `178bdff4d9f9fe8391c904f9866f0b84ef180b3d`
- Head: `c7bb727010fcb392ffbca1f2b0b856e75fde1f66`

Read the accepted Task 9 scope, deep-dive rulings, binding and relocation callers, runtime-root discovery, and registry inspection/presence behavior.

Independent successful checks:

- Handoff binding integration suite: **16 passed, 0 failed, 0 skipped**.
- Native binding lifecycle, binding guard, and relocation guard suites: **29 passed, 0 failed, 0 skipped**.
- Six additional compatibility/preservation probes passed:
  - No-evidence native Git root with absent configuration.
  - No-evidence native Git root with `{}` configuration.
  - No-evidence native Git root with malformed configuration.
  - Retained dangling local-cache link refuses.
  - Retained dangling registry-identity link refuses.
  - Retained dangling registry-directory link refuses.
- Those six probes compared recursive filesystem entry types, modes, link targets, and file bytes before/after inspection and found no writes.
- The additional presence-only damage probe reproduced the Important issue for both main and linked roots and compared base versus head behavior.

Execution used an exact-head disposable source archive. Its copied test helper was adjusted only to place disposable Git fixtures outside the archive’s `.scratch` ancestor, because the runtime correctly refuses artifact directories as authority roots. The initial archive-local fixture attempt failed that artifact-root admission check; it was a harness-location failure, not a production regression. The corrected run produced the successful results above.

The repository hook rejected `/tmp` scratch placement, so the disposable archive and probe sources remain under `.scratch/aitm-2057-review.r00pJN`. No tracked source, index, HEAD, or branch changes were made. No network, GitHub, native AITM lifecycle operation, or subagent was used.

### Recommendations

Fix the presence-evidence omission and rerun its failing regression, the legacy no-evidence regression, and relevant native binding/relocation checks. Obtain fresh review of the repair and complete the required exact-head verification before native Test. Earlier R2 or CI results cannot accept this changed source.

### Declined to judge

- **Public staging and publication activation:** explicitly deferred beyond this offline Task 9 repair.
- **Cloud assignment freshness and historical polling:** native caller responsibilities outside this local evidence shortcut.
- **Estimation/model calculation:** owned by later slices and untouched by this diff.
- **Foreign-host ownership adoption or server-lock guarantees:** explicitly unsupported by the accepted design.
- **Recovery after destruction of all retained evidence:** explicitly outside the accepted guarantee; the reported defect retains native presence evidence.
- **Protection against arbitrary hostile same-owner filesystem rewrites:** explicitly outside the accepted threat boundary.
- **Full handoff protocol recertification:** this review targets the tiny compatibility repair; existing protocol code was read where necessary to understand authority and settlement.
- **Full fast/lint/package/runtime-budget or remote CI acceptance:** not independently executed in this bounded offline review; targeted results are reported separately.
- **Native Test, orchestrator Review, approval, Close, merge, or delivery:** prohibited by the read-only assignment and not established by this report.
- **Bare repositories and unsupported submodule/separate-git-dir layouts:** the repair uses the established physical runtime-root contract; no new support claim is made.
- **Performance benchmarking:** no measured regression or specified budget failure was established; no timing limit or budget waiver was introduced.

### Assessment

**Ready to merge? No.**

The ordinary legacy compatibility repair works in the tested no-evidence cases, and the focused regression suites pass. However, the new early return bypasses existing protection for surviving writer presence records, allowing terminal release under lost-authority conditions. Fix the verified Important issue before acceptance.
