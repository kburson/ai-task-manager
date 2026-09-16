# #1558 Ask-the-Script Guidance Hydration WBS — Reviewer Response, Round 1

| Field                 | Value                                                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Role                  | Reviewer (Claude)                                                                                                                                           |
| Author                | Sol5.6 (drafting) / Codex (responses and revisions)                                                                                                         |
| Round                 | Hydration WBS addendum — round 1                                                                                                                            |
| Artifact              | `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-hydration-wbs.md`                                                                           |
| Artifact SHA-256      | `0d86d3af4be89c21a599520ed767a10f19be673f79ade851b2ff33e4de063422` — verified, matches the supplied hash                                                    |
| Artifact git status   | **Untracked.** No committed revision exists; the reviewed bytes are the working-tree file only.                                                             |
| Checkout HEAD         | `a168753999617066d98bbc1227c4b5d97fa531c5`                                                                                                                  |
| Baseline plan         | `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-replacement.md`                                                                             |
| Baseline plan SHA-256 | `9300f7f8730110e41d8ff2e0022f2d85d893e2f32549e0f9ddbe8f672b8ba635` — matches the addendum's pinned source-plan digest                                       |
| Ratified spec         | `docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md`                                                                                  |
| Spec SHA-256          | `2e121b01863952df69ac13bb373bf9c2d671e1e04027b047289f96647d9eea78` — unchanged from the plan's recorded value                                               |
| Prior reviewer record | `docs/superpowers/reviews/1558/plan/2026-09-16-replacement-round-3-reviewer-claude.md` — `818857f8321711a919c4fb56afefaea3433f724a208fc751797e76b53cfec138` |
| Prior author record   | `docs/superpowers/reviews/1558/plan/2026-09-16-replacement-round-3-author-codex.md` — `4e31088ce3f7a3f7d252212e5b46735b938f5539d15aa64e9e2495bb8256d6ad`    |
| Verdict               | **CHANGES REQUIRED — not ready to govern backlog hydration.** Six blocking findings.                                                                        |

The addendum's pinned `Source-plan-commit` (`a168753999617066d98bbc1227c4b5d97fa531c5`) and
`Source-plan SHA-256` both verify against this checkout. The baseline plan and spec are unmodified.
I did not edit the addendum, plan, spec, any issue, or any workflow state.

## 0. Verdict and scope

The decomposition judgement in this addendum is largely sound: the characterization split is at the
right seams, the dependency graph for Tasks 2–17 reproduces the accepted plan exactly, no context
budget moved, and no acceptance criterion or verifier was weakened. What is not ready is the
**hydration contract**. Six things block it, and four of them are mechanical — I ran the
repository's own decomposition machinery against the accepted plan and the proposed child set, and
it cannot produce the result the addendum's controls assert.

One material upstream defect surfaced during that check. I am naming it rather than working around
it (H2b).

Blocking: **H1–H6.** Non-blocking: **M1–M8.** Optional: **S1–S4.** Verified-sound items in §4.

## 1. Blocking findings

### H1 — The ten split children have no acceptance criteria, and `--shape sub-issue` cannot create them without one

**Severity:** Blocking.
**Evidence:** Addendum §"Characterization decomposition" (Tasks 1a-i, 1a-ii-a, 1a-ii-b, 1a-ii-c,
1b-i, 1b-ii, 1b-iii, 1b-iv) and §"Other mandatory size reviews" (Tasks 12a, 12b). Every one of these
ten children is specified with **Estimate / Owner / Source-plan-section / Scope / Excludes /
Verifier identity / Depends on / Blocks** — and no acceptance criteria. Hydration control 5 defers
the allocation: "Copy the relevant story, bounded scope, acceptance criteria, and exact root verifier
into each issue."

There is nothing to copy. The accepted plan writes three ACs for the undivided Task 1a, three for
Task 1b, and three for Task 12 — all scoped to the whole parent. `scripts/gh/create-issue.mjs:137`
makes `--ac-file` mandatory for `--shape sub-issue` (usage at `:44`; enforcement at `:129-141`), so
hydration of these ten children is not merely underspecified, it is mechanically impossible from
this document.

