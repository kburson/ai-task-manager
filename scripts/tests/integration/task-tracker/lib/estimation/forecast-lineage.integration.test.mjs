// @story #2039 #2064
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { resolveLocalForecast } from '../../../../../task-tracker/lib/estimation/forecast-lineage.mjs';
import { calculateLocalEstimate } from '../../../../../task-tracker/lib/estimation/local-runtime.mjs';
import { validateLocalEvidence } from '../../../../../task-tracker/lib/estimation/local-evidence.mjs';
import {
  bundle,
  envelope,
  outcome,
  id,
} from '../../../../helpers/local-estimation-evidence-fixture.mjs';

const identity = { host: 'github.com', repository: 'owner/repo', issue: 2045 };
function fixture(
  records = [envelope(), envelope({ recordId: id(10), payload: outcome(1068), issue: 1068 })]
) {
  const evidence = bundle(records.map((record) => ({ record, provenance: 'imported-local' })));
  evidence.manifest.modelPolicy = {
    modelVersion: 'aitm.forecast-model/v2',
    policyVersion: 'aitm.local-estimation/v1',
  };
  const {
    inputs: _inputs,
    schema: _schema,
    canonicalizationVersion: _canon,
    ...selection
  } = evidence.manifest;
  const input = JSON.parse(
    fs.readFileSync(new URL('../../../../fixtures/estimation/plan-input.json', import.meta.url))
  );
  const calculated = calculateLocalEstimate({
    mode: { mode: 'local' },
    evidence,
    planInput: { selection, input },
  });
  assert.equal(calculated.status, 'estimated');
  const forecast = {
    ...structuredClone(calculated.forecast),
    schema: 'aitm.estimation-forecast/v3',
    localEvidence: structuredClone(calculated.localEvidence),
  };
  const requests = [];
  const evidenceStore = {
    read(digest) {
      requests.push(digest);
      return validateLocalEvidence(evidence);
    },
  };
  return { forecast, evidence, evidenceStore, requests };
}

test('reopens the actual native immutable store and refuses lost retained payloads locally', async (t) => {
  const path = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const { PROJECT_ROOT_ALIASES } =
    await import('../../../../../task-tracker/lib/runtime-storage.mjs');
  const { planRuntimeMigration, applyRuntimeMigration } =
    await import('../../../../../task-tracker/lib/runtime-migration.mjs');
  const { openLocalEvidenceStore } =
    await import('../../../../../task-tracker/lib/estimation/local-evidence-store.mjs');
  const { importLocalEvidence } =
    await import('../../../../../task-tracker/lib/estimation/local-evidence.mjs');
  const parent = new URL(
    '../../../../../../.ai-task-manager/runtime/test-fixtures/',
    import.meta.url
  );
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(fs.realpathSync(parent), 'forecast-lineage-'));
  const fixtureEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !PROJECT_ROOT_ALIASES.includes(key) && !key.startsWith('GIT_')
    )
  );
  execFileSync('git', ['init', '-q', root], { env: fixtureEnv });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const families = {
    'state/task-tracker-state.json': ['state', 'local', {}],
    'state/task-tracker-queue.json': ['queue', 'local', []],
    'fleet/task-fleet.json': ['fleet', 'shared', {}],
    'fleet/occupancy.json': ['occupancy', 'shared', {}],
  };
  for (const [relative, [, , value]] of Object.entries(families)) {
    const file = path.join(root, '.tmp', 'aitm', relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
  }
  const adapters = {
    classifyLegacy: ({ relative }) => {
      const entry = families[relative];
      return (
        entry && {
          destination: relative,
          family: entry[0],
          scope: entry[1],
          validate: (raw) => {
            const parsed = JSON.parse(raw);
            return Array.isArray(entry[2])
              ? Array.isArray(parsed)
              : parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
          },
        }
      );
    },
    trustLegacy: () => 'explicit-operator-trust',
    writerCensus: () => ({ complete: true, writers: [], claims: [] }),
    identity: () => ({
      provider: 'fixture',
      sid: 'forecast-lineage-fixture',
      pid: process.pid,
      processToken: 'fixture-process',
    }),
    publishTiming: async () => ({ status: 'confirmed' }),
  };
  const plan = await planRuntimeMigration({ projectRoot: root, mainRoot: root, adapters });
  assert.deepEqual(plan.blockers, []);
  assert.equal(
    (await applyRuntimeMigration({ plan, approvedPlanDigest: plan.digest, adapters })).status,
    'complete'
  );
  const open = () =>
    openLocalEvidenceStore({
      projectRoot: root,
      host: identity.host,
      repository: identity.repository,
    });
  const f = fixture();
  const original = open();
  await importLocalEvidence({ evidenceStore: original, bundle: f.evidence });
  const reopened = open();
  const resolved = resolveLocalForecast({ ...f, identity, evidenceStore: reopened });
  assert.equal(resolved.status, 'resolved');
  assert.deepEqual([...resolved.evidence.payloads], [...f.evidence.payloads]);
  const before = fs.readFileSync(
    path.join(reopened.path, 'manifests', f.forecast.localEvidence.manifestDigest + '.json')
  );
  fs.unlinkSync(path.join(reopened.path, f.evidence.manifest.inputs[0].payloadPath));
  const missing = resolveLocalForecast({ ...f, identity, evidenceStore: reopened });
  assert.equal(missing.status, 'unavailable');
  assert.equal(missing.reason, 'storage');
  assert.deepEqual(
    fs.readFileSync(
      path.join(reopened.path, 'manifests', f.forecast.localEvidence.manifestDigest + '.json')
    ),
    before
  );
});
