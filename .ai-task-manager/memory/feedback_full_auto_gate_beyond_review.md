---
name: full-auto-gate-beyond-review
description: 'Full-Auto human-gate audit-comment requirement extends to every standalone human-approval gate (approve verb, plan-approve), not just the Review checkbox tick'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 7dfc179a-dd63-409b-8a8a-4801e182a4bb
---

The Full-Auto human-gate protocol ([[feedback_full_auto_review_audit]], [[feedback_full_auto_tick_review_box]]) is not limited to the "Passed final human review" checkbox on Test→Review. It applies separately to every standalone human-approval verb invocation performed without a human present:

- `plan-approve` (Plan→Develop gate)
- `approve` (Review→Done gate) — confirmed distinct from the checkbox tick; `close` refuses to move to `done` without the `aitm-review-approved` marker even if the checkbox is already ticked.

**Why:** Each of these is itself a human-approval action being auto-performed, not just evidence of one. Validated twice in the same session (#679 and #678): both needed two separate audit comments — one for the checkbox tick, one for the `approve` verb call — plus the same treatment for `plan-approve` at Plan→Develop.

**How to apply:** Before running `plan-approve` or `approve` in a full-auto/no-human session, post a dedicated `gh issue comment` audit note first (distinct from any Test→Review promotion comment), documenting the no-human-present rationale for that specific gate. Do this for every gate crossing, not just once per issue.

Also observed twice (once for #679, once for #678): `node bin/aitm.mjs close <N>` can print what looks like a fatal refusal (`⛔ Refusing to move #N to done...`) while the embedded log lines (`[human-reviewer-audit]`, `[unpark]`) show the move actually succeeded — a false-negative in the close wrapper's error-detection, not a real failure. Always independently verify with `gh issue view <N> --json state` and `node bin/aitm.mjs reconcile backfill <N> --dry-run` before treating a `close` failure message as real; don't blindly retry.
