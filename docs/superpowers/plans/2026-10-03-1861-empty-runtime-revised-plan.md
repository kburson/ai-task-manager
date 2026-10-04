# #1861 empty-runtime amendment implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in the assigned chat. Steps use checkbox (`- [ ]`) syntax for tracking. No child is launched by this document.

**Goal:** Complete #1861's recoverable runtime kernel, including explicit proven-empty main activation and separately initialized linked roots, without activating the live candidate.

**Architecture:** Extract one read-only authority census, retaining migration-v1 policy and approved digests. Publish only main's four fixed records behind a protected empty journal and control v2; linked-v2 journals bind that actual activation. Reuse physical-root, owner, coordinator, catalog and batch primitives, and preserve synchronous read admission through a low-level proof validator with no storage import cycle.

**Tech Stack:** Node ESM, node:test, actual SIGKILL child processes, disposable real Git fixtures, macOS process-tree confinement, canonical TIA, delivered scoped lifecycle control and exact-head PR/cloud CI.

**Spec:** [accepted empty-runtime amendment](../specs/2026-10-02-1861-explicit-empty-runtime-design.md), SHA-256 `fa2f1291dc351f1d9c543b73ae73777774b768abcc14d061c5d69cd6e6d0a94c`; [kernel design](../specs/2026-10-02-1861-runtime-kernel-design.md); [accepted decomposition](2026-10-01-1857-remaining-work-decomposition.md). Read all three before execution. Preserve the historical [kernel plan](2026-10-02-1861-runtime-kernel.md).

Status: accepted for execution by the human in this chat. The user confirmed that the amendment plan was already reviewed and accepted, retained #1861 as one story at estimate 20.5h, and directed execution. Manual Claude/author consensus remains acceptance of the amendment bytes only; it is not package XPR. This additive plan supersedes the historical kernel plan's unsupported empty-initialization assumption. Existing kernel implementation retains its original credit; tasks below require fresh evidence and repairs, not reimplementation of already delivered behavior.

## Scope

C1 owns complete all-root absence observation, fixed main publication/recovery, activation/read contracts, linked-v2 initialization/recovery, registered bootstrap and existing kernel/prerequisite verification. C2 retains production consumers, genuine bind/resume/occupancy/timing reconciliation and consumer fixture conversions; C3 retains cleanup and retirement; C4 retains provider/installer forwarding and operator guidance; C5 retains combined exact-candidate operational admission. No #1862 work begins. No legacy abandonment/import, synthetic migration manifest, retirement-based same-path reuse, automatic initialization or authority reconstruction is introduced.

## Context and admission

Actual chat cwd, branch and native scoped-first hooks were verified in `/Users/kpburson/.codex/worktrees/8dae/ai-task-manager`, branch `codex/1857-continuation`, at `c9e87d4a70dad4391a98e7d7cc98a1bbd9f217fe`. Delivered lifecycle executable is `node node_modules/@kburson/ai-task-manager/bin/aitm.mjs`, resolving to `.scratch/1857-delivered-control`. Candidate source is not the live lifecycle executable. The current genuine session is resumed on #1861; all five ACs remain unticked and Develop exit is blocked.

Execution admission and retained prerequisites:

- [x] Human confirmation: the amendment plan is reviewed and accepted; execute #1861 intact at its existing 20.5h estimate. No decomposition or waiver is requested. The five implementation tasks are execution phases of the same kernel outcome; they do not create five independently acceptable stories.
- [ ] Record the current human confirmation and this exact Plan binding through the delivered issue-record commands. Preserve historical forecast/approval provenance; no new Full-Auto marker, revised forecast, state jump or repair receipt is inferred.
- [ ] Retain the activation union, linked-v2, protected namespace and grammar handoff. Affected C2/C3/C4 acceptance must account for changed contracts before adoption; do not launch those children.
- [ ] Finalize the task-owned isolation wrapper/profile against the exact executable candidate and retain harmless canonical-runner canary evidence. A feasibility canary passed on this host; it grants no candidate-test acceptance.
- [ ] Refresh the deep dive and source/Plan binding through the scoped control, retaining historical timing and approvals. Verify the current genuine issue/worktree/timer again after any admission pause.

