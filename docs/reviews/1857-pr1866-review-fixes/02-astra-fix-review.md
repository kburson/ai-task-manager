# PR #1866 fixes — independent Astra review

**Assessment: fixes required before accepting this revision.** The three original targeted reproductions and clean child-Close fixture checks pass. Two closely related boundary failures remain and were reproduced independently.

## Snapshot reviewed

Source: `/Users/kpburson/.codex/worktrees/1857-pr1866-review-fixes/ai-task-manager`.
Detached base: `d4c42d7809c22acc9576d51da8938952588c207e`.
Reviewed tracked diff SHA-256: `94817a4c5ad0498ad5177e791460ac5d5be6ea6b833861bc1b79b4d62829ec9d`.
Saved patch: `/private/tmp/1866-astra-fixes-reviewed.patch`.
Also reviewed the untracked `scripts/tests/integration/task-tracker/lib/pr1866-review-regressions.test.mjs` as it existed at capture.

The diff and new test were materialized over an archive of the exact base in `/private/tmp/1866-astra-fixes-head`. Tests and adversarial extensions ran there. Neither source worktree, its index/refs, the original WIP, live lifecycle state nor GitHub was modified. The source worktree is being edited by the controller; this review is bound to the captured bytes, not any later changes.

## Findings

### P1 — Resolve the fallback cursor from the state file's owning root

**Changed location:** `scripts/task-tracker/state.mjs:258-263`, specifically the new `loadMarker(markerPathFor(sid), ...)` call.

`loadState(statePath)` derives `projDir` from its explicit input and uses that root for actor-state and binding lookup. The newly added cursor fallback instead uses ambient `markerPathFor(sid)`, whose provider state directory is resolved from cwd/environment. A reader inspecting another worktree's state can consequently import the current worktree's cursor even when the target has no cursor at all. Validating provider/session identity does not distinguish two records for that same session in different worktrees.

**Independent reproduction:** Root A has a valid cursor for the fixture actor with words=500/full=600. Root B has the same actor's binding, no actor timing state and no cursor. With cwd/environment at A, `loadState(B/.tmp/aitm/state/task-tracker-state.json).lastWordMarker` returns **500**, rather than B's empty cursor value **0**. A subsequent save can persist those unrelated words into B's actor history.

Resolve the cursor with explicit `projDir`, for example through a backward-compatible optional owning-root argument to the cursor path resolver. Add a same-provider/same-session two-root regression; wrong-provider/wrong-session tests alone cannot catch this.

### P2 — Apply the no-open-timer departure fix to Stop as well

**Fix location:** the new conditional in `scripts/task-tracker/verbs/pause.mjs:35-39` repairs only Pause. The remaining path is `scripts/task-tracker/verbs/stop.mjs:62-68`, calling the unchanged no-timer producer at `scripts/task-tracker/runtime.mjs:624-635`.

After a successful Test handoff the issue stays bound and its actor timer is closed. `/task stop` is still a valid way to release that binding. Unlike the repaired Pause path, Stop unconditionally flushes and publishes an actor-tagged `stop` without an engagement interval. The reader then reports `actor-end-without-start`, retaining the same canonical-history/Close failure established by the original review.

**Independent reproduction:** Flush the fixture's active interval, apply `pauseTimingKeepBinding`, invoke the real `verbStop`, and derive actor engagement from its emitted rows. Stop reports success but the reader returns `actor-end-without-start:<actor-key>`.

Extend idempotent no-open-timer handling to Stop, preserving its binding/occupancy-release behavior, or fix the shared producer so legitimate no-op departures cannot create malformed timing. Keep the guard against genuinely unmatched historical actor departures.

Both reproduction failures and stack traces are in `/private/tmp/1866-astra-fixes-boundaries.log`. The temporary adversarial fixture is `/private/tmp/1866-astra-fixes-head/scripts/tests/integration/task-tracker/lib/astra-fixes-boundaries.test.mjs`. Run it with `node --test --test-name-pattern='review boundary' scripts/tests/integration/task-tracker/lib/astra-fixes-boundaries.test.mjs` from that snapshot, with inherited task/provider/Git identity variables cleared as below.

## Confirmed repairs and verification

Fresh independent focused run: **16/16 pass**, `/private/tmp/1866-astra-fixes-tests.log`:

- Original own-session upgrade cursor case now flushes 100 → 103.
- Repeated explicit Pause after Test and Review handoffs emits no extra departure and leaves valid timing.
- A real Git-registered production Test sandbox at the new durable namespace is admitted by the root resolver.
- All three `child-close-telemetry.integration.test.mjs` tests execute and pass under an explicit isolated fixture actor.
- Actor state isolation and sandbox path uniqueness tests pass.

Files selected:

```text
scripts/tests/integration/task-tracker/lib/pr1866-review-regressions.test.mjs
scripts/tests/integration/task-tracker/verbs/child-close-telemetry.integration.test.mjs
scripts/tests/unit/task-tracker/lib/actor-state-isolation.test.mjs
scripts/tests/unit/task-tracker/verbs/test-verb-sandbox-worktree-path.test.mjs
```

Subprocesses stripped inherited `AI_TASK_MANAGER_*`, `TASK_TRACKER_*`, `AITM_*`, `CLAUDE_*`, `CODEX_*`, `GIT_*` and `TT_*` values. Fixture identities were local, and production source was not changed in the temporary snapshot. Only copied dependencies, Git fixture metadata/data and the adversarial test extension were added. Tests used the existing explicit fixture adapters and local transport seams.

The new shared `testSandboxDirectory` keeps creation and new-namespace reaping consistent. The Close helper restores its prior environment after setting explicit fixture identity and initializes through the production state writer. Those changes are appropriate for the defects under review.

## Pending work already acknowledged by the controller

- Ignore the new runtime sandbox namespace before accepting the relocation; otherwise newly created detached worktrees appear as untracked parent-worktree content.
- Strengthen tests for the new reaper namespace, live-PID/foreign-path exclusion, and invalid/foreign cursor fallback. These changes were not present in the reviewed snapshot and are not silently credited.
- The controller's clean `npm test` is a **fast/unit** lane, not a complete integration run. Its final result was not used to establish this review's verdict. This review claims only the 16 passing focused checks and two failing adversarial cases above.

No additional speculative defects or unrelated implementation scope are requested. Re-review the root-aware fallback, Stop handling and the pending namespace/tests after their final bytes are saved.
