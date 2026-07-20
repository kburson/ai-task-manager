# Epic-Aware Git Branching Guardrail — Design

- **Date:** 2026-07-20
- **Status:** Draft (design approved in brainstorming; pending spec review → implementation plan)
- **Origin:** Post-mortem of the epic #859 Wave-1 parallel fan-out debacle

## Problem

Epic #859's Wave-1 parallel fan-out dispatched three agents (#861, #865, #866)
into isolated worktrees with an explicit instruction: **cut each worktree from
the head of `feature/epic/859`**. All three cut from **trunk** (`3ea7ecc`)
instead. Every branch's `merge-base` with the epic collapsed to the trunk fork
point, making all three deliverables subject to merge conflicts and silent
corruption when merged back into the epic's diverged line.

### Root cause

The native worktree-isolation primitive (`Agent({isolation:"worktree"})`) **forks
every worktree from the repository's default branch and exposes no base
parameter.** The "cut from epic head" instruction therefore had **no enforcement
surface** — it was behavioral discipline with nothing in `scripts/` to make it
true or to catch its violation. A grep of the codebase confirms zero branch-base
resolution logic anywhere prior to this design.

This is a class of failure that behavioral instruction cannot prevent. The fix
must be **structural**: correct-by-construction creation plus fail-closed
verification.

## Goals

1. Make epic-child worktrees **cut from the correct base by construction** —
   the tooling creates them, not a free-form agent instruction.
2. **Fail closed**: an agent working in a mis-based worktree is refused at its
   first `Edit`/`Write`, before corrupt work accumulates.
3. Support **nested epics** (an epic whose parent is another epic) with the same
   rules applied recursively.
4. Keep the epic branch **continuously integrated** with trunk, and children
   continuously integrated with their epic — WIP-limiting by topology.
5. Store **no derived state**: all lineage is resolved live from the branch
   naming convention + the GitHub sub-issue graph + `git merge-base`.

## Non-goals

- Not changing the attribution model — it stays **message-based** (`[#N]`
  tokens), independent of commit SHAs. This is what makes rebasing free.
- No stored manifest and no recorded "cut-from SHA." Both duplicate a git fact,
  rot on every rebase, and diverge per worktree. Explicitly rejected.
- Not supporting the same branch checked out in multiple worktrees — git forbids
  it (a branch is a single shared ref), and we do not want it.
- Not auto-resolving rebase conflicts. On conflict or test failure the merge is
  refused and the conflict surfaced to the agent/human.

## Branching model (feature-based, not trunk-based)

```
trunk ──────────────────────────────────────────────►  (thoroughly tested; PR target)
   └─ feature/epic/859 ───────────────────────────►     epic tributary (cut from trunk head)
        ├─ feature/child/858 ─►(rebase+test)─┐
        ├─ feature/child/856 ─►(rebase+test)─┤ ff-merge back into the epic
        ├─ feature/child/867 ─►(rebase+test)─┘
        └─ feature/epic/860 ──────────────►          nested sub-epic (cut from epic 859 head)
             ├─ feature/child/872 ─►(rebase+test)─┐
             ├─ feature/child/873 ─►(rebase+test)─┤ ff-merge back into epic 860
             └─ feature/child/874 ─►(rebase+test)─┘
```

- The **epic branch** is cut from trunk head and is the main tributary for all of
  the epic's work.
- Each **child** is cut from its **epic's head — never from trunk or a
  grandparent.**
- **Nested epics** are cut from their parent epic's head, recursively.
- When all children are merged into the epic **and** the epic contains all of
  trunk, the epic opens a **PR to trunk**, where it is thoroughly tested and
  merged.

### WIP-limiting principle

Forcing the epic to keep pace with trunk, and transitively forcing children to
keep pace with their parent, is **limiting work-in-progress**: every unit is
always designed against fresh state, and conflicts stay small because they are
resolved continuously instead of accumulating into a big-bang end-of-epic merge.
The branching rules are that principle made structural.

## Naming convention (flat, role-typed; lineage lives in git, not the name)

```
feature/story/<N>    # root-level standalone story   (cut from trunk)
feature/epic/<N>     # epic                          (root epic: cut from trunk;
                     #                                 nested epic: cut from parent epic)
feature/child/<N>    # child of an epic              (cut from its epic head)
```

- **Segment 1** `feature/` — namespace. Keeps managed branches greppable,
  prevents a bare-number root branch, and separates them from `trunk`/hotfix.
