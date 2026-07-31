# Work-Lease Lifecycle Decomposition Design

**Decision date:** 2026-07-31

## Purpose

Complete the remaining exclusive work-lease lifecycle and integration work as
small, independently governed backlog items without reopening or obscuring the
foundation already delivered by issue #1049.

This document is a backlog decomposition decision. It authorizes issue
restructuring only. It does not authorize implementation, integration, issue
state movement, or cleanup.

## Immutable Provenance

- **Parent program:** #1048, `Stabilize workspace authority after issue 925`
- **Foundation issue:** #1049, `Add exclusive fenced issue and worktree leases`
- **Original reference commit:**
  `b4f278d92b2c27fd7ed381e56bb2a047f7936cc9`
- **Original governing spec:**
  `docs/superpowers/specs/2026-07-29-workspace-authority-stabilization-design.md`
- **Original work-lease plan:**
  `docs/superpowers/plans/2026-07-29-exclusive-work-lease.md`
- **Foundation completion commit:**
  `86d3723aba76ee2c6bf7da709e7eec74c4b37a0e`

The original reference commit remains the immutable source of the approved
program intent. The foundation completion commit is the immutable source of the
hardened Task 6 subdivision and the delivered Task 6B1 boundary.

## Delivered Foundation Boundary

Commit `86d3723aba76ee2c6bf7da709e7eec74c4b37a0e` is accepted as successful
completion of issue #1049 through:

- Tasks 1-4;
- Tasks 5A, 5B, and 5C;
- Task 6A; and
- Task 6B1.

The delivered foundation includes the minimal ledger package, shared lease
schemas and conformance behavior, SQLite and HTTPS authority, fail-closed
provider selection, canonical worktree identity, sticky
`{ lease, holder, binding }` persistence, governed-effect verification, v2
migration and project observation contracts, switch recovery, and exact
committed-mutation replay proof before transition projections.

Issue #1049 will be re-scoped to this delivered boundary. Its live title,
Scope, Acceptance Criteria, and Verification Commands will describe only the
foundation. A dated `## Historical Scope Change` section will preserve its
prior title, Scope, Plan Metadata, and acceptance/verification mapping. The
live body will explicitly exclude Tasks 6B2, 6B3, 6C, 6D, and 7 and link each
excluded area to its successor backlog issues.

## Remaining-Program Hierarchy

A nested coordination-only epic named `Complete work-lease lifecycle and
integration` will be created as a direct child of #1048. It owns coordination,
dependency tracking, review policy, and cross-child integration evidence. It
has no implementation estimate.

Thirteen direct children of the nested epic will own the remaining work. Each
is created in Backlog with no board Size or Estimate. Its approved delivery
delivery cap is recorded immutably in Scope and Plan Metadata and is always below
four hours. Board Size and Estimate may be set only through the sanctioned
Refine workflow after the child is selected for work.

| Order | Child scope                                       | Original-plan mapping                                             | Delivery cap |
| ----: | ------------------------------------------------- | ----------------------------------------------------------------- | -----------: |
|     1 | Lifecycle journal core                            | Task 6B2: lifecycle coordinator and two-phase journal             |           3h |
|     2 | Global heartbeat quiescence                       | Task 6B2: global drain and safe owner restoration                 |         2.5h |
|     3 | Resume holder rotation and response-loss recovery | Task 6B2: `nextHolder`, park/resume replay, concurrency           |         3.5h |
|     4 | Pause and stop lifecycle ordering                 | Task 6B3: pause-last and terminal stop ordering                   |           3h |
|     5 | Close release matrix                              | Task 6B3: exact terminal/non-terminal release matrix              |         3.5h |
|     6 | Chore, new-task, and hook recovery                | Task 6B3: chore mode, `/task new`, hook and upgrade recovery      |           3h |
|     7 | Authoritative fleet reconstruction                | Task 6C: rebuild from authoritative lease/binding observation     |           3h |
|     8 | Fleet GC and unavailable reporting                | Task 6C: CAS-safe projection GC and unavailable/empty distinction |         2.5h |
|     9 | Review worker-to-integration handoff              | Task 6D: final child-side handoff and old-fence refusal           |           3h |
|    10 | Merge-back dual authority                         | Task 6D: epic controller plus child integration authority         |         3.5h |
|    11 | Work-lease operator documentation                 | Task 7: operator and architecture documentation                   |           2h |
|    12 | Bounded full verification and package evidence    | Task 7: bounded lanes, package evidence, exact coverage           |           3h |
|    13 | Work-lease final integration gate                 | Cross-issue review, exact delta, integration readiness            |         3.5h |

