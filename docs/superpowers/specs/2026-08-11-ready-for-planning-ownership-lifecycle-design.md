# Ready for Planning and Exclusive Story Ownership Design

**Status:** Approved

**Approved:** 2026-08-11 by the project owner in the originating design session

**Date:** 2026-08-11

**Tracking epic:** #1209

**Supersedes:** The proposed Assigned-state coupling in issue #1207

**Target lifecycle:** Backlog -> Refine -> Ready for Planning -> Plan -> Develop -> Test -> Review -> Done

## Purpose

Separate three concepts that were incorrectly collapsed into one state:

1. Kanban lifecycle status: where a story is in the delivery process.
2. Story ownership: the single GitHub identity authorized to execute it.
3. Board visibility: saved views and filters used by team members to select relevant work.

Assignment is an orthogonal property, not a lifecycle state. A saved GitHub Projects view using `has:assignee` provides the assigned-work queue without requiring an Assigned column. The eighth lifecycle state is retained and repurposed as Ready for Planning, a durable parking state between active refinement and short-lived JIT planning.

## Lifecycle Model

The canonical state chain is:

```text
Backlog -> Refine -> Ready for Planning -> Plan -> Develop -> Test -> Review -> Done
```

Display name: `Ready for Planning`

Short form: `R4P`

Internal slug: `ready-for-plan`

### Backlog

Backlog is uncommitted inventory. A story may remain there indefinitely and may never be executed. Backlog stories may be assigned or unassigned. Assignment affects ownership views but does not move Status.

### Refine

Refine is active team WIP. An owner is not required. Team members may shape scope, acceptance criteria, dependencies, Priority, Size, Estimate, and Rank/Sequence. Stories must not use Refine as a long-term parking state.

### Ready for Planning

R4P means refinement is complete and current. It is the durable parking state for work that is sufficiently shaped but has not been admitted to JIT planning. An owner is not required.

Entry requires complete refinement evidence and the currently required refinement fields. R4P does not mean execution is scheduled; it means the story is eligible to walk the planning and delivery chain.

### Plan

Plan is short-lived JIT planning. It creates the implementation deep dive, current dependency analysis, forecast, execution plan, and approval evidence needed immediately before development.

Plan must not become a waiting column. Canceling or interrupting planning returns the story to R4P, clears incomplete Plan artifacts, and preserves still-current refinement.

### Develop through Done

Plan -> Develop is the commitment boundary and last responsible moment for ownership. Exactly one story owner is required before entry to Develop. Develop, Test, and Review retain that exclusive ownership requirement. Done preserves the final ownership record.

## Ownership Model

### Exclusive ownership

A story has zero or one canonical owner. Although GitHub permits multiple assignees, two or more assignees are invalid for governed AITM execution because development collateral exists in one worktree on one workstation at a time.

Ownership transfer replaces the prior owner with the new owner and verifies that the final assignee set contains exactly one GitHub identity. It does not change lifecycle Status. Every transfer is audited. Repeated transfers generate a delivery-risk warning but are not blocked by an arbitrary numerical threshold.

### Session identity

The authenticated GitHub identity associated with the repository clone is the chat session's execution identity.

The authorization matrix is:

| Condition                                | Governed behavior                                                            |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| Backlog through Plan, unassigned         | Any authorized team session may refine or plan                               |
| Any state, owned by current identity     | Current session may perform governed work                                    |
| Any state, owned by another identity     | Current session is blocked                                                   |
| Any state, multiple assignees            | Invalid ownership; current session is blocked                                |
| Plan -> Develop, unassigned, Full-Auto   | Assign current identity, notify chat, verify, proceed                        |
| Plan -> Develop, unassigned, interactive | Offer to assign current identity before proceeding                           |
| Develop or later, unassigned             | Remain in current Status but block governed work and request human direction |

