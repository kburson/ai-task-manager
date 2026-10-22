// @story #2039 #2062
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createRuntimeRootFixture } from '../../../../helpers/runtime-root-fixture.mjs';
import {
  bundle,
  envelope,
  outcome,
  id,
} from '../../../../helpers/local-estimation-evidence-fixture.mjs';
import {
  planRuntimeMigration,
  applyRuntimeMigration,
} from '../../../../../task-tracker/lib/runtime-migration.mjs';
import { openLocalEvidenceStore } from '../../../../../task-tracker/lib/estimation/local-evidence-store.mjs';
import {
  deriveLocalRubric,
  refreshLocalRubric,
} from '../../../../../task-tracker/lib/estimation/rubric-refresh.mjs';
import {
  calculateLocalEstimate,
  retainLocalEstimateInputs,
  LOCAL_ESTIMATION_MODEL,
} from '../../../../../task-tracker/lib/estimation/local-runtime.mjs';
async function fixture(t, io = fs, { open = true } = {}) {
  const root = fs.realpathSync(createRuntimeRootFixture('local-evidence-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const legacy = path.join(root, '.tmp', 'aitm');
  for (const [name, body] of [
    ['state/task-tracker-state.json', '{}'],
    ['state/task-tracker-queue.json', '[]'],
    ['fleet/task-fleet.json', '{}'],
    ['fleet/occupancy.json', '{}'],
  ]) {
    const file = path.join(legacy, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  }
  const adapters = {
    classifyLegacy: ({ relative }) => {
      const rows = {
        'state/task-tracker-state.json': ['state', 'local', 'object'],
        'state/task-tracker-queue.json': ['queue', 'local', 'array'],
        'fleet/task-fleet.json': ['fleet', 'shared', 'object'],
        'fleet/occupancy.json': ['occupancy', 'shared', 'object'],
      };
      const row = rows[relative];
      if (!row) return null;
      return {
        destination: relative,
        family: row[0],
        scope: row[1],
        validate: (raw) => {
          const v = JSON.parse(raw);
          return row[2] === 'array'
            ? Array.isArray(v)
            : !!v && typeof v === 'object' && !Array.isArray(v);
        },
      };
    },
    trustLegacy: () => 'explicit-operator-trust',
    writerCensus: () => ({ complete: true, writers: [], claims: [] }),
    identity: () => ({
      provider: 'fixture',
      sid: 'fixture-migrator',
      pid: process.pid,
      processToken: 'fixture-process',
    }),
    publishTiming: async () => ({ status: 'confirmed' }),
  };
  const roots = { projectRoot: root, mainRoot: root };
  const plan = await planRuntimeMigration({ ...roots, adapters });
  assert.deepEqual(plan.blockers, []);
  const result = await applyRuntimeMigration({ plan, approvedPlanDigest: plan.digest, adapters });
  assert.equal(result.status, 'complete');
  const store =
    open &&
    openLocalEvidenceStore({
      projectRoot: root,
      host: 'github.com',
      repository: 'owner/repo',
      fs: io,
    });
  return { root, store };
}
function args(store) {
  const evidence = bundle([
    { record: envelope(), provenance: 'imported-local' },
    {
      record: envelope({ recordId: id(2), payload: outcome(), issue: 1002 }),
      provenance: 'imported-local',
    },
  ]);
  const { schema: _s, canonicalizationVersion: _c, inputs: _i, ...selection } = evidence.manifest;
  return {
    mode: { mode: 'local' },
    evidence,
    selection: structuredClone(selection),
    recordId: id(3),
    generatedAt: '2026-10-22T00:00:00.000Z',
    evidenceStore: store,
  };
}
function calculation(inputs, evidence) {
  return calculateLocalEstimate({
    mode: { mode: 'local' },
    evidence,
    planInput: {
      selection: inputs.selection,
      input: {
        schema: 'aitm.plan-estimation-input/v1',
        wbs: [
          {
            id: 'local',
            description: 'Implement bounded local calculation',
            baseHumanHours: 1,
            signals: { modules: ['estimation'], dependencies: [] },
            independentlyReviewable: true,
          },
        ],
        testImpact: { expectedMinutes: 1, lanes: ['unit'], isolation: 'offline' },
        risks: [],
        comparableIssueIds: [],
      },
    },
    model: { ...LOCAL_ESTIMATION_MODEL, ...inputs.selection.modelPolicy },
  });
}
test('real local refresh persists exact successor lineage before calculation can reference it', async (t) => {
  const f = await fixture(t);
  const inputs = args(f.store);
  const pure = deriveLocalRubric(inputs);
  assert.equal(pure.status, 'derived');
  assert.equal(calculation(inputs, pure.bundle).status, 'unavailable');
  const result = await refreshLocalRubric(inputs);
  assert.equal(result.status, 'refreshed');
  assert.equal(result.recordId, id(3));
  const retained = f.store.read(result.manifestDigest);
  assert.equal(retained.activeRubric.record.recordId, id(3));
  assert.equal(retained.activeRubric.record.predecessor, id(1));
  assert.equal(retained.activeRubric.descriptor.provenance, 'derived-local');
  assert.equal(retained.activeRubric.descriptor.sourceCommentId, null);
  const estimated = calculation(inputs, result.evidence);
  assert.equal(estimated.status, 'estimated');
  assert.equal(estimated.forecast.rubric.recordId, id(3));
  assert.equal(estimated.localEvidence.rubric.provenance, 'derived-local');
  assert.equal(estimated.localEvidence.manifestDigest, result.manifestDigest);
  for (const name of fs.readdirSync(path.join(f.store.path, 'manifests')))
    assert.equal(fs.statSync(path.join(f.store.path, 'manifests', name)).mode & 0o777, 0o600);
});
test('reopen requires actual durable revalidation, and retained receipt cannot be copied or guessed', async (t) => {
  const f = await fixture(t);
  const inputs = args(f.store);
  const first = await refreshLocalRubric(inputs);
  assert.equal(first.status, 'refreshed');
  const reopened = openLocalEvidenceStore({
    projectRoot: f.root,
    host: 'github.com',
    repository: 'owner/repo',
  });
  const raw = reopened.read(first.manifestDigest);
  const copy = {
    manifest: raw.manifest,
    payloads: raw.payloads,
    planBytes: raw.planBytes,
    persisted: true,
  };
  assert.equal(calculation(inputs, copy).status, 'unavailable');
  delete copy.persisted;
  assert.equal(calculation(inputs, copy).status, 'unavailable');
  const retained = await retainLocalEstimateInputs({ evidenceStore: reopened, bundle: copy });
  assert.equal(retained.status, 'retained');
  assert.deepEqual(calculation(inputs, retained.evidence), calculation(inputs, first.evidence));
  const current = await refreshLocalRubric({
    ...inputs,
    evidence: retained.evidence,
    evidenceStore: reopened,
    recordId: id(4),
  });
  assert.equal(current.status, 'current');
  assert.equal(current.recordId, id(3));
});
test('interrupted local persistence returns no usable ID and exact candidate recovery remains idempotent', async (t) => {
  let fail = true;
  const io = {
    ...fs,
    linkSync(source, target) {
      if (fail && target.endsWith('/records/' + id(3) + '.json'))
        throw Object.assign(Error('injected local failure'), { code: 'EIO' });
      return fs.linkSync(source, target);
    },
  };
  const f = await fixture(t, io);
  const inputs = args(f.store);
  const stopped = await refreshLocalRubric(inputs);
  assert.equal(stopped.status, 'unavailable');
  assert.equal(stopped.recordId, undefined);
  assert.deepEqual(fs.readdirSync(path.join(f.store.path, 'manifests')), []);
  fail = false;
  const result = await refreshLocalRubric(inputs);
  assert.equal(result.status, 'refreshed');
  assert.equal(result.recordId, id(3));
  assert.equal(calculation(inputs, result.evidence).status, 'estimated');
  const repeated = await refreshLocalRubric(inputs);
  assert.equal(repeated.manifestDigest, result.manifestDigest);
  assert.equal(fs.readdirSync(path.join(f.store.path, 'manifests')).length, 1);
});
test('failed final readback exposes no successor even when exact durable manifest landed', async (t) => {
  let fail = true;
  const io = {
    ...fs,
    readFileSync(file, ...rest) {
      // Store reads by descriptor; resolve only this disposable fixture descriptor.
      if (fail && typeof file === 'number') {
        const raw = fs.readFileSync(file, ...rest);
        const text = raw.toString('utf8');
        if (text.includes('aitm.local-estimation-evidence/v1') && text.includes(id(3)))
          throw Object.assign(Error('injected readback failure'), { code: 'EIO' });
        return raw;
      }
      return fs.readFileSync(file, ...rest);
    },
  };
  const f = await fixture(t, io);
  const inputs = args(f.store);
  const result = await refreshLocalRubric(inputs);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.recordId, undefined);
  assert.equal(fs.readdirSync(path.join(f.store.path, 'manifests')).length, 1);
  fail = false;
  const recovered = await refreshLocalRubric(inputs);
  assert.equal(recovered.status, 'refreshed');
  assert.equal(recovered.recordId, id(3));
});
test('changing bytes or manifest after retaining cannot reuse an old persistence receipt', async (t) => {
  const f = await fixture(t);
  const inputs = args(f.store);
  const result = await refreshLocalRubric(inputs);
  assert.equal(result.status, 'refreshed');
  const original = result.evidence.planBytes;
  result.evidence.planBytes = Buffer.from('different bytes');
  assert.equal(calculation(inputs, result.evidence).status, 'unavailable');
  result.evidence.planBytes = original;
  const changed = {
    ...result.evidence,
    manifest: {
      ...result.evidence.manifest,
      refine: { ...result.evidence.manifest.refine, humanHours: 4 },
    },
  };
  inputs.selection.refine.humanHours = 4;
  assert.equal(calculation(inputs, changed).status, 'unavailable');
});
