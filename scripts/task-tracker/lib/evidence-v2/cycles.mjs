// @story #1499
import { frozen, fail, uuidValue, textValue } from './value.mjs';
import { orderJournal } from './journal-validation.mjs';

function groupCycle(records, opened) {
  const members = records.filter((record) => record.cycleId === opened.cycleId);
  const completion = members.find((record) => record.recordType === 'cycle-completed') ?? null;
  const cleanup = members.find((record) => record.recordType === 'cleanup') ?? null;
  const started = members.find((record) => record.recordType === 'close-started') ?? null;
  return {
    cycleId: opened.cycleId,
    opened,
    status: completion ? 'completed' : 'open',
    candidates: members.filter((record) => record.recordType === 'candidate'),
    acceptance: members.filter((record) => record.recordType === 'acceptance').at(-1) ?? null,
    delivery: members.filter((record) => record.recordType === 'delivery').at(-1) ?? null,
    close: {
      started,
      steps: members.filter((record) => record.recordType === 'close-step'),
      completion,
      cleanup,
    },
    records: members,
  };
}

export function projectCycle(input = [], { validate = true } = {}) {
  const records = validate ? orderJournal(input) : [...input];
  const opened = records.filter((record) => record.recordType === 'cycle-opened');
  if (!opened.length) fail('cycle-projection-empty');
  const cycles = opened.map((record) => groupCycle(records, record));
  for (let index = 1; index < cycles.length; index += 1) {
    const prior = cycles[index - 1];
    const next = cycles[index];
    if (prior.status !== 'completed' || next.opened.payload.previousCycleId !== prior.cycleId)
      fail('cycle-successor');
  }
  const current = cycles.at(-1);
  return frozen({
    cycles,
    current,
    completedCycles: cycles.filter((cycle) => cycle.status === 'completed'),
    headId: records.at(-1)?.recordId ?? null,
  });
}

export function planCycleOpen({ projection, reason, externalEvent, authority, operation } = {}) {
  if (!projection || !operation) fail('cycle-open:input');
  uuidValue(operation.operationId, 'cycle-open-operation');
  uuidValue(operation.cycleId, 'cycle-open-cycle');
  uuidValue(authority?.hostId, 'cycle-open-authority');
  if (authority.approved !== true) fail('cycle-open:authority');
  if (!['initial', 'reopen', 'legacy-enrollment'].includes(reason)) fail('cycle-open:reason');

  const existing = projection.cycles?.find(
    (cycle) =>
      cycle.opened.operationId === operation.operationId ||
      (externalEvent?.id && cycle.opened.payload.externalEventId === externalEvent.id)
  );
  if (existing)
    return frozen({ status: 'existing', cycleId: existing.cycleId, record: existing.opened });

  const current = projection.current ?? null;
  if (reason === 'initial' && current) fail('cycle-open:already-opened');
  if (reason === 'reopen') {
    if (!current || current.status !== 'completed') fail('cycle-open:not-completed');
    if (!externalEvent || externalEvent.state !== 'REOPENED') fail('cycle-open:external-event');
    textValue(externalEvent.id, 'cycle-open-external-event');
  }
  const payload = {
    previousCycleId: current?.cycleId ?? null,
    authorityHostId: authority.hostId,
    reason,
    externalEventId: externalEvent?.id ?? null,
  };
  return frozen({
    status: 'planned',
    cycleId: operation.cycleId,
    operationId: operation.operationId,
    payload,
  });
}
