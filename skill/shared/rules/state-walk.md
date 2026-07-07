<!-- aitm-skill-version: 1.1.0 -->
<!-- aitm-rule-id: state-movement -->

# rules/state-walk.md

Tier-2. Loaded JIT on `/task promote`, `/task demote`, `/task next`, `/task reconcile`. On first read, emit:

```
aitm-skill-loaded:rules/state-walk:1.1.0
```

## 8-state model

```
backlog → on-deck → refine → plan → develop → test → review → done
```

`on-deck` (display: "On Deck") is an inert, gateless tranche waiting room between Backlog and Refine. `backlog → on-deck` carries no entry gate; the Priority entry gate lives on `on-deck → refine`. Backward arc `on-deck → backlog` drops an item out of the current tranche. Every item passes through On Deck — there is no `backlog → refine` shortcut.

State slugs are canonical. There is no slug shim — the renamed states are the only recognized inputs. See `docs/migration-history.md` for the migration from the prior 4-state vocabulary.

## Canonical verbs

| Verb                                                    | Action                                                                                                                                                                                                                              |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/task promote [<N>]`                                   | Forward one state. Reads current state, picks legal next state, runs the gate.                                                                                                                                                      |
| `/task next [<N>]`                                      | Alias of `/task promote`.                                                                                                                                                                                                           |
| `/task demote [<N>]`                                    | Back to `develop` from any forward state (test / review). Records the demotion in the timing log.                                                                                                                                   |
| `/task reconcile <N> <accept-live\|revert-to-recorded>` | Drift recovery. Board ↔ local field-DB disagreement. `accept-live` treats GitHub Projects as source of truth; `revert-to-recorded` pushes the local recorded state back to the board. Run before any other verb on a drifted issue. |

`/task plan-approve #N`, `/task approve #N`, and `/task reject #N --reason "..."` remain first-class — they are gate verbs, not state-walking verbs.

`/task dod-stamp <key>` is a Test/Review-stage helper, not a state-walking verb. It runs the verifier declared on a Functional DoD item and stamps an evidence marker that unlocks the corresponding `/task check` tick. See `rules/functional-dod.md` for the full contract.

`/task ac-stamp <label>` and `/task test` are Develop/Test-stage helpers, not state-walking verbs. `ac-stamp` runs the verifier command(s) declared on an Acceptance Criteria item and stamps genuine execution-proof evidence (exit/sha/ts/key) onto that AC. `test` runs the full Verification Commands suite in a fresh sandbox worktree and, on an all-green result, auto-ticks passing checkboxes/DoD items and moves the issue to Test. Neither advances the kanban board on its own the way `promote`/`demote`/`close` do.

## Forbidden

- ❌ `move-state.mjs <N> <state>` directly to jump arbitrarily. Always use `/task promote` (or `next`) to advance one step and `/task demote` to step back. One step at a time prevents stage-skipping (e.g., Backlog → Develop).
- ❌ `move-state.mjs <N> done` directly. Only `/task close` does that, internally.
- ❌ User-facing `/task move <state>` verb. Does not exist.

## Test → Review

No CLI verb. Agent self-reports `REVIEW_COMPLETE`. The orchestrator confirms the report and runs `/task promote` to move the issue.

## Plan → Develop gate

`/task promote` from Plan refuses unless `<!-- aitm-plan-approved: <ts> -->` is in the issue body. Record approval first with `/task plan-approve #N` (idempotent; valid only while issue is in Plan). Toggled by `gateAnalysisToDevelopment` (legacy name retained).

## Estimation comment surfaces

See [`docs/guides/workflow.md`](../../../docs/guides/workflow.md) → Three-stage estimation for the comment-emitting verbs (`/task promote` from Plan, `/task close`) and their bypass envs.

## Scratch directories during state walks

State-walk verbs that materialize transient files (issue body drafts, plan/heal/inspect scratch, sandbox temp dirs) route through `scripts/task-tracker/lib/scratch-dir.mjs` — `projectScratchDir`, `mkdtempProjectIsolated`, `mkdtempOutsideRepo`. Never write to `/tmp/` / `os.tmpdir()`. Full rule: [`rules/scratch-dirs.md`](scratch-dirs.md). Enforced by `npm run lint:tmp`.

## Drift detection

If `task-tracker.mjs` reports a state mismatch between the board and `.ai-task-manager/task-tracker-state.json`, run `reconcile` BEFORE any other verb. Running `promote` or `demote` on a drifted issue compounds the drift.

```bash
npx aitm reconcile <accept-live|revert-to-recorded> <N>
```

Choose `accept-live` when the board reflects an out-of-band human move; `revert-to-recorded` when an unintended board edit happened and the recorded state was correct.
