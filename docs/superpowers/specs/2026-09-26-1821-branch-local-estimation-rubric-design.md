# Branch-local estimation rubric and lessons design

## Status and sequence

This is the AITM design for project-local estimation evidence tracked by
[#1821](https://github.com/kburson/ai-task-manager/issues/1821). Complete the independent GraphQL measurement spike
[#1818](https://github.com/kburson/ai-task-manager/issues/1818) and record its
baseline before implementing this design. After implementation, repeat an
equivalent workload and assess the remaining open stories in the overlap map
below. The measurement, rather than an assumption about future API savings,
determines whether a general closed-issue snapshot archive is still warranted
for API reduction.

## Problem and boundary

AITM currently discovers estimation outcomes by paging through the GitHub
Project, finding Done issues, and reading their comments. Rubric snapshots live
in a designated GitHub issue, such as
[`ai-peer-review` #70](https://github.com/kburson/ai-peer-review/issues/70).
This makes routine estimation depend on broad GraphQL reads, hides machine data
in issue comments, and places a consuming project's learning outside its Git
history. AITM owns the storage and calculation; `ai-peer-review` is a migration
target, not the home of this feature.

The proposed estimation corpus is a small, structured project dataset. It is
not a shortened closed-issue snapshot. It contains frozen estimates, normalized
factors, derived comparison features, measured outcomes, lessons, and links to
source evidence. It does not copy complete issue bodies, full comment streams,
review transcripts, or other general historical material. GitHub remains the
authority for issue identity, live board state, approval, and lifecycle gates.

## Story record

AITM keeps one tracked, formatted JSON file per story under a configurable
project-local `estimation-rubric/` directory, named
`estimation-rubric-<issue-number>.json`. The schema is versioned and validated.
Stable identity includes repository, issue number, parent epic if any, source
record IDs, phase timestamps, and source digests. The file refers to the
governing design specification and implementation plan paths and revisions when
available; missing references remain explicit rather than guessed.

The file holds three phase entries:

1. **Refine:** provisional human size and effort estimate, scope/features,
   assumptions, uncertainty, and the evidence available at that decision.
2. **Plan:** frozen human Plan estimate and separate AI forecast, new facts from
   the deep dive, changes from Refine, comparable-story IDs and selection
   reasons, and evidence paths. Human and agent effort are separate measures.
3. **Close:** measured timing and other accepted outcome measures with source
   provenance, estimate variance, state-travel path and loops back to Develop,
   changed assumptions, and structured lessons about future estimates.

Records preserve unknown and incomplete values distinctly from numeric zero.
Feature fields use stable names and units. Close can add new measurements and
lessons, but may not silently rewrite the Refine or Plan decision as though it
had been known earlier. Corrections append a versioned amendment with reason
and provenance. Reopened issues and later closure cycles remain distinguishable.
Only a validated, complete Refine–Plan–Close triad can enter numerical
calibration. Refine-only and Refine–Plan records can inform the active story's
decision and explain a discovery delta; they provide no measured accuracy
label. Lessons may guide comparable selection and explanation, but unmeasured
prose never changes numerical coefficients on its own.

## Branch-local corpus and manifest

Each estimate reads committed records reachable in the current checkout. A
parent epic branch therefore learns from its completed children as their
records merge into that branch, alongside records inherited from the default
branch. A default-branch estimator learns them after the epic branch merges.
AITM checks that the working branch has incorporated its intended parent before
claiming the inherited corpus is current. One story and closure-cycle identity
contributes at most once to a cohort.

An ignored, per-checkout manifest indexes the validated complete triads and
their features, outcomes, lessons, provenance, and source paths. It is a
rebuildable performance cache, never a Git-tracked authority or PR artifact.
The cache key includes the Git tree ID of `estimation-rubric/` and estimator
schema/model version. A branch switch or pull selects a different key; a missing
or invalid cache rebuilds from the tracked files. AITM verifies the key before
every estimate and can warm the cache at worktree creation and after story
conclusion. This also works in the main checkout without a special worktree.

The estimator queries the manifest for relevant comparable stories using
structured features, recency, and outcome quality, with explicit cohort and
exclusion provenance. It does not treat all historical stories as equally
comparable or use an unexplained fixed tail of outcomes. The manifest supports
a bounded machine-readable estimate packet. A rubric translator can render a
full human explanation on request and a short rationale in the story issue;
neither requires showing raw JSON to the reader.

## Phase writes and close publication

AITM writes the Refine and Plan entries on the story's existing feature branch
as those phases finish. It still publishes the required canonical fields and
human-facing decision summary to GitHub at lifecycle boundaries. These local
records do not replace board authority or approval markers. The complete
triad enters the estimator only after the Close entry is validated and its
outcome is committed on the branch visible to that estimator.

The code PR integrates when the story leaves Test for Review. Close uses the
same feature branch for a follow-on outcome-record PR to its literal immediate
parent: default branch for a root story or epic, parent feature branch for an
epic child. AITM retains the source branch through this second integration.
Where the code PR was squash-merged, it synchronizes the target into the
source branch without discarding Test and delivery history, then commits only
the outcome record. AITM captures terminal timing as part of the governed
close transaction, pushes the committed record before reporting Done, and
tracks outcome-PR publication separately from the issue's Done state. If a
post-transition receipt changes the sealed measurements, it requires a
provenance-bearing amendment before the outcome PR may merge. Failed push or
validation is visible and retryable; it cannot silently claim a published
learning record.

The outcome PR gets focused validation of schema, identity, frozen phase
fields, timing provenance, closure-cycle uniqueness, changed paths, and target
branch. It must not be mislabeled as a prose-only change. AITM may merge this
data-only PR automatically after its applicable exact-head gates pass. The
universal parent-branch review policy proposed by
[#1688](https://github.com/kburson/ai-task-manager/issues/1688) must decide
whether it applies to these PRs before automation ships; this design does not
waive an existing or future merge gate. No separate data branch is required.

## Migration and verification

AITM performs a one-time verified import of historical forecast, outcome, and
rubric comments into per-story files where phase evidence is recoverable. It
preserves original comment IDs, rubric IDs, and source digests. Incomplete
triads remain marked ineligible. After validated migration, the designated
rubric issue is a historical archive, not an active estimator source. New
estimates read the local manifest; GitHub reads remain scoped to the current
story and lifecycle authority rather than rediscovering the entire corpus.

Verification covers schema evolution, missing-data semantics, branch overlay,
tree-key invalidation, duplicate closure cycles, phase immutability, rubric
translation, migration provenance, and outcome PR recovery. Compare GraphQL
points and calls for equivalent estimation and creation-to-planning workloads
against the #1818 baseline. Attribute the savings from corpus replacement
separately from Refine/Plan write batching, because they remove different API
traffic.

## Open-story overlap and disposition checkpoint

Keep these IDs in the spec through implementation and the post-measurement
review. Do not create a duplicate archival story or close/rewrite an existing
issue solely on this design's prediction. Recheck live issue state and scope at
the checkpoint because these stories may progress independently.

| Story                                                                       | Existing scope and overlap                                                                                                                                                                                                         | Decision after rubric measurement                                                                                                                          |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`ai-peer-review` #57](https://github.com/kburson/ai-peer-review/issues/57) | Earlier integration introduced the designated rubric-issue configuration that points at #70.                                                                                                                                       | Migrate that configuration only after AITM can read the local rubric corpus.                                                                               |
| [`ai-peer-review` #70](https://github.com/kburson/ai-peer-review/issues/70) | Project's designated issue stores rubric payloads in comments; migration source, not AITM feature owner.                                                                                                                           | Archive as historical input after verified import; remove active rubric-source dependency.                                                                 |
| [AITM #1091](https://github.com/kburson/ai-task-manager/issues/1091)        | Original adaptive-rubric and AI-forecast implementation.                                                                                                                                                                           | Preserve forecast semantics and provenance where still valid; replace broad corpus reads and issue-hosted rubric storage.                                  |
| [AITM #1514](https://github.com/kburson/ai-task-manager/issues/1514)        | Deduplicates comparable entries within current Plan forecast comments.                                                                                                                                                             | Decide whether its comment transport remains necessary once comparable evidence is in tracked story records; avoid building a second canonical list.       |
| [AITM #1682](https://github.com/kburson/ai-task-manager/issues/1682)        | Proposes tracked closed-issue research capsules, local estimator index, and bounded GitHub refresh. Direct overlap with this local estimator corpus and with #1817's historical archive.                                           | Re-scope or supersede its estimator-corpus work after measurement; retain only independently justified research requirements.                              |
| [AITM #1688](https://github.com/kburson/ai-task-manager/issues/1688)        | Proposes exact-head validation and agent review for every code-bearing parent-branch PR.                                                                                                                                           | Resolve classification and applicable gates for rubric outcome PRs before automatic merge.                                                                 |
| [AITM #1719](https://github.com/kburson/ai-task-manager/issues/1719)        | Story-level agent and automation cost accounting. Provides distinct measured evidence; it is not an estimation store.                                                                                                              | Reference accepted timing/cost evidence rather than duplicate its accounting or infer unknown cost as zero.                                                |
| [AITM #1744](https://github.com/kburson/ai-task-manager/issues/1744)        | Read-only cost/coverage inventory under #1719.                                                                                                                                                                                     | Reuse coverage and missing-data signals where relevant; do not turn the rubric manifest into a cost ledger.                                                |
| [AITM #1817](https://github.com/kburson/ai-task-manager/issues/1817)        | Worktree-local draft/coalesced publication plus complete compressed closed-issue snapshots, offline historical search, and board retention. Its snapshot archive overlaps #1682 but serves broader historical and retention goals. | Preserve independently valuable Refine/Plan batching; reassess snapshot/archive slice after measured rubric savings and separate research/retention needs. |
| [AITM #1818](https://github.com/kburson/ai-task-manager/issues/1818)        | Independent GraphQL point/call instrumentation and baseline.                                                                                                                                                                       | Complete first; use equivalent before/after workloads to decide remaining work in #1682 and #1817.                                                         |

The checkpoint asks: How many GraphQL points and calls did local estimation
eliminate? What remains in creation, Refine, and Plan after batching? Which
historical research or board-retention use cases still require full snapshots?
Only those measured or independently justified needs should drive the
remaining overlap stories.
