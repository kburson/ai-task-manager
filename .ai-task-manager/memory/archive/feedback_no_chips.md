# No spawn_task chips

The user does not want `mcp__ccd_session__spawn_task` chips used in this project.

**Why:** Chips fork work into a separate session/worktree that's invisible to the
current conversation. That branching obfuscates the process — discoveries get
"flagged" into a side channel instead of being tracked through the normal verb
chain where they're auditable.

**Rule:** When a defect or out-of-scope issue is discovered mid-task, file a
real GitHub issue (via `preflight-issue.mjs` + `gh issue create --assignee @me`)
and drop it in Backlog. Then surface it to the user with a one-line note. Do
NOT call `spawn_task`.

This applies even for "small" or "background" suggestions — if it's worth
tracking, it's worth a GH issue. If it's not worth a GH issue, don't track it.
