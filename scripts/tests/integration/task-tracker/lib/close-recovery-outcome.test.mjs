// @story #2096
import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  readDeliveredCloseTransactions,
  TERMINAL_CLOSE_STEPS,
} from '../../../../task-tracker/lib/close-convergence.mjs';

if (!process.env.AITM_2096_CLOSE_CHILD) {
  test('real recovery Close/outcome ordering and checkpoint matrix in an isolated authority fixture', () => {
    const childEnv = { ...process.env, AITM_2096_CLOSE_CHILD: '1' };
    delete childEnv.NODE_TEST_CONTEXT;
    const child = spawnSync(
      process.execPath,
      ['--experimental-test-module-mocks', '--test', fileURLToPath(import.meta.url)],
      { encoding: 'utf8', timeout: 30_000, env: childEnv }
    );
    assert.equal(child.status, 0, child.stdout + child.stderr);
    assert.match(child.stdout, /recovery Close supersedes.*depth 2/);
    assert.match(child.stdout, /tests [1-9][0-9]*/);
  });
} else {
  // Remote lifecycle qualification is a boundary fixture, not acceptance evidence.
  // Keep the real Close saga, canonical timing validator and outcome writer.
  const evaluator = await import('../../../../task-tracker/lib/action-decision/evaluate.mjs');
  await mock.module(
    new URL('../../../../task-tracker/lib/action-decision/evaluate.mjs', import.meta.url).href,
    {
      namedExports: {
        ...evaluator,
        evaluateCompleteGuards: async () => ({
          guardResult: { status: 'ready', ok: true, refusals: [], warns: [] },
        }),
      },
    }
  );
  const { fixture, NEXT_SHA } = await import('../../../helpers/2096-close-recovery-outcome.mjs');

  for (const depth of [0, 1, 2]) {
    test(`recovery Close supersedes the old Unknown outcome and completes all eight steps (depth ${depth})`, async () => {
      const f = await fixture({ depth });
      const run = await f.invoke();
      assert.equal(run.exitCode, 0);
      assert.deepEqual(readDeliveredCloseTransactions(run.body)[0].completedSteps, [
        ...TERMINAL_CLOSE_STEPS,
      ]);
      assert.equal(run.calls.issueCloses, 1);
      assert.equal(run.calls.bindingReleases, 1);
      assert.equal(f.records.length, 2);
      assert.deepEqual(f.records[0], f.original);
      assert.equal(f.records[1].envelope.supersedes, f.original.envelope.recordId);
      assert.equal(f.records[1].envelope.payload.telemetry.verificationSha, f.active.acceptedSha);
      assert.equal(f.records[1].envelope.payload.actual.engagedHours, null);
    });
  }

  test('same-source ordinary retry resumes every durable checkpoint without repeating completed terminal work', async () => {
    const f = await fixture();
    const completed = await f.invoke();
    assert.equal(completed.exitCode, 0);
    const checkpoints = [...f.checkpoints];
    for (const checkpoint of checkpoints) {
      f.restoreRecords(checkpoint.records);
      const run = await f.invoke({ prefixBody: checkpoint.body });
      assert.equal(run.exitCode, 0, `prefix ${checkpoint.steps}`);
      assert.deepEqual(readDeliveredCloseTransactions(run.body)[0].completedSteps, [
        ...TERMINAL_CLOSE_STEPS,
      ]);
      assert.equal(run.calls.logIssueTime, checkpoint.steps.includes('timing') ? 0 : 1);
      assert.equal(run.calls.issueCloses, checkpoint.steps.includes('issue') ? 0 : 1);
      assert.equal(run.calls.bindingReleases, checkpoint.steps.includes('binding') ? 0 : 1);
      assert.equal(f.records.length, 2);
    }
  });

  test('a further corrective source restarts a multi-hop recovery and closes without discarding its history', async () => {
    const f = await fixture({ depth: 1 });
    const run = await f.invoke({ restart: true, acceptedSha: NEXT_SHA });
    assert.equal(run.exitCode, 0);
    assert.equal(run.calls.supersessionCommentCreates, 1);
    assert.deepEqual(readDeliveredCloseTransactions(run.body)[0].completedSteps, [
      ...TERMINAL_CLOSE_STEPS,
    ]);
    assert.equal(f.records.length, 2);
    assert.deepEqual(f.records[0], f.original);
  });

  for (const corrupt of ['missing', 'duplicate', 'stale-timing', 'foreign-binding']) {
    test(`recovery refuses ${corrupt} at its owning boundary`, async () => {
      const f = await fixture();
      const evidence =
        corrupt === 'missing'
          ? f.comments.slice(1)
          : corrupt === 'duplicate'
            ? [...f.comments, f.comments.at(-1)]
            : f.comments;
      let run;
      let error;
      try {
        run = await f.invoke({
          evidence,
          staleTiming: corrupt === 'stale-timing',
          ...(corrupt === 'foreign-binding'
            ? { ownership: { authorized: false, disposition: 'foreign-claim' } }
            : {}),
        });
      } catch (caught) {
        error = caught;
      }
      assert.ok(error || run.exitCode !== 0);
      if (run) {
        if (corrupt === 'foreign-binding') assert.equal(run.calls.bindingReleases, 0);
        else assert.equal(run.calls.issueCloses, 0);
      }
      if (corrupt !== 'foreign-binding') assert.deepEqual(f.records, [f.original]);
    });
  }

  test('canonical but broken, cyclic or non-human recovery links never authorize outcomes', async () => {
    const { ensureDeliveredCloseSupersession } =
      await import('../../../../task-tracker/lib/delivered-close-supersession.mjs');
    for (const variant of ['wrong-source', 'non-human', 'cycle', 'fork']) {
      const f = await fixture({ depth: 1 });
      const entries = [];
      const isCycle = variant === 'cycle';
      await ensureDeliveredCloseSupersession({
        authorization: {
          repository: 'owner/repo',
          issueNumber: 2096,
          oldTransaction: {
            schema: 'aitm.delivered-close/v1',
            issueNumber: 2096,
            transactionId: isCycle ? f.active.transactionId : f.root.replacementTransactionId,
            acceptedSha: isCycle
              ? f.active.acceptedSha
              : variant === 'wrong-source'
                ? 'f'.repeat(40)
                : f.root.newAcceptedSha,
            reviewAuthority: 'human-gate',
            completedSteps: [],
          },
          newAcceptedSha: isCycle
            ? f.root.newAcceptedSha
            : variant === 'fork'
              ? 'f'.repeat(40)
              : f.active.acceptedSha,
          newReviewAuthority: variant === 'non-human' ? 'gate-bypassed' : 'human-gate',
          reason: 'accepted-sha-corrective-amend',
        },
        deps: {
          randomUUIDFn: () =>
            isCycle
              ? f.root.replacementTransactionId
              : variant === 'fork'
                ? 'fork'
                : f.active.transactionId,
          listComments: async () => [],
          createComment: async (body) => {
            const entry = {
              id: 100,
              body,
              user: { login: 'owner' },
              created_at: '2026-10-01T00:02:00.000Z',
              updated_at: '2026-10-01T00:02:00.000Z',
              issue_url: 'https://api.github.com/repos/owner/repo/issues/2096',
            };
            entries.push(entry);
            return entry;
          },
          readComment: async () => entries[0],
        },
      });
      const evidence =
        variant === 'cycle'
          ? [...f.comments.slice(1), ...entries]
          : variant === 'fork'
            ? [...f.comments, ...entries]
            : [f.comments[0], ...entries];
      let run;
      let error;
      try {
        run = await f.invoke({ evidence });
      } catch (caught) {
        error = caught;
      }
      assert.ok(error || run.exitCode !== 0, variant);
      if (run) assert.equal(run.calls.issueCloses, 0, variant);
      assert.deepEqual(f.records, [f.original], variant);
    }
  });
  test('explicit same-source retry reuses a multi-hop supersession without minting another transaction', async () => {
    const f = await fixture();
    const run = await f.invoke({ restart: true });
    assert.equal(run.exitCode, 0);
    assert.equal(run.calls.supersessionCommentCreates, 0);
    assert.equal(readDeliveredCloseTransactions(run.body)[0].transactionId, f.active.transactionId);
    assert.deepEqual(readDeliveredCloseTransactions(run.body)[0].completedSteps, [
      ...TERMINAL_CLOSE_STEPS,
    ]);
    assert.equal(f.records.length, 2);
  });
  test('explicit incomplete timing restores correction authority even with stale numeric fields', async () => {
    const f = await fixture();
    const run = await f.invoke({ staleNumeric: true });
    assert.equal(run.exitCode, 0);
    assert.deepEqual(readDeliveredCloseTransactions(run.body)[0].completedSteps, [
      ...TERMINAL_CLOSE_STEPS,
    ]);
    assert.equal(f.records.length, 2);
    assert.equal(f.records[1].envelope.payload.actual.engagedHours, null);
  });
}
