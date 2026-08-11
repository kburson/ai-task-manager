---
name: drive-stories-to-review-without-checkins
description: Drive sub-issue work end-to-end through the verb pipeline up to the Review column without intermediate "should I proceed" check-ins; Review is the human stop point.
type: feedback
originSessionId: e96a51b2-052b-40ba-8357-84786b2b5e77
---

User wants stories driven all the way to the **Review** column without intermediate "should I proceed" check-ins. The Review column is the agreed handoff point — that's where the human reviews and gives feedback. Everything before Review is orchestrator domain.

Vocabulary note: "R4R" (Ready For Review) is **retired terminology** — do not use it. The columns are Backlog → Assigned → Refine → Plan → Develop → Test → Review → Done. The stop point is the Review column.

**Why:** Repeated mid-flow confirmations slow down sub-issue throughput. The user named the pattern explicitly: "There have been too many checking for my feedback. I need you to take the story all the way to [Review] — that is where I will review the work and make any feedback."

**How to apply:**

- Once a sub-issue is approved for work, run the verb chain (refine → plan → develop → test → review) as one continuous flow until the issue lands in the Review column.
- Surface only true blockers: bootstrap failures, hard merge conflicts, test failures the orchestrator could not resolve, ambiguous scope that needs a human call.
- Do NOT ask "want me to proceed?" between completed steps when the next step is the obvious continuation of the approved plan.
- Filing a follow-up issue mid-flow for an unrelated bug found is fine and does not require a check-in.
- Multiple sub-issues under the same epic: drive each to Review before pausing. Sequencing decisions (parallel vs serial) are still orchestrator-side judgment calls — make them and proceed.
