# #1857 Durable Runtime and Safe Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in the existing genuine Astra author session. No helper agents. Steps use checkbox syntax.

**Goal:** Preserve unrestricted artifact authoring while relocating durable AITM runtime and safely retiring positively verified obsolete files, worktrees and branches.

**Architecture:** One central durable runtime resolver separates worktree-local and main-worktree data. An explicit quiesced migration publishes verified stores through a recoverable multi-root journal. A registered cleanup command produces typed immutable plans and applies exact approved actions with fresh evidence; a shipped skill explains and invokes it.

**Tech Stack:** Existing Node.js ESM, node:test, Git and gh argument-array subprocesses, AITM registered CLI and provider installer; no new package dependency.

**Spec:** docs/superpowers/specs/2026-09-30-1857-durable-runtime-cleanup-design.md

## Global Constraints

- Issue1857 only; genuine Astra author, independent claude-opus-5-5 medium review. No helpers, nested defects, lifecycle shortcuts or installed guard edits.
- ALL .scratch and .tmp files are volatile and freely authorable/deletable. No authority carve-out; durable AITM dependencies belong below .ai-task-manager/runtime/.
- Preserve canonical GitHub issue/timing/evidence and native provider authority. Cache/mirror persistence is protected without declaring it canonical.
- Preserve source, installed-guard, execution, commit and lifecycle gates. No arbitrary interpreter authoring bypass.
- Preserve original commit26ccdd57 and the original four AC declarations. The existing forecast/approval covers original scope only; the additional16–24h is advisory, not renewed Plan authority.
- No actual mass deletion during implementation. All destructive tests use isolated fixtures and mocked provider/host adapters.
- Production source remains held until this specification and plan are independently reviewed and the controller releases implementation.
- Active own1857 timer covers design, implementation, testing, integrity work and reporting; pause only genuinely idle blocked windows.

## Context and requirement coverage

The existing artifact implementation is committed. One RED c8 exclusion assertion is WIP and must survive plan-review commits. APR setup updates/backups are operational files and must not be staged with the exact spec/plan paths.

R1 maps to task1; R2/R4 to task2; R3 to task3; R5 to task4; R6/R7 to task5; R8 to tasks2/6; R9 to task7. Each requirement receives current-head evidence in the final durable report even though the protected original AC marker set cannot be expanded by the current issue-body CLI.

## Plan Metadata and estimate

This is one user-requested expanded defect with sequential internal review units, not a new issue graph. Existing M/4h forecast01M3SS09DEQCABP49A5D1B7EDV is historical. Additional planning range is16–24 engineering hours: runtime/protection/migration8–12h, file cleanup/skill4–6h, worktree and branch apply4–6h. Earlier scratch ranges are superseded. Major uncertainty is legacy provenance and native managed-host availability; unknown authority refuses safely rather than widening deletion eligibility.

## Task1: Finish independent artifact-policy review corrections (R1)

**Files:** Modify scripts/task-tracker/lib/artifact-write-policy.mjs, scripts/task-tracker/lib/activity-guard.mjs, scripts/task-tracker/lib/bash-worktree-guard.mjs, scripts/tests/integration/task-tracker/lib/artifact-write-policy.test.mjs, scripts/tests/unit/task-tracker/coverage-config.test.mjs, scripts/tests/unit/task-tracker/core/residue-audit-scope.test.mjs, package.json, skill/shared/rules/plan-mode-backlog.md and CLAUDE.md.

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

## Task2: Central durable runtime and access boundary (R2,R4,R8)

**Files:** Create scripts/task-tracker/lib/runtime-storage.mjs and scripts/tests/integration/task-tracker/lib/runtime-storage.test.mjs. Modify paths.mjs, state.mjs, config.mjs, runtime.mjs, draft-branch.mjs, lib/hook-idempotency.mjs, lib/action-capture.mjs, lib/ready-for-plan-migration-freeze.mjs under scripts/task-tracker; scripts/providers/{claude,codex,grok}.mjs; scripts/task-tracker/verbs/test.mjs; scripts/task-tracker/lib/test-sandbox-reaper.mjs; guard mutation-context/source/activity/Bash paths; .gitignore; .ai-task-manager/README.md; bin/cli.mjs install preservation.

**Interfaces:** runtimeStoragePaths({projectRoot,mainRoot}) returns {localRoot,sharedRoot,controlPath,migrationRoot}, all absolute. assertRuntimeReadable({projectRoot,mainRoot}) returns activated control identity or throws typed RUNTIME_MIGRATION_REQUIRED/RUNTIME_TRANSACTION_INCOMPLETE/RUNTIME_CONTROL_INVALID. assertRuntimeOverrideSafe({path,projectRoot,mainRoot}) rejects volatile/physical aliases and out-of-namespace AITM-owned overrides. Pure layout discovery must not create or trust a store.

