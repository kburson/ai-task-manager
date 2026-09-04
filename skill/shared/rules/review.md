<!-- aitm-skill-version: 1.2.0 -->
<!-- aitm-rule-id: review -->

# rules/review.md

Tier-2. Loaded JIT on `/task review`. On first read, emit:

```
aitm-skill-loaded:rules/review:1.2.0
```

## Agent terminal step

For an enrolled v2 issue, Review enters through the common protected-marker selector and installed pinned runtime. The designated authority host, runtime capability, and complete resident-entry inventory must validate before mutation. A malformed marker or incompatible runtime refuses instead of falling back to v1.

`/task review #N` is the **terminal automation step** for an agent on an issue. After it succeeds:

1. The issue moves to **Review** on the project board.
2. A `review` row is flushed to the ⏱ Timing Log.
3. The active timer is paused.
4. The CLI emits `PROMPT_REQUIRED: review-approval #N` on stdout.

Stop. Do not run `/task close`. Do not infer human approval from passing tests or checked boxes.

## Pre-review verification (mandatory, in order)

Review does **not** own verifier execution. `/task test` already ran the declared commands and wrote an exact-SHA receipt. Invoking `dod-stamp` or `ac-stamp` in Review may only reuse a validated matching receipt; if reuse is unavailable, the stamp must refuse without spawning. `/task review --probe` for a named finding is the sole Review-stage execution path.

1. **Confirm the Test receipt.** `/task test #N` no-ops when a valid exact-SHA receipt matches HEAD. If it refuses (missing/stale/red), demote and re-Test — do not spawn the suite from Review.
2. **Per-AC / Per-DoD ticks.** Tick remaining boxes from existing receipt evidence (`/task dod-stamp` / `/task ac-stamp` validate and reuse a matching receipt; they never execute in Review). Never bulk-check. `acs` and `checkboxes` are derived by `/task close`.
3. **Current AC citations.** Every demonstrable AC must carry an `aitm-verified vc-list="vc:N"` citation, and every cited ID must resolve under the root `## Verification Commands` section. An honestly non-demonstrable AC carries its explicit opt-out instead. Functional DoD items retain their own command declarations.
4. **Named finding only:** `/task review #N --probe "<command>"` is the only Review-stage command execution.
5. **Run `/task review #N`.**

For epics: `/task review` refuses if any sub-issue is not already in Review. Drive every sub-issue to Review first.

## Review-approval prompt

When you see `PROMPT_REQUIRED: review-approval #N` on stdout, surface a structured human decision:

- In Claude Code: invoke `AskUserQuestion` with options **Approve** and **Reject**.
- **Approve** → `/task approve #N` (writes `<!-- aitm-review-approved: <ts> -->` marker), then wait for explicit human "close" instruction before `/task close #N`.
- **Reject** → ask follow-up for the rejection reason, then `/task reject #N --reason "<reason>"` (posts a `### ❌ Review rejected` comment and moves the issue back to Develop).
- **Dismiss / no choice** → `/task pause "review-prompt-dismissed"`. Issue stays in Review.

The marker fires for leaf, sub-issue, and epic alike — only on the successful path. Non-zero exits (cascade gate, verification gate) do not emit the marker and do not require the prompt.

**Full-auto bypass.** `gateReviewToDone=false` in `.ai-task-manager/task-tracker.json` lets `/task close` proceed without the approval marker; the bypass is logged as a `gate-bypassed` row.

## Dirty-Workspace Gate 1 (warning only at review)

The review verb inspects `git status --porcelain` in the issue's bound workspace. If dirty:

- Stderr prints a summary of dirty paths (capped at 10 entries + `… +N more`).
- The move to Review still proceeds.
- Disable with `TT_SKIP_DIRTY_CHECK=1` only in test contexts.

Gate 2 (blocking at close) lives in `rules/close.md`.

## Pre-review unchecked items (exit 3)

If `/task review` exits 3, unchecked items exist in the body. The CLI has already listed them on stderr. Show them to the user, then:

1. Ask: "Would you like me to verify and resolve these items first, or proceed anyway?"
2. **Default behavior is resolution.** Walk each item: verify, then `/task ensureChecked "<label>"`. Re-run `/task review #N`.

No env override exists. The pre-review checkbox gate cannot be skipped from the script path.

## Epic review rule

When all sub-issues in the current sequence reach Review, the orchestrator MUST call `/task review #<epic>` on the parent epic **before** notifying the human. Running `/task review` on the epic is orchestrator work, not human work. The epic gate enforces this — the epic cannot move to Review until all its sub-issues are already in Review.

Do not report `ISSUE_READY_FOR_REVIEW` or notify the human until the epic itself is in Review.

## Field units

The project-board `Estimate` is denominated in **hours**; the timing fields
(`engagedTime`, `sessionTime`, `reviewTime`) are denominated in **minutes**.
The Review delta renderer normalizes both to seconds and displays `H:MM:SS`.
If you read these values directly (board API or `aitm-fields` JSON), **do not
compare them raw** — a 3-hour estimate vs. a 22.5-minute actual is −87%, not
+650%. Internal compute is second-precision; the board still stores rounded
minutes.

## Full-Auto footnote

When `/task approve` runs under `TT_FULL_AUTO=1` (or any signal `detectFullAuto`
fires on), it appends a visible blockquote footnote under the Lifecycle DoD
subsection between `<!-- aitm-full-auto-footnote:start -->` and
`<!-- aitm-full-auto-footnote:end -->` delimiters so a reader can see at a
glance that no human reviewed the issue. The hidden `aitm-full-auto-approved`
marker still records the audit signals. The footnote is idempotent (re-runs
replace the block in place). `gh-edit-guard` protects the delimiters from
accidental drop. If the body lacks a recognized `Passed final human review`
checklist line, approve emits a stderr warning
(`approve: lifecycle-tick-noop`) but does not fail.

## Genuine human approval overrides (`--human`)

`detectFullAuto` only sees env/tty/CI signals, so it cannot tell a real human
approval from an unattended run whenever `TASK_TRACKER_HUMAN_REVIEWER` is
unset — the common case for a human approving from a chat client rather than
a CI wrapper. Two signals suppress the Full-Auto marker/footnote regardless
of env:

- The body's `Passed final human review` lifecycle checkbox was already
  ticked (a human approved via the GitHub UI before `/task approve` ran).
- `/task approve #N --human` was passed explicitly.

Use `--human` when the user has approved the review in chat (e.g. said
"Approved") and has not touched the GitHub UI checkbox — pass it so
`/task approve` records a genuine, non-full-auto `aitm-review-approved`
marker instead of stamping `full-auto="yes"` and inserting the footnote.
Never pass `--human` unless a human actually approved; it is not a bypass
for skipping review, only a correction for the env-detection blind spot.
The same body marker is honored by the review→done `enforceFullAutoAudit`
gate, so a genuine approval recorded here also suppresses the Full-Auto
audit comment at close time.

## Review Notes → Drivers

`/task approve` posts a `### 📝 Review Notes` comment with bullet drivers before
stamping `aitm-review-approved`. In human-review mode it prompts stdin (one
bullet per line, blank line to finish); under `TT_FULL_AUTO=1` it auto-derives
drivers from misestimate Δ%, sandbox-failure count, develop-stage re-entry, and
oversized commit diffs, tagging the comment `<!-- aitm-review-notes-source: auto -->`.
The close-time `### 📊 Review delta` comment reads the most-recent notes comment
and renders its bullets under a `Drivers:` section; empty drivers omit the
section entirely.
