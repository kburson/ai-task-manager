---
name: feedback_enumerate_epic_children_before_fanout
description: "Before creating/fanning-out sub-issues under an epic, ALWAYS enumerate the epic's existing sub-issue tree first — recurring duplicate-child failure."
metadata:
  node_type: memory
  type: feedback
  originSessionId: 7eb34043-996a-4344-b692-4f66fef0559a
  modified: 2026-07-21T12:56:50.235Z
---

Before creating any child under an epic (fan-out, adopt, `create-issue.mjs
--parent <E>`), FIRST enumerate the epic's existing sub-issue tree via the
`subIssues` GraphQL query. Only create children that don't already exist.

**Why:** This is a RECURRING failure. On 2026-07-20 during the #912 fan-out I
created #917–#920 duplicating pre-existing #913–#916 (plus already-adopted
#908) because I didn't read the epic's current children first — a resumed/
compacted session had lost that context. Duplicates had to be unlinked +
closed NOT_PLANNED by hand. The user: "This is not the first time you have
done this."

**How to apply:** At the start of ANY epic Plan/fan-out step, run
`gh api graphql` for `issue(number:E){subIssues(first:N){nodes{number state title}}}`
and reconcile the intended decomposition against what already exists — adopt/
link existing children, create only the genuinely-missing ones. Never trust a
summary or `## Sub-Issues` table as proof the children don't exist yet.
Enforcement is now script-level: defect #921 SHIPPED 2026-07-21 (trunk
`63031f1`) — `create-issue.mjs --shape sub-issue --parent <E>` enumerates the
epic's OPEN siblings and REFUSES (exit 7, names colliding `#N`) on a
similarity ≥0.7 match, unless `--allow-duplicate-child` is passed. Core:
`scripts/gh/lib/duplicate-child-guard.mjs` (`evaluateDuplicateChild`). So the
guard now backstops the behavioral rule above. See [[project_epic_912_state]].
To close an
erroneous duplicate: graphql `closeIssue` + `stateReason:NOT_PLANNED` (the
bash-guard blocks `gh issue close`; `/task close` wrongly runs the DoD/Done
flow). Related: [[project_epic_859_state]] ("enumerate FULL tree before any
close").
