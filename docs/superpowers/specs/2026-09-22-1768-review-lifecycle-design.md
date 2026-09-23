---
issue: 1768
version: 4
status: draft-for-review
---

# Planning and Specification Review at the Last Responsible Moment

## Status and scope

This specification defines review and provenance from pre-issue brainstorming
through a child's just-in-time Deep-Dive. It does not redesign code review,
pull-request delivery, the Test-to-Review transition, or final issue approval.
Those later boundaries retain their current AITM contracts.

The design is for the AITM repository and its installed consumers. It treats
Superpowers as the authoring workflow, AITM as issue and timing authority, and
`ai-peer-review` as an optional hosted review capability. An AITM-owned
iterative Solo Agent Review (SAR) is always available.

## Problem

The current `/task discover` bucket gives pre-issue ideation a local start
timestamp but not measured engaged time. Promotion currently reconciles its
whole elapsed window as idle; cancellation discards it. `/task brainstorm` is
already an alias, but `discover` is the canonical command and the bucket is not
owned by a durable session-specific record. `/task new` can create a stub from
a saved discovery plan but does not accept and bind a Superpowers design spec as
the reviewed artifact.

Today, a specification can be reviewed long before its issue is selected for
Refine, while the plan-to-child hydration may receive no independent semantic
check. At the same time, freezing children to an old master plan would frustrate
the discoveries that JIT planning exists to make.

## Decisions

1. Capture ideas cheaply. An initial Superpowers spec self-review is sufficient
   for a Backlog stub. Hosted multi-round review waits until Refine.
2. Create the issue before hosted review so its number identifies the spec and
   every review artifact. A Backlog link to a draft spec is not a ratification.
3. Run iterative SAR on a spec in Refine and on its implementation plan in Plan.
   If `ai-peer-review` is available, a deterministic risk assessment after SAR
   selects additional SPR or SPR then XPR. Absence of that optional capability
   sets the available review ceiling to SAR and is recorded honestly.
4. Review a master plan before using it to create epic children. After hydration,
   run one aggregate SAR of the child mapping before the epic can leave Plan.
5. Run focused SAR on each child Deep-Dive when that child is pulled from Ready
   for Planning into Plan. One clean round is an accepted SAR; findings create
   further rounds until accepted or blocked.
6. The parent epic holds the master-plan reference and hydration receipt.
   Children retain their native parent link and standalone issue content. The
   existing WBS source-plan fields remain populated where current guards require
   them; this adds no new per-child provenance fields.
7. A reviewed plan is a recorded starting point, not an instruction to ignore
   later evidence. Changes after hydration do not automatically demote children,
   revoke Ready for Planning, or block the epic.

## Artifact versions and provenance

New specs and plans have YAML frontmatter with a positive integer `version`,
starting at `1`. Every committed change to an artifact's bytes increments its
version by exactly one. The initial issue-number rename and frontmatter stamp
form the spec's version-1 commit; intermediate scratch saves have no published
version. A review round identifies the exact committed artifact path, version,
and Git commit. A terminal acceptance identifies the final reviewed version and
commit. Review comments cannot silently authorize a later edit.

The Git commit and blob identify authoritative bytes; `version` is a readable
ordinal, never a substitute for the commit. AITM checks monotonicity against the
previous committed artifact at review entry and before Refine or Plan approval.
Its governed artifact writer checks before committing. A duplicate, skipped, or
regressed version refuses review or promotion. Repair uses a new correctly
versioned commit plus an anomaly record; it does not relabel an old acceptance
or silently rewrite published history.

The spec frontmatter records its issue number and the promoted brainstorming
session's start, stop, and engaged seconds. The local timing record also carries
its owning session ID and idle duration. The issue timing log receives a single
fresh-stamped discovery attribution carrying the original interval and measured
engaged/idle durations; it never fabricates active time or backdates a row.

