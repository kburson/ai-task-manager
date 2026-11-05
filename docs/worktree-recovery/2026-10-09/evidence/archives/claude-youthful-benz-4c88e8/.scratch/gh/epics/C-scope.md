Make the pipeline a declared artifact instead of a hardcoded one. Today the eight-stage flow is baked into `scripts/task-tracker/states/*.mjs`, `lib/lifecycle-policy/states.mjs`, and stage-name literals across roughly 74 modules. A team that wants six stages, or wants Test folded into Develop, cannot have it. This is what separates one team's process from a process engine.

The seam is closer than the file count suggests. `lib/state-factory.mjs` already exposes `createStateMachine({ definitions, policy })`, and a definition is already `{ id, entryGuards[], residentActions[], exitGuards[] }` — exactly what a config file would emit. The eight modules under `states/` are hardcoded instances assembled by static import. The factory's existing edge validation and definition-order cross-check become the config schema validator for free.

**In scope**

- A spike on GitHub Projects single-select option-id stability across a label rename, which decides whether the compiler matches stages by name or by id.
- A stage **role** vocabulary — terminal, implementation, verification, entry and similar — replacing name coupling, plus a worked classification of every stage-literal site as role, edge-scope-deletable, or false positive.
- A gate resolution registry where core gates are non-removable and config may only attach, never detach.
- Edge-bound guard binding, which deletes the 25 self-scoping `ctx.toState !== '<stage>'` checks because the binding becomes the scope.
- An `aitm.yml` schema and loader that emits today's eight stages as the default, so behavior is unchanged until a team edits the file.
- Driving `lifecycle-policy/states.mjs` and `states/index.mjs` from the loader instead of static imports.
- `aitm compile`: verify declared stages against the project's Status options, offer to create what is missing, and record resolved ids back into the file. Idempotent, and refuses ambiguous diffs rather than guessing.
- A board-drain refusal when a stage-set change is attempted while issues carry stage history, and a first-run adoption path for brownfield projects.

**Deliberate constraints**

- Supported change classes are rename, insert, and remove/merge. Reorder is expressed as remove plus insert, which forces the team to declare where in-flight issues land.
- No generation log and no versioned pipelines: one live machine, and the board is drained before a stage-set change. `LEGAL_TRANSITIONS` is derived from the current policy and validates historical marker chains, so a pipeline change would otherwise invalidate every in-flight issue's recorded history.
- First-run compile never renames or deletes an existing Status option. A tool that rewrites a team's board on install does not survive its first install.
- Brownfield issues are grandfathered explicitly via an adoption marker acting as a chain origin, rather than by loosening gates for marker-less issues.

**Out of scope**

- The external gate plugin API, which is its own epic. This epic ships the registry seam that epic plugs into.

**Sequencing risk:** the role-extraction sweep is wide rather than deep and cannot parallelize until the role vocabulary is frozen. A mechanical find-and-replace would corrupt false positives such as `decomposition-policy.mjs`, where `level === 'review'` is a signal severity and not a state.

Design: `docs/superpowers/specs/2026-09-08-aitm-yml-pipeline-engine-design.md` (Epic C section).
