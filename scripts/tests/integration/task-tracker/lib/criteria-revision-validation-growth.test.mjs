// @story #1853
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeLegacyRevisionFixture } from '../../../fixtures/criteria-revision.mjs';
import * as engine from '../../../../task-tracker/lib/criteria-revision/engine.mjs';
import * as store from '../../../../task-tracker/lib/criteria-revision/store.mjs';
import { renderApprovalStatement } from '../../../../task-tracker/lib/criteria-revision/proposal.mjs';
import { hashBytes } from '../../../../task-tracker/lib/criteria-revision/schema.mjs';
function fixture() {
  const f = makeLegacyRevisionFixture();
  return {
    ...f,
    context: {
      repository: f.observation.repository,
      issue: f.observation.issue,
      executor: f.observation.executor,
    },
    deps: store.createRevisionMemory({
      observation: f.observation,
      comments: [],
      hostMessages: [f.rawUserMessage],
    }),
  };
}
function approve(f, proposal, messageId) {
  const statement = renderApprovalStatement(proposal);
  f.deps.addHostMessage({
    ...f.rawUserMessage,
    id: messageId,
    content: [{ type: 'input_text', text: statement }],
  });
  return {
    schema: 'aitm.criteria-revision/v1',
    action: 'apply',
    proposal,
    authorizationSource: {
      ...f.authorizationSource,
      messageId,
      statementHash: hashBytes(statement),
    },
  };
}
test('successive real revisions bound semantic validation work and isolate each fresh observation', async () => {
  const { Session } = await import('node:inspector/promises');
  const profiler = new Session();
  profiler.connect();
  await profiler.post('Profiler.enable');
  await profiler.post('Profiler.startPreciseCoverage', { callCount: true, detailed: false });
  const f = fixture(),
    counts = [],
    graphCounts = [];
  try {
    for (let n = 1; n <= 3; n++) {
      let request = f.request;
      if (n > 1) {
        const old = f.deps.observation.body.bytes
          .split('\n')
          .find((x) =>
            x.startsWith(
              '- [ ] ' + (n === 2 ? 'Supported model hooks' : 'Growth criterion ' + (n - 1))
            )
          );
        const edits = {
          acceptanceCriteria: [
            {
              operation: 'replace',
              occurrence: 1,
              oldBytes: old,
              oldHash: hashBytes(old),
              replacements: [
                { text: 'Growth criterion ' + n, declaration: { kind: 'vc-list', vcIds: ['1'] } },
              ],
            },
          ],
          verificationCommands: [],
        };
        const prepared = await engine.prepareRevision({
          context: f.context,
          input: {
            mode: 'revision',
            transactionId: 'growth-tx-' + n,
            operationId: 'growth-op-' + n,
            reason: 'Bounded validation work',
            edits,
          },
          deps: f.deps,
        });
        assert.equal(prepared.status, 'prepared', JSON.stringify(prepared));
        request = approve(f, prepared.proposal, 'growth-message-' + n);
      }
      assert.equal(
        (await engine.applyRevision({ context: f.context, request, deps: f.deps })).status,
        'applied'
      );
      const coverage = await profiler.post('Profiler.takePreciseCoverage');
      const source = coverage.result.find((x) => x.url.endsWith('/criteria-revision/schema.mjs'));
      counts.push(
        source.functions.find((x) => x.functionName === 'validateRevisionRequest').ranges[0].count
      );
      assert.equal(
        (await store.readRevisionChain({ context: f.context, transport: f.deps })).status,
        'applied'
      );
      const graphCoverage = await profiler.post('Profiler.takePreciseCoverage');
      const graph = graphCoverage.result.find((x) =>
        x.url.endsWith('/criteria-revision/schema.mjs')
      );
      graphCounts.push(
        graph.functions.find((x) => x.functionName === 'validateRevisionRequest').ranges[0].count
      );
    }
    console.log('successive semantic request validations', JSON.stringify(counts));
    console.log('fresh collector semantic validations', JSON.stringify(graphCounts));
    // Revisions 2 and 3 both prepare then apply. Each fresh collector validates
    // each proposal once, irrespective of its number of archived predecessors.
    assert.deepEqual(graphCounts, [1, 2, 3]);
    assert.ok(counts[2] <= counts[1] * 2, JSON.stringify(counts));
    const first = await engine.observeRevision({ context: f.context, deps: f.deps });
    assert.equal(first.status, 'applied');
    first.chain.events[0].authorizer.principal = 'caller changed returned value';
    assert.equal(
      (await engine.observeRevision({ context: f.context, deps: f.deps })).status,
      'applied'
    );
    const o = f.deps.observation;
    o.protectedSourceBindings[0].hash = hashBytes('changed actual source');
    f.deps.replaceAuthority(o);
    assert.equal(
      (await engine.observeRevision({ context: f.context, deps: f.deps })).status,
      'authority-drift'
    );
    const comments = f.deps.comments;
    comments[0].body = comments[0].body.replace('Old model hooks', 'tampered model hooks');
    const corrupt = store.createRevisionMemory({
      observation: f.deps.observation,
      comments,
      hostMessages: [],
    });
    assert.equal(
      (await engine.observeRevision({ context: f.context, deps: corrupt })).status,
      'indeterminate'
    );
  } finally {
    await profiler.post('Profiler.stopPreciseCoverage');
    profiler.disconnect();
  }
});
