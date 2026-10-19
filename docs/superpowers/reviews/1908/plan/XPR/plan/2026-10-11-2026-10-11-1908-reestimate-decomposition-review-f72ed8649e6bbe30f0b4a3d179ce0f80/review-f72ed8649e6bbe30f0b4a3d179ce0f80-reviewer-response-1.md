<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-f72ed8649e6bbe30f0b4a3d179ce0f80"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-10-11-1908-reestimate-decomposition.md"
artifact_commit: "0f840cdcca5bfe181ec9a050fe41879b59002723"
artifact_blob: "1c6346b45258635da8f43e38d2973ac9220623e7"
artifact_digest: "sha256:9b87ec194deed5f31c118485ce2e8c5aa6e5f149085e6c41d4bf1c25e63d1873"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:988367240c76a33f0b2d1184b0071fc99132abcbbb7a5499d433590d5a3b6525"
  identity_source: "runtime"
started_at: "2026-10-11T15:23:06.515Z"
submitted_at: "2026-10-11T15:29:14.119Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I reviewed the plan against the accepted spec (`docs/superpowers/specs/2026-10-11-1908-reestimate-decomposition-design.md`) and checked its source claims in this worktree. The architecture follows the spec: a pure kernel, an authority/projection collector, and a resumable publication owner, composed into writers, continuation, hooks and recovery. The seven-child split has a sensible dependency graph, and every child is under 24 hours. Every production file and existing test suite the plan names exists, including `scripts/tests/unit/task-tracker/lib/estimation/plan-estimate-authority.test.mjs`, `core/heal-backlog-fields.test.mjs`, `core/migrate-fields-encoding.test.mjs`, `integration/.../shelve-transaction.integration.test.mjs` and `integration/.../update-event-fields-states.test.mjs`. The lock claims also hold. The forecast claim is built on `withIssueLock` (`scripts/task-tracker/lib/estimation/record-claim.mjs:2,52`), and that lock already has issue-scoped re-entrancy (`scripts/task-tracker/issue-mutator-lock.mjs:265-334`). The waiver producers sit where the plan says (`decomposition-plan-exit-guard.mjs:94-150`, `decomposition-policy.mjs:328`).

I re-ran the generic-writer census grep for `writeProjectFieldValue|clearProjectFieldValue|tetherIssueToProject|ensureIssueFieldDb|formatIssueFieldDb` over `scripts/` (excluding tests). It returns 27 files. The census covers all of them except two under `scripts/migrate/`, which sits outside the census's declared directories (Finding 7).

The main problems are structural, not architectural:

- Material obligations live in addendum sections that `split-plan` will not copy into the children.
- The kernel input has no epic-readiness observation, so a converted epic's status can't be derived.
- The publication fence relies on a marker-protection mechanism the plan never names or tests.
- Several repository gates and shared generated inventories have no owner, including one that two parallel wave-4 tasks would both edit.

## Findings

1. **Addendum obligations will not reach the generated child issues.** `extractPlanTasks` ends a task section at the next heading of level 1–3 (`scripts/task-tracker/lib/decomposition-policy.mjs:23,83-85`). `buildSplitProposals`/`renderScope` then render only that section's `scopeBody` into the child's Scope, AC ("Deliver … exactly as specified in the pinned source plan") and `Source-plan-section` metadata (`scripts/task-tracker/lib/split-plan.mjs:88-125`). Under the plan's own contract, the decomposition `scopeDigest` binds that selected section too. Four sets of obligations live outside any `### Task N` section:
   - (a) "Completed generic field call-site census" assigns Task 3 `cancel-plan.mjs`, `shelve-transaction.mjs`/`verbs/shelve.mjs` and `gh/update-event-fields.mjs`, plus the cancel-plan/shelve/event-field writer IDs. Task 3's own section names none of them in Files, Interfaces or Steps. Only its estimate and second `Run:` line were patched.
   - (b) "Remote no-commit effects and completion boundary" assigns Task 5 `lib/code-complete-gate.mjs`, `lib/action-decision/test.mjs`, `verbs/issue-body.mjs`, `verbs/comment.mjs`, `verbs/epic-reconcile.mjs`, `verbs/deliver.mjs` and guard-registry/preflight composition. Task 5's section lists none of these. It also still says Task 4 owns "guard-registry", while the addendum gives guard-registry/preflight composition to Task 5.
   - (c) "Runtime plan structure and compact projection" changes Task 1 and Task 2 (`plan.content`, `extractPlanTasks(content)`, the selected-section digest).
   - (d) "Shared wire and API contracts" is cited as "above" from inside Task sections.

   The result: the Task 5 child's declared scope, scope digest and story will cover roughly half of its real file set. An implementing agent working from the child body will either miss the remote no-commit boundary or work outside its reviewed scope. "The completed census is authoritative" is a sentence in the parent plan, not part of the child's materialized scope.

