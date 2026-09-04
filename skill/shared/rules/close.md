<!-- aitm-skill-version: 1.0.0 -->

# rules/close.md

Tier-2. Loaded JIT on `/task close`. On first read, emit:

```
aitm-skill-loaded:rules/close:1.0.0
```

## Human-only step

For an enrolled v2 issue, close enters through the common protected-marker selector and installed pinned runtime before any terminal effect. Reopened work is a distinct cycle, and incompatible or incomplete resident runtimes refuse before mutation. Legacy issues without the marker keep the v1 close transaction.

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

## Review-approval gate (exit 7 / 8)

When `gateReviewToDone=true` (default), `/task close` refuses unless the body carries `<!-- aitm-review-approved: <ts> -->`:

- **Exit 7** — approval marker missing. Run `/task approve #N` first (only valid while the issue is in Review, and only after explicit human approval).
- **Exit 8** — `--answer yes` passed in an attempt to satisfy the gate. The flag does NOT satisfy this gate; it satisfies only the dirty-workspace gate.

`gateReviewToDone=false` bypasses this gate; the bypass is logged as a `gate-bypassed` row.

## Reopened completed-close recovery (`--restart-reopened-transaction`, #1490)

**Human-only, and never routine.** Like `/task close` itself, this flag runs only on
explicit human instruction. It exists for one shape: an issue that was **delivered and
closed**, then **reopened** so a corrective delivery could land at a new accepted SHA.
The completed `aitm.delivered-close/v1` transaction survives the reopen with all eight
steps recorded, so an ordinary `close` refuses with
`close-convergence:terminal-state-conflict` — a record asserting the issue was closed
contradicts an open issue. **That refusal is correct and remains the default.**

Do not confuse it with `--restart-stale-transaction` (#1466), which restarts a close
interrupted **partway**: that path accepts at most three completed steps and requires a
null disposition with a ToDo/BLOCKED label. A completed close legitimately removed its
managed labels and set disposition `Delivered`, so its predicates are the inverse. The
two flags are mutually incompatible, as are `--force`, `--repair`, `--as`, and
`--answer`.

The old transaction records a **true historical delivery** and is never hand-retired. It
is superseded by durable evidence, and every one of these must hold before any mutation:

- exactly one valid transaction whose completed steps are exactly the ordered eight;
- its accepted SHA differs from current delivery authority;
- the issue is OPEN with state reason REOPENED, board Review, disposition `Delivered`;
- clean recorded worktree and a pending binding;
- a correlated pull-request/intent/receipt bundle for the **historical** accepted SHA,
  selected from the gate's live PR inventory;
- a correlated bundle for the **current** accepted SHA, plus exact-SHA Test and Review
  authority and the verifier's own delivery output.

No value in that evidence may be asserted, defaulted, or copied from a record and then
compared back to that same record.

**Retry contract.** Recovery evidence is written and read-back verified **before** the
protected marker is replaced, so an interruption between the two leaves recoverable
evidence rather than an unexplained replacement. The recovery identity is a fingerprint
of the intent, so a retry reuses the durable record — including its replacement
transaction id — instead of minting a second recovery. If the marker was already
replaced, the completed original is reconstructed from that durable record, the body is
classified as already-replaced, and the ordinary eight-step saga resumes with no further
comment or body write.

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
