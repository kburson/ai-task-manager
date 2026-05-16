<!-- aitm-skill-version: 1.0.0 -->

# rules/config-init.md

Tier-2. Loaded JIT on `/task config init`. On first read, emit:

```
aitm-skill-loaded:rules/config-init:1.0.0
```

## Interview procedure

Do not pass `config init` to the CLI. Conduct the interview directly:

1. Run `/task config` and parse the current values and their sources.
2. Work through each key below, one at a time. Show the current value and source, ask the question, and write the answer with `/task config <key> <value>` before moving to the next.
3. Skip any key the user explicitly says to leave as-is.
4. After all keys are set, run `/task config` and display the final config.

## GitHub setup

| Key             | Question                                                       |
| --------------- | -------------------------------------------------------------- |
| `repo`          | What is the GitHub repo? (`owner/repo` format)                 |
| `assignee`      | Who should new issues be assigned to? (default: `@me`)         |
| `defaultLabels` | Any default labels for new issues? (comma-separated, or empty) |

## Behavior

| Key                    | Question                                                               |
| ---------------------- | ---------------------------------------------------------------------- |
| `wpm`                  | Reading/coding speed in words per minute? (default: 180)               |
| `autoEndOnSwitch`      | Auto-close the previous task when switching to a new one? (true/false) |
| `idleThresholdMinutes` | Idle minutes before a gap stops counting as active time? (default: 5)  |
| `recordWallClock`      | Record wall-clock time in addition to active time? (true/false)        |
| `hookNetworkTimeoutMs` | GitHub API timeout in ms? (default: 2000)                              |

## Features

| Key               | Question                                                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pickupDirective` | Enable the Pickup Directive pattern for sub-issues? Inserts a structured deep-dive + DoD block into each sub-issue body during epic planning. Recommended for multi-agent workflows. (true/false) |

## Internal paths (show current; only ask if user wants to change)

| Key         | Default                                    |
| ----------- | ------------------------------------------ |
| `statePath` | `.ai-task-manager/task-tracker-state.json` |
| `queuePath` | `.ai-task-manager/task-tracker-queue.json` |

## Excluded from this interview

GH Projects IDs (`projectId`, `kanbanFieldId`, `kanbanOption*`, `priorityFieldId`, `priorityOption*`) are set automatically by `npx ai-task-manager init` and are not part of the interview.
