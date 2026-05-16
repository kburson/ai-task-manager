<!-- aitm-skill-version: 1.0.0 -->

# rules/hooks.md

Tier-2. Loaded JIT for hook-output diagnosis (rare). On first read, emit:

```
aitm-skill-loaded:rules/hooks:1.0.0
```

## SessionStart behavior

`.claude/settings.json` configures PreCompact, PostCompact, and SessionStart hooks to call `hooks/task-tracker.sh` automatically. The skill does not handle compaction/session events itself.

| Condition                           | Output                                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| No active task, nothing paused      | `[task-tracker] No active task.`                                                               |
| Task paused                         | `[task-tracker] #N is paused. Use /task resume to continue.`                                   |
| Task was active when session closed | Posts `session-end-recovery` row, then fresh `session-start` row, prints recovered minutes     |
| MAIN workspace + Agent spawn risk   | `[task-tracker] WORKSPACE: MAIN — Agent tool spawns will be BLOCKED. Create a worktree first.` |

## Error handling

If a GH API call fails inside a hook, the event is queued. The next successful `/task` call drains the queue.

## Validation rules surfaced via hook output

- Issue refs must match `^#\d+$`.
- Unknown config keys are rejected with the list of valid keys (CLI handles this).

## Activity guard

Tool-call activity is gated by issue state via `.ai-task-manager/activity-policy.json`. Allowed activity classes per state:

| State   | Allowed                                                                          |
| ------- | -------------------------------------------------------------------------------- |
| backlog | READ\_\*, WRITE_ISSUE                                                            |
| refine  | READ\_\*, WRITE_ISSUE                                                            |
| plan    | READ\_\*, WRITE_ISSUE, WRITE_DOCS                                                |
| develop | READ\_\*, WRITE_CODE, WRITE_DOCS, WRITE_ISSUE, COMMIT_CODE, RUN_TESTS, RUN_BUILD |
| test    | READ\_\*, WRITE_CODE, RUN_TESTS, RUN_BUILD, WRITE_ISSUE                          |
| review  | READ\_\*, WRITE_ISSUE                                                            |
| done    | READ\_\*                                                                         |

Classifications come from the glob fields in `activity-policy.json` (`codeGlobs`, `docGlobs`, etc.). Files outside any glob are classified WRITE_OTHER and are typically refused. If you hit `activity refused: WRITE_OTHER`, either: (a) the file path doesn't match the policy globs (rare; check the JSON), or (b) the activity is genuinely outside the current state's scope — promote first.
