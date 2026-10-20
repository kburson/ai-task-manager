# #2039 specification SAR — round 4

- Reviewer: persistent native SAR agent, requested `gpt-6-astra` / `high`.
- Exact input: [spec.r3.md](spec.r3.md), SHA256 `66d7fd009ade7a76a5c09e45191823b4eab259ce6eb616276b60350c57a2ee91`.
- Result: revise five actionable findings, F10–F14; all addressed in [spec.r4.md](spec.r4.md), SHA256 `4929d6173286f6da48426796071a5f8dd63fc2395f801e25eb34324e9240c247`.

## F10 — Complete the target field baseline and final snapshot verification

**Severity:** important.

**Finding:** Native body edit IDs do not version title, assignment or configured project fields. R3 snapshots those governance values but does not explicitly retain their baseline, and its final optional convergence observation could leave a new external comment undetected while claiming full snapshot agreement. The parent independently requested title/field coverage.

**Evidence:** The provider experiment is per body/comment node and supplies no aggregate story version. Existing preflight and move-state code separately observe assignment/Status; `log-issue-time.mjs` projects configured fields independently. The owner's rule covers all cached issue contents, including unchanged external comments.

**Disposition:** addressed. Cache title and canonical configured workflow/ownership field values, compare them in the same bounded snapshot, and stage authorized title edits into the final issue update where supported. After the final issue write, require a complete expected-vector/inventory/title/ownership/required-field verification; combine it with read-back when possible or explicitly charge final snapshot pages. Expected values replace only declared confirmed effects. Any other change/addition/deletion refuses completion. No per-tiny-edit reads were added.

## F11 — Separate timing ingestion from publication and preserve real work during partial transitions

**Severity:** important.

**Finding:** A single timing cursor can incorrectly mark locally ingested events as published or replay them after a partial saga. Describing transition rows as provisional can also cause a reader to discard real accrued work rather than only withholding lifecycle-completion authority. The parent independently flagged the latter distinction.

**Evidence:** `gh-timing-comment.mjs` is the current cloud append/read path, while `scripts/gh/log-issue-time.mjs` uses `timing-rollup.mjs` and separately projects board/body rollups. `move-state-core.mjs` completion probes depend on transition-bound timing pairs. These consumers must agree on event persistence and transition commitment without changing historical duration semantics.

**Disposition:** addressed. Persist separate ingestion/publication cursors and event IDs. Local ingestion atomically checkpoints the working log; verified timing upsert advances the publication cursor, while aggregate transition completion remains separate. Explicitly preserve actual accrued event/duration evidence while withholding unsupported entry/exit completion inference. Map rollup, ladder, report/field projection and completion readers, with restart/double-count/provisional-pair tests. Correct the precise `scripts/gh/log-issue-time.mjs` source path.

## F12 — Bind a staged estimate to the current working candidate

**Severity:** important.

**Finding:** Snapshot equality alone cannot detect that the owner changed the local plan or Refine inputs after generating an estimate. The wholesale scope revision omitted the old design's explicit input-correlation contract.

**Evidence:** `executeAdaptivePlanEstimate` builds a forecast from a particular Refine/plan/rubric input set, and `forecast-model.mjs` records those outputs. Local caching introduces a longer period before publication, increasing the opportunity for local inputs to change without cloud drift.

**Disposition:** addressed. Require the forecast input digest to match the working plan/Refine/model/policy inputs and the transition snapshot to match retained cloud baselines. A stale local estimate refuses until explicitly recalculated from local evidence. Cloud reconciliation cannot hydrate estimation input or silently justify an obsolete forecast.

## F13 — Revalidate the whole snapshot before resuming remaining effects

**Severity:** important.

**Finding:** R3's wording that recovery inspects only uncertain resources could permit later writes using stale authority for unchanged/read-only blocks. A new external comment or reassignment during interruption must still trigger the owner's diff/discussion rule.

**Evidence:** The saga can stop after timing/Status while its final body remains unsubmitted. The parent's native probe does not supply atomic or long-lived preconditions, and the owner explicitly requires comparison of all cached contents at the upsert boundary.

**Disposition:** addressed. Read-only uncertainty inspection may use saved node IDs. Before any remaining mutation, revalidate the complete bounded snapshot/inventory and native ownership/admission against original baselines plus confirmed declared effects. Charge that resumed boundary's snapshot/admission allowance; do not disguise it as one uncertainty read. Preserve the same frozen batch, confirmed effects and one-attempt limits, with no replay or new event generation.

## F14 — Correct scope and ownership guarantee limits

**Severity:** moderate.

**Finding:** R3's broad statement that issue mutation was out of scope conflicted with the explicitly authorized diagnostic comment mutations. Its unique-session registry language also needed to distinguish cooperating shared-registry sessions from independent machines that GitHub assignment cannot lock.

**Evidence:** The completed probe records diagnostic comment creation/edits and one specifically authorized older-history deletion. The source issue lock and planned local registry operate in a shared filesystem boundary; provider mutation inputs supply no independent cross-machine lock.

**Disposition:** addressed. Exclude production workflow/issue-body mutation while acknowledging the completed diagnostic exception and its limits. State the registry's cooperation boundary, require explicit cache/claim handoff to another host and refuse automatic acquisition when shared ownership identity is unavailable. Do not claim a server-side lock or owner acceptance of atomic race safety.

## Review result and limits

All five findings are addressed in r4; a fresh full-document terminal reread remains required. The earlier F1–F9 are preserved historical findings against a superseded publication architecture. Relevant principles (dispatch interception, local provenance, crash recovery, guard preservation and independent budgets) remain in the new design, while per-effect body validation and numeric version policy are deliberately removed under direct owner instruction.

This round performed source/document inspection and targeted Markdown formatting only. No live call, product test, issue-state action, Git operation or implementation change was performed by the reviewer.
