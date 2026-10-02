# #1857 Durable Runtime and Safe Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in the existing genuine Astra author session. No helper agents. Steps use checkbox syntax.

**Goal:** Preserve unrestricted artifact authoring while relocating durable AITM runtime and safely retiring positively verified obsolete files, worktrees and branches.

**Architecture:** One central durable runtime resolver separates worktree-local and main-worktree data. An explicit quiesced migration publishes verified stores through a recoverable multi-root journal. A registered cleanup command produces typed immutable plans and applies exact approved actions with fresh evidence; a shipped skill explains and invokes it.

**Tech Stack:** Existing Node.js ESM, node:test, Git and gh argument-array subprocesses, AITM registered CLI and provider installer; no new package dependency.

**Spec:** docs/superpowers/specs/2026-09-30-1857-durable-runtime-cleanup-design.md

## Global Constraints

- Issue #1857 only; genuine Astra author, independent claude-opus-5-5 medium review. No helpers, nested defects, lifecycle shortcuts or installed guard edits.
- ALL .scratch and .tmp files are volatile and freely authorable/deletable. No authority carve-out; durable AITM dependencies belong below .ai-task-manager/runtime/.
- Preserve canonical GitHub issue/timing/evidence and native provider authority. Cache/mirror persistence is protected without declaring it canonical.
- Preserve source, installed-guard, execution, commit and lifecycle gates. No arbitrary interpreter authoring bypass.
- Preserve original commit 26ccdd57 and the original four AC declarations. The existing forecast/approval covers original scope only; the additional 24–36h is advisory, not renewed Plan authority.
- No actual mass deletion during implementation. All destructive tests use isolated fixtures and mocked provider/host adapters.
- Production source remains held until this specification and plan are independently reviewed and the controller releases implementation.
- Active own1857 timer covers design, implementation, testing, integrity work and reporting; pause only genuinely idle blocked windows.

## Context and requirement coverage

The existing artifact implementation is committed. One RED c8 exclusion assertion is WIP and must survive plan-review commits. APR setup updates/backups are operational files and must not be staged with the exact spec/plan paths.

R1 maps to task1; R2/R4 to tasks2a/2b/3; R3 to task3; R5 to task4; R6/R7 to task5; R8 to tasks2/6; R9 to task7. Each requirement receives current-head evidence in the final durable report even though the protected original AC marker set cannot be expanded by the current issue-body CLI.

## Accepted spec section traceability

| Accepted spec section                   | Implementation and proof                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Scope/Story Intent/Existing evidence    | Global constraints, tasks1–7, no actual mass deletion                                                 |
| Storage/access                          | Task2b family inventory, physical protection, installer preservation                                  |
| Root identity/corruption/persistence    | Task2a all aliases/readers/fixtures; Task2b exact anchoring/corruption; Task3 explicit initialization |
| Explicit migration                      | Task3 hash/census/fence/publication/resume fault matrix                                               |
| Migration bootstrap/quiescence/recovery | Task3 hooked crash-resume, process death and timing reconciliation                                    |
| Artifact review corrections             | Task1 installed .md/alias interlocks, suffix/guidance/research tests                                  |
| Cleanup skill and command               | Task4 immutable plan/apply protections; Task6 adapters/collisions/scenario GREEN                      |
| Worktree retirement/branch pruning      | Task5 host handoff/receipt, ordinary removal, exact refs/leases                                       |
| Full-content proof                      | Task5 ancestry and complete squash/rebase proof matrix                                                |
| Repository policy observation           | Task7 durable audit, controller fresh GET not deletion authority                                      |
| Requirements/workflow/verification      | Task7 R1–R9 evidence and normal exact-SHA gates                                                       |
| Estimate/root-reader conversion risk    | Advisory range below; Task2a measured fixture inventory                                               |

## Plan Metadata and estimate

