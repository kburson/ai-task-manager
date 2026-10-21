// @story #2039 #2045
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createRuntimeRootFixture } from '../../../../helpers/runtime-root-fixture.mjs';
import { bundle, derived, rubric } from '../../../../helpers/local-estimation-evidence-fixture.mjs';
import {
  planRuntimeMigration,
  applyRuntimeMigration,
} from '../../../../../task-tracker/lib/runtime-migration.mjs';
import { openLocalEvidenceStore } from '../../../../../task-tracker/lib/estimation/local-evidence-store.mjs';
import {
  importLocalEvidence,
  validateLocalEvidence,
} from '../../../../../task-tracker/lib/estimation/local-evidence.mjs';
async function fixture(t, io = fs) {
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
  const store = openLocalEvidenceStore({
    projectRoot: root,
    host: 'github.com',
    repository: 'owner/repo',
    fs: io,
  });
  return { root, store };
}
const unavailable = (fn) => assert.throws(fn, { code: 'LOCAL_EVIDENCE_STORE_UNAVAILABLE' });
test('durable import survives reopening outside the temporary story cache with exact bytes and no cloud grant', async (t) => {
  const f = await fixture(t);
  const b = bundle();
  const expected = validateLocalEvidence(b);
  const imported = await importLocalEvidence({ evidenceStore: f.store, bundle: b });
  assert.equal(imported.manifestDigest, expected.manifestDigest);
  assert.equal(
    f.store.path.startsWith(path.join(f.root, '.ai-task-manager', 'runtime', 'store') + path.sep),
    true
  );
  const reopened = openLocalEvidenceStore({
    projectRoot: f.root,
    host: 'github.com',
    repository: 'owner/repo',
  });
  const read = reopened.read(imported.manifestDigest);
  assert.deepEqual(read.manifest, b.manifest);
  assert.deepEqual(read.planBytes, b.planBytes);
  assert.deepEqual([...read.payloads], [...b.payloads]);
  assert.equal(Object.hasOwn(read.records[0].record, 'authority'), false);
  assert.equal(fs.statSync(reopened.path).mode & 0o777, 0o700);
  for (const name of ['manifests', 'payloads', 'plans', 'records'])
    for (const file of fs.readdirSync(path.join(reopened.path, name)))
      assert.equal(fs.statSync(path.join(reopened.path, name, file)).mode & 0o777, 0o600);
  const again = await importLocalEvidence({ evidenceStore: reopened, bundle: b });
  assert.equal(again.manifestDigest, imported.manifestDigest);
});
test('wrong repository or host refuses without publishing a manifest', async (t) => {
  const f = await fixture(t);
  for (const identity of [
    { host: 'elsewhere.com', repository: 'owner/repo' },
    { host: 'github.com', repository: 'other/repo' },
  ]) {
    const other = openLocalEvidenceStore({ projectRoot: f.root, ...identity });
    await assert.rejects(importLocalEvidence({ evidenceStore: other, bundle: bundle() }), {
      code: 'LOCAL_EVIDENCE_STORE_UNAVAILABLE',
    });
    assert.deepEqual(fs.readdirSync(path.join(other.path, 'manifests')), []);
  }
});
test('conflicting record ID across imports preserves original evidence and refuses the new bundle', async (t) => {
  const f = await fixture(t);
  const original = bundle();
  const accepted = await importLocalEvidence({ evidenceStore: f.store, bundle: original });
  const changed = bundle([
    { record: derived({ payload: { ...rubric(), review: { reworkProbability: 0.4 } } }) },
  ]);
  await assert.rejects(importLocalEvidence({ evidenceStore: f.store, bundle: changed }), {
    code: 'LOCAL_EVIDENCE_STORE_UNAVAILABLE',
  });
  assert.deepEqual(f.store.read(accepted.manifestDigest).manifest, original.manifest);
  assert.equal(
    fs.existsSync(
      path.join(f.store.path, 'manifests', validateLocalEvidence(changed).manifestDigest + '.json')
    ),
    false
  );
});
for (const kind of ['manifest', 'payload', 'plan', 'record'])
  test(`missing ${kind} refuses instead of reconstructing evidence`, async (t) => {
    const f = await fixture(t);
    const b = bundle();
    const accepted = await importLocalEvidence({ evidenceStore: f.store, bundle: b });
    const locations = {
      manifest: path.join(f.store.path, 'manifests', accepted.manifestDigest + '.json'),
      payload: path.join(f.store.path, b.manifest.inputs[0].payloadPath),
      plan: path.join(f.store.path, 'plans', b.manifest.plan.digest + '.txt'),
      record: path.join(f.store.path, 'records', b.manifest.inputs[0].recordId + '.json'),
    };
    const target = locations[kind];
    fs.unlinkSync(target);
    unavailable(() => f.store.read(accepted.manifestDigest));
    assert.equal(fs.existsSync(target), false);
  });
for (const kind of ['bytes', 'symlink', 'hardlink', 'permissions'])
  test(`unsafe payload ${kind} refuses and preserves the evidence`, async (t) => {
    const f = await fixture(t);
    const b = bundle();
    const accepted = await importLocalEvidence({ evidenceStore: f.store, bundle: b });
    const file = path.join(f.store.path, b.manifest.inputs[0].payloadPath);
    if (kind === 'bytes') fs.writeFileSync(file, 'bad');
    if (kind === 'symlink') {
      fs.renameSync(file, file + '.saved');
      fs.symlinkSync(file + '.saved', file);
    }
    if (kind === 'hardlink') fs.linkSync(file, file + '.alias');
    if (kind === 'permissions') fs.chmodSync(file, 0o644);
    unavailable(() => f.store.read(accepted.manifestDigest));
    await assert.rejects(importLocalEvidence({ evidenceStore: f.store, bundle: b }));
    if (kind === 'bytes') assert.equal(fs.readFileSync(file, 'utf8'), 'bad');
    if (kind === 'symlink') assert.equal(fs.lstatSync(file).isSymbolicLink(), true);
  });