2. **Epic readiness has no input, and the capabilities of each epic status are undefined.** `aitm.decomposition-input/v1` contains `schema`, `subject`, `kind`, `estimate`, `size`, `plan`, `policy`, `scopeDigest`, `observations` and `availability`. It has no materialized-children or readiness observation, so the pure kernel cannot tell an unresolved converted epic from one whose reviewed children satisfy readiness. The plan also never states:
   - how a story's task-count or verification-group `must-split` maps to a status for an epic (spec line 190 makes the `must-decompose` mapping story-specific);
   - which capabilities `epic-readiness-required` allows;
   - what status a satisfied epic has.

   Task 5 says "Converted epics also need current materialized readiness" before no-commit completion or deliver records, and Task 6 says materialized children satisfy "the existing affected epic boundary". Neither names the data path. This matters directly to #1908: the parent becomes a converted epic, and the whole 7-task plan as its selected content yields a task-count `must-split`. It will then close through the epic no-commit lane (deliverable comment plus `aitm-deliverable-posted`), which Task 5's remote-effect admission now gates. Without a defined readiness input, the parent either deadlocks or is admitted through an undefined path.

3. **The publication-fence protection mechanism is unspecified and untested.** Review Focus 1 depends on non-owners being unable to change the pending publication record. `INVARIANT_MARKER_PATTERNS` supports `single`, `multi`, `count` and `advance` kinds (`scripts/task-tracker/lib/body-invariants.mjs:161-266`):
   - `single` only detects loss, so rewriting a payload from `pending` to `complete` would pass `findLostMarkers` (`:288-307`).
   - `advance` runs `validateMarkerAdvances` (`:309-326`), which `mutateIssueBody` calls even when `allowMarkerLoss: true` (`scripts/task-tracker/lib/issue-body-mutate.mjs:124-128`). That makes it the right mechanism.
   - However, `allowMarkerAdvance` is a plain string array (`issue-body-mutate.mjs:103`). Any in-process caller can name the marker unless the validator also requires the branded publication context.

   Task 2 Step 3 says only "Marker protection must allow only exact owner-authorized advances". Step 1 tests absent, stale, malformed and duplicate records, but not a well-formed forged advance. Consider a crash before the first write, with old low values still on the board. A forged `pending`→`complete` record (or a deletion through `allowMarkerLoss`) clears the fence, and admission then computes `story-ok`. That is exactly the failure Review Focus 1 names.

4. **There is an uncensused decomposition decision surface, and a test that will break.**
   - (a) `scripts/task-tracker/verbs/decompose-check.mjs` imports `evaluateIssueDecomposition`. It exits 0 for `must-split` when `waiver.ok` (`:33-35`) and prints `waiver: valid` (`:64`). This is a user-facing decomposition decision and waiver-acceptance producer. It doesn't appear in the adapter census, any task's Files list, or the no-waiver regression. Under the spec, every surface must derive the same current decision and no output may treat a prose waiver as success.
   - (b) `scripts/tests/unit/task-tracker/verbs/coverage-promote.test.mjs:438` asserts `BLOCKED:.*Decomposition Waiver`. Task 6 retires that remediation (`decomposition-plan-exit-guard.mjs:122`), so this suite will fail. It isn't in Task 6's Files or `Run:` lines, so the failure would first surface at the Test stage.