This is one user-requested expanded defect with sequential internal review units, not a new issue graph. Existing M/4h forecast 01M3SS09DEQCABP49A5D1B7EDV is historical. Additional planning range is 24–36 engineering hours: runtime/protection/bootstrap/migration 14–20h, file cleanup and provider skill parity 4–6h, worktree/origin cleanup and proof 6–10h. Earlier 16–24h scratch ranges are superseded. Roughly 90 test files / 215 root-override references require classification and fixture conversion within the runtime slice, a material upper-bound risk; reassess from measured work instead of claiming forecast certainty. Major uncertainty is legacy provenance and native managed-host availability; unknown authority refuses safely rather than widening deletion eligibility.

## Task1: Finish independent artifact-policy review corrections (R1)

**Files:** Modify scripts/task-tracker/lib/artifact-write-policy.mjs, scripts/task-tracker/activity-guard.mjs, scripts/task-tracker/lib/bash-worktree-guard.mjs, scripts/tests/integration/task-tracker/lib/artifact-write-policy.test.mjs, scripts/tests/unit/task-tracker/coverage-config.test.mjs, scripts/tests/unit/task-tracker/core/residue-audit-scope.test.mjs, package.json, skill/shared/rules/plan-mode-backlog.md and CLAUDE.md.

**Interfaces:** Retain existing artifact target and shell inspection API; extend explicit docs suffix policy only. All installed-target decisions continue consuming physical resolution.

