<!-- aitm-skill-version: 1.1.0 -->
<!-- aitm-rule-id: project-preferences -->

# rules/preferences.md

Tier-2. Loaded JIT at session start only if the router needs detail beyond key names. On first read, emit:

```
aitm-skill-loaded:rules/preferences:1.1.0
```

## Source

Team-shared workflow preferences live in the git-tracked `.ai-task-manager/task-tracker.json` under `preferences`. Read them at session start via `getPreferences()` from `scripts/task-tracker/config.mjs`. Defaults preserve today's behavior; teams opt in by editing the file (or via `npx ai-task-manager configure preferences`).

## Keys

| Key                              | Default     | Effect when enabled                                                                                                                                                                              |
| -------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `noPushToOrigin`                 | `false`     | Commit/merge to trunk locally only; never `git push`, never open PRs.                                                                                                                            |
| `mainThreadOnly`                 | `false`     | No feature branches, no worktrees; commit straight to trunk. Disables parallel dispatch.                                                                                                         |
| `driveSubIssuesToReview`         | `true`      | Drive sub-issues end-to-end through dispatch/review/merge to Review without per-step human check-ins.                                                                                            |
| `gateAssigneeMatch`              | `true`      | Treat an issue's GitHub assignee as an exclusive work-lock. A single flag governs all three enforcement seams — bind, every state mutator, and commit-time (see below). Default on for everyone. |
| `pauseTimerOnBlockingQuestion`   | `true`      | `/task pause "pause for question"` before any blocking user prompt; `/task start "question answered"` on resume.                                                                                 |
| `noConfirmAfterDeepDive`         | `true`      | After posting the deep-dive comment, proceed straight to implementation; do not ask "ready to proceed?".                                                                                         |
| `askGatesBeforeParallel`         | `true`      | Before parallel sub-agent dispatch, prompt user which human gates to disable; encode into prompts; restore after.                                                                                |
| `formatting.noEmojis`            | `true`      | Issue bodies, comments, and commit messages contain no emojis.                                                                                                                                   |
| `formatting.currencyInBackticks` | `true`      | Currency amounts wrap in backticks (`` `$200` ``).                                                                                                                                               |
| `scratchDir`                     | `"./.tmp/"` | Canonical directory for transient files. Use subfolders by purpose: `gh/` (issue bodies), `plan/` (scope/acs/plan-meta), `heal/`, `inspect/`.                                                    |

## Decision points

- `mainThreadOnly=true` → skip worktree creation entirely.
- `noPushToOrigin=true` → never run `git push`, never open PRs.
- `askGatesBeforeParallel=true` → prompt before dispatching parallel sub-agents (which gates to disable for the wave).
- `pauseTimerOnBlockingQuestion=true` → pause before any blocking user prompt; resume on answer.
- `noConfirmAfterDeepDive=true` → deep-dive → implementation, no intermediate "ready?" prompt.

## Assignee lock (`gateAssigneeMatch`)

The GitHub assignee is an exclusive work-lock. When `gateAssigneeMatch=true` (the
default), the **same single flag** enforces it at all three seams — there is no
separate gate or config key per seam:

1. **Bind** (`/task start`, `/task #N`) and **every state mutator**
   (`promote`/`demote`/`review`/`approve`/`close` and issue-body writes) route
   through `runPreflight`, which refuses unless the authenticated `gh` user
   (`gh api user --jq .login`, what `@me` resolves to) is among the issue's
   assignees.
2. **Commit-time** — the Bash guard resolves each `git commit`'s `[#N]`
   attribution token(s) and refuses when a referenced issue is assigned to
   another user. A token-less (chore / un-bound) commit carries no attribution
   and is the visible, un-gated escape hatch.

Three assignee states, one behavior each:

- **Assigned to me** (sole or among several) → all work allowed.
- **Unassigned** → the AI alerts and asks permission, then may claim `@me` — the
  **only** assignment mutation the AI ever performs. It can never reassign an
  issue from another user; `claimAssignee` structurally refuses any issue that
  already has an assignee.
- **Assigned to another user** → hard-refused. Only a human, via the GitHub UI,
  may transfer the lock.

The lock **fails closed**: if the assignee list cannot be fetched, the mutator
refuses rather than assuming ownership. Genuine offline sessions use the
documented escapes — `TT_SKIP_NETWORK=1`, or `gateAssigneeMatch=false`.

**Full-Auto** (`TT_FULL_AUTO=1`) changes only the unassigned lane: it
auto-claims an unassigned issue for `@me` with no prompt, writing an audit
comment (`aitm-full-auto-assignee-claim`). A foreign-assigned issue stays
hard-refused even under Full-Auto.

- `gateAssigneeMatch=false` → skip the guard at every seam (solo workflows where
  the assignee is not used as a lock).
