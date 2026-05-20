# Design: Tri-mode PR workflow for ai-task-manager (#125)

Date: 2026-05-20
Status: Approved (brainstorm), pending sub-issue fan-out.

## Context

Issue #125 originally proposed a binary toggle (`pullRequestWorkflow.enabled`) to opt into a PR-based git workflow with a long-lived epic branch, a merge-gate, and full git-flow semantics. Brainstorming surfaced three problems with that shape:

1. **Audience mismatch.** Full git-flow is overhead theater for a solo dev (the 95% case for this tool), and the binary toggle leaves no room for a middle ground.
2. **Rebase cascade cost.** A 3-level chain (origin/trunk → epic → child) means every upstream advance forces a cascade of rebases and force-pushes. For a solo dev who is also the only reviewer, this is pure ceremony.
3. **Merge-gate brittleness.** Holding an epic branch open until every child is merged forces long-lived divergence and a "big bang" review at the end.

This design replaces the binary toggle with a **tri-mode integration model** (`disabled` / `solo-pr` / `team-flow`), a **rolling-epic** semantics where children are folded into the local epic incrementally and the user controls when to publish, and a **strategy-pattern seam** to keep verb code mode-agnostic. The intended outcome is one tool that fits today's solo flow (no change), a solo-with-PR-audit flow, and a multi-machine team flow — without scattering `if (mode === ...)` branches through every verb.

---

## Section 1 — Config schema

`.claude/task-tracker.json` gains an `integration` block:

```json
{
  "integration": {
    "mode": "disabled",
    "trunkBranch": "trunk",
    "remote": "origin"
  }
}
```

- `mode` enum: `"disabled"` | `"solo-pr"` | `"team-flow"`. Default `"disabled"` when the `integration` block is absent (existing repos work unchanged).
- `trunkBranch` defaults to `"trunk"`; `remote` defaults to `"origin"`. Both configurable to match repos that diverge from the convention.
- Loader (`config.mjs`) validates the enum at startup and throws on unknown values with a clear message listing valid options.
- **Strict committed config.** No `.local.json` override in v1. If a need surfaces later, the loader can absorb a merge layer; not shipped preemptively.

---

## Section 2 — Branch naming + resolver

Flat namespace under three prefixes (no file-vs-directory ref collision):

| Issue type              | Branch name          | Local merge base | PR base           |
| ----------------------- | -------------------- | ---------------- | ----------------- |
| Standalone story        | `story/{id}`         | —                | `trunk`           |
| Epic                    | `epic/{id}`          | —                | `trunk`           |
| Sub-issue of epic `{p}` | `epic/{p}-task/{id}` | local `epic/{p}` | n/a (no child PR) |

New helper `lib/branch-resolver.mjs` exports `resolveBranch(issueNumber): { branchName, parentBranchName, baseForPr }`. Parent / child-vs-standalone discovery via existing `gh issue view --json parents,subIssues` patterns. Helper is pure (no side effects) — it queries `gh` and returns a plain object.

---

## Section 3 — Strategy seam

`lib/integration/index.mjs` exports `getStrategy(config)`, returning one of three objects conforming to:

```js
{
  preflightTrunk(),         // refuse to start work on trunk (or no-op)
  onBind(issue),            // create/checkout feature branch (or no-op)
  onLocalMerge(issue),      // sync-on-merge + merge child into local parent (or no-op)
  onPublish(issue),         // push + PR-state-resolve (or no-op)
  onClose(issue),           // any branch cleanup
}
```

- **`DisabledStrategy`** — every method is a no-op. Work proceeds on trunk; today's behavior preserved exactly.
- **`SoloPrStrategy`** — `onBind` creates/checkouts feature branches. `onLocalMerge` runs the sync-on-merge cycle (Section 4). `onPublish` runs only for epics and standalone stories (children skip publish). Child branches never reach `origin`.
- **`TeamFlowStrategy`** — same as `SoloPrStrategy`, plus child branches push to `origin/epic/{p}-task/{id}` for cross-machine WIP handoff. Children still do not open PRs — the epic PR is what carries work to trunk.

Verbs (`/task bind`, `/task close`, `/task push`, …) hold a reference to the strategy instantiated once at process start; verb code never branches on mode.

