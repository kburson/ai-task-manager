## Task 6: Shared direct Plan, Explain and pull-next policy

Files:

- Modify `scripts/task-tracker/lib/epic-children-gate.mjs` and `scripts/gh/lib/wave-admission.mjs`.
- Modify `scripts/task-tracker/verbs/promote.mjs` and `pull-next.mjs`.
- Modify `scripts/task-tracker/lib/action-decision/observations.mjs` and `action-decision/promote.mjs` with the registered guard observation seam; `verbs/explain.mjs` remains read-only.
- Extend `scripts/tests/unit/task-tracker/verbs/pull-next-verb.test.mjs`, `verb-plan-promote.test.mjs`, `scripts/tests/unit/task-tracker/lib/action-decision-v2.test.mjs` and `scripts/tests/integration/task-tracker/lib/guidance-explain.test.mjs`.

Remove authorized-mode active-sibling shortcuts by routing observations through the shared evaluator; preserve legacy sequential paths. Authorized candidate selection uses rank then issue ID, while ungranted opted-in ranks retain strict lower Done plus sequential budget. Explicitly preserve actual board state separately from CLOSED rather than using coercion for the strict rule.

Acquire common parent lock before child lock in the outer direct Promote wrapper and pull-next. Pass verified lock context into nested pure runners; never acquire parent beneath child. Revalidate at R4P-to-Plan and Plan-to-Develop, retaining all existing story/forecast/dependency/ownership gates. Explain consumes the same observations read-only and never converts its snapshot into execution authority.

Run identical-snapshot parity fixtures through direct Plan, direct Promote, pull-next and Explain public seams; assert typed ready/refusal equality and zero Explain side effects. Run fixtures for ready, revoked, stale, missing, wrong-rank, unresolved dependency and isolation collision. Add end-to-end first-peer Done, worker-to-orchestrator handoff and exact refresh scenarios while another peer continues. Run vc:1 and vc:2 plus new integration suites.