## Plan Metadata

- Priority: P1 (current authority).
- Size: XL (current authority and preview).
- Estimate: 20.5h, the existing governed estimate explicitly retained by the user.
- Rank: 1, set by the user because C1 is the epic's first and most important dependency. Rank against assigned work and dependency urgency; unassigned parking ranks do not set the active queue.
- Execution: native implementation in this assigned chat after admission; final PR review GPT-6.1 Sol / Extra High after CI green.
- Forecast input: `.scratch/gh/1861-revised-plan-estimation-input.json`, schema `aitm.plan-estimation-input/v1`.
- Rubric preview: live record `01M3ZCCKBVEY3HYS94J584FKX4`, v289, read from #1091; canonical forecast model, Refine L/12h, no comparable outcomes asserted. Preview includes original kernel/prerequisites, all amendment work, isolation, review and cloud attribution. It is not remaining engagement or measured time.
- Historical preview result: XL/42.5 human hours; AI P50 11.5h/P80 12.5h. This unapproved preview did not converge through AITM and does not replace the 20.5h estimate or reopen the accepted story boundary. Retain its raw evidence for audit; it is superseded as the execution/decomposition decision by the user's explicit clarification.
- Review transport: manual numbered files through the user. Preserve unresolved `review-f977a983ac4c88bc6d28ace380504db4` and private evidence; never replay or report manual acceptance as package-authenticated XPR.

## Story Intent

- **Beneficiary:** AITM operator installing or recovering an interrupted runtime
- **Capability:** explicitly create or recover a complete runtime without inheriting old grants
- **Need:** fresh installations and proven total loss lack authority, and process death can interrupt publication
- **Value or failure prevented:** ordinary commands refuse partial or conflicting authority instead of consuming it

The seven semantic checks are grounded in the parent R2/R3 and current C1 ACs: the operator is the stakeholder; explicit complete publication is the capability; absence/interruption is the need; refusing contradictory/inherited authority is the value; the specs/ACs support those claims; C2/C3/C4 contribute distinct adoption/cleanup/forwarding outcomes; the story is independently readable. The live linked Plan and human confirmation must identify these exact bytes without rewriting historical lifecycle evidence.

## Global Constraints

- “Ordinary commands never initialize implicitly.”
- “Empty activation's `originalRoots` is `[mainRoot]`.”
- “Linked initialization against migration continues using v1, preserving existing arguments and historical plans/journals/controls.”
- “No caller-selected targets/payloads.”
- “A lease alone is not quiescence.”
- “Local automated verification is lint, format and canonical TIA only. Broader unit/integration/slow lanes run in PR/cloud CI.”
- “Pause after #1861 as requested; do not start #1862.”
- Preserve all existing WIP, configuration changes, `.bak` files, private fixtures, untracked `=`, protected snapshot/draft refs and the sole staged actor-flush rename. Never reset, stash, clean, broadly stage, archive or relocate to primary.
- Every command uses the assigned actual workspace; setting a shell workdir is insufficient. Do not activate, migrate or replace the live runtime/image to obtain test or review evidence.
- Commit only admitted C1 paths/hunks; shared command surfaces have one editor under epic integration. Pure validator hunks do not transfer whole C2 consumer files.

## Review Focus

