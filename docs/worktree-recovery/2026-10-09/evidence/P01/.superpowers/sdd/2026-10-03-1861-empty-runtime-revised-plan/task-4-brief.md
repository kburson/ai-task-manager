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

