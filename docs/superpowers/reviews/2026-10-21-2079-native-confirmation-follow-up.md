# #2079 native confirmation and follow-up diagnosis

The single bounded native #2039 plan-binding confirmation with the committed retention correction refused `decomposition-authority-unavailable: total-deadline`. No publication occurred. This does not establish native repair success. The three captured authority reads succeeded at 2026-10-21T03:41:44.286Z (418ms), 03:41:44.848Z (975ms), and 03:41:45.948Z (540ms). Recorded provider duration excludes some process startup and local validation. Capture remained enabled; no historical cloud task was queried for estimation.

The full fast suite found one test-file failure: `unit-lane-purity.test.mjs` correctly rejects the new snapshot test's real Git/subprocess fixtures in the unit lane. The other 975 fast files passed. The new test moved to the integration lane without changing its behavior; the six tests plus nine purity checks then passed (15/15). Original TDD receipts and review reports retain their historical paths and exact commit claims.

## Independent local diagnosis, verbatim

The remaining refusal has strong local evidence for repeated plan parsing, separate from the retention-scan correction.

| Read-only local probe | Observed |
|---|---:|
| Exact pinned plan at `42085d9b…` | 145,151 bytes; 36 tasks |
| `markdownViews(plan)` once | 8 ms |
| `extractPlanTasks(plan)` once | 173 ms |
| Root section selection | 161 ms |
| Ten root metadata lookups | 9 ms |
| Ten sequential pinned `git show` reads | 124 ms |
| Section selection for 12 retained replacement fragments | 2,209 ms; all selected successfully |
| 32 selections using the pinned plan and retained root metadata | 5,265 ms |

The last probe isolates parsing cost; it is not a replay of current child authority. The twelve fragments are retained operations, not complete current child bodies.

The amplification is explicit in source:

- `decomposition-delivery-readiness.mjs:54–61` selects a section separately for every relevant child.
- `decomposition-policy.mjs:258–260` unconditionally calls `extractPlanTasks` on the full plan.
- `decomposition-policy.mjs:105` calls `parseStoryIntent` with the full plan for each of its 36 tasks.
- `user-story-quality.mjs:188–194` reparses the full document before applying task bounds.

Thus 32 child selections repeat roughly 1,184 full-document Markdown passes, beyond root selection, initial readiness extraction and final assessment classification. This can consume the remaining total budget after the three successful remote reads. Root metadata lookup and ordinary pinned Git reads were much cheaper in these probes.

The total timer cannot interrupt synchronous parsing. The post-collection check at `decomposition-hook-authority.mjs:457` can therefore report `total-deadline` after all remote calls succeed and local parsing finishes.

**Next bounded probe:** replay the exact retained provider-shaped root/child/fence responses offline through the unchanged hook collector, with read-only phase timing for selected-plan loading, readiness and assessment. Keep capture enabled and retain the 5s/6s limits. Obtain current child bodies from retained response bytes if available; the field-only child snapshot cannot establish a faithful replay.

If confirmed, reuse Markdown views and extracted tasks within that single authority collection, preserving every child selection and provenance comparison. No persistent authority cache or deadline increase is needed.

No tracked files, review history, bindings or remote state were changed. The prior exact-commit code-review finding remains zero actionable findings; these measurements expose another pre-existing bottleneck and do not establish native delivery success.

## Author disposition

Accept the diagnosis; native confirmation is still refused. The retained telemetry does not store raw provider responses, so a faithful exact-current-child replay is unavailable. A synthetic 32-child plan of comparable size will exercise real local readiness with a conservative 3s local budget, reserving headroom within the unchanged 6s aggregate bound. The correction prepares immutable task structure once within each readiness invocation and preserves per-child selection, metadata, provenance, identity, rank and dependency checks. No persistent authority cache, cloud-history read, retry or deadline increase is proposed. Re-review this bounded plan and changed code before another native confirmation.

## Independent follow-up design review, verbatim

**Clean design assessment: the per-evaluation selector closure is the smallest supported correction. No blocking design finding.**

Source supports the diagnosis: `decomposition-delivery-readiness.mjs:54–61` invokes section selection for each relevant child, and `decomposition-policy.mjs:258–260` extracts every task each time. Extraction also reparses full-plan Markdown for each task’s Story Intent (`decomposition-policy.mjs:105–109`). The proposed closure removes the repeated extraction without broadening the parser change.

Preserve these implementation details:

- Capture one primitive plan string and keep parsed tasks private. Return fresh result objects containing strings; do not expose task references.
- Continue calling `selectStoryIntentTask` separately for each child. Its duplicate-field, conflicting-reference and ambiguous-heading checks must remain unchanged (`user-story-quality.mjs:313–360`).
- Keep existing `relevantChildren`, expected-heading checks and coverage reconciliation. Accepted-path and pinned-content equality remain enforced by `decomposition-wbs-coverage.mjs:135–157`.
- Create the selector inside each `evaluateSections` invocation. Never retain it across authority observations.

Two test cautions:

1. Comparing the closure with the ordinary API becomes partly circular once that API delegates to the closure. Retain explicit expected outputs/refusals and existing selector tests, including unchanged whole-plan text when selection is inactive or refused.
2. Time the optimized readiness evaluation separately from the 32 ordinary-API comparison calls; those comparison calls intentionally repeat parsing. A local budget well below six seconds establishes headroom, while native success still requires the captured confirmation with its existing aggregate deadlines.

Test newer plan bytes using a separately constructed selector, and mutate one returned result before a subsequent call to establish result isolation. Avoid eager extraction when there are no eligible children if that would introduce unnecessary work.

This remains a design assessment. The reported profiling was supplied by the parent; I did not rerun it. No tests, network requests, edits or mutations performed.

## Author disposition of design review

Accepted all preservation requirements and test cautions. The selector captures primitive string/private tasks and returns fresh results. Readiness lazily prepares it inside each invocation. The test uses independently specified outputs, refusal and newer-plan/result isolation. The measured regression failed at 6,100ms local readiness before production changes; the first green run passed all 12 new/existing readiness tests, with the complete budget test including two readiness evaluations taking about 760ms. Native confirmation and exact-commit implementation review remain pending.
