---
name: Pause timer on blocking questions
description: When working an active /task issue, pause the timer before asking the user any blocking question and resume after they answer.
type: feedback
originSessionId: 7450cf38-8e9d-4f12-bc09-46a449c835e2
---

While a `/task #N` session is active, **before** asking the user any question that requires their answer to continue, call:

```
/task pause "pause for question"
```

After the user answers and you resume R&D on the same issue, call:

```
/task start "question answered"
```

(or `/task resume` if `start` is not the active verb in this codebase — verify against the current task-tracker CLI surface).

**Why:** the engaged-time / session-time clock keeps running while the AI waits for human input. Without pausing, the issue's recorded effort includes idle wait time, which corrupts the velocity ledger and the value-vs-cost reporting on the project board. The board's analytics rely on `engagedTime` reflecting actual focused AI work, not wall-clock-with-human-pauses.

**How to apply:**

- Applies only when a task session is active (you're inside `/task #N`).
- Applies to every blocking question — clarification, design choice, scope confirmation, missing-info request, "should I proceed?".
- Does NOT apply to rhetorical or in-flight prose questions you answer yourself, or to status updates that don't require a response.
- Tracked as issue #38 (filed 2026-05-08) — once that issue lands, SKILL.md and the pickup-directive will codify the rule in the orchestration docs too. This memory is the interim enforcement mechanism.
