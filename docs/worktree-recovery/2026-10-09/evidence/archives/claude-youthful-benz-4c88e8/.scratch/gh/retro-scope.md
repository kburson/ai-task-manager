#1562 shipped a merge-method reconciliation lane, but it can only be reached on the current-head external recovery path — which requires the local HEAD to equal the pull request's accepted SHA. For any issue whose pull request was merged BEFORE the lane existed, that accepted SHA predates the lane code, so checking it out means the lane is not there to run. Advancing HEAD to obtain the code flips `authority.headRelation` to `advanced`, routing to `validateHistoricalRecoveryPreflight`, which refuses with `delivery-preflight:historical-intent` unless a prior non-external delivery intent exists.

Issues stranded by the original defect never got that intent, because the original `deliver` refused before writing one. The result is a closed loop: the fix cannot reach the cases that motivated it.

Verified live on #680 (2026-09-10). Every existing route is refused:

| Route | Refusal |
| --- | --- |
| `deliver` current-head | lane code absent at the required HEAD |
| `deliver` historical | `delivery-preflight:historical-intent` — no prior intent |
| `close --force` | never reaches `refuseDeliveryGate`; `close-delivery-receipt:missing` |
| no-commit spike lane | requires zero pull requests (`close-delivery-receipt.mjs`) |
| `close --as incorporated` | hard-scoped to convergence issue #1381 |

**In scope**

- Allow the historical recovery path to accept a merge-method reconciliation when no prior intent exists, provided the pull request is merged, its merge commit is reachable from the resolved trunk ref, and the observed topology is unambiguous.
- The reconstructed intent must be derived from observed facts — the pull request record and the merge commit — and never from operator assertion. Same honesty contract as #1562: the declared method is accepted only when live topology agrees.
- Require the explicit reconciliation flag and a substantive reason, exactly as the existing lane does. This must not become an implicit fallback.
- The reconciliation record must state that the intent was reconstructed retroactively, so the receipt is not mistaken for one written at delivery time.

**Out of scope**

- Relaxing `delivery-verification.mjs` merge-method equality. Unchanged, again.
- Any path that accepts an operator-supplied intent, merge method, or SHA as evidence.

**Explicit non-goal:** this must not become a general "close anything" escape. It exists for delivered work whose evidence is recoverable from the provider and from git, and it should refuse everything else.
