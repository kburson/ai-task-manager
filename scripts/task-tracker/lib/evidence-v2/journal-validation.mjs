// @story #1497
import { canonical, fail } from './value.mjs';
import { recordReferenceTypes } from './record-schema.mjs';
export function orderJournal(records) {
  const children = new Map();
  for (const r of records) {
    if (children.has(r.predecessorId)) fail('journal-fork');
    children.set(r.predecessorId, r);
  }
  const ordered = [];
  const byId = new Map();
  const cycles = new Map();
  let current = null;
  let cycle = null;
  while (children.has(current)) {
    const record = children.get(current);
    if (byId.has(record.recordId)) fail('journal-loop');
    if (record.recordType === 'cycle-opened') {
      if (cycles.has(record.cycleId) || record.payload.previousCycleId !== (cycle?.cycleId ?? null))
        fail('cycle-chain');
      // A completed-cycle record will become the only allowed predecessor for reopen in #1499.
      if (cycle) fail('cycle-reopen-not-supported');
      cycle = record;
      cycles.set(record.cycleId, record);
    } else if (!cycle || cycle.cycleId !== record.cycleId) fail('cycle-reference');
    for (const [field, type] of Object.entries(recordReferenceTypes[record.recordType] || {})) {
      const prior = byId.get(record.payload[field]);
      if (!prior || prior.recordType !== type) fail('record-reference');
      if (field !== 'priorVerificationId' && prior.cycleId !== record.cycleId)
        fail('cycle-reference');
    }
    if (
      record.recordType === 'candidate' &&
      canonical(record.payload.subject.repositoryId) !== canonical(record.repositoryId)
    )
      fail('subject-repository');
    if (record.recordType === 'verification') {
      const candidate = byId.get(record.payload.candidateId);
      if (
        record.payload.subjectId !== candidate.payload.subject.subjectId ||
        record.payload.testedSha !== candidate.payload.sourceSha
      )
        fail('verification-reference-inputs');
    }
    if (record.recordType === 'equivalence') {
      const prior = byId.get(record.payload.priorVerificationId);
      const candidate = byId.get(record.payload.candidateId);
      if (
        prior.payload.subjectId !== candidate.payload.subject.subjectId ||
        record.payload.subjectId !== prior.payload.subjectId
      )
        fail('equivalence-reference-inputs');
    }
    if (record.recordType === 'acceptance') {
      const candidate = byId.get(record.payload.candidateId);
      if (
        record.payload.requirementsDigest !== candidate.payload.subject.requirementsDigest ||
        record.payload.reviewAuthority.candidateId !== candidate.recordId
      )
        fail('acceptance-reference-inputs');
      for (const id of record.payload.evidenceIds) {
        const evidence = byId.get(id);
        if (
          !evidence ||
          !['verification', 'equivalence'].includes(evidence.recordType) ||
          evidence.cycleId !== record.cycleId ||
          evidence.payload.candidateId !== candidate.recordId
        )
          fail('acceptance-evidence-reference');
      }
    }
    byId.set(record.recordId, record);
    ordered.push(record);
    current = record.recordId;
  }
  if (ordered.length !== records.length) fail('journal-missing-predecessor');
  return ordered;
}
