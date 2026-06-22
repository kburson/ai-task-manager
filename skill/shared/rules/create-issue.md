<!-- aitm-skill-version: 1.0.0 -->

# rules/create-issue.md

Tier-2. Loaded JIT on `/task new` (issue creation). On first read, emit:

```
aitm-skill-loaded:rules/create-issue:1.0.0
```

## The only sanctioned path

`scripts/gh/create-issue.mjs --shape stub|epic|sub-issue|solo` is the only sanctioned path. **Never call `gh issue create` directly.** The wrapper renders the body from `templates/<shape>-body.md` (override: `.ai-task-manager/<shape>-body.md`) via `preflight-issue.mjs --shape`, then runs `gh issue create`, tethers to the project Board, and substitutes `<this-issue-#>` / `<parent-epic-#>` placeholders atomically.

Required content fragments (default `./.tmp/plan/`): `scope.md`, `acs.md` (must contain `- [ ]` checkboxes), `plan-meta.md`. For sub-issues, also pass `--parent <EPIC_N>`.

## Stub shape — capturing a raw idea at Backlog (#426)

For fast idea-capture, use `--shape stub`: it requires **only** `--title` and takes an optional `--idea-file <path>` whose free text seeds the Scope section. It does **not** require `scope.md` / `acs.md` / `plan-meta.md` — those sections are placeholders the Refine stage fills. Reach for `stub` when capturing a raw idea where the acceptance criteria, scope decomposition, and plan-metadata block do not yet exist and should not be invented; use `solo` when you already have all three worked out and want to chain straight into `promote`.

**Do not volunteer `Size` or `Estimate` at Backlog creation.** Those are Refine-exit gate fields, not creation-time fields — offering them on a stub (or any freshly-filed Backlog idea) invites premature, low-confidence sizing. Set them at Refine, where the Refine→Plan gate enforces them.

## Bind every AC to evidence

During deep dive, bind every Acceptance Criterion to automated evidence with an
`aitm-verified cmd="…"` HTML comment marker. Every non-standard command named in
those markers must be listed under the issue-specific `### Verification
Commands` section. Standard DoD commands may be used as evidence markers but
must not be duplicated there.

## Refusal contracts (deterministic exit codes)

- `assignee-required` — no `--assignee` and no `assignee` in `.ai-task-manager/task-tracker.json`.
- `priority-required-at-groom` — `--status groom|refine|ready` without `--priority`.

Use `--dry-run` to print the rendered body without calling `gh`.

## Never promote a "suggested task" chip — offer a tracking issue instead

This is the session form of hard rule 12 (Track before you start). When you notice follow-up or out-of-scope work, **do not** surface it as a background-task chip (the session `spawn_task` "suggested task"). A chip kicks off work locally with no issue behind it — no board state, no estimate, no timing ledger, no audit trail. That is exactly the untracked work this workflow forbids.

Instead, tell the user what you found and offer to create a GitHub issue to track it: `/task new` (→ `scripts/gh/create-issue.mjs --shape <epic|sub-issue|solo>`). Only after the issue exists and you bind to it does the work begin. If the user explicitly insists on a chip anyway, name the trade-off (untracked) before proceeding.
