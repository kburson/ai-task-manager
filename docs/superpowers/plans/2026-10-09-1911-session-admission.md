# #1911 Hooks and Session Admission Implementation Plan

**Goal:** Complete current revision admission at independently callable session bind/resume/switch boundaries and qualify per-call hook freshness, linked-worktree denial, authenticated delegation and lock custody.

**Spec:** docs/superpowers/specs/2026-09-30-1847-governed-criteria-revisions-design.md, activity admission, strict interlock and consumer integration; original Task 5 and #1911 Scope.

**Architecture:** Preserve existing hook, occupancy, timing, binding and rollback algorithms. Reuse withRevisionConsumer for fresh complete remote-chain validation under the common interlock before session mutation callbacks; start delegates to resume, and switching is independently callable. Local hook projections never establish remote binding authority.

**Execution:** Inline executing-plans and TDD, followed by one fresh review. Work under active1918 orchestration on its existing parent branch, with child1911 lifecycle deferred under the documented human-authorized sequencing continuation. Native ancestry1847 →1855 →1918 →1911; no new defect or prerequisite issue.

## Baseline and owned discovery

Complete original linked-worktree/admission/interlock/source-hook/bind-context/bind-event/start-resume suites passed73/73 in12.60s. The declared criteria-revision-session-admission.test.mjs is absent. Activity and source-edit hooks already read current local revision admission before cached Develop/chore signals; those retained algorithms need actual current qualification, not reconstruction.

Source inspection finds that independently callable verbResume and verbSwitch claim occupancy and may save binding/timing state without the public fresh revision-consumer boundary. verbStart delegates to verbResume. Test those public entries against genuine current authority before source changes. Bind-context's pure identity validation and bind-event classification remain separate; do not treat them as mutation admission or replace their original behavior.

## Global constraints and interfaces

- Preserve original occupancy custody, rollback, no-op timing, transcript markers, active timer behavior and branch/worktree identity checks.
- Validate current complete chain under the strict revision interlock before occupancy, queue, timing, registry, reconciliation and binding effects. No caller ready flag or local allow projection may substitute.
- Current targets must agree with authentic backend scope. Revalidate a no-argument resume target before binding; a changed remembered issue cannot borrow an old held revision capability.
- Preserve ordinary disabled-domain behavior and invalid/no-op input handling. Enabled production domains without a trusted collector fail closed.
- Preserve lock order and authenticated delegate reuse; no age-only lease reclaim or bare inherited issue-lock authorization.
- No authority cache, new production activation, compiled binary, test deletion, fixture reduction or time-budget increase.
- Existing600000ms file/section,20-minute verifier and45-minute sandbox budgets remain unchanged.
- Prospective remaining estimate9h includes incremental source boundaries, complete original qualification and review; excludes historical source and passive CI. Any individual estimate >=24h requires decomposition before continuation.
- Full aggregate/Linux proof and normal child lifecycle reconciliation remain due; no scoped pass becomes Done.

## Task 1: Close actual public session entry gaps

**Files:** scripts/task-tracker/verbs/resume.mjs, switch.mjs and start.mjs as necessary; reuse existing criteria-revision/policy.mjs and occupancy/binding libraries.

- Create actual pending/stale/malformed/unavailable public start, targeted resume, no-argument resume and switch cases with original state files and effect spies. Preserve genuine baseline/current-approved bind and timing controls.
- Run RED before source changes; separate malformed fixture/assertion failures from product evidence.
- Add the smallest fresh admission at the proved public boundaries before original callbacks and occupancy effects. Preserve original admitted algorithms, pure validation and rollback.
- Prove target mismatch/drift, authenticated nested delegation and original return/error behavior; no remembered target may reuse admission for another issue.

## Task 2: Qualify hooks, bound sessions and delegates

**Create:** scripts/tests/integration/task-tracker/lib/criteria-revision-session-admission.test.mjs.

- Independently inspect source imports/calls for hook admission and start/resume/switch delegation; compare the discovered routes with actual public cases.
- Execute complete original consumers-admission, policy-source-hook and interlock suites, including real linked A/B worktrees, next write/code/mixed-commit refusal, per-call reads, protected-source edits, bare flags, live/unknown/exited holder and subprocess crash/publication tests.
- Execute complete original start/resume, cross-worktree binding, binding-generation, rollback and worktree-lifecycle regressions with all fixtures/assertions intact.
- Verify every selected input exists, actual case counts, exit/fail/cancel/skip and unchanged budgets. Isolated profiles may overlap only with independent processes/fixture roots.

## Task 3: Review and record delivery evidence

Run npm run lint and npm run format:check; commit with1918/1911 attribution and request one fresh bounded source review. Record RED/GREEN evidence, rulings, actual HEAD and inherited failure owners. Required full regression/slow and Linux exact-head delivery evidence remain pending aggregate repair. Keep the plan workspace until all obligations are met.

## Verification

Run: node --test scripts/tests/integration/task-tracker/lib/criteria-revision-session-admission.test.mjs

Expected: every new session authority/effect case plus complete original hook/delegation/binding profiles actually execute and pass. Disabled-domain ordinary behavior remains compatible; invalid authority has zero original session effects.

Run complete original session/occupancy/source-hook regressions, npm run lint, npm run format:check and git log --oneline -1. Preserve full npm test/npm run test:slow and genuine Linux receipt obligations; no inherited or fabricated success.
