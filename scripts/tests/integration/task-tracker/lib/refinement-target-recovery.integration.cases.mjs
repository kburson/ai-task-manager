// @story #2073 — real publication must use fresh concrete target transport.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runSourceBoundary } from '../../../fixtures/refinement-traffic-runner.mjs';

export function registerTargetRecoveryCases() {
  test('real changed publication uses exact-target readers and completes unchanged durable protocol', () => {
    const result = runSourceBoundary({
      sourceRoot: process.cwd(),
      fixtureId: 'changed-publication',
      boundary: 'publication',
    });
    assert.equal(result.outcome.status, 'recorded');
    assert.equal(result.snapshot.publication.status, 'complete');
    assert.deepEqual(result.snapshot.projectValues, { estimate: 3, size: 'M' });
    assert.equal(result.ledger.filter((entry) => entry.family === 'target-binding').length, 1);
    assert.ok(result.ledger.some((entry) => entry.family === 'target-project'));
    assert.ok(result.ledger.some((entry) => entry.family === 'target-body'));
  });

  async function ownedFixture(t) {
    const { mkdtempProjectIsolated } = await import('../../../../task-tracker/lib/scratch-dir.mjs');
    const { makeTrafficFixture } = await import('../../../fixtures/refinement-traffic-cases.mjs');
    const { rmSync } = await import('node:fs');
    const sourceRoot = process.cwd(),
      projectDir = mkdtempProjectIsolated('2073-recovery-');
    const f = await makeTrafficFixture({
      sourceRoot,
      projectDir,
      fixtureId: 'changed-publication',
    });
    t.after(() => {
      try {
        f.close();
      } finally {
        rmSync(projectDir, { recursive: true, force: true });
      }
    });
    return f;
  }
  for (const mode of ['apply-then-throw', 'fail-before-apply'])
    test('exact retry reconciles ' + mode + ' without replaying an applied Estimate', async (t) => {
      const f = await ownedFixture(t);
      f.provider.failureSchedule.push({ family: 'project-field-write', occurrence: 1, mode });
      const first = await f.invoke('publication');
      assert.equal(first.status, 'partial');
      const pending = await f.snapshot();
      assert.equal(pending.publication.status, 'pending');
      const second = await f.invoke('publication');
      assert.equal(second.status, 'recorded');
      const done = await f.snapshot();
      assert.equal(done.publication.status, 'complete');
      const { assertTrafficBudget } =
        await import('../../../helpers/refinement-traffic-provider.mjs');
      const { trafficBudgets } = await import('../../../fixtures/refinement-traffic-cases.mjs');
      assertTrafficBudget(f.provider.ledger, trafficBudgets.recovery);
      assert.deepEqual(done.projectValues, { estimate: 3, size: 'M' });
      assert.equal(done.publication.operationId, pending.publication.operationId);
      assert.deepEqual(done.before, pending.before);
      const estimates = f.provider.ledger.filter(
        (entry) => entry.family === 'project-field-write' && entry.field === 'estimate'
      );
      assert.equal(estimates.length, mode === 'apply-then-throw' ? 1 : 2);
      assert.equal(
        f.provider.ledger.filter((entry) => entry.family === 'target-binding').length,
        2
      );
    });
  test('confirmed-effect drift refuses recovery before any additional business write', async (t) => {
    const f = await ownedFixture(t);
    f.provider.failureSchedule.push({
      family: 'project-field-write',
      occurrence: 2,
      mode: 'fail-before-apply',
    });
    await f.invoke('publication');
    const before = f.provider.ledger.filter(
      (entry) => entry.family === 'project-field-write'
    ).length;
    f.provider.state.repository.issue.projectItems.nodes[0].fieldValues.nodes[0].number = 99;
    const refused = await f.invoke('publication');
    assert.equal(refused.status, 'refused', JSON.stringify(refused));
    assert.match(refused.reason, /effect-read-back/);
    assert.equal(
      f.provider.ledger.filter((entry) => entry.family === 'project-field-write').length,
      before
    );
  });

  test('public runRefine reaches real target publication and the declared promotion boundary', async () => {
    const result = runSourceBoundary({
      sourceRoot: process.cwd(),
      fixtureId: 'changed-refine-route',
      boundary: 'refine-entry-route',
    });
    assert.deepEqual(result.outcome, {
      status: 'route-boundary',
      reason: 'promotion-sentinel',
      wholeCommandSuccess: false,
    });
    assert.equal(result.snapshot.publication.status, 'complete');
    assert.equal(result.snapshot.publication.writerId, 'refine');
    assert.match(result.snapshot.issueBody, /aitm-refinement-rationale/);
    assert.ok(result.ledger.some((entry) => entry.family === 'target-binding'));
    assert.ok(result.ledger.some((entry) => entry.family === 'target-project'));
    assert.ok(result.ledger.some((entry) => entry.family === 'target-body'));
    assert.ok(!result.ledger.some((entry) => entry.outcome === 'failure'));
    const { assertTrafficBudget } =
      await import('../../../helpers/refinement-traffic-provider.mjs');
    const { trafficBudgets } = await import('../../../fixtures/refinement-traffic-cases.mjs');
    assertTrafficBudget(result.ledger, trafficBudgets.publicRoute);
  });

  test('pre-change pending manifest recovers without migrating its subject or before digests', async (t) => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { execFileSync } = await import('node:child_process');
    const path = await import('node:path');
    const sourceRoot = mkdtempSync(path.resolve('.scratch/2073-legacy-'));
    t.after(() => rmSync(sourceRoot, { recursive: true, force: true }));
    execFileSync('tar', ['-x', '-C', sourceRoot], {
      input: execFileSync(
        'git',
        ['archive', '52ff0fe734cf682c604695ab0c7b005f512c2844', 'scripts'],
        {
          maxBuffer: 64 * 1024 * 1024,
        }
      ),
    });
    const seed = runSourceBoundary({
      sourceRoot,
      fixtureId: 'legacy-pending',
      boundary: 'publication',
    });
    assert.equal(seed.outcome.status, 'partial');
    assert.equal(seed.snapshot.publication.status, 'pending');
    const f = await ownedFixture(t);
    f.provider.state.repository.issue.body = seed.snapshot.issueBody;
    const values = f.provider.state.repository.issue.projectItems.nodes[0].fieldValues.nodes;
    values[0].number = seed.snapshot.projectValues.estimate;
    values[1].name = seed.snapshot.projectValues.size;
    values[1].optionId = 'OPT_' + values[1].name;
    assert.equal((await f.invoke('publication')).status, 'recorded');
    const done = await f.snapshot();
    assert.deepEqual(done.before, seed.snapshot.before);
    assert.deepEqual(done.publication.subject, seed.snapshot.publication.subject);
    assert.equal(done.publication.operationId, seed.snapshot.publication.operationId);
    assert.equal(
      done.publication.intendedInputDigest,
      seed.snapshot.publication.intendedInputDigest
    );
    assert.equal(done.publication.status, 'complete');
    assert.ok(
      !f.provider.ledger.some(
        (entry) => entry.family === 'project-field-write' && entry.field === 'estimate'
      )
    );
    assert.equal(f.provider.ledger.filter((entry) => entry.family === 'target-binding').length, 1);
  });
}
