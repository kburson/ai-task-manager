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

