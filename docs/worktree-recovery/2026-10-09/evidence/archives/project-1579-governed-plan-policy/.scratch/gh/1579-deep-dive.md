## Deep-Dive Analysis (2026-09-11)

The live repository already defines a two-bucket ownership contract from #1178 and #1181: `.scratch/` holds disposable operator-authored working material, while `.tmp/` holds machine-local runtime state and generated output. `scripts/task-tracker/lib/scratch-dir.mjs`, `scripts/task-tracker/config.mjs`, `scripts/task-tracker/paths.mjs`, the command help examples, `.scratch/README.md`, and the existing scratch-contract tests implement that split. The drift is confined to stale shared rules, selected guides, the deep-dive procedure, and README examples that still route operator-authored GitHub artifacts into the runtime bucket.

Plan approval currently validates checklist command syntax but does not inspect the linked implementation plan. Therefore a reviewed plan can still prescribe direct GitHub body replacement, executable one-off code that calls the internal body mutator, or operator scratch files in the runtime bucket. The bounded enforcement point is `npx aitm plan-approve`: resolve the already-linked plan through the existing Plan Metadata resolver, validate its current bytes before stamping approval, and refuse with deterministic rule identifiers and line numbers. Issues without a linked plan remain compatible because there is no plan artifact to inspect.

### Files to edit

- `scripts/task-tracker/lib/governed-plan-policy.mjs` — implement deterministic linked-plan resolution and policy validation.
- `scripts/task-tracker/verbs/plan-approve.mjs` — run the validator before approval and expose a stable refusal outcome.
- `scripts/task-tracker/lib/command-surface/catalog.mjs` — document the new Plan-approval refusal code.
- `scripts/tests/unit/task-tracker/core/governed-plan-policy.test.mjs` — cover allowed governed operations and every prohibited mutation/scratch shape.
- `scripts/tests/unit/task-tracker/verbs/plan-approve.test.mjs` — prove approval does not write when linked-plan policy fails.
- `CLAUDE.md`, `README.md`, `skill/shared/rules/{preferences,scratch-dirs,issue-records,review}.md`, and `.ai-task-manager/templates/references/deep-dive-procedure.md` — align author and reviewer guidance with the public governed command boundary and two-bucket contract.
- `docs/guides/{workflow,cloud-development-environments,ai-value-framework,sub-issue-nesting}.md` — move operator-authored GitHub fragments to `.scratch/gh/`.
- `scripts/tests/unit/task-tracker/lib/scratch-contract-docs.test.mjs` — pin the reconciled guidance surfaces and prevent recurrence.
- `docs/superpowers/specs/2026-09-11-1579-governed-plan-policy-design.md` and `docs/superpowers/plans/2026-09-11-1579-governed-plan-policy.md` — record the governed design and executable plan.

### Step-by-step implementation plan

1. Add focused failing tests for accepted `npx aitm issue-body` operations under `.scratch/gh/`, direct body replacement, executable internal-mutator snippets, one-off GitHub mutator scripts, and runtime-bucket drift.
2. Implement a line-oriented validator that returns stable rule IDs, line numbers, and excerpts without scanning unrelated historical plans.
3. Resolve only the issue's active linked plan from Plan Metadata during Plan approval. Refuse unreadable linked plans and policy violations before any approval marker or audit write; preserve compatibility when no plan is linked.
4. Reconcile every normative operator-facing location to `.scratch/gh/`, while retaining `.tmp/aitm/` and other runtime/generated paths.
5. Extend documentation-contract tests so runtime helpers, help, rules, guides, and the two-bucket explanation remain mutually consistent.
6. Run focused verification, Develop verification, the isolated Test stage, exact-head review, governed delivery, and closure.

### Test additions

- `scripts/tests/unit/task-tracker/core/governed-plan-policy.test.mjs` — validates accepted governed plans, deterministic rejection details, linked-plan resolution, and no-plan compatibility.
- `scripts/tests/unit/task-tracker/verbs/plan-approve.test.mjs` — validates pre-write refusal and formatted CLI outcome.
- `scripts/tests/unit/task-tracker/lib/scratch-contract-docs.test.mjs` — validates every normative surface uses `.scratch/` for disposable operator files and `.tmp/` only for runtime/generated output.

No new acceptance criterion is needed: the existing three criteria already bind the policy behavior and repository-wide validation to verification commands 1 through 4. Verification command 5 remains the required slow-lane confidence check, and command 6 proves commit attribution.

### Identified risks

- A repository-wide scan would retroactively fail immutable historical plans; validation must be limited to the active linked plan at approval time.
- Naive token matching could reject explanatory prose or miss executable fenced examples. The validator will target dangerous command/code shapes and the unambiguous runtime-bucket path rather than ban generic discussion of the internal helper name.
- Plan approval has directory-contract and adaptive-estimation branches. Validation must occur before either path can create approval authority.
- Adding a shipped module increases the package surface. Package-boundary verification may require explicit accounting if the existing ceiling test treats the new maintained validator as a runtime entry.

### Sibling sub-issues to spawn

None. The defect is standalone, bounded, and has no live children or native blockers. If implementation exposes a separate workflow defect, it will be handled under the authorized maximum defect depth of two rather than chained further.

## Dependency Map

Depends on: none

Blocks: none