**Why it matters:** The WBS exists to pin the split _before_ hydration. Leaving AC allocation to the
hydrator moves the lossy step past the review gate — which is the exact failure the plan's
pre-hydration sizing rule was written to prevent.

The hardest case is Task 1a's second AC:

> The test-only whole-lifecycle process harness exercises unchanged production predicates/formatting
> against isolated transports, with positive per-lane transport coverage, callback/custom-promisify
> shape regressions, attempted-escape and package-exclusion proofs.

That single AC spans **both** 1a-ii-a (interception, custom-promisify shape, escape ledger,
package-exclusion) and 1a-ii-b (per-lane positive transport coverage requires the authority fixtures
and expected request identities). Neither child can satisfy it alone.

**Requested change:** For each of the ten split children, state its acceptance criteria explicitly.
Show that the union of the children's ACs covers each parent AC with no gap, and that no parent AC
is claimed by two children. Where a parent AC genuinely spans two children (Task 1a AC2), split it
into child-scoped criteria rather than duplicating the parent text, and say so.

### H2 — The hydration controls assert a WBS-coverage result the shipped reconciler cannot produce

**Severity:** Blocking.
**Evidence:** Addendum hydration control 4 ("Split children use the original Task 1a, Task 1b, or
Task 12 heading plus their exact WBS subsection identity") and control 8 ("Verify 25 expected and 25
covered children, unique source-section/WBS identities…"). I checked these against
`scripts/task-tracker/lib/decomposition-wbs-coverage.mjs` and
`scripts/task-tracker/lib/decomposition-policy.mjs`. Three independent failure modes:

**H2a — one child per plan section.** `reconcileWbsCoverage` (`decomposition-wbs-coverage.mjs:122-131`)
selects candidates per task heading and rejects more than one:

```js
const candidates = relevant.filter((claim) => claim.sourcePlanSection === task.heading);
if (candidates.length === 0) { missingTasks.push(task.heading); continue; }
if (candidates.length > 1) { duplicateClaims.push(`${task.heading} is claimed by …`); continue; }
```

Tasks 12a and 12b both carrying `### Task 12: Enforce guidance source trust and operational
admission` produce `wbs-duplicate-claim`. The `Source-WBS` subsection identity that control 4 adds
as a disambiguator is invisible here — `parseWbsChildClaim` (`:6-14`) reads only `Source-plan`,
`Source-plan-commit`, and `Source-plan-section`.

**H2b — `### Task 1a:` and `### Task 1b:` are not extractable plan sections (upstream defect).**
`TASK_HEADING_RE` at `decomposition-policy.mjs:20` is
`/^###\s+(Task|Milestone)\s+(\d+):\s*(.*?)\s*$/i` — `\d+` does not match `1a` or `1b`. I ran the
repository's own extractor against the accepted plan at this HEAD:

```
count 16
2 | Establish the complete shared decision and typed vocabulary contract
…
17 | Slim both adapter protocols and certify the consumer release
```

Tasks 1a and 1b do not appear. Consequences: the eight characterization children produce
`wbs-unknown-section` from `reconcileWbsCoverage` (`:107-113`) and `Source-plan-section not found`
from `selectDecompositionPlanSection` (`decomposition-policy.mjs:377-388`), and `expectedCount`
is **16**, so control 8's "25 expected and 25 covered" is unreachable — `coveredCount` is capped at
`tasks.length`.

This heading form originates in the accepted replacement plan, not in the addendum. **I am flagging
it as an upstream defect and not proposing a silent baseline change.** Note it also means the
already-agreed plan's own claim of "18 proposed children and 18 verifiers" is not machine-checkable
at the section level today.

**H2c — exact title equality.** `reconcileWbsCoverage:144-149` requires
`claim.title === task.title`, where `task.title` comes from the `### Task N:` heading. The
addendum's split children carry new titles (e.g. "Inventory lifecycle sources, effects, refusals,
and behavioral flags" against the plan heading's "Inventory source/effects/flags and freeze the
legacy workflow baseline"), which yields `wbs-provenance-mismatch`.

**Requested change:** Name the actual command control 8 runs and the output it must produce. Then
state explicitly which of these governs, and pin it: (i) a new plan revision renumbering the 1a/1b
headings into the supported form; (ii) a scoped code change to the reconciler to admit
subsection-qualified split claims; or (iii) a documented, reviewed waiver recording that the shipped
checker is not run for this epic and what is run instead. Do not assert a 25/25 reconciliation the
current tooling cannot emit.

### H3 — NO-GO containment is prose only; completing Task 1b-iv with NO-GO unblocks Task 2

**Severity:** Blocking.
**Evidence:** Addendum Task 1b-iv: "An honest NO-GO completes this child's accounting but blocks
Tasks 2-17." Hydration table row 9: `Task 2 | 1b-iv GO`. Hydration control 6: "Record native
parentage and dependency edges matching the table… but a Task 1b NO-GO blocks Tasks 2-17 from
execution."

"1b-iv GO" is not a representable native dependency. The repository's dependency edge is the
`Blocked By` field plus the `BLOCKED` label and body marker; per `CLAUDE.md`, "When `#B` reaches
Done, `pull-next` auto-unparks `#A`." A NO-GO that "completes this child's accounting" therefore
satisfies the edge and unparks Task 2 — the precise failure mode the review brief warns about, and
the inverse of what the plan's foundation gate exists to enforce.

The documentary side is fine: 1b-iv is the only child naming `feasibility-decision.json`,
`--assert-feasible`, and the GO/NO-GO verdict, so sole ownership is preserved. The gap is
enforcement, not ownership.

**Requested change:** Pin one mechanism, concretely:

1. Task 2 carries an entry acceptance criterion citing a recorded `--assert-feasible` exit-0
   result, checked at its own gate, so a Backlog edge alone never authorizes start; or
2. 1b-iv is **not** closed on NO-GO — it parks/shelves with the measured result recorded — and the
   WBS says which verb and which state; or
3. Tasks 2–17 stay `BLOCKED` on 1558 with an explicit GO-marker precondition that hydration writes,
   and the WBS names the marker.

Whichever is chosen, say what the hydrator does differently in the NO-GO branch. Prose in control 6
will not survive `pull-next`.

### H4 — The Task 12 split has one shared verifier, an undefined admission boundary, and a release gap

**Severity:** Blocking.
**Evidence:** The accepted plan's split instruction (Task 12, §"Admission inventory") is explicit:
"split Task 12 before implementation into source/trust/recovery admission and entrypoint/annotation
integration children, **with separate verifiers** and a pinned WBS revision; B1 remains incomplete
until both are delivered."

Three deviations:

**H4a — not separate verifiers.** The addendum assigns `VC12` to both 12a and 12b (hydration table
rows 19–20; §12a and §12b "Verifier identity: VC12"). VC12 is one command covering
`guidance-admission.test.mjs` plus `core/package-boundary.test.mjs` and
`downstream-package-boundary.test.mjs`. 12a cannot take it green at its dependency stage: VC12
asserts full-surface admission and the Step-6 release/package assertions that the addendum assigns
to 12b. This is a direct fidelity loss against an explicit plan requirement.

**H4b — the boundary is "first half", not a capability.** 12a's scope ends with "the first half of
the exhaustive admission inventory"; 12b's begins "Gate every enumerated canonical route, alias,
standalone entrypoint, and direct supported entrypoint." Either 12b subsumes 12a's half (12a's
inventory work is redundant) or it does not (a half is unowned) — and "first half" of a ~100-route
inventory is not a reviewable boundary. Neither child is named owner of `admission-surface.json`
completeness or of the plan's "An unclassified newly exposed route fails CI" gate. The plan's
`Recovery only` row (guidance validate/source, top-level and command help, version) is also split
across both children — 12a "recovery-only routes", 12b "CLI/help surface" — though it is one
allowlist.

