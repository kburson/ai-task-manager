# Task Lifecycle Master Plan

## Goal

Make task status transitions explicit, idempotent, and truthful:

```text
Plan -> New -> Start -> Review -> Close
                 ^        |
                 |        |
                 +--------+
```

## Status Verbs

### Plan: `/task plan`

- Opens or reports an untracked planning bucket.
- Records planning context before an issue exists.
- Does not move a GitHub Project item.

### New: `/task new [title]`

- Creates one issue or promotes a plan into a backlog.
- Injects Pickup Directive and pre-close Definition of Done.
- Sets new work to `Backlog` or `Ready`.

### Start: `/task <N>`

- Makes issue `N` active.
- Moves the issue to `In Progress`.
- Appends a timing row describing the destination, such as `starting work`.
- Idempotent for the issue: rerunning it should not corrupt state.

### Review: `/task review <N>`

- Appends a timing row describing the destination, such as `starting review`.
- Moves the issue to `In Review`.
- Re-verifies every checkbox, including boxes already checked.
- If a checked box fails re-verification, unchecks it and posts a warning comment that recent changes broke a previously passing item.
- If review fails, moves the issue back to `In Progress`.
- Flushes a review timing row and pauses the active task.

### Close: `/task close <N>`

- Requires review-passed state, not close-action checkboxes.
- Verifies all pre-close checkboxes are checked.
- Appends the final timing row.
- Updates Actuals fields.
- Moves the issue to `Done`.
- GitHub issue closure may be handled by automation or a future config flag.
- If this closes the last child of an epic, updates the parent and sets the parent status to `In Review`; the human then calls `/task close <EpicID>`.

## Definition of Done

The DoD contains only items that are truthfully verifiable before `/task close`:

```markdown
- [ ] Acceptance criteria met (including test additions from deep dive)
- [ ] Tests pass; new coverage committed
- [ ] Pre-commit hooks pass
- [ ] Issue body checkboxes ticked
```

Close side effects are owned by `/task close`, not by checkboxes in the issue body.

## Manual Board Movement

Users may manually move cards between columns. Task verbs are authoritative and idempotent for their transition:

- `/task <N>` moves issue `N` to `In Progress`.
- `/task review <N>` moves issue `N` to `In Review`, then back to `In Progress` if review fails.
- `/task close <N>` moves issue `N` to `Done` after the close gate passes.

Manual changes do not break the workflow; the next task verb reconciles the issue to its intended lifecycle state.