test('missing activated runtime refuses without initializing controls', (t) => {
  const root = fs.realpathSync(createRuntimeRootFixture('local-evidence-uninitialized-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  unavailable(() =>
    openLocalEvidenceStore({ projectRoot: root, host: 'github.com', repository: 'owner/repo' })
  );
  assert.equal(
    fs.existsSync(path.join(root, '.ai-task-manager', 'runtime', 'control.json')),
    false
  );
});
test('loss of runtime controls invalidates an existing handle', async (t) => {
  const f = await fixture(t);
  const b = bundle();
  const accepted = await importLocalEvidence({ evidenceStore: f.store, bundle: b });
  fs.unlinkSync(path.join(f.root, '.ai-task-manager', 'runtime', 'control.json'));
  unavailable(() => f.store.read(accepted.manifestDigest));
  await assert.rejects(importLocalEvidence({ evidenceStore: f.store, bundle: b }), {
    code: 'LOCAL_EVIDENCE_STORE_UNAVAILABLE',
  });
});
for (const method of ['writeFileSync', 'fsyncSync', 'linkSync', 'unlinkSync'])
  for (const phase of ['before', 'after'])
    test(`${phase} ${method} persistence failure cannot acknowledge an import and exact retry succeeds`, async (t) => {
      let armed = false;
      const io = new Proxy(fs, {
        get(target, key) {
          const value = target[key];
          if (key !== method) return value;
          return (...args) => {
            if (armed && phase === 'before') {
              armed = false;
              throw Object.assign(new Error('injected persistence failure'), { code: 'EIO' });
            }
            const result = value(...args);
            if (armed && phase === 'after') {
              armed = false;
              throw Object.assign(new Error('injected persistence failure'), { code: 'EIO' });
            }
            return result;
          };
        },
      });
      const f = await fixture(t, io);
      const b = bundle();
      armed = true;
      await assert.rejects(importLocalEvidence({ evidenceStore: f.store, bundle: b }));
      armed = false;
      const retried = await importLocalEvidence({ evidenceStore: f.store, bundle: b });
      assert.deepEqual(f.store.read(retried.manifestDigest).manifest, b.manifest);
    });
for (const phase of ['before', 'after'])
  test(`${phase} final manifest publication failure is retained and can be reconciled by exact retry`, async (t) => {
    let armed = false;
    const io = new Proxy(fs, {
      get(target, key) {
        const value = target[key];
        if (key !== 'linkSync') return value;
        return (...args) => {
          const matches = armed && String(args[1]).includes(path.sep + 'manifests' + path.sep);
          if (matches && phase === 'before') {
            armed = false;
            throw Object.assign(new Error('manifest publication interrupted'), { code: 'EIO' });
          }
          const result = value(...args);
          if (matches && phase === 'after') {
            armed = false;
            throw Object.assign(new Error('manifest publication interrupted'), { code: 'EIO' });
          }
          return result;
        };
      },
    });
    const f = await fixture(t, io);
    const b = bundle();
    armed = true;
    await assert.rejects(importLocalEvidence({ evidenceStore: f.store, bundle: b }));
    armed = false;
    const retried = await importLocalEvidence({ evidenceStore: f.store, bundle: b });
    assert.deepEqual(f.store.read(retried.manifestDigest).manifest, b.manifest);
  });

test('exact import reconciles a redundant owned stage alias left after interrupted publication', async (t) => {
  const f = await fixture(t);
  const b = bundle();
  const accepted = await importLocalEvidence({ evidenceStore: f.store, bundle: b });
  const file = path.join(f.store.path, b.manifest.inputs[0].payloadPath);
  const stage = file + '.00000000-0000-4000-8000-000000000000.tmp';
  const before = fs.readFileSync(file);
  fs.linkSync(file, stage);
  unavailable(() => f.store.read(accepted.manifestDigest));
  const restored = await importLocalEvidence({ evidenceStore: f.store, bundle: b });
  assert.equal(restored.manifestDigest, accepted.manifestDigest);
  assert.deepEqual(fs.readFileSync(file), before);
  assert.equal(fs.existsSync(stage), false);
  assert.equal(fs.statSync(file).nlink, 1);
});

test('an owned-looking alias with an additional unknown link is never removed', async (t) => {
  const f = await fixture(t);
  const b = bundle();
  await importLocalEvidence({ evidenceStore: f.store, bundle: b });
  const file = path.join(f.store.path, b.manifest.inputs[0].payloadPath);
  const stage = file + '.00000000-0000-4000-8000-000000000000.tmp';
  fs.linkSync(file, stage);
  fs.linkSync(file, file + '.unknown');
  await assert.rejects(importLocalEvidence({ evidenceStore: f.store, bundle: b }), {
    code: 'LOCAL_EVIDENCE_STORE_UNAVAILABLE',
  });
  assert.equal(fs.existsSync(stage), true);
  assert.equal(fs.existsSync(file + '.unknown'), true);
  assert.equal(fs.statSync(file).nlink, 3);
});
