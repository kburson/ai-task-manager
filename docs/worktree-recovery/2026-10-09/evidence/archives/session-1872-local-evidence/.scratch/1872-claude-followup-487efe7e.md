[04:02:35]
I've finished checking the source, promote, lock and runtime corrections. Here is the report.

**NOT READY.** M-a through M-d are fixed. N1 and N2 are only partly fixed, and the N2 correction makes things worse in one direction: a human message that clearly reverses the wave no longer refuses it.

**Scope:** I reviewed `0c06b5aa` to `487efe7e` against base `171c7d93` by reading the code only (Read/Grep/Glob). I ran no tests, no git and no CI, and spawned no agents. Plan mode was on, but I wrote no plan file because you asked for no edits. Test receipts, CI results and timing fields are outside this static review.

## Status of the earlier findings

| Finding | Status |
|---|---|
| M-a | **Resolved.** `promote.mjs:864` sends `guard-refused` to the drift branch, which exits with code 4. A test covers the public verb. |
| M-b | **Resolved.** The release step now renames the holder file to a tombstone, then checks the inode and hash through the descriptor it kept open (`epic-admission-lock.mjs:125-158`). That open descriptor stops the inode from being reused. `linkSync` restores the file without overwriting anyone. The race test drives the old window. A small leftover window is listed under Minor. |
| M-c | **Resolved.** Real paths are compared on both sides (`epic-rank-wave-runtime.mjs:63-65`, `epic-rank-wave-bindings.mjs:151-170`). I found no other place that compares raw worktree paths. |
| M-d | **Resolved.** The catalog and help text now match how the commands behave. |
| N1 | **Partly resolved.** The proposal reply must now be a whole affirmative reply (`:389`), and `no`, `never` and `not yet` now refuse (`:245`). Two paths still grant on a word search (R2, R3). |
| N2 | **Liveness mostly resolved.** The 64-message bound is gone, and another rank or epic no longer refuses. **But it introduces a fail-open defect (R1)** and keeps one liveness gap (R4). |

## Important (blocking)

**R1 — Scoped human reversals no longer refuse the wave. This is new in this correction.**
`scripts/task-tracker/lib/epic-rank-wave-source.mjs:298-314`. The broad `contradicts` check was replaced by a short list of exact reversal phrases, even for messages that name this epic or rank. Each of these later messages leaves the grant verified today:
- "Hold off on epic #107 rank 2." The `hold off` pattern only matches when the next word is parallel, concurrent, wave or stories.
- "Do not proceed with epic #107 rank 2 in parallel."
- "Epic #107 rank 2 is not approved."
- "Pause epic #107 rank 2."
- "Let's go sequential for epic #107 rank 2." The verb `go` is not in the list.

At `0c06b5aa` every one of these refused. Later statements can only ever refuse, so missing them is the authority-granting failure.
- **Fix:** if a message names this epic, rank or members, apply the full `contradicts(text, purpose)` vocabulary. Keep the narrow phrase list only for unscoped messages that contain wave words.
- **Tests to add:** the five messages above, each placed after an unrelated message.

**R2 — A full-scope human message still authorizes on a word search (the direct sibling of N1).**
`epic-rank-wave-source.mjs:359,369-382`. When the reply contains `complete(partial)`, `wholeAffirmation` is skipped, so any `run`, `allow` or `yes` anywhere in the text counts. `contradicts` doesn't catch `not`, `n't`, `later` or `until`. These verify today:
- "Let's not run parallel epic #107 rank 2 children [140,144,145] until CI is green."
- "We shouldn't run parallel epic #107 rank 2 children [140,144,145]."
- "Run parallel epic #107 rank 2 children [140,144,145] later."

The owner's ruling says negated and deferring replies refuse. The tests only cover `Never…` and `No.…`.
- **Fix:** require the message to start with an imperative (optionally `yes, `, `please`, then enable/authorize/approve/allow/run/proceed). Refuse any `\bnot\b`, `n't\b`, `later`, `until` or `after`.

**R3 — The polarity of the assistant's proposal is never checked.**
`epic-rank-wave-source.mjs:206-228` and `:389-399`. `proposals()` only needs the scope and a `parallel` keyword. Examples:
- Assistant: "Should I keep epic #107 rank 2 children [140,144,145] sequential instead of parallel?" Human: "Yes." This records **parallel** authorization.
- The same happens with "Do you want me to hold off on parallel epic #107 …?"

This is the same proposal branch as N1, and it already existed before this correction.
- **Fix:** if a proposal line or statement matches `contradicts(line, purpose)` (sequential, hold off, revoke, `?` framing and so on), it can't be chosen.

**R4 — Unscoped wording about sequential runs still refuses the wave and keeps doing so.**
`epic-rank-wave-source.mjs:285-286,306`. The "wave" qualifier list includes `sequential` and `one at a time`, which are also the reversal words. That means:
- "Run the unit tests sequentially." refuses with no epic, rank or member named.
- So does "Keep the Test-stage runs one at a time."

This refuses every rank of every epic authorized in that session. Re-recording only helps until the next such message. This repo routinely asks for staggered or sequential test runs, so the original N2 risk to the rehearsal is still there.
- **Fix:** take `sequential` and `one at a time` out of the qualifier list. Make the sequential branch require a scope or an admission noun (parallel, wave, stories, children).

## Minor

- **Over-broad "immediate reply" rule** (`epic-rank-wave-source.mjs:141-146,317-321`). "Immediate" means the first later human message after the first referenced message, however many assistant turns come between. If the controller asks an unrelated question after recording ("Should I push?") and the human answers "No.", the grant is refused permanently until someone re-records. Fix: limit it to the human message directly after the last referenced message, with no assistant turn in between.
- **Short race window during release** (`epic-admission-lock.mjs:126-137`). Between the rename and the restore, `holder.json` is missing. If a newly installed live holder finishes inside that window, its `finally` finds no holder and keeps the lock directory, leaving an orphaned lock that needs a manual release. Nothing is evicted wrongly, but you need concurrent manual releases and a sub-millisecond window to hit it.

## Test gaps

- No test covers the scoped reversal phrasings in R1.
- No test covers direct negation with `not`, `shouldn't` or `later` (R2).
- No test pairs a negative or sequential assistant proposal with "Yes." (R3).
- No test checks that unscoped "run tests sequentially" leaves the grant in place (R4).

**Verdict: NOT READY** for `487efe7e`.
- **Blockers:** R1, R2 and R3 can each leave a non-approving or reversing human message recorded as host-verified authority. R4 will still refuse genuine waves during normal orchestration.
- **Not blocking:** the two Minor items.
