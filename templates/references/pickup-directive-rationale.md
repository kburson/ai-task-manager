<!-- aitm-skill-version: 0.0.0 -->

# Pickup Directive — Rationale & Override Notes

Detailed background, examples, and audited overrides for the hard rules in
`.ai-task-manager/pickup-directive.md`. The directive itself states each rule
tersely; consult this file when you need the "why" or the recovery procedure.

## Rule 0 — Bootstrap is fail-closed

If any bootstrap step exits non-zero — `task-tracker.mjs <issue> --role agent`
reporting `config-not-found`, `move-state.mjs` unable to move the issue to
`in-progress`, `words-count` returning no value, or any other step — report
`STATUS: BLOCKED bootstrap-step-<N>: <reason>` and stop before editing any
source file. "It printed a warning but I kept going" is a process violation;
the bootstrap is the contract that registers your session, moves the issue,
and posts the `start` timing row. If the contract did not complete, your
work cannot be accounted for and will be discarded.

The most common cause is a worktree created without `.ai-task-manager/` (the
directory is gitignored, so `git worktree add` doesn't carry it). The
orchestrator must seed it via `scripts/task-tracker/seed-worktree.mjs
<worktree>` before booting the agent. If you hit this, BLOCK — do not try to
recreate the config yourself.

## Rule 1 — Deep dive is mandatory before any code changes

Complete the deep-dive analysis and append it to the issue body BEFORE
editing any source file. Check `- [ ] Deep dive complete` (`/task check
"Deep dive complete"`) only after appending; the check is the gate signal,
not a placeholder. If you have already started writing code without doing
this: stop, set aside the changes, and run the deep dive against the actual
current state of the repo.

## Rule 2 — Per-item DoD verification

For each DoD checkbox, verify by inspection AND by running the relevant
tests, builds, or commands. Read the output, then check the box. Same rule
for every Acceptance Criterion (including any added during the deep dive).
Every AC must carry automated evidence metadata via an `aitm-verified-by`
HTML comment marker. Standard DoD commands (`npm test`, `npm run lint`,
`npm run format:check`) are DoD checkboxes — do not duplicate them under
the deep-dive `### Verification Commands` section. Every non-standard
command named in an AC `aitm-verified-by` marker must also appear as a
checkbox under the issue-specific `### Verification Commands` section.
Never bulk-check. Never check preemptively. "It looks done" is not
verification.

## Rule 3 — All pre-close checkboxes ticked

Before `/task close` or moving to Done, every user-verifiable `- [ ]` in
the issue body MUST be `- [x]` — Deep Dive checkpoint, every AC, every
issue-specific Verification Commands checkbox, every DoD item. Close side
effects (moving to Done, writing the final timing row, updating Actuals)
are owned by `/task close`; they are not DoD checkboxes. No env override
exists. Legitimate abandonment moves through the GitHub UI (drag the card
to Done, or delete the issue).

## Rule 4 — Move-to-Done is gated

`move-state.mjs <issue> done` refuses if Deep Dive is unchecked or any
other pre-close box is unchecked. No env override exists. Normal path:
`/task close` — it validates, flushes timing, then moves to Done.

## Rule 5 — Agent terminal action is reporting CODE_COMPLETE

Once implementation is complete and all verifiable checkboxes are checked,
capture exit word count, then report `CODE_COMPLETE` with `duration_minutes`
and `words_delta`. The orchestrator calls `/task review #N
--duration-minutes M --words W`. Checking all boxes means "orchestrator
should now call `/task review`" — NOT permission for the agent to call
`/task review` or `/task close`. `/task review` is an orchestrator action;
`/task close` is a human action. Agents running either is a process
violation.

## Rule 6 — Epic boxes wait for sub-issue Review

For issues whose title begins with `EPIC:`, no AC or DoD checkbox may be
ticked until every linked sub-issue has passed through In Review and
reached Review status. The sub-issue lifecycle IS the verification.

## Rule 7 — Pause timer on blocking questions

Any time you must stop work to ask the user a clarification, design
choice, missing-info, or scope-confirmation question and wait for an
answer, run `/task pause "pause for question"` BEFORE asking and `/task
start "question answered"` AFTER. Does NOT apply to rhetorical or
in-flight prose questions you answer yourself. The timer measures focused
engagement; idle time waiting for a human corrupts `engagedTime` /
`sessionTime` and the value report. Pause→resume gaps ≤
`reviewPauseThresholdMin` (default 5 min, configurable in
`.ai-task-manager/task-tracker.json`) count as Review Time and roll into
Engaged Time; longer gaps are excluded as idle.

## Rule 8 — Collapsed `<details>` blocks

Issue bodies wrap the Deep-Dive Analysis appendix in a `<details>` block
once `/task plan-approve` has run. Treat the wrapped content as
already-applied context; do not re-read it on pickup unless explicitly
asked to revisit scope or expand the deep dive.

## Rule 9 — Checkpoint Pause

Before any `/task` state move (`refine`, `plan`, `develop`, `test`,
`review`, `done`), before switching the active issue (`/task #N` when
already bound to a different `#M`), before closing an issue, and before
parallel-agent fan-out, pause and re-read the most recent user messages.
If the latest user message is unacknowledged or contains a question or
instruction not yet addressed, halt and respond first — do not advance
state. There is no programmatic signal for "unread chat queue"; this is
behavioral self-discipline at high-cost moments to prevent steam-rolling
past queued input.

## Rule 10 — Field units

The project-board `Estimate` field is denominated in hours (`unit: hours`
in `config/project-fields.default.json`). The timing fields —
`engagedTime`, `sessionTime`, `reviewTime` — are denominated in minutes.
The Review delta renderer normalizes both to seconds internally and
displays `H:MM:SS`, but if you read these values directly (board API,
field-DB JSON), do not compare them raw — a 3-hour estimate against a
22.5-minute actual is −87%, not +650%. Internal compute is
second-precision; the board still stores rounded minutes.

## Rule 11 — Review Notes drive the delta comment

The reviewer (or, under `TT_FULL_AUTO=1`, the auto-derive pipeline) posts
a `### 📝 Review Notes` comment with bullet drivers before approval.
`/task approve` handles this: in human-review mode it prompts stdin (one
bullet per line, blank line to end); in Full-Auto it derives drivers from
observable signals (misestimate, sandbox retries, develop re-entry,
oversized diff) and tags the comment `<!-- aitm-review-notes-source: auto
-->`. The close-time `### 📊 Review delta` comment reads the most-recent
Review Notes comment and renders its bullets under a `Drivers:` section.
Empty drivers → no Drivers section.

## Rule 12 — Full-Auto footnote

Under `TT_FULL_AUTO=1` (or any other signal `detectFullAuto` fires on),
`/task approve` writes a blockquote footnote between
`<!-- aitm-full-auto-footnote:start -->` and
`<!-- aitm-full-auto-footnote:end -->` under the Lifecycle DoD subsection
so reviewers can see at a glance that no human was in the loop. The
hidden `aitm-full-auto-approved` marker still records the audit signals.
`gh-edit-guard` protects the delimiters; do not strip them. A
`lifecycle-tick-noop` stderr warning fires if the DoD checklist label is
missing or legacy — investigate the body shape rather than ignoring.

## Rule 13 — Post-Compact/Clear recovery

A `Compact` or `Clear` cannot reproduce the verbatim hard rules in the
directive from a summary. After either operation (or any fresh session),
follow [`.ai-task-manager/session-boot.md`](../session-boot.md) before
the first verb: re-read every Tier-1 file in order, discard any prior
`aitm-skill-loaded:*` sentinels, then emit a one-shot
`aitm-boot-recovered:<session-id>:<timestamp>` sentinel. Treating a
compacted paraphrase as the rule is a process violation.

## Rule 14 — On mistakes

If you discover you have taken a wrong action (created a duplicate issue,
used `gh issue close` directly, skipped the deep dive, dispatched agents
without verifying state), STOP immediately. Do not attempt to fix the
mistake yourself. Announce what happened, why it was wrong, and propose
2–3 resolution options. Wait for explicit orchestrator or human
instruction before proceeding.