Shared helpers in `lib/integration/git-ops.mjs`:

- `syncEpicWithTrunk(epicBranch, trunkRef, remote)` — `git fetch origin <trunk>` then `git rebase origin/<trunk>` on the epic branch.
- `pushWithLease(branch, remote)` — `git push --force-with-lease origin <branch>`. Rejection on remote divergence surfaces as a non-zero exit with a divergence report.
- `localMerge(child, parent)` — produce a merge commit (no fast-forward, no rebase).
- `assertNotOnTrunk()` — guards `preflightTrunk`.

---

## Section 4 — Sync-on-merge, prompt-to-publish

**On `/task close {childId}` (both PR modes):**

1. Checkout local `epic/{p}`.
2. `git fetch origin {trunkBranch}`.
3. `git rebase origin/{trunkBranch}` on local `epic/{p}`. Conflicts → working tree left dirty, explicit `git rebase --continue` / `--abort` / `/task close --resume` instructions, non-zero exit.
4. Merge `epic/{p}-task/{id}` into local `epic/{p}` with a merge commit.
5. Delete local child branch. In `team-flow`, also delete `origin/epic/{p}-task/{id}`.
6. Prompt: `Push epic/{p} and open/refresh PR? [y/N]` (default N).
   - **Y** → run publish cycle inline.
   - **N** → exit. User runs `/task push {epicId}` later.

**Publish cycle** (`/task push {epicId}` or `Y` from the prompt):

1. `git push --force-with-lease origin epic/{p}`.
2. Resolve PR state via `gh pr list --head epic/{p} --base trunk --state all --limit 5`:

| Prior PR state                | Action                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------ |
| None found                    | `gh pr create --base trunk --head epic/{p}`                                    |
| One open                      | No-op; push already refreshed the diff                                         |
| Most recent `MERGED`          | Previous PR is in trunk; create a new PR for newly-merged children             |
| Most recent `CLOSED` unmerged | Prompt `Prior PR #X closed unmerged. Open new PR? [y/N]`. Y → create; N → exit |

**Standalone story** — identical cycle without the merge step. `/task close {storyId}` rebases `story/{id}` on `origin/trunk`, force-with-lease-pushes, runs PR-state resolution.

**Epic closure** — when all children closed, `/task close {epicId}`:

1. Final publish if any unpublished work remains.
2. Verify final PR merged via `gh pr view --json state`.
3. Delete local `epic/{p}` and (team-flow) `origin/epic/{p}`.

No system-enforced merge-gate. WIP buffering between local-merge and publish is at the user's discretion — they can publish after every child, after a few, or after all of them.

**Eager-PR deferred.** v1 is lazy-only (PRs open at first `/task push`). If a real need surfaces, add `integration.prCreation: "lazy"|"eager"` as a follow-up issue.

**`solo-pr` vs `team-flow` runtime difference** reduces to: team-flow pushes child branches to origin for cross-machine WIP handoff; solo-pr keeps them local.

---

## Section 5 — Testing strategy

**Unit tests** (`tests/integration/*.test.mjs`):

- `branch-resolver.test.mjs` — issue type → branch name + parent + base; edge cases (epic with no children, child with closed parent, missing issue).
- `disabled-strategy.test.mjs` — every method is a no-op; working tree untouched.
- `solo-pr-strategy.test.mjs` — against `tmp/` git fixture: `onBind` creates correct branch from correct base; `onLocalMerge` produces merge commit; `onPublish` no-ops for children; child branches never reach origin.
- `team-flow-strategy.test.mjs` — same fixture: children push to origin; child `onPublish` is no-op; PRs only from epic/story `onPublish`.
- `git-ops.test.mjs` — `syncEpicWithTrunk` clean case + conflict case; `pushWithLease` clean + rejection case.
- `pr-state-resolver.test.mjs` — table-driven over the four PR-state outcomes with stubbed `gh pr list` JSON.

**Integration tests** (`tests/e2e/`, one per mode):

