# #1918 delivery handoff

Status: approved wave-rank cleanup completed. All sixteen child ranks and current refinement snapshots agree with the configured Project; every child and #1918 are Ready for Planning. Scope, estimates, criteria, verifier declarations and native blocker edges are unchanged. This is an execution handoff, not child Plan approval or completed implementation evidence.

## Start here

The user confirmed the current hierarchy on October 8, 2026: #1847 → #1855 → #1918 → #1919. The ancestor epics stay active while their descendant repairs execute. Current orchestration plan: docs/superpowers/plans/2026-10-08-1918-delivery-execution.md.

The next session should orchestrate #1918 and pick up **#1919 first**, then #1909. Follow current AITM guidance, bind with the correct role, query fresh Explain, and use the normal parent and child Plan/approval/state progression before code. Parent1918 has not been admitted to Develop; do not skip its gates just to start a child. Do not reopen completed #1851–#1854.

Current authoritative schedule: [published wave schedule](https://github.com/kburson/ai-task-manager/issues/1918#issuecomment-6069978884)

## Pickup waves

| Rank in #1918 | Pick up             | Mode          |
| ------------: | ------------------- | ------------- |
|             1 | #1919               | Single story  |
|             2 | #1909               | Single story  |
|             3 | #1910, #1911        | Parallel wave |
|             4 | #1912               | Single story  |
|             5 | #1916, #1920        | Parallel wave |
|             6 | #1913, #1915, #1924 | Parallel wave |
|             7 | #1921               | Single story  |
|             8 | #1914               | Single story  |
|             9 | #1922               | Single story  |
|            10 | #1923               | Single story  |
|            11 | #1925               | Single story  |
|            12 | #1917               | Single story  |

Ranks are relative to immediate epic #1918. The current native hierarchy is #1847 → #1855 → #1918 → these children; #1918 is no longer a sibling of #1855. Its own scheduling rank is independent of these child ranks. Finish the current wave through the governed verification/review/integration/close workflow before pulling the next rank. Same-rank stories are permitted parallel candidates, with no implied dependency on one another.

Native blocker edges remain precise: #1916 and #1920 both require #1912; #1913, #1915 and #1924 require #1920; #1921 directly requires #1913; #1923 requires #1915 and #1922; #1917 requires #1916, #1924 and #1925. Rank-wave barriers are scheduling policy, not new native blocker edges.

## Before a parallel dispatch

Use separate issue-bound worktrees and approved child Plans. For waves5/6, name exclusive file/function owners, shared interface contracts, and integration order before source edits: the review surfaces overlap store.mjs, stage-execution.mjs and move-state-core.mjs. Coordinate core changes instead of silently adding sequential rank barriers. If a contract cannot be safely partitioned, present the concrete Plan conflict to the human. Prepare the current rank-wave admission record and validate genuine bindings through supported commands; equal ranks do not manufacture dispatch authority. Honor the configured human gates.

## Portable branch baseline

Start from **origin/feature/epic/1918/parent** in any workspace or worktree you choose. Handoff path: **docs/superpowers/plans/2026-10-08-1918-delivery-handoff.md**. Hydration/WBS path: **docs/superpowers/plans/2026-10-08-1918-criteria-revision-repair-hydration.md**. All paths in these instructions are relative to the repository root.

The branch preserves the original committed #1855 implementation checkpoint14f6c5589724e9d2a33c2353c19f0c793bfe6033, together with the applicable preserved implementation work recorded in subsequent checkpoint commits. This is a repair baseline with inherited verification failures, not a passing or completed implementation. Review the checkpoint commits and current source before selecting each repair slice. Reuse and qualify existing code on each child HEAD rather than rebuilding it or copying old passing receipts. Do not merge the old PR1907 wholesale over new repairs.

Use the repository-owned setup instructions after checkout. For a local linked worktree, run bash scripts/dev-env/setup-local-worktree.sh. Bind #1918 with role orchestrator in the chosen checkout using node bin/aitm.mjs start 1918 --role orchestrator --confirm-relocation, then obtain fresh AITM guidance. The relocation confirmation records the chosen checkout through the normal binding workflow. Child branches use feature/epic/1918/child/<child-id> (or the configured defect pattern when lineage/kind requires it). No previous machine-specific worktree or ignored evidence directory is required for pickup.

## Scope and verification

Use Node.js scripts and Markdown only; no compiled binaries/addons. Governing spec: docs/superpowers/specs/2026-09-30-1847-governed-criteria-revisions-design.md. Original accepted scope: docs/superpowers/plans/2026-09-30-1847-governed-criteria-revisions.md, Task5. Hydration/WBS: docs/superpowers/plans/2026-10-08-1918-criteria-revision-repair-hydration.md. Each child still needs its own current accepted implementation Plan. Original13/15 grants remain bounded; #1922's event-body predicate needs its own exact authorization.

Native delivery declarations remain binding. Current bodies retain full-suite commands as well as focused verifiers; a changed checkbox label does not waive those commands. Validate the first child's verification contract against inherited failures during Plan. Resolve genuine gating conflicts through registered actions and, where required, exact human-authorized criteria changes; never stamp a failed/inherited check as passing or skip rank completion gates. Final #1917 owns composed consumer-union/exact-head integration CI, not unfinished implementation from earlier children. Preserve original algorithms, current-source/lock checks and existing test budgets; no deleted tests, fixture shrinkage, timeout increase, authority cache or phantom proof.

Any story re-estimated at or above24h must be flagged and decomposed again in any lifecycle state. Required boundary cases23/no flag,24/flag,25/flag. Separate guard defect1908 is filed but not implemented by this planning session.

## Retained history and estimates

Original #1855 retains its historical work/timeline and original unchecked whole-contract obligations, with56h estimate (52 historical human-equivalent scope +4 future reconciliation); it is blocked by #1918. Draft PR1907 remains the historical published checkpoint with failing CI until aggregate repairs pass. #1856 waits for the complete capability. Remaining repairs1918 total144h; outer1847 rollup250.5h. These are estimates, not measured productive time; do not double-count existing work.

## Authority and recovery

This tracked handoff and the tracked hydration document contain the portable pickup instructions. Obtain current issue bodies, ranks, blockers, refinement snapshots and approval evidence from GitHub/AITM at session startup. GitHub is authoritative for live issue state, fields, ownership and approval. Historical local audit/restart records are not prerequisites for pickup and do not replace live authority.

The twelve-wave table above supersedes historical rank9–24 and rank1–15 schedules. Do not delete existing implementation or replay inherited passing receipts as proof on a new child HEAD.
