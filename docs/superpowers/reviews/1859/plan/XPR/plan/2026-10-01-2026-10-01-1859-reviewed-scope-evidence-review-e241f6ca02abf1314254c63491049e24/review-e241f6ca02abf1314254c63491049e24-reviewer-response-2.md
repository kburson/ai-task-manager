<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-e241f6ca02abf1314254c63491049e24"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-10-01-1859-reviewed-scope-evidence.md"
artifact_commit: "4449fc6e2689b7573b6fb8000f19fd680ca57079"
artifact_blob: "d501902d51c4b5862aa3313d2d3040692c490d45"
artifact_digest: "sha256:6a8d2e79b672b4cee2019f15e9bb9325b39457d7976ab33824c3fcafa4c6dc7b"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:78e1e126efa721437702af97a20e6d900e2af0940e565273ddfdaae8f11322e9"
  identity_source: "runtime"
started_at: "2026-10-01T18:55:57.033Z"
submitted_at: "2026-10-01T19:02:49.403Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I re-reviewed the revised plan at artifact commit `4449fc6e` against author response 1 and
the source. All five required changes and both actionable optional suggestions from turn 1
are resolved:

1. **Guard result key.** Task 4 now has the guard return `refusals`. I verified the author's
   terminology correction against `scripts/task-tracker/lib/guard-registry.mjs`:
   - `invoke` produces the internal `typedRefusals` (lines 245-257).
   - `runGuards.consume` (lines 300-306) flattens these into the public `refusals`
     entries as `{id, reason, ...typed, blockers}`.
   - `runGuards` returns `{ok, status, refusals}` (lines 327-330).

   The plan's assertion target (`runGuards(...).refusals`) is correct.
2. **Contract phase.** I verified the phase claim against `contract.mjs`.
   `decisionBlocked` definitions carry `phases: ['evaluation']`, and indeterminate
   definitions include `evaluation` (lines 80-98). The plan's "evaluation phase, registered
   only in Test's exit slot" wording is therefore consistent with the contract vocabulary.
3. **Promote mapping.** `'test-exit-reviewed-scope': 'reviewed-scope-refused'` is added to
   `REFUSAL_ID_TO_STATUS`. Verb-path tests now assert that no delegation or lower mutation
   happens.
4. **Promote consumer.** Promote is now an explicit `deriveAndRescan` consumer in Task 5. It
   consumes the returned decision directly, without a second `evaluateForBody`, and has
   integration coverage for initial blocked, retry non-ready, and readback non-ready.
5. **Completeness labels.** The completeness guard converts to a registered typed code
   `test-scope-incomplete` with a per-line `args.label`. This survives `evaluate.mjs`'s
   typed projection (lines 486-493), which drops `blockers`, and still retains raw
   `reason`/`blockers` for legacy consumers. The fixture now comes from real `runGuards`.
6. **Explicit `projectDir`.** `deriveAndRescan` now requires `projectDir` and passes it as
   `cwd` to both HEAD reads; all three consumers supply it.
7. **File map and return shapes.** The file map now names `contract.mjs`,
   `legacy-refusals.json`, `promote.mjs`, `move-state.mjs`, the `guard-registry.mjs`
   inventory comment and `guard-parity-mid-stages.test.mjs`. `warnings` is retained in both
   normalization return shapes.
8. **Synchronous mutate.** The synchronous-mutate rule is stated explicitly in Task 3.

I found no new blocking defects in the revised text.

## Findings

1. Minor (non-blocking): Task 5 changes the refusal site in
   `lib/test-exit-pre-close-completeness-guard.mjs` (currently line 38). That site is
   fingerprinted in `lib/action-decision/legacy-refusals.json` (entry
   `test-exit-pre-close-completeness`), and `scripts/maintenance/lint-action-refusals.mjs`
   compares site fingerprints (line 214). Task 5's file list includes `contract.mjs` but not
   `legacy-refusals.json`, and Task 5 does not run `npm run lint:action-refusals`. The
   inventory drift would therefore surface only at the final `npm run lint`, not at the Task
   5 commit. The overall file map does list `legacy-refusals.json`, so this is a sequencing
   gap, not a missing deliverable.

## Required changes

None

## Optional suggestions

1. Add `lib/action-decision/legacy-refusals.json` to Task 5's file list, and add
   `npm run lint:action-refusals` to Task 5's re-run step. This keeps the completeness
   guard's frozen inventory regenerated in the same commit that changes its refusal site,
   so each task commit stays lint-clean.

## Decision

accepted