The plan frontmatter records its issue number, own version, and the source
spec's repository path, version, and exact Git commit. Before initial Plan
approval, a changed source spec makes the derived plan stale: revise and bump
the plan version, then review it against that spec revision. Initial Plan
approval, epic hydration, and epic Plan exit must use the same accepted plan
version and commit. A working-tree edit is not approved authority. If the plan
changes before those gates finish, commit a new version and repeat the selected
review before continuing. Before epic Plan exit, a changed master plan also
requires reconciliation of child source fields and the aggregate mapping.
After epic Plan exit, version references remain historical provenance, not
automatic invalidation of already hydrated children. Normal issue changes and
subsequent planning decisions can address discoveries without a forced state
rewind.

The existing issue-id filename convention applies when the issue exists:
`docs/superpowers/specs/YYYY-MM-DD-<issue>-<slug>-design.md` and
`docs/superpowers/plans/YYYY-MM-DD-<issue>-<slug>.md`. Historical artifacts
without this frontmatter remain readable; this design does not bulk rewrite
them.

## Brainstorming and issue creation

`/task brainstorm` becomes the canonical entry point; `/task discover` remains
a compatibility alias. It opens one local, timestamped idea record owned by the
current session ID and starts engaged-time measurement. The AITM skill then
invokes Superpowers brainstorming. The clock stops when the first complete
design spec is saved, before `/task new` promotion. Idle gaps and explicit
pauses are excluded from engaged time. AITM uses its existing activity-event
clock with an explicit pause/resume command and the same idle threshold used by
task timing; it stores each counted interval and the clock-policy version in
the idea record. If activity signals are unavailable, the interval is marked
unknown rather than inferred from wall time. The resulting spec receives its
normal Superpowers self-review. The idea record stores the reviewed draft's
digest; promotion refuses a changed draft until its self-review is repeated.
No issue number is consumed during this phase.

The idea record includes an operation ID, owner session ID, created/updated
timestamps, start and stop timestamps, counters, draft path, and a state of
active, stopped, promoted, or abandoned. It lives in local runtime storage and
is not a GitHub or tracked repository artifact. Abandonment deletes its timing
record without creating an issue. A second session in the same worktree must
not silently take it over. A mismatched session sees the owner and timestamp;
if the owner is live, the user chooses whether to continue in that session or
abandon it. A record whose owner is demonstrably gone can be discarded as
orphaned. An unverified or default session identity is not proof that the owner
is gone; ambiguous ownership refuses takeover or deletion.

`/task new <spec-file>` requires a complete, contained spec and a stopped
brainstorm record owned by the calling session. It validates input before any
external effect, then performs a recoverable sequence:

1. Create one governed Backlog stub through the sanctioned issue creator. Put
   the operation ID in a protected `Story Origin` body marker
   (`<!-- aitm-idea-operation id="<uuid>" -->`), preserved by the issue-body
   mutator, and durably associate the returned issue number with it.
2. Stamp the issue and brainstorm fields into the spec frontmatter, rename the
   file with the issue number, and commit version 1.
3. Add the exact committed spec path and commit to the issue's Story Origin or
   another canonical issue-owned reference, marking it as draft. Attach the
   measured discovery interval to the issue timing log exactly once.
4. Mark the local idea record promoted and bind the issue for subsequent work.

If a creation response is lost, retry scans the repository's issues created
since the operation began through the paginated GitHub API, matching that exact
marker rather than relying on search indexing. A single exact match resumes;
zero or multiple matches refuse another create until reconciled. The existing
title-only `/task new "title"` path stays
supported and is outside the new spec gate until a design spec is attached and
the issue explicitly enrolled. An enrolled title-only issue must acquire a
versioned, issue-linked spec before entering Refine. Unenrolled legacy or
title-only issues retain their existing Refine and Plan gates. With an
active brainstorm, the explicit spec path is authoritative; it is never ignored
in favor of an unrelated saved discovery plan. If issue creation succeeds but
a later step fails, retry resumes with the recorded issue number. It must not
create a duplicate issue, silently change the spec path, or claim the review
has happened. A failed promotion leaves a visible recoverable Backlog stub.

## Specification review in Refine

Backlog creation does not start hosted review. When an enrolled issue enters Refine,
AITM verifies that the linked draft spec and issue identity agree, then runs
multi-round SAR on the current committed version. The review examines purpose,
scope, stakeholder value, acceptance criteria, dependencies, architecture,
failure handling, and likely solo-versus-epic shape. The author records each
finding's disposition and commits each artifact revision with the next version.
Acceptance is bound to exact bytes.

