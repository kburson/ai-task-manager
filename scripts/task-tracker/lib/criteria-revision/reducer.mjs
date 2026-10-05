// @story #1853
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { revisionError, hashRevisionValue } from './schema.mjs';
import {
  validateRevisionEvent,
  createTerminalEvent,
  parseRevisionEvent,
  withRevisionValidation,
} from './records.mjs';
const equal = (a, b) => canonicalRecordJson(a) === canonicalRecordJson(b);
export function reduceRevisionEvents(events) {
  return withRevisionValidation(() => reduceEvents(events));
}
function reduceEvents(events) {
  if (!Array.isArray(events)) revisionError('event-chain');
  const ids = new Set(),
    operations = new Set(),
    transactions = new Set();
  let state = {
    status: 'empty',
    head: null,
    root: null,
    effective: null,
    terminal: null,
    events: [],
  };
  for (const event of events) {
    validateRevisionEvent(event);
    if (ids.has(event.eventId)) revisionError('duplicate-event');
    ids.add(event.eventId);
    if (event.predecessorEventId !== state.head) revisionError('event-predecessor');
    if (
      state.events.length &&
      (event.repository !== state.events[0].repository || event.issue !== state.events[0].issue)
    )
      revisionError('event-scope');
    if (event.proposal) {
      const archived = event.proposal.archive.observation.revisionRecords.records;
      if (
        archived.length !== state.events.length ||
        archived.some(
          (r, i) => !equal(parseRevisionEvent(r.bytes, { records: archived }), state.events[i])
        )
      )
        revisionError('proposal-chain-archive');
    }
    if (event.type === 'prepared') {
      if (
        state.status === 'pending' ||
        transactions.has(event.transactionId) ||
        operations.has(event.operationId)
      )
        revisionError('illegal-prepared');
      if (event.proposal.archive.resourceVector.revisionEventHead !== state.head)
        revisionError('prepared-head');
      transactions.add(event.transactionId);
      operations.add(event.operationId);
      state = { ...state, status: 'pending', root: event, effective: event, terminal: null };
    } else {
      if (
        state.status !== 'pending' ||
        event.transactionId !== state.root.transactionId ||
        event.rootEventId !== state.root.eventId ||
        event.rootProposalDigest !== state.root.proposalDigest
      )
        revisionError('event-root-transition');
      if (event.type === 'recovery-authorized') {
        if (
          operations.has(event.operationId) ||
          event.proposal.mode === 'revision' ||
          event.proposal.priorTransaction.eventId !== state.head ||
          event.observedResourceVector.revisionEventHead !== state.head ||
          event.proposal.observedResourceVector !== hashRevisionValue(event.observedResourceVector)
        )
          revisionError('recovery-transition');
        if (event.proposal.mode === 'resume') {
          for (const key of ['writeSet', 'identityMap', 'after', 'invalidation'])
            if (!equal(event.proposal[key], state.effective.proposal[key]))
              revisionError('resume-target');
        }
        operations.add(event.operationId);
        state.effective = event;
      } else {
        const expected = createTerminalEvent({ events: state.events, type: event.type });
        if (!equal(event, expected)) revisionError('terminal-binding');
        state.status = event.type;
        state.terminal = event;
      }
    }
    state.head = event.eventId;
    state.events.push(event);
  }
  return state;
}