**H4c — release gap.** Plan Step 6 requires "a release assertion that refuses an operational-loader
consumer release while B2 cache certification is absent; no temporary release bypass." The addendum
places that in 12b ("aggregate CI certification"), while 12a lands source profiles, trust
selection, strict validation, and **release identity generation**. Between the two merges, B1 loader
machinery exists with no B2 refusal installed. That contradicts the plan's global constraint "B1 and
B2 ship together" and gate 4, and the addendum's per-child sections state no joint-release
constraint — 12a's only constraint is "Blocks: Task 12b."

**Requested change:** Define two distinct verifiers over distinct test files (e.g. VC12a over a
source/trust/recovery suite, VC12b over the entrypoint/annotation suite plus the package/release
gates), each runnable to green at its own stage. Replace the "first half" boundary with a capability
boundary and name the single owner of `admission-surface.json` completeness and the
unclassified-route CI gate. State the joint-release constraint on 12a explicitly, and say which
child installs the B2-absent release refusal — if 12a ships loader-adjacent code first, it needs the
refusal, not 12b.

### H5 — Tasks 1a-ii-a and 1a-ii-b are concurrent siblings that share files and one interface, with no ownership assigned

**Severity:** Blocking.
**Evidence:** The addendum makes them explicitly parallel: 1a-ii-a "Depends on: Task 1a-i" / "Blocks:
Task 1a-ii-c"; 1a-ii-b identically. No edge between them.

