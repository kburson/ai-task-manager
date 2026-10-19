// @story #2031
import test from 'node:test';
import assert from 'node:assert/strict';
import { cancellationHarness } from './decomposition-cancellation-publication.cases.mjs';
import { publishFieldEstimateRevision } from '../../../../task-tracker/lib/decomposition-field-writer.mjs';
import { readDecompositionRecords } from '../../../../task-tracker/lib/decomposition-records.mjs';
import { runCancelPlan } from '../../../../task-tracker/verbs/cancel-plan.mjs';

test('native Plan cancellation reconciles an interrupted predecessor before restoring refinement', async () => {
  const f = cancellationHarness();
  const push = f.args.deps.decomposition.pushBody;
  let once = true;
  f.args.deps.decomposition.pushBody = async (...args) => {
    await push(...args);
    if (once && readDecompositionRecords(args[2]).publication?.writerId === 'project-tether') {
      once = false;
      throw new Error('lost intent write outcome');
    }
  };
  const first = await publishFieldEstimateRevision({
    cfg: f.args.cfg,
    issueNumber: 1987,
    writerId: 'project-tether',
    key: { estimate: 23 },
    estimate: 23,
    size: 'M',
    deps: f.args.deps,
    writeField: ({ field, value, context, effectId }) =>
      f.args.deps.restoreBoardFields({ fields: { ...f.board, [field]: value }, context, effectId }),
  });
  assert.notEqual(first.status, 'recorded');
  const predecessor = readDecompositionRecords(f.body).publication;
  assert.equal(predecessor.status, 'pending');
  const recovered = await runCancelPlan(f.args);
  assert.equal(recovered.status, 'cancelled', recovered.reason);
  const publication = readDecompositionRecords(f.body).publication;
  assert.equal(publication.status, 'complete');
  assert.equal(publication.supersedes.operationId, predecessor.operationId);
});