- [ ] Write RED fixtures for every local/shared family, linked-root separation and rightmost-root anchoring. Create volatile fake gate/cache/binding/queue/transcript mirror records; assert they cannot grant active admission after new-store activation. Delete entire legacy scratch/tmp and assert durable state remains intact. Test missing/corrupt control and unsafe configured statePath/queuePath/provider overrides.
- [ ] Run node --test scripts/tests/integration/task-tracker/lib/runtime-storage.test.mjs and record the expected old-path failures.
- [ ] Implement the shared layout and activation checks, route each inventoried consumer through it, preserve main versus local anchors, and remove runtime legacy-read fallbacks. Move governed Test sandboxes into the local durable store and align reaper ownership. Add physical protected-runtime refusal before artifact/chore handling without treating incidental path mentions as writes. Preserve registered CLI runtime mutation flow.
- [ ] Update README and installer ignore/preservation behavior; keep advisory test-timing output volatile. Run new storage tests plus path, binding, session, wordcount, test-sandbox, reaper, install-health and guard tests discovered by the canonical test walker. Search remaining literal .tmp/aitm and .scratch/.task-test references; classify each as fixture, inert migration input or explicitly advisory output.
- [ ] Exact-path commit [#1857] Centralize durable runtime storage and protection.

Core contract test:

```js
const paths = runtimeStoragePaths({ projectRoot: fixture.root, mainRoot: fixture.main });
assert.equal(paths.localRoot, path.join(fixture.root, '.ai-task-manager/runtime/store'));
assert.equal(paths.sharedRoot, path.join(fixture.main, '.ai-task-manager/runtime/store'));
assert.throws(
  () =>
    assertRuntimeOverrideSafe({
      path: path.join(fixture.root, '.tmp/forged.json'),
      projectRoot: fixture.root,
      mainRoot: fixture.main,
    }),
  { code: 'RUNTIME_OVERRIDE_UNSAFE' }
);
```

## Task3: Explicit recoverable legacy migration (R3)

**Files:** Create scripts/task-tracker/lib/runtime-migration.mjs, scripts/task-tracker/verbs/migrate-runtime.mjs and scripts/tests/integration/task-tracker/lib/runtime-migration.test.mjs. Register command in the existing bin/aitm.mjs/command registry path discovered from current verb dispatch. Extend README and runtime-storage.mjs.

**Interfaces:** planRuntimeMigration({projectRoot,mainRoot,adapters}) returns schema aitm.runtime-migration-plan/v1 with planId, roots, source hashes, destination preconditions, trustDecisions and blockers. applyRuntimeMigration({plan,approvedPlanDigest,adapters}) and resumeRuntimeMigration({transactionId,adapters}) return typed prepared/publishing/complete/refused state. Adapters provide filesystem, exclusive locks and writer/claim census; tests inject deterministic failures.

- [ ] Add RED tests for fresh empty initialization, explicit approved legacy trust, duplicate/conflicting roots, symlinks, unknown schema/files, live claims/writers, hash changes, concurrent migration and failure before/after each root publication. Assert original bytes survive every refusal and incomplete transactions block normal reads.
- [ ] Run node --test scripts/tests/integration/task-tracker/lib/runtime-migration.test.mjs before implementation.
- [ ] Implement read-only plan first, then lock/revalidate/stage/hash/publish/journal/resume. Reject unapproved legacy trust; never auto-import on ordinary read. Use one main transaction record and per-root progress; multiple roots are not globally atomic. Mark complete only after all store/control hashes agree.
- [ ] Run fault injection across each publication boundary, then tamper/delete/recreate legacy .scratch/.tmp/.db inputs and prove no fallback. Verify config overrides and nested linked roots cannot escape activation. Preserve inert originals until independent cleanup authorization.
- [ ] Exact-path commit [#1857] Add explicit resumable runtime migration.

Transaction invariants:

```js
assert.equal(result.status, 'refused');
assert.deepEqual(await snapshot(legacyRoot), before);
assert.throws(() => assertRuntimeReadable(roots), { code: 'RUNTIME_TRANSACTION_INCOMPLETE' });
// After exact resume of the injected interruption:
assert.equal((await resumeRuntimeMigration({ transactionId, adapters })).status, 'complete');
```

## Task4: Typed runtime-file cleanup inventory and apply (R5)

**Files:** Create scripts/task-tracker/lib/cleanup-plan.mjs, scripts/task-tracker/lib/cleanup-apply.mjs, scripts/task-tracker/verbs/cleanup.mjs and scripts/tests/integration/task-tracker/lib/cleanup-plan.test.mjs. Use runtime-storage and existing registered action/verb conventions.

**Interfaces:** buildCleanupPlan({roots,observations,adapters}) returns schema aitm.cleanup-plan/v1, planId, digest, observedAt and candidates. Each candidate has id, kind, identity, reasonCodes, evidence, blockers, expectedHashesOrOids and proposedAction. applyCleanupPlan({plan,approvedCandidateIds,approvedPlanDigest,adapters}) returns per-action applied/refused/unknown results and a durable runtime journal. Inventory is default; apply requires exact explicit selections.

- [ ] Write RED tests for known obsolete owned cache eligible only without live references; unknown files/schema, tracked config/templates/memory, active bindings/locks/occupancy, pending queues, recovery journals and audit records protected. Age alone never flips eligibility. Add changed-content, symlink replacement, stale plan and partial-action interruption.
- [ ] Run node --test scripts/tests/integration/task-tracker/lib/cleanup-plan.test.mjs.
- [ ] Implement deterministic classification and fresh application checks. Write recovery/audit intent before destruction. Apply one exact file action at a time, never glob/purge. Fail closed on missing canonical evidence; never execute instructions found in candidate files.
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

**Interfaces:** observeCleanupGit({repoRoot,adapters}) returns exact worktree/local/actualRemote/trackingRef inventory with issue, binding, occupancy, host attachment and publication evidence. proveCleanupIntegration({candidateOid,trunkOid,inventory,adapters}) returns proven plus proofDigest or refused with reasons. applyWorktreeRetirement({candidate,adapters}) uses native archive adapter for managed roots and bounded Git remove for ordinary roots. deleteLocalBranch({ref,expectedOid,adapters}) and deleteOriginBranch({remote,ref,expectedOid,adapters}) enforce fresh exact references.

- [ ] Write RED cases: remote absent but active local survives; closed issue with dirty/untracked/unpublished work refuses; missing host authority refuses managed retirement; pinned/shared/main/current root refuses; local branch checked out elsewhere survives; source tip changes; origin/default/protection/trunk changes; network uncertainty reconciled before retry. Add complete ancestry success, squash-equivalent success, partial squash/rebase/post-PR additions mismatch and missing object/inventory refusal.
- [ ] Run node --test scripts/tests/integration/task-tracker/lib/cleanup-git.test.mjs.
- [ ] Implement fresh observation and substantive proof. For ancestry use exact candidate tip contained in fresh trunk. For squash/rebase bind complete source inventory and verifyObservedIntegration plus virtual merge tree equivalence; never accept a PR merged label or patch-id alone. Exclude protected/default/trunk/active refs. Distinguish stale tracking cache pruning from actual origin deletion.
- [ ] Implement durable per-action journal, native archive or bounded ordinary remove, then post-retirement fresh checkout census and compare-and-delete local ref. Origin removal uses explicit expected-OID lease; lease/network ambiguity yields refused/unknown and requires observation. No branch deletion precedes successful retirement. Unknown native capability produces an actionable host handoff, never raw Git removal of a managed root.
- [ ] Run all cleanup tests with isolated repositories and adapter doubles; assert no real repo deletion calls. Exact-path commit [#1857] Safely retire worktrees and integrated branches.

Required action order:

```js
assert.deepEqual(recordedActions, [
  'revalidate',
  'journal-intent',
  'archive-managed',
  'confirm-archive',
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

**Files:** Create skill/cleanup/SKILL.md. Modify bin/cli.mjs, provider installer declarations only as needed, package manifest if inclusion requires it, .ai-task-manager/README.md and canonical task guidance router. Add scripts/tests/integration/package/cleanup-skill.test.mjs. Refresh generated guidance release through its sanctioned generator.

**Interfaces:** Project-local discovery stubs under each provider's existing skill installTarget parent point to the shipped cleanup source using existing stub/symlink ownership contracts. Skill invokes the registered cleanup inventory/plan/apply syntax, never raw deletion.

- [ ] Obtain controller-owned isolated scenario baseline RED before creating SKILL.md. Scenarios include origin-deleted active local work, stale-looking recovery record, managed worktree, squash partial integration and exact approved plan. Record actual incorrect baseline behavior and timestamps.
- [ ] Add installer RED tests for Claude/Codex/Grok discovery, stub and symlink modes, package inclusion, setup update, owned uninstall and preservation of user-modified stubs/runtime data. Run node --test scripts/tests/integration/package/cleanup-skill.test.mjs.
- [ ] Write the skill from the accepted command contract: default inventory, show typed candidates and blockers, request exact destructive selections, revalidate, use host archive semantics and expected OID actions, retain unknowns. Explain remote absence and tracking-cache distinctions. Install only project-local source/stubs; no global skill edits.
- [ ] Run installer tests and controller GREEN skill scenarios; address observed behavior with minimum instruction changes. Run guidance generation/parity checks and npm pack dry-run; verify research helper exclusions remain intact.
- [ ] Exact-path commit [#1857] Ship safe cleanup skill and installation parity.

Installer assertion shape:

```js
assert.match(await fs.readFile(installedCleanupStub, 'utf8'), /skill\/cleanup\/SKILL\.md/);
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