- [ ] Add RED installed guard tests using a real installed-tree .scratch/protected.md and physical symlink aliases through activity, source-edit runHook and Bash binding. Assert refusal is the installed-target interlock, not docs suffix refusal. Add .mts/.cts/.ksh/.php/.lua docs refusals and scratch/temp allowance matrix. Keep the existing RED coverage exclusion assertion.
- [ ] Run node --test scripts/tests/integration/task-tracker/lib/artifact-write-policy.test.mjs scripts/tests/unit/task-tracker/coverage-config.test.mjs and save actual failures.
- [ ] Extend the explicit suffix Set, add scripts/research/** to c8 exclusions, repair old docs-script fixture path, reconcile shipped guidance and CLAUDE literal-writer wording. Remove the redundant direct scratch and WRITE_SCRATCH activity branches only after shared decision-path tests cover them; correct FS-aware header/import wording.
- [ ] Run the task tests and the existing source/activity/Bash compatibility contracts. Inspect seven research helper bytes against the original commit.
- [ ] Exact-path commit [#1857] Close artifact policy review gaps. Exclude APR setup and review documents.

Regression shape:

```js
for (const extension of ['.mts', '.cts', '.ksh', '.php', '.lua']) {
  assert.equal(checkTarget('docs/example' + extension).allowed, false);
  assert.equal(checkTarget('.scratch/example' + extension).allowed, true);
}
```

Here checkTarget is the existing fixture adapter around the production policy, not a replacement policy.

## Task2a: Validated root identity and direct-reader conversion (R2,R4)

**Files:** Create scripts/task-tracker/lib/runtime-storage.mjs and scripts/tests/integration/task-tracker/lib/runtime-storage.test.mjs; add scripts/tests/unit/task-tracker/lib/project-root-readers.test.mjs. Modify scripts/task-tracker/paths.mjs, lib/project-dir.mjs, lib/worktree-binding-guard.mjs, lib/worktree-binding-lifecycle.mjs, word-counter.mjs, epic-base-edit-guard.mjs, commit-trail-handler.mjs and lib/scratch-dir.mjs. Convert classified affected test fixtures.

**Interfaces:** Export PROJECT_ROOT_ALIASES = ['AI_TASK_MANAGER_PROJECT_DIR','TASK_TRACKER_PROJECT_DIR','CLAUDE_PROJECT_DIR'] and resolveRuntimeRoot({cwd,env,selectionPolicy,foreignWorktreeAdmission,adapters}). It returns {projectRoot,mainRoot,worktreeIdentity}, or typed ROOT_OVERRIDE_UNSAFE/ROOT_IDENTITY_MISMATCH. Resolve physical Git identity independently of overrides; selectionPolicy declares existing intentional precedence without adding another reader. Test adapters are injected in test processes; no production environment bypass exists.

- [ ] Inventory all production PROJECT_DIR root reads and roughly 90 fixture files / 215 references. Classify each fixture as real safe Git-root integration, injected-root unit test or environment forwarding; record exact conversion list and observed cost.
- [ ] Write RED tests for all aliases and future-table additions: physical same root succeeds; explicit registered foreign root succeeds only with foreign admission; docs/scratch/tmp descendants, nested Git repos inside them and symlink aliases refuse before any forged activated store is read. Add conflicting identity, unchecked fallback and missing foreign authority cases.
- [ ] Add source characterization RED cases for direct process.env, injected env, destructuring and computed known PROJECT_DIR keys outside the resolver. The check scans production modules and rejects unclassified root selection; explicit Test launcher forwarding is allowed only as forwarding, with consumption validated by the resolver.
- [ ] Run node --test scripts/tests/integration/task-tracker/lib/runtime-storage.test.mjs scripts/tests/unit/task-tracker/lib/project-root-readers.test.mjs; record actual reds.
- [ ] Implement one resolver and route all seven direct readers plus paths.mjs through it. Convert fixtures according to their classification, preserving their behavioral intent. Do not mechanically turn every fake root into a Git repo or relax production checks for tests.
- [ ] Rerun both tests plus affected binding/wordcount/commit/epic/scratch tests from the canonical walker. Exact-path commit [#1857] Validate runtime root identity across all readers.

Contract assertions use the exported alias table:

```js
for (const alias of PROJECT_ROOT_ALIASES) {
  assert.throws(
    () =>
      resolveRuntimeRoot({
        cwd: safeGitRoot,
        env: { [alias]: forgedScratchGitRoot },
        selectionPolicy: [alias],
        foreignWorktreeAdmission: null,
        adapters,
      }),
    { code: 'ROOT_OVERRIDE_UNSAFE' }
  );
}
```

The fixture adapters expose realpath, Git worktree census and source-read spies; assert the forged control file is never opened.

## Task2b: Durable store relocation, anchoring and guard precedence (R2,R4,R8)

**Files:** Extend runtime-storage.mjs/runtime-storage.test.mjs. Modify paths.mjs, state.mjs, config.mjs, runtime.mjs, draft-branch.mjs, lib/hook-idempotency.mjs, lib/action-capture.mjs, lib/ready-for-plan-migration-freeze.mjs under scripts/task-tracker; scripts/providers/{claude,codex,grok}.mjs; scripts/task-tracker/verbs/test.mjs; lib/test-sandbox-reaper.mjs; lib/mutation-context.mjs, source-edit-gate.mjs, activity-guard.mjs and lib/bash-worktree-guard.mjs; .gitignore; .ai-task-manager/README.md; bin/cli.mjs install preservation.

**Interfaces:** runtimeStoragePaths({projectRoot,mainRoot}) returns absolute {localRoot,sharedRoot,controlPath,migrationRoot}. assertRuntimeReadable({projectRoot,mainRoot}) returns activated control identity or typed RUNTIME_MIGRATION_REQUIRED/RUNTIME_TRANSACTION_INCOMPLETE/RUNTIME_CONTROL_INVALID/RUNTIME_STATE_CORRUPT. assertRuntimeOverrideSafe({path,projectRoot,mainRoot}) rejects configured volatile/alias/out-of-namespace targets. Pure layout discovery never creates or trusts a store. Task3 owns explicit initialization/activation; this commit is not deployed independently before Task3 recovery is available.

- [ ] Write RED tests for every local/shared family and nested linked-root separation. projectDirForState must match the rightmost exact /.ai-task-manager/runtime/store/ container and verify the physical owner from Task2a. Test nested durable Test sandbox state, sessions, gates and queue all remain sandbox-local.
- [ ] Add REDs for malformed JSON, unsupported schemas, partially missing activated records, and old .tmp/aitm / legacy loadState fallbacks. Required records refuse; documented optional empty records confer no binding/gates. Complete-runtime loss is explicit empty initialization plus canonical reconciliation, not automatic inherited authority.
- [ ] Add forged volatile gate/cache/binding/queue/transcript tests; delete/recreate/tamper all legacy scratch/tmp and assert new-store authority is unchanged. Test configured overrides physically. Direct runtime writes refuse before artifact/chore allowances while ordinary volatile authoring stays free.
- [ ] Run node --test scripts/tests/integration/task-tracker/lib/runtime-storage.test.mjs before minimal implementation.
- [ ] Route every inventoried runtime consumer through the new layout. Remove .tmp/aitm anchoring and production loadState legacy fallback; replace corrupt-JSON-to-{} with typed refusal. Move Test sandboxes under the durable local store and align reaper. Validate AI_TASK_MANAGER_PROJECT_DIR: wtPath as a fresh Git-registered sandbox identity using Task2a; never inherit parent state.
- [ ] Document worktree/main persistence, native/GitHub canonical sources, ignored-store loss and explicit initialization, access rules and migration. Installer/update preserves runtime bytes; advisory run-tests timing remains volatile.
- [ ] Run storage/root-reader, path, binding, session, wordcount, sandbox, reaper, install and guard tests. Inventory residual .tmp/aitm references as migration-only input, inert fixture or advisory output. Exact-path commit [#1857] Relocate durable runtime and enforce owner anchoring.

```js
const paths = runtimeStoragePaths({ projectRoot: sandboxRoot, mainRoot });
assert.equal(paths.localRoot, path.join(sandboxRoot, '.ai-task-manager/runtime/store'));
assert.equal(
  projectDirForState(path.join(paths.localRoot, 'state/task-tracker-state.json')),
  sandboxRoot
);
assert.throws(() => assertRuntimeReadable({ projectRoot: corruptRoot, mainRoot }), {
  code: 'RUNTIME_STATE_CORRUPT',
});
```

## Task3: Explicit migration bootstrap, fencing and recovery (R3,R4)

**Files:** Create scripts/task-tracker/lib/runtime-migration.mjs, lib/runtime-migration-admission.mjs, verbs/migrate-runtime.mjs and scripts/tests/integration/task-tracker/lib/runtime-migration.test.mjs. Modify bin/aitm-registry.mjs, scripts/task-tracker/task-tracker.mjs, verbs/help-data.mjs and lib/command-surface/catalog.mjs for the registered command; bash-guard.mjs, lib/activity-policy.mjs and lib/bash-worktree-guard.mjs for exact bootstrap admission; runtime-storage.mjs and all runtime writer entrypoints for fence checks; README recovery instructions.

**Interfaces:** classifyRuntimeMigrationInvocation({argv,executable,physicalRoots}) returns null or a closed plan/status/apply/resume descriptor after verifying the registered executable, grammar, roots and installed integrity. Bootstrap executes before runtime-dependent binding/gate reads. planRuntimeMigration({projectRoot,mainRoot,adapters}) returns aitm.runtime-migration-plan/v1 with exact root census, hashes, destination preconditions, trust decisions and blockers. applyRuntimeMigration({plan,approvedPlanDigest,adapters}) and resumeRuntimeMigration({transactionId,approvedPlanDigest,adapters}) return prepared/publishing/complete/refused/recovery-required. status is read-only. Adapters supply FS, genuine identity, writer census, locks, fencing/drain, timing publication and fault injection.

- [ ] Write RED closed-grammar guard tests: real registered plan/status/apply/resume reach bootstrap during incomplete publication, while ordinary lifecycle commands fail closed. Wrong executable, compound suffixes, arbitrary wrappers, incidental mentions and invalid physical root do not gain admission. Apply/resume require approved digest, explicit legacy trust and migration ownership.
- [ ] Write RED preservation/fault tests: fresh empty initialization, complete loss with canonical reconciliation/no grants, ambiguous sources, symlinks, unknown schema/files, changed hashes, live other claims/writers, uncooperative older processes, root census drift and concurrent migrations. Missing/corrupt partial stores refuse.
- [ ] Run node --test scripts/tests/integration/task-tracker/lib/runtime-migration.test.mjs and preserve actual red evidence.
- [ ] Implement read-only plan/status and exclusive main lock. Authenticate exact genuine migrator session/process as the sole bounded writer exception; fence every participating root, drain in-flight writes and reject other live writers before source hashes. New/missing roots invalidate the plan. Preserve legacy bytes; stage/hash/publish per root with durable progress, never claim multi-root atomic rename.
- [ ] Record engaged migrator time in a protected transaction audit ledger while fenced without pausing working time or changing hashed legacy timing queues. On activation reconcile/publish once using an idempotency record; retain unresolved publication work. Preserve other sessions and queued work accurately. Lock recovery requires confirmed process death plus exact transaction identity, never age alone.
- [ ] Implement resume with exact prepared/published hashes and all-root verification before activation. No auto-import or volatile fallback. Document same registered CLI from a physical-worktree local terminal if host hook transport fails; unreadable package/control/storage produces recovery-required for exact package/backup restoration, never JSON editing, guard disabling or empty initialization.
- [ ] Run the mandatory hooked integration: engaged migrator, crash after first root publication, ordinary hooked command refusal, fresh genuine session registered status/resume success, preserved timing/queues, exactly-once engagement reconciliation. Fault every publication boundary and tamper legacy inputs after activation. Run Task2 suites again.
- [ ] Exact-path commit [#1857] Add fenced migration bootstrap and recoverable activation. Runtime Tasks2a/2b/3 must be verified together before cleanup apply or deployment is enabled.

```js
assert.equal(await hookedInvoke(ordinaryLifecycleArgv), 'RUNTIME_TRANSACTION_INCOMPLETE');
assert.equal((await hookedInvoke(registeredStatusArgv)).status, 'publishing');
assert.equal((await hookedInvoke(registeredResumeArgv)).status, 'complete');
assert.equal(timingPublisher.callsFor(transactionId).length, 1);
assert.deepEqual(await snapshotLegacyBytes(), originalLegacyBytes);
```

hookedInvoke drives the actual guard classifier and registered handler in an isolated real-Git fixture; its allowed identity/FS/process adapters are test injection, not environment escape switches.

## Task4: Typed runtime-file cleanup inventory and apply (R5)

**Files:** Create scripts/task-tracker/lib/cleanup-plan.mjs, scripts/task-tracker/lib/cleanup-apply.mjs, scripts/task-tracker/verbs/cleanup.mjs and scripts/tests/integration/task-tracker/lib/cleanup-plan.test.mjs. Use runtime-storage and existing registered action/verb conventions.

**Interfaces:** buildCleanupPlan({roots,observations,adapters}) returns schema aitm.cleanup-plan/v1, planId, digest, observedAt and candidates. Each candidate has id, kind, identity, reasonCodes, evidence, blockers, expectedHashesOrOids and proposedAction. applyCleanupPlan({plan,approvedCandidateIds,approvedPlanDigest,adapters}) returns per-action applied/refused/unknown results and a durable runtime journal. Inventory is default; apply requires exact explicit selections.

- [ ] Write RED tests for known obsolete owned cache eligible only without live references; unknown files/schema, tracked config/templates/memory, active bindings/locks/occupancy, pending queues, recovery journals and audit records protected. Age alone never flips eligibility. Assert runtime root, control record, store root and recovery namespace never become deletion candidates, even with explicit selection or stale-looking contents. Add changed-content, symlink replacement, stale plan and partial-action interruption.
- [ ] Run node --test scripts/tests/integration/task-tracker/lib/cleanup-plan.test.mjs.
- [ ] Implement deterministic classification and fresh application checks. Write recovery/audit intent before destruction. Apply one exact file action at a time, never glob/purge. Hard-refuse runtime-root/control/store-root/recovery-namespace selections before any action intent. Fail closed on missing canonical evidence; never execute instructions found in candidate files.
- [ ] Verify dry inventory changes no bytes, selections exclude protected IDs, rerun/resume reconciles already-applied actions without treating absence as blanket permission, and installer/tracked data remain intact.
- [ ] Exact-path commit [#1857] Add evidence-bound runtime cleanup plans.

Predicate example:

```js
const plan = await buildCleanupPlan({ roots, observations, adapters });
assert.equal(plan.candidates.find((c) => c.id === activeLockId).proposedAction, 'retain');
assert.ok(plan.candidates.find((c) => c.id === unknownFileId).blockers.includes('unknown-schema'));
```

## Task5: Worktree retirement and local/origin branch apply (R6,R7)

**Files:** Create scripts/task-tracker/lib/cleanup-git.mjs and scripts/tests/integration/task-tracker/lib/cleanup-git.test.mjs. Extend cleanup-plan/cleanup-apply; consume lib/delivery-integration-proof.mjs and extract/reuse the Git-backed content comparator from deliver.mjs without changing its proof semantics.

**Interfaces:** observeCleanupGit({repoRoot,adapters}) returns exact worktree/local/actualRemote/trackingRef inventory with issue, binding, occupancy, host attachment and publication evidence. proveCleanupIntegration({candidateOid,trunkOid,inventory,adapters}) returns proven plus proofDigest or refused with reasons. applyWorktreeRetirement({candidate,adapters}) returns a typed native-host handoff for Codex managed roots and uses bounded Git remove only for proven ordinary roots. reconcileHostArchive({handoffId,receipt,observations,adapters}) validates the host result and fresh evidence before permitting local branch pruning; it never trusts a caller-provided success boolean. deleteLocalBranch({ref,expectedOid,adapters}) and deleteOriginBranch({remote,ref,expectedOid,adapters}) enforce fresh exact references.

- [ ] Write RED cases: remote absent but active local survives; closed issue with dirty/untracked/unpublished work refuses; missing host authority refuses managed retirement; pinned/shared/main/current root refuses; local branch checked out elsewhere survives; source tip changes; origin/default/protection/trunk changes; network uncertainty reconciled before retry. Add Codex handoff/receipt round-trip, missing/mismatched/forged receipt, unavailable capability, Claude managed-root and uncertain-classification refusal REDs. Add complete ancestry success, squash-equivalent success, partial squash/rebase/post-PR additions mismatch and missing object/inventory refusal.
- [ ] Run node --test scripts/tests/integration/task-tracker/lib/cleanup-git.test.mjs.
- [ ] Implement fresh observation and substantive proof. For ancestry use exact candidate tip contained in fresh trunk. For squash/rebase bind complete source inventory and verifyObservedIntegration plus virtual merge tree equivalence; never accept a PR merged label or patch-id alone. Exclude protected/default/trunk/active refs. Distinguish stale tracking cache pruning from actual origin deletion.
- [ ] Implement durable per-action journal and provenance plus physical-root host classification. For Codex, emit native-host handoff binding plan/candidate, exact list_artifacts identityKey, worktree/branch/OID and required pre/post observations; the active host invokes archive_worktree and provides actual receipt. Revalidate receipt and observable retirement before fresh checkout census and compare-delete local ref. Missing capability/attachment authority stays protected with native-archive-unavailable and actionable handoff. Claude managed roots stay protected with unsupported-host-archive; uncertain classification is protected. Ordinary roots alone use bounded Git removal. AITM CLI never shells out to simulate the host API. Origin removal uses explicit expected-OID lease; lease/network ambiguity yields refused/unknown and requires observation. No branch deletion precedes successful retirement. Unknown native capability produces an actionable host handoff, never raw Git removal of a managed root.
- [ ] Run all cleanup tests with isolated repositories and adapter doubles; assert no real repo deletion calls. Exact-path commit [#1857] Safely retire worktrees and integrated branches.

Required action order:

```js
assert.deepEqual(recordedActions, [
  'revalidate',
  'journal-intent',
  'emit-host-handoff',
  'revalidate-host-receipt',
  'refresh-worktree-census',
  'compare-delete-local-ref',
]);
assert.equal(
  (await proveCleanupIntegration({ candidateOid: partialReplay, trunkOid, inventory, adapters }))
    .proven,
  false
);
```

## Task6: Ship cleanup skill and provider/install parity (R8)

**Files:** Create skill/cleanup/SKILL.md and skill/cleanup/adapters/{claude,codex,grok}/SKILL.md. Modify bin/cli.mjs, provider installer declarations only as needed, package manifest if inclusion requires it, .ai-task-manager/README.md and canonical task guidance router. Add scripts/tests/integration/package/cleanup-skill.test.mjs. Refresh generated guidance release through its sanctioned generator.

**Interfaces:** Discovery name aitm-cleanup at .claude/skills/aitm-cleanup/, .agents/skills/aitm-cleanup/ and .grok/skills/aitm-cleanup/. Symlink mode targets the corresponding skill/cleanup/adapters/<provider>/ directory. Stub mode writes name: aitm-cleanup, cleanup trigger description and pointer to that installed package provider adapter using existing package resolution. Each adapter loads ../../SKILL.md, then the provider task adapter only when lifecycle/binding guidance is required. Existing task adapters stay unchanged. Skill invokes registered cleanup inventory/plan/apply, never raw deletion.

- [ ] Read and preserve the already completed controller-owned isolated scenario RED baseline at .scratch/1857-cleanup-skill-baseline-{result.json,process.json,audit.md} before creating SKILL.md. Scenarios include origin-deleted active local work, stale-looking recovery record, managed worktree, squash partial integration and exact approved plan. Record actual incorrect baseline behavior and timestamps.
- [ ] Add installer RED tests for Claude/Codex/Grok discovery, stub and symlink modes, package inclusion, setup update, owned uninstall and preservation of user-modified stubs/runtime data. For every provider and both modes, unowned directory, user-modified stub or unrelated symlink yields atomic typed collision with no write; uninstall removes exact owned manifest entries only and preserves user additions. Run node --test scripts/tests/integration/package/cleanup-skill.test.mjs.
- [ ] Write canonical skill and the three provider adapters from the accepted command contract: default inventory, show typed candidates and blockers, request exact destructive selections, revalidate, use host archive semantics and expected OID actions, retain unknowns. Explain remote absence and tracking-cache distinctions. Install only project-local source/stubs; no global skill edits. Distinguish planned/handoff actions from actually applied and observed results, addressing the genuine baseline reporting failure.
- [ ] Run installer tests and controller GREEN skill scenarios; address observed behavior with minimum instruction changes. Run guidance generation/parity checks and npm pack dry-run; verify research helper exclusions remain intact.
- [ ] Exact-path commit [#1857] Ship safe cleanup skill and installation parity.

Installer assertion shape:

```js
assert.ok(
  (await fs.readFile(installedCleanupStub, 'utf8')).includes(
    `skill/cleanup/adapters/${provider}/SKILL.md`
  )
);
assert.equal(await hashFile(userModifiedStub), originalUserHash);
assert.equal(await hashFile(runtimeEvidence), originalEvidenceHash);
```

## Task7: Verify all expanded requirements and hand off (R9)

- [ ] Use registered issue-body to record plain Scope obligations R1–R9 and ordinary new VC IDs without changing any protected marker or original AC bytes. Publish owned expanded-design audit with exact spec/plan digests and review result. No fresh adaptive forecast/Plan approval claim.
- [ ] Run all targeted runtime/migration/cleanup/install tests, original artifact/guard compatibility suites, complete fast/integration/slow lanes, lint and format. Use registered verify-develop iteration/final modes according to live CLI help; any new failure receives a source-grounded diagnosis and RED fix cycle.
- [ ] Recheck runtime reference inventory and requirement coverage. Report command/log/exit evidence per R1–R9, installed interlock mutation sensitivity, migration failure recovery and skill baseline/GREEN evidence. Check all source commits and ignored runtime data.
- [ ] Obtain exact committed-SHA final receipt and independent code review for the expanded diff. Preserve old original-scope receipt as historical only. Normal Develop/Test/Review/delivery gates still apply.
- [ ] Write .scratch/1857-implementation-report.md with exact commits, tests, timing, known limitations and unchecked items; pause/release on controller handoff and report CODE_COMPLETE. Controller owns Review, delivery and close.

No task authorizes deleting current repository assets. No unknown evidence becomes zero cost, successful proof or cleanup permission.