They are not separable as written:

- The accepted plan's Task 1a creates `guidance-legacy-{cli,preload,transport}.mjs`. 1a-ii-a's scope
  (launcher, preload, callback interception, custom-promisify replacement, nested-child propagation,
  direct-network denial, **transport-ledger regressions**) and 1a-ii-b's scope (isolated repository,
  deterministic issue/board/approval/PR/provider **store**, expected request identities,
  success/refusal lanes, **coverage reconciliation**) both land in `guidance-legacy-transport.mjs`.
- Both define parts of the single `captureLegacyWorkflow({ sourceCommit, adapter, scenario,
authorityFixture, scratchRoot })` interface the plan specifies.
- Both must write `scripts/tests/unit/task-tracker/lib/guidance-legacy-baseline.test.mjs` — the only
  new file in VC1 (`core/package-boundary.test.mjs` already exists at
  `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`; the baseline test file does not).
- The plan's Step 2 RED→GREEN assertions cannot be completed by either child alone: the sample
  requires an intercepted `transportLedger` containing a `gh` row _and_ an approved/missing-approval
  authority fixture, and `assert.deepEqual(denied.observedAuthorityRequests,
denied.expectedAuthorityRequests)` reconciles one child's ledger against the other's expectations.

`CLAUDE.md` requires shared files to be flagged before any parallel fan-out. This WBS creates a
concurrent pair whose entire deliverable is a shared file set.

**Requested change:** Either serialize them (1a-ii-a → 1a-ii-b) and assign each file and each
exported symbol to exactly one child, or keep them parallel and publish the exact interface contract
1a-ii-a produces and 1a-ii-b consumes, naming the owner of `guidance-legacy-transport.mjs` and of
the shared test file. In both cases, state which subset of VC1 each child must take green (see H6's
companion point below and M8).

### H6 — "Implementation tasks" is undefined, so both thresholds are uncheckable — and this decides Tasks 4, 8, and 10

**Severity:** Blocking.
**Evidence:** The governing rule (addendum §"Authority and purpose") is "Review at 16 hours or three
implementation tasks. Split at 24 hours or four implementation tasks." The unit is never defined,
and the table's counts match none of the plan's own enumerated work units. I counted both:

| Plan task | `**Step N —**` items | AC checkboxes | Addendum "implementation tasks" |
| --------- | -------------------: | ------------: | ------------------------------: |
| 1a        |                    5 |             3 |                              10 |
| 1b        |                    6 |             3 |                               9 |
| 4         |                    5 |             3 |                               3 |
| 8         |                    5 |             2 |                               3 |
| 10        |                    5 |             3 |                               3 |
| 12        |                    6 |             3 |                               6 |

Task 8 has two ACs but is scored 3, so it is not AC count. Tasks 4, 8, and 10 each have five plan
Steps but are scored 3, so it is not Step count either. The unit is unstated and not derivable.