1. An empty durable directory, unknown future namespace, alias, unavailable root or late legacy entry must block empty publication (Task 1/2).
2. A different genuine applying process must use the sealed observation, without inheriting the planner's claim or trusting caller PID/environment (Task 1/2/4).
3. Removing/recreating a linked path must retain history refusal even with changed Git identity or retirement receipt (Task 3).
4. A killed publisher/resumer or conflicting member must retain evidence and refuse ordinary reads; completed retry must preserve later legitimate writes (Task 2/3/5).
5. A consumer fixture that resolves upward, or a child/helper alias write, must be prevented from modifying preserved authority (Task 1 and every task's verification).

## Files and dependency boundaries

New C1 modules:

- `scripts/task-tracker/lib/runtime-authority-census.mjs`: physical all-root inventory and writer observation, without applying policy or writing.
- `scripts/task-tracker/lib/runtime-empty-record.mjs`: stable projection/digests, closed empty plan/journal/control validators and fixed shared records; no storage/lock imports.
- `scripts/task-tracker/lib/runtime-empty-initialize.mjs`: empty planner/apply/inspect facade and main publication.
- `scripts/task-tracker/lib/runtime-empty-recovery.mjs`: exact observed recovery, owner history and conflict-set admission.
- `scripts/task-tracker/lib/runtime-activation-admission.mjs`: synchronous main proof and local history/read validation; receives physical/path/record primitives instead of importing `runtime-storage.mjs`.

Modified C1 modules: `runtime-migration-plan.mjs`, `runtime-migration-lock.mjs`, `runtime-storage.mjs`, `runtime-initialization-{record,recovery}.mjs`, `runtime-initialize.mjs`, `runtime-migration-admission.mjs`, `verbs/migrate-runtime.mjs`; catalog/census/timing prerequisites only as justified by actual regressions. Preserve the batch/writer API and migration facade.

Shared edits: migrate-runtime-specific hunks in `command-surface/{catalog,routing}.mjs`, `verbs/help-data.mjs`, `bin/aitm.mjs`, `bin/cli.mjs`. Record exact hunk ownership before editing; C4 forwarding is a later handoff, not work hidden in C1.

Test additions: `runtime-empty-plan.test.mjs`, `runtime-empty-initialize.test.mjs`, `runtime-empty-crash.test.mjs`, `runtime-activation-admission.test.mjs`, `runtime-empty-bootstrap.test.mjs` under `scripts/tests/integration/task-tracker/lib/`. Use existing real-Git helper and crash suites. Keep fixture-only identity/census adapters internal to tests; the registered CLI path exercises production identity and admission, with inherited genuine provider identity removed at the test child boundary.

## Verification execution contract

Construct a disposable real-Git executable candidate from a recorded exact C1 manifest, retaining paths, bytes, modes and symlinks. Include required test helpers/configuration/dependencies; exclude private incident additions only from executable/authored manifests, while retaining them in preservation/operational inventories. Do not copy genuine authority or identity. Verify candidate source bytes against the admitted working-tree/hunk manifest and record the base/HEAD/diff; a dirty snapshot receipt is iteration evidence, not clean exact-head acceptance.

For local RED/GREEN, call the existing `selectAffectedTests({ projectDir, changedPaths })` with actual admitted continuation changes relative to `bec7e45429838dcc7123283dddb69001720dc2c1`, then each later admitted iteration base; include newly added tests. Preserve the full discovered population, selection, reasons and escalations. No narrowed `discoveredTests`, manifest edits or false no-impact scope in candidate coverage. Any complete-lane escalation goes to cloud. Historical 917-test execution is failed incident evidence, not green coverage.

Use the canonical Node provider/Develop runner or its actual selected `node --test <file>` steps inside the confinement wrapper. The wrapper starts before the runner, so descendants/helpers inherit it. Default deny filesystem writes; allow only exact disposable fixture/output roots. Candidate source, dependencies and candidate Git identity remain read-only during tests; fixture Git common directories belong only to the disposable grants. Do not grant the protected 8dae tree, scoped control, genuine Git common directory or private fixtures. Strip inherited provider/session/Git routing variables, retain only explicit test-process environment, and direct temporary output to the admitted root. Denied writes are verification failures, not reasons to broaden grants.

The feasibility profile used `(deny file-write*)` plus one exact disposable output `subpath`, and passed actual `runDevelopVerification` with canonical selector/provider on a declared harmless canary corpus. Node, shell, cp, descendants, rename, hard-link, symlink-target, chmod, mkdir and unlink denials were checked. Default nested sandbox invocation failed with `sandbox_apply: Operation not permitted`; approved host execution applied the profile and passed. Repeat the canaries for the final candidate profile/grants before candidate tests. Profiles/manifests and all stdout/stderr/exits remain private; [admission evidence](../../reviews/1857-remaining-work/2026-10-03-1861-revised-plan-admission.md) records hashes and limits.

The task Run lines below name actual canonical selected-step argv. Execute them only inside the admitted disposable candidate and confinement after confirming selection membership, together with every other selected file; they do not authorize standalone native runs or a hand-selected subset. For each code task, run its complete canonical affected selection in that admitted candidate for RED, implement minimally, then rerun that selection for GREEN. Capture raw output and actual exits, including failures. Never invoke the old iteration CLI blindly against the preserved whole WIP or indirect local full-suite Test sandbox. Local lint/format operate on admitted C1 paths or disposable full candidate; no autofix of unrelated native WIP.

---

## Implementation Tasks

### Task 1: Seal all-root absence without changing migration-v1 evidence

#### Story Intent

- **Beneficiary:** AITM installation operator
- **Capability:** approve an exact absence observation before creating empty authority
- **Need:** legacy residue, root drift or a writer can make a superficially empty store unsafe
- **Value or failure prevented:** creation cannot silently discard authority or import old grants

#### Files

Create census/empty-record modules and `runtime-empty-plan.test.mjs`; modify migration planner and necessary process/writer census hunks; extend `runtime-migration-input.test.mjs`, `runtime-migration-catalog.test.mjs`, `runtime-process-census.test.mjs`, `runtime-writer-census.test.mjs`. Create test helper `scripts/tests/helpers/runtime-empty-contract-fixture.mjs` for the snapshot below; fold candidate isolation integration and `runtime-root-fixture.mjs` verification into this deliverable.

#### Interfaces

- Consumes existing `resolveRuntimeRoot({ cwd, env: {} })`, `runtimeStoragePaths({ projectRoot, mainRoot })`, `classifyKnownLegacyRuntimeRecord(input)`, `observeRuntimeWriterCensus(input, adapters)` and `observeMigrationIdentity(adapters)`.
- Produces async `observeRuntimeAuthorityCensus({ projectRoot, mainRoot, adapters })`, containing sorted physical registered/unavailable roots, legacy entries and durable-prefix presence/identity, blockers and genuine writer/claim observations. Return diagnostic invoker/time separately from the canonical approval projection.
- Produces `emptyRuntimeObservationProjection(observation)` and `emptyRuntimeDigest(value)` using sorted object keys and SHA-256; `INITIAL_SHARED_RUNTIME_RECORDS` exactly `{ 'fleet/task-fleet.json': '{}\n', 'fleet/occupancy.json': '{}\n' }`.
- Produces async `planEmptyRuntimeInitialization({ projectRoot, mainRoot, adapters })` in the empty facade; closed plan `aitm.runtime-empty-plan/v1`: operation UUID, main physical identity, observation/projection digest, fixed records, `originalRoots: [mainRoot]`, source policy and plan digest. Diagnostic PID/token are outside approval bytes; the actual current invoker is still authenticated.

- [ ] **Step 1: Qualify the exact candidate confinement and record a harmless permitted/denied canary before candidate tests.** Allocate new real-Git fixtures through the helper; a nongit scratch directory cannot own runtime. Keep the completed feasibility receipt and exact final profile/grant hashes. A failed enforcement check stops candidate execution.
- [ ] **Step 2: Add RED tests for read-only plan, fresh/prior-total-absence equivalence and all blockers.** Test prior activation by creating and removing authority only inside a disposable fixture; retain the old proof externally in fixture output, outside that root's authority. Do not represent a retained journal as total absence.

```js
const before = snapshotTree(root);
const plan = await planEmptyRuntimeInitialization({ projectRoot: root, mainRoot: root, adapters });
assert.equal(plan.schema, 'aitm.runtime-empty-plan/v1');
assert.deepEqual(plan.originalRoots, [root]);
assert.deepEqual(snapshotTree(root), before);
assert.deepEqual(plan.records, { ...INITIAL_RUNTIME_RECORDS, ...INITIAL_SHARED_RUNTIME_RECORDS });
mkdirSync(path.join(root, '.ai-task-manager/runtime'), { recursive: true });
await assert.rejects(
  planEmptyRuntimeInitialization({ projectRoot: root, mainRoot: root, adapters }),
  (error) => error.code === 'RUNTIME_EMPTY_INIT_REFUSED'
);
```

Import this exact read-only helper from the new test-helper file; record explicitly absent named targets in assertions with lstat/ENOENT:

```js
import { lstatSync, readdirSync, readFileSync, readlinkSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
export function snapshotTree(root) {
  const rows = [];
  const walk = (relative) => {
    const target = path.join(root, relative);
    const stat = lstatSync(target);
    const row = { path: relative, mode: stat.mode };
    if (stat.isSymbolicLink()) rows.push({ ...row, kind: 'link', target: readlinkSync(target) });
    else if (stat.isDirectory()) {
      rows.push({ ...row, kind: 'directory' });
      for (const name of readdirSync(target).sort()) walk(path.join(relative, name));
    } else if (stat.isFile())
      rows.push({
        ...row,
        kind: 'file',
        sha256: createHash('sha256').update(readFileSync(target)).digest('hex'),
      });
    else rows.push({ ...row, kind: 'other' });
  };
  walk('');
  return rows;
}
```

The helper performs no write, Git cleanup or runtime-reader operation. Expand a table over `.db/aitm`, `.tmp/aitm`, supported catalog authority, durable empty directories, current/future namespaces, symlinks, malformed/unknown records, locks, unavailable registered roots and live/foreign/unknown writers/claims. For each, compare the complete before/after snapshot and the exact blocker target.

- [ ] **Step 3: Run canonical affected RED and retain the actual missing-empty-API failure.** No unsupported live bootstrap command is used as a substitute for a failing candidate test.
- [ ] **Step 4: Extract observation; retain separate migration and empty policies.** Preserve existing migration file ordering, blocker codes, writer observation and v1 serialized digest inputs. Freeze a representative approved migration-v1 plan/manifest before extraction and assert identical digest/validation after it. The empty policy rejects any runtime-prefix presence; it cannot consume migration's no-source result as proof.

```js
const observation = await observeRuntimeAuthorityCensus(input);
const projection = emptyRuntimeObservationProjection(observation);
// Legacy migration projection keeps its existing v1 serialized fields.
// Empty policy authenticates invoker, checks completeness and rejects every authority entry.
const plan = {
  schema: 'aitm.runtime-empty-plan/v1',
  operationId: randomUUID(),
  projectRoot: observation.mainIdentity.projectRoot,
  mainRoot: observation.mainIdentity.projectRoot,
  mainIdentity: observation.mainIdentity,
  observation: projection,
  observationDigest: emptyRuntimeDigest(projection),
  originalRoots: [observation.mainIdentity.projectRoot],
  sourcePolicy: 'proven-total-absence-no-inherited-grants',
  records: { ...INITIAL_RUNTIME_RECORDS, ...INITIAL_SHARED_RUNTIME_RECORDS },
};
return { ...plan, digest: emptyRuntimeDigest(plan) };
```

The observation's protected entries bind physical identity/digest and absence, not just path strings. The authenticated registered executing invoker is the only exemption; never accept caller PID, arbitrary claim filtering or inherited identity as that proof. All external catalog authority locations remain inventoried. Stabilize projection across two genuine processes without excluding foreign writers.

- [ ] **Step 5: Run affected GREEN plus scoped lint/format; commit admitted Task 1 hunks.** Keep the migration-v1 golden comparison, complete selection and preservation report with the commit.

#### Verification Commands

Run: `node --test scripts/tests/integration/task-tracker/lib/runtime-empty-plan.test.mjs`

Canonical TIA-selected `runtime-empty-plan`, migration-input/catalog and process/writer-census tests; scoped ESLint and Prettier checks. Complete escalated lanes remain cloud.

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

### Task 4: Expose the exact registered bootstrap union

#### Story Intent

- **Beneficiary:** AITM installation and recovery operator
- **Capability:** plan, inspect, apply and resume an explicit empty or linked initialization
- **Need:** ordinary reads must refuse before complete local authority exists
- **Value or failure prevented:** recovery remains reachable without caller-selected authority or implicit initialization

#### Files

Modify migration-admission parser/classifier and migrate-runtime handler; serialized migrate-runtime-specific catalog/routing/help/bin hunks; create `runtime-empty-bootstrap.test.mjs`; extend runtime-bootstrap-cli and admission tests.

#### Interfaces

- `initialize-plan`: main async empty-v1; linked sync migration-v1 or empty-v2, normalized by async handler.
- `initialize-apply --plan-file <file> --approved-plan sha256:<digest>`: exact schema, digest and invoking physical root dispatch; plan file is input evidence, never authority to choose a different root.
- `status`: bootstrap read-only exposure of main empty/linked journals and exact observation digests, before ordinary local reads; maintain existing transaction/batch/operation status fields or explicitly version incompatible output.
- `initialize-resume --operation <UUID> --observed sha256:<digest> --approved-plan sha256:<digest>`: main empty/linked-v2; migration-linked-v1 retains existing approved-plan-only route. Reject unrelated extras/partial combinations.

- [ ] **Step 1: Add RED through the physical registered executable on pristine main; assert no ordinary task context construction.** Spawn candidate `bin/aitm.mjs` with the fixture cwd and stripped inherited genuine identity. Missing provider identity must refuse with the typed identity/empty-plan blocker; it cannot be converted into a positive production test using a fake SID. For positive subprocess contract tests, use internal fixture-owner/census adapters in a test-only harness that calls the same parser/classifier and handler dispatch with the actual executable/root/process identity. Extract async `executeRuntimeInitializationRequest({ request, roots, adapters })` from the handler for that internal harness; the production handler constructs its own adapters, with no environment/argv injection. Preserve a separate genuine-native-host invoker proof requirement; fixture results cannot satisfy it.

```js
const unbound = await registeredBootstrap(root, ['migrate-runtime', 'initialize-plan']);
assert.notEqual(unbound.exitCode, 0);
assert.match(unbound.stderr, /RUNTIME_MIGRATION_IDENTITY_REQUIRED|RUNTIME_EMPTY_INIT_REFUSED/);
assert.deepEqual(snapshotTree(root), beforePlan);
const planned = await executeRuntimeInitializationRequest({
  request: physicallyClassifiedRequest,
  roots: { projectRoot: root, mainRoot: root },
  adapters: internalFixtureAdapters,
});
assert.equal(planned.schema, 'aitm.runtime-empty-plan/v1');
const invalid = await registeredBootstrap(root, [
  'migrate-runtime',
  'initialize-resume',
  '--operation',
  operationId,
  '--approved-plan',
  digest,
]);
assert.notEqual(invalid.exitCode, 0); // v2 requires exact observed digest too.
```

Define `registeredBootstrap(cwd, argv)` locally with the existing physical candidate executable:

```js
function registeredBootstrap(cwd, argv) {
  const result = spawnSync(process.execPath, [executable, ...argv], {
    cwd,
    encoding: 'utf8',
    timeout: 30000,
    env: { PATH: fixturePath, TMPDIR: fixtureOutputRoot, LANG: 'en_US.UTF-8' },
  });
  return {
    exitCode: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}
```

`fixturePath` contains only the observed Node executable directory plus /usr/bin:/bin; `fixtureOutputRoot` is inside the exact admitted disposable writable grant. The helper performs no lifecycle binding or real GitHub writes. Extend the existing physical bootstrap fixture setup without a production command/identity override. Real cross-process production-census qualification must retain actual admission evidence; an adapter-only test cannot satisfy it.

- [ ] **Step 2: Run affected RED; extend grammar, descriptor and handler together.** Unknown flags, malformed UUID/digests, aliases, foreign root/plan, nonexistent operation, mutation via status and PID/payload/path extras refuse before writes. Main/linked dispatch occurs from physical roots and closed plan schema, not an environment or caller root hint.

```js
if (request.mode === 'initialize-plan') {
  return roots.projectRoot === roots.mainRoot
    ? planEmptyRuntimeInitialization({ ...roots, adapters })
    : planRuntimeInitialization(roots);
}
// initialize-apply validates the closed union and invoking root before dispatch.
// initialize-resume chooses main/linked history from physical roots, then checks UUID/digests.
```

- [ ] **Step 3: Test help/parser/descriptor/bootstrap-classifier/handler parity and genuine cross-PID approval.** Verify old linked-v1 arguments still work, new main/v2 observed arguments are mandatory, status remains reachable with incomplete/missing control, unrelated provider claims block and an old uncooperative writer is detected. Scope C4's forwarding handoff to the same frozen grammar.
- [ ] **Step 4: Run affected GREEN, lint/format and preservation; commit only admitted registered hunks.** Retain ordered shared-file handoff and do not include whole installer/provider WIP.

#### Verification Commands

Run: `node --test scripts/tests/integration/task-tracker/lib/runtime-empty-bootstrap.test.mjs`

Canonical TIA-selected empty-bootstrap/bootstrap-cli/admission/command-surface contract tests; scoped lint/format.

### Task 5: Close the complete C1 kernel verification and delivery evidence

#### Story Intent

- **Beneficiary:** AITM operator adopting the candidate runtime
- **Capability:** rely on complete publication and exact recovery across supported generations
- **Need:** the new proof can regress existing batches, migration, timing and protected reads
- **Value or failure prevented:** partial authority or unsupported recovery is caught before joint release

#### Files

Existing C1 batch/writer/migration/initialization modules only for demonstrated regressions; C1 catalog/census/timing/pending-ask prerequisites and pure validator hunks; their owned contract/crash/successor tests; exact #1861 receipts and handoff docs under `docs/reviews/1857-remaining-work/`. No C2 whole-file adoption/fixture conversion or staged rename is included.

#### Interfaces Preserve existing sync `writeRuntimeRecordBatch`, `writeRuntimeJsonBatch`, `inspectRuntimeBatch`, `resumeRuntimeBatch`, record reads/locks/whole-operation contracts and all approved v1 digest/retry semantics. Hand off verified empty/activation/linked-v2 schemas, exact signatures/grammar/refusals and contract-test ownership; no consumer implementation claim.

- [ ] **Step 1: Build a complete AC-to-test ledger from the current issue and both specs; identify unproved original kernel/prerequisite behavior.** Cover full before/after journals, binding/actor/global deletion/binary payloads, pending fencing, sync Promise evidence, all real kill boundaries and completed successor timing. Do not copy historical aggregate passes as new acceptance.
- [ ] **Step 2: For every actual C1 regression, add a failing affected contract test, retain RED, minimally repair owned code and retain affected GREEN.** Validate all batch member conflicts before replay and no-fence successor retry without store rewriting; unknown/live/foreign owners and uncertain original census stay blocked. Preserve C2 consumer fixture failures with attribution, rather than silently converting their files or subtracting counts.

```js
const observed = inspectRuntimeBatch({ projectRoot: root, mainRoot: root, operationId });
const before = snapshotTree(root);
assert.throws(
  () =>
    resumeRuntimeBatch({
      projectRoot: root,
      mainRoot: root,
      operationId,
      observedDigest: observed.digest,
    }),
  (error) => error.code === 'RUNTIME_BATCH_CONFLICT'
);
assert.deepEqual(snapshotTree(root), before); // all conflicts are found before any replay.
```

Prepare the conflict by changing a journaled member after inspection inside the fixture. The existing synchronous resume signature accepts physical roots, operationId, observedDigest and internal adapters; an altered observation refuses `RUNTIME_BATCH_CONFLICT` before any member replay. The fixture uses exact owner-death evidence only when the observation itself remains admitted.

- [ ] **Step 3: Run admissible local lint/format and canonical TIA; preserve full candidate identity and evidence.** Full native WIP format/lint failures are inherited findings, not permission to repair unrelated files. Never invoke local full suites or waive failed/denied tests.
- [ ] **Step 4: Commit admitted C1 paths/hunks and open/update the exact candidate PR; obtain complete unit/integration/slow cloud results at its actual SHA.** Capture job URLs, tested SHA, census/lanes, outputs and conclusions. Resolve the supported cloud evidence/lifecycle ingestion route before Test; current local `/task test` adds prohibited full lanes, and a hand-written receipt is inadmissible.
- [ ] **Step 5: After actual CI green, obtain independent GPT-6.1 Sol / Extra High PR review; fix justified findings with affected RED/GREEN and refreshed cloud evidence.** Manual Plan consensus is neither code review nor delivery approval. Attach any created PR to this chat.
- [ ] **Step 6: Re-query scoped AITM Explain and stamp each supported AC/DoD separately using genuine verification authority.** Report CODE_COMPLETE only when all required implementation/evidence obligations are met. Orchestrator/human owns Review, approval, delivery and Close. Provide complete handoffs and pause after #1861; do not start #1862 or claim joint operational admission.

#### Verification Commands

Run: `node --test scripts/tests/integration/task-tracker/lib/runtime-batch-recovery.test.mjs`

Existing issue vc:1 targeted kernel inventory plus new empty/activation/bootstrap tests only when selected by canonical TIA; full issue vc:2–4 in PR/cloud; local lint/format vc:5–6; actual commit identity vc:7. Update the targeted inventory through scoped `issue-body` before stamping new tests; never remove broader requirements to fit local policy.

## Preservation and commits

Before each commit compare the private preservation baseline, protected refs and staged index entries. Stage exact admitted new files and scoped hunks only. Use an exact-path `git commit --only` when necessary to leave the staged actor-flush rename untouched. For shared mixed files, prepare a C1-only index blob from reviewed before/after hunks and verify unstaged bytes remain exact; do not commit the native whole-file consumer WIP. Use `[#1861]` messages, delivered commit-trace if native routing misses the actual commit, and preserve attribution. No authoring credit is assigned to inherited WIP.

## Self-review and human decision

Coverage: Intent/alternatives/absence → Task 1; plan/interfaces/main publication/recovery/ancestors/concurrency → Task 2; activation/control/linked/history/same-path/v1 → Task 3; grammar/identity/status → Task 4; original kernel/prerequisites/cloud/review/reconciliation handoffs → Task 5. All five Review Focus classes have explicit tests. API names, sync/async boundaries, root-keyed IDs and real activation references are consistent. The Plan itself changes no production source.

Ruling (2026-10-03): retain #1861 as the accepted cohesive kernel outcome at XL/20.5h and rank 1. The user expressly confirmed accepted amendment Plan review and rejected decomposition. The earlier kernel review already established that implementation and crash proof are inseparable; counting execution phases and shared dependencies as new independently useful outcomes reopened that settled boundary unnecessarily. The unapproved 42.5h preview is not live estimate authority. Cost if the retained estimate proves insufficient: report actual scope/engagement evidence and reassess with the user; do not silently overwrite the estimate, split the graph or reduce acceptance.

The human confirmation is execution authority in this session, not a fabricated Claude Plan verdict, package XPR acceptance, registered revised forecast, historical approval marker, test receipt or delivery. Preserve the original artifacts and their provenance. Exact-candidate confinement, complete applicable verification, cloud evidence and final code review remain necessary. No further Plan/decomposition confirmation is requested.
