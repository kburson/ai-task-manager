# Worktree-Local Backlog and Historical Archive Design

## Status and prerequisite evidence

This specification describes the proposed backlog epic. It is separate from
the standalone GraphQL usage measurement spike. The spike may be implemented
and measured first; its call-site inventory, coverage report, and baseline
will set the epic's implementation order and quantitative targets. No GitHub
issue number has been assigned to this specification.

## Problem and intended outcome

AITM's GitHub Project has grown to roughly 1,485 items. Four or five parallel
worktrees can repeatedly read and mutate GitHub during story creation,
hydration, refinement, and planning, exhausting a user-wide GraphQL budget.
After a story reaches Develop and Test, operations focus on one story and the
pressure is lower. A board that retains every closed card also becomes harder
for humans to navigate and may make broad project scans more expensive.

The epic reduces avoidable API work in the early lifecycle while keeping
GitHub's board useful for review. Each worktree's agent remains autonomous for
its own story or epic. Historical records become searchable from a Git-tracked
archive after issues leave the live board.

## Boundaries and authority

- Each worktree owns its draft cache, change journal, and publish operation.
  There is no cross-worktree draft merger, coordinator, or shared rate budget in
  the first delivery.
- GitHub remains the authority for published issue identity, Project state,
  approvals, and the existing lifecycle gates. A local draft has no GitHub
  issue number and cannot claim a GitHub lifecycle transition or approval.
- The standalone usage spike is observational. This epic consumes its results
  but does not require the spike to be a child or engage the epic before
  measurements start.
- The local Git-tracked archive is historical research material, not an
  alternate authority for an active issue.
- An untracked SQLite index may later be rebuilt from the archive. SQLite is
  not part of this epic's first delivery.

## Local creation, hydration, and planning

One worktree can build a new story or epic locally, including shape, title,
body, acceptance criteria, metadata, planned relationships, and validation
results. Drafts have stable local IDs. Publishing is an explicit action by that
worktree's agent through the sanctioned AITM issue creation path; that action
assigns the GitHub issue number, tethers the Project card, and records the
local-to-remote identity mapping. If publication partially succeeds, retry
must reconcile the existing issue before creating another. Direct `gh issue
create` remains forbidden.

For an existing published issue, the worktree hydrates a versioned snapshot
once for a planning session and accumulates local edits to the issue body and
fields. It coalesces repeated changes into the smallest valid remote writes at
an explicit publish or lifecycle boundary. Repeated local edits do not each
trigger a GitHub fetch/push/verify cycle. A publish reads fresh remote state,
checks the existing body-version and field-authority rules, rebases
nonconflicting local changes, and refuses unresolved overlap rather than
overwriting someone else's update. The journal records planned writes and
successful remote acknowledgments so retry is idempotent.

The cache is scoped to that worktree and its bound story or epic. It is never
silently reused for another issue. Existing Git-tracked discovery drafts may
be reused where their format fits; temporary mutation journals may live in
worktree-local runtime storage. A new unpublished draft must be saved to a
tracked file and committed on its worktree branch before an agent treats it as
durable across worktree deletion. The agent must publish or explicitly preserve
any pending draft and verify a clean journal before removing a worktree.

## GitHub synchronization boundaries

Publishing is mandatory before the first real GitHub lifecycle transition.
At each transition, AITM sends the complete canonical state required for the
next board view and verifies the remote result before reporting the transition
complete. A story may remain in Refine or Ready for Planning for weeks; entry
to either state is a durable flush, not a promise of a later timer-based sync.
The same rule applies before Plan approval, Develop, Test, Review, Done, and
worktree cleanup. Explicit publish is available when a human needs current
board state between transitions. A pending local edit is visible as pending in
AITM so the agent cannot mistake the board for current state.

The epic should use the spike to rank concrete call reductions. Known
candidates include repeated body fetch/push/verify cycles, repeated field
reads, and the project tether fallback that can page through roughly 15 pages
of a 1,485-item board. The fallback must be measured before its priority is
set. AITM should use issue-side association or the documented idempotent
Project item add result instead of a full-board scan where behavior permits.
An optimization is accepted only if its lifecycle and conflict checks remain
intact and the measured calls or primary points fall.

