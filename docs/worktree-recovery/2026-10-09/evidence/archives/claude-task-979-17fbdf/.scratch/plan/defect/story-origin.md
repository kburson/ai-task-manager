Kind: code

Provenance: discovered on 2026-09-24 while delivering #1784 (post-delivery audit completion for the #1755 specification). The session had no sanctioned GitHub merge integration, so the operator merged PR #1785 manually with a merge commit while the authorized intent declared squash. `deliver` then refused, `close` pointed at `--reconcile-merge-method`, and that flag refused identically because its code path is unreachable when AITM authored the intent. #1784 is delivered on trunk but cannot be closed.

Relationships: blocks #1784. Generalizes the waived-with-disclosure pattern delivered by #1755. Touches the same delivery-authority core as #1755, #1562 and the `workflow-exception` catalog.

Operator direction: rejects a per-case code branch ("I do not want hundreds of backdoors and branches within the logic"); wants a generic, user-authorized override that "puts that evidence on the user not the code." To be built by Codex with an SAR on the spec and plan.

Size guess: L — delivery-authority core, record schema, receipt rendering, and the exception catalog.

Overlaps #1783 (user-authorized one-issue local-trunk close authorization). #1783 is the narrow lane-specific form of the same request; this issue proposes the general mechanism it should consume. Filed as a separate issue rather than folded into #1783 because the triggering lane differs — #1783 is no-PR local-trunk delivery, this is PR-based delivery whose authorized intent and observed merge topology diverge — and because the disclosure half (a receipt that renders `waived`, never as a pass) is not part of #1783's ask. Deliberately NOT filed as a second backdoor: if the reviewer prefers, fold both into one.