This is not pedantry. Under the plan's own enumerated implementation Steps — the most natural
reading of "implementation tasks" for a plan that enumerates exactly that — Tasks 4, 8, and 10 each
have **five**, which exceeds the mandatory split trigger of four. The addendum retains all three
atomic on the stated ground that each is "below four implementation tasks." That retention argument
is unverifiable as written, and on the competing reading it is inverted.

**Requested change:** Define the counting unit, show the derivation for at least Tasks 4, 8, 10, and
12 (how 5 Steps becomes 3, and why Task 12's 6 Steps becomes 6), and re-test the three retained
atomic tasks against the defined unit. If the defined unit keeps them below four, say so on the
record; if it does not, split them.

## 2. Non-blocking findings

**M1 — Six new children sit at the review threshold with no recorded review decision.** 1a-ii-a
(16 h / 3), 1a-ii-b (16 h / 3), 1b-i (16 h / 3), 1b-ii (16 h / 3), 12a (20 h / 3), and 12b (20 h / 3)
all trigger "16 hours **or** three implementation tasks." Tasks 4, 8, and 10 each received an
explicit `**Decision:**` line; these six received none. The plan's rule is threshold-based, not
parent-only. Add a one-line recorded decision for each.

**M2 — 20-hour, high-uncertainty retentions sit 20% under the split trigger with no band or
re-review trigger.** Tasks 4, 10, 12a, and 12b. The plan already supplies the backstop ("At Refine,
estimate actual scope and split tasks exceeding the current atomic threshold"; Task 1a Step 5:
"Scope growth crossing a threshold requires re-decomposition before continuing"). Cite it, and state
the re-decomposition trigger for these four.

**M3 — Task 10 bundles at least four distinguishable deliverables.** Per the accepted plan's Task 10:
close readiness extraction; the aggregate seven-action `action-parity.test.mjs` conformance table
across ready/blocked/indeterminate/changed-authority/post-ready-failure; authority count and
median/p95 CI regression ceilings with ≥20% unused headroom; and the residual-legacy-inventory
review that completes workstream A2. The aggregate parity suite is cross-cutting over all seven
actions, not close-specific. Whatever counting rule yields 3 for Task 10 must be shown not to yield
≥4 here. Ties directly to H6.

**M4 — Task 12's 40 hours is thin against the surface the plan pins.** I verified the plan's baseline
numbers at this HEAD: `bin/aitm-registry.mjs` exposes `VERBS.size === 72` and
`Object.keys(SCRIPTS).length === 21` (plus `INTERNAL` 9). The plan requires one `admission-surface.json`
row per route/subcommand — canonical route, aliases, entrypoint, pre-admission imports, first
potential effect, gate call, exception classification, fixture ID — plus fixture coverage
demonstrating _each_ canonical path and _every_ alias reaching the gate before effects. For ~93
public tokens alone that is a large share of 40 hours, before source profiles across the eleven
enumerated layouts, release fingerprinting and CI recomputation, the recovery CLI, and the paginated
annotation audit with retry and concurrency tests. Not a disproof — a request for the derivation.

**M5 — Hydration mechanics are underspecified for dependency edges, rank, priority, and assignee.**

- _Dependency edges._ `create-issue.mjs` has no dependency flag. The sanctioned mechanism is
  `/task block [#N] --by <M>[,<P>...]` (`scripts/task-tracker/verbs/block.mjs:3`) writing the
  `Blocked By` field (`fieldBlockedBy`, `.ai-task-manager/task-tracker.json:31`), the `BLOCKED`
  label, and the body marker. Control 6 says "record native … dependency edges" without naming it.
- _Rank._ `evaluatePlanning` (`decomposition-delivery-readiness.mjs:88-110`) blocks on "has no finite
  rank" and requires every blocker to rank **strictly earlier**. The addendum's Sequence column 1–25
  is a valid topological rank — I checked every edge in the table and found no inversion — but
  control 7 never instructs the hydrator to pass `--rank`. Say it, and say that Sequence is the rank.
- _Priority._ Control 8 verifies "priority inheritance", but `create-issue.mjs:472` passes priority
  only when `--priority` is given, `project-tether.mjs` implements no inheritance, and cascading is
  the separate explicit `set-priority <N> <p> --cascade`. No child in the WBS is assigned a priority.
  Either specify the priority and the command that sets it, or drop the verification claim.
- _Assignee._ Control 8 verifies "assignee", but per #793 (`create-issue.mjs:323-328`, `:470`) new
  issues default unassigned. State that the expected assignee is **unset**, or name who is assigned.

**M6 — `Source-WBS` and `Source-WBS-commit` are inert to the checker.** `parseWbsChildClaim`
(`decomposition-wbs-coverage.mjs:6-14`) reads only `Source-plan`, `Source-plan-commit`, and
`Source-plan-section`. Recording WBS provenance is good practice, but control 4 implies these fields
disambiguate split children to the coverage reconciler; they do not (see H2a). Also state that all
five fields must live under `## Plan Metadata` — that is where `visibleMetadataFieldValue` looks.

**M7 — "Sequential" labels contradict the stated graph.** The sizing table calls the Task 1a harness
half "Three sequential characterization harness children" and combined Task 1a "Four sequential
characterization children", but 1a-ii-a and 1a-ii-b are concurrent under the dependency lines and
the hydration table. Separately, 1b-i's "Blocks: Task 1b-ii and Task 1b-iii" is redundant with
1b-ii → 1b-iii. Fix the wording or fix the edges; this interacts with H5.

**M8 — Ownership of Task 1a's completion check and of the artifacts later tasks consume.** Task 1a
Step 5 ("All seven action lanes, effect/flag classifications, full traffic and known refusals must
be covered before Task 1b starts"; "Confirm the mandatory separate-and-combined sizing review and
any required WBS split were completed before hydration") is assigned to no child — 1a-ii-c's scope
does not mention it. Likewise, Task 1b Step 1 "Verify Task 1a inputs" and Task 16 "Extend Task 1's
preserved runner and fixtures" each address "Task 1a" as a single owner. With four children, name
which child's frozen artifacts are the pinned inputs, and which child owns the runner that Task 16
extends.

## 3. Optional suggestions

**S1 — Control 3's command is incomplete.** `npx aitm create-issue --shape sub-issue --parent 1558`
exits 2. `--shape sub-issue` additionally requires `--title`, `--user-story-file`, `--scope-file`,
`--ac-file`, and `--story-origin-file` (`create-issue.mjs:44`, `:129-141`). Show the full
invocation. For the record, the command _form_ is fine: I verified `node bin/aitm.mjs create-issue`
routes to `scripts/gh/create-issue.mjs` via `EXECUTABLE_ENTRYPOINTS`
(`lib/command-surface/entrypoints.mjs:23`), so the addendum's `npx aitm` form is the plan's
`scripts/gh/create-issue.mjs` path, not a substitution.

**S2 — Section files take bare content.** Pre-rendered markdown passed to `--scope-file` / `--ac-file`
is silently double-wrapped, which corrupts AC citation IDs. Worth one line in the controls, plus
"read the created body back before proceeding."

**S3 — The duplicate-child guard will see 25 closely-worded siblings.** `create-issue.mjs:410-421`
(#921) compares each new sub-issue against existing siblings and refuses high-similarity matches
(exit 7). Say what the hydrator does when it fires — reflexively passing `--allow-duplicate-child`
25 times would defeat the guard that exists precisely for epic fan-out.

**S4 — Task 17 title divergence (upstream).** The accepted plan's hydration table lists "Slim both
adapter protocols and certify measured reduction"; the `### Task 17:` heading says "…certify the
consumer release." Because `reconcileWbsCoverage` compares the child title to the **heading** title
(H2c), the WBS should state that the heading title governs. Upstream inconsistency — flagged, not
changed.

## 4. Checked and sound

Stating these explicitly so the author does not re-derive them:

- **No budget movement.** The fixed proxy ceilings (5,000 / 300 / 500 / 7,000) and CI headroom
  floors (4,000 / 240 / 400 / 5,600) are untouched and unmentioned — correct for a WBS addendum.
- **No weakened checks in the 15 retained tasks.** The closing paragraph of §"Hydration WBS"
  correctly forbids substituting the table for the implementation contracts: "Hydration must copy
  those exact sections into child fragments." No AC, exclusion, or verifier was paraphrased.
- **Arithmetic reconciles.** 18 + 7 = 25; the split adds +3 (1a), +3 (1b), +1 (12). Per-child sums
  match every sizing-table row: 12+16+16+12 = 56 h / 2+3+3+2 = 10; 16+16+12+8 = 52 h / 3+3+2+1 = 9;
  20+20 = 40 h / 3+3 = 6.
- **All 18 verifier identities survive.** VC1–VC18 each appear in the hydration table; none dropped.
  VC1 ×4, VC18 ×4, VC12 ×2, one each for VC2–VC11 and VC13–VC17 = 25 rows. Coverage at the identity
  level is complete; **ownership** is the open question (H1, H4a, and the partition question in M8).
- **Dependency edges for Tasks 2–17 match the accepted plan exactly**, including Task 11 ← 2,
  Task 12 ← 6–11, Task 14 ← 3/10/13, and the 9 ← 4 and 10 ← 5/8/9 edges. The Sequence column is a
  valid topological order with no rank inversion, which is what `evaluatePlanning` requires.
- **Backlog and unset sizing fields are achievable as written.** `create-issue.mjs` forces Backlog
  (#272, `:114-118`, `:272-279`, `:519`) and leaves Size/Estimate unset when those flags are
  omitted, so control 7 needs no new mechanism.
- **The plan's admission-surface baseline verifies at this HEAD.** 72 verb/alias tokens and 21
  standalone/router tokens, exactly as the plan states.
- **1b-iv's sole ownership of the feasibility decision is preserved documentarily.** It is the only
  child naming `feasibility-decision.json`, `--assert-feasible`, and the GO/NO-GO verdict, and the
  only one carrying "VC18 plus the accepted plan's separate foundation-gate command." The defect in
  H3 is enforcement of the NO-GO branch, not ownership of the decision.
- **The characterization seams are well chosen.** Inventory → interception / fixtures → baseline
  capture → clause oracle → candidate fixtures → measurement → decision is the right order, and the
  Excludes lines are genuinely restrictive rather than decorative. H5 is a boundary defect inside
  one rung, not an objection to the decomposition shape.

## 5. What would clear this review

H1 through H6, each with a concrete answer rather than a restated intention:

1. **H1** — ACs for all ten split children, with a stated lossless, non-overlapping allocation.
2. **H2** — The actual reconciliation command and its expected output, plus a pinned decision on the
   `Task 1a` / `Task 1b` heading form (new plan revision, reconciler change, or reviewed waiver).
3. **H3** — One named mechanism that keeps Tasks 2–17 blocked through a completed NO-GO.
4. **H4** — Two distinct Task 12 verifiers, a capability boundary replacing "first half", a named
   owner for admission-surface completeness, and the joint B1/B2 release constraint on 12a.
5. **H5** — Serialize 1a-ii-a/1a-ii-b or publish their interface contract, with file and symbol
   ownership assigned and each child's VC1 subset stated.
6. **H6** — A defined counting unit, its derivation, and a re-test of Tasks 4, 8, and 10.

M1–M8 and S1–S4 do not require another round on their own, but M5 in particular is cheap to close
in the same revision and will save a hydration run.

## 6. Handoff

No agreement yet. This is a changes-required response, not a rejection of the decomposition — the
sizing judgement is defensible once H6 defines its unit, and the child boundaries are right
everywhere except 1a-ii-a/1a-ii-b and 12a/12b. The hydration controls are the weakest section and
need the most work.

Any revision should produce a new file with a new SHA-256; do not edit the bytes named in this
record. I did not invoke the peer-review skill, spawn reviewers, create issues, change workflow
state, or modify the addendum, plan, or spec.

**Reviewer verification:** I ran `npx prettier --check` and `npx markdownlint-cli2` directly on this
response's bytes before computing its final hash, per the plan's review-artifact rule.