## Closed-issue archive and live-board retention

After a close transaction fully converges, AITM captures a versioned snapshot
of the closed issue into a compressed, machine-readable, Git-tracked record.
The capture includes issue identity, title, body, lifecycle and Project field
values, labels, relationships, comments needed for historical research,
timestamps, and source identifiers. Pagination must be complete, and the
archive record must carry a content digest and a completeness manifest. A
failed or partial capture never qualifies for board removal.

Closed issues can change after close. Before the retention action, AITM
refreshes the snapshot and verifies it against current GitHub state. The
default retention rule is configurable, initially 30 days after `closedAt`;
an optional cap on closed Project cards can select the oldest eligible cards
for earlier removal. Neither rule may act on an open issue or a close
transaction that has not fully converged. The first version removes eligible
Project cards after the verified archive is committed and available on the
repository's shared branch. Repository issues, their URLs, and native GitHub
history remain intact. This specification selects Project-card removal as its
retention action; deleting repository issues would need a separate design.

The archive reader maintains a tracked coverage manifest mapping issue number
and capture time to record path and completeness status. Historical research
queries can search the live board or repository issue history, then continue
through the archive when the requested range extends beyond live Project
coverage. It cannot infer that archive coverage is complete merely because an
online search returned no more results. Archives are immutable snapshots with
new versions or a verified replacement on refresh; incomplete records are
reported, not silently treated as complete history.

## Failure and recovery rules

- An unpublished draft retains its local ID until one verified GitHub issue
  number is mapped to it. A retry may not create a duplicate because a prior
  response was lost.
- If remote issue content changes while local edits are pending, publish uses
  the existing guarded merge behavior and stops on overlapping changes.
- If a transition cannot flush or verify its payload, the transition does not
  claim completion. The pending work remains available for retry.
- If a worktree disappears, remote states already acknowledged remain
  authoritative. Committed drafts survive branch recovery; uncommitted local
  edits are not considered durable.
- Archive capture, commit, and Project-card removal are separate recoverable
  steps. The removal step requires a complete refreshed archive and verified
  shared-branch availability. Retry never deletes a repository issue.

## Delivery slices and measurement gates

1. Use the standalone spike's coverage and baseline to identify the worst
   creation-to-planning operations. Record the baseline interval and active
   worktree count.
2. Remove the highest-cost redundant reads or board scans that can be fixed
   without introducing local mutation state.
3. Add worktree-local drafts and publish reconciliation for new issues.
4. Add guarded local coalescing for published-issue hydration, refinement, and
   planning, with transition flushes and recovery.
5. Capture verified compressed closed-issue records and provide offline search
   with coverage reporting.
6. Add retention enforcement for closed Project cards only after the archive
   commit and verification path is proven.

The order within slices 2-4 may change based on spike evidence. The epic plan
must state before/after primary GraphQL points and call counts for equivalent
creation-to-planning workflows. No arbitrary percentage target is asserted
before the baseline exists. The result must show that four or five overlapping
worktrees stay within the authenticated user's 5,000-point hourly budget for
the observed workload, or identify the remaining peak and its cause.

## Acceptance criteria

1. A worktree can draft and revise one story or epic without a GitHub number
   until explicit publish; it can publish exactly once and recover from a
   partial creation response without duplication.
2. Published-issue local edits coalesce into verified remote writes while
   respecting concurrent remote changes and current lifecycle gates.
3. Every lifecycle transition flushes the full relevant state; Refine and
   Ready for Planning remain accurate on the board during long dormancy.
4. A worktree can be cleaned up only after pending work is published or saved
   durably and the agent can inspect that status.
5. A fully closed issue has a complete compressed Git-tracked record with a
   coverage entry; historical search finds it without querying GitHub.
6. Retention applies the configured closed-age TTL or card-count cap only to
   eligible, fully archived records and removes only their Project cards in
   the default design.
7. Reports using the standalone spike's instrumentation show point and call
   deltas by operation and stage, including any unmeasured traffic.

## Deferred work

The rebuildable local SQLite index, cross-worktree coordination, and any
repository-issue deletion policy require separate decisions and designs after
the initial measurement and archive behavior are proven.
