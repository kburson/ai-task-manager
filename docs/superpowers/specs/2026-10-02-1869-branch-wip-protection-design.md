# Branch and WIP protection lifecycle

Date: 2026-10-02
Status: Initial draft for future refinement; no implementation plan
Issue: [#1869](https://github.com/kburson/ai-task-manager/issues/1869)

## Intent and scope

Protect PBI work from loss when an issue is abandoned, a session ends, or a
worktree disappears. Each picked-up PBI owns a discoverable branch on origin
and a draft PR. Before every state move, preserve its WIP in commits on origin.
Reuse existing work rather than creating competing branches or overwriting it.

This design covers branch naming and discovery, session pickup, Backlog spec
requirements, transition protection, Test-stage PR review, Review-stage delivery,
and post-merge cleanup. Existing unrelated lifecycle gates remain in force.
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
2. Commit all issue WIP, including relevant untracked files, to its branch
   with issue attribution. WIP commits do not assert successful verification.
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