- **Segment 2** `story|epic|child` — role. A **classification hint** enabling
  globs (`feature/epic/*` to enumerate epics for the durability push;
  `feature/child/*` for post-merge cleanup) without a `gh` call. Mildly mutable:
  on the rare child→epic promotion the branch is renamed as a deliberate step.
- **Segment 3** `<issue#>` — the **globally-unique key**. Because the issue
  number is already unique, encoding the parent path in front of it (the
  hierarchical alternative, `feature/epic/859/epic/860/child/872`) would be
  redundant *and* would bake the one thing that legitimately changes —
  parentage — into an identifier, forcing renames on every re-parent.

**Lineage is never encoded in the name.** A re-parent is a `git rebase` onto the
new base with **zero rename**.

## Lineage resolution (no stored state)

Two live sources, queried on demand:

- **Intended parent** (which epic a child belongs to) → the **GitHub sub-issue
  graph** via `gh`. Remote and authoritative; any worktree resolves the same
  answer.
- **Actual cut/rebase base** → **`git merge-base`**. The live git fact, never a
  recorded copy.

`resolve-epic-lineage(issueNumberOrBranch) → { role, branch, epicBranch, parentBranch }`
is the single resolver every script and the guard call. `parentBranch` is
`trunk` for a root epic/story, or the parent epic's branch for a child or nested
epic.

## Worktree ownership — task-tracker creates them

The native `Agent({isolation:"worktree"})` primitive is **not** used for epic
children: it forks from the default branch with no base control (the debacle's
direct cause). Instead:

- **`cut-child-worktree.mjs <child#>`** — resolves the child's epic via
  `resolve-epic-lineage`, computes the epic branch name, and runs
  `git worktree add -b feature/child/<N> <path> <epicHead>`. The agent is then
  dispatched **into** the pre-created, correctly-based worktree.
- **`cut-epic-branch.mjs <epic#>`** — cuts `feature/epic/<N>` from the resolved
  parent (trunk for a root epic; the parent epic head for a nested one).

Creation is correct by construction; the guard below is defense-in-depth.

## Merge-back protocol (recursive: rebase → test → ff-only)

One operation, applied identically at every level and every merge-back. To merge
child `C` back into parent `P`:

```
1. if grandparent G exists:  rebase P onto G           # no-op when G's head is unchanged
2. rebase C onto P  +  run C's tests                   # C current & green vs the refreshed P
3. git merge --ff-only C into P                        # linear, tested, fast-forward
```

- On **rebase conflict** or **test failure**: stop, surface, **refuse the merge**.
- `--ff-only` guarantees the parent only ever fast-forwards over tested commits:
  linear history, no merge commits, and every parent state was tested against its
  actual parent.
- The rule recurses up the whole tree — child→sub-epic→epic→trunk all use it.

## Epic ↔ trunk re-sync (rebase, force-with-lease)

Step 1 of the merge-back protocol, at the epic level, *is* the re-sync: **rebase
the epic onto trunk.** Rebase (not merge-trunk-in) is correct here because
attribution is SHA-agnostic, so rewriting the epic's commits costs nothing, and
children are cut from the **local** epic — the rewritten commits are refs nothing
depends on.

- The epic is a **shared** (pushed) branch, so the post-rebase push is
  `git push --force-with-lease origin feature/epic/<N>`. `--with-lease` fails
  safe if origin moved unexpectedly; since nothing else writes `origin/epic`, it
  is safe and merely catches surprises.
- **Trigger:** an explicit `sync-epic <N>` verb **plus** an opportunistic check
  at every child merge-back — before merging, test
  `git merge-base --is-ancestor origin/trunk <epic>`; if trunk has advanced, run
  the re-sync first. This piggybacks on an event already running tests, so
  divergence never accumulates. **Lazy/at-PR-time-only is rejected** — it is the
  big-bang-merge failure mode.
- **Self-healing siblings:** when a re-sync rebases the epic, in-flight siblings
  still cut from the old epic head **trip the guard** and cannot edit until they
  rebase — the fail-closed signal forcing them to absorb trunk. Step 2 rebases
  each sibling at *its* own merge, so no proactive sibling re-sync is needed.

## Durability

- The **epic branch is pushed to origin on every child-merge** — the accumulator
  backup and the eventual PR source in one push. Losing the local epic worktree
  no longer loses merged work.
- **Children are never pushed** — private, disposable once merged into the epic.
- Post-rebase epic pushes use `--force-with-lease` (see above).

## Cleanup

- **Remote epic branch:** enable the repo setting **"Automatically delete head
  branches."** GitHub deletes `feature/epic/<N>` when the epic→trunk PR merges.
  One toggle, no custom automation.
