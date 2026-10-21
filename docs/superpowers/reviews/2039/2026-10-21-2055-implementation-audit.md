# #2055 — retention policy and cleanup boundary audit

## Product boundary

The new `story-cache/retention.mjs` is a pure policy over a generation whose manifest and referenced bytes were already verified by the store. It never removes files, transfers ownership or grants publication authority. It recognizes purge, refresh, reassign and migrate. Unknown operations retain the generation. Missing or malformed policy evidence, dirty tags, conflicts, any retained publication journal, pending timing events or unequal ingestion/publication cursors refuse destructive use. Changed or new working references also retain data if a dirty tag was lost. An unchanged working baseline can be refreshed.

Confirmed publication journals are conservatively retained until their owning coordinator explicitly settles them. This avoids treating a status word alone as proof that recovery data can be discarded. Retained event arrays are similarly protected even when cursors agree. This policy does not clear or reinterpret Unknown timing, native revision IDs, proofs or claim identities.

## Source-grounded cleanup census

- `runtime-migration-plan.mjs` inventories only `.tmp/aitm` and `.db/aitm`. The story cache at `.tmp/gh` is not a migration source. Classification destinations are contained inside the registered runtime store; no second story-body authority is registered.
- `runtime-migration-apply.mjs` copies approved source bytes into contained runtime destinations and retains its sources. It has no story-cache purge path.
- `paths.mjs` resolves volatile runtime paths under `.tmp/aitm`, separate from `.tmp/gh`.
- `cleanup-base-aware.mjs` produces a pure Git cleanup proposal; it performs no worktree removal, temporary-file purge or rebase itself. No destructive temporary cleanup implementation was found in this bounded runtime surface.
- Accepted #2054 `store.mjs` remains the canonical `storyCachePath` export. Its physical consumer-root resolution, identity validation, containment, symbolic-link refusal and private generation persistence remain unchanged and were rerun through their existing tests. No package installation fallback or duplicate path builder was added.

Consequently these existing runtime/root files require no speculative inventory rewrite in this slice. Later coordinator, claim/handoff and public-writer owners must consume retention before destructive operations. This foundation is not a claim that the entire epic is activated or that arbitrary manual directory deletion is recoverable.

## Verification observed before independent review

The first verifier failed because the new module did not yet exist. After defining the public interface with a permissive decision, the 77-case behavior verifier reported 6 passed and 71 failed. Implementing the refusal policy then produced 77 passed, zero failed. One test helper was corrected to pass an explicitly undefined operation through rather than replace it with its default purge operation.

The selected regression command covered every current story-cache unit verifier, actual store integration, runtime migration and transaction integration, and package-boundary verification: 391 tests passed, zero failed. The package inventory registers exactly one additional runtime module with an explicit required-entry assertion and no exclusions or headroom.

Full exact-head CI and native Test/Review/Close are still required. Independent review and author dispositions are retained separately; this document does not substitute for those gates.

## Delivered prerequisite integration and genuine timing recovery

The original retention implementation at 9af7350e3e7450abba1e6073c40bcd0fee4aeee4 passed exact-head CI 39630049259 and native Test. Its first native Review correctly objected to the failed session's orphan actor; no native Done was claimed. The standalone prerequisite #2082 subsequently reconciled its retained semantic-drift publication through the native matching-intent path, obtained the operator's exact board Start Time backfill, and completed Plan, TDD, independent review, full exact-head CI, Test, orchestrator Review, approval, governed provider delivery and Close. Its verified delivered trunk revision is 7b27ed149e48fd28c8da6e8a1544df52de10fea3 (PR #2083).

This app-bound 7f44 worktree returned to the preserved codex/2039-draft branch through audited native binding renewal. Root #2039 was genuinely paused before #2055 resumed. Native demote declared actual prerequisite code integration, moved Review to Develop and invalidated twelve evidence items. Agent role resumed. Merge 3552a35df5e4713006cc0e4bfee3899368f6026d preserved both prior histories and incorporated the already delivered prerequisite without conflict. No force, reset, rebase, hook bypass or app metadata edit occurred. Retention implementation, source bindings, local estimate 3h, size S, rank 5 and dependencies remain unchanged.

The author's combined cache/store/recovery selection passed 422 tests. Fresh independent integration review passed 561 tests, verified exact prerequisite bytes and found no actionable defect. Its complete report and every declined-boundary disposition are retained separately. No unmeasured whole-suite success is inferred from those bounded selections.

Native update recorded the actual current operator's engagement before the new dry-run. The owned standalone recovery CLI then accepted the complete current source and applied one Unknown record with exact source/comment identities. It returned healed after exact canonical read-back. The original orphan start and every prior byte remain untouched; known engagement remains 4,763,608 ms, Unknown contributions remain unavailable, and the recovery supplies no historical endpoint. Frozen original/candidate/manifest/stdout and full hashes are retained under 2055-actor-recovery, with original private archive retained in .scratch/heal/actor-evidence-zbt3V6. Read-before-write plus exact read-back is not claimed as atomic server-side compare-and-swap.

This checkpoint still requires the final committed audit/review head's full CI and native Test, then orchestrator Review, approval and Close against the immediate parent branch. Aggregate PR #2081 remains pending all 32 children and root acceptance.
