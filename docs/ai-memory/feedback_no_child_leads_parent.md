---
name: no-child-leads-parent
description: "Never use TASK_TRACKER_FORCE_PROMOTE to push a sub-issue past its epic parent's state. Advance the parent first."
metadata:
  node_type: memory
  type: feedback
  originSessionId: 6c03579a-29a6-4861-9ec3-09e7be4f8f66
---

When the kanban gate refuses a child promotion with "child-cannot-lead-epic" (parent #N is in <state>; advance the epic first), do NOT bypass with `TASK_TRACKER_FORCE_PROMOTE=1`. Advance the epic first.

**Why:** The parent-admission gate exists to keep epic rollup state coherent with its children. Force-promoting a child ahead drifts the epic body, breaks Done-rollup detection, and corrupts the wave-newcomer semantics. The user explicitly stopped this action mid-flow.

**How to apply:** When child promotion blocks on parent-admission:

1. Promote the parent epic first (refine→plan→develop, honoring its own gates — which usually require children at the prior state, so this may cascade).
2. If the epic can't advance because other siblings aren't ready, ASK the user before using FORCE_PROMOTE on either parent or child. Options to present: (a) promote all siblings together, (b) detach the in-flight child from the epic temporarily, (c) authorized force-promote with audit comment.
3. Never silently force.
