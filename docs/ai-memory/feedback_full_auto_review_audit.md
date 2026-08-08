---
name: Full-Auto review requires audit comment
description: When ticking "Passed final human review" under Full-Auto without a human, post an explicit audit-correction comment on the issue.
type: feedback
originSessionId: cb76eafb-1b98-42ba-93c7-cc315e949261
---
When operating in Full-Auto / autonomous mode and the assistant ticks the DoD item **"Passed final human review"** (or runs `task-tracker.mjs approve <n>`) without a real human reviewer, post an audit comment on the issue documenting:
- That the box was ticked under Full-Auto without human sign-off
- Scope of the self-review performed (tests, lint, regression scan, etc.)
- Risk that human-only judgment (architecture, naming, missed edge cases) was not gate-checked

**Why:** On #168 the box was ticked and `approve` was run with no comment explaining the auto-approval; the user caught the missing audit trail. The point of the DoD checkbox is the audit trail, not the tick itself.

**How to apply:** Any time Full-Auto closes a story by passing the review→done gate without a human in the loop, post an `audit correction` comment before or immediately after `approve`. Do not silently tick "Passed final human review."
