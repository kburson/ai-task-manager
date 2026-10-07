// @story #1853
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeLegacyRevisionFixture } from '../../../../fixtures/criteria-revision.mjs';
const records = await import('../../../../../task-tracker/lib/criteria-revision/records.mjs').catch(
  (e) => {
    if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw e;
  }
);
const api = await import('../../../../../task-tracker/lib/criteria-revision/reducer.mjs').catch(
  (e) => {
    if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw e;
  }
);
function prepared() {
  assert.equal(typeof records.createRevisionEvent, 'function');
  return records.createRevisionEvent({
    request: makeLegacyRevisionFixture().request,
    predecessorEventId: null,
  });
}
function terminal(p, type = 'applied') {
  return records.createTerminalEvent({ events: [p], type });
}
test('empty, prepared, applied and aborted are distinct verified states', () => {
  assert.equal(typeof api.reduceRevisionEvents, 'function');
  assert.equal(api.reduceRevisionEvents([]).status, 'empty');
  const p = prepared();
  assert.equal(api.reduceRevisionEvents([p]).status, 'pending');
  assert.equal(api.reduceRevisionEvents([p, terminal(p)]).status, 'applied');
  // Aborted requires an explicit approved abort operation, never an automatic transport cleanup.
  assert.throws(() => api.reduceRevisionEvents([p, terminal(p, 'aborted')]), /abort/);
});
test('full chain refuses duplicate IDs, differing bytes, forks and missing predecessors', () => {
  const p = prepared(),
    end = terminal(p);
  for (const events of [
    [p, p],
    [p, { ...p, proposalDigest: 'sha256:' + 'b'.repeat(64) }],
    [end],
    [p, { ...end, predecessorEventId: 'missing' }],
    [p, end, { ...end, eventId: 'fork' }],
  ])
    assert.throws(() => api.reduceRevisionEvents(events));
});
test('proposal operation reuse and wrong terminal root/digest/executor refuse', () => {
  const p = prepared(),
    end = terminal(p);
  for (const patch of [
    { rootEventId: 'wrong' },
    { operationId: 'wrong' },
    { proposalDigest: 'sha256:' + 'c'.repeat(64) },
    { executor: { ...p.executor, sessionId: 'other' } },
  ])
    assert.throws(() => api.reduceRevisionEvents([p, { ...end, ...patch }]));
  assert.throws(() =>
    api.reduceRevisionEvents([p, { ...p, eventId: 'second', predecessorEventId: p.eventId }])
  );
});
test('a new transaction cannot start while pending or after an unrelated terminal predecessor', () => {
  const p = prepared();
  assert.throws(() =>
    api.reduceRevisionEvents([
      p,
      {
        ...p,
        transactionId: 'tx-2',
        operationId: 'op-2',
        eventId: 'next',
        predecessorEventId: p.eventId,
      },
    ])
  );
});


// @story #1855
test('retirement selector preserves pending and applied proposal data without replacing the full chain', () => {
  const p = prepared();
  assert.deepEqual(api.selectEffectiveRevisionProposalEvents([]), []);
  assert.deepEqual(api.selectEffectiveRevisionProposalEvents([p]), [p]);
  const applied = terminal(p);
  assert.deepEqual(api.selectEffectiveRevisionProposalEvents([p, applied]), [p]);
  assert.equal(api.deriveCriteriaAuthorityHistory([p, applied]).chain.head, applied.eventId);
  assert.deepEqual(api.deriveCriteriaAuthorityHistory([p, applied]).chain.events, [p, applied]);
});
test('retirement selector never treats malformed or asserted abort status as an untouched terminal', () => {
  const p = prepared(), end = terminal(p);
  for (const events of [null, [p, p], [end], [p, { ...end, type: 'aborted' }],
    [p, { ...end, observedResourceVector: p.proposal.archive.resourceVector }]]) {
    assert.throws(() => api.selectEffectiveRevisionProposalEvents(events));
  }
});
