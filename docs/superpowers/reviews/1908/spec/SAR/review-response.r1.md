# SAR response r1 — #1908

- Reviewer model: `gpt-6-astra`; requested reasoning effort: `medium`.
- Review mode: native single-agent review/revision loop; same agent reviews and revises.
- Reviewed input: `spec.r0.md`, SHA256 `770088be66278055a330eab0acab556f772508bb622bcca5d1c3b66fd4b2e5da`.
- Initial specification commit: `c8851f33b7a46bc5a5053d73b6ac8b52762c0f6e`.
- Source baseline: `ec15d0ee80255cff3e1327eec28668bfe1d2e861`.
- Issue authority: live read-only `gh issue view 1908 --json title,body,url`, 2026-10-11.
- Verdict: **revise**. Five actionable findings; all addressed in `spec.r1.md`.
- Revised output: `spec.r1.md`, SHA256 `8bb96dad61c12be80a0741eb072e1d1897f5b2a84fafd086f6a96388144b2d83`.

## Findings and dispositions

### F1 — P1: pending intent can be lost through refresh

Input evidence: r0 lines 73, 79–97 allow healing from complete current values but do not explicitly require reading and retaining an unresolved publication intent. A crash after pending publication and before any estimate effect leaves old board/body values mutually consistent; recomputing solely from them can admit implementation despite the intended threshold-crossing revision.

Source evidence: `scripts/task-tracker/lib/estimation/plan-estimate-authority.mjs:127–187` writes appendix, board estimate, board size, body, forecast and ready marker separately. `scripts/task-tracker/verbs/inflate-estimate.mjs:228–300` similarly has separate comment/board/body effects and swallowed projection failures. Current-value agreement is not evidence that all operation effects occurred.

Correction: require a protected publication intent with effect set and confirmations; make refresh consult it before granting capability; permit only confirmed missing-assessment repair, exact writer resume, or explicit reconciled supersession. Add the before-first-write interleaving test.

Disposition: **addressed** in r1 “Admission and recovery decisions” and final recovery-test paragraph. No new general transaction subsystem is required.

### F2 — P1: status names do not define capability outcomes

Input evidence: r0 lines 50–61 list advisory, mandatory, pending, indeterminate and epic statuses; lines 103–115 say unresolved decomposition blocks implementation without distinguishing advisory review. This permits an implementation to block a 23-hour story solely from the retained 16-hour review signal or to require materialized children merely for an epic inspection binding.

Source evidence: `scripts/task-tracker/lib/decomposition-policy.mjs:13–19,119–175` has a 16-hour advisory signal distinct from >=24-hour must-split; `scripts/task-tracker/lib/decomposition-plan-exit-guard.mjs:201–207` allows advisory review with a warning. Its lines 153–199 implement epic WBS readiness under the existing must-split boundary. Issue AC1 requires 23 not trigger the mandatory estimate condition; AC4 retains bounded-story/epic behavior.

Correction: define each status's implementation/recovery consequences, identify advisory output as advisory, retain independent must-split signals, and state the affected epic readiness boundary.

Disposition: **addressed** in r1 “Admission and recovery decisions”; capabilities remain intersected with existing lifecycle/ownership/containment gates.

### F3 — P2: generic writer audit lacks concrete known effectful callers

Input evidence: r0 lines 20–34 defer generic writers to a later audit and lines 134–136 name only a subset of real adapter suites. A future plan could omit direct project tether and project migrations while claiming the listed inventory was complete.

Source evidence: `scripts/gh/project-tether.mjs:72–82` accepts and forwards `--estimate`; `scripts/gh/lib/project-tether.mjs:230–236` publishes it. `scripts/gh/migrate-project.mjs:129–151` and `scripts/maintenance/bind-issues-to-new-project.mjs:155–180` replay field-sync entries including estimates. `scripts/task-tracker/issue-field-db.mjs:137–164` is a pure renderer; it should not itself acquire transport authority.

Correction: include these existing-issue publication callers in the minimum adapter map, classify renderers/encoding/history separately, retain a bounded full call-site audit, and map real adapter tests rather than classifier-only assertions.

Disposition: **addressed** in r1 “Minimum concrete adapter and verifier map”. Initial creation remains outside revision scope and is assessed on continuation. The final plan must still pin additional callers or source-backed exclusions.

### F4 — P1: executable hook bypass/error behavior is not an explicit verifier

Input evidence: r0 lines 113–115 and 136 require actual gates and mixed targets, but do not identify warm-cache, chore-mode or executable exception-pass-through behavior. Testing only the evaluator could leave a production escape path.

Source evidence: `scripts/task-tracker/source-edit-gate.mjs:393–432` retains cached body/deep-dive data; lines 530–548 skip signal acquisition in chore mode; lines 639–658 pass through unexpected hook errors. `scripts/task-tracker/activity-guard.mjs:349,363–365` returns early for chore mode or already-allowed activity classes.

Correction: put fresh decomposition admission before product-effect early returns and require executable-boundary error/refusal tests, without blocking exact documentation/read recovery paths.

Disposition: **addressed** in r1 adapter map and final test paragraph. Scope is decomposition authority for recognized product mutation; this does not claim arbitrary shell-bypass protection.

### F5 — P2: nested publication adapters could reacquire locks or double-publish

Input evidence: r0 lines 77–85 require issue-scoped operations and preservation of existing locks while composing multiple writers; no ownership rule prevents nested helpers from independently starting the same operation.

Source evidence: `scripts/task-tracker/verbs/refine.mjs:279–288` invokes tethering as a nested writer; `scripts/task-tracker/lib/estimation/plan-estimate-authority.mjs:203–216` already wraps publication in a forecast logical-record claim, and `scripts/task-tracker/lib/estimation/runtime-adapter.mjs:764–792` composes nested appendix/board/body effects.

Correction: one publication owner passes context through nested helpers; final plan pins lock acquisition order and tests composition. Preserve the existing claim machinery.

Disposition: **addressed** in r1 final implementation constraints and adaptive adapter verifier row.

## Full review coverage and limits

Read the entire input against live issue scope/AC/verifiers and inspected actual policy, waiver parser, Plan-exit guard, inflation, adaptive and compatibility estimation, refinement, re-evaluation, tether/migration, source-edit/activity and typed-session/Explain sources. Confirmed truthful estimate recording, state/WIP/history preservation, continuation, epic distinction, source policy reuse, incident-history handling and no agent-waiver admission are specified. Source baseline limitations are accurately described; the task remains broad enough that honest Refine sizing may require reviewed children.

No product source edits, implementation tests, Git staging/commits/pushes, issue mutations or lifecycle actions were performed. This response grants no peer protocol acceptance, Refine/spec/Plan approval or implementation proof.
