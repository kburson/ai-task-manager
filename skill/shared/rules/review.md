<!-- aitm-skill-version: 1.2.0 -->
<!-- aitm-rule-id: review -->

# Review — compatibility pointer

Emit `aitm-skill-loaded:rules/review:1.2.0` on first load. `npx aitm review #N` controls Test → Review, timing flush, and the approval prompt. Human detail: `../references/review-detail.md`. Artifact review is independent of AITM.

## Pre-review verification

Confirm the Test receipt. It must cover the current clean HEAD and declared commands. Invoking `dod-stamp` or `ac-stamp` in Review may only reuse a valid exact-SHA Test receipt; it never reruns standard lanes. Tick each remaining AC/DoD item from that evidence. A stale receipt requires demotion and a new `/task test`. The agent reports `CODE_COMPLETE`; the orchestrator runs Review. Epic Review waits for child Review.
Review does **not** own verifier execution. Demonstrable AC evidence uses `aitm-verified vc-list="vc:N"`.

## Review-approval prompt

After Review, surface a structured human decision unless Full-Auto is active. **Approve** → `/task approve #N`; **Reject** → ask follow-up for the rejection reason and `/task reject #N --reason`; **Dismiss / no choice** → `/task pause "review-prompt-dismissed"`. A successful Review transition is not itself approval to close. The Review dirty-workspace gate warns; Close blocks.

## Field units

Board Estimate is hours; `engagedTime`, `sessionTime`, `reviewTime`, and `planTime` are minutes. Do not compare them raw. The `Review delta` renderer normalizes units before reporting variance.

## Full-Auto footnote

`TT_FULL_AUTO=1` may record `aitm-full-auto-approved` plus the visible no-human-review footnote. Preserve `aitm-full-auto-footnote:start` / `aitm-full-auto-footnote:end` delimiters. Explicit `--human` approval has distinct provenance.

## Review Notes → Drivers

The agent Review Notes comment may carry `<!-- aitm-review-notes-source: auto -->`; the close-time Review delta reads its drivers. Do not silently replace actual evidence with a generic success statement.
