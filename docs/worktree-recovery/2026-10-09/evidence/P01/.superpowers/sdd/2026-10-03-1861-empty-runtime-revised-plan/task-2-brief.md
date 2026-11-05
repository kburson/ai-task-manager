### Task 2: Publish and recover one protected main empty outcome

#### Story Intent

- **Beneficiary:** AITM runtime recovery operator
- **Capability:** complete or inspect the exact empty activation after process death
- **Need:** journal, staging, store and control publication can be interrupted
- **Value or failure prevented:** readers never consume partial authority and recovery never overwrites conflicting bytes

#### Files

Create `runtime-empty-initialize.mjs`, `runtime-empty-recovery.mjs`, `runtime-empty-initialize.test.mjs`, `runtime-empty-crash.test.mjs`; complete closed validators in `runtime-empty-record.mjs`; modify only required coordinator interfaces in `runtime-migration-lock.mjs` and extend coordinator recovery tests.

#### Interfaces

- Consumes Task 1 plan/census/digest/fixed records, exclusive/atomic/fsynced record publishers, owner observation and confirmed exact-owner death. Add async `withRuntimeBootstrapCoordinator({ projectRoot, mainRoot, adapters }, operation)` in the lock module: authenticate the genuine bootstrap owner, use the existing physical main coordinator location with `coordinated(..., { awaitOperation: true })`, await the full census/publication callback under exclusion, and release according to the existing protected owner rules. This bootstrap wrapper does not create an ordinary writer lease or waive writer census. Existing `withRuntimeStoreLockSync` retains its Promise-misuse refusal/evidence.
- Produces async `applyEmptyRuntimeInitialization({ plan, approvedPlanDigest, adapters })`; sync `inspectEmptyRuntimeInitialization({ projectRoot, mainRoot, operationId })`; async `resumeEmptyRuntimeInitialization({ projectRoot, mainRoot, operationId, observedDigest, approvedPlanDigest, adapters })`.
- Main journal `aitm.runtime-empty-initialization/v1` at `runtime/empty-initializations/<operationId>/journal.json` stores the full approved plan, original absence, generated exact bytes, physical/ancestor/stage identities, genuine owner/history and prepared/publishing/complete status. Inspection is synchronous filesystem/physical observation only, returns observed digest and protected states, and performs no death sampling/acquisition/ordinary runtime read.
- Main control v2 has exactly schema/status/projectRoot/mainRoot/activation; activation `{ kind: 'empty-initialization', id: plan.operationId, digest: plan.digest }`. Main forbids `initialization`. Closed validation rejects extra/missing/unsupported/contradictory fields.

- [ ] **Step 1: Add RED for approval, cross-process stable observation, no-grant records and late drift; snapshot before every expected refusal.**

```js
await assert.rejects(
  applyEmptyRuntimeInitialization({
    plan,
    approvedPlanDigest: 'sha256:' + '0'.repeat(64),
    adapters,
  }),
  (error) => error.code === 'RUNTIME_MIGRATION_APPROVAL_REQUIRED'
);
writeFileSync(path.join(root, '.tmp/aitm/state/task-tracker-state.json'), '{}\n');
const conflicted = snapshotTree(root);
await assert.rejects(
  applyEmptyRuntimeInitialization({ plan, approvedPlanDigest: plan.digest, adapters }),
  (error) => error.code === 'RUNTIME_MIGRATION_PLAN_CHANGED'
);
assert.deepEqual(snapshotTree(root), conflicted);
```

Create the late legacy file's parent inside the fixture before writing. Add cross-PID plan/apply processes with genuine registered bootstrap identity; fixture adapters cannot prove production invoker exemption. Assert only four records, control and protected journal are generated, linked roots untouched and no grant/timing/occupancy claim appears.

- [ ] **Step 2: Run affected RED; implement exact publication and before-write full conflict checks.** Reobserve all roots asynchronously while the new bootstrap coordinator wrapper holds the existing main exclusion. Exempt only the current exactly proved coordinator and approved operation-created ancestors. Record and fsync the complete journal before stage/store/control writes; stage/validate four bytes; prepared control; rename store; verify each member; complete/fsync journal; active/fsync control. Never compare a new UUID/full newly generated plan to the sealed approval.
- [ ] **Step 3: Add real SIGKILL at first pending/journal, staging, prepared control, rename, complete journal, active control and recovery claim.** Internal fault callbacks signal readiness to a parent; the parent sends `SIGKILL`, waits for actual signal exit, then a separate child inspects/resumes. Use protected exact owner sampling; no synthetic death claim replaces these cases.

