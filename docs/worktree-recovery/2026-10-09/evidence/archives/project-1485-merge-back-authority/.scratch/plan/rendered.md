## User Story

As a maintainer delivering an approved issue from the Review column
I want to bind and start the timer on a Review-state issue without re-running the review action
So that governed delivery can satisfy its running-binding precondition instead of being structurally unreachable

## Scope

Make `npx aitm start #N` bind and open a timing session on a Review-state issue without re-invoking the Review action, so `npx aitm deliver #N` can satisfy its running-binding precondition.

`verbStart` delegates to `verbResume`, which already decides whether to wake Review resident work and deliberately declines to do so for the `start` verb. `verbStart` then calls `resumeReviewActionsAfterBind` a second time, unconditionally, defeating that decision. `verbSwitch` guards the same call with `ctx.verb !== 'start'`. Two of the three bind call sites already encode the intended exemption; `start.mjs` is the sole violator.

In scope: removing the redundant unconditional wake from `verbStart` so the wake decision lives in exactly one place, and updating the source-presence assertion in `scripts/tests/unit/task-tracker/verbs/review-state-action.test.mjs` that currently pins the defective call into place.

Out of scope: changing what the Review action does, relaxing any delivery precondition, altering `verbResume`'s or `verbSwitch`'s existing exemption logic, and changing the Review board state or its timer-pause semantics for any other verb.

## Reproduction

1. Take any issue through to the Review column and record review approval (`npx aitm approve #N`).
2. Run `npx aitm deliver #N`. Observe the refusal `delivery-preflight:timer-not-running` (exit 1).
3. Run `npx aitm start #N` to open a timing session. Observe that it prints the full Review output and ends with `Review #N: task paused for human approval.`
4. Inspect `.tmp/aitm/state/task-tracker-state.json`. Observe `"entryStartTs": null`.
5. Repeat with `npx aitm resume #N`. Observe the same re-run and the same paused result.
6. Re-run `npx aitm deliver #N`. Observe the identical `timer-not-running` refusal.

There is no flag on `deliver` and no environment override for the check, so delivery cannot be reached from Review through sanctioned verbs.

## Root Cause

Three invariants in the shipped code are mutually unsatisfiable.

1. `scripts/task-tracker/lib/delivery-preflight.mjs:76` refuses unless `binding.timerState === 'running'`.
2. `scripts/task-tracker/lib/delivery-preflight.mjs:77` refuses unless `issue.projectState === 'Review'`. The `deliver` self-doc states the same pairing: the target "must remain open in Review with a running binding."
3. `scripts/task-tracker/task-tracker.mjs:303` defines `resumeReviewActionsAfterBind`, which re-invokes `verbReview` whenever the bound issue's board state is `review`. `verbReview` flushes a review timing row and pauses the timer.

`deliver` derives `timerState` from the recorded session (`scripts/task-tracker/verbs/deliver.mjs:99`: `state?.entryStartTs ? 'running' : 'paused'`), so a paused session is indistinguishable from no session.

The specific defect is in `verbStart`. `scripts/task-tracker/verbs/start.mjs` awaits `verbResume(ctx)` and then unconditionally awaits `ctx.resumeReviewActionsAfterBind(...)`. The delegated `verbResume` has already made that decision correctly: `wakeReviewResidents` in `scripts/task-tracker/verbs/resume.mjs:137` returns early when `ctx.verb === 'start'`. `verbSwitch` guards the same call the same way at `scripts/task-tracker/verbs/switch.mjs:290` with `ctx.verb !== 'start'`.

Two of the three bind call sites therefore already encode an explicit "`start` must not wake Review residents" exemption. `verbStart`'s own unconditional call defeats both, re-runs the Review action, and re-pauses the timer it just started.

`scripts/tests/unit/task-tracker/verbs/review-state-action.test.mjs:175` asserts that `start.mjs` source matches `/resumeReviewActionsAfterBind/`, which pins the defective call in place. It is a source-presence smoke assertion, not a behavioral one.

## Fix Direction

Remove the redundant unconditional `resumeReviewActionsAfterBind` call from `verbStart`, leaving the wake decision solely to the delegated `verbResume`, which already exempts the `start` verb. This restores the exemption that `resume.mjs` and `switch.mjs` both already implement, rather than adding a new special case.

Update the source-presence assertion at `scripts/tests/unit/task-tracker/verbs/review-state-action.test.mjs:175` so it pins the corrected invariant — the wake is reachable through the dispatcher for `resume`/`rebind` and is not re-issued by `verbStart` — instead of pinning the defective call.

Add behavioral coverage proving that binding via `start` to a Review-state issue leaves `entryStartTs` set, and that a genuine `resume`/`rebind` of a Review-state issue still runs the Review action.

Do not weaken `delivery-preflight`'s running-binding or Review-state requirements; both are legitimate delivery evidence gates. The defect is that a sanctioned verb cannot produce the required state, not that the requirement is wrong.

