// @story #1670
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  normalizeRefusal,
  REGISTERED_GUARD_IDS,
  validateWarning,
} from '../../../../task-tracker/lib/action-decision/contract.mjs';
import { listLifecycleActions } from '../../../../task-tracker/lib/lifecycle-policy/actions.mjs';
import { measureFixedActionAuthorityReads } from '../../../helpers/action-authority-cost.mjs';

const FIXTURE_ROOT = new URL('../../../fixtures/1558/', import.meta.url);
const ACTIONS = ['bind', 'resume', 'promote', 'test', 'review', 'deliver', 'close'];
const SCENARIOS = ['ready', 'blocked', 'indeterminate', 'changedAuthority', 'postReadyFailure'];
const SHARED_CONTRACT_SUITES = [
  'scripts/tests/unit/task-tracker/lib/action-decision-contract.test.mjs',
  'scripts/tests/integration/task-tracker/lib/action-normalization.test.mjs',
];

function fixture(name) {
  const url = new URL(name, FIXTURE_ROOT);
  assert.ok(existsSync(url), `${name} must be captured before A2 certification`);
  return JSON.parse(readFileSync(url, 'utf8'));
}

function sha256OfProjectPath(path) {
  const bytes = readFileSync(new URL(`../../../../../${path}`, import.meta.url));
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

test('aggregate parity matrix covers every lifecycle action and required scenario', () => {
  const matrix = fixture('action-parity-matrix.json');
  assert.equal(matrix.schema, 'aitm.action-parity-matrix/v1');
  assert.deepEqual(matrix.certification, {
    scope: 'A2-seven-action-conformance',
    status: 'certified',
    evidence: [
      'action-parity-matrix.json',
      'action-authority-cost.json',
      'residual-legacy-review.json',
    ],
    releaseMeaning: 'evaluator-parity-only; not package release',
  });
  assert.deepEqual(
    matrix.actions.map(({ id }) => id),
    ACTIONS
  );
  assert.deepEqual(
    listLifecycleActions()
      .filter(({ explainReady }) => explainReady)
      .map(({ id }) => id),
    ACTIONS
  );
  for (const action of matrix.actions) {
    assert.deepEqual(Object.keys(action.scenarios), SCENARIOS, `${action.id} scenario coverage`);
    for (const [scenario, evidence] of Object.entries(action.scenarios)) {
      assert.ok(['typed', 'manual'].includes(evidence.disposition), `${action.id}.${scenario}`);
      if (evidence.disposition === 'manual') {
        assert.ok(
          evidence.rationale?.length > 40,
          `${action.id}.${scenario} manual disposition needs an explicit limitation`
        );
      }
      assert.ok(evidence.file.startsWith('scripts/tests/'), `${action.id}.${scenario} source`);
      assert.ok(
        existsSync(new URL(`../../../../../${evidence.file}`, import.meta.url)),
        `${action.id}.${scenario} must cite an existing test suite`
      );
    }
  }
});

test('aggregate parity executes the seven action suites, not only their metadata', () => {
  const matrix = fixture('action-parity-matrix.json');
  const files = [
    ...new Set(
      matrix.actions
        .flatMap((action) => Object.values(action.scenarios).map((e) => e.file))
        .concat(SHARED_CONTRACT_SUITES)
    ),
  ];
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const run = spawnSync(process.execPath, ['--test', ...files], {
    cwd: new URL('../../../../../', import.meta.url),
    encoding: 'utf8',
    env,
    timeout: 120_000,
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /ℹ fail 0\b/);
  for (const action of matrix.actions) {
    for (const [scenario, evidence] of Object.entries(action.scenarios)) {
      assert.ok(
        run.stdout.includes(`✔ ${evidence.test} (`),
        `${action.id}.${scenario} must execute and pass its named test`
      );
    }
  }
});

test('authority cost evidence matches fresh physical reads before A2 certification', async () => {
  const cost = fixture('action-authority-cost.json');
  const measured = await measureFixedActionAuthorityReads();
  assert.equal(cost.schema, 'aitm.action-authority-cost/v1');
  assert.deepEqual(
    cost.actions.map(({ id }) => id),
    ACTIONS
  );
  const legacy = fixture('legacy-baseline.json');
  assert.equal(cost.source.legacyBaseline.generationSha256, legacy.generationSha256);
  assert.equal(
    cost.source.legacyBaseline.fixturePhysicalRequests,
    legacy.timing.fixtureTransport.totalRequests
  );
  assert.equal(
    cost.source.legacyBaseline.fixtureSamples,
    legacy.timing.fixtureTransport.sampleCount
  );
  for (const source of [
    cost.source.wbs4AuthorityBaseline,
    cost.source.legacyBaseline,
    cost.source.observationInventory,
    cost.source.measurementHelper,
    ...cost.source.legacyTranscripts,
  ]) {
    assert.equal(source.sha256, sha256OfProjectPath(source.path), source.path);
  }
  assert.equal(cost.deterministic.unit, 'physical-read-port-invocation');
  for (const action of cost.actions) {
    const current = measured.actions.find(({ id }) => id === action.id);
    assert.equal(current.status, 'ready', `${action.id} measurement must reach ready`);
    assert.equal(
      current.requestCount,
      action.requestCount,
      `${action.id} measured read count drift`
    );
    assert.deepEqual(current.requestKeys, action.requestKeys, `${action.id} read identities drift`);
    assert.ok(Number.isSafeInteger(action.requestCount) && action.requestCount > 0, action.id);
    assert.ok(Number.isSafeInteger(action.ceiling) && action.ceiling > 0, action.id);
    assert.ok(action.requestCount * 5 <= action.ceiling * 4, `${action.id} needs >=20% headroom`);
    assert.equal(action.requestKeys.length, action.requestCount, `${action.id} physical reads`);
    assert.equal(new Set(action.requestKeys).size, action.requestCount, `${action.id} memoization`);
    assert.ok(action.legacyEquivalence.length > 0, `${action.id} WBS4 mapping`);
  }
  const live = cost.liveService;
  assert.equal(live.kind, 'controlled-read-only');
  assert.deepEqual(live.command.slice(0, 3), ['gh', 'issue', 'view']);
  assert.equal(live.mutations, 0);
  assert.ok(live.sampleCount >= 5);
  assert.equal(live.samplesMs.length, live.sampleCount);
  const samples = [...live.samplesMs].sort((left, right) => left - right);
  assert.equal(live.medianMs, samples[Math.ceil(samples.length * 0.5) - 1]);
  assert.equal(live.p95Ms, samples[Math.ceil(samples.length * 0.95) - 1]);
});

test('legacy refusal and warning fallbacks remain inventoried and fail closed', () => {
  const residual = fixture('residual-legacy-review.json');
  assert.equal(residual.schema, 'aitm.residual-legacy-review/v1');
  const inventory = JSON.parse(
    readFileSync(
      new URL('../../../../task-tracker/lib/action-decision/legacy-refusals.json', import.meta.url),
      'utf8'
    )
  );
  assert.deepEqual(
    residual.entries.map(({ guardId }) => guardId),
    REGISTERED_GUARD_IDS
  );
  for (const entry of residual.entries) {
    assert.equal(entry.disposition, 'manual-investigation');
    assert.ok(entry.rationale.length > 20, `${entry.guardId} requires a reviewed reason`);
    assert.equal(inventory.guards[entry.guardId].complete, true);
    assert.ok(inventory.guards[entry.guardId].sites.length > 0);
    assert.ok(
      inventory.guards[entry.guardId].sites.every(({ kind }) =>
        ['refusal', 'warning'].includes(kind)
      )
    );
  }
  assert.throws(
    () =>
      normalizeRefusal(
        { reason: 'new legacy refusal' },
        { guardId: 'unregistered-new-guard', legacyInventory: inventory }
      ),
    /not fully inventoried/
  );
  assert.throws(
    () => validateWarning({ code: 'new-unknown-warning', args: {} }, { status: 'blocked' }),
    /domain/
  );
});