AITM never silently steals a foreign-owned story. The existing owner must complete it or a human must transfer ownership. Other team members retain read access and can view progress, but their AITM sessions cannot mutate the story or create attributed commits.

### Full-Auto claim

Full-Auto claims an unassigned story only at Plan -> Develop. It assigns the chat-session identity, posts a visible notification, verifies that exactly one assignee remains and that it matches the current identity, then proceeds.

Full-Auto does not claim unassigned work during Backlog, Refine, R4P, or Plan. It never adds itself alongside a foreign owner.

### Loss of ownership in flight

If the final owner is manually removed from Develop, Test, or Review, the story remains in its current Status but becomes dead in the water. The next bind, governed mutation, lifecycle transition, or attributed commit fails closed and reports that an owner is required.

This is a human-coordination boundary, even in Full-Auto. The agent must not reclaim the story automatically. It pauses and tells the human that work cannot continue until either the story is assigned to the current repository clone's GitHub identity or ownership is transferred to another person and work resumes from that owner's workstation. It never overrides a foreign owner.

AITM cannot prevent out-of-band Git or GitHub UI changes. It detects them as drift at governed boundaries and refuses to treat them as valid AITM work.

## Transition Rules

### Forward path

- Backlog -> Refine: no owner required.
- Refine -> R4P: complete and current refinement required.
- R4P -> Plan: admits the story to JIT planning.
- Plan -> Develop: approved current plan and exactly one owner required.
- Develop -> Test -> Review -> Done: existing verification, review, approval, and close gates remain.

### Planning cancellation

Plan -> R4P is the normal rollback for canceled or interrupted planning. It invalidates Plan approval, forecast, deep-dive completion, and incomplete planning evidence while preserving refinement fields and R4P eligibility.

### Rework

Test or Review rework returns to Develop and invalidates stale implementation verification as the existing workflow requires. It does not alter ownership.

### Shelve

Shelve is an explicit nonterminal operation from Refine or R4P to Backlog. It means the story is no longer considered currently refined and may never be executed.

Shelving may optionally remove the owner. It always invalidates active refinement and planning evidence. Develop, Test, and Review cannot be shelved; they may be reworked or closed with an accepted terminal disposition.

### Closed - Not Planned

Closed - Not Planned is terminal and distinct from Shelve. It may be selected from any non-Done state when the team abandons the work permanently. It preserves the complete final record and does not return the story to Backlog.

## Refinement Invalidation and Historical Evidence

Before shelving, AITM records an immutable refinement snapshot containing:

- Priority, Size, Estimate, and Rank/Sequence.
- Dependency and sequencing assumptions.
- Forecast provenance.
- Refinement timestamp.
- Trunk/base SHA used during refinement.
- Scope and acceptance-criteria fingerprint.
- Shelving reason.
- Previous owner, if any.

Shelving then clears these active surfaces:

- Priority.
- Size and Estimate.
- Rank/Sequence.
- Refine-complete and R4P-entry markers.
- Adaptive forecast and Plan approval.
- Deep-dive completion status.
- AC, VC, Test, and DoD evidence derived from the invalidated design.
- Incomplete JIT planning artifacts.

Story title, narrative, Scope, Acceptance Criteria, kind, labels, discussion history, and immutable snapshots remain. Labels survive because they classify the item; Priority is cleared because it is a refinement result that must be reevaluated.

When the story re-enters Refine, prior snapshots are historical comparables only. Nothing is restored automatically. Refinement reevaluates the story against current trunk and writes a new snapshot that supersedes without deleting history.

## Epic Orchestration

Every executable child is refined independently and parked in R4P. A terminal child closed Not Planned does not block the epic.

The epic may enter Plan only when every nonterminal child is in R4P or later. Epic planning establishes the dependency graph, execution order, and explicitly safe parallel waves. Plan -> Develop verifies or assigns the epic's single orchestrator owner.

While the epic remains in Develop:

