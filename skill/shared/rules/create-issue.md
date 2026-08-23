<!-- aitm-skill-version: 1.2.0 -->
<!-- aitm-rule-id: issue-create -->

# rules/create-issue.md

Tier-2. Loaded JIT on `/task new` (issue creation). On first read, emit:

```
aitm-skill-loaded:rules/create-issue:1.2.0
```

## The only sanctioned path

`scripts/gh/create-issue.mjs --shape stub|epic|sub-issue|solo|defect` is the only sanctioned path. **Never call `gh issue create` directly.** The wrapper renders the body from `templates/<shape>-body.md` (override: `.ai-task-manager/<shape>-body.md`) via `preflight-issue.mjs --shape`, then runs `gh issue create`, tethers to the project Board, and substitutes `<this-issue-#>` / `<parent-epic-#>` placeholders atomically.

Required content fragments (default `./.tmp/plan/`): `user-story.md`, `scope.md`, `acs.md` (must contain `- [ ]` checkboxes), and `story-origin.md` with create-time provenance. `user-story.md` contains exactly three non-empty, heading-free Connextra lines beginning `As a`, `I want to`, and `So that`; template placeholders are refused. Plan Metadata in `plan-meta.md` is optional until planning produces substantive output. For sub-issues, also pass `--parent <EPIC_N>`.

Every non-stub shaped call passes `--user-story-file ./.tmp/plan/user-story.md`, `--scope-file ./.tmp/plan/scope.md`, `--ac-file ./.tmp/plan/acs.md`, and `--story-origin-file ./.tmp/plan/story-origin.md`; append `--plan-metadata-file ./.tmp/plan/plan-meta.md` only when planning output already exists.

## Defect intent routes to the defect shape

When the user asks to create, generate, or file a local defect or bug story, use `--shape defect`. It has the same required User Story, Scope, Acceptance Criteria, and Story Origin fragments as `solo`; optional `--reproduction-file`, `--root-cause-file`, `--fix-direction-file`, and `--out-of-scope-file` fragments capture diagnostic detail. The wrapper adds the `bug` label and canonical `🐞 [BUG]` title prefix idempotently.

This local defect-story route also applies in Full-Auto. `/task report` is not a substitute: that verb reports a downstream product problem to the upstream external AITM repository.

## Stub shape — capturing a raw idea at Backlog (#426)

For fast idea-capture, use `--shape stub`: it requires **only** `--title` and takes an optional `--idea-file <path>` whose free text seeds the Scope section. It does **not** require `user-story.md`, `scope.md`, `acs.md`, `story-origin.md`, or `plan-meta.md`: it omits the User Story section, Scope and AC remain Refine placeholders, Story Origin is synthesized with the resolved kind, and Plan Metadata remains empty until Plan. Reach for `stub` when capturing a raw idea whose acceptance criteria and scope decomposition do not yet exist; use `solo` when those creation-time inputs are known.

**Do not volunteer `Size` or `Estimate` at Backlog creation.** Those are Refine-exit gate fields, not creation-time fields — offering them on a stub (or any freshly-filed Backlog idea) invites premature, low-confidence sizing. Set them during Refine, where Refine→Ready for Planning records a current refinement snapshot.

## Bind every AC to evidence

List each exact verifier once in the root `## Verification Commands` section,
where every checkbox carries a stable `<!-- id=N -->`. Bind each demonstrable
Acceptance Criterion to those IDs with an
`<!-- aitm-verified vc-list="vc:N" -->` marker. Creation refuses legacy AC
`cmd` attributes, empty or missing citations, and any `vc:N` without a matching
root command. Use `<!-- aitm-non-demonstrable -->` or the governed waiver forms
only when the criterion genuinely cannot be demonstrated. Functional DoD items
retain their separate literal `cmd` declaration grammar.

## Refusal contracts (deterministic exit codes)

- `assignee-required` — no `--assignee` and no `assignee` in `.ai-task-manager/task-tracker.json`.
- `priority-required-at-groom` — `--status groom|refine|ready` without `--priority`.

Use `--dry-run` to print the rendered body without calling `gh`.

## Never promote a "suggested task" chip — offer a tracking issue instead

This is the session form of hard rule 12 (Track before you start). When you notice follow-up or out-of-scope work, **do not** surface it as a background-task chip (the session `spawn_task` "suggested task"). A chip kicks off work locally with no issue behind it — no board state, no estimate, no timing ledger, no audit trail. That is exactly the untracked work this workflow forbids.

Instead, tell the user what you found and offer to create a GitHub issue to track it: `/task new` (→ `scripts/gh/create-issue.mjs --shape <stub|epic|sub-issue|solo|defect>`). Only after the issue exists and you bind to it does the work begin. If the user explicitly insists on a chip anyway, name the trade-off (untracked) before proceeding.
