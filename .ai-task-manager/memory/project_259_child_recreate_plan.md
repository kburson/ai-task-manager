# Epic #259 — Child Issue Recreate & Delete Plan

## Why this exists

Sub-issues `#264`, `#265`, `#266`, `#268` (guard-registry refactor children under epic #259) accumulated GitHub event-log markers (state moves, comments, sub-issue links) from a Refine-forward run that the user wants undone. GitHub's event log is immutable — it cannot be erased via API. The only way to remove the noise is to **create replacements in Backlog cleaned of all post-Refine artifacts, rewire #259's sub-issue list to point to the replacements, then hard-delete the originals**.

User directive (verbatim, Turn 2 of pre-compact session):

> "we will keep 262 & 263, replace 264, 265, 266, 268 with fresh copies in Backlog that are cleaned of all the artifacts generated from Refine forward. delete/prune/reset all worktrees -- I do not want any orphaned work distracting us. Once that is all done let me inspect the child stories and we will move forward from there."

Sequence directive (verbatim):

> "keep the sequence order the same..."

## What to do

For each of #264, #265, #266, #268:

1. **Source the reset body** from `.tmp/reset/<N>.body.md` (already prepared with cleaned content; sequences 300 / 301 / 302 / 304 respectively).
2. **Create replacement issue** via `node scripts/gh/create-issue.mjs` (NEVER `gh issue create` directly). Carry over from original: title, Size, Estimate, Priority (P2), Sequence (300/301/302/304), Risk, Validation. Parent = #259. Label = `refactor`. Assignee = configured value from `.claude/task-tracker.json` (`--assignee <value>`).
3. **Link as sub-issue of #259** via `addSubIssue` GraphQL mutation (per workflow guide).
4. **Update epic #259's body** sub-issue list — swap old number for new.
5. **Hard-delete original** via `gh issue delete <N> --yes` (after replacement is wired up).
6. **Delete the corresponding worktree** if one exists (e.g. `git worktree remove <path>`; `git branch -D <branch>` if needed). Per `feedback_main_thread_only.md` — never push to origin.

After all four replacements exist and originals are deleted: **PAUSE and let the user inspect** before any further state moves. Do not auto-promote.

## Scope mapping (original → replacement)

| Old  | Sequence | Body file                | Status before delete |
| ---- | -------- | ------------------------ | -------------------- |
| #264 | 300      | `.tmp/reset/264.body.md` | various post-Refine  |
| #265 | 301      | `.tmp/reset/265.body.md` | various post-Refine  |
| #266 | 302      | `.tmp/reset/266.body.md` | various post-Refine  |
| #268 | 304      | `.tmp/reset/268.body.md` | various post-Refine  |

#262 and #263 are **kept as-is** — do not touch.

## Constraints (must obey, all standing rules)

- **Solo project — local-only, no push, no PRs** (`feedback_no_pr_to_origin.md`, `feedback_main_thread_only.md`). Commit/merge to trunk and stop. Never push to origin.
- **Invoke task-tracker via `scripts/`, not `node_modules/`** (`project_task_tracker_invocation_path.md`).
- **`/task #N` bind is mandatory** before any state move (`feedback_task_bind_mandatory.md`).
- **Single state-mutator** — only `move-state.mjs` writes Status (`feedback_single_state_mutator.md`).
- **Route issue bodies through scripts** — always use `scripts/gh/create-issue.mjs` + `preflight-issue.mjs`; never hand-roll (`feedback_route_issue_bodies_through_scripts.md`).
- **`preflight-issue.mjs` prepends `## Scope` / `## Acceptance Criteria` / `## Plan Metadata` headers itself** — caller-supplied scope/ac/plan-meta files MUST NOT include these headers, or duplicate headers result and the AC parser fails with `refine-ac-section-empty`. (Hit this on #275 — see this session's transcript.)
- **AC `aitm-verified-by` markers forbid pipes (`|`)**. Use multiple backticked commands or wrap in a script under `.tmp/inspect/`.
- **AC markers must be in backticks**, or preflight warns `missing-backticks`.
- **Pause timer on blocking questions** (`feedback_pause_on_blocking_question.md`) — `/task pause "..."` before asking, `/task start "..."` on resume.
- **`./.scratch/` is the canonical disposable scratch dir** (`feedback_scratch_dir_canonical.md`); `.tmp/` is runtime and generated output.
- _*TASK_TRACKER_FORCE_* env overrides are forbidden_* (the rip-out being completed in #275).
- **On Mistakes** — STOP, announce, give 2-3 options, wait. No self-correct.

## Known blocker carried into this work

Per-session `active-task.json` `kanbanState` field is **not seeded by `task-tracker start`** (defect TBD — see `scripts/task-tracker/verbs/start.mjs:71`, `resume.mjs:81`). Activity-guard then refuses WRITE_* with "no recorded kanban state." Manual patches violate single-state-mutator and are denied by the auto-mode classifier. **This must be fixed before the recreate-and-delete plan can run** — otherwise every state-bind on a new issue will dead-lock. Fix candidate: file as its own defect after #275 closes; or roll into a `/task reconcile` enhancement that seeds the session file.

## Status when this memory was written

- #275 (FORCE_* rip-out defect) currently in **Develop** column on board; session file mismatched at `kanbanState: "plan"`; the user is choosing between rollback / fix-upstream / authorize-patch options.
- #264, #265, #266, #268 still exist on the board, untouched.
- `.tmp/reset/{264,265,266,268}.body.md` already prepared.
- Worktrees: not yet enumerated; do `git worktree list` first.

## Resume entry point

After unblocking #275 and resolving the kanbanState-seed defect: list worktrees → for each old issue execute steps 1-6 above → PAUSE for user inspection.
