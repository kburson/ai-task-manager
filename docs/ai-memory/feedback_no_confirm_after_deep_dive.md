---
name: No confirmation prompt after deep dive
description: After deep dive is written and posted to the issue, proceed straight to implementation — do not ask the user to confirm the plan.
type: feedback
originSessionId: 7450cf38-8e9d-4f12-bc09-46a449c835e2
---

After the Deep-Dive Analysis is appended to the issue body (and `Deep dive complete` ticked), proceed directly to implementation. Do NOT ask "want me to proceed, or would you prefer to review first?" or any equivalent confirmation.

**Why:** The standing rule is "ALWAYS DEEP DIVE (and adjust estimates) BEFORE ANY CODE CHANGES." The deep dive IS the alignment artifact — once it's on the issue, the gate has been passed. Asking again wastes a turn and signals I don't trust the process.

**How to apply:** Once the deep dive PATCH succeeds and `Deep dive complete` is checked, the next action is code, not a question. The user can interrupt if the plan is wrong.
