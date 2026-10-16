# Branch and WIP protection lifecycle

Date: 2026-10-02
Status: Initial draft for future refinement; no implementation plan
Issue: [#1869](https://github.com/kburson/ai-task-manager/issues/1869)

## Intent and scope

Protect PBI work from loss when an issue is abandoned, a session ends, or a
worktree disappears. Each picked-up PBI owns a discoverable branch on origin
and a draft PR. Before every state move, preserve its WIP in commits on origin.
Reuse existing work rather than creating competing branches or overwriting it.

This design covers branch naming and discovery, session pickup, branch-level WIP
manifests, project resurrection and resume ordering, chat ownership handoff,
Backlog spec requirements, transition protection, Test-stage PR review,
Review-stage delivery, and post-merge cleanup. Existing unrelated lifecycle gates
remain in force.
Issue #1869 captures the draft in Backlog. No implementation plan, implementation,
repository-wide branch migration, or existing-worktree cleanup is authorized.

## Backlog intake sequence

For a newly drafted story, perform these steps in order:

1. Create and tether the GitHub issue through AITM in Backlog.
2. Discover existing WIP and check out the properly named branch here using
   the issue ID; create it only when no existing branch should be reused.
3. Create the draft spec with the issue ID in its filename and reference it
   in the PBI.
4. Commit the draft spec to the issue branch with issue attribution.
5. Push the branch and commit to origin.
6. Create and link the draft PR, or reuse its existing draft PR.

The PBI is then structured in Backlog and ready for later Refine entry when
we are ready to work on it. Implementation planning and spec acceptance are
not prerequisites for completing intake. The real draft-spec commit provides
initial PR divergence; no empty housekeeping commit is needed for this path.

## Branch naming and target

| PBI kind          | Canonical branch                             | PR target                 |
| ----------------- | -------------------------------------------- | ------------------------- |
| Standalone story  | `feature/<story-id>`                         | Repository default branch |
| Root epic         | `feature/epic/<epic-id>/parent`              | Repository default branch |
| Epic child story  | `feature/epic/<epic-id>/children/<child-id>` | Epic parent branch        |
| Epic defect       | `feature/epic/<epic-id>/defect/<defect-id>`  | Epic parent branch        |
| Standalone defect | `defect/<defect-id>`                         | Repository default branch |

Resolve kind, issue number, and parent from authoritative PBI relationships.
Discover the repository default branch; for this repository it is trunk.
Children and epic defects merge into their epic's parent branch; the epic later
merges that combined work into its target.

Proposed compatibility detail for future refinement: nested epics use their own
`feature/epic/<epic-id>/parent` branch targeting their immediate parent epic's
parent branch. Changing the parent must reconcile existing WIP, branch names, PR targets,
and ownership before proceeding.

## Session pickup and branch recovery

Perform housekeeping before substantive PBI work, including pickup in Backlog.
Complete it no later than Backlog exit if it has not happened earlier.

1. Discover the recorded issue binding, branch and worktree, local Git refs,
   registered worktrees, live origin branch, and existing PR for the issue.
2. Inspect other accessible worktrees for the matching branch, dirty files,
   staged changes, untracked work, and commits absent from origin. Local refs
   alone do not prove working-tree WIP is protected. Account for associated
   detached worktrees and legacy branch names.
3. Reuse an existing canonical branch and PR. A fresh assigned workspace is
   not a reason to create competing work.
4. If another worktree owns the branch or carries unprotected WIP, warn the
   user with its location and protection status. Negotiate adoption or an
   explicit safe transfer before changing ownership. Do not force checkout,
   reset, prune, remove, or discard the competing worktree.
5. If none exists, create the canonical branch from its resolved target in
   the assigned workspace, push it to origin and establish tracking.
6. Create or reuse its draft PR and record branch, effective worktree, target,
   and PR in governed issue linkage. Renew binding after branch selection.

Fetch and check out origin-only branches. Protect and reuse local-only branches
once ownership is resolved. Divergence, inaccessible inspection, uncertain
ownership, and ambiguous external outcomes block unsafe recovery and movement.

For a web-created story or a defect without a versioned spec yet, housekeeping
may use a distinct empty, issue-attributed bootstrap commit to open its draft PR.
The commit is explicitly housekeeping and proves no implementation or acceptance.
If branch push or PR creation fails, retain completed steps and block movement.
Retries discover completed work before repeating writes.

## Story WIP manifest and project resurrection

Added: 2026-10-11. Consolidated draft extension; implementation and final interface choices remain
for Refine.

### Authority and recovery guarantees

GitHub remains the source of truth for story lifecycle, dependencies, priority,
assignment, issue linkage, and origin branches. Each story branch carries its
own committed WIP manifest. A branch carries committed content; a worktree can
carry additional staged, unstaged, and untracked changes. The manifest records
where work was last owned and how to continue, not a guarantee that the recorded
chat, worktree, or uncommitted changes still exist.

An existing repository may retain local story commits ahead of origin. A fresh
clone receives only pushed history; it does not inherit historical worktrees,
local-only commits, archives, or chat context. Remote branch recovery must not
claim those local resources were recovered.

Encourage early and frequent commits at every development stage, with updated
resume instructions. Include the manifest in the existing committed-and-pushed
protection boundary before every forward or backward state transition. Verify
remote visibility before permitting the transition. This normally bounds remote
recovery loss to work since the last protected transition, within the current
kanban stage; it does not preserve every intermediate edit or guarantee survival
after an interrupted checkpoint.

There is no universal manifest continuously committed to trunk and no continuous
inventory of dirty files. Project views are generated from GitHub, committed
story manifests, and local observations gathered during a survey. Session
cleanup or elapsed time must not make an unfinished GitHub story disappear from
that survey.

### Branch-level manifest

Maintain a discoverable, issue-specific manifest on the story branch. A proposed
location is `.ai-task-manager/wip/<issue-id>.md`; an issue-specific path avoids
collisions when child branches merge into an epic parent. Resolve the final path
and structured format during Refine.

The committed manifest includes:

- Repository and story identity, branch, parent/target, and PR linkage.
- Last recorded provider, agent ID, chat/session ID, workspace or host identity,
  and worktree path. Identify unavailable identifiers explicitly.
- Last work summary, relevant artifacts, unfinished steps, next intended action,
  known blockers, and necessary verification or review work.
- Last recorded lifecycle/disposition and handoff reason, with observation time.
  Live GitHub lifecycle and dependency facts supersede historical summaries.
- Prior ownership and handoff information when ownership changes.

Read the latest manifest directly from a local branch ref or a verified origin
ref without first checking out that branch. Identify the containing commit and
whether it is local-only or remotely verified. Do not place a commit's own SHA
inside its content or infer push time from its author/committer date. Use real
checkpoint evidence for any reported remote protection time; if it is
unavailable, show the commit date and remote observation time with their actual
meanings.

Update resume instructions with meaningful commits, before state transitions,
and for planned chat handoffs. An uncommitted manifest edit is not durable branch
content. Do not require updates for every intermediate dirty-file change or
treat an old cleanliness observation as proof of current cleanliness.

### Project survey and resume priority chart

On a request to survey or resume project work after an indefinite pause,
enumerate started, unfinished stories from GitHub and inspect their discoverable
branch manifests. Include paused, blocked, and deliberately parked work,
including work started during drafting or planning. Distinguish a temporary
session pause from the existing Shelve/Park lifecycle operation.

Produce a visual chart with one row per story and, where evidence permits, a
timeline of starts and subsequent engagements. Include:

| Column                    | Meaning                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| Story and stage           | GitHub identity, live lifecycle, and work disposition                                      |
| Start order               | First evidenced start and time; unknown when unavailable                                   |
| Dependencies and priority | Live blockers, affected dependents, assigned priority, and applicable rank/wave            |
| Last owner                | Recorded provider, agent/chat, and current availability observation                        |
| Workspace and protection  | Worktree availability, observed uncommitted WIP, local-only commits, and origin checkpoint |
| Resume readiness          | Ready, blocked, restoration needed, ownership decision needed, or unknown, with reason     |
| Resume order              | Recommended order or parallel group, with an explanation                                   |

Historical start order is separate from recommended completion order. Determine
eligibility from dependencies and existing lifecycle, rank, wave, and ownership
rules. Explain why a prerequisite must precede dependent work and why one
eligible story is recommended ahead of another. Readiness and priority remain
separate: missing workspaces or blocked high-priority stories remain visible.

Do not silently invent a new cross-project priority policy. During Refine, agree
on ordering across independent epics and standalone stories, tie-breaking, and
whether higher-priority dependents confer urgency on prerequisites. Until that
policy exists, expose conflicting or incomparable priorities for a user decision.

More than one eligible story alone does not require parallel execution. When an
applicable work grouping or execution policy calls for parallel resumption,
alert the user with the stories, reasons, existing chats to resume or replacement
chats to start, and prerequisites. The user starts the appropriate chat sessions;
the survey does not automatically create them or dispatch replacement agents.

Chart observations are dated and labeled by source. In a fresh clone, local WIP
and historical workspace availability are unknown unless separately inspected.
Unavailable GitHub evidence, incomplete enumeration, dependency cycles, and
inaccessible workspaces produce an explicitly partial report rather than an
invented complete order.

### Recovery paths

Before substantive work on every re-engagement, even inside an existing chat,
validate the workspace and branch instead of relying on conversation memory or
a remembered path. Recovery must be possible without executing commands in a
deleted working directory.

| Situation                                    | Recovery behavior                                                                                                                        |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Existing repository and surviving worktree   | Inspect branch/HEAD, ownership, staged/unstaged/untracked changes, and local-only commits; prefer resuming in place                      |
| Existing repository and unavailable worktree | Attempt supported archive/snapshot restoration; otherwise create a replacement from the current surviving local story branch HEAD        |
| Fresh clone from origin                      | Discover the story branch and committed manifest; create a worktree from its verified origin HEAD                                        |
| Existing chat with a deleted workspace       | Keep the same chat owner; restore its workspace if possible, otherwise reconstruct it from committed story history and renew the binding |
| New chat or rollover                         | Resolve the prior ownership claim before adopting or reconstructing the workspace                                                        |

If local history is unavailable, use the verified origin branch HEAD. Compare
surviving local and remote history before choosing a recovery point; divergence
or uncertain branch identity requires reconciliation. Never roll back to an old
manifest checkpoint when newer committed story history survives.

A supported archive may preserve uncommitted content as snapshot commits; report
what was actually restored. Otherwise, a missing worktree may mean uncommitted
WIP was lost. Do not equate reconstructing a branch checkout with restoring the
original workspace.

If uncommitted work survives but a replacement workspace is needed, support a
controlled transfer that preserves staged, unstaged, and relevant untracked
content, checks the destination base and conflicts, and verifies the result
before retiring the source. Preserve the original until transfer is proven.
Existing exclusions for unrelated work, credentials, ignored runtime content,
and submodules remain in force.

Renew the exact issue/branch/workspace binding after recovery. Record the new
location in the next committed manifest. A missing branch or unrecoverable
history is a reported blocker, not permission to invent a fresh story baseline.

### Chat ownership and rollover

The manifest records historical ownership; the incoming agent must announce
that ownership and check the prior session and worktree independently. GitHub
assignee/workstation ownership remains distinct from agent/chat occupancy.

If the prior owner still exists and is available, ask whether to transfer to the
new owner before takeover. An idle or unloaded chat is not proof that the owner
ceased to exist. If the prior owner is positively confirmed unavailable, warn
that the story was owned by a prior agent/session and that takeover is occurring.
If owner availability cannot be established, report uncertainty and ask before
taking ownership.

A missing prior worktree adds a separate warning that uncommitted WIP may have
been lost; an unavailable owner does not imply a missing worktree, and a missing
worktree does not imply lost committed history.

For planned rollover to reduce context baggage, the outgoing agent prepares
resume instructions and commits the handoff before yielding where possible.
A receiving agent validates the manifest, ownership, and workspace rather than
assuming the handoff succeeded. A transfer to another machine must disclose
local-only progress and verify the receiving machine can access the chosen
recovery commit.

Perform approved takeover through governed ownership/binding reconciliation.
Revalidate the prior claim, prevent simultaneous ownership, and record the new
provider/agent/session, prior owner, worktree, time, and handoff reason. A previous
session must reconcile its superseded claim before continuing. Retain completed
handoff steps on interruption so retries do not create competing ownership or
duplicate worktrees. Commit the updated manifest; the normal state-transition
boundary provides mandatory remote protection.

### Resurrection report before continuation

After surveying the project and inspecting the selected story, present a full
resurrection report before substantive continuation:

- Story, lifecycle, resume priority and rationale, blockers/dependents, and any
  required parallel chats.
- Manifest source ref and containing commit, observation freshness, last owner,
  owner availability, and handoff decision.
- Recorded and inspected workspace locations, expected and observed branch/HEAD,
  archive recovery result, and restoration versus reconstruction.
- Staged, unstaged, and untracked work; local-only commits; remote comparison;
  inspection failures and unknowns.
- Chosen recovery commit, verified remote checkpoint evidence and time when
  available, and any potential loss of uncommitted work or local-only commits.
- Resume instructions, next action, required decisions, and environment or
  verification prerequisites.

Show the report without adding a routine approval gate when continuation is
already authorized. Required ownership-transfer or conflict decisions remain
blocking. The same report applies to an existing chat whose worktree disappeared,
not only a new chat or fresh clone.

### Integration and later verification

Reuse issue worktree history, occupancy/binding guards, dependency readers,
rank-wave admission, and supported worktree archive/restore capabilities.
Local fleet records are observational runtime state, not the durable WIP
inventory or proof of current ownership. Provider adapters must distinguish
available, unavailable, and unknown chat status without promising unsupported
liveness detection.

Later implementation verification must cover direct ref reads without checkout;
fresh clones; surviving local-only commits; dirty worktrees; missing workspaces
inside an existing chat; archive restoration versus reconstruction; safe dirty
content transfer; divergent or absent branches; available, unavailable, and
unknown prior owners; confirmed rollover; interrupted/concurrent handoffs;
manifest inclusion and rejected pushes at all state-transition paths; dated
partial survey results; dependency ordering; and parallel-chat alerts.

This addition changes the draft scope only. It does not authorize implementation,
state promotion, automatic chat creation, existing-worktree cleanup, or acceptance
of unresolved priority and manifest interface choices.

## Backlog and specification requirements

A story must reference a spec in its PBI before leaving Backlog. The spec may
be an initial draft or an accepted design. Review is not required at Backlog
exit. Refining and accepting the design while still in Backlog is optional.
Entering Refine preserves prior acceptance if the accepted content is unchanged.

For web-created stories without a spec, pickup establishes branch and PR
housekeeping first, then leads the user through brainstorming to create and
reference a draft spec. Commit and push versioned specs before state movement.

Defects use their defect description instead of a draft spec for Backlog exit.
During Refine, convert the description into a draft spec and refine it into an
accepted design. Existing design-acceptance and Plan-approval boundaries remain
distinct. Peer review is optional; manual or ad-hoc acceptance must work without
that add-on. Bind acceptance to the spec revision so changes cannot silently
reuse stale acceptance.

## WIP protection before state movement

One common protection boundary applies to every forward and backward state
move, including dedicated stage verbs and automatic transitions.

1. Revalidate issue, workspace, canonical branch, target, and PR identity.
2. Update the story WIP manifest and commit all issue WIP, including relevant
   untracked files, to its branch with issue attribution. WIP commits do not
   assert successful verification.
3. Push and independently verify that the live origin branch includes local
   HEAD. Explicitly inspect dirty work, local-only commits and divergence.
4. Verify phase-appropriate PR status: draft during unfinished work, ready
   after accepted Test-stage code review, or verified delivery after merge.
5. Revalidate the observed commit and workspace immediately before movement.
   Concurrent changes invalidate the protection check.

Do not sweep unrelated work, credentials, ignored runtime state, submodule
contents, or sensitive artifacts into an issue commit. Preserve and resolve
ownership or protection when such work prevents safe movement or deletion.
Push failure, uncertain remote visibility, mismatched PR identity and unresolved
work block the move with an actionable explanation. Protection does not authorize
force-pushes. Post-merge transitions do not recreate a deleted origin branch or
require an open PR when verified delivery evidence already exists.

## Test and Review

The final agreed flow keeps merging in Review, not Test.

| Boundary                        | Required behavior                                           |
| ------------------------------- | ----------------------------------------------------------- |
| Test, checks pending or failing | Keep PR draft; do not claim readiness                       |
| Test, PR checks green           | Agent reviews the PR at its current head commit             |
| Code review fails               | Record findings; protect WIP; demote to Develop             |
| Develop after failed review     | Fix findings, push, repeat Test and code review             |
| Code review passes              | Record revision-bound pass; mark PR ready for review        |
| Test to Review                  | Require green checks and passing review for current PR head |
| Review with full-auto           | Perform sanctioned governed merge into resolved target      |
| Review without full-auto        | User approves PR and manually clicks GitHub merge           |
| Merge complete                  | Independently verify delivery; perform housekeeping         |
| Review to Done                  | Require verified merge and completed pre-close housekeeping |

"Open for Review" means marking the existing open draft PR ready for review.
New commits invalidate the previous code-review pass and readiness evidence.
Changed work returns through Develop/Test rework and draft status before another
Review entry. Readiness and merge independently recheck head, checks, target,
review evidence, and existing required approval provenance.

Full-auto uses the sanctioned merge integration and exact-head protection. A
missing integration blocks delivery; it does not permit a shell fallback.
Manual merges are observed and verified after the user's GitHub action. Provider
success output alone is not proof of merge.

## Merge, closure, and cleanup

After verified merge into the intended target, delete the issue branch from
origin. Never delete a changed remote ref using an old merge receipt. Protect
files or commits produced after the reviewed head. Parent branches remain until
their own epic delivery, rather than being deleted when a child merges.
Children can close after verified parent-branch delivery without waiting for the
epic's later default-branch merge.

Complete remaining pre-close housekeeping through AITM and close through its
governed transaction. Only after successful closure remove the issue worktree.
Refuse removal while unprotected work, another active owner, or still-needed
nested worktrees remain. Preserve shared ordinary workspaces; use the supported
lifecycle operation for app-managed worktrees.

Cleanup is resumable. Distinguish merge verification, remote deletion, closure,
and local removal. A failure preserves delivery evidence and reports its pending
step. Do not merge again, reopen a PR, or recreate an origin branch to retry cleanup.
Preserve durable AITM provenance.

## Existing AITM integration points

- `scripts/task-tracker/lib/branch-name.mjs` currently recognizes flat
  `feature/story/<N>`, `feature/epic/<N>` and `feature/child/<N>` names and
  rejects hierarchical names. Composition, parsing, role detection and their
  consumers must move together.
- `scripts/task-tracker/draft-branch.mjs` currently creates `codex/<issue>-draft`.
  Reconcile that drafting path with canonical branches instead of duplicating
  branches for one PBI.
- Bind, resume and branch/worktree creation need shared discovery and ownership
  reconciliation. Preserve existing legacy WIP.
- Explain and transition execution share the protection boundary; execution
  independently revalidates live facts and returns typed blocking reasons.
- Delivery stays in Review. Test and Review retain exact-head evidence; targets
  and cleanup adopt the new canonical parent branch contract.
- Close supports verified delivery after remote branch deletion and removes a
  worktree only after durable issue closure. Force-cleanup guidance must not
  discard unprotected WIP.
- Align provider adapters, generated guidance, hooks, installed consumers and
  CLI behavior. Guidance alone is insufficient enforcement.

Discover existing noncanonical branches through issue linkage and existing
parsers. Do not silently rename, abandon, delete or replace them. Reconcile WIP
and PRs with the user before canonicalization. Migration details belong in later
refinement and planning, before any live branch migration.

## Verification requirements for later implementation

Use temporary Git repositories and controlled provider responses to test naming,
parent resolution, origin-only and local-only reuse, competing dirty worktrees,
legacy WIP, rejected pushes, divergence, empty bootstrap commits, setup retries,
and concurrent changes. Verify affected installed-consumer entry points.

Verify every transition path protects WIP; stories require a referenced spec;
defects use their description at Backlog exit; valid prior spec acceptance is
preserved; and absence of peer-review does not block manual acceptance.

Verify failed review demotes to Develop, stale review/check evidence blocks
Review entry, successful review readies the PR, and both merge modes verify the
correct target and head. Verify child closure before epic delivery, safe remote
deletion, and closure before safe resumable worktree cleanup.

## Draft status

This draft incorporates the final conversational agreement and corrected intake
sequence. It supersedes the intermediate merge-in-Test proposal. Phase-specific
PR requirements avoid contradicting ready-for-review and merged states.

The 2026-10-11 addition consolidates branch-level resume manifests, project
surveys and priority charts, resurrection reports, missing-workspace recovery
inside an existing chat, and ownership transfer during chat rollover. GitHub
remains the source of truth; no continuous trunk manifest or intermediate dirty
file tracking is proposed. Priority policy and manifest interfaces remain explicit
Refine decisions, and this update does not constitute spec acceptance.

Nested-epic behavior, unrelated workspace protection, and resumable cleanup are
proposed details for future refinement. Issue #1869 remains in Backlog on
`feature/1869`. Worktree dependencies were restored using the repository setup
script; environment verification and issue-creation preflight passed. The new
rule is not yet implemented. No implementation plan has been written.

## Relationship to issue 1768

Related issue: [#1768 — Design last-responsible-moment planning artifact reviews](https://github.com/kburson/ai-task-manager/issues/1768).
Comparison source: its issue body and version-4 spec at
`c01a0620eceb22b1652b320da22886dac28fb9b1`, path
`docs/superpowers/specs/2026-09-22-1768-review-lifecycle-design.md`.
At comparison time, #1768 is open and has no existing sub-issues.

Recommended separation of concerns:

| Concern                                                                       | Owner                                       |
| ----------------------------------------------------------------------------- | ------------------------------------------- |
| Planning-document permissions, versions, provenance and acceptance records    | #1768                                       |
| Brainstorm timing, planning reviews and epic hydration audit                  | #1768                                       |
| Canonical branch discovery, worktree ownership and remote WIP preservation    | #1869                                       |
| Branch/PR housekeeping coordinated with issue-linked draft intake             | #1869 integrating with #1768                |
| Draft-spec requirement at Backlog exit and defect intake distinction          | #1869 policy using #1768 artifact contracts |
| Test PR code review, Review merge modes, remote deletion and worktree cleanup | #1869                                       |

Reuse #1768's artifact identity and acceptance contract rather than building a
second review/provenance system. The PR code review in Test is distinct from
planning-artifact acceptance and does not reuse it as code-review evidence.
Issue #1768 explicitly preserves later PR/Test/Review behavior; #1869 proposes the
changes to those boundaries.

Reconcile these policy differences during Refine before either scope is frozen:

- #1768's spec-first brainstorming promotion must accommodate the agreed
  issue-first, branch-first intake here. Pre-issue discussion remains possible;
  it must not prevent early governed issue creation and branch protection.
- #1768 permits earlier artifact drafts and applies Backlog spec gates to
  enrolled issues. #1869 requires a referenced spec before story Backlog exit,
  with the explicit defect-description exception. Agree on legacy enrollment
  without abandoning existing work.
- #1768 prescribes iterative SAR in Refine. #1869 supports manual/ad-hoc
  acceptance and preserves current acceptance achieved in Backlog. Agree on a
  common accepted-result contract without implying unavailable peer-review
  passed or repeating review solely because the issue entered Refine.
- Share one recoverable intake transaction: issue creation, branch selection,
  artifact commit, remote push, PR creation and issue reference must not be
  independently duplicated by competing commands.

Keep #1768 and #1869 separately tracked for now; do not convert them or change their parents
without a refined scope decision. If their shared intake boundary requires a
coordinated delivery, an umbrella epic can retain both existing issues and split
small children by artifact contracts, branch/worktree recovery, transition WIP
protection, PR readiness/delivery, and cleanup. This is a candidate scope split,
not an implementation plan or authorization to create those children now.
