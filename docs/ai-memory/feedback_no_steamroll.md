---
name: Checkpoint Pause — no steamrolling queued user messages
description: Before any state transition, re-read the most recent user messages and acknowledge unaddressed input before advancing.
type: feedback
originSessionId: d53c9948-1218-4c50-bee2-4392971a4ea5
---

Before any `/task` state transition (refine/plan/develop/test/review/done), before switching the active issue, before closing an issue, and before parallel-agent fan-out, **pause and re-read the most recent user messages**. If the latest user message is unacknowledged or contains a question or instruction not yet addressed, halt and respond first — do not advance state.

**Why:** Incident on 2026-05-17 during close of #107/#142 — multiple user messages queued in chat were ignored because the agent kept advancing state. There is no programmatic signal for "unread chat queue"; this is behavioral self-discipline at the high-cost moments where steam-rolling causes the most damage.

**How to apply.** Trigger points (must checkpoint before each):

- Before `/task` state moves (`refine`, `plan`, `develop`, `test`, `review`, `done`).
- Before switching active issue (`/task #N` when already bound to a different `#M`).
- Before closing an issue.
- Before parallel-agent fan-out.

At each trigger, scan the conversation tail for new user input. If the latest user message has not been addressed, respond first, then continue.
