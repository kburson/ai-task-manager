# #2042 — independent review author dispositions

## Round 1

Reviewer: fresh GPT-6.1 Sol / medium, isolated context, read-only. Range `bcdbb85ff2527eefdea62cf5ebe84740e22e87a8..cf297b5466e35ae8d09b7b55b917b3ad4470c97b`. The complete returned report is retained verbatim in `2026-10-21-2042-reviewer-r1-review.md`. No Critical or Minor finding was reported; all three Important findings were accepted after inspection and reproduction.

1. Detached async lock authority, P1: accepted. A genuine native frame's capability remained visible after release through inherited async context. Added the reported detached-callback acquisition probe while another session holds the physical lock. Native capabilities now have a live WeakSet membership, invalidated in the owning frame's `finally`; owner access and in-process reentrancy require that membership. Genuine nested and sibling behavior is retained. No environment token can establish this capability.
2. Missing owned cache, P2: accepted. Added a failing acquired-claim assertion after cache deletion and an additional failing symlink-replacement case. Acquired assertions now validate the entire physical directory chain, ownership and private cache modes without recreation or network. The original pure assertion seed retains its specified structural behavior.
3. Individual claim loss, P2: accepted and independently reproduced by the author with an actual second worktree. A retained per-issue presence record is now synchronized before cache creation and final claim publication. It contains only registry/claim/identity identifiers, not pending content. Missing or inconsistent presence, or presence without the final claim, refuses acquisition. Local persistent assertion validates the same presence. This makes partial publication and loss unavailable rather than permission for automatic takeover. An unfinished first publication intentionally requires future governed recovery; no implicit retry can erase its evidence.

### Repair verification

All three original cases failed before implementation: integration 28 passed / 3 failed. The lock repair changed that to 29 passed / 2 failed. Adding the physical cache symlink regression produced 29 passed / 3 failed; cache validation then produced 31 passed / 1 failed. Per-issue presence resolves the remaining takeover case. The final focused writer and native-lock selection passed 81 tests, zero failures. The existing persistence fault fixture now fails specifically at final claim publication, after presence/cache creation, and verifies a subsequent acquisition refuses the retained incomplete publication. This preserves its original failure-boundary purpose after the safer ordering change.

Before these review repairs, the standard fast suite passed all 984 files; full format check passed. Full lint passed JavaScript but caught Markdown MD018 because issue-number prose began a line with a hash. That documentation sentence was corrected and Markdown lint passed. Those earlier checks do not substitute for final-head verification after the runtime changes.

### Explicit rulings on every declined boundary

- Explicit handoff/export/reassignment/recipient verification: remains Task 9/#2057. Task 8/#2056 owns the shared registry reference API. The original review packet misstated that task number; the verbatim report is preserved, and this ruling corrects the mapping against the active plan. Neither later slice is claimed complete by Task 7. This slice refuses transfer or lost evidence; it does not release or replace claims automatically. Later handoff must preserve both presence and claim identity under its native transaction.
- Public staging/publication/local-hook routing: remains in later accepted slices. The new exported foundation supports their ownership checks; no live public writer migration is claimed here.
- Independent machines/arbitrary GitHub editors: no server lock is claimed. The shared physical repository registry coordinates cooperating local worktrees; host changes refuse automatic acquisition.
- Assignment observation authenticity/freshness: native consumers own collecting a bounded current-target observation. This pure gate validates exactly the supplied assignment; no cached observation is promoted into live cloud authority and no remote read feeds estimation.
- Original plain claim seed: retained exactly as the technical contract requires. Its structural tuple check is distinguished from acquired claims, which carry a registry key and revalidate persistent ownership plus physical cache presence. Consumers must use a genuine acquired claim and their native admitted identity.
- General payload validation/destruction survival: accepted store owns full payload integrity. This slice refuses missing/unsafe cache and registry evidence; no survival after arbitrary simultaneous destruction of every ownership/pending artifact is claimed.
- Native lifecycle/CI/merge/delivery authority: retained with the orchestrator's native workflow. Independent artifact review grants none of those permissions. Full final-head CI, native Test, same-target orchestrator Review/approval and native Close remain required; aggregate PR #2081 waits for all 32 children and root gates.

## Pending follow-up

A repair review must inspect these changes and reproduce the new boundaries before native acceptance. All findings, additional rounds and author dispositions will be committed; no finding is waived or silently deferred.

## Round 2

The same independent Sol / medium reviewer inspected `cf297b5466e35ae8d09b7b55b917b3ad4470c97b..57eeb00d5f2a3db7a5918254d043b14fe7bdef7b` and independently passed 84 focused tests. The full report is retained verbatim in `2026-10-21-2042-reviewer-r2-review.md`. It confirmed all first-round repairs and identified one remaining Important P1: an acquisition can start under a live borrowed frame, yield, then continue after the enclosing owner expires.

Accepted and reproduced in both new-acquisition and existing-owner paths: integration 32 passed / 2 failed. Acquisition now retains the original owner object and revalidates that exact live capability and registry identity after every awaited store operation, before final publication or successful return. It cannot adopt a later frame's capability. Initial presence written under genuine ownership remains retained if private initialization becomes incomplete; an expired operation returns unavailable rather than an owning claim, and a later implicit acquisition refuses that unresolved presence. The repaired writer/native-lock/environment/publication selection passed 86 tests, zero failures.

Explicit author rulings on every round-2 declined behavior:

- Task 8 registry APIs: next slice consumes this single pointer authority; this task does not claim register/resolve APIs complete. No duplicated pending-content store is authorized.
- Task 9 handoff/export/reassignment/recipient verification: remains its accepted later slice; no automatic release, replacement or receipt is manufactured here.
- Public staging/publication/local-hook routing: remains in its later accepted slices; the stronger local assertion is available as a foundation.
- Independent machines/arbitrary GitHub editors: the local registry is not a server-side lock. Foreign host identity refuses automatic ownership.
- Assignment observation freshness/authenticity: native consumers own obtaining a current bounded observation; the local gate never turns an old or supplied snapshot into independent live authority.
- Original plain assertion seed: remains a structural check as pinned. Acquired claims retain their stronger persistent/cache validation.
- Payload integrity/destruction survival: accepted store and explicit recovery own complete payload validation; this writer refuses known missing or unsafe evidence and makes no backup-survival claim.
- Native lifecycle/full CI/merge/delivery: remains governed and unperformed for this child; a clean artifact review cannot satisfy those gates.

The second local fast-suite run passed all 984 files and format check passed before this final continuation repair; they are not final-head evidence. Full lint reached spelling and found only the existing native error token EISSUELOCKED in the new module/test. Narrow per-file spelling directives retain that exact error code; no check or runtime behavior is waived. Final verification and repair review remain required.
