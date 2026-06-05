<!-- aitm-skill-version: 1.0.0 -->

# rules/review.md

Tier-2. Loaded JIT on `/task review`. On first read, emit:

```
aitm-skill-loaded:rules/review:1.0.0
```

## Agent terminal step

`/task review #N` is the **terminal automation step** for an agent on an issue. After it succeeds:

1. The issue moves to **Review** on the project board.
2. A `review` row is flushed to the ⏱ Timing Log.
3. The active timer is paused.
4. The CLI emits `PROMPT_REQUIRED: review-approval #N` on stdout.

Stop. Do not run `/task close`. Do not infer human approval from passing tests or checked boxes.

## Pre-review verification (mandatory, in order)

1. **Per-AC verification.** For every `- [ ]` in the issue body's Acceptance Criteria, verify by inspection AND by running the relevant test/build/command. Tick each with `/task check "<exact label>"`. No bulk-checking.
2. **Per-DoD verification.** Same rule for the Definition of Done items. The Functional DoD subsection is gated by the evidence-marker contract — see `rules/functional-dod.md`. Stamp every stampable key with `/task dod-stamp <key>` before batch-ticking; `acs` and `checkboxes` are derived by `/task close` and refuse manual ticks.
3. **`aitm-verified-by` markers.** Every AC must carry one or more `aitm-verified-by` HTML comment markers. Non-standard commands named by those markers must appear under the issue-specific `### Verification Commands` section. Standard DoD commands (`npm test`, `npm run test:all`, `npm run lint`, `npm run format:check`) may be referenced by markers but must NOT be duplicated in `### Verification Commands`.
4. **Run `/task review #N`.**

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
2. **Default behavior is resolution.** Walk each item: verify, then `/task check "<label>"`. Re-run `/task review #N`.

No env override exists. The pre-review checkbox gate cannot be skipped from the script path.

## Epic review rule

When all sub-issues in the current sequence reach Review, the orchestrator MUST call `/task review #<epic>` on the parent epic **before** notifying the human. Running `/task review` on the epic is orchestrator work, not human work. The epic gate enforces this — the epic cannot move to Review until all its sub-issues are already in Review.

Do not report `ISSUE_READY_FOR_REVIEW` or notify the human until the epic itself is in Review.
