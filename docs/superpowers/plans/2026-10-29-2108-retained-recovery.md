<!-- cspell:ignore AIVC -->

# Retained worktree recovery delivery — #2108 / #2014

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. Implementation stays in this session; one independent whole-source Astra/high review follows.

**Goal:** Deliver the existing bounded #2014 recovery capability on current source and complete each issue only through its own genuine acceptance, delivery receipt and Close.

**Architecture:** Port the retained closed-selector recovery action into the existing epic-wave runtime. Reuse immutable wave history, recording-time source verification, genuine current parent/native identity, strict completed-child state and the physical admission lock. One existing-branch Git worktree add is the only recovery effect; uncertainty preserves effects and refs.

**Tech stack:** Existing Node ESM, node:test, Git, npm packaging and AITM native workflow. No dependency or lockfile changes.

**Spec:** Original #2014 Scope and human-approved bounded design in `docs/superpowers/plans/2026-10-14-2014-retained-worktree-recovery.md` at retained commit `17ddbd70e299cb6461ac04f4713afc345edc36a2`. That historical adaptive estimate is excluded. This is a current execution plan for the same behavior, not a new authority design.

## Story Intent

- **Beneficiary:** Delivery operator overseeing epics and their completed child work.
- **Capability:** Restore a genuinely missing retained completed-child checkout through the existing guarded epic-wave flow.
- **Need:** Missing folders prevent safe access/continuation although completed work and its saved branch remain retained.
- **Value or failure prevented:** Regain access without losing refs, overwriting work, manufacturing ownership or changing lifecycle authority.

## Global constraints

- Continue in the attached isolated worktree; preserve all branches, source, ignored evidence, predecessor runtime and historical Unknown.
- Source baseline: actual owned `c5a5eb55c1cf8a2fb459b1476c20a0bf5214149f`; delivered source base `612437c38ce6009fcb3b074a1a0380c0bc279167`. Actual runtime source files match accepted `865bc83b4cfdfdde33ceb360a7a3d3ddd089febf`; fresh native #2107 Test/Review/Close passed.
- #2107 is CLOSED/Done. #2108 reached Plan through registered Refine/Plan. Its native parent edge was removed after the actual parent-stage refusal, matching the other independent deliveries; roadmap, label and resolved #2107 dependency remain.
- No new repair stories, R1, lifecycle skips, arbitrary shell runner, caller-selected paths/branches, foreign identity flags, guard disabling, ref reset/creation, registration pruning or cleanup.
- Do not modify the selected predecessor hook closure. Develop unloaded feature code; qualify the complete selected CLI/source/package and dependencies before native feature use. Do not conflate the scoped hook and source-fallback module URLs.
- Closed input: exactly `schema`, `rank`, `child`, `retainedDigest`, `expectedHead`; schema `aitm.epic-wave-restore-worktree/v1`.
- Current restoring parent and historical recording parent may differ. Verify each in its own source context; never renew historical grants or infer current authorization from a completed child.
- Final real native positive case remains unqualified. Historical AIVC #2 is closed, inspected open candidates lack retained wave records, and local AIVC reads were refused. No alternate transport or manufactured deletion/reopen is authorized by this plan.
- Missing case blocks the wrapper's actual positive recovery outcome. It does not erase original #2014's separate source/package criteria; execute all authorized source/review/package/original gates that can genuinely pass.
- M/6.5h current-scope bottom-up: source/tests 2h, independent review/package/CI 1h, qualified genuine check 1h, two own completion paths 2h, authority/readbacks 0.5h. Waiting and unavailable evidence stay separate Unknown. No GitHub history, comparables or broken rubric.

## Review focus

1. A missing physical root cannot satisfy ordinary live binding observation. Recovery needs the retained-native reader, including genuine host-recorded location after primary-checkout startup; user prose or command strings must not substitute for it.
2. Archived grants must be verified through recording time without admitting new work or renewing expired authority.
3. The current parent must own the open epic, actual native session/generation, timer, repository and recorded physical location; preserved original child identity is not a current claim.
4. Missing stale registrations, conflicting claims and writable/symlinked ancestors refuse before effects. Non-cooperating races after an attempted effect remain indeterminate without cleanup.
5. Public CLI discovery and normal package contents must include the operation. Complete archive/source comparisons and source-qualified dependencies are separate from an actual native restoration.

## Files and interfaces

Create from the exact retained source after the current RED probe:

