// @story #2073 — transport fidelity and independent dispatch budgets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { promisify } from 'node:util';

const helper = new URL('../../../helpers/refinement-traffic-provider.mjs', import.meta.url);
test('traffic budgets reject extra dispatches, unknown and ambiguous shapes', async () => {
  const { assertTrafficBudget, createTrafficProvider } = await import(helper);
  const entry = { family: 'target-binding' };
  const budget = { total: 1, families: { 'target-binding': 1 } };
  assert.doesNotThrow(() => assertTrafficBudget([entry], budget));
  assert.throws(() => assertTrafficBudget([entry, entry], budget), /budget/);
  assert.throws(() => assertTrafficBudget([{ family: 'unknown' }], budget), /unclassified/);
  const query = 'query { repository(owner:"o",name:"r"){issue(number:2073){id body}} }';
  const population = {
    repository: {
      nameWithOwner: 'o/r',
      issue: { id: 'I', number: 2073, body: 'original', projectItems: { nodes: [] } },
    },
  };
  const provider = createTrafficProvider({
    population,
    shapes: [{ query, family: 'issue-body-read' }],
  });
  const result = await provider.graphql({ query });
  assert.deepEqual(result, { data: { repository: { issue: { id: 'I', body: 'original' } } } });
  await assert.rejects(
    provider.graphql({ query: query.replace('id body', 'id title') }),
    /unclassified/
  );
  assert.throws(
    () =>
      createTrafficProvider({
        population,
        shapes: [
          { query, family: 'a' },
          { query, family: 'b' },
        ],
      }),
    /ambiguous/
  );
});

test('all CLI ports preserve selected reads and failure signals', async () => {
  const { createTrafficProvider } = await import(helper);
  const query = 'query { repository(owner:"o",name:"r"){issue(number:2073){body}} }';
  const population = {
    repository: { nameWithOwner: 'o/r', issue: { id: 'I', number: 2073, body: 'original' } },
  };
  const p = createTrafficProvider({ population, shapes: [{ query, family: 'issue-body-read' }] });
  const args = ['api', 'graphql', '-f', 'query=' + query];
  const a = await p.pexec('gh', args);
  const b = await promisify(p.execFile)('gh', args);
  assert.equal(a.stdout, b.stdout);
  const child = p.spawn('gh', ['api', 'graphql', '--input', '-']);
  let output = '';
  child.stdout.on('data', (bytes) => (output += bytes));
  const done = new Promise((resolve) => child.on('close', resolve));
  child.stdin.end(JSON.stringify({ query, variables: {} }));
  assert.equal(await done, 0);
  assert.equal(output, a.stdout);
  await assert.rejects(p.pexec('gh', ['repo', 'delete', 'o/r']), /unclassified/);
  assert.equal(p.ledger.length, 4);
});

test('provider applies a lost-ack mutation and subsequent observation sees the new value', async () => {
  const { createTrafficProvider } = await import(helper);
  const query = 'mutation($id:ID!){ update(id:$id){id} }';
  const p = createTrafficProvider({
    population: { update: { id: 'I' }, value: 2 },
    shapes: [{ query, family: 'project-field-write', apply: ({ state }) => (state.value = 3) }],
    failureSchedule: [{ afterDispatch: 1, loseAck: true }],
  });
  await assert.rejects(p.graphql({ query, variables: { id: 'I' } }), /lost acknowledgement/);
  assert.equal(p.state.value, 3);
  assert.equal(p.ledger[0].outcome, 'failure');
  assert.equal(p.ledger[0].cost, null);
  const q = 'query($id:ID!){node(id:$id){id}}';
  const bad = createTrafficProvider({
    population: { node: { id: 'I' } },
    shapes: [{ query: q, family: 'target-binding' }],
  });
  await assert.rejects(bad.graphql({ query: q, variables: { id: 'foreign' } }), /unknown node/);
  assert.equal(bad.ledger[0].outcome, 'failure');
});

