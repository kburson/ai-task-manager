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
