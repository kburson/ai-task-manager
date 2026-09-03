// @story #1497
import path from 'node:path';
import { readdirSync } from 'node:fs';
import { hash, fail, frozen, UUID, exact } from './value.mjs';
import { encodeRecord, decodeRecord, validateRecord } from './codec.mjs';
import { withJournalAuthority, loadJson, atomicJson } from './journal-authority.mjs';
import { orderJournal } from './journal-validation.mjs';
export async function readJournal({ repositoryId, issueNumber, ports }) {
  if (typeof ports?.listCommentsPage !== 'function') fail('journal-read-port');
  const byId = new Map(),
    operations = new Map(),
    physical = {},
    observations = {},
    cursors = new Set(),
    seenPhysical = new Set();
  let after = null;
  for (;;) {
    const page = await ports.listCommentsPage({ repositoryId, issueNumber, after });
    if (!Array.isArray(page?.nodes) || typeof page.pageInfo?.hasNextPage !== 'boolean')
      fail('journal-pagination');
    for (const comment of page.nodes) {
      const id = comment.id;
      if (typeof id !== 'string' || !id) fail('comment-id');
      if (seenPhysical.has(id)) fail('journal-pagination-duplicate');
      seenPhysical.add(id);
      if (typeof comment.body !== 'string') fail('comment-body');
      if (!/<!--\s*aitm-evidence-record\b/.test(comment.body)) continue;
      observations[id] = hash(comment.body);
      const record = decodeRecord(comment, { repositoryId, issueNumber });
      if (comment.author?.login !== record.actor.id) fail('record-author-mismatch');
      const prior = operations.get(record.operationId);
      if (prior && prior !== record.recordId) fail('operation-conflict');
      operations.set(record.operationId, record.recordId);
      byId.set(record.recordId, record);
      (physical[record.recordId] ||= []).push(id);
    }
    if (!page.pageInfo.hasNextPage) break;
    const next = page.pageInfo.endCursor;
    if (typeof next !== 'string' || !next || cursors.has(next) || !page.nodes.length)
      fail('journal-pagination');
    cursors.add(next);
    after = next;
  }
  for (const [id, digest] of Object.entries(ports.observed || {})) {
    if (observations[id] !== digest) fail('journal-drift');
  }
  const records = orderJournal([...byId.values()]);
  return frozen({ records, headId: records.at(-1)?.recordId ?? null, physical, observations });
}
export async function appendRecord({ expectedHead, record, authority, ports }) {
  validateRecord(record);
  if (expectedHead !== record.predecessorId) fail('expected-head-record');
  if (typeof ports?.createComment !== 'function' || typeof ports?.readComment !== 'function')
    fail('journal-write-port');
  const body = encodeRecord(record);
  return withJournalAuthority({ record, authority }, async ({ dir }) => {
    const observedFile = path.join(dir, 'observed.json');
    const pendingFile = path.join(dir, `${record.operationId}.json`);
    const read = () =>
      readJournal({
        repositoryId: record.repositoryId,
        issueNumber: record.issueNumber,
        ports: { ...ports, observed: loadJson(observedFile, {}) },
      });
    let journal = await read();
    const existing = () => journal.records.find((r) => r.operationId === record.operationId);
    const pending = loadJson(pendingFile);
    if (pending) {
      exact(pending, ['body', 'expectedHead', 'status'], 'pending-keys');
      if (!['prepared', 'requesting', 'confirmed'].includes(pending.status)) fail('pending-status');
    }
    if (pending && (pending.body !== body || pending.expectedHead !== expectedHead))
      fail('pending-operation-conflict');
    const reconcile = async () => {
      const found = existing();
      if (!found) return null;
      if (found.recordId !== record.recordId) fail('operation-conflict');
      for (const id of journal.physical[record.recordId]) {
        const saved = await ports.readComment({
          repositoryId: record.repositoryId,
          issueNumber: record.issueNumber,
          id,
        });
        if (saved?.body !== body || saved.author?.login !== record.actor.id)
          fail('comment-readback');
      }
      atomicJson(observedFile, journal.observations);
      atomicJson(pendingFile, { body, expectedHead, status: 'confirmed' });
      return frozen({
        record: found,
        headId: journal.headId,
        physicalIds: journal.physical[record.recordId],
      });
    };
    const recovered = await reconcile();
    if (recovered) return recovered;
    for (const name of readdirSync(dir)) {
      if (
        !name.endsWith('.json') ||
        !UUID.test(name.slice(0, -5)) ||
        name === `${record.operationId}.json`
      )
        continue;
      const other = loadJson(path.join(dir, name));
      if (other?.status !== 'confirmed') fail('pending-operation-recovery-required');
    }
    if (pending && pending.status !== 'prepared') fail('append-uncertain');
    if (journal.headId !== expectedHead) fail('expected-head-mismatch');
    orderJournal([...journal.records, record]);
    const designated =
      record.recordType === 'cycle-opened'
        ? record.payload.authorityHostId
        : journal.records.find((r) => r.recordType === 'cycle-opened')?.payload.authorityHostId;
    if (designated !== authority.hostId) fail('authority-host-mismatch');
    if (!pending) atomicJson(pendingFile, { body, expectedHead, status: 'prepared' });
    await ports.checkpoint?.('before-request', { record });
    atomicJson(pendingFile, { body, expectedHead, status: 'requesting' });
    try {
      await ports.createComment({
        repositoryId: record.repositoryId,
        issueNumber: record.issueNumber,
        body,
      });
    } catch {
      journal = await read();
      const result = await reconcile();
      if (result) return result;
      fail('append-uncertain');
    }
    await ports.checkpoint?.('after-response', { record });
    journal = await read();
    const result = await reconcile();
    if (!result) fail('append-uncertain');
    return result;
  });
}
