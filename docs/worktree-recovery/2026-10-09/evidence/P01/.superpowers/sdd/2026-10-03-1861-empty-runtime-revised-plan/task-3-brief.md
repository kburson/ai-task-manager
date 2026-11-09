### Task 3: Admit main proof and explicit linked-v2 without losing history

#### Story Intent

- **Beneficiary:** AITM operator using linked worktrees
- **Capability:** distinguish a fresh uninitialized root from loss of protected authority
- **Need:** active main and census membership do not grant local runtime authority
- **Value or failure prevented:** lost or recreated roots cannot silently regain old grants or erase recovery history

#### Files

Create activation-admission module and `runtime-activation-admission.test.mjs`; modify `runtime-storage.mjs`, `runtime-initialization-record.mjs`, `runtime-initialize.mjs`, `runtime-initialization-recovery.mjs`; extend existing initialize/initialization-crash tests.

#### Interfaces

- Produces sync `readRuntimeActivationRoot({ projectRoot, mainRoot })` exported from storage, delegating to low-level main-proof validation. Result schema `aitm.runtime-activation-observation/v1`, mainRoot, activation `{kind,id,digest}`, originalRoots and originalRootIdentities. It validates main complete journal/control/catalog/batch admission only; it does not grant caller local admission.
- Retains sync `planRuntimeInitialization(input)` and async `applyRuntimeInitialization(input)`, `resumeRuntimeInitialization(input)`; planning dispatches migration-v1 or empty-v2 only against a validated real main proof.
- Linked-v2 plan/journal schemas `aitm.runtime-initialization-plan/v2`, `aitm.runtime-initialization/v2`; deterministic root ID, operation UUID, physical linked identity, fixed local records, source policy, actual main activation and digest. Protected path remains `runtime/initializations/<runtimeInitializationId(projectRoot)>.json`; `runtimeInitializationId` remains SHA-256 of canonical physical root.
- Linked control v2 adds only `initialization: {id,operationId,digest}` to the common v2 fields, required iff linked. v1 migration plans/journals/controls remain supported unchanged.

- [ ] **Step 1: Add RED for main-only observation and missing local classification.**

```js
assert.equal(
  readRuntimeActivationRoot({ projectRoot: linked, mainRoot: root }).activation.kind,
  'empty-initialization'
);
assert.throws(
  () => assertRuntimeReadable({ projectRoot: linked, mainRoot: root }),
  (error) => error.code === 'RUNTIME_INITIALIZATION_REQUIRED'
);
const linkedPlan = planRuntimeInitialization({ projectRoot: linked, mainRoot: root });
assert.equal(linkedPlan.schema, 'aitm.runtime-initialization-plan/v2');
assert.equal(linkedPlan.id, runtimeInitializationId(linked));
assert.deepEqual(linkedPlan.activation, mainObservation.activation);
```

Exercise a root registered before main planning and one registered afterward. Confirm no linked writes during main apply; explicit linked publication writes only its two local fixed records and protected main-owned root journal. Validate journal complete before active control and no inherited main/census grant.

- [ ] **Step 2: Add RED table for absent main, incomplete main, corrupt/partial-loss main, original root loss, prepared/complete v1/v2 history, local residue, malformed/unreadable history and activation mismatch.** Expect pristine absent main `RUNTIME_MIGRATION_REQUIRED`, incomplete main `RUNTIME_TRANSACTION_INCOMPLETE`, corrupt/lost/history root `RUNTIME_CONTROL_INVALID`; only active valid main plus nonoriginal root, exact absent history and no local residue yields `RUNTIME_INITIALIZATION_REQUIRED`.
- [ ] **Step 3: Implement closed activation/control/linked validators and read admission without a storage cycle.** Storage retains physical resolution/path assertion and ordinary admission; low-level activation proof module consumes those primitives through internal arguments and pure record validators. Migration activation uses its real complete manifest; empty activation uses its real complete empty journal. Compare actual physical original/local identities, required catalog records and pending batch admission. Never synthesize a migration transaction or treat main observation as local authority.
- [ ] **Step 4: Extend linked publication/recovery v2 while preserving v1 route.** Add sync linked inspection to expose root-keyed history/observed digest; v2 resume requires UUID/observed/approved digests derived from invoking physical root. Never operation-search another root, overwrite old history or change the v1 approval-only grammar. Real killed-process tests cover linked prepared/journal-complete/active-control and killed recovery ownership.
- [ ] **Step 5: Pin same-path recreation refusal.**

```js
const originalJournal = readFileSync(journalFile);
// Fixture-only: remove/recreate and register the linked worktree at the same path.
assert.notEqual(recreatedGitDir, originalGitDir);
assert.throws(
  () => planRuntimeInitialization({ projectRoot: linked, mainRoot: root }),
  (error) => error.code === 'RUNTIME_CONTROL_INVALID' && error.message.includes('history')
);
assert.deepEqual(readFileSync(journalFile), originalJournal);
```

Retain a fixture C3 retirement receipt and assert the same refusal; never grant reuse based on it. Status points to exact history/recovery/restoration or a genuinely unused separately admitted path. Preserve histories and don't prune registered worktrees to force success.

- [ ] **Step 6: Run affected GREEN and v1 golden compatibility, lint/format and preservation; commit admitted Task 3 hunks.** Update the interface handoff; C3 protects both namespaces and C4 documents same-path/selective-loss limits later.

#### Verification Commands

Run: `node --test scripts/tests/integration/task-tracker/lib/runtime-activation-admission.test.mjs`

Canonical TIA-selected activation-admission/initialize/initialization-crash/publication-validation and v1 migration tests; scoped lint/format.

