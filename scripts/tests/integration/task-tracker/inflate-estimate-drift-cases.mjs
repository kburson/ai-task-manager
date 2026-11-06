// @story #2163 — provider deltas remain separate from command-applied writes.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readDecompositionRecords } from '../../../task-tracker/lib/decomposition-records.mjs';
import { estimateEffectDigest } from '../../../task-tracker/lib/decomposition-publication.mjs';
import { readEstimateBeforeRecord } from '../../../task-tracker/lib/estimate-writer-publication.mjs';
import {
  parseIssueFieldDb,
  stripIssueFieldDb,
  formatIssueFieldDb,
} from '../../../task-tracker/issue-field-db.mjs';
import { createInflationPublicEntryFixture } from '../../fixtures/inflation-public-entry-fixture.mjs';

export function registerInflationDriftCases({ root, source, startFixture, inflation }) {
  const base = JSON.parse(
    readFileSync(
      path.join(root, 'docs/peer-reviews/2163/public-entry-red/original-927c53d/initialState.json'),
      'utf8'
    )
  );
  const other = {
    ...base.comments[0],
    id: 202,
    node_id: 'IC_fixture_other',
    body: '### 🔁 Plan re-estimate\n\n**HUMAN ATTENTION** — not auto-applied\n\n| Field | Before | After |\n|---|---|---|\n| Size | S | S |\n| Estimate (h) | 2 | 2 |\n',
  };
  const cases = ['plain', 'active-forecast'].flatMap((scenario) =>
    ['append-other-comment-byte', 'remove-other-proposal', 'insert-other-proposal'].map(
      (action) => ({ scenario, action, checkpoint: 'audit' })
    )
  );
  cases.push(
    ...['append-scope-line', 'change-plan-pin', 'board-estimate-drift'].map((action) => ({
      scenario: 'plain',
      action,
      checkpoint: 'audit',
    })),
    { scenario: 'unpinned-plan', action: 'change-plan-bytes', checkpoint: 'audit' },
    ...['alter-audit', 'truncate-audit', 'duplicate-audit'].map((action) => ({
      scenario: 'plain',
      action,
      checkpoint: 'estimate',
    }))
  );
  test(
    'registered pending source and effect drift refuses before any next write',
    { concurrency: 2 },
    async (t) => {
      await Promise.all(
        cases.map(({ scenario, action, checkpoint }) =>
          t.test(`${scenario} ${action}`, async (sub) => {
            const { fixture } = await startFixture(sub, {
              scenario,
              seed: { comments: [...base.comments, other] },
            });
            fixture.fault({
              checkpoint,
              occurrence: 1,
              phase: 'before-apply',
              action: 'transport-failure',
            });
            const first = await fixture.run(inflation);
            assert.equal(first.status, 1, first.stderr);
            assert.match(first.stderr, /injected-transport-failure/);
            const prior = readDecompositionRecords(fixture.readState().provider.body).publication;
            const boundary = fixture.readLedger().length;
            fixture.fault({
              checkpoint: 'before-invocation',
              occurrence: 1,
              phase: 'before-apply',
              action,
            });
            const retry = await fixture.run(inflation);
            assert.equal(retry.status, 1, retry.stderr);
            assert.match(
              retry.stderr,
              action === 'truncate-audit'
                ? /estimate-publication:before-manifest-drift/
                : /inflate-estimate:(pending-source-drift|audit-provenance)|estimate-publication:effect-drift/
            );
            const ledger = fixture.readLedger().slice(boundary),
              delta = ledger.find((e) => e.externalMutation);
            assert.ok(delta);
            assert.equal(ledger.filter((e) => e.applied).length, 0);
            assert.deepEqual(
              readDecompositionRecords(fixture.readState().provider.body).publication,
              prior
            );
          })
        )
      );
    }
  );
  test(
    'every sealed partial field combination can converge through registered retry',
    { concurrency: 2 },
    async (t) => {
      await Promise.all(
        Array.from({ length: 8 }, (_, n) =>
          t.test(`combination ${n}`, async (sub) => {
            const { fixture } = await startFixture(sub);
            fixture.fault({
              checkpoint: 'audit',
              occurrence: 1,
              phase: 'before-apply',
              action: 'transport-failure',
            });
            assert.equal((await fixture.run(inflation)).status, 1);
            const before = readDecompositionRecords(fixture.readState().provider.body).publication;
            fixture.fault({
              checkpoint: 'before-invocation',
              occurrence: 1,
              phase: 'before-apply',
              action: `apply-field-combination-${n}`,
            });
            const result = await fixture.run(inflation);
            assert.equal(result.status, 0, result.stderr);
            const records = readDecompositionRecords(fixture.readState().provider.body);
            assert.equal(records.publication.intendedInputDigest, before.intendedInputDigest);
            assert.equal(records.assessment.inputDigest, before.intendedInputDigest);
            for (const effect of ['audit', 'size', 'estimate', 'fields'])
              assert.ok(
                fixture.readLedger().filter((e) => e.applied && e.checkpoint === effect).length <=
                  1,
                effect
              );
          })
        )
      );
    }
  );
  test(
    'registered nullable audit baselines survive intended field convergence',
    { concurrency: 2 },
    async (t) => {
      await Promise.all(
        ['size', 'estimate'].flatMap((missing) =>
          ['null', 'omitted'].map((representation) =>
            t.test(`${missing} ${representation}`, async (sub) => {
              const values = { ...parseIssueFieldDb(base.body).values };
              if (representation === 'null') values[missing] = null;
              else delete values[missing];
              const { fixture } = await startFixture(sub, {
                scenario: 'unpinned-plan',
                seed: {
                  board: { ...base.board, [missing]: null },
                  body: `${stripIssueFieldDb(base.body)}\n${formatIssueFieldDb(values)}\n`,
                  comments: [
                    {
                      ...base.comments[0],
                      ...(missing === 'size'
                        ? { body: '<!-- aitm-refined-estimate: 4242 -->\n### Refine estimate\n' }
                        : {}),
                    },
                  ],
                },
              });
              fixture.fault({
                checkpoint: 'audit',
                occurrence: 1,
                phase: 'before-apply',
                action: 'transport-failure',
              });
              const first = await fixture.run(inflation);
              assert.equal(first.status, 1, first.stderr);
              assert.match(
                first.stderr,
                /injected-transport-failure/,
                'must reach the admitted audit write'
              );
              const prior = readDecompositionRecords(fixture.readState().provider.body).publication;
              assert.equal(prior.writerId, 'inflate-estimate');
              assert.equal(prior.status, 'pending');
              const beforeRecord = readEstimateBeforeRecord(fixture.readState().provider.body);
              const sealed = prior.effects.find((effect) => effect.id === 'audit').intendedDigest;
              fixture.fault({
                checkpoint: 'before-invocation',
                occurrence: 1,
                phase: 'before-apply',
                action: 'apply-field-combination-7',
              });
              const retry = await fixture.run(inflation);
              assert.equal(retry.status, 0, retry.stderr);
              const state = fixture.readState().provider;
              const records = readDecompositionRecords(state.body);
              assert.deepEqual(readEstimateBeforeRecord(state.body), beforeRecord);
              assert.equal(records.publication.status, 'complete');
              for (const key of [
                'operationId',
                'createdAt',
                'beforeInputDigest',
                'intendedInputDigest',
              ])
                assert.equal(records.publication[key], prior[key], key);
              assert.equal(records.assessment.inputDigest, prior.intendedInputDigest);
              assert.equal(
                records.publication.effects.find((effect) => effect.id === 'audit').intendedDigest,
                sealed
              );
              assert.equal(
                estimateEffectDigest(state.comments.find((comment) => comment.id === 101).body),
                sealed
              );
              assert.equal(state.board.size, 'M');
              assert.equal(state.board.estimate, 6);
              for (const effect of ['audit', 'size', 'estimate', 'fields']) {
                const writes = fixture
                  .readLedger()
                  .filter((entry) => entry.applied && entry.checkpoint === effect).length;
                assert.ok(writes <= 1, effect);
                if (effect === 'audit') assert.equal(writes, 1);
              }
              const boundary = fixture.readLedger().length;
              const repeat = await fixture.run(inflation);
              assert.equal(repeat.status, 0, repeat.stderr);
              assert.equal(
                fixture
                  .readLedger()
                  .slice(boundary)
                  .filter((entry) => entry.applied).length,
                0
              );
              assert.deepEqual(
                fixture.readLedger().filter((entry) => entry.outcome === 'refused' && !entry.fault),
                []
              );
            })
          )
        )
      );
    }
  );
  test('actual inventoried alternative policy source refuses sealed retry after Stop and relocation', async (t) => {
    const { fixture: original } = await startFixture(t);
    original.fault({
      checkpoint: 'audit',
      occurrence: 1,
      phase: 'before-apply',
      action: 'transport-failure',
    });
    const first = await original.run(inflation);
    assert.equal(first.status, 1, first.stderr);
    const prior = readDecompositionRecords(original.readState().provider.body).publication;
    const stop = await original.run(['stop']);
    assert.equal(stop.status, 0, stop.stderr);
    assert.match(stop.stdout, /Stopped #4242/);
    const alternative = await createInflationPublicEntryFixture({
      source,
      seed: original.readState().provider,
      sourceBundle: original.exportSourceBundle(),
      policyVariant: true,
    });
    t.after(() => alternative.close());
    const policy = 'scripts/task-tracker/lib/decomposition-policy.mjs';
    assert.notEqual(
      original.sourceIdentity.files.find((f) => f.path === policy).sha256,
      alternative.sourceIdentity.files.find((f) => f.path === policy).sha256
    );
    assert.equal(alternative.sourceIdentity.sourceVariant, 'actual-alternative-classifier-2163');
    const start = await alternative.run([
      'start',
      '4242',
      '--role',
      'agent',
      '--confirm-relocation',
    ]);
    assert.equal(start.status, 0, start.stderr);
    assert.equal(alternative.readState().runtime.binding.worktreePath, start.cwd);
    const boundary = alternative.readLedger().length;
    const retry = await alternative.run(inflation);
    assert.equal(retry.status, 1, retry.stderr);
    assert.match(retry.stderr, /inflate-estimate:pending-source-drift:intent/);
    assert.equal(
      alternative
        .readLedger()
        .slice(boundary)
        .filter((e) => e.applied).length,
      0
    );
    assert.deepEqual(
      readDecompositionRecords(alternative.readState().provider.body).publication,
      prior
    );
  });
}
