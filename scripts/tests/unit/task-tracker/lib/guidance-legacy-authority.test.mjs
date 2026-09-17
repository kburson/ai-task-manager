// @story #1655
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  attachLegacyAuthorityCapture,
  createLegacyAuthorityStore,
  replayLegacyAuthorityCapture,
} from '../../../helpers/guidance-legacy-authority.mjs';

const fixtureRoot = path.join(process.cwd(), 'scripts/tests/fixtures/1558/legacy-workflow');
const authorityFixture = JSON.parse(readFileSync(path.join(fixtureRoot, 'authority-store.json')));
const scenarios = JSON.parse(readFileSync(path.join(fixtureRoot, 'lifecycle-scenarios.json')));

test('authority store mutates only after the declared physical mutation transport', () => {
  const scenario = scenarios.scenarios.find(({ id }) => id === 'promote-success');
  const store = createLegacyAuthorityStore({ fixture: authorityFixture, scenario });
  const before = store.snapshot();
  for (const access of scenario.expectedAuthorityAccesses) store.read(access);
  assert.deepEqual(store.snapshot(), before);
  for (const transport of scenario.expectedTransport) store.observeTransport(transport);
  const result = store.finish();
  assert.equal(result.finalState.board.status, 'test');
  assert.equal(result.effects.length, 1);
  assert.equal(result.effects[0].transportRequestId, 'promote.mutate-board');
});

test('all seven success and refusal lanes reconcile while refusals remain immutable', () => {
  const actions = ['bind', 'resume', 'promote', 'test', 'review', 'deliver', 'close'];
  for (const action of actions) {
    for (const outcome of ['success', 'refusal']) {
      const scenario = scenarios.scenarios.find(
        (candidate) => candidate.action === action && candidate.outcome === outcome
      );
      assert.ok(scenario, `missing ${action} ${outcome} scenario`);
      const ledger = scenario.expectedTransport.map((request, index) => ({
        sequence: index + 1,
        requestId: request.id,
      }));
      const result = replayLegacyAuthorityCapture({
        fixture: authorityFixture,
        scenario,
        transportLedger: ledger,
      });
      assert.equal(result.authorityAccesses.length, scenario.expectedAuthorityAccesses.length);
      if (outcome === 'refusal') {
        assert.deepEqual(result.finalState, result.initialState, `${action} refusal mutated state`);
        assert.deepEqual(result.effects, []);
      } else {
        assert.notDeepEqual(
          result.finalState,
          result.initialState,
          `${action} success had no effect`
        );
      }
    }
    const success = scenarios.scenarios.find(
      (candidate) => candidate.action === action && candidate.outcome === 'success'
    );
    const refusal = scenarios.scenarios.find(
      (candidate) => candidate.action === action && candidate.outcome === 'refusal'
    );
    assert.deepEqual(success.productionPredicates, refusal.productionPredicates);
    assert.equal(success.formatter, refusal.formatter);
  }
});

test('approved and missing-approval close scenarios differ by authority alone', () => {
  const approved = scenarios.scenarios.find(({ id }) => id === 'close-success');
  const missing = scenarios.scenarios.find(({ id }) => id === 'close-refusal');
  const ignored = new Set([
    'id',
    'outcome',
    'authorityPatch',
    'expectedTransport',
    'expectedEffects',
  ]);
  const common = (scenario) =>
    Object.fromEntries(Object.entries(scenario).filter(([key]) => !ignored.has(key)));
  assert.deepEqual(common(approved), common(missing));
  assert.deepEqual(approved.authorityPatch, { approvals: { review: true } });
  assert.deepEqual(missing.authorityPatch, { approvals: { review: false } });
  for (const [scenario, expected] of [
    [approved, true],
    [missing, false],
  ]) {
    const store = createLegacyAuthorityStore({ fixture: authorityFixture, scenario });
    store.read(scenario.expectedAuthorityAccesses[0]);
    const approval = store.read(scenario.expectedAuthorityAccesses[1]);
    assert.equal(approval.review, expected);
  }
});