After SAR, the SAR reviewer emits a structured yes/no/unknown value and cited
evidence for every rubric signal. AITM validates that all signals are present,
applies the repository-versioned rubric (`v1`), and records the score and
evidence. Security/privacy or irreversible data/migration impact scores 3 each;
non-backward-compatible external interfaces score 3; other externally consumed
interfaces, multiple subsystems/providers, and repeated material SAR findings
score 1 each. A severe SAR finding still open, or an assumption that prevents
acceptance, blocks approval until resolved. The SAR reviewer must resolve a
signal whose evidence is unclear in another round. If any value remains
unknown, AITM records the unresolved signal and reason, pauses Full-Auto work
on that issue, and refuses review selection; it never defaults to low risk.
Scores 0-1 select SAR, 2 selects SPR, and 3 or more selects SPR then XPR. A
single high-impact signal deliberately selects XPR; SPR-only is reserved for
the accumulation of two lower-impact signals. The receipt records rubric
version, signal values, score, and selected path. File length may affect review
cost but never decides the level alone.

With `ai-peer-review` healthy at review preflight, low risk ends at SAR,
moderate risk adds SPR, and high risk adds SPR then XPR. When it is not
installed or cannot be used at preflight, the available path is SAR. The risk
score, capability ceiling, selected path, and actual accepted reviews are
recorded separately; an unavailable SPR/XPR is never reported as passed.

AITM checks the selected provider again immediately before each hosted launch.
If it was healthy at preflight but fails then, the selected hosted path remains
required: AITM records the failure, preserves the SAR result, and blocks
promotion pending governed recovery. It does not recast that run as SAR-only.

An enrolled issue's Refine-to-Ready-for-Planning move requires a terminal
accepted result for the selected path, a current spec reference, and the
existing AITM refinement gates. Refine updates the issue's user story, scope,
ACs, labels, priority, size, and estimate from the reviewed design. The issue
is classified as solo or epic here; the design does not assume an epic during
Backlog capture.

## Plan review and epic hydration

On pickup from Ready for Planning, an enrolled solo issue or epic enters Plan. A
Superpowers implementation plan is generated from the currently reviewed spec,
with its own version and pinned source-spec reference. It receives iterative
SAR and, subject to the same capability-aware risk policy, optional SPR/XPR.
The plan's acceptance and normal AITM Plan approval are distinct records.

For an epic, the ratified master plan drives governed child creation and
hydration. Each new child moves from Backlog through Refine to Ready for
Planning with standalone scope, acceptance criteria, verifiers, dependencies,
priority, size, estimate, and normal parent link. If refinement of one child
changes another child's boundary, revise the affected children and complete
their normal Refine gates before proceeding. Existing WBS `Source-plan`,
`Source-plan-commit`, and `Source-plan-section` fields remain populated for the
current coverage guard; no additional child plan pointer is introduced.

Only after the complete child inventory is in R4P does the aggregate hydration
SAR compare it to the exact ratified master plan. It checks coverage,
duplicates, child boundaries, dependency order, story and AC meaning, and R4P
readiness. Findings cause corrections and further rounds. The accepted
hydration receipt on the parent records the plan commit, the complete child
inventory, and a digest of each child's semantic issue content at the moment
of acceptance. Semantic content includes scope, story, ACs, verifiers, and
dependencies; the `Source-plan*` fields are provenance bookkeeping and are
excluded from this digest. The receipt does not create a continuing per-child
plan lock.

Before epic Plan exit, AITM rechecks the inventory and semantic digests. Any
changed child semantic content or inventory requires a full aggregate SAR of
the current inventory after affected children regain R4P. A changed master
plan requires plan re-review, reconciliation of child source fields and mapping,
then another aggregate SAR against the newly accepted plan, even if the child
semantic digests are unchanged. SAR does not auto-repeat without bound: the
plan-and-hydration cycle has a shared budget of ten rounds, including rounds
that cause a new plan version. Exhaustion leaves the issue in Plan for an
explicit planning decision; it does not silently start a fresh budget. An
accepted receipt and all children in R4P are required before the epic moves
Plan to Develop.

