# Worker Report Template

Workers paste this back to the orchestrator as their final message. One report per worker per task. See [`docs/guides/worker-context-contract.md`](../docs/guides/worker-context-contract.md) §4 for field semantics and §10 for length thresholds.

Replace every `<…>` with concrete values. Use `none` for fields that genuinely do not apply — do not omit field headings.

---

## Worker Report

- **status:** <done | partial | blocked>
- **bound_issue:** #<N>

### files_changed

- <relative/path/one>
- <relative/path/two>

(Empty list is allowed for `blocked`. List paths only — no diffs.)

### root_cause

<One paragraph. Required for `done` if the task was a bug fix; required for `blocked` always; `n/a` otherwise.>

### changes_made

- <bullet 1>
- <bullet 2>

(Required for `done` and `partial`. One sentence per bullet.)

### verification_run

- Command: `<exact command>`
- Exit: <code>
- Outcome: <one line>

(Required for `done` and `partial`. For `blocked`, set all three to `n/a`.)

### integration_notes

<One paragraph or `none`. Shared-file edits, ordering constraints, anything an integrator must know.>

### decisions_needed

- <question 1>
- <question 2>

(Use `none` if the worker needs nothing from the orchestrator. Required for `blocked` — name the decision that unblocks the worker.)
