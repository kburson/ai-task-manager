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
  const { retainedBaselineBudget } = await import('../../../fixtures/refinement-traffic-cases.mjs');
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
});
