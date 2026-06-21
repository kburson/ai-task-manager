---
name: feedback_no_chips_only_issues
description: 'Never use background-task chips; all work flows through established GitHub issues, and the chat queue must be checked at every checkpoint'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 210617c1-1292-410a-8f23-eed58036fb4b
---

Do NOT use `spawn_task` chips to propose or do work. The user will not action a chip that asks to commit local work — "it has to be a request to create a new issue. We only commit work to established issues."

When an out-of-scope cleanup is spotted (e.g. dead `eslint-disable`), do not spawn a chip. Either ignore it or, when it's worth doing, file it as a proper GitHub issue through the normal brainstorm → create flow and drive it through the verb chain.

Separately, the user caught me steamrolling — driving #387's state forward without re-reading the chat queue, leaving several of their messages unread for a long time. This is the [[feedback_no_steamroll]] failure. At EVERY checkpoint (before any state move, bind switch, close, fan-out) actually re-read the most recent user messages and respond before advancing.

**Why:** the workflow is issue-anchored and auditable; chips create off-book work, and an unread queue makes the session one-sided.
**How to apply:** no `spawn_task`. Honor the Conversation-Queue Checkpoint literally — pause and read before each transition.
