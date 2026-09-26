# Worktree-Local Backlog and Historical Archive Design

## Status and prerequisite evidence

This specification describes the proposed backlog epic. It is separate from
the standalone GraphQL usage measurement spike. The spike may be implemented
and measured first; its call-site inventory, coverage report, and baseline
will set the epic's implementation order and quantitative targets. The
[Backlog epic is #1817](https://github.com/kburson/ai-task-manager/issues/1817).

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
local-to-remote identity mapping. The first remote create payload carries a
unique local draft ID as a durable issue marker. A lost response leaves the
draft in an uncertain state: retry searches for that marker through a bounded,
complete repository issue enumeration and verifies the candidate's identity
and Project tether. If absence or uniqueness cannot be proven, it stops for
reconciliation rather than creating a second issue. Direct raw CLI issue
creation remains forbidden.

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
durable across worktree deletion. Before cleanup, pending edits to an already
published issue must be flushed and verified; a temporary journal does not
qualify as durable preservation. The agent must publish or commit any new
unpublished draft and verify a clean mutation journal before removing a
worktree.

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

After a close transaction fully converges, AITM starts a recoverable capture
job and records its issue number, unique job ID, archive branch ref, and
recovery owner in the shared Git directory so worktree cleanup cannot erase
it. Each capture job uses its own archive branch and PR; parallel worktrees
never write the same archive ref. The closing worktree owns the job until it
has committed a versioned snapshot and opened the PR. If that worktree cannot
finish, a subsequent agent claims and resumes the job from its journal.
Close may report success while archive publication is pending, but must expose
that status. Retention waits for the archive commit to reach the repository's
shared branch. The snapshot is a compressed,
machine-readable, Git-tracked record. The capture includes issue identity,
title, body, lifecycle and Project field values, labels, relationships,
comments needed for historical research, timestamps, and source identifiers.
Pagination must be complete, and the archive record must carry a content
digest, completeness manifest, and source version markers for independently
paginated content. A failed or partial capture never qualifies for Project
archiving.

Closed issues can change after close. Before retention, AITM refreshes the
snapshot and verifies it against current GitHub state. Verification rechecks
issue, comment, relationship, and Project-field version markers and counts
after pagination; a mismatch fails closed and triggers a new capture. The
retention action uses [GitHub's native Project-item archive operation](https://docs.github.com/en/graphql/reference/projects#archiveprojectv2item). It
removes the card from active views while preserving its custom field values
and allowing later restoration. AITM reads the archived item and issue again
after the operation. If the issue reopened during retention, AITM restores the
card, verifies the current state, and leaves retention incomplete. Other
source changes mark local coverage pending and queue a refreshed capture.
The record is an as-of snapshot; later changes produce a new version.

The default rule is configurable, initially 30 days after `closedAt`; an
optional cap on active closed Project cards can select the oldest eligible
cards for earlier archiving. A scheduled retention job, or an explicit
operator run, selects TTL candidates from the archive manifest. The optional
count cap requires an exact active closed-card count: establish it with a
measured full Project scan at startup and after suspected external edits,
then maintain it from acknowledged add, archive, close, and reopen events.
When count confidence is lost, cap-based archiving pauses until
reconciliation; TTL candidates remain available. The full scan is infrequent
and reported as a separate measured cost, never run for every close. Neither
rule may act on an open issue or a close that has not fully converged, and the local archive
commit must be available on the repository's shared branch first.

Repository issues, their URLs, native GitHub history, and archived Project
items remain intact. A reopened issue with an archived card must be
restored from the native archive and hydrated from current GitHub state before any lifecycle
operation; its former closed snapshot remains historical. This first delivery
reduces active-view growth but does not bound total Project items or repository
issues. [GitHub counts active and archived items toward a 50,000-item Project limit](https://docs.github.com/en/issues/planning-and-tracking-with-projects/managing-items-in-your-project/archiving-items-from-your-project).
The spike and later retention reports must measure growth and API cost; permanent Project-item or repository-issue deletion requires a
separate design and explicit authorization.

The archive reader maintains tracked per-issue coverage manifest shards mapping
issue number and capture time to record path and completeness status. Separate
archive PRs can merge independently; a conflict on one issue requires a fresh
source check and verified manifest update before merge. No merge may drop an
existing coverage entry. Historical research queries can search the live board or repository issue history, then continue
through the archive when the requested range extends beyond live Project
coverage. It cannot infer that archive coverage is complete merely because an
online search returned no more results. Archives are immutable snapshots with
new versions or a verified replacement on refresh; incomplete records are
reported, not silently treated as complete history.

## Failure and recovery rules

- An unpublished draft retains its local ID until one verified GitHub issue
  number is mapped to it. If a prior create response was lost, retry proves
  identity through the remote marker or stops; uncertainty never authorizes a
  duplicate create.
- If remote issue content changes while local edits are pending, publish uses
  the existing guarded merge behavior and stops on overlapping changes.
- If a transition cannot flush or verify its payload, the transition does not
  claim completion. The pending work remains available for retry.
- If a worktree disappears, remote states already acknowledged remain
  authoritative. Committed drafts survive branch recovery; uncommitted local
  edits are not considered durable.
- Archive capture, commit, PR integration, and native Project-item archiving
  are separate recoverable steps. The Project action requires a complete
  refreshed local archive and verified shared-branch availability. A failed
  integration stays visible as archive pending. Retry never deletes an issue
  or Project item.

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
6. Add retention enforcement for closed Project cards only after the local
   archive commit and verification path is proven.

The order within slices 2-4 may change based on spike evidence. The epic plan
must state before/after primary GraphQL points and call counts for equivalent
creation-to-planning workflows. No arbitrary percentage target is asserted
before the baseline exists. The result must show that four or five overlapping
worktrees stay within the authenticated user's 5,000-point hourly budget for
the observed workload, or identify the remaining peak and its cause.

## Acceptance criteria

1. A worktree can draft and revise one story or epic without a GitHub number
   until explicit publish; a lost creation response resolves by remote marker
   or stops safely without creating a duplicate.
2. Published-issue local edits coalesce into verified remote writes while
   respecting concurrent remote changes and current lifecycle gates.
3. Every lifecycle transition flushes the full relevant state; Refine and
   Ready for Planning remain accurate on the board during long dormancy.
4. A worktree can be cleaned up only after published-issue edits are flushed,
   unpublished drafts are committed or published, and the agent can inspect
   the mutation and archive-job status.
5. Close exposes archive pending until a complete compressed Git-tracked
   record and coverage entry reach the shared branch. A failed capture or PR
   stays retryable and blocks retention; after publication, historical search
   finds the record without querying GitHub.
6. Retention applies the configured closed-age TTL or active closed-card cap
   only to eligible records whose local archive reached the shared branch.
   It archives Project items natively, verifies preserved fields, and restores
   reopened cards before lifecycle work.
7. Reports using the standalone spike's instrumentation show point and call
   deltas by operation and stage, including any unmeasured traffic.

## Deferred work

The rebuildable local SQLite index, cross-worktree coordination, permanent
Project-item deletion beyond GitHub's 50,000-item limit, and any
repository-issue deletion policy require separate decisions and designs after
the initial measurement and archive behavior are proven.
