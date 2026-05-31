<!-- aitm-skill-version: 1.0.0 -->

# rules/plan-mode-backlog.md

Tier-2. Loaded JIT on `/task new` when `active === "plan"` in the state file. On first read, emit:

```
aitm-skill-loaded:rules/plan-mode-backlog:1.0.0
```

## Entry condition

`/task new [title]` while `cat .ai-task-manager/task-tracker-state.json` shows `active === "plan"`.

Ask the user:

> "I see a spec in context — use it to build out the full backlog?
> I'll create **all** epics and sub-issues, set sizing/priority, and inject pickup directives across the entire plan — no stopping between epics.
> **yes** / **no** (no creates a single blank issue and starts tracking)"

- **no** → run the CLI normally.
- **yes** → proceed below. **Do not call the task-tracker CLI.** Orchestration uses `create-issue.mjs` directly.

## Stubs only

**All issues are stubs.** Do not deep-dive any issue at creation time — not epics, not sub-issues, not solos. Every issue gets: scope (verbatim from spec) + acceptance criteria + Pickup Directive. The deep dive happens at pickup time, against the current state of the repo.

Process ALL epics in document order — do not stop between epics.

## Preflight — MANDATORY before any issue create

```bash
node node_modules/ai-task-manager/scripts/task-tracker/preflight-issue.mjs --check-only
```

Non-zero exit: STOP. Surface stderr verbatim. The user must reinstall the skill. Do not create any issues. Resume only after the user confirms install completed.

The preflight verifies `.ai-task-manager/pickup-directive.md` and `.ai-task-manager/definition-of-done.md` exist — these encode the contract the close gate enforces.

When assembling a real body, run the script without `--check-only` and capture stdout — it emits the canonical DoD + Pickup Directive tail block with `<this-issue-#>` and `<parent-epic-#>` placeholders.

## Label setup (once, before any issue create)

See [`docs/label-setup.md`](../../../docs/label-setup.md) — master plan label, purpose label inference table, config reads, GraphQL field-ID lookup.

## Project Tether — MANDATORY

Every created epic, sub-issue, and solo task must be tethered via `project-tether.mjs` after creation. Do not trust raw `addProjectV2ItemById` output — GitHub can return issue-side metadata while the Project board has no visible item.

`create-issue.mjs --shape <epic|sub-issue|solo>` runs the tether atomically. Use it.

### Backlog vs Todo (Ready) at tether time

- **Plan-mode sub-issues:** keep `--status backlog`. Flip to `ready`/`in-progress` happens at fan-out (`dispatch-prep.mjs`). Not every planned sub-issue is dispatched immediately.
- **Ad-hoc sized + AC'd issues** (agent files a follow-on, human files a sized story): pass `--status ready`. Backlog is the unvetted-ideas inbox; sized + AC'd work belongs in Todo.
- A non-blocking warning fires when `--status backlog` is paired with both `--size` and `--estimate`. The operation proceeds.

## Epic creation

Stage three fragments under `./.tmp/plan/`:

- `./.tmp/plan/scope.md` — Epic Scope prose
- `./.tmp/plan/acs.md` — Acceptance Criteria as `- [ ]` checkboxes (closes-gate parser requires the bracket-space-bracket format)
- `./.tmp/plan/plan-meta.md` — `**Size:**`, `**Estimate:**`, `**Priority:**`, `**Sequence:**`

Create + tether atomically:

```bash
node node_modules/ai-task-manager/scripts/gh/create-issue.mjs \
  --shape epic \
  --title "EPIC: <title>" \
  --scope-file ./.tmp/plan/scope.md \
  --ac-file ./.tmp/plan/acs.md \
  --plan-metadata-file ./.tmp/plan/plan-meta.md \
  --priority <p0|p1|p2> \
  --size <XS|S|M|L|XL> \
  --estimate <hours-as-float> \
  --sequence <N> \
  --assignee "$ASSIGNEE" \
  --label "plan:<slug>" \
  --label "<inferred>" [...]
```

Default epic priority: `p0`. Capture the issue URL from stdout, extract the number, store as `EPIC_N`. Get the node id: `gh issue view <EPIC_N> --json id --jq '.id'` → `EPIC_NODE_ID`.

Use `--dry-run` to preview the rendered body without creating.

If the helper exits non-zero, STOP. Either the issue was never created (gh failure) or it was created but not tethered — the helper prints the exact recovery command.

## Sub-issue loop

For each sub-issue in document order:

1. Infer purpose labels from scope.
2. Stage `./.tmp/plan/scope.md`, `./.tmp/plan/acs.md`, `./.tmp/plan/plan-meta.md`.
3. Create + tether:

```bash
node node_modules/ai-task-manager/scripts/gh/create-issue.mjs \
  --shape sub-issue \
  --title "<title>" \
  --scope-file ./.tmp/plan/scope.md \
  --ac-file ./.tmp/plan/acs.md \
  --plan-metadata-file ./.tmp/plan/plan-meta.md \
  --parent <EPIC_N> \
  --priority <inherit from parent if absent> \
  --size <…> --estimate <…> --sequence <N> \
  --assignee "$ASSIGNEE" --label "plan:<slug>" --label "<inferred>" [...]
```

The helper tethers to Backlog, sets priority/size/estimate/sequence, links to the epic via `addSubIssue` after project-side visibility is verified, and substitutes `<this-issue-#>` and `<parent-epic-#>` placeholders.

4. Progress line:

```
  Created #<SUB_N>  <title>  [backend, security]  S  3h  P0  Seq:<N>  → linked to #<EPIC_N>
```

If the helper exits non-zero, STOP and follow its recovery instructions.

## Summary report

After ALL epics and sub-issues created, print the complete issue map and ask:

> "Which epic should I attach this session to for tracking? (or reply 'none' to stay in plan mode)"

User names an epic → `/task #<EPIC_N>` to attach. **none** → stay in plan mode.

## Sequence semantics

Include `**Sequence:** N` in every issue header. Same-sequence issues run in parallel; higher-sequence issues wait for all lower-sequence issues in scope to close. Without an explicit sequence, defaults to 1 (fully parallel). Cross-epic ordering belongs in a top-level note at the top of the spec.