5. **Repository lint gates and shared generated inventories have no owner, and wave 4 has a parallel-write conflict.** `npm run lint` includes:
   - `lint:action-refusals`, which keeps a line-and-fingerprint inventory in `lib/action-decision/legacy-refusals.json`. That inventory pins eight `decomposition-plan-exit-guard.mjs` sites (lines 144–207) and scans the V1 verb files, including `verbs/start.mjs`, `resume.mjs` and `deliver.mjs` (`scripts/maintenance/lint-action-refusals.mjs:16-28`). It also checks emitted codes against `CODE_DEFINITIONS` in `contract.mjs`.
   - `lint:guidance-release`, which holds a digest manifest `instructions/aitm-guidance.release.json` over `instructions/aitm-guidance.yml`.
   - `lint:story-tags` (new test files need `@story`) and `lint:line-cap`.

   Who would touch what:
   - Task 4 edits start/resume and the catalog.
   - Task 5 edits deliver and adds typed refusals.
   - Task 6 rewrites the plan-exit guard's refusal and warning sites.

   Tasks 5 and 6 run in parallel in wave 4, and both are likely to regenerate `legacy-refusals.json` (and possibly the catalog and manifest). That contradicts the plan's "one owner per wave" rule. `verify-develop.mjs` runs only eslint, prettier and changed tests, so none of these gates fire during Develop. No child's `Run:` lines include them, nor `scripts/tests/integration/task-tracker/lib/action-parity.test.mjs`, which reads the inventory.

6. **The hook-time freshness contract is undefined.** Task 5 must compose a fresh assessment before every scoped Edit/Write/Bash early return, and the spec allows caches for display only. Today's gate uses a 30-second TTL sidecar cache for state and markers, does fresh ownership reads, and runs `gh` with 5-second timeouts (`scripts/task-tracker/source-edit-gate.mjs:21-25,63,392-431`). The plan doesn't specify:
   - which reads happen on each invocation (body, project item fields, forecast, pinned plan bytes);
   - their combined GraphQL cost and latency budget;
   - whether any cache keyed by input digest is allowed if it is revalidated cheaply;
   - how timeouts map to typed `indeterminate` results.

   With the allowed 6-agent fan-out, unbounded per-edit reads risk exhausting the rate limit. Once that happens, authority is unavailable and every scoped edit is denied across all agents. Left unspecified, an implementer will either make that failure mode likely or quietly reintroduce an admission cache, which Review Focus 3 forbids.

7. **Low: the census misses `scripts/migrate/`.** The census claims every production reference "under scripts/task-tracker, scripts/gh and scripts/maintenance", but the spec's audit has no directory limit. There are two more references:
   - `scripts/migrate/heal-options-co-pilot-bodies.mjs:172` calls `ensureIssueFieldDb` with an `estimate` field def (`:46`) and writes existing issue bodies through raw `gh issue edit --body-file` (`:142`).
   - `scripts/migrate/start-time-field.mjs:134` calls `writeProjectFieldValue` for start time.

   Both are probably exclusions: the first is a hard-coded one-off for another repository and copies board to body, and the second isn't Estimate. Even so, the census must classify them, or Task 7's drift check starts from an incomplete baseline.

8. **Low: Task 3's size label is inconsistent.** Task 3 is 12h but labeled `M`. The project size descriptions are M=6–10h and L=12–20h (`scripts/task-tracker/lib/reevaluate-estimate.mjs:17-19`). Split proposals and refinement will inherit the wrong Size. Task 7 at 5h also falls in the gap between S (3–4h) and M (6–10h).

## Required changes

