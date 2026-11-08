// @story #2163 — each physical write boundary is a registered subprocess retry.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readDecompositionRecords } from '../../../task-tracker/lib/decomposition-records.mjs';

export function registerInflationRetryCases({
  startFixture,
  inflation,
  scenarios,
  phases = ['before-apply', 'after-apply-before-response'],
}) {
  const mode = process.env.INFLATION_FIXTURE_MATRIX_MODE ?? 'all';
  if (!['all', 'representative'].includes(mode)) throw new Error('inflation-fixture:matrix-mode');
  test(
    `registered inflation interruption matrix (${mode}) preserves durable intent and exactly-once effects`,
    { concurrency: 2 },
    async (t) => {
      let expectedSource;
      for (const scenario of scenarios) {
        let options = { scenario };
        if (scenario === 'retired-forecast') {
          const preparation = await startFixture(t, options);
          const stop = await preparation.fixture.run(['stop']);
          assert.equal(stop.status, 0, stop.stderr);
          assert.match(stop.stdout, /Stopped #4242/);
          assert.equal(preparation.fixture.readState().runtime.binding, null);
          assert.equal(
            preparation.fixture.readLedger().filter((e) => e.outcome === 'refused').length,
            0
          );
          options = {
            scenario,
            seed: preparation.fixture.readState().provider,
            sourceBundle: preparation.fixture.exportSourceBundle(),
          };
        }
        const baseline = await startFixture(t, options);
        expectedSource ??= baseline.fixture.sourceIdentity.files;
        assert.deepEqual(
          baseline.fixture.sourceIdentity.files,
          expectedSource,
          'matrix source bytes must remain stable'
        );
        const boundary = baseline.fixture.readLedger().length;
        const success = await baseline.fixture.run(inflation);
        assert.equal(success.status, 0, success.stderr);
        const physical = baseline.fixture
          .readLedger()
          .slice(boundary)
          .filter((e) => e.applied);
        const counts = new Map(),
          points = [];
        for (const entry of physical) {
          const checkpoint = entry.metadataCheckpoint ?? entry.checkpoint;
          assert.ok(
            [
              'audit',
              'size',
              'estimate',
              'fields',
              'metadata-initial',
              'metadata-context',
              'metadata-confirm',
              'metadata-terminal',
            ].includes(checkpoint),
            checkpoint
          );
          const occurrence = (counts.get(checkpoint) ?? 0) + 1;
          counts.set(checkpoint, occurrence);
          points.push({ checkpoint, occurrence });
        }
        t.diagnostic(
          `${scenario} physical baseline: ${JSON.stringify(Object.fromEntries(counts))}`
        );
        for (const family of [
          'metadata-initial',
          'metadata-context',
          'metadata-confirm',
          'metadata-terminal',
        ])
          assert.ok(counts.get(family), family);
        await baseline.fixture.close();
        const selected =
          mode === 'all'
            ? points
            : points.filter((point) =>
                scenario === 'plain'
                  ? ['metadata-initial', 'audit'].includes(point.checkpoint)
                  : point.checkpoint === 'estimate' ||
                    (point.checkpoint === 'metadata-confirm' &&
                      point.occurrence === counts.get('metadata-confirm'))
              );
        const cases = selected.flatMap((point) => phases.map((phase) => ({ ...point, phase })));
        await Promise.all(
          cases.map(({ checkpoint, occurrence, phase }) =>
            t.test(`${scenario} ${checkpoint}:${occurrence} ${phase}`, async (sub) => {
              const { fixture } = await startFixture(sub, options);
              assert.deepEqual(
                fixture.sourceIdentity.files,
                expectedSource,
                'matrix source bytes must remain stable'
              );
              const invocationBoundary = fixture.readLedger().length;
              fixture.fault({ checkpoint, occurrence, phase, action: 'transport-failure' });
              const first = await fixture.run(inflation);
              assert.equal(first.status, 1, first.stderr);
              assert.match(first.stderr, /injected-transport-failure/);
              const interrupted = fixture.readState().provider,
                currentPublication = readDecompositionRecords(interrupted.body).publication,
                prior =
                  currentPublication?.writerId === 'inflate-estimate' ? currentPublication : null;
              if (!prior)
                assert.equal(
                  fixture
                    .readLedger()
                    .slice(invocationBoundary)
                    .filter(
                      (e) =>
                        e.applied && ['audit', 'size', 'estimate', 'fields'].includes(e.checkpoint)
                    ).length,
                  0
                );
              const inspection = await fixture.run(['decompose-check', '4242', '--json']);
              assert.ok([0, 3].includes(inspection.status), inspection.stderr);
              const current = JSON.parse(inspection.stdout);
              if (scenario === 'active-forecast') {
                const projected = current.sourceObservations.readForecast.value;
                const fieldsConfirmed = prior?.effects
                  .filter((e) => ['estimate', 'fields'].includes(e.id))
                  .every((e) => e.status === 'confirmed');
                const initialFields =
                  current.sourceObservations.readProject.value.estimate === 4 &&
                  projected.observedProjections[1].estimate === 4;
                assert.equal(
                  projected.proposals.length,
                  initialFields || fieldsConfirmed ? 0 : 1,
                  JSON.stringify({ checkpoint, occurrence, phase, projected })
                );
              }
              const retry = await fixture.run(inflation);
              assert.equal(retry.status, 0, retry.stderr);
              const final = readDecompositionRecords(fixture.readState().provider.body);
              assert.equal(final.publication.status, 'complete');
              assert.equal(final.assessment.inputDigest, final.publication.intendedInputDigest);
              if (prior)
                for (const key of [
                  'operationId',
                  'createdAt',
                  'intendedInputDigest',
                  'beforeInputDigest',
                ])
                  assert.equal(final.publication[key], prior[key], key);
              if (prior)
                assert.equal(
                  final.publication.effects.find((e) => e.id === 'audit').intendedDigest,
                  prior.effects.find((e) => e.id === 'audit').intendedDigest
                );
              const writes = fixture
                .readLedger()
                .slice(invocationBoundary)
                .filter((e) => e.applied);
              for (const effect of ['audit', 'size', 'estimate', 'fields'])
                assert.ok(writes.filter((e) => e.checkpoint === effect).length <= 1, effect);
              assert.equal(
                fixture.readState().provider.comments[0].body.match(/Publication operation:/g)
                  ?.length,
                1
              );
              const after = fixture.readLedger().length;
              const repeat = await fixture.run(inflation);
              assert.equal(repeat.status, 0, repeat.stderr);
              assert.equal(
                fixture
                  .readLedger()
                  .slice(after)
                  .filter((e) => e.applied).length,
                0
              );
              assert.equal(
                fixture.readLedger().filter((e) => e.outcome === 'refused' && !e.fault).length,
                0
              );
              sub.diagnostic(
                `applied writes ${JSON.stringify(writes.reduce((n, e) => ((n[e.metadataCheckpoint ?? e.checkpoint] = (n[e.metadataCheckpoint ?? e.checkpoint] ?? 0) + 1), n), {}))}`
              );
            })
          )
        );
      }
    }
  );
}
