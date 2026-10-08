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
  const p = prepared(),
    end = terminal(p);
  for (const events of [
    null,
    [p, p],
    [end],
    [p, { ...end, type: 'aborted' }],
    [p, { ...end, observedResourceVector: p.proposal.archive.resourceVector }],
  ]) {
    assert.throws(() => api.selectEffectiveRevisionProposalEvents(events));
  }
});

// @story #1855
test('authority history does not repeat the complete verified terminal prefix', () => {
  const p = prepared();
  const events = [p, terminal(p)];
  const original = Object.getOwnPropertyDescriptor;
  function measured(read) {
    let calls = 0;
    Object.getOwnPropertyDescriptor = function (value, key) {
      const descriptor = original(value, key);
      if (value === p && key === 'eventId') calls++;
      return descriptor;
    };
    try {
      return { value: read(events), calls };
    } finally {
      Object.getOwnPropertyDescriptor = original;
    }
  }
  const reduced = measured(api.reduceRevisionEvents);
  const history = measured(api.deriveCriteriaAuthorityHistory);
  assert.equal(Object.getOwnPropertyDescriptor, original);
  assert.ok(reduced.calls > 0);
  assert.deepEqual(history.value.chain, reduced.value);
  assert.equal(history.value.chain.events[0], p);
  assert.equal(
    history.calls,
    reduced.calls,
    'a terminal must not trigger another full prefix validation'
  );
});

import {
  deriveProposal,
  renderApprovalStatement,
} from '../../../../../task-tracker/lib/criteria-revision/proposal.mjs';
import { canonicalRecordJson } from '../../../../../task-tracker/lib/github-records/canonical-json.mjs';
import { hashBytes } from '../../../../../task-tracker/lib/criteria-revision/schema.mjs';

// Independent original prefix classifier retained for algorithm parity.
function originalPrefixHistory(events) {
  const chain = api.reduceRevisionEvents(events),
    terminals = [];
  let authorityEventId = null;
  for (let index = 0; index < chain.events.length; index++) {
    const terminal = chain.events[index];
    if (!['applied', 'aborted'].includes(terminal.type)) continue;
    const prefix = api.reduceRevisionEvents(chain.events.slice(0, index + 1));
    if (terminal.type === 'applied') authorityEventId = terminal.eventId;
    else {
      const root = prefix.root.proposal.archive.resourceVector;
      const abort = prefix.effective;
      if (
        abort.proposal.mode !== 'abort' ||
        canonicalRecordJson(abort.proposal.archive.resourceVector) !==
          canonicalRecordJson({ ...root, revisionEventHead: abort.predecessorEventId }) ||
        canonicalRecordJson(terminal.observedResourceVector) !==
          canonicalRecordJson({ ...root, revisionEventHead: terminal.predecessorEventId })
      ) {
        throw new TypeError('criteria-revision:abort-criteria-authority');
      }
    }
    terminals.push({ head: terminal.eventId, status: terminal.type, authorityEventId });
  }
  return { chain, terminals };
}
function historicalEvents() {
  const f = makeLegacyRevisionFixture(),
    events = [];
  function append(mode, transactionId, operationId, root) {
    const observation = structuredClone(f.observation);
    observation.revisionRecords.records = events.map(records.revisionRecord);
    const proposal = deriveProposal({
      ...f.context,
      observation,
      mode,
      transactionId,
      operationId,
      priorTransaction:
        mode === 'revision' ? null : { transactionId, eventId: events.at(-1).eventId },
      edits: mode === 'revision' ? f.edits : { acceptanceCriteria: [], verificationCommands: [] },
    });
    const request = {
      ...f.request,
      action: mode === 'revision' ? 'apply' : 'recover',
      proposal,
      authorizationSource: {
        ...f.authorizationSource,
        messageId: operationId,
        statementHash: hashBytes(renderApprovalStatement(proposal)),
      },
    };
    const event = records.createRevisionEvent({
      request,
      predecessorEventId: events.at(-1)?.eventId ?? null,
      ...(root ? { rootEventId: root.eventId, rootProposalDigest: root.proposalDigest } : {}),
    });
    events.push(event);
    return event;
  }
  for (let index = 0; index < 2; index++) {
    const tx = 'history-' + index;
    const root = append('revision', tx, tx + '-prepare');
    if (index === 0) append('resume', tx, tx + '-resume', root);
    append('abort', tx, tx + '-abort', root);
    events.push(records.createTerminalEvent({ events, type: 'aborted' }));
  }
  append('revision', 'history-final', 'history-final-prepare');
  events.push(records.createTerminalEvent({ events, type: 'applied' }));
  return events;
}
test('single history fold matches original prefix classification across repeated abort, resume and final apply', () => {
  const events = historicalEvents();
  for (let length = 0; length <= events.length; length++) {
    const prefix = events.slice(0, length);
    const actual = api.deriveCriteriaAuthorityHistory(prefix);
    assert.deepEqual(actual, originalPrefixHistory(prefix));
    for (let index = 0; index < length; index++)
      assert.equal(actual.chain.events[index], prefix[index]);
    assert.equal(actual.chain.root, prefix.findLast((event) => event.type === 'prepared') ?? null);
  }
});
test('history fold retains original prefix refusal and fresh mutation checks', () => {
  const original = historicalEvents();
  const variants = [
    null,
    [original[0], original[0]],
    original.slice(1),
    [original[1], original[0], ...original.slice(2)],
    ...[
      'repository',
      'transactionId',
      'rootEventId',
      'rootProposalDigest',
      'predecessorEventId',
    ].map((key) => {
      const changed = structuredClone(original);
      changed[1][key] = 'foreign';
      return changed;
    }),
    ...['archive', 'terminal', 'abort'].map((kind) => {
      const changed = structuredClone(original);
      if (kind === 'archive')
        changed[1].proposal.archive.observation.revisionRecords.records[0].bytes += 'changed';
      if (kind === 'terminal')
        changed.at(-1).observedResourceVector.projectionHash = hashBytes('changed');
      if (kind === 'abort')
        changed.find(
          (event) => event.proposal?.mode === 'abort'
        ).proposal.archive.resourceVector.projectionHash = hashBytes('changed');
      return changed;
    }),
  ];
  for (const value of variants) {
    let expected, actual;
    try {
      originalPrefixHistory(value);
    } catch (error) {
      expected = error;
    }
    try {
      api.deriveCriteriaAuthorityHistory(value);
    } catch (error) {
      actual = error;
    }
    assert.ok(expected, 'original algorithm must refuse');
    assert.equal(actual?.constructor, expected.constructor);
    assert.equal(actual?.message, expected.message);
  }
  const value = structuredClone(original);
  const result = api.deriveCriteriaAuthorityHistory(value);
  result.chain.events[0].proposal.reason = 'later mutation';
  assert.throws(() => api.deriveCriteriaAuthorityHistory(value));
  assert.deepEqual(api.deriveCriteriaAuthorityHistory(original), originalPrefixHistory(original));
});
