### Close blocked — no reachable delivery lane

This issue is complete on substance and **cannot currently be closed**. It is now blocked by
#1574. This comment supersedes the earlier revisions of itself and records the current, verified
position.

**Original cause.** `.ai-task-manager/task-tracker.json` declares
`fullAutoMerge.mergeMethod: "squash"`, and squash is confirmed as this repository's house style.
PR #1556 was merged from the GitHub UI as a **merge commit**: `ce9d066d` has two parents. The
verifier observed `merge`, the intent built from configuration said `squash`, and it refused
rather than writing a receipt describing a squash that never happened. That refusal was correct
and nothing here argues otherwise.

**#1562 shipped a reconciliation lane for exactly this — and it cannot reach this issue.**
The lane lives on the current-head external recovery path, which requires the local HEAD to equal
the pull request's accepted SHA (`9787ead9`). That commit predates the lane, so checking it out
means the code is not present to run. Advancing HEAD to obtain the code flips
`authority.headRelation` to `advanced`, routing to `validateHistoricalRecoveryPreflight`, which
refuses with `delivery-preflight:historical-intent` because this issue never recorded a delivery
intent — the original `deliver` refused before writing one.

**Every route was attempted and refused. None of this is inferred:**

| Route | Result |
| --- | --- |
| `deliver` current-head | lane code absent at the required HEAD |
| `deliver` historical | `delivery-preflight:historical-intent` |
| `close --force` | `close-delivery-receipt:missing` — force never reaches `refuseDeliveryGate` |
| no-commit spike lane | requires zero pull requests (`close-delivery-receipt.mjs`) |
| `close --as incorporated` | hard-scoped to convergence issue #1381 |

**Corrections to earlier revisions of this comment.** An earlier version stated this issue "is
closed with `--force`". That was wrong: the forced close was attempted, refused, and wrote no
state. A later version implied #1562 would unblock this issue. Also wrong: #1562's lane is
forward-looking and cannot rescue a pull request merged before the lane existed.

**What is nonetheless true about this delivery**, verified directly rather than through a receipt:

- Three `[#680]` commits are on `origin/trunk`: `96071a1b`, `d8b00fe3`, `9787ead9`
- The design spec is on trunk at `docs/superpowers/specs/2026-09-08-aitm-yml-pipeline-engine-design.md`
- Sandbox verification passed at `9787ead9` across lint, format:check, test:unit, test:integration and test:slow
- The Agent Review Gate recorded `result="pass"`, and @kburson approved the review

**Two things deliberately not done.** No delivery intent was synthesized to satisfy the historical
path, and this issue was not closed as *not planned*. Manufacturing evidence is the exact failure
this subsystem exists to prevent, and a not-planned disposition would be false — the work shipped.

**Path forward:** #1574 extends the reconciliation lane to a delivered pull request with no prior
intent, reconstructing that intent from observed provider and git facts only. #680 closes through
it on real evidence.

<!-- aitm-close-force-rationale -->