- `scripts/task-tracker/lib/epic-rank-wave-restore-worktree.mjs` — closed selector, authority, physical checks, one locked effect and exact readback.
- `scripts/tests/helpers/retained-recovery-fixture.mjs` — isolated real Git fixture; never a claimed native canary.
- `scripts/tests/integration/task-tracker/lib/epic-rank-wave-restore-worktree.test.mjs` — real Git restoration/refusal/races plus actual production timer/native-location readers.
- `scripts/tests/unit/task-tracker/lib/epic-rank-wave-restore-parent.test.mjs` — exact parent-observation table and selector refusal.
- `scripts/tests/integration/package/retained-recovery-package.test.mjs` — normal archive inventory/integrity/source parity and supported help.

Modify only the bounded recovery delta in:

- `scripts/task-tracker/lib/epic-rank-wave-bindings.mjs` — preserve ordinary observer and add `observeRetainedRankWaveNative(binding, options)` using native metadata/host-recorded location.
- `scripts/task-tracker/lib/epic-rank-wave-runtime.mjs` — `assertRecoveryParent`, retained-native/claim observations and locked argument-array Git add; existing operations keep their behavior.
- `scripts/task-tracker/lib/epic-rank-wave-store.mjs` — export existing `history` and `verifyHistorySources` without changing their logic.
- `scripts/task-tracker/verbs/epic-wave.mjs` — register and dispatch `restore-worktree`; successful statuses `restored`/`already-restored`, blocked exit 4 and attempted uncertainty exit 6.
- `scripts/task-tracker/lib/command-surface/catalog.mjs` — public operation/contract/positional help includes the recovery selector and unchanged lifecycle boundary.
- `scripts/tests/unit/task-tracker/verbs/epic-wave.test.mjs` — existing operation acceptance table includes recovery and retains closed argument refusal.

These eleven code/test files plus this plan form the initial twelve-file allowlist. Do not copy unrelated retained source, configuration, estimation changes or earlier R1 work. The retained integration file already covers the new native reader; avoid duplicate implementation-mirroring tests.

## Task 1: Port the existing recovery behavior through current RED/GREEN

**Consumes:** Current epic-wave parser/runtime, immutable rank-wave store and the approved retained file bodies above.

**Produces:** `validateWorktreeRestoreSelector(input)`, `verifyWorktreeRecoveryParent(observation)`, `restoreRankWaveWorktree({repository, epic, input, now, runtime})`; typed results preserve refs and uncertain effects.

- [ ] Post/mirror the current deep dive, stamp completion, publish the manual Plan estimate and explicit Full-Auto Plan approval before production edits. Record autonomous approval truthfully.
- [ ] Port only the retained unit operation-table addition first. Run `node --test scripts/tests/unit/task-tracker/verbs/epic-wave.test.mjs`. Expected RED: recovery is rejected with `epic-wave: action`, while existing operations remain valid. Save actual output.
- [ ] Port the four new retained test/helper files before production code. Preserve their literal expectations and real-Git side effects. Module-load failures are recorded separately from the behavioral RED probe, not represented as a successful regression assertion.
- [ ] Port the five production-module deltas and new recovery module from `17ddbd70e299cb6461ac04f4713afc345edc36a2`, after checking each exact diff against current source. Include the retained native reader; retain ordinary physical verification unchanged. In catalog positional arguments append `restore-worktree` to the existing closed public operation list.
- [ ] Run the focused command below. Expected GREEN: restore/idempotence, refs, wrong authority, selector tampering, historical source cutoff, current location, missing/stale registration, unsafe paths, active/uncertain timers, claims, races, and post-effect uncertainty all pass. Keep every failure and fix only source-grounded violations of this Scope.
- [ ] Run the normal package integration test. Require the supported action in public help and exact archive inventory/integrity equality; retain its tamper-negative case. No tests for this human plan prose.
- [ ] Run the existing runtime, bindings, history, source and ordinary epic-wave regression files below. No unrelated cleanup or refactor. Commit the bounded implementation with both `[#2108]` and `[#2014]` attribution.

Focused command:

```sh
node --test scripts/tests/unit/task-tracker/verbs/epic-wave.test.mjs scripts/tests/unit/task-tracker/lib/epic-rank-wave-restore-parent.test.mjs scripts/tests/integration/task-tracker/lib/epic-rank-wave-restore-worktree.test.mjs scripts/tests/unit/task-tracker/lib/epic-rank-wave-bindings.test.mjs scripts/tests/unit/task-tracker/lib/epic-rank-wave-runtime.test.mjs scripts/tests/integration/task-tracker/lib/epic-rank-wave-runtime.test.mjs scripts/tests/integration/task-tracker/lib/epic-rank-wave-recovery.test.mjs scripts/tests/unit/task-tracker/lib/epic-rank-wave-source.test.mjs scripts/tests/integration/package/retained-recovery-package.test.mjs
```