## Out of Scope

- Relaxing or removing `delivery-preflight`'s running-binding or Review-state requirements.
- Changing what the Review action validates, or its timer-pause behavior for `resume`/`rebind`.
- Altering the existing `start` exemptions already present in `resume.mjs` and `switch.mjs`.
- Any change to #1485's merge-back branch-authority repair, which is complete and approved.
- Hand-editing recorded timing state to synthesize a running session.

## Story Origin

- **kind**: code
- **discovered-during**: #1485
- **discovery-context**: `npx aitm deliver 1485` refused with `delivery-preflight:timer-not-running` after review approval; every attempt to open a timing session re-ran the Review action and re-paused the timer
- **scope-boundary**: AITM bind-verb defect blocking governed delivery from Review; independent of #1485's merge-back branch-authority repair

## Plan Metadata



## Pickup Directive — MANDATORY, DO NOT SKIP

> Follow: `.ai-task-manager/templates/pickup-directive.md`

## Acceptance Criteria

- [ ] `verbStart` does not invoke `resumeReviewActionsAfterBind` itself; the wake decision is made in exactly one place and continues to exempt the `start` verb. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Binding with `start` to an issue whose board state is `review` leaves a running timing session rather than a paused one. <!-- aitm-verified vc-list="vc:1" -->
- [ ] `resume` and `switch` retain their existing Review-wake behavior for every verb other than `start`. <!-- aitm-verified vc-list="vc:1" -->
- [ ] The Review action still runs on a genuine `resume` or `rebind` of a Review-state issue. <!-- aitm-verified vc-list="vc:1" -->

## Verification Commands

- [ ] `node --test scripts/tests/unit/task-tracker/verbs/review-state-action.test.mjs` <!-- id=1 -->
- [ ] `node scripts/task-tracker/verify-develop.mjs` <!-- id=2 -->
- [ ] `npm test` <!-- id=3 -->
- [ ] `npm run lint` <!-- id=4 -->
- [ ] `npm run test:slow` <!-- id=5 -->
- [ ] `npm run format:check` <!-- id=6 -->
- [ ] `git log --oneline -1` <!-- id=7 -->

## Definition of Done
<!--
Each item below MUST be individually verified by running the declared
verifier. Do not bulk-check. Do not preemptively check. The visible checkbox
is the sign-off; the hidden `aitm-dod-evidence:<key>` marker is the evidence
trail. `/task check` refuses to tick a stampable Functional DoD item without
its marker; run `/task dod-stamp <key>` to produce one. The two derived keys
(`acs`, `checkboxes`) are auto-stamped by `/task close` from the body itself.
See `skill/shared/rules/functional-dod.md` for the full contract.

Lifecycle items are verified during Review. Housekeeping items are finalized
during Close; their separate headings make the owning workflow phase explicit.

Kind-aware items (#681): append a `dod:kinds` HTML-comment annotation to scope
an item to a set of issue kinds. `exclude="spike,research"` renders the item for
every kind EXCEPT those listed; `include="code"` renders it only for the listed
kinds; an item with no annotation applies to every kind (the default). The
`tests` item is excluded for the no-code kinds `spike` and `research`, which ship
findings rather than code and would otherwise carry a test-suite DoD item and a
`npm run test:all` verification command they can never satisfy. Filtering happens
at render time in `preflight-issue.mjs`; a filtered-out item is simply absent, so
no phantom evidence marker is ever required for it.

Diff-decides for `docs-only` (#865): the `tests` item deliberately does NOT
static-exclude `docs-only`. A `docs-only` issue can quietly touch code, so the
kind alone must not launder it out of the suite. Instead the `tests` item is
dropped only when the render is `--kind docs-only` AND a supplied
`--changed-paths-file` proves the `trunk...HEAD` diff is documentation-only
(default-deny: any unclassified/empty/mixed diff keeps the item). "The kind
declares, the diff decides."
-->

### Functional (verified at Test)

- [ ] All automated tests pass <!-- aitm-verified cmd="`npm test` `npm run test:slow`" --> <!-- dod:functional:tests --> <!-- dod:kinds exclude="spike,research" -->
- [ ] Lint and format checks pass <!-- aitm-verified cmd="`npm run lint` `npm run format:check`" --> <!-- dod:functional:lint -->
- [ ] All changes committed; commit messages follow project convention <!-- aitm-verified cmd="`git log --oneline -1`" --> <!-- dod:functional:commits --> <!-- dod:kinds exclude="epic" -->
- [ ] Acceptance criteria met (including additions from deep dive) <!-- dod:functional:acs -->
- [ ] Issue body checkboxes ticked <!-- dod:functional:checkboxes -->

### Lifecycle (verified at Review)

- [ ] Agent Review Passed
- [ ] Final Review Passed

### Housekeeping (verified at Close)

- [ ] Story closed and moved to Done
- [ ] Timing data flushed to issue
<!-- aitm-body-version version="1" -->
