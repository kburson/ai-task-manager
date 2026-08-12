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

| Key                              | Default     | Effect when enabled                                                                                                                           |
| -------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `noPushToOrigin`                 | `false`     | Commit/merge to trunk locally only; never `git push`, never open PRs.                                                                         |
| `mainThreadOnly`                 | `false`     | No feature branches, no worktrees; commit straight to trunk. Disables parallel dispatch.                                                      |
| `driveSubIssuesToReview`         | `true`      | Drive sub-issues end-to-end through dispatch/review/merge to Review without per-step human check-ins.                                         |
| `gateAssigneeMatch`              | `true`      | Enforce lifecycle-aware exclusive story ownership at governed bind/mutation and attributed-commit boundaries. Default on for everyone.        |
| `pauseTimerOnBlockingQuestion`   | `true`      | `/task pause "pause for question"` before any blocking user prompt; `/task start "question answered"` on resume.                              |
| `noConfirmAfterDeepDive`         | `true`      | After posting the deep-dive comment, proceed straight to implementation; do not ask "ready to proceed?".                                      |
| `askGatesBeforeParallel`         | `true`      | Before parallel sub-agent dispatch, prompt user which human gates to disable; encode into prompts; restore after.                             |
| `formatting.noEmojis`            | `true`      | Issue bodies, comments, and commit messages contain no emojis.                                                                                |
| `formatting.currencyInBackticks` | `true`      | Currency amounts wrap in backticks (`` `$200` ``).                                                                                            |
| `scratchDir`                     | `"./.tmp/"` | Canonical directory for transient files. Use subfolders by purpose: `gh/` (issue bodies), `plan/` (scope/acs/plan-meta), `heal/`, `inspect/`. |

## Decision points

- `mainThreadOnly=true` → skip worktree creation entirely.
- `noPushToOrigin=true` → never run `git push`, never open PRs.
- `askGatesBeforeParallel=true` → prompt before dispatching parallel sub-agents (which gates to disable for the wave).
- `pauseTimerOnBlockingQuestion=true` → pause before any blocking user prompt; resume on answer.
- `noConfirmAfterDeepDive=true` → deep-dive → implementation, no intermediate "ready?" prompt.

## Assignee lock (`gateAssigneeMatch`)

GitHub assignment is orthogonal to lifecycle Status. When
`gateAssigneeMatch=true` (the default), AITM treats the assignee set as the
exclusive workstation ownership record:

1. **Bind** (`/task start`, `/task #N`) and **every state mutator**
   (`promote`/`demote`/`review`/`approve`/`close` and issue-body writes) route
   through `runPreflight`, which evaluates the lifecycle-aware ownership policy
   against the authenticated `gh` user (`gh api user --jq .login`, what `@me`
   resolves to).
2. **Commit-time** — the Bash guard resolves each `git commit`'s `[#N]`
   attribution token(s) and refuses when a referenced issue is assigned to
   another user. A token-less (chore / un-bound) commit carries no attribution
   and is the visible, un-gated escape hatch.

The canonical rules are:

- Backlog, Refine, Ready for Planning, and Plan may be unassigned. Refinement
  and planning are team work; assignment does not move lifecycle Status.
- A local singleton owner permits governed work. Login comparison is
  case-insensitive.
- A foreign singleton or two-or-more assignees blocks the current session in
  every state. AITM never chooses one owner from a set.
- Plan → Develop is the last-responsible-moment commitment boundary. Interactive
  mode asks whether to assign the story to the local identity. Full-Auto posts
  a notice, claims an unassigned story for the local identity, verifies the
  exact singleton read-back, and only then permits the Status transition.
- Develop, Test, and Review require the existing local singleton. If ownership
  is removed in flight, Full-Auto does not reclaim it; the human must restore
  the local owner or transfer the story to another owner/workstation.
- `assign`, `transfer`, and `unassign` are governed issue-lock operations that
  preserve Status and verify final ownership. Unassign is permitted only before
  Develop. Direct `gh issue edit --add-assignee/--remove-assignee` is refused.

The lock **fails closed**: unreadable identity, assignees, configured-project
membership, or lifecycle Status never implies permission or mutation success.
Ambiguous GitHub transport outcomes are surfaced for human reconciliation and
never trigger destructive compensation of ownership whose provenance is not
conclusive.

- `gateAssigneeMatch=false` → legacy compatibility override for shared verb
  preflight and attributed-commit checks. It does not disable the dedicated
  Plan → Develop commitment guard or Develop+ source-edit guard. This override
  is incompatible with the default team ownership model and must not be used
  for governed delivery.
