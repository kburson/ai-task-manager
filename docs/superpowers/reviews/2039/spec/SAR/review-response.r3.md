# #2039 specification SAR — round 3, owner scope revision

- Reviewer: the same persistent native SAR agent, requested `gpt-6-astra` / `high`.
- Exact prior input: [spec.r2.md](spec.r2.md), SHA256 `bc1490f406244c4beb33ee97404790300c6fc907241905096d1d0c3f8476d73d`.
- Revised exact input for the next review: [spec.r3.md](spec.r3.md), SHA256 `66d7fd009ade7a76a5c09e45191823b4eab259ce6eb616276b60350c57a2ee91`.
- Result: superseded requirements incorporated; continue SAR. This is a recorded scope-change revision, not a terminal review and not an additional defect-finding count.

## Superseding requirements and dispositions

The [scope-change record](scope-change.md) preserves the owner's intervening instructions. No complete draft or convergence verdict was produced for the brief intermediate numeric-greater-version proposal; its instructions were superseded before a new snapshot. The latest direction governs r3:

| Owner requirement                                             | Concrete disposition in r3                                                                                                                                                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cache body and all current comments in project `.tmp/gh`      | Replace the separate shared durable body-baseline store with project-local baseline/working payloads, manifest and journal. Protect pending cache from cleanup and require exact export/handoff.                               |
| Dirty local manifest; tiny changes spend no network           | Local digest/tag updates; freeze one publication generation and batch ID only at transition. No periodic/end-turn/estimate/timer-event publication.                                                                            |
| One human assignee and one owning agent                       | Add a cache-writer-specific singleton gate and shared session/worktree ownership pointer; preserve broader read-only/team semantics.                                                                                           |
| Upsert at governed state transitions                          | Replace per-effect body writes with one recoverable transition saga and final composite body write. Include demotions and native transition guards; same-state no-op is not a flush.                                           |
| Cache timing with the same transition boundary                | Accumulate native events locally, one canonical timing-log upsert, stable comment identity, preserved historical actors/events/Unknown and per-resource outcomes.                                                              |
| Use tested native revisions instead of numeric cloud versions | Opaque body/comment revision vector plus exact current-content hashes; explicit unedited mode; complete inventory detects new/deleted comments; no count arithmetic or custom counter comment.                                 |
| Any cached/cloud mismatch requires diff and discussion        | All snapshot blocks participate, including read-only foreign comments. No silent adoption, rebase or generation bump; retain baseline/local/cloud evidence.                                                                    |
| Preserve guards and honest completion                         | Required cloud proof records must actually publish/verify before Status where native gates demand them. Completion sentinel appears only after required timing/comment/board effects confirm; partial saga remains incomplete. |

## Technical basis

Read `ownership-policy.mjs` to verify early team-unassigned behavior and the absence of separate same-login agent exclusivity. Read `issue-mutator-lock.mjs` and record-claim composition to distinguish persistent pending-cache ownership from short-lived write serialization. Read the actual `move-state-core.mjs`, `github-mutation.mjs`, timing helpers and `audit-timing.mjs`: the current source writes entry body markers before Status, a final sentinel afterward, and may compensate with another body write. It also has per-row cloud timing writes and a direct body fallback, so a low-level body-helper change alone cannot satisfy batching.

The parent alone performed the separately authorized provider experiment. This reviewer read [its evidence](../../native-revisions/2026-10-19-native-revision-probe.md), including the appended confirmed deletion result before drafting r3. Unedited body/comment history can be empty; tested real edit IDs change, no-op IDs remain stable, counts include creation, and deletion of older B history leaves current C revision metadata unchanged. Adoption therefore uses native observations plus current-content hashes, never historical-diff enumeration or a claimed atomic precondition. Latest/body-history deletion, permissions and simultaneous writers remain untested boundaries with fail-closed handling.

No new API/UI calls, product tests, code/config changes, Git actions or lifecycle mutations were performed by this reviewer after the scope change. The canonical r3 was formatted before taking its immutable snapshot. It was ready for an independent reread, not yet declared converged.
