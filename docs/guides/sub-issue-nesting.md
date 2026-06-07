# Sub-issue Nesting

GitHub Projects supports multi-level sub-issue chains. The task-tracker's gates
already handle nested epics correctly because every level enforces the same
immediate-parent invariants — the recursion is implicit through the verb chain.
This guide is the decision tree for **when to use a nested epic vs a flat one**,
plus the runtime invariants that make the recursion safe.

## Decision tree

> Should this new work be a flat sub-issue under the root epic, a sibling epic,
> or a nested sub-epic?

1. **Is the work a single coherent story (S/M/L) that fits inside the parent
   epic's existing scope?** → Plain sub-issue under the root. Default path. No
   nesting.

2. **Is the work a brand-new XL deliverable unrelated to anything in flight?**
   → New top-level epic (`--shape epic`, no `--parent`). The "XL standalone"
   rule. No nesting.

3. **Is the work a coherent _family_ of stories that emerged mid-epic and
   deserves its own planning surface?** → Nested sub-epic. Two patterns
   qualify:

   - **Defect-chain pattern.** Mid-implementation of root epic `#R`, three or
     more related defects surface. Filing them all as flat siblings of `#R`
     scatters the planning context. Filing them under a sub-epic `#S` keeps
     the family addressable, lets you sequence them as a unit, and gives the
     defects their own roll-up surface. Example: `#259 → #340 → {#333, #335,
     #336, #337, #338, #339}`.
   - **Scope-of-scope pattern.** The root epic has multiple distinct sub-
     deliverables, each worth its own planning ceremony. Each becomes a
     sub-epic. Example: `#259 → #328 → {#324, #325, #326, #327, #331}` —
     #328 (deep-dive lifecycle hardening) was one of several sub-themes of
     #259 (guard registry).

4. **Is the parent already Done?** → No more children. The
   `childCreationAllowedAtEpicState` guard refuses `--shape sub-issue` under a
   `done` epic. Reopen-then-extend is a separate, deliberate operation.

## Runtime invariants under nested epics

Every gate the task-tracker enforces walks **exactly one parent/child edge**,
and that is sufficient for transitive correctness. The recursion happens
through normal verb flow because each level applies the same rule.

| Gate | Walk | Why one level is enough |
| --- | --- | --- |
| `planEpicDevelopChildrenGate` (plan→develop) | immediate children | Sub-epic only reaches `refine` if its own grandchildren admit it; root sees sub-epic as a normal child. |
| `child-cannot-lead-epic` (every forward promotion) | immediate parent | Sub-epic was admitted past `develop` only because root was at least `develop`. The chain cascades. |
| `planRefineWipGate` (refine→plan) | immediate parent + siblings | WIP is per-sub-epic; throttling a grandchild against an unrelated root sibling would be wrong. |
| `childCreationAllowedAtEpicState` (`--shape sub-issue`) | immediate parent | A sub-epic may grow children at any pre-`done` state; root state is irrelevant at the point of creation. |
| Close-block (`/task close`) | immediate children | Sub-epic cannot be in `review`/`done` while a grandchild is open (its own review/close gate refuses). |
| Review-block (`/task review` for epics) | immediate children | Same shape as close-block at one level lower. |

If you find yourself wanting a guard to walk to the root, stop and re-read this
table. The per-level recursion is the design.

## How to construct a nested sub-epic

1. Draft scope/AC/plan-meta files in `./.tmp/gh/` per the standard
   `create-issue.mjs --shape epic` workflow.
2. Create with `--parent <root-epic-#>`. The wrapper tethers to the project
   board and writes the `addSubIssue` link in one transaction.
3. Re-parent existing siblings (if any) into the new sub-epic with
   `removeSubIssue` + `addSubIssue` GraphQL mutations.
4. Sequence the sub-epic _after_ its in-flight siblings on the root board.
   The root won't admit the sub-epic out of `refine` until the WIP rule
   allows.

The session that created `#340` under `#259` exercised this end-to-end; see
`./.tmp/inspect/attach-sub-epic-340.mjs` for the canonical re-parent script
shape (detach-then-attach is required because `addSubIssue` rejects a child
that already has a parent).

## When to flatten back

If a sub-epic's children all close together and the planning surface stops
adding value (no roll-up comments referenced, no Dependency Map evolving),
prefer flattening on the next iteration. Nested epics are an intentional
refinement, not a default — fewer levels means less guard surface to audit.
