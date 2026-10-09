[03:41:19]
**NOT READY.** Most of the corrections hold up. Two Important problems remain, both in the human-authority source logic: one can record a non-approving reply as authorization, and one will refuse genuine waves during normal use.

**Scope and limits:** I reviewed base `171c7d93` to HEAD `0c06b5aa` statically, using only Read/Grep/Glob. I ran no tests, no CI and no git commands. I accept your Test, CI and CodeQL results as reported. I did not judge the timing-log evidence.

## Original findings: status

| Finding | Status | Notes |
|---|---|---|
| I1 | Resolved | `promote.mjs:742-775` takes the parent lock only for R4P→Plan and Plan→Develop. A Develop→Test or Review→Done run holds only the child lock. If the state changes after the read, it refuses under the child lock and never takes the parent lock second. A stale body marker can't bypass this, because `runPromote` (`promote.mjs:332`) refuses when the board and the marker disagree. |
| I2 | Resolved | The new release path rechecks the exact observation, a dead PID, and the directory and file identity. See minor M-b for one race. |
| I3 | Resolved | `fetchEpicChildren` passes the option through `deps.waveAdmission` (`epic-children-gate.mjs:59`). Legacy and ungranted reads never touch occupancy. See minor M-c. |
| I4 | **Partially resolved** | The whole-reply label fix works. The unlabeled "affirmative word" path still grants authority (N1). |
| I5 | Resolved for granting, **but adds a liveness defect** | See N2. |
| I6 | Resolved | Only the latest authorize/revoke record re-verifies its source. Every revision is still structurally checked. A fresh authorization can replace a missing old transcript. |
| M2, M3, M4, M5, M9 | Resolved | |
| M1, M6, M7, M8, M10, M11, M12 | Rulings accepted | These rest on documentation or deliberate fail-closed choices. I see no evidence against them. |

## Important

**N1. Negated or deferring replies still count as authorization.**
- **Where:** `scripts/task-tracker/lib/epic-rank-wave-source.mjs`, the `affirmative` regex and the proposal branch of `verifyRankWaveSource`.
- **How:** with an assistant proposal on screen, any human reply that contains `run`, `allow`, `proceed` or `yes` authorizes the single (or recommended) proposal. The reply only has to avoid the contradiction word list (`do not`, `don't`, `cancel`, `not approved`, `hold off`, `wait`, sequential and similar).
- **Examples that verify today:**
  - "Never run this."
  - "Not yet — proceed with lint first."
  - "No. I'll run it myself later."
- **Why it matters:** these are recorded as host-verified authority. This is the same class of defect as I4, through a sibling path.
- **Fix:** in the proposal path, require the reply to be affirmative as a whole, the same way `selection` now works. That means an anchored allowlist such as `^(yes|approve[d]?|proceed|go ahead)[.!]?$`, not a word search.
- **Tests to add:** "Never run this.", "Not yet, proceed with lint" and "No." should each be blocked.

**N2. The scan for later human messages will refuse valid waves in normal use.**
- **Where:**
  - `epic-rank-wave-source.mjs`: the loader's `laterHumans` scan, `contradicts`, and the 64-message bound.
  - `epic-rank-wave-store.mjs`: `verified()` and the ungranted-path head check call `verifySource` with no `through` cutoff.
- **What happens:** each admission rescans every later human message in the source session up to now. Three things then refuse the wave permanently:
  1. **Unrelated wording.** Any later message without an epic number that contains `wait`, `don't`, `do not`, `cancel` or `one at a time` counts as a contradiction. Examples: "wait, check CI first" or "don't push yet". The `partialScope` epic skip only helps when the message names a different epic.
  2. **Authorizing the next rank.** "Run parallel epic #107 rank 3 children [160,161]" in the same session matches `hasIntent` with a different rank, so it is treated as contradicting the rank-2 grant. The remaining rank-2 admissions are then refused. The ungranted loop re-verifies every adopted wave's head, so every ungranted rank of the epic is refused too.
  3. **A long session.** After more than 64 later human messages, the loader throws. Every rank-wave admission for the epic fails until someone re-records.
- Any later message that names two different epics or two ranks also makes `partialScope` throw, which is another permanent refusal.
- **Why it matters:** the authorizing session is usually the controller's own live chat. This will very likely break the #107 rehearsal. Re-recording doesn't fix it, because the next "wait" refuses again.
- **Fix:**
  - Treat a later message as a contradiction only if it is about this wave: it names this epic, rank or members, or it is a reply to the authorization, followed by explicit reversal intent.
  - Don't treat an instruction for a different rank as a contradiction.
  - Replace the 64-message hard failure with a bounded scan (by time or count) that skips non-scope messages, rather than refusing.
  - Add tests for "wait, check CI", a later rank-3 authorization, and 65 unrelated messages.

## Minor

- **M-a. The new state-change refusal prints as an "unknown status".** `runSerializedPromote` returns `status: 'guard-refused'` (`promote.mjs:759`). `verbPromote` has no case for it, so it falls to `default` and prints "unknown result status: guard-refused" with exit 1. The operator loses the message and the exit code should be 4. Add a case for it, or reuse the `drift-refused` handling.
- **M-b. Two concurrent releases can remove a new live holder.** In `epic-admission-lock.mjs`, `releaseEpicAdmissionLock`, two operators racing: release 2 passes its checks, release 1 removes the lock, a new holder takes it, then release 2 deletes the new holder's file and directory. It needs concurrent manual releases, so the risk is low. A fix: rename the lock directory to a unique tombstone first, then verify the inode inside it before deleting.
- **M-c. Paths with a symlink in them still break ready waves.** `bindingFor` (`epic-rank-wave-runtime.mjs:61-66`) compares an occupancy path built with `path.resolve` against the real (`realpath`) Git root. A worktree reached through a symlink still fails, now only for ready waves. Compare real paths on both sides.
- **M-d. Wording drift in help text.** The `epic-wave` catalog contract says all mutations need the parent admission lock, but `lock-release` correctly doesn't take it. The `help-data` usage line shows `--input-file` as required for every action, though `show` and `lock-show` don't need it.

## Test gaps in the corrections

- Source tests cover the label path but not negated affirmative replies (N1).
- No test runs a current-time admission with unrelated later human messages, a later authorization for another rank, or more than 64 later messages (N2).
- No test covers the `verbPromote` output when the state changes under the child lock (M-a).

**Verdict:** NOT READY.
- **Blockers:** N1, which lets a non-approving reply record authorization, and N2, which will refuse genuine waves during ordinary orchestration.
- **Not blocking:** the M-a to M-d minors.
