<!-- aitm-last-known-state state="review" ts="2026-09-09T01:17:14.200Z" -->

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

- [x] Document the current closed-chain architecture as the baseline: frozen `states/index.mjs`, `guard-registry.mjs` registration, `state-bootstrap.mjs` walk, `dispatchOnEnterActions` timing, and the `installed-guard-path.mjs` (#659) edit interlock. <!-- aitm-non-demonstrable -->
- [x] Define the proposed five-phase per-state lifecycle (entryGuard → onEnter → Action → onExit → exitGuard) and reconcile it with today's transition-paired guard model (a move A→B runs A.exit + B.entry together in one `runGuards` call, not two isolated per-state checks). <!-- aitm-non-demonstrable -->
- [x] Decide whether `Action` (the deep work of a state) becomes a first-class data-structure hook or remains verb-session inhabitants; today `onEnter` is explicitly NOT the work of the state. <!-- aitm-non-demonstrable -->
- [x] Specify the `onExit` phase, which does not exist today, and its ordering relative to the exit guard and the Status write. <!-- aitm-non-demonstrable -->
- [x] Design the config artifact: shape, location under `.ai-task-manager/`, install-copy + upgrade/merge story, and package-template-override precedence. <!-- aitm-non-demonstrable -->
- [x] Catalog the shippable guard/action library and the label→object binding mechanism in the config state map. <!-- aitm-non-demonstrable -->
- [x] Resolve the safety model: preserve additive-only (stricter-never-looser) vs. a deliberate, audited override surface; account for consumer hooks living OUTSIDE the #659 interlock. <!-- aitm-non-demonstrable -->
- [x] Enumerate migration/back-compat risks: the many callers that assume the literal 8 state slugs (matrix, FORWARD/BACKWARD chains, board columns, timing rollups, heal scripts) and how an N-state model avoids breaking them. <!-- aitm-non-demonstrable -->
- [x] Produce a recommendation (proceed / defer / reshape) with a follow-on epic outline if proceeding. <!-- aitm-non-demonstrable -->

## Verification Commands

- [x] `npm run lint` <!-- aitm-verified cmd="npm run lint" exit="0" sha="9787ead92557e0767f7747e49447ba5e27822abe" ts="2026-09-09T01:16:33.715Z" evidence="sandbox exit 0 (npm run lint)" -->
- [x] `npm run format:check` <!-- aitm-verified cmd="npm run format:check" exit="0" sha="9787ead92557e0767f7747e49447ba5e27822abe" ts="2026-09-09T01:16:33.715Z" evidence="sandbox exit 0 (npm run format:check)" -->
- [x] `git log --oneline -1` <!-- aitm-verified cmd="git log --oneline -1" exit="0" sha="9787ead92557e0767f7747e49447ba5e27822abe" ts="2026-09-09T01:16:33.715Z" evidence="sandbox exit 0 (git log --oneline -1)" -->

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

- [x] Lint and format checks pass <!-- aitm-verified cmd="`npm run lint` `npm run format:check`" exit="0" sha="9787ead92557e0767f7747e49447ba5e27822abe" ts="2026-09-09T01:16:33.715Z" --> <!-- dod:functional:lint -->
- [x] All changes committed; commit messages follow project convention <!-- aitm-verified cmd="`git log --oneline -1`" exit="0" sha="9787ead92557e0767f7747e49447ba5e27822abe" ts="2026-09-09T01:16:33.715Z" --> <!-- dod:functional:commits -->
- [x] Acceptance criteria met (including additions from deep dive) <!-- dod:functional:acs --> <!-- aitm-verified cmd="derive:all-acceptance-criteria-ticked" exit="0" sha="9787ead9" ts="2026-09-09T01:16:57.178Z" -->
- [x] Issue body checkboxes ticked <!-- dod:functional:checkboxes --> <!-- aitm-verified cmd="derive:all-non-self-non-lifecycle-checkboxes-ticked" exit="0" sha="9787ead9" ts="2026-09-09T01:16:57.178Z" -->

### Lifecycle (auto-ticked at Review/Close)

- [ ] Passed final human review
- [ ] Story closed and moved to Done
- [ ] Timing data flushed to issue

---

## Pickup Directive — MANDATORY, DO NOT SKIP
> Follow: `.ai-task-manager/templates/pickup-directive.md`

<details>
<summary>Deep-Dive Analysis (collapsed on plan approval — expand if revisiting scope)</summary>

## Deep-Dive Analysis (2026-09-09)

### Baseline: the closed-chain architecture as it stands

`lib/state-factory.mjs` exposes `createStateMachine({ definitions, policy })`. A state
definition is already `{ id, entryGuards[], residentActions[], exitGuards[] }`. The eight
modules under `scripts/task-tracker/states/` are hardcoded instances of that shape, assembled
by static `import` in `states/index.mjs`. `lib/guard-registry.mjs` holds the state-keyed
exit/entry slots; `runGuards(from, to, ctx)` fires at every transition from `move-state.mjs`,
`promote.mjs`, `close.mjs`, and `review.mjs`. `installed-guard-path.mjs` (#659) forbids
consumers editing the installed guard tree, so there is no extension seam today.

Conclusion: the state objects are ALREADY the building blocks a config file would emit. The
work is at the assembly seam, not a rewrite. The factory’s existing `validatePolicyEdges`
and definition-order cross-check become the config schema validator for free.

### Stage-name coupling is narrower than the file count suggests

74 lib modules contain stage literals. 22 of them (25 occurrences) carry the self-scoping
shape `if (ctx?.toState && ctx.toState !== ‘test’) return { ok: true };` — a guard on
`develop.exitGuards` re-checking its own scope because the registry binds guards to STATES
rather than EDGES. Bind guards to edges and the binding IS the scope; those 25 checks delete
rather than needing abstraction.

The residue needs stage ROLES, not stage names: `done` as terminal (`blocked-by-guard`,
`epic-children-gate`, `close-convergence`), `develop` as implementation (`derive-drivers`
counts develop visits), `test`/`review` as verification (`delivery-incident-reconciliation`
filters receipts), and ordinal floors (`body-gates.mjs:293` REFINE_IDX / ADMIT_FLOOR_IDX).
Roughly 5-7 roles cover it.

Hazard: `decomposition-policy.mjs:292` has `item.level === ‘review’` — a signal severity,
not a state. Several such false positives exist. Extraction must be read-and-decide, never a
mechanical sweep.

### Migration precedents already in the repo

`lib/stage-entry-markers.mjs` carries `LEGACY_READY_FOR_PLAN_STAGES`, `canonicalStage()`,
`markerStagePattern()` and `OPTIONAL_CONTIGUITY_STAGES` — the Assigned/On Deck to
`ready-for-plan` rename was absorbed by aliasing forward with no body rewrites.
`lib/timing-slug-rename.mjs` (#520) is the other pattern: a one-shot in-place relabel from a
static dictionary, idempotent by construction, forbidden from synthesizing rows. Future
migration work generalizes these two rather than inventing a mechanism.

### The finding that forced the drain-the-board decision

`lib/stage-entry-markers.mjs:54` builds `LEGAL_TRANSITIONS` from the CURRENT lifecycle policy,
and `close-gates.mjs:92` validates an issue’s HISTORICAL marker chain against it.
`REQUIRED_CHAIN_STAGES` (`close-gates.mjs:35`) demands a marker for every stage in the current
pipeline. So any pipeline change instantly invalidates every in-flight issue’s recorded
history. Either historical pipeline generations are retained for validation, or the board is
drained before a stage-set change. The recommendation takes the drain.

### Threat surface for external gates

Three threats. T1 arbitrary code execution — precedented (package.json scripts, eslint
plugins); controlled by CODEOWNERS plus branch protection, and by resolving gates from the
trunk ref (`lib/trunk-ref.mjs` already exports `resolveTrunkRef`/`fetchTrunk`) so a PR branch
cannot run a gate before merge. T2 a gate that always passes — controlled by additive-only:
config attaches gates, never detaches core ones. T3 (new) the explanation string — a gate’s
reason enters agent context as next-action guidance, so a gate must SELECT a remediation from
a closed registry, never author one, and free text renders as quoted untrusted data.

This repo has no CODEOWNERS today (neither `.github/`, root, nor `docs/`), so shipping an
example means writing our own first.

### Recommendation

Proceed. Full recommendation, decisions table, threat model and follow-on epic outline are in
the `spike-deliverable` comment on this issue.

</details>

## AITM Progress Markers

<!-- aitm-refine-complete ts="2026-09-09T00:12:01.728Z" -->

<!-- aitm-deep-dive-posted ts="2026-09-09T00:13:44.935Z" -->

<!-- aitm-issue-kind kind="spike" -->

<!-- aitm-deliverable-posted url="https://github.com/kburson/ai-task-manager/issues/680#issuecomment-5593701237" ts="2026-09-09T00:18:24.367Z" -->

<!-- aitm-issue-kind kind="spike" -->

<!-- aitm-entered-backlog ts="2026-07-02T13:37:57.067Z" -->

<!-- aitm-stage-rollup: {"schema":2,"perStageSec":{"backlog":5913132,"refine":125,"ready-for-plan":22,"plan":294,"develop":2084,"test":1106,"review":0,"done":0},"totalSec":5916763,"visits":[{"stage":"backlog","visit":1,"durationSec":5913132},{"stage":"refine","visit":1,"durationSec":125},{"stage":"ready-for-plan","visit":1,"durationSec":22},{"stage":"plan","visit":1,"durationSec":294},{"stage":"develop","visit":1,"durationSec":1865},{"stage":"test","visit":1,"durationSec":381},{"stage":"develop","visit":2,"durationSec":32},{"stage":"test","visit":2,"durationSec":364},{"stage":"develop","visit":3,"durationSec":38},{"stage":"test","visit":3,"durationSec":361},{"stage":"develop","visit":4,"durationSec":149},{"stage":"test","visit":4,"durationSec":0}]} -->

<!-- aitm-worktree-location worktree="/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.claude/worktrees/youthful-benz-4c88e8" branch="claude/aad-yml-config-exploration-6d0cf6" sid="514e69c4-8a9e-401a-ac82-3f46009139ed" ts="2026-09-09T00:09:13.347Z" -->

<!-- aitm-entered-refine ts="2026-09-09T00:10:08.615Z" move="move:035a3374-1428-4814-b52d-e06923c2994d" -->

<!-- aitm-refinement-snapshot schema="2" digest="504af65a23804b938e82748984c5c7760082988398b050a9fddfea3b3fae0e85" provenance="74a3742136664cf07f577baf0d52d7031ba8592836ab1c647aeb06e4018d10dc" priority="P2" size="M" estimate="4" rank="680" blocked-by="" ts="2026-09-09T00:12:01.743Z" -->

<!-- aitm-entered-ready-for-plan ts="2026-09-09T00:12:13.901Z" move="move:d4d2233b-bc46-4f6c-b29d-bf5c1af7966f" -->

<!-- aitm-entered-plan ts="2026-09-09T00:12:35.519Z" move="move:0eb1d845-c2ed-4ef3-a508-5af34993c3db" -->

<!-- aitm-deep-dive-complete ts="2026-09-09T00:13:44.935Z" -->

<!-- aitm-estimation-forecast-ready record-id="01M21RBVJ9GQXF3FBSCC03WTSG" -->

<!-- aitm-plan-approved ts="2026-09-09T00:16:48Z" forecast-record-id="01M21RBVJ9GQXF3FBSCC03WTSG" trunk-sha="9384efc41281118dce754bc1875b9d6c4bd878af" mode="human" -->

<!-- aitm-entered-develop ts="2026-09-09T00:17:29.263Z" move="move:8d2ff107-fb99-4621-97c4-5112ffdd1c5b" -->

<!-- aitm-session-ref sid="514e69c4-8a9e-401a-ac82-3f46009139ed" jsonl="/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.claude/worktrees/youthful-benz-4c88e8/.tmp/aitm/app/claude/session-transcripts/514e69c4-8a9e-401a-ac82-3f46009139ed.jsonl" ts="2026-09-09T00:18:51.377Z" -->

<!-- aitm-unverified-tick label="Document the current closed-chain architecture as the baseline: frozen `states/index.mjs`, `guard-registry.mjs` registration, `state-bootstrap.mjs` walk, `dispatchOnEnterActions` timing, and the `installed-guard-path.mjs` (#659) edit interlock." ts="2026-09-09T00:17:58.281Z" -->

<!-- aitm-unverified-tick label="Define the proposed five-phase per-state lifecycle (entryGuard → onEnter → Action → onExit → exitGuard) and reconcile it with today's transition-paired guard model (a move A→B runs A.exit + B.entry together in one `runGuards` call, not two isolated per-state checks)." ts="2026-09-09T00:17:58.281Z" -->

<!-- aitm-unverified-tick label="Decide whether `Action` (the deep work of a state) becomes a first-class data-structure hook or remains verb-session inhabitants; today `onEnter` is explicitly NOT the work of the state." ts="2026-09-09T00:17:58.281Z" -->

<!-- aitm-unverified-tick label="Specify the `onExit` phase, which does not exist today, and its ordering relative to the exit guard and the Status write." ts="2026-09-09T00:17:58.281Z" -->

<!-- aitm-unverified-tick label="Design the config artifact: shape, location under `.ai-task-manager/`, install-copy + upgrade/merge story, and package-template-override precedence." ts="2026-09-09T00:17:58.281Z" -->

<!-- aitm-unverified-tick label="Catalog the shippable guard/action library and the label→object binding mechanism in the config state map." ts="2026-09-09T00:17:58.281Z" -->

<!-- aitm-unverified-tick label="Resolve the safety model: preserve additive-only (stricter-never-looser) vs. a deliberate, audited override surface; account for consumer hooks living OUTSIDE the #659 interlock." ts="2026-09-09T00:17:58.281Z" -->

<!-- aitm-unverified-tick label="Enumerate migration/back-compat risks: the many callers that assume the literal 8 state slugs (matrix, FORWARD/BACKWARD chains, board columns, timing rollups, heal scripts) and how an N-state model avoids breaking them." ts="2026-09-09T00:17:58.281Z" -->

<!-- aitm-unverified-tick label="Produce a recommendation (proceed / defer / reshape) with a follow-on epic outline if proceeding." ts="2026-09-09T00:17:58.281Z" -->

<!-- aitm-entered-test ts="2026-09-09T00:48:34.418Z" move="move:13682285-230a-41a9-9fe0-fee6ac0239cf" -->

<!-- aitm-entered-develop-2 ts="2026-09-09T00:54:55.389Z" move="move:1a7530fd-52e0-456b-867f-ed7570a93b7f" -->

<!-- aitm-entered-test-2 ts="2026-09-09T00:55:27.282Z" move="move:42ed4cfe-2556-4085-9dce-de9f07c20c74" -->

<!-- aitm-entered-develop-3 ts="2026-09-09T01:01:31.449Z" move="move:64a92504-4873-4c16-9c52-6ce9183888ee" -->

<!-- aitm-entered-test-3 ts="2026-09-09T01:02:09.065Z" move="move:27a632f3-7b84-4a95-8e87-e2c98fb3a431" -->

<!-- aitm-entered-develop-4 ts="2026-09-09T01:08:10.199Z" move="move:e306977d-4a8e-4d16-90b1-c44f53ea78a7" -->

<!-- aitm-verification-receipt stage="develop-final" data="eyJjb21tYW5kcyI6W3siYXJncyI6WyJydW4iLCJsaW50Il0sImNsYXNzaWZpY2F0aW9uIjoibGludC1mdWxsIiwiY29tbWFuZCI6Im5wbSIsImNvbXBsZXRlZEF0IjoiMjAyNi0wOS0wOVQwMToxMDoxNC4yMDRaIiwiZHVyYXRpb25NcyI6MjA2MjEsImV4aXRDb2RlIjowLCJraW5kIjoibGludCIsInByb3ZpZGVySWQiOiJub2RlIiwic3RhcnRlZEF0IjoiMjAyNi0wOS0wOVQwMTowOTo1My41ODNaIn0seyJhcmdzIjpbInJ1biIsImZvcm1hdDpjaGVjayJdLCJjbGFzc2lmaWNhdGlvbiI6ImZvcm1hdC1mdWxsIiwiY29tbWFuZCI6Im5wbSIsImNvbXBsZXRlZEF0IjoiMjAyNi0wOS0wOVQwMToxMDoyNy42OTJaIiwiZHVyYXRpb25NcyI6MTM0NjEsImV4aXRDb2RlIjowLCJraW5kIjoiZm9ybWF0IiwicHJvdmlkZXJJZCI6Im5vZGUiLCJzdGFydGVkQXQiOiIyMDI2LTA5LTA5VDAxOjEwOjE0LjIzMVoifV0sImNvbW1pdFNoYSI6Ijk3ODdlYWQ5MjU1N2UwNzY3Zjc3NDdlNDk0NDdiYTVlMjc4MjJhYmUiLCJjb21wbGV0ZWRBdCI6IjIwMjYtMDktMDlUMDE6MTA6MjcuNjkyWiIsImVudmlyb25tZW50Ijp7ImNvbmZpZ0hhc2hlcyI6eyIubWFya2Rvd25saW50LWNsaTIuanNvbmMiOiJzaGEyNTY6ZWZmMzYwODcxMGMzOGVlZGY1OGY4MDczZjRiZWUwMzIwYjMyMjdlOGE5Mjc5NjRmYzY2ODA1ZWYxYTk4OWM1YyIsIi5wcmV0dGllcnJjLmpzb24iOiJzaGEyNTY6Y2FhMDkwNzUwNjdhZDBlZGVhZThjOGY5ODc0Nzg3MjliMjc1M2I0MTJkMTAxNWJjOGU0ZGU3N2ZhNDUyMTZjMiIsImNzcGVsbC5qc29uIjoic2hhMjU2OjQ3OTgyMGU4MjQ2MzkyYTllZDRiMDFkNDdmYjBiMWJhN2FkOTRjMzljMDE1YjA0OWNjMWQ2NjVhMzQ0ODM0ODkiLCJlc2xpbnQuY29uZmlnLm1qcyI6InNoYTI1Njo1Y2VlNGU5NzFkZDZmOTg1NjNlMDM1M2NmOTliYjY1OTE5NjJiNDE4NzNlNTg0ODQxZTBjMzdkYjFjMjljMWU0IiwicGFja2FnZS5qc29uIjoic2hhMjU2OjM4NTcxNTIwYmE1ZjJiNzA0YTg2MzA3OWE2ODg2ZmRmNmQ1OTgxNzdmMzg0MmQxNTlmN2EwZjMwNDE4YjdkZWYiLCJzY3JpcHRzL3J1bi10ZXN0cy1sYW5lcy5tanMiOiJzaGEyNTY6YTk3MjdkNTkzZjZkNTllYTQyNDcwYjdjMThjYjVkNWE1YmE2NDI1NzgyNTJmMGYxNjA5NzY3MzQyNzM1MDJkOCIsInNjcmlwdHMvcnVuLXRlc3RzLm1qcyI6InNoYTI1NjoxMmY3N2JjZjdkYmI1ZWYyYTZiMTZhMWExNDg2ODY1ZmFiZmY5MGNkMTYxNjc1OTI3ZDQ5ZDlmZjhiYTg5YmNlIiwic2NyaXB0cy90YXNrLXRyYWNrZXIvbGliL3Rlc3QtbGFuZXMubWpzIjoic2hhMjU2OjA3M2Y2OGY0ODQ0ZDY0YWNjMThiOTU5ZTE1OGEyNmY1ODliNmNiYTllMzRhOWM4MzM4OTJjZWRmMzNlZjdlZGUiLCJzY3JpcHRzL3Rhc2stdHJhY2tlci90ZXN0LWltcGFjdC1tYW5pZmVzdC5qc29uIjoic2hhMjU2OmVmZDMwYmQ2YmZkMGE5ZTk3N2QzYjRmM2Y0YzQ5ZjdiOTlhM2I3ZTU1YTFmNjhkYTFiMGZhYjk2ZDI0MTBiNTYifSwibG9ja2ZpbGVIYXNoIjoic2hhMjU2OmJjODhiYzVhMmQ5YjVlMzY3YWZkMDBiYWNkOWYzMjY0MGZlMzE3MmQ5OTBmN2E0MzAzZjdiYWZkMGUzNzlkM2YiLCJub2RlIjoidjI1LjYuMCIsInBsYXRmb3JtIjoiZGFyd2luLWFybTY0Iiwic2FuZGJveCI6eyJjbGVhbiI6dHJ1ZSwiaWRlbnRpdHkiOiIvVXNlcnMva3BidXJzb24vcHJvamVjdHMvVmliZS1Db2RpbmcvYWktdGFzay1tYW5hZ2VyLy5jbGF1ZGUvd29ya3RyZWVzL3lvdXRoZnVsLWJlbnotNGM4OGU4Iiwia2luZCI6Indvcmt0cmVlIn19LCJpc3N1ZSI6NjgwLCJwcm92aWRlciI6eyJpZCI6Im5vZGUiLCJyZXF1aXJlZENsYXNzaWZpY2F0aW9ucyI6WyJsaW50LWZ1bGwiLCJmb3JtYXQtZnVsbCJdfSwicmVjZWlwdElkIjoiMDFNMjFWRVFLQ1Q5M1M4RkVFVkQwNVEwMUIiLCJzY2hlbWEiOiJhaXRtLnZlcmlmaWNhdGlvbi1yZWNlaXB0L3YxIiwic3RhZ2UiOiJkZXZlbG9wLWZpbmFsIiwic3RhcnRlZEF0IjoiMjAyNi0wOS0wOVQwMTowOTo1My41ODNaIiwic3VwZXJzZWRlcyI6IjAxTTIxVDZCU0ZKOU0zMDZBQlM2UkJXN0FNIiwidmVyaWZpY2F0aW9uQ29tbWFuZHMiOltbImdpdCIsImxvZyIsIi0tb25lbGluZSIsIi0xIl0sWyJucG0iLCJydW4iLCJmb3JtYXQ6Y2hlY2siXSxbIm5wbSIsInJ1biIsImxpbnQiXV19" -->

<!-- aitm-entered-test-4 ts="2026-09-09T01:10:39.212Z" move="move:b42aa113-c283-426d-a867-a9475be7c698" -->

<!-- aitm-test-started sha="9787ead92557e0767f7747e49447ba5e27822abe" ts="2026-09-09T01:10:50.393Z" -->

<!-- aitm-dod-verified sha="9787ead92557e0767f7747e49447ba5e27822abe" ts="2026-09-09T01:16:33.715Z" -->

<!-- aitm-verification-receipt stage="test" data="eyJjb21tYW5kcyI6W3siYXJncyI6WyJydW4iLCJsaW50Il0sImNsYXNzaWZpY2F0aW9uIjoibGludC1mdWxsIiwiY29tbWFuZCI6Im5wbSIsImNvbXBsZXRlZEF0IjoiMjAyNi0wOS0wOVQwMToxMDoxNC4yMDRaIiwiZHVyYXRpb25NcyI6MjA2MjEsImV4aXRDb2RlIjowLCJraW5kIjoibGludCIsInByb3ZpZGVySWQiOiJub2RlIiwicmV1c2VkRnJvbSI6IjAxTTIxVkVRS0NUOTNTOEZFRVZEMDVRMDFCIiwic3RhcnRlZEF0IjoiMjAyNi0wOS0wOVQwMTowOTo1My41ODNaIn0seyJhcmdzIjpbInJ1biIsImZvcm1hdDpjaGVjayJdLCJjbGFzc2lmaWNhdGlvbiI6ImZvcm1hdC1mdWxsIiwiY29tbWFuZCI6Im5wbSIsImNvbXBsZXRlZEF0IjoiMjAyNi0wOS0wOVQwMToxMDoyNy42OTJaIiwiZHVyYXRpb25NcyI6MTM0NjEsImV4aXRDb2RlIjowLCJraW5kIjoiZm9ybWF0IiwicHJvdmlkZXJJZCI6Im5vZGUiLCJyZXVzZWRGcm9tIjoiMDFNMjFWRVFLQ1Q5M1M4RkVFVkQwNVEwMUIiLCJzdGFydGVkQXQiOiIyMDI2LTA5LTA5VDAxOjEwOjE0LjIzMVoifSx7ImFyZ3MiOlsicnVuIiwidGVzdDp1bml0Il0sImNsYXNzaWZpY2F0aW9uIjoidGVzdC11bml0IiwiY29tbWFuZCI6Im5wbSIsImNvbXBsZXRlZEF0IjoiMjAyNi0wOS0wOVQwMToxMToyMy44MDRaIiwiZHVyYXRpb25NcyI6MjkyOTAsImV4aXRDb2RlIjowLCJraW5kIjoidGVzdCIsInByb3ZpZGVySWQiOiJub2RlIiwic3RhcnRlZEF0IjoiMjAyNi0wOS0wOVQwMToxMDo1NC41MTRaIn0seyJhcmdzIjpbInJ1biIsInRlc3Q6aW50ZWdyYXRpb24iXSwiY2xhc3NpZmljYXRpb24iOiJ0ZXN0LWludGVncmF0aW9uIiwiY29tbWFuZCI6Im5wbSIsImNvbXBsZXRlZEF0IjoiMjAyNi0wOS0wOVQwMToxMzozNS4yODRaIiwiZHVyYXRpb25NcyI6MTMxNDgwLCJleGl0Q29kZSI6MCwia2luZCI6InRlc3QiLCJwcm92aWRlcklkIjoibm9kZSIsInN0YXJ0ZWRBdCI6IjIwMjYtMDktMDlUMDE6MTE6MjMuODA0WiJ9LHsiYXJncyI6WyJydW4iLCJ0ZXN0OnNsb3ciXSwiY2xhc3NpZmljYXRpb24iOiJ0ZXN0LXNsb3ciLCJjb21tYW5kIjoibnBtIiwiY29tcGxldGVkQXQiOiIyMDI2LTA5LTA5VDAxOjE2OjMxLjg0MloiLCJkdXJhdGlvbk1zIjoxNzY1NTcsImV4aXRDb2RlIjowLCJraW5kIjoidGVzdCIsInByb3ZpZGVySWQiOiJub2RlIiwic3RhcnRlZEF0IjoiMjAyNi0wOS0wOVQwMToxMzozNS4yODVaIn0seyJhcmdzIjpbImxvZyIsIi0tb25lbGluZSIsIi0xIl0sImNsYXNzaWZpY2F0aW9uIjoidGVzdC10YXJnZXRlZC0xIiwiY29tbWFuZCI6ImdpdCIsImNvbXBsZXRlZEF0IjoiMjAyNi0wOS0wOVQwMToxNjozMS44NTFaIiwiZHVyYXRpb25NcyI6OSwiZXhpdENvZGUiOjAsImtpbmQiOiJ0ZXN0IiwicHJvdmlkZXJJZCI6Im5vZGUiLCJzdGFydGVkQXQiOiIyMDI2LTA5LTA5VDAxOjE2OjMxLjg0MloifV0sImNvbW1pdFNoYSI6Ijk3ODdlYWQ5MjU1N2UwNzY3Zjc3NDdlNDk0NDdiYTVlMjc4MjJhYmUiLCJjb21wbGV0ZWRBdCI6IjIwMjYtMDktMDlUMDE6MTY6MzEuODUxWiIsImVudmlyb25tZW50Ijp7ImNvbmZpZ0hhc2hlcyI6eyIubWFya2Rvd25saW50LWNsaTIuanNvbmMiOiJzaGEyNTY6ZWZmMzYwODcxMGMzOGVlZGY1OGY4MDczZjRiZWUwMzIwYjMyMjdlOGE5Mjc5NjRmYzY2ODA1ZWYxYTk4OWM1YyIsIi5wcmV0dGllcnJjLmpzb24iOiJzaGEyNTY6Y2FhMDkwNzUwNjdhZDBlZGVhZThjOGY5ODc0Nzg3MjliMjc1M2I0MTJkMTAxNWJjOGU0ZGU3N2ZhNDUyMTZjMiIsImNzcGVsbC5qc29uIjoic2hhMjU2OjQ3OTgyMGU4MjQ2MzkyYTllZDRiMDFkNDdmYjBiMWJhN2FkOTRjMzljMDE1YjA0OWNjMWQ2NjVhMzQ0ODM0ODkiLCJlc2xpbnQuY29uZmlnLm1qcyI6InNoYTI1Njo1Y2VlNGU5NzFkZDZmOTg1NjNlMDM1M2NmOTliYjY1OTE5NjJiNDE4NzNlNTg0ODQxZTBjMzdkYjFjMjljMWU0IiwicGFja2FnZS5qc29uIjoic2hhMjU2OjM4NTcxNTIwYmE1ZjJiNzA0YTg2MzA3OWE2ODg2ZmRmNmQ1OTgxNzdmMzg0MmQxNTlmN2EwZjMwNDE4YjdkZWYiLCJzY3JpcHRzL3J1bi10ZXN0cy1sYW5lcy5tanMiOiJzaGEyNTY6YTk3MjdkNTkzZjZkNTllYTQyNDcwYjdjMThjYjVkNWE1YmE2NDI1NzgyNTJmMGYxNjA5NzY3MzQyNzM1MDJkOCIsInNjcmlwdHMvcnVuLXRlc3RzLm1qcyI6InNoYTI1NjoxMmY3N2JjZjdkYmI1ZWYyYTZiMTZhMWExNDg2ODY1ZmFiZmY5MGNkMTYxNjc1OTI3ZDQ5ZDlmZjhiYTg5YmNlIiwic2NyaXB0cy90YXNrLXRyYWNrZXIvbGliL3Rlc3QtbGFuZXMubWpzIjoic2hhMjU2OjA3M2Y2OGY0ODQ0ZDY0YWNjMThiOTU5ZTE1OGEyNmY1ODliNmNiYTllMzRhOWM4MzM4OTJjZWRmMzNlZjdlZGUiLCJzY3JpcHRzL3Rhc2stdHJhY2tlci90ZXN0LWltcGFjdC1tYW5pZmVzdC5qc29uIjoic2hhMjU2OmVmZDMwYmQ2YmZkMGE5ZTk3N2QzYjRmM2Y0YzQ5ZjdiOTlhM2I3ZTU1YTFmNjhkYTFiMGZhYjk2ZDI0MTBiNTYifSwibG9ja2ZpbGVIYXNoIjoic2hhMjU2OmJjODhiYzVhMmQ5YjVlMzY3YWZkMDBiYWNkOWYzMjY0MGZlMzE3MmQ5OTBmN2E0MzAzZjdiYWZkMGUzNzlkM2YiLCJub2RlIjoidjI1LjYuMCIsInBsYXRmb3JtIjoiZGFyd2luLWFybTY0Iiwic2FuZGJveCI6eyJjbGVhbiI6dHJ1ZSwiaWRlbnRpdHkiOiIvVXNlcnMva3BidXJzb24vcHJvamVjdHMvVmliZS1Db2RpbmcvYWktdGFzay1tYW5hZ2VyLy5jbGF1ZGUvd29ya3RyZWVzL3lvdXRoZnVsLWJlbnotNGM4OGU4Ly5zY3JhdGNoLy50YXNrLXRlc3QtNjgwLTk3ODdlYWQ5LTU1NDAtYjQ1YmM0NzMiLCJraW5kIjoid29ya3RyZWUifX0sImV4ZWN1dGlvbkNvbnRleHQiOnsiYm91bmRJc3N1ZSI6NjgwLCJicmFuY2giOiJIRUFEIiwid29ya3RyZWVQYXRoIjoiL1VzZXJzL2twYnVyc29uL3Byb2plY3RzL1ZpYmUtQ29kaW5nL2FpLXRhc2stbWFuYWdlci8uY2xhdWRlL3dvcmt0cmVlcy95b3V0aGZ1bC1iZW56LTRjODhlOC8uc2NyYXRjaC8udGFzay10ZXN0LTY4MC05Nzg3ZWFkOS01NTQwLWI0NWJjNDczIn0sImlzc3VlIjo2ODAsInByb3ZpZGVyIjp7ImlkIjoibm9kZSIsInJlcXVpcmVkQ2xhc3NpZmljYXRpb25zIjpbImxpbnQtZnVsbCIsImZvcm1hdC1mdWxsIiwidGVzdC11bml0IiwidGVzdC1pbnRlZ3JhdGlvbiIsInRlc3Qtc2xvdyJdfSwicmVjZWlwdElkIjoiMDFNMjFWU1Y3QlFXQkpHN1JTMkY3MVhaVzUiLCJzY2hlbWEiOiJhaXRtLnZlcmlmaWNhdGlvbi1yZWNlaXB0L3YxIiwic3RhZ2UiOiJ0ZXN0Iiwic3RhcnRlZEF0IjoiMjAyNi0wOS0wOVQwMTowOTo1My41ODNaIiwic3VwZXJzZWRlcyI6bnVsbCwidmVyaWZpY2F0aW9uQ29tbWFuZHMiOltbImdpdCIsImxvZyIsIi0tb25lbGluZSIsIi0xIl0sWyJucG0iLCJydW4iLCJmb3JtYXQ6Y2hlY2siXSxbIm5wbSIsInJ1biIsImxpbnQiXV19" -->

<!-- aitm-entered-review ts="2026-09-09T01:17:14.199Z" move="move:353deaf3-7588-442b-b13e-ec894478ab55" -->

<!-- aitm-move-complete state=review ts=2026-09-09T01:17:18.919Z move=move:353deaf3-7588-442b-b13e-ec894478ab55 -->

<!-- aitm-fields: {"schema":1,"values":{"priority":"P2","size":"L","disposition":null,"estimate":10.5,"engagedTime":51,"sessionTime":51,"reviewTime":0,"planTime":5,"rank":680,"startTime":"2026-09-08 19:10:15 -05:00","blockedBy":null}} -->

<!-- aitm-review-failed:start -->
<!-- aitm-review-failed-meta ts="2026-09-09T01:17:25.422Z" -->
**Agent Review Gate failed.** Fix the following, then re-run `/task review`:

- body-sections: section 'Story Origin' is missing
- body-sections: section 'Acceptance Criteria' appears before 'Deep Dive'
<!-- aitm-review-failed:end -->

<!-- aitm-body-version version="40" -->