## Task 2: Freeze, review and qualify the actual delivery artifact

**Consumes:** Green owned implementation, the explicit twelve-file allowlist and verified current trunk.

**Produces:** One immutable dual-attributed source commit, exact review, complete package/CLI qualification and full source CI. This does not produce a native positive restoration.

- [ ] Preserve authored Plan/implementation commits. Construct a separate one-commit delivery artifact from verified trunk with exactly the allowlisted current file bytes; do not reset, force, rewrite retained history or select authority with Git environment redirection. The one-source topology permits each issue's own strict receipt after a single provider merge.
- [ ] Verify the candidate's complete changed-file list, parent/tree/source identities and dual attribution. Run focused and whole appropriate checks at that exact artifact. Open a normal PR using `Refs #2014` and `Refs #2108`, never closing keywords; attach it to this chat.
- [ ] Obtain a distinct GPT-6 Astra/high whole-source review of the actual candidate against its base. Supply original Scope, current plan, exact diff, raw RED/GREEN and known native-case limitation. Resolve Critical/Important findings in Scope with real regression tests, retaining every ruling and failed result.
- [ ] Run full exact-source CI with all nine unit/integration/slow receipt artifacts, PR checks and CodeQL. Validate source/digest/attempt/job identity; preserve transport/timing failures. Do not weaken budgets or fabricate cache/receipts. If a whole-source rerun is necessary, all required artifacts must match the current attempt.
- [ ] Derive `npm pack --ignore-scripts --json` from the exact clean source. Record SHA256 and the actual SHA512 integrity; unpack and compare every published file byte to reviewed source. Qualify the complete selected source/CLI runtime and all locked production dependencies, preserving the selected predecessor hook. Report actual module URLs and limitations honestly.
- [ ] Exercise supported CLI help and an authorized native fail-closed recovery request in the current owning context only after review/qualification. A wrong-parent refusal may prove admission preservation; it is not a positive restored-folder result.

## Task 3: Complete original authority, then the actual wrapper outcome

**Consumes:** Exact reviewed/qualified artifact, actual live issue authority and, for positive recovery, a genuinely eligible case.

**Produces:** Separate native completions only where every own requirement passes; otherwise concrete unfinished requirements.

- [ ] Audit original #2014's live Scope, claim, retained worktree and timing. Release only a proven frozen dangling occupancy through the registered action; never edit a foreign actor file/timer or impersonate its SID. Bind original normally and update verifier references to current actual commands without forging proof markers.
- [ ] Verify each original criterion independently on the exact artifact; fresh native Test/Review/Full-Auto approval, own ordinary intent, one sanctioned exact-head provider action and live-verified receipt precede all-eight-step Close. Adopt genuine dual-attributed source into the owned history before acceptance so the timing-outcome reader sees it. Preserve Unknown and every refusal.
- [ ] Re-read original CLOSED/Done, all eight transaction steps and binding release. Update the epic before wrapper acceptance. No original completion is borrowed as wrapper receipt authority.
- [ ] For the wrapper's positive restoration, select a currently open authorized epic and a strict completed direct child with immutable retained wave/source/native lineage, exact existing branch/head/parent ancestry, unchanged recorded destination, absent unregistered target and no conflicting claim. All conditions must be current observations in the actual holder's native context.
- [ ] If that tuple exists, use the supported qualified runtime and registered restore action once; verify exact clean readback, unchanged refs and idempotence through the same action. Preserve partial/uncertain effects. Cross-chat work requires explicit authorization for the identified existing holder; do not create a substitute native identity or manufacture eligibility.
- [ ] If the tuple does not exist, record the precise positive-proof blocker and leave #2108 open. Keep the completed source/package/original work. No reopened finished epic, deleted checkout, pruned registration or fixture output may supply false native proof.
- [ ] Only after genuine Scope completion run wrapper AC/Test/Review/approval, its own strict observed single-source delivery reconstruction and all-eight-step Close, without a second provider merge. Verify CLOSED/Done, retained label and claim release; update epic counts and remaining blockers.

## Plan self-review and operator rulings

The existing approved behavior is unchanged. Native parent-edge correction preserves independent trunk delivery rather than advancing the roadmap epic artificially. The extra retained-native reader was found before implementation and is already exercised by the retained production integration tests. Public positional help is included in the actual delivery path. Original and wrapper receipt authorities remain separate. The genuine positive target is explicitly unqualified, so this plan never equates code/test/package success with restored native work.

Execution is inline under the human's standing instruction to finish these existing issues without another routine approval pause. Native Plan approval is Full-Auto, not human review of this new document. No broader authority boundary or R1 is approved here.
