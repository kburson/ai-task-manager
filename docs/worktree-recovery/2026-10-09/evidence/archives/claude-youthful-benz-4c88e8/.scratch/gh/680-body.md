<!-- aitm-last-known-state state="refine" ts="2026-09-09T00:10:08.616Z" -->
## User Story

As a maintainer of ai-task-manager
I want a durable place to capture the discovery and debate around a configurable, open-ended N-state machine
So that the design challenges, decisions, and eventual recommendation are tracked rather than lost in chat

## Scope

Discovery / brainstorming spike (no implementation) to evaluate migrating aitm from its **fixed 8-state** kanban chain to an **open-ended, config-driven N-state machine** that downstream installers can customize by addition or omission.

Today the state chain is closed and hardcoded: the 8 states live in a frozen `states/index.mjs`, guards register only from the package's own state containers, and `installed-guard-path.mjs` (#659) actively forbids consumers from editing the installed guard tree. There is no sanctioned seam for a consumer to add an entry/exit guard, an in-status action, or a new state/label.

**Envisioned target model.** An "N-stage" state machine where neither the count of states nor their labels are fixed — only the *process* of moving a task from one state to the next is fixed. Per-state lifecycle expands to a full five-phase shape:

```
{state:entryGuard} -> {state:onEnter} -> {state:Action} -> {state:onExit} -> {state:exitGuard}
```

The three top-level machine operations remain: **start state**, **resume state**, **move state**.

**Customization mechanism (proposed).** On install, a state-machine config is copied into the tracked `.ai-task-manager/` folder as a git artifact. Consumers edit the config to add or omit states and to bind guards/actions to state labels. The aitm package ships a library of transition-guard and action objects; the config's state map assigns them to labels. Additive-only remains the load-bearing safety property (a consumer can make transitions stricter, never loosen a built-in gate) unless a deliberate, audited override surface is designed.

This spike captures the vision, the current-architecture facts, and — primarily — the open design challenges we are actively debating. It is a living discovery issue that will accumulate notes; it does not authorize implementation.

## Plan Metadata

- **Size:** M
- **Estimate:** 4
- **Priority:** P3
- **Rank:** TBD
- **Kind:** spike (discovery / brainstorming — no implementation authorized from this issue)

## Acceptance Criteria

- [ ] Document the current closed-chain architecture as the baseline: frozen `states/index.mjs`, `guard-registry.mjs` registration, `state-bootstrap.mjs` walk, `dispatchOnEnterActions` timing, and the `installed-guard-path.mjs` (#659) edit interlock.
- [ ] Define the proposed five-phase per-state lifecycle (entryGuard → onEnter → Action → onExit → exitGuard) and reconcile it with today's transition-paired guard model (a move A→B runs A.exit + B.entry together in one `runGuards` call, not two isolated per-state checks).
- [ ] Decide whether `Action` (the deep work of a state) becomes a first-class data-structure hook or remains verb-session inhabitants; today `onEnter` is explicitly NOT the work of the state.
- [ ] Specify the `onExit` phase, which does not exist today, and its ordering relative to the exit guard and the Status write.
- [ ] Design the config artifact: shape, location under `.ai-task-manager/`, install-copy + upgrade/merge story, and package-template-override precedence.
- [ ] Catalog the shippable guard/action library and the label→object binding mechanism in the config state map.
- [ ] Resolve the safety model: preserve additive-only (stricter-never-looser) vs. a deliberate, audited override surface; account for consumer hooks living OUTSIDE the #659 interlock.
- [ ] Enumerate migration/back-compat risks: the many callers that assume the literal 8 state slugs (matrix, FORWARD/BACKWARD chains, board columns, timing rollups, heal scripts) and how an N-state model avoids breaking them.
- [ ] Produce a recommendation (proceed / defer / reshape) with a follow-on epic outline if proceeding.

## Verification Commands

- [ ] `npm run lint`
- [ ] `npm run format:check`
- [ ] `git log --oneline -1`

## Definition of Done
<!--
Each item below MUST be individually verified by running the declared
verifier. Do not bulk-check. Do not preemptively check. The visible checkbox
is the sign-off; the hidden `aitm-dod-evidence:<key>` marker is the evidence
trail. `/task check` refuses to tick a stampable Functional DoD item without
its marker; run `/task dod-stamp <key>` to produce one. The two derived keys
(`acs`, `checkboxes`) are auto-stamped by `/task close` from the body itself.
See `skill/shared/rules/functional-dod.md` for the full contract.
-->

### Functional (verified at Test)

- [ ] Lint and format checks pass <!-- aitm-verified cmd="`npm run lint` `npm run format:check`" --> <!-- dod:functional:lint -->
- [ ] All changes committed; commit messages follow project convention <!-- aitm-verified cmd="`git log --oneline -1`" --> <!-- dod:functional:commits -->
- [ ] Acceptance criteria met (including additions from deep dive) <!-- dod:functional:acs -->
- [ ] Issue body checkboxes ticked <!-- dod:functional:checkboxes -->

### Lifecycle (auto-ticked at Review/Close)

- [ ] Passed final human review
- [ ] Story closed and moved to Done
- [ ] Timing data flushed to issue

---

## Pickup Directive — MANDATORY, DO NOT SKIP
> Follow: `.ai-task-manager/templates/pickup-directive.md`

<!-- aitm-issue-kind kind="spike" -->

## AITM Progress Markers

<!-- aitm-issue-kind kind="spike" -->
<!-- aitm-entered-backlog ts="2026-07-02T13:37:57.067Z" -->

<!-- aitm-stage-rollup: {"schema":2,"perStageSec":{"backlog":0,"on-deck":0,"refine":0,"plan":0,"develop":0,"test":0,"review":0,"done":0},"totalSec":0,"perStage":{"backlog":0,"on-deck":0,"refine":0,"plan":0,"develop":0,"test":0,"review":0,"done":0},"totalMin":0,"visits":[{"stage":"backlog","visit":1,"durationSec":0,"durationMin":0}]} -->

<!-- aitm-worktree-location worktree="/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.claude/worktrees/youthful-benz-4c88e8" branch="claude/aad-yml-config-exploration-6d0cf6" sid="514e69c4-8a9e-401a-ac82-3f46009139ed" ts="2026-09-09T00:09:13.347Z" -->

<!-- aitm-entered-refine ts="2026-09-09T00:10:08.615Z" move="move:035a3374-1428-4814-b52d-e06923c2994d" -->
<!-- aitm-move-complete state=refine ts=2026-09-09T00:10:11.608Z move=move:035a3374-1428-4814-b52d-e06923c2994d -->

<!-- aitm-body-version version="9" -->

<!-- aitm-fields: {"schema":1,"values":{"priority":null,"size":null,"disposition":null,"estimate":null,"engagedTime":null,"sessionTime":null,"reviewTime":null,"planTime":null,"rank":null,"startTime":"2026-09-08 19:10:15 -05:00","blockedBy":null}} -->