```js
const stopped = await killAtBoundary('after-empty-store-rename', approvedPlanFile);
assert.equal(stopped.signal, 'SIGKILL');
assert.throws(
  () => assertRuntimeReadable({ projectRoot: root, mainRoot: root }),
  (error) => error.code === 'RUNTIME_TRANSACTION_INCOMPLETE'
);
const observed = inspectEmptyRuntimeInitialization({
  projectRoot: root,
  mainRoot: root,
  operationId: plan.operationId,
});
await resumeEmptyRuntimeInitialization({
  projectRoot: root,
  mainRoot: root,
  operationId: plan.operationId,
  observedDigest: observed.digest,
  approvedPlanDigest: plan.digest,
  adapters: replacementOwnerAdapters,
});
```

Define the harness in the parent crash test and its worker in `scripts/tests/fixtures/runtime-empty/empty-publisher.mjs`. The worker imports the candidate empty apply/resume API and installs an internal fault callback that sends `{ boundary, pid: process.pid, operationId }` then awaits an unresolved Promise at the requested boundary. Its fixture owner records the real process PID/host and freshly generated fixture SID/token; it never copies genuine session identity. The parent imports `fork` from node:child_process and uses this helper:

```js
async function killAtBoundary(boundary, planFile) {
  const child = fork(childFile, [planFile, boundary], {
    cwd: root,
    env: fixtureEnv,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let stdout = '',
    stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const exited = new Promise((resolve) =>
    child.once('exit', (code, signal) => resolve({ code, signal }))
  );
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('boundary not reached'));
    }, 30000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('message', (message) => {
      if (message.boundary !== boundary) return;
      try {
        assert.equal(message.pid, child.pid);
        assert.equal(message.operationId, plan.operationId);
        clearTimeout(timer);
        resolve();
      } catch (error) {
        clearTimeout(timer);
        child.kill('SIGKILL');
        reject(error);
      }
    });
  });
  assert.equal(child.kill('SIGKILL'), true);
  const result = await exited;
  assert.equal(result.code, null);
  assert.equal(result.signal, 'SIGKILL');
  return { ...result, stdout, stderr };
}
```

`childFile` resolves the worker from the test's own import.meta.url; `fixtureEnv` is the minimal environment defined in the verification contract, with temporary output confined to the exact disposable grant. Fault injection is internal to tests. Expand killed-resumer/competing-recovery/live/reused-PID/foreign-host/unknown-owner cases and compare every conflict-set byte before/after refusal.

- [ ] **Step 4: Implement exact recovery and ancestor proof.** Inspection derives only the validated physical main/opUUID path. Validate requested observed and approved digests, complete conflict set, original owner/death and ordered recovery claims before any replay. Fixed ancestor set is runtime/, migrations/, empty-initializations/, empty-initializations/<op>/ under main `.ai-task-manager/`; capture physical directory identities in the first fully written journal and exact staging identities later. Preexisting empty ancestors, unexpected siblings and unbound first-artifact residue are refusals. Insufficient journal evidence stays protected; never guess, delete or adopt it.
- [ ] **Step 5: Prove completed retry preserves later writes/successor and census evolution; race empty/empty and empty/migration with late source insertion.** Exactly one compatible publisher succeeds; incompatible source policies are tested separately, without assuming both initially valid. Retained pending/fence recovery requires exact original roots; completed no-fence retry validates current successor/read admission rather than replaying absence or fixed records.
- [ ] **Step 6: Run affected GREEN, lint/format and preservation; commit admitted Task 2 hunks.** Every meaningful crash boundary has a real killed process; thrown faults remain supplemental.

#### Verification Commands

Run: `node --test scripts/tests/integration/task-tracker/lib/runtime-empty-crash.test.mjs`

Canonical TIA-selected empty-initialize/crash/coordinator tests and existing migration-transaction/successor tests; scoped lint/format. Broad lanes cloud only.

