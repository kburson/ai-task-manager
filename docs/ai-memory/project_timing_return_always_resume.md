---
name: project-timing-return-always-resume
description: "Timing-log model — the return/re-engagement event is always `resume`; never switch-in/switch-back"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2ac1f43a-0f38-4fe0-a3d1-71ae36e8ab42
---

Design decision (2026-06-26, on #568): the timing-log **return event is always `resume`/`resumed`**. Where you came from does not matter on return — only *why you left*, which the departure event already records (`switch-out:#N`, `pause:<reason>`, `idle`). On return you are simply ready to work again.

**Why:** simpler, single return verb; the cross-link to the other task already lives in the matching `switch-out:#N` departure row, so re-emitting it on return is redundant.

**How to apply:** do NOT propose or implement `switch-back`, and do NOT emit `switch-in:#N` as a *return* event. `resolveBindEvent` returns `resumed` for every re-engagement with history; `start` only on positive confirmation of an empty log. The append-guard correction target for a spurious 2nd `start` is `resumed`. This supersedes the original #568 deep-dive (which had proposed `switch-back` + switch-in-on-return). Heal of #549–#562 (43 dup starts → `resumed`) already matches this. Related: [[project_drive_508_tree]].