1. The next dependency-ready child moves from R4P to Plan.
2. JIT planning refreshes the child against current trunk.
3. Plan -> Develop assigns or verifies that child's exclusive owner.
4. Sequential children are driven to Done before their successor is admitted.
5. Independent children may enter an explicit parallel wave, each with its own owner and isolated worktree.

The epic cannot enter Test until every required child is Done or terminally closed with an accepted disposition. Shelving an epic does not silently cascade to children; every child transition remains explicit and auditable.

## Board Views

Assignment-based visibility is implemented through saved views and filters rather than Status:

- Assigned work: `is:issue has:assignee`.
- Work owned by a specific person: repository/project-supported assignee filter for that GitHub login.
- Unowned inventory: Backlog with no assignee.
- Refinement WIP: Status Refine.
- Planning-ready queue: Status Ready for Planning.

These views may overlap intentionally. A Backlog item can appear in an assigned-work view without pretending it has completed refinement.

## Migration

The migration is fail-closed and read-back verified:

1. Freeze governed lifecycle mutations.
2. Inventory every current Assigned item, its repository identity, issue identity, assignees, and project item ID.
3. Move each current Assigned item to Backlog while preserving its GitHub assignee.
4. Verify the migration count and every item read-back before renaming the option.
5. Rename the existing Assigned option to Ready for Planning, retaining its option ID where GitHub permits.
6. Reorder Ready for Planning after Refine.
7. Replace canonical configuration `kanbanOptionAssigned` with `kanbanOptionReadyForPlan`.
8. Preserve historical Assigned markers byte-for-byte. Compatibility readers may recognize them; all new writes use R4P markers.
9. Update state topology, guards, timing, documentation, saved views, migration tooling, package surfaces, and tests.
10. Run dry-run and apply modes with repository-qualified issue identity, exhaustive pagination, cursor-progress checks, and zero writes after any incomplete scan.

## Timing Attribution

Architectural replanning began while discussing the replacement for #1207 after that issue was paused at `2026-08-11 16:26:02 -05:00`. Epic #1209 records that timestamp as its Start Time and identifies the #1207 pause row as the attribution source.

AITM currently has no sanctioned operation that moves historical timing rows or agent word deltas from one issue to another. The carry-in interval therefore remains explicit provenance rather than a fabricated ledger rewrite. All work after #1209 was bound is recorded normally on #1209. A future timing-reattribution capability may materialize the carry-in only if it preserves both source and destination audit history.

## Disposition of Issue #1207

Issue #1207 and its unmerged branch implement a premise this design rejects. They must not be merged into trunk.

Epic #1209 now tracks the replacement architecture from current trunk. After this written design is approved:

1. Preserve the existing #1207 branch/worktree as historical evidence.
2. Close #1207 with disposition Closed - Not Planned and an architectural-pivot explanation.
3. Decompose #1209 into independently reviewable children for state migration, ownership policy, shelving/invalidation, epic orchestration, and final live migration verification.
4. Refine those children into R4P before admitting the epic to JIT Plan.

## Acceptance Model

The architecture is complete only when tests prove:

- Assignment does not change Status before Develop.
- Backlog through Plan may be unassigned.
- Foreign or multiple ownership blocks the current session.
- Full-Auto claims only at Plan -> Develop and never steals ownership.
- Develop through Review cannot proceed without exactly one matching owner, and Full-Auto cannot reclaim an in-flight story whose owner was removed.
- Refine cannot become a parking state; completed refinement enters R4P.
- Plan cancellation returns to R4P without destroying refinement.
- Shelving clears active refinement fields, including Priority, but preserves labels and immutable history.
- Existing Assigned cards migrate to Backlog without losing assignees.
- Historical Assigned evidence remains readable without being rewritten.
- Epics stage children in R4P and admit dependency-ready sequential or explicit parallel work through JIT Plan.
- Closed - Not Planned remains terminal and distinct from Shelve.