1. Fold every addendum obligation into its owning `### Task N` section. That means Task 3's added files, writer IDs and cancel-plan/shelve/event-field steps; Task 5's remote no-commit files, interfaces and steps; the Task 1/2 `plan.content` contract; and either the shared wire contracts or explicit section-heading citations to them. Remove the contradictory guard-registry ownership between Tasks 4 and 5. Then confirm with `split-plan --dry-run` that each rendered child Scope contains its full file set before confirming proposals.
2. Define epic handling in the kernel contract:
   - add a closed readiness observation to `aitm.decomposition-input/v1` (materialized reviewed children, availability, digest), or name the separate overlay and its owner;
   - specify the status mapping for epic task/group signals;
   - add a status→capability table covering all six statuses, including the deliverable, completion and close capabilities of an epic.

   Add tests showing that a converted epic with unresolved readiness is refused deliverable/completion records, and that a converted epic with ready materialized children (the #1908 shape) can complete through the epic no-commit lane.
3. In Task 2, register `aitm-decomposition-assessment` and `aitm-decomposition-publication` as `kind: 'advance'` markers. Their `validateAdvance` must require the branded publication or refresh context, not just the marker name in `allowMarkerAdvance`. Add tests that each of these is refused:
   - a well-formed forged `pending`→`complete` rewrite through generic `mutateIssueBody` or the `issue-body` verb;
   - removal of the record under `allowMarkerLoss: true`;
   - a caller passing `allowMarkerAdvance: ['aitm-decomposition-publication']` without the branded context.
4. Add `verbs/decompose-check.mjs` to Task 6 and to the census. It must use the shared assessment, must not exit 0 on a prose waiver, and must report `pending`/`indeterminate`. Add `scripts/tests/unit/task-tracker/verbs/coverage-promote.test.mjs` to Task 6's Files and `Run:` lines, and update its waiver assertion.
5. Assign a single owner per wave for `lib/action-decision/legacy-refusals.json`, `CODE_DEFINITIONS` in `contract.mjs`, `instructions/aitm-guidance.yml` with `.release.json`, and `states/plan.mjs`/guard registration. Either serialize Tasks 5 and 6 on these files or move all their inventory and catalog edits into one of them. Add `npm run lint:action-refusals`, `npm run lint:guidance-release`, `npm run lint:story-tags` and `node --test scripts/tests/integration/task-tracker/lib/action-parity.test.mjs` to the verifiers of the tasks that touch these surfaces.
6. In Task 5, pin the hook-time freshness contract: the exact reads per invocation (preferably one combined issue body plus project item read), the timeout budget, the timeout → typed `indeterminate` mapping, and whether a digest-revalidated cache is allowed. Add a test asserting the call count for each admitted scoped edit.
7. Add `scripts/migrate/heal-options-co-pilot-bodies.mjs` and `scripts/migrate/start-time-field.mjs` to the census with a source-backed disposition for each, and widen the census's declared scope to all of `scripts/` outside tests.
8. Relabel Task 3 as `L`, or reduce its scope to fit `M`. Reconcile Task 7's 5h with a size band.

## Optional suggestions

1. Issue-lock re-entrancy crosses process boundaries through `ISSUE_LOCK_HELD_ENV` (`issue-mutator-lock.mjs:319-334`), while the plan rejects adopting the environment variable for the publication context. State that every registered writer runs in-process under the owner, or define subprocess behavior. Then add a test showing that a subprocess estimate writer under a held lock fails closed rather than deadlocking or minting a second owner.
2. Task 6 at 4h/S looks light once `decompose-check`, `coverage-promote`, refusal-inventory updates and converted-epic readiness are added. Re-estimate it during refinement.
3. "Parent issue vc:1–3 remain the exact targeted commands above" is ambiguous. Name the exact `Run:` lines or the issue's vc IDs.
4. In the representative kernel assertion, say that the fixture defaults to a non-XL size and an empty plan. Otherwise the 23h → `needs-decomposition-review` expectation can be confounded by XL or task signals.

## Decision

revisions-requested
