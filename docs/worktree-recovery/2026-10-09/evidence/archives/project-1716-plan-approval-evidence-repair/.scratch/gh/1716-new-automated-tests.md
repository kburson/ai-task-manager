## New Automated Tests

- `scripts/tests/unit/task-tracker/verbs/plan-approve.test.mjs`
  - public CLI flag reaches the evidence-repair branch
  - complete later-stage evidence reconstructs Full-Auto approval and preserves Plan Adjustment bytes
  - repair audit satisfies the exact canonical Agent Review contract and rejects tampering
  - partial marker and audit writes retry without duplicate provenance
  - reconstruction time follows the complete evidence snapshot
  - unreadable issue history returns a typed refusal
  - audit distinguishes the historical `approval.plan` record from the revoked chain head
  - ordinary Full-Auto approval cannot be relabeled as evidence reconstruction
  - missing or contradictory authority predicates fail closed

_These focused regression cases pass as part of the recorded fast-lane verification for commit `eb871922`._
