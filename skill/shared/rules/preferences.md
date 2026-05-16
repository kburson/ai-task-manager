<!-- aitm-skill-version: 1.0.0 -->

# rules/preferences.md

Tier-2. Loaded JIT at session start only if the router needs detail beyond key names. On first read, emit:

```
aitm-skill-loaded:rules/preferences:1.0.0
```

## Source

Team-shared workflow preferences live in the git-tracked `.ai-task-manager/task-tracker.json` under `preferences`. Read them at session start via `getPreferences()` from `scripts/task-tracker/config.mjs`. Defaults preserve today's behavior; teams opt in by editing the file (or via `npx ai-task-manager configure preferences`).

## Keys

| Key                              | Default    | Effect when enabled                                                                                               |
| -------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------- |
| `noPushToOrigin`                 | `false`    | Commit/merge to trunk locally only; never `git push`, never open PRs.                                             |
| `mainThreadOnly`                 | `false`    | No feature branches, no worktrees; commit straight to trunk. Disables parallel dispatch.                          |
| `driveSubIssuesToReview`         | `true`     | Drive sub-issues end-to-end through dispatch/review/merge to Review without per-step human check-ins.             |
| `pauseTimerOnBlockingQuestion`   | `true`     | `/task pause "pause for question"` before any blocking user prompt; `/task start "question answered"` on resume.  |
| `noConfirmAfterDeepDive`         | `true`     | After posting the deep-dive comment, proceed straight to implementation; do not ask "ready to proceed?".          |
| `askGatesBeforeParallel`         | `true`     | Before parallel sub-agent dispatch, prompt user which human gates to disable; encode into prompts; restore after. |
| `formatting.noEmojis`            | `true`     | Issue bodies, comments, and commit messages contain no emojis.                                                    |
| `formatting.currencyInBackticks` | `true`     | Currency amounts wrap in backticks (`` `$200` ``).                                                                |
| `scratchDir`                     | `"./tmp/"` | Canonical directory for transient files (issue body fragments, deep-dive staging).                                |

## Decision points

- `mainThreadOnly=true` → skip worktree creation entirely.
- `noPushToOrigin=true` → never run `git push`, never open PRs.
- `askGatesBeforeParallel=true` → prompt before dispatching parallel sub-agents (which gates to disable for the wave).
- `pauseTimerOnBlockingQuestion=true` → pause before any blocking user prompt; resume on answer.
- `noConfirmAfterDeepDive=true` → deep-dive → implementation, no intermediate "ready?" prompt.
