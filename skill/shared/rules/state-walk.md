<!-- aitm-skill-version: 1.2.0 -->
<!-- aitm-rule-id: state-movement -->

# State movement — compatibility pointer

Emit `aitm-skill-loaded:rules/state-walk:1.2.0` on first load. The current `npx aitm explain #N --json` result and the executed verb own readiness and revalidation. Human detail: `../references/state-walk-detail.md`.

## 8-state model

Backlog → Refine → Ready for Planning → Plan → Develop → Test → Review → Done. Use `/task refine` for Backlog entry, `/task plan` for JIT Plan entry, `/task promote` for one forward step, `/task demote --rework` for Test/Review rework, and `/task close` for Done. No direct `move-state.mjs <N> <state>` stage jump. `/task discover` is pre-issue ideation; story authoring and Plan approval use `rules/user-story-quality.md`.

## Decision gates

- Forward one state. Reads current state, picks legal next state, runs the gate.
- `/task promote` from Plan refuses unless the current Plan approval and transition guards pass.
- Plan → Develop requires current story intent, estimate, source binding, and `/task plan-approve` evidence. A decomposition guard may refuse; do not relabel work or bypass it.
- Only a current explicit `aitm.workflow-exception/v1` GitHub record may alter a named gate. Its preflight is read-only; execution revalidates. `waived` is not `passed`.
- `/task ac-stamp <label>` and `/task test` are Develop/Test-stage helpers, not state-walking verbs. Neither advances the kanban board on its own the way `promote`/`demote`/`close` do. Test runs declared commands at an exact clean SHA; Review reuses the receipt.
- Board ↔ local field-DB disagreement. Run before any other verb on a drifted issue. Use `/task reconcile`, then re-query the decision; a remembered state is not authority.
- Review approval and Close are separate. After a refusal, drift, human decision, or external merge, query Explain again before choosing the next lifecycle action.