test('missing, extra, reordered, paged and retried observations fail closed', () => {
  const scenario = scenarios.scenarios.find(({ id }) => id === 'deliver-success');
  const store = createLegacyAuthorityStore({ fixture: authorityFixture, scenario });
  assert.throws(
    () => store.read({ ...scenario.expectedAuthorityAccesses[0], page: 99 }),
    /authority access mismatch/
  );

  assert.throws(
    () =>
      replayLegacyAuthorityCapture({
        fixture: authorityFixture,
        scenario,
        transportLedger: scenario.expectedTransport.slice(0, -1).map((request, index) => ({
          sequence: index + 1,
          requestId: request.id,
        })),
      }),
    /transport ledger does not reconcile/
  );

  const extra = scenario.expectedTransport.map((request, index) => ({
    sequence: index + 1,
    requestId: request.id,
  }));
  extra.push({ sequence: extra.length + 1, requestId: 'undeclared' });
  assert.throws(
    () =>
      replayLegacyAuthorityCapture({ fixture: authorityFixture, scenario, transportLedger: extra }),
    /transport ledger does not reconcile/
  );

  assert.throws(
    () =>
      replayLegacyAuthorityCapture({
        fixture: authorityFixture,
        scenario,
        transportLedger: scenario.expectedTransport.map((request, index) => ({
          sequence: index + 1,
          requestId: request.id,
        })),
        authorityAccesses: scenario.expectedAuthorityAccesses.slice(0, -1),
      }),
    /(?:authority accesses do not reconcile|before authority reads reconciled)/
  );

  const wrongRetry = structuredClone(scenario.expectedAuthorityAccesses);
  wrongRetry.at(-1).attempt = 9;
  assert.throws(
    () =>
      replayLegacyAuthorityCapture({
        fixture: authorityFixture,
        scenario,
        transportLedger: scenario.expectedTransport.map((request, index) => ({
          sequence: index + 1,
          requestId: request.id,
        })),
        authorityAccesses: wrongRetry,
      }),
    /authority access mismatch/
  );
});

test('capture runner exposes complete streams, accesses and transport-gated effects', () => {
  const scenario = scenarios.scenarios.find(({ id }) => id === 'close-success');
  const requestDeclarations = scenario.expectedTransport.map((request, index) => ({
    id: request.id,
    authorityAccesses: index === 0 ? scenario.expectedAuthorityAccesses : [],
  }));
  const capture = attachLegacyAuthorityCapture({
    capture: {
      stdout: 'complete stdout',
      stderr: 'complete stderr',
      transportLedger: scenario.expectedTransport.map((request, index) => ({
        sequence: index + 1,
        requestId: request.id,
      })),
    },
    fixture: authorityFixture,
    authorityScenario: scenario,
    requestDeclarations,
  });
  assert.equal(capture.stdout, 'complete stdout');
  assert.equal(capture.stderr, 'complete stderr');
  assert.equal(capture.authorityAccesses.length, 3);
  assert.equal(capture.authorityEffects[0].transportRequestId, 'close.mutate-issue');
  assert.equal(capture.finalAuthorityState.issue.open, false);
});

test('fixtures contain authority, not mocked validators or complete verb results', () => {
  for (const scenario of scenarios.scenarios) {
    for (const forbidden of [
      'validatorResult',
      'readinessResult',
      'guardResult',
      'routingResult',
      'verbResult',
    ]) {
      assert.equal(Object.hasOwn(scenario, forbidden), false, `${scenario.id} mocks ${forbidden}`);
    }
  }
});

test('a mutation transport cannot precede its declared authority reads', () => {
  const scenario = scenarios.scenarios.find(({ id }) => id === 'bind-success');
  const store = createLegacyAuthorityStore({ fixture: authorityFixture, scenario });
  store.observeTransport(scenario.expectedTransport[0]);
  assert.throws(
    () => store.observeTransport(scenario.expectedTransport[1]),
    /before authority reads reconciled/
  );
});
