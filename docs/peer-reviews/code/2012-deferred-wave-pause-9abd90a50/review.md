# Independent review of #2012 consumer completion sequencing

## Verdicts

- **Specification: PASS.** The bounded completion-sequence clarification remains consistent with the approved scope and retains the explicit unknown-condition fail-closed requirement.
- **Code: ChangesRequested.** One new P1 finding, R5-1, violates that requirement.
- **Exact bounded local-tarball adoption: Refused.** Package provenance is sound, but the same semantic defect reproduces in the immutable package.

The prior approval at 23bc32648a71920f20d3dd91da9aadadcf98a1cc remains valid historical evidence for source fa1fe791153be656600f35c56c67051d7932684b and its exact package. It does not approve this candidate.

## Reviewed identities and scope

Source: 9abd90a50bc83ddf57d6f296dd1c5889431d1876.
Fix base: fa1fe791153be656600f35c56c67051d7932684b.
Publication head before review: 9ee6d5bed8456ab68170009f670cdb0ee7e71179.
PR: <https://github.com/kburson/ai-task-manager/pull/2013>.

The same standalone Astra 6/high reviewer chat 01a138f7-8083-7d31-9344-a35863d2499e performed this review directly, separate from Sol author chat 01a138e5-7d07-7671-883d-e4ef5d43f917. No subagents, identity/environment overrides, guard changes, primary checkout edits or production fixes were used. This is an independent report, not a sealed SPR/XPR receipt.

Current boot, adapter, Tier-1, preferences and live #2012 were read. Before binding, author active state and central #2012 occupancy were absent. Registered Start resumed the real reviewer in the recorded worktree/branch with active Develop timer and generation 2b804158-8bc9-4224-829d-3d2d451d2b14. Explain returned ready with test-develop-finalization-pending. No lifecycle transition was performed. Registered Stop and read-only discharge checks follow publication.

Scope was the bounded numeric current-wave finish/complete-then-stop sequence, attached future-story boundary and new breakage in that diff. Production edits remain confined to epic-rank-wave-source.mjs, with corresponding loader regressions and additive plan clarification. Eight inherited modules were checked without reopening their features.

## R5-1 — P1: Unknown guard prefixes receive the completion-sequence exemption

Location: scripts/task-tracker/lib/epic-rank-wave-source.mjs, lines 424–429.

The new sequence matcher permits arbitrary text before a comma-delimited finish/complete sequence, then rejects only a finite list of guard words. Unrecognized conditions therefore qualify as an explicit unconditional completion boundary. Through the real native loader/verifier, the exact selected original grant followed by:

> Provided CI is green, finish wave 4, then pause epic #2 rank 4.

returns verified on both source 9abd90a50 and its package. The clean fa1fe7911 fix base returns blocked with rank-wave-source-contradiction. Under the approved contract, the unfamiliar outer predicate must remain fail-closed; naming the current wave inside it cannot exempt the matching stop.

Four further reproductions have the same source/package result and previously blocked:

- Subject to approval, finish wave 4, then pause epic #2 rank 4.
- On condition that tests pass, finish wave 4, then stop epic #2 rank 4.
- Possibly, finish wave 4, then pause epic #2 rank 4.
- Provided CI is green, finish wave 4, then pause before #8.

These are one defect at the same prefix-validation boundary, not five separate findings. The implementation should recognize the bounded independent operational prefix needed by the actual consumer sequence without treating every unknown prefix as proof of an unconditional completion predicate. Add loader regressions for these guarded cases and retain the exact consumer sentence, immediate-stop placement and unrelated-scope controls. No production fix was made during this review.

## Corrected behavior and verification

The exact actual-consumer sentence now verifies:

> A — create and coordinate the two AITM chats: Sol 6.1/high to finish #2012, then Astra 6/high to review it. Resume #5 and #7, finish wave 4, then pause before #8 and save the handoff.

The source does not turn this sentence into a standalone grant. Fresh focused tests cover standalone/later-wave refusal, changed hash, chronology cutoff and live late revocation. The independent immediate-stop controls before and after deferred sequences pass, as do matching revocations, negative admission commands, neutral operations and explicitly unrelated epic/wave stops.

- Fresh focused source and deferred-pause tests: **159 passed**, zero failures; see focused.log.
- Fresh three-way native loader/verifier replay: **147 inputs**, comprising all **88 prior independent inputs**, **15 author consumer/control inputs**, and **44 new independent controls**.
- **142 meet expectations; five fail** for R5-1. All 147 source/package outcomes agree. The exact consumer sentence changes from blocked on the fix base to verified on the candidate, while the five guarded inputs also change from blocked to verified incorrectly. Exact expectations and results are in comparison.json.
- All eight author verification entries had raw/committed hashes independently checked and their result summaries inspected. The 231 affected tests, 19 adjacent tests, 961 fast files, full lint and format remain author evidence, not fresh reviewer suite runs. The documented title-only correction and initial RED/lint-failure logs remain preserved.
- All four prior report files match their committed contents. The previous approved package hash is unchanged. Reviewer edits are confined to this new report/evidence folder.

Replay fixture: test-owned native JSONL session review-r5-test, repository o/r, epic 2, rank 4, members [4, 5, 6, 7, 14]. Selected human message at 2026-10-14T00:40:00Z is Authorize parallel execution for epic #2 rank 4 stories #4, #5, #6, #7, #14. The selected message ID and statement hash are passed unchanged to verifyRankWaveSource. Each later input appears at 00:45:00Z and is loaded through createRankWaveSourceLoader. The same fixture is run against source, a clean Git archive of fa1fe7911 and the extracted candidate package. This is synthetic regression evidence, not a changed real transcript or native identity.

## Verified artifact identity, adoption refused

Absolute local tarball: /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/2012-deferred-wave-pause/.scratch/runtime/2012-9abd90a50/kburson-ai-task-manager-0.1.0.tgz.

- Size: 3006659 bytes.
- SHA256: 1e4beb5e12657cacb0335d100cdc317e7f45eb2fd062ea47c28cb9f47a20bebb.
- SRI: sha512-EYorihVJdRlkk6FKVdmtn7xfXxLPPYZDgjB8O0KhbwgzpRmbz4RP2pXJiauqXoQu08V61XjwzoiQ7eNAahnCSA==.
- Grammar SHA256: 3498a702beb7c75694db8c6f846e7b5a331118fc569d8c74292f9dfce7054b64.
- Regression SHA256: 99cd8dd50a05d7b61a084be36ac2a1fa8e989969c5758da290d441d8b921ddfc.
- Author report SHA256: 6c09ad14c4124f5aab988cae96bca30cedca1d2173b7f42f5dfb32c3516feac4.

All **917 regular packed files** match a clean archive of the pinned source byte-for-byte. Inventory paths, sizes, SHA256 and Git blob identities agree. Raw and committed inventory hashes match published values; the committed wrapper contains exactly the raw file array. All eight inherited modules/entrypoints are unchanged from accepted base 2fd90eb3f84f442e0329783943ed432b45d25473. Publication adds only package comparison/inventory/provenance collateral. Details: package-check.json.

## Remaining boundaries

R5-1 requires correction and a fresh exact-source/package review before adoption of a new candidate. The historical fa1 approval remains bound to its original artifact; actual consumer failure on that artifact was the reason for this bounded follow-up.

Full upstream slow/canonical Test/Review/Done remain pending. PR 2013 remains a draft. No upstream merge or close, global or consumer installation, actual native admission, active-wave readiness or downstream #5/#7 completion is asserted by this review.
