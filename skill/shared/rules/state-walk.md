<!-- aitm-skill-version: 1.0.0 -->

# rules/state-walk.md

Tier-2. Loaded JIT on `/task promote`, `/task demote`, `/task next`, `/task reconcile`. On first read, emit:

```
aitm-skill-loaded:rules/state-walk:1.0.0
```

## 7-state model

```
backlog → refine → plan → develop → test → review → done
```

State slugs are canonical. There is no slug shim — the renamed states are the only recognized inputs. See `docs/migration-history.md` for the migration from the prior 4-state vocabulary.

## Canonical verbs

| Verb                                                    | Action                                                                                                                                                                                                                              |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/task promote [<N>]`                                   | Forward one state. Reads current state, picks legal next state, runs the gate.                                                                                                                                                      |
| `/task next [<N>]`                                      | Alias of `/task promote`.                                                                                                                                                                                                           |
| `/task demote [<N>]`                                    | Back to `develop` from any forward state (test / review). Records the demotion in the timing log.                                                                                                                                   |
| `/task reconcile <N> <accept-live\|revert-to-recorded>` | Drift recovery. Board ↔ local field-DB disagreement. `accept-live` treats GitHub Projects as source of truth; `revert-to-recorded` pushes the local recorded state back to the board. Run before any other verb on a drifted issue. |

`/task plan-approve #N`, `/task approve #N`, and `/task reject #N --reason "..."` remain first-class — they are gate verbs, not state-walking verbs.

## Forbidden

- ❌ `move-state.mjs <N> <state>` directly to jump arbitrarily. Always use `/task promote` (or `next`) to advance one step and `/task demote` to step back. One step at a time prevents stage-skipping (e.g., Backlog → Develop).
- ❌ `move-state.mjs <N> done` directly. Only `/task close` does that, internally.
- ❌ User-facing `/task move <state>` verb. Does not exist.

## Test → Review

No CLI verb. Agent self-reports `REVIEW_COMPLETE`. The orchestrator confirms the report and runs `/task promote` to move the issue.

## Plan → Develop gate

`/task promote` from Plan refuses unless `<!-- aitm-plan-approved: <ts> -->` is in the issue body. Record approval first with `/task plan-approve #N` (idempotent; valid only while issue is in Plan). Toggled by `gateAnalysisToDevelopment` (legacy name retained).

## Estimation comment surfaces

Two state-walk verbs emit estimation comments (see `docs/guides/workflow.md` → Three-stage estimation):

- `/task promote <N>` from Plan: if the Deep-Dive Analysis shifts the Size/Estimate bucket, posts a `### 🔁 Plan re-estimate` comment with from→to table and updates the board. A ≥2-tier jump posts a `⚠ HUMAN ATTENTION` variant and skips the writes. Bypass: `TASK_TRACKER_SKIP_REEVAL=1`.
- `/task close <N>`: posts a `### 📊 Review delta` comment (Estimate vs. Actual hours). Read-only — Size and Estimate are not changed at close. Bypass: `TASK_TRACKER_SKIP_DELTA=1`.

## Drift detection

If `task-tracker.mjs` reports a state mismatch between the board and `.ai-task-manager/task-tracker-state.json`, run `reconcile` BEFORE any other verb. Running `promote` or `demote` on a drifted issue compounds the drift.

```bash
node node_modules/ai-task-manager/scripts/task-tracker/task-tracker.mjs reconcile <accept-live|revert-to-recorded> <N>
```

Choose `accept-live` when the board reflects an out-of-band human move; `revert-to-recorded` when an unintended board edit happened and the recorded state was correct.
