---
name: feedback_stop_banner_emoji
description: STOP mistake reports get a 🛑 emoji banner; timer-pause notices get ⏱️ — make them scannable in long prose.
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 210617c1-1292-410a-8f23-eed58036fb4b
---

When invoking the "On Mistakes" STOP protocol, lead with a visible banner line that starts with the 🛑 emoji (e.g. `## 🛑 STOP — <what>`) so it is easy to spot among voluminous prose. Whenever a turn pauses the task timer, add the ⏱️ emoji to that banner/announcement line so the pause is equally scannable.

**Why:** The user reads long analytical replies and needs the high-cost moments (a self-reported mistake, a timer pause) to jump out visually rather than be buried in paragraphs.

**How to apply:** STOP announcements → 🛑 in the heading. Timer pause (`/task pause`) → include ⏱️ on the announcing line. These are the rare "no emojis" exceptions to the project's no-emoji rule. See [[feedback_pause_on_blocking_question]] and [[feedback_no_steamroll]].
