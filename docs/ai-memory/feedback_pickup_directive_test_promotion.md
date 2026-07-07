---
name: pickup-directive-test-promotion
description: "Pickup directive's \"stop after CODE_COMPLETE, no /task review or /task close\" means don't skip Test — promote Develop→Test is the expected next move."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: e7df4eb9-add9-4c10-8838-c57a1d7423cd
---

After reporting `CODE_COMPLETE` from Develop, the next legitimate state is **Test**. The pickup directive forbids `/task review` and `/task close` because they skip Test, not because Develop is a terminal hand-off.

**Why:** the state machine is Develop → Test → Review → Done. Test is where the orchestrator (or user) re-runs the suite in isolation; Review is human approval; Done is post-close. The pickup directive's "stop" wording targets the *skip-to-Review/Done* failure mode, not the routine forward step.

**How to apply:** after CODE_COMPLETE, if the user approves, promote Develop→Test via `node scripts/task-tracker/task-tracker.mjs promote '#N'`. Do not phrase the exit report as "stopping at Develop" — say "ready to promote to Test" so the next step is unambiguous. Related: [[feedback_drive_to_review]].