## Dependency Policy

The numbered order is the default and authoritative dependency sequence. No
child begins until its predecessor is integrated into the nested epic branch.
This avoids shared-file, migration, journal, task-state, test-fixture, and
authority-contract collisions.

A later issue-body amendment may prove that two adjacent children are
independent, but it must name disjoint files and state, retain the predecessor
links, and be approved before either child begins. In the absence of that exact
evidence, execution remains sequential.

## Hybrid Review Policy

Every child receives one independent exact-SHA review after its implementation
commit. A second independent exact-SHA review is mandatory for authority
transition or security-sensitive children 1-6, 9, and 10.

A second review is also mandatory for any child whose first review reports a
Critical or Important finding. Critical and Important findings must be fixed
within that child's approved scope and reviewed again before integration.
Minor, adjacent, or out-of-scope findings become separately governed bounded
issues rather than expanding the active child.

Child 13 performs the cross-issue integration review. It verifies the complete
remaining-program delta, dependency order, exact commit reachability, package
and test evidence, and the absence of unauthorized authority shortcuts before
the nested epic is eligible for parent-program integration.

## Parent and Foundation Body Changes

### Issue #1049

- Change the active title to describe the delivered foundation through Task
  6B1.
- Replace active Scope, Acceptance Criteria, and Verification Commands with the
  delivered foundation mapping.
- Preserve the prior title, Scope, Plan Metadata, Acceptance Criteria, and
  Verification Commands in a dated historical section.
- Map Tasks 6B2-6D and 7 to the nested epic and its children.
- Preserve every existing hidden AITM marker and the complete progress trail.
- Do not change the issue's board state or close it during backlog adjustment.

### Issue #1048

- Retain the original program Scope and Plan Metadata.
- Amend the active remaining-work mapping so #1049 is the delivered work-lease
  foundation and the new nested epic owns the remaining lease program.
- Preserve review-epoch child #1050 and local-environment child #1051 without
  changing their state or scope.
- Preserve every existing hidden AITM marker and the complete progress trail.

## Issue-Authoring Invariants

- Use `npx aitm create-issue`; never call `gh issue create`.
- Use `mutateIssueBody({ issueNumber, repo, mutate })` for every live-body
  change; never replace a body from a stale snapshot.
- Dry-run every rendered issue body before creation or mutation.
- Create the nested epic with parent #1048 and every child with the nested epic
  as its direct parent.
- Create all new issues in Backlog. Do not bind, refine, promote, estimate, or
  start them.
- Do not pass `--size`, `--estimate`, `--rank`, or a non-Backlog status during
  creation.
- Preserve immutable provenance in every issue's `## Plan Metadata` section.
- Verify the live title, body, parent edge, Project board tether, and Backlog
  state for every created issue.
- Stop after backlog verification. Do not restart #1049.

## Success Conditions

The backlog-adjustment phase is complete only when:

1. this design and its issue-authoring plan are committed together;
2. the exact commit SHA is cited by the nested epic and all 13 children;
3. #1049 preserves history while actively describing only the delivered
   foundation;
4. #1048 shows #1049 as foundation and the nested epic as the remaining lease
   program;
5. all 14 new issues have the required direct-parent edges, board tethers, and
   Backlog state;
6. all child delivery caps and dependencies are present without raw board
   estimates; and
7. read-back verification finds no marker loss, title drift, parent mismatch,
   board omission, or provenance mismatch.
