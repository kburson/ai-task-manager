Refs #1488

Governed delivery was structurally unreachable from the Review column. `npx aitm deliver #N` refused every approved issue with `delivery-preflight:timer-not-running`, and no sanctioned verb could produce the state it required.

## Root cause

Three invariants were mutually unsatisfiable:

- `lib/delivery-preflight.mjs:76` requires `timerState === 'running'`.
- `lib/delivery-preflight.mjs:77` requires `projectState === 'Review'`. The `deliver` self-doc states the same pairing.
- `task-tracker.mjs:303` re-invokes `verbReview` on any bind whose board state is `review`, and `verbReview` pauses the timer.

The specific defect was in `verbStart`. It awaited `verbResume(ctx)` and then unconditionally re-issued `ctx.resumeReviewActionsAfterBind(...)`. The delegated `verbResume` had already made that decision through `wakeReviewResidents`, which returns early when `ctx.verb === 'start'`; `verbSwitch` guards the identical call with `ctx.verb !== 'start'`.

Two of the three bind call sites already encoded the exemption. `verbStart`'s second call defeated both, re-ran the Review action, and re-paused the session the bind had just opened.

## Fix

Remove the redundant wake from `verbStart`, leaving `wakeReviewResidents` as the single decision point, and export it so the exemption is testable behaviorally rather than by grepping source.

`scripts/tests/unit/task-tracker/verbs/review-state-action.test.mjs:175` asserted that `start.mjs` contained the defective call, pinning it in place. That assertion is reworked to pin the corrected invariant, and behavioral dispatch coverage is added for both directions: `start` performs no wake, while `resume` and `rebind` still do.

The delivery preconditions are deliberately left intact. The defect was that no sanctioned verb could produce the required state, not that the requirement was wrong.

## Verification at `e9fec6f7`

- Focused verifier 22/22; full lanes green in the governed Test sandbox
- `npm test`, `npm run test:slow`, `npm run lint`, `npm run format:check` all exit 0
- End-to-end: `npx aitm start` on a Review-state issue now leaves `entryStartTs` set, and `deliver` advances past the timer gate

A second commit realigns three line numbers in the timing-emitter characterization baseline, which pins emitter call sites by exact line and shifted when an explanatory comment was added to `resume.mjs`. Each shifted line was confirmed to still contain the same emitter expression; no emitter behavior changed.

## Impact

Unblocks #1485, and behind it #1226 and the remaining #1220 child chain.