- **Local child branch + worktree:** the merge-back script deletes both after a
  successful ff-merge. Children have no remote branch (never pushed), so nothing
  remote to clean.

## Fail-closed guard (PreToolUse)

A `PreToolUse` hook refuses an agent's `Edit`/`Write` when its worktree branch is
not actually based on its epic. Given worktree branch `B`, its epic `E` (resolved
live), and the epic's parent `P`:

```
epicHead  = rev-parse E
epicFork  = merge-base E P        # where the epic left its parent
childBase = merge-base B E        # where this branch left the epic's line

PASS if:  epicHead == epicFork                          # epic hasn't diverged yet — nothing to protect
      OR ( epicFork is-ancestor childBase  AND  childBase != epicFork )
REFUSE otherwise                                        # childBase == epicFork ⇒ cut from the parent line, not the epic
```

Properties:

- **Staleness passes, wrong-base fails.** A child cut from an *old* epic head has
  `childBase` = that old head, still a proper descendant of `epicFork` → passes;
  the merge-back rebase absorbs the catch-up. Naive "`== current epic head`"
  would false-positive-block a correct child the instant a sibling merges — hence
  the ancestor test, not equality.
- **Nested-correct.** `P` is the *epic's* parent, not always trunk, so a child of
  a nested epic wrongly cut from the grandparent is caught. The invariant recurses
  with the graph.
- **Empty-epic no-op.** Before the epic has any commit past its fork, cutting from
  epic head and from the parent are the same commit — no defect exists, allow.
- **Catches the debacle.** For the three failed #859 agents,
  `childBase = merge-base(agent, 859) = 3ea7ecc` and
  `epicFork = merge-base(859, trunk) = 3ea7ecc`, so `childBase == epicFork` →
  **REFUSE** at first edit.

## Components

| Unit | Responsibility |
| --- | --- |
| `lib/branch-name.mjs` | Compose/parse `feature/<role>/<N>`; classify by role. |
| `lib/resolve-epic-lineage.mjs` | `issue#`/branch → `{role, branch, epicBranch, parentBranch}` via gh graph + naming. Single source used by every script and the guard. |
| `cut-epic-branch.mjs` | Create `feature/epic/<N>` from the resolved parent. |
| `cut-child-worktree.mjs` | Create a correctly-based child worktree via `git worktree add -b … <epicHead>`. |
| `merge-back.mjs` | Recursive rebase → test → `--ff-only`; conflict/failure refusal; child branch+worktree cleanup. |
| `sync-epic.mjs` | Rebase epic onto trunk; `--force-with-lease` push. |
| PreToolUse guard | Extend the existing agent guard (`agent-guard.mjs` / `hook-handler.mjs`) with the invariant above. |
| Integration seams | `dispatch-prep.mjs`, `move-state.mjs` — call owned creation instead of native worktree isolation. |

Each unit has one clear purpose and a well-defined interface; lineage resolution
is centralized so the naming convention and graph are read in exactly one place.

## Testing strategy

- **`resolve-epic-lineage`** — root epic, nested epic, child, story; re-parented
  child; missing parent.
- **`branch-name`** — compose/parse round-trip; role classification globs.
- **Guard invariant** — a table of topologies: correct child, stale-but-correct
  child (sibling merged), wrong-base child (the debacle case), nested wrong-base
  (cut from grandparent), empty epic. Assert PASS/REFUSE for each.
- **`merge-back`** — clean ff path; rebase-conflict refusal; post-rebase
  test-failure refusal; grandparent-unchanged no-op.
- **Integration** — simulate a small epic tree end-to-end (cut epic → cut two
  children → advance trunk → merge child A triggers epic re-sync → sibling B
  guard-trips → B rebases and merges).

## Applicability to the current #859 recovery

This design's merge-back protocol **is** the salvage procedure for the three
mis-based #859 branches (`76c4e6d`/`52cd830`/`c247798`). Once #808 lands on trunk
and `feature/epic/859` is refreshed, each failed branch is rebased onto the
refreshed epic (rebase → test → ff-only) — no restart, story record intact.
Going forward, children are cut via `cut-child-worktree.mjs`, so the debacle
cannot recur.

## Open questions (for the implementation plan)

- Child→epic **role promotion**: exact rename + re-push mechanics when a child
  grows sub-issues mid-flight.
- `sync-epic` with **many simultaneous in-flight children**: batch-rebase
  ordering and whether to rebase them eagerly or leave each to its own merge.
- Whether to add a **scheduled** re-sync tick in addition to the explicit +
  opportunistic triggers, or leave cadence purely event-driven.
