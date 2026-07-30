<!-- aitm-skill-version: 1.0.0 -->

# rules/close.md

Tier-2. Loaded JIT on `/task close`. On first read, emit:

```
aitm-skill-loaded:rules/close:1.0.0
```

## Human-only step

`/task close` is the **only** sanctioned close path and may run **only after explicit human instruction** ("close #N", "mark #N done", "review accepted, close it"). All-checkboxes-checked is **not** human approval.

The verb atomically:

1. Flushes timing (`+0` close row).
2. Updates board fields.
3. Deregisters from the fleet.
4. Invokes `move-state.mjs <N> done` internally.

Engaged Time and Session Time were flushed at `/task review` — not at close.

## Forbidden

- ❌ `gh issue close` directly — bypasses timing flush, corrupts the velocity ledger.
- ❌ `move-state.mjs <N> done` directly — same reason. `/task close` does this internally.
- ❌ `/task close` without explicit human instruction.
- ❌ `/task close` immediately after implementation verification. The correct terminal step is `/task review`.

If no task session is active and you need to mark an issue done: run `/task #N` first to register, complete any verification, then `/task close`.

## Pre-Close Gate (exit 3)

If `/task close` exits 3, unchecked items exist. The CLI prints them to stderr. Show the list, then:

1. Ask: "Would you like me to verify and resolve these items first, or close anyway?"
2. **Default behavior is resolution.** Walk each: verify by inspection + run the test/build/command, then `/task ensureChecked "<label>"`. Then `/task review` → human approval → `/task close`.
3. If the user explicitly says close anyway (legitimate abandonment): drag the card to Done in the GitHub Projects UI, or delete the issue. No env override exists for the script-driven path.

## Current Review-authority gate (exit 7 / 8)

When `gateReviewToDone=true` (default), `/task close` requires one current
Review-authority projection. A historical approval marker or checked lifecycle
box is not sufficient. Authority is current only when all of these agree:

1. The persisted `aitm-dod-verified` marker names the Test SHA.
2. The latest Review epoch has a passing `aitm-agent-review-proof` for that SHA.
3. An `aitm-review-approved` marker binds the same epoch and proof SHA, with
   truthful `provenance="human"` or `provenance="full-auto"`.
4. No later `aitm-review-invalidated` marker or active Agent Review failure
   invalidates that authority.

Demotion and demotion-shaped reconciliation invalidate current authority, as
does an Agent Review failure. The old proof and approval remain in the body for
audit, but cannot authorize close. Repair by re-running Test, Review, and
approval in order. Never repair by hand-ticking `Final Review Passed` or editing
hidden markers.

- **Exit 7** — current approval authority is missing, stale, or invalid. After
  current Test and Agent Review proof exist, record the real approval. For
  approval given in chat, run `/task approve #N --human`. In Full-Auto, run
  `/task approve #N` under the authorized Full-Auto signals; it writes the
  consolidated `aitm-review-approved` marker with Full-Auto provenance and
  signals. Do not create or rely on the retired standalone
  `aitm-full-auto-approved` marker.
- **Exit 8** — `--answer yes` passed in an attempt to satisfy the gate. The flag
  does NOT satisfy this gate; it satisfies only the dirty-workspace gate.

`gateReviewToDone=false` bypasses this gate; the bypass is logged as a `gate-bypassed` row.

## Dirty-Workspace Gate 2 (blocking at close)

Inspects `git status --porcelain` in the issue's bound workspace (fleet-registered worktree path; falls back to project dir). Outcomes:

| State                                     | Result                                                                                                                                                                                                                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean                                     | Proceeds to Functional DoD derivation (`acs`, `checkboxes` — see `rules/functional-dod.md`) and then the pre-close checkbox gate.                                                                                                                                                           |
| Dirty + `--answer yes`                    | **Exit 6.** Refuses; prints the cleanup-flow guidance below. Clean up, then re-run `/task close <id>`.                                                                                                                                                                                      |
| Dirty + `--answer no`                     | Closes anyway; appends `closed-with-dirty-tree` audit row (dirty paths summarized, capped at 5).                                                                                                                                                                                            |
| Dirty + `--answer cancel`                 | Aborts (exit 0, no board change, no timing row); issue stays in Review.                                                                                                                                                                                                                     |
| Dirty + no `--answer` + `CI=1` (headless) | Exit 5; refuses. Headless callers MUST pass `--answer`.                                                                                                                                                                                                                                     |
| Dirty + no `--answer` + interactive       | **Exit 5.** Emits `PROMPT_REQUIRED: dirty-close-confirm #<N>` on stdout (before exiting), makes no board change. Surface the prompt, re-invoke with `--answer yes\|no\|cancel`. The non-zero exit lets `promote` detect the blocked close instead of reporting a false `✓ promoted` (#710). |

**Cleanup flow** (printed on `--answer yes` refusal):

```
1. Inspect: git status
2. Stage + commit issue-relevant changes for this issue ONLY.
3. For unrelated changes: stash (`git stash push -m "…"`) or move to a separate branch.
4. Re-run: /task close <id>
```

**Known limitation:** the fleet registry stores one `worktreePath` per issue. If multiple worktrees are bound to the same issue, only the last-registered path is checked.

## Estimation delta comment

`/task close <N>` posts a `### 📊 Review delta` comment recording Estimate vs. Actual hours. This comment is **read-only**: Size and Estimate are not changed at close. Bypass with `TASK_TRACKER_SKIP_DELTA=1`.
