---
name: /task #N bind is mandatory before any state transition
description: Never call move-state.mjs or verbApprove directly — always bind via /task #N first so the timing-log comment exists and rows accumulate
type: feedback
originSessionId: a2956386-6efd-462f-8527-e3f5a578f958
---
Before moving any issue between states, you MUST bind the session via `/task #<N> --role <role>`. This creates the `⏱ Timing Log` comment on the issue and posts the initial `start` row. Every subsequent state transition must go through `/task <verb> #<N>` (or the equivalent task-tracker.mjs invocation that registers the bind) so a new row gets appended.

**Why:** This skill's entire value proposition is auto-logged time + context on each issue. Calling `scripts/gh/move-state.mjs` directly, or `verbApprove --answer yes`, bypasses the timing system. The user explicitly rejected #51 at Review because it had no timing log — "I cannot accept this." Deleting an existing timing-log comment during cleanup compounds the problem if you don't re-bind before the next transition.

**How to apply:**
- First action on any issue: `/task #<N> --role orchestrator` (or whichever role) to bind.
- Never invoke `move-state.mjs` directly except when explicitly working on tracker plumbing.
- Never use `--answer yes` to bypass the approve gate without first binding.
- During cleanup, do NOT delete `⏱ Timing Log` comments. If a body needs to be reset, leave the timing comment intact — it is the audit trail.
- If you discover a transition was made without a bind, stop and report per the On Mistakes rule. Do not silently catch up.