test('retained source reproduces equal complete publications under independent ceilings', async (t) => {
  const { runSourceBoundary } = await import('../../../fixtures/refinement-traffic-runner.mjs');
  const { retainedBaselineBudget, fixtureBudgets, trafficBudgets } =
    await import('../../../fixtures/refinement-traffic-cases.mjs');
  const { assertTrafficBudget } = await import(helper);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { execFileSync } = await import('node:child_process');
  const path = await import('node:path');
  const sourceRoot = mkdtempSync(path.resolve('.scratch/2073-retained-'));
  t.after(() => rmSync(sourceRoot, { recursive: true, force: true }));
  const archive = execFileSync(
    'git',
    ['archive', '52ff0fe734cf682c604695ab0c7b005f512c2844', 'scripts'],
    { maxBuffer: 64 * 1024 * 1024 }
  );
  execFileSync('tar', ['-x', '-C', sourceRoot], { input: archive });
  const options = { sourceRoot, fixtureId: 'changed-publication', boundary: 'publication' };
  const a = runSourceBoundary(options),
    b = runSourceBoundary(options);
  assert.equal(a.outcome.status, 'recorded');
  assert.equal(a.snapshot.publication.status, 'complete');
  assert.deepEqual(a.snapshot.projectValues, { estimate: 3, size: 'M' });
  assert.deepEqual(a.outcome, b.outcome);
  assert.deepEqual(a.snapshot, b.snapshot);
  assert.deepEqual(a.ledger, b.ledger);
  assert.deepEqual(a.sourceManifest, b.sourceManifest);
  assertTrafficBudget(a.ledger, retainedBaselineBudget);
  assert.ok(a.ledger.every((entry) => entry.cost === null));
  const optimized = runSourceBoundary({ ...options, sourceRoot: process.cwd() });
  assert.equal(optimized.outcome.status, 'recorded');
  assert.deepEqual(optimized.outcome, a.outcome);
  assert.deepEqual(optimized.snapshot, a.snapshot);
  assert.equal(optimized.fixtureHash, a.fixtureHash);
  assert.equal(optimized.configurationHash, a.configurationHash);
  assertTrafficBudget(optimized.ledger, fixtureBudgets['changed-publication']);
  assert.ok(optimized.ledger.length < a.ledger.length);
  for (const [fixtureId, boundary, budget, baselineTotal] of [
    ['unchanged-publication', 'publication', trafficBudgets.unchanged, 16],
    ['empty-leaf', 'hook', trafficBudgets.emptyLeaf, 1],
    ['empty-unmarked-leaf', 'hook', trafficBudgets.emptyLeaf, 1],
    ['two-child-ready-epic', 'hook', trafficBudgets.parent, 1],
    ['two-page-comments-leaf', 'hook', trafficBudgets.comments, 2],
    ['51-child-ready-epic', 'hook', trafficBudgets.parent51, 2],
  ]) {
    const old = runSourceBoundary({ sourceRoot, fixtureId, boundary }),
      current = runSourceBoundary({ sourceRoot: process.cwd(), fixtureId, boundary });
    assert.deepEqual(current.outcome, old.outcome, fixtureId);
    assert.deepEqual(current.snapshot, old.snapshot, fixtureId);
    assert.equal(current.fixtureHash, old.fixtureHash);
    assert.equal(current.configurationHash, old.configurationHash);
    assert.ok(old.ledger.length <= baselineTotal);
    assertTrafficBudget(current.ledger, budget);
    if (fixtureId === 'unchanged-publication') assert.equal(current.outcome.status, 'unchanged');
    else if (!fixtureId.startsWith('51-')) assert.equal(current.outcome.decision, 'allow');
  }
});

// The story's declared verifier includes real admission, target and recovery checks.
import { registerHookTrafficCases } from './decomposition-hook-traffic.integration.cases.mjs';
import { registerTargetRecoveryCases } from './refinement-target-recovery.integration.cases.mjs';
import { registerTargetObservationCases } from '../../../unit/task-tracker/lib/decomposition-target-observation.cases.mjs';
registerHookTrafficCases();
registerTargetRecoveryCases();
registerTargetObservationCases();

test('every fixed budget rejects extra family and total requests plus unknown operations', async () => {
  const { trafficBudgets } = await import('../../../fixtures/refinement-traffic-cases.mjs');
  const { assertTrafficBudget } = await import(helper);
  for (const budget of [
    trafficBudgets.changedPublication.baseline,
    trafficBudgets.changedPublication.optimized,
    ...Object.entries(trafficBudgets)
      .filter(([key]) => key !== 'changedPublication')
      .map(([, value]) => value),
  ]) {
    const family = Object.keys(budget.families)[0];
    assert.throws(
      () =>
        assertTrafficBudget(
          Array.from({ length: budget.total + 1 }, () => ({ family })),
          budget
        ),
      /total budget/
    );
    assert.throws(() => assertTrafficBudget([{ family: 'unknown' }], budget), /unclassified/);
    for (const [name, limit] of Object.entries(budget.families)) {
      const isolated = { ...budget, total: limit + 1 };
      assert.doesNotThrow(() =>
        assertTrafficBudget(
          Array.from({ length: limit }, () => ({ family: name })),
          isolated
        )
      );
      assert.throws(
        () =>
          assertTrafficBudget(
            Array.from({ length: limit + 1 }, () => ({ family: name })),
            isolated
          ),
        new RegExp(name + ' budget')
      );
    }
  }
});