The epic then pulls one dependency-ready child at a time from R4P into Plan.
The child performs a JIT Deep-Dive against current repository evidence and its
own hydrated issue content. It may consult the parent-linked master plan when
useful. A focused SAR checks whether the Deep-Dive's approach, AC verifiers,
dependencies, and estimate make sense now. One clean review round is enough;
findings prompt revision and another round. The Deep-Dive receipt identifies
the exact issue number, reviewed Deep-Dive section digest, and
digest of the issue scope, AC, verifier, and dependency fields plus estimate. A
change to any of those reviewed inputs before child Plan approval requires
another SAR; unrelated issue metadata does not. Child-specific discoveries may
change the child plan and estimate. Cross-child implications are raised through
the parent as planning information. A change to the historical master plan
does not automatically re-refine children or stop the epic.

## Review ownership and failure handling

AITM's built-in SAR supports iterative rounds, finding disposition, artifact
diffs, exact-byte acceptance for committed spec/plan files, section or body
digest acceptance for issue content, and an auditable terminal result for spec,
plan, hydration, and Deep-Dive reviews. It does not clone the external package's
multi-participant coordinator, grant protocol, or transport machinery. When
installed and healthy, `ai-peer-review` owns SPR/XPR protocol and evidence;
AITM consumes only its verified terminal result and exact artifact identity.
The two paths share a narrow result contract, not a duplicated protocol.

Full-Auto selects the review path without a per-story human prompt, but it
cannot turn an unavailable review into a pass or fabricate findings and
acceptance. A review that exhausts its allowed rounds or encounters a runtime
failure preserves its state for recovery. It does not advance the issue on an
unaccepted artifact. The existing user limit of one initial governed
peer-review attempt and at most one recovery attempt remains in force; a second
recovery requires specific authorization. This limit concerns failed review
attempts, not ordinary rounds inside one healthy review.

## Compatibility and migration

The command transition makes `brainstorm` canonical in help, skill text,
generated instructions, and diagnostics while retaining `discover` as an
alias. Existing discovery buckets are read conservatively and may be canceled
or promoted through their old route; they are not retroactively assigned
engaged time. Existing issues, specs, plans, and review archives keep their
historical authority. The new version, session, and review requirements apply
to newly created artifacts and to issues explicitly enrolled into this flow.

AITM's current rule that artifact review is independent of the issue Review
stage remains true. Its statement that AITM never invokes or prescribes an
external review package changes only for this planning workflow: the package
is an optional reviewed-artifact provider behind the narrow result boundary.
The later Test, PR, Review, delivery, and close states retain their current
behavior.

## Acceptance criteria

1. Brainstorming measures engaged time before an issue exists, excludes idle
   time, distinguishes sessions in one worktree, and discards abandoned time.
2. `/task new <spec-file>` creates at most one issue per promotion, versions and
   renames the spec, commits it, links the draft reference, and records the
   measured interval without backdating or double counting.
3. A Backlog stub needs no hosted review; an enrolled issue's Refine-to-R4P
   move requires the accepted spec review selected by the capability-aware risk
   rubric. Unenrolled issues retain existing gates.
4. New spec and plan revisions increase their integer version on every
   committed byte change; review acceptance binds exact version and commit.
5. A new plan identifies the exact source spec path, version, and commit.
   Before initial Plan approval, changed source spec requires a revised,
   re-reviewed plan.
6. A ratified epic master plan hydrates children, and one accepted aggregate
   SAR of the complete mapping plus child R4P readiness gates epic Plan exit.
7. Each child receives a focused JIT Deep-Dive SAR; changes discovered during
   execution do not automatically revoke sibling readiness or force epic
   replanning.
8. `ai-peer-review` absence selects SAR-only at preflight; available SPR/XPR
   run only when selected by the versioned risk rubric. Evidence reports only
   reviews that actually completed.
9. Existing issue and review history remains readable, and later code, PR,
   Test, Review, and close behavior is unchanged.
10. The governed review runner allows one initial peer-review attempt and one
    recovery, then blocks further attempts without specific authorization.
11. Epic children retain the existing WBS source-plan fields required by
    current guards, without acquiring any additional plan provenance fields.