- `disabled.e2e.test.mjs` — epic + one child with `mode: disabled`. Asserts no branches created, no pushes, no PRs; behavior byte-for-byte matches a baseline snapshot of today's flow.
- `solo-pr.e2e.test.mjs` — epic + two children. Child branches local-only; epic publish opens PR (`head: epic/{id}, base: trunk`); second child close runs sync-on-merge against advanced origin/trunk; epic close deletes local epic branch.
- `team-flow.e2e.test.mjs` — two clones of a bare origin simulate two machines. Machine A: bind + close child → push + PR. Machine B: fetch → bind + close own child against advanced origin/epic. Asserts cross-machine WIP handoff via origin child-branch refs.

**Fixtures.** `tests/fixtures/bare-origin/` holds a bare-repo template; integration tests clone it in `beforeEach` and clean up in `afterEach`. CI matrix runs all three e2e suites in parallel jobs.

---

## Section 6 — Epic body migration + docs

### Acceptance Criteria (rewritten)

| #   | New AC                                                                                                                                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `.claude/task-tracker.json` schema documents an `integration` block with `mode` (enum: `disabled`/`solo-pr`/`team-flow`), `trunkBranch`, `remote`. Loader validates the enum and throws on unknown values.                                          |
| 2   | When `mode: disabled` (or block absent), all existing verbs behave identically to today (no branch creation, no push, no PR).                                                                                                                       |
| 3   | When `mode ≠ disabled`, `/task bind` refuses to start work on trunk and creates/checks out the correct feature branch via the branch-resolver.                                                                                                      |
| 4   | Branch names follow the flat namespace exactly: `story/{id}`, `epic/{id}`, `epic/{p}-task/{id}`.                                                                                                                                                    |
| 5   | `/task close {childId}` runs the sync-on-merge cycle (fetch trunk → rebase local epic on origin/trunk → merge child into local epic). Conflicts surface explicitly with recovery instructions; no silent force-push.                                |
| 6   | `/task push` (or `Y` from the close prompt) opens/updates a PR with `head: epic/{id}, base: trunk`. Standalone story uses `head: story/{id}, base: trunk`. PR-state resolution handles all four prior-PR states (none/open/merged/closed-unmerged). |
| 7   | When all children closed, `/task close {epicId}` runs a final publish (if needed), verifies the PR merged, then deletes local `epic/{p}` and (team-flow) `origin/epic/{p}`. No system-enforced merge-gate.                                          |
| 8   | `gh pr create` invocations use the configured assignee and label conventions, mirroring `create-issue.mjs` patterns.                                                                                                                                |
| 9   | `docs/guides/workflow.md` documents tri-mode, branch resolver, sync-on-merge, PR-state resolution, conflict recovery.                                                                                                                               |
| 10  | `docs/guides/settings-guide.md` documents the `integration` config block with per-mode examples.                                                                                                                                                    |
| 11  | Three e2e tests (one per mode) pass, plus the unit tests listed in Section 5.                                                                                                                                                                       |
| 12  | All existing tests pass with `mode: disabled` (no regression).                                                                                                                                                                                      |

### Open assumptions (replace originals)

- Tri-mode chosen over binary toggle; `disabled` is the default.
- Rolling-epic semantics (no merge-gate); user controls publish cadence.
- Eager-PR creation deferred; v1 is lazy (PRs open at first `/task push`).
- Flat-namespace branch names (`story/{id}` / `epic/{id}` / `epic/{p}-task/{id}`) chosen to avoid git's file-vs-directory ref collision.
- Memory entry "Solo project — local-only, no push, no PRs" gets a conditional clause: applies only when `mode: disabled`.

### Planned sub-issues (10) — file in a follow-up session

| #   | Title                                                                                     | Size | Est | Seq |
| --- | ----------------------------------------------------------------------------------------- | ---- | --- | --- |
| 1   | Add `integration` config block to schema + loader (`config.mjs`)                          | XS   | 1h  | 1   |
| 2   | Implement `branch-resolver` helper                                                        | S    | 2h  | 2   |
| 3   | Implement strategy seam (`getStrategy` + 3 strategy classes)                              | M    | 3h  | 3   |
| 4   | Implement `git-ops` helpers (sync, push-with-lease, local-merge, assert)                  | M    | 4h  | 4   |
| 5   | Wire `/task close` to invoke `onLocalMerge` + sync-on-merge + prompt-to-push              | M    | 4h  | 5   |
| 6   | New verb `/task push` — publish cycle + PR-state resolution                               | M    | 4h  | 6   |
| 7   | Wire `/task bind` to create/checkout feature branch when mode ≠ disabled                  | M    | 3h  | 7   |
| 8   | Docs: workflow.md + settings-guide.md + parallel-agents.md note                           | S    | 2h  | 8   |
| 9   | Unit tests (per Section 5) + 3 e2e tests                                                  | M    | 5h  | 9   |
| 10  | Audit other verbs (analyze, approve, review, promote, demote, pause) for branch-awareness | S    | 2h  | 10  |

Total ~30h, unchanged from original estimate.

### Memory updates (post-merge)

- `feedback_no_pr_to_origin.md` — add conditional clause: applies when `integration.mode == "disabled"`; if user sets a PR mode, defer to that.

### Docs to update

- `docs/guides/workflow.md` — new "PR Workflow Modes" section: tri-mode table, branch hierarchy, sync-on-merge cycle, PR-state resolution, conflict recovery.
- `docs/guides/settings-guide.md` — new `integration` config block with per-mode examples.
- `docs/guides/parallel-agents.md` — note that worktrees in non-`disabled` modes must check out the right feature branch (link to branch-resolver).

---

## Critical files to modify

- `scripts/lib/config.mjs` — extend loader for `integration` block.
- `scripts/lib/branch-resolver.mjs` — **new**.
- `scripts/lib/integration/index.mjs` — **new** (strategy factory).
- `scripts/lib/integration/disabled-strategy.mjs` — **new**.
- `scripts/lib/integration/solo-pr-strategy.mjs` — **new**.
- `scripts/lib/integration/team-flow-strategy.mjs` — **new**.
- `scripts/lib/integration/git-ops.mjs` — **new**.
- `scripts/gh/move-state.mjs` — already the single state-mutator; wire strategy calls into the transitions that trigger bind/close/push.
- `scripts/gh/push.mjs` — **new** verb backing `/task push`.
- `.claude/task-tracker.json` — add `integration` block (default `mode: disabled`).
- `docs/guides/workflow.md`, `docs/guides/settings-guide.md`, `docs/guides/parallel-agents.md` — update per Section 6.
- `tests/integration/*.test.mjs` — new unit tests per Section 5.
- `tests/e2e/{disabled,solo-pr,team-flow}.e2e.test.mjs` — new integration tests.
- `tests/fixtures/bare-origin/` — new fixture directory.

---

## Verification

End-to-end verification after implementation:

1. **`mode: disabled` regression check.** Existing test suite must pass unchanged. Run `npm test` against a repo with no `integration` block — behavior identical to today.
2. **`solo-pr` happy path.** Set `mode: solo-pr` in `.claude/task-tracker.json`. Create an epic + two children via `scripts/gh/create-issue.mjs`. Bind + work + close each child. Confirm: child branches exist locally only (`git branch --list 'epic/*'`), local epic accumulates merge commits, prompt fires on close, choosing `Y` opens a PR with `head: epic/{id}, base: trunk`, choosing `N` defers to `/task push`.
3. **`team-flow` cross-machine handoff.** Clone the test repo twice. Machine A closes child #1, pushes epic. Machine B fetches, sees `origin/epic/{p}` advanced, binds child #2, closes — confirm rebase-on-merge picks up sibling commits cleanly.
4. **Conflict recovery.** Manually introduce a conflict between local epic and origin/trunk. Run `/task close` on a child — confirm working tree left dirty, instruction text printed, non-zero exit, no force-push.
5. **PR-state edge cases.** Close a PR manually mid-stream; rerun `/task push` and confirm the prompt fires (closed-unmerged path). Merge a PR; rerun `/task push` after another child closes — confirm new PR opens for new work.
6. **All e2e tests green** in CI matrix across three mode jobs.

---

## Follow-up

- File the 10 sub-issues per the table in Section 6 via `scripts/gh/create-issue.mjs --shape sub-issue --parent 125`. Each child gets its own scope/ac/plan-metadata staging files under `./tmp/`.
- Update #125's body to point at this spec and replace the original AC list with the rewritten AC table.
