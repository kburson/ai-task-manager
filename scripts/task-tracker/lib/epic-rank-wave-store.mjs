// @story #1872
import { canonicalRecordJson } from './github-records/canonical-json.mjs';
import { freezeRankGraph, rankWaveDigest } from './epic-rank-wave-policy.mjs';
import {
  exactRankWaveKeys,
  sealRankWaveRecord,
  selectRankWaveRecord,
  validateRankWaveBinding,
} from './epic-rank-wave-authority.mjs';
import {
  reconcileRankWavePointer,
  parseEpicOrchestrationPlan,
} from './epic-orchestration-plan.mjs';
import { validateRankWaveSource } from './epic-rank-wave-source.mjs';
import { validateRankWaveRefresh } from './epic-rank-wave-bindings.mjs';

const blocked = (code, detail) => ({
  status: 'blocked',
  code: `rank-wave-${code}`,
  ...(detail ? { detail } : {}),
});
function same(a, b) {
  return canonicalRecordJson(a) === canonicalRecordJson(b);
}
function scope(record) {
  return {
    repository: record.repository,
    epic: record.epic,
    rank: record.rank,
    members: record.members,
  };
}
async function verified({ record, snapshot, runtime, purpose = 'authorize', notBefore = null }) {
  if (!same(record.parent, snapshot.parent)) return blocked('parent-binding-changed');
  if (
    purpose !== 'revoke' &&
    rankWaveDigest(freezeRankGraph(snapshot.children)) !== rankWaveDigest(record.graph)
  )
    return blocked('graph-stale');
  const source = await runtime.verifySource({
    source: record.source,
    scope: scope(record),
    recordingActor: record.recordingActor,
    purpose,
    notBefore,
  });
  if (source?.status !== 'verified') return blocked('source-unverified');
  if (purpose === 'revoke') return null;
  const bindings = await runtime.verifyBindings({
    bindings: record.bindings,
    parent: record.parent,
    children: snapshot.children,
    target: null,
  });
  if (!bindings?.ok) return blocked('bindings-unverified', bindings?.code);
  return null;
}
export async function prepareRankWave({
  repository,
  epic,
  rank,
  operationId,
  expiresAt,
  runtime,
} = {}) {
  try {
    await runtime.assertParent(epic);
    const snapshot = await runtime.readSnapshot(epic, rank);
    const graph = freezeRankGraph(snapshot.children),
      members = graph.filter((c) => c.rank === rank).map((c) => c.number);
    if (!members.length || !parseEpicOrchestrationPlan(snapshot.body))
      return blocked('parent-contract-unreadable');
    validateRankWaveBinding(snapshot.parent);
    snapshot.bindings.forEach(validateRankWaveBinding);
    if (
      !same(
        snapshot.bindings.map((b) => b.issue),
        members
      )
    )
      return blocked('bindings-incomplete');
    const proposal = {
      schema: 'aitm.rank-wave-proposal/v1',
      operationId,
      repository,
      epic,
      rank,
      members,
      graph,
      bindings: snapshot.bindings,
      parent: snapshot.parent,
      expiresAt,
    };
    const bindings = await runtime.verifyBindings({
      bindings: proposal.bindings,
      parent: proposal.parent,
      children: snapshot.children,
      target: null,
    });
    if (!bindings?.ok) return blocked('bindings-unverified', bindings?.code);
    return { status: 'prepared', proposal, digest: rankWaveDigest(proposal) };
  } catch (error) {
    return blocked('prepare-unavailable', error.message);
  }
}

async function history(runtime, epic) {
  const records = await runtime.listRecords(epic);
  if (!Array.isArray(records) || records.some((r) => !r?.commentNodeId || !r.wave))
    throw new Error('comment history unreadable');
  if (new Set(records.map((r) => r.commentNodeId)).size !== records.length)
    throw new Error('duplicate comment identity');
  return records;
}
function publicationMatches(body, selected, comments) {
  const plan = parseEpicOrchestrationPlan(body);
  const pointer =
    plan?.schema === 2 ? plan.waves.find((w) => w.rank === selected.record.rank) : null;
  const comment = comments.find((c) => c.wave.digest === selected.digest);
  return (
    pointer?.operationId === selected.record.id &&
    pointer.digest === selected.digest &&
    pointer.commentNodeId === comment?.commentNodeId &&
    plan.graphDigest === rankWaveDigest(selected.record.graph)
  );
}
function sourceNotBefore(record, previous) {
  if (!previous) return null;
  if (
    record.action === 'revoke' ||
    (record.action === 'authorize' &&
      (previous.action === 'revoke' ||
        ['graph', 'members', 'bindings', 'parent'].some(
          (key) => !same(record[key], previous[key])
        )))
  )
    return previous.createdAt;
  if (
    record.action === 'authorize' &&
    previous.expiresAt !== null &&
    Date.parse(record.createdAt) >= Date.parse(previous.expiresAt)
  )
    return previous.expiresAt;
  return null;
}
async function verifyHistorySources(comments, { repository, epic, rank, now, runtime }) {
  const selected = selectRankWaveRecord(
    comments.map((c) => c.wave),
    { repository, epic, rank, now }
  );
  if (selected.status === 'malformed') return blocked('history-malformed');
  const records = comments
    .map((c) => c.wave.record)
    .filter((r) => r.rank === rank)
    .sort((a, b) => a.revision - b.revision);
  for (let i = 0; i < records.length; i++) {
    const r = records[i],
      source = await runtime.verifySource({
        source: r.source,
        scope: scope(r),
        recordingActor: r.recordingActor,
        purpose: r.action === 'revoke' ? 'revoke' : 'authorize',
        notBefore: sourceNotBefore(r, records[i - 1]),
      });
    if (source?.status !== 'verified') return blocked('source-unverified');
  }
  return null;
}
export async function inspectRankWavePublication({ repository, epic, rank, now, runtime } = {}) {
  try {
    const snapshot = await runtime.readSnapshot(epic, rank);
    const comments = await history(runtime, epic);
    const selected = selectRankWaveRecord(
      comments.map((c) => c.wave),
      { repository, epic, rank, now }
    );
    if (selected.status === 'malformed') return blocked('history-malformed', selected.detail);
    const sourceRefusal = await verifyHistorySources(comments, {
      repository,
      epic,
      rank,
      now,
      runtime,
    });
    if (sourceRefusal) return sourceRefusal;
    if (selected.status === 'ungranted') {
      const plan = parseEpicOrchestrationPlan(snapshot.body);
      if (!comments.length && plan?.schema !== 2) return { status: 'legacy', snapshot };
      if (
        plan?.schema !== 2 ||
        plan.graphDigest !== rankWaveDigest(freezeRankGraph(snapshot.children))
      )
        return blocked('graph-stale');
      if (plan.waves.some((w) => w.rank === rank)) return blocked('history-incomplete');
      for (const pointer of plan.waves) {
        const sourceRefusal = await verifyHistorySources(comments, {
          repository,
          epic,
          rank: pointer.rank,
          now,
          runtime,
        });
        if (sourceRefusal) return sourceRefusal;
        const head = selectRankWaveRecord(
          comments.map((c) => c.wave),
          { repository, epic, rank: pointer.rank, now }
        );
        if (
          !head.record ||
          head.status === 'malformed' ||
          !publicationMatches(snapshot.body, head, comments)
        )
          return blocked('history-incomplete');
        const source = await runtime.verifySource({
          source: head.record.source,
          scope: scope(head.record),
          recordingActor: head.record.recordingActor,
          purpose: head.record.action === 'revoke' ? 'revoke' : 'authorize',
        });
        if (source?.status !== 'verified') return blocked('source-unverified');
      }
      return { status: 'ungranted', snapshot, graph: plan.graph };
    }
    if (selected.status !== 'ready') return { ...selected, snapshot };
    const refusal = await verified({ record: selected.record, snapshot, runtime });
    if (refusal) return refusal;
    if (!publicationMatches(snapshot.body, selected, comments))
      return { ...selected, status: 'publication-incomplete' };
    return {
      ...selected,
      snapshot,
      commentNodeId: comments.find((c) => c.wave.digest === selected.digest).commentNodeId,
    };
  } catch (error) {
    return blocked('publication-unreadable', error.message);
  }
}

async function finishPublication({ comment, record, digest, snapshot, runtime, epic }) {
  try {
    await runtime.assertParent(epic);
    snapshot = await runtime.readSnapshot(epic, record.rank);
    const refusal = await verified({
      record,
      snapshot,
      runtime,
      purpose: record.action === 'revoke' ? 'revoke' : 'authorize',
    });
    if (refusal) return refusal;
    const result = await runtime.mutateBody(async (base) => {
      await runtime.assertParent(epic);
      const current = await runtime.readSnapshot(epic, record.rank);
      const stale = await verified({
        record,
        snapshot: current,
        runtime,
        purpose: record.action === 'revoke' ? 'revoke' : 'authorize',
      });
      if (stale) throw new Error(stale.code);
      return reconcileRankWavePointer(base, {
        record,
        digest,
        commentNodeId: comment.commentNodeId,
      });
    }, epic);
    const body = typeof result === 'string' ? result : result?.body;
    if (!publicationMatches(body, { record, digest }, [comment]))
      return { status: 'publication-incomplete', code: 'rank-wave-pointer-readback' };
    return {
      status: 'recorded',
      operationId: record.id,
      digest,
      commentNodeId: comment.commentNodeId,
    };
  } catch (error) {
    return {
      status: 'publication-incomplete',
      code: 'rank-wave-publication-incomplete',
      detail: error.message,
    };
  }
}
async function writeLocked({ action, repository, epic, input, now, runtime }) {
  await runtime.assertParent(epic);
  const comments = await history(runtime, epic);
  if (action === 'resume') {
    exactRankWaveKeys(input, ['schema', 'operationId', 'digest', 'commentNodeId']);
    if (input.schema !== 'aitm.epic-wave-resume/v1') return blocked('input-schema');
    const matches = comments.filter(
      (c) =>
        c.wave.record.id === input.operationId &&
        c.wave.digest === input.digest &&
        c.commentNodeId === input.commentNodeId
    );
    if (matches.length !== 1) return blocked('resume-identity');
    const comment = matches[0],
      record = comment.wave.record;
    const selected = selectRankWaveRecord(
      comments.map((c) => c.wave),
      { repository, epic, rank: record.rank, now }
    );
    if (
      !(
        selected.status === 'ready' ||
        (selected.status === 'revoked' && record.action === 'revoke')
      ) ||
      selected.digest !== input.digest
    )
      return blocked('resume-head');
    const sourceRefusal = await verifyHistorySources(comments, {
      repository,
      epic,
      rank: record.rank,
      now,
      runtime,
    });
    if (sourceRefusal) return sourceRefusal;
    const snapshot = await runtime.readSnapshot(epic, record.rank);
    return finishPublication({ comment, ...comment.wave, snapshot, runtime, epic });
  }
  exactRankWaveKeys(input, [
    'schema',
    'proposal',
    'expectedProposalDigest',
    'source',
    'previousDigest',
  ]);
  if (input.schema !== 'aitm.epic-wave-request/v1') return blocked('input-schema');
  const proposal = input.proposal;
  exactRankWaveKeys(proposal, [
    'schema',
    'operationId',
    'repository',
    'epic',
    'rank',
    'members',
    'graph',
    'bindings',
    'parent',
    'expiresAt',
  ]);
  if (
    proposal.schema !== 'aitm.rank-wave-proposal/v1' ||
    proposal.repository !== repository ||
    proposal.epic !== epic ||
    rankWaveDigest(proposal) !== input.expectedProposalDigest
  )
    return blocked('proposal-mismatch');
  validateRankWaveSource(input.source);
  const snapshot = await runtime.readSnapshot(epic, proposal.rank);
  if (!same(snapshot.parent, proposal.parent)) return blocked('parent-binding-changed');
  const prior = selectRankWaveRecord(
    comments.map((c) => c.wave),
    { repository, epic, rank: proposal.rank, now }
  );
  if (prior.status === 'malformed') return blocked('history-malformed');
  const sameOperation = comments.filter((c) => c.wave.record.id === proposal.operationId);
  if (sameOperation.length) {
    if (
      sameOperation.length !== 1 ||
      sameOperation[0].wave.record.proposalDigest !== input.expectedProposalDigest ||
      !same(sameOperation[0].wave.record.source, input.source) ||
      sameOperation[0].wave.record.action !== (action === 'record' ? 'authorize' : action) ||
      !(prior.status === 'ready' || (prior.status === 'revoked' && action === 'revoke')) ||
      prior.digest !== sameOperation[0].wave.digest
    )
      return blocked('operation-conflict');
    const sourceRefusal = await verifyHistorySources(comments, {
      repository,
      epic,
      rank: proposal.rank,
      now,
      runtime,
    });
    if (sourceRefusal) return sourceRefusal;
    return finishPublication({
      comment: sameOperation[0],
      ...sameOperation[0].wave,
      snapshot,
      runtime,
      epic,
    });
  }
  if (
    input.previousDigest !== (prior.digest ?? null) ||
    (action === 'refresh' && prior.status !== 'ready') ||
    (action === 'revoke' && !['ready', 'expired'].includes(prior.status))
  )
    return blocked('prior-mismatch');
  if (
    action === 'revoke' &&
    ['graph', 'members', 'bindings'].some((key) => !same(prior.record[key], proposal[key]))
  )
    return blocked('revocation-scope');
  let continuation = null;
  if (action === 'refresh') {
    const discharge = await runtime.observeDischarge(prior.record.bindings, proposal.bindings);
    if (
      !validateRankWaveRefresh({
        before: prior.record.bindings,
        after: proposal.bindings,
        discharge,
      }).ok ||
      !same(prior.record.graph, proposal.graph) ||
      !same(prior.record.members, proposal.members) ||
      !same(prior.record.source, input.source) ||
      !same(prior.record.parent, proposal.parent) ||
      prior.record.expiresAt !== proposal.expiresAt
    )
      return blocked('refresh-scope-or-discharge');
    const next = proposal.bindings.find((b) => b.issue === discharge.issue);
    continuation = {
      issue: discharge.issue,
      oldGeneration: discharge.oldGeneration,
      oldSessionId: discharge.oldSessionId,
      newGeneration: next.generation,
      newSessionId: next.sessionId,
    };
  }
  const record = {
    schema: 'aitm.epic-rank-wave/v1',
    id: proposal.operationId,
    revision: (prior.record?.revision ?? 0) + 1,
    action: action === 'record' ? 'authorize' : action,
    previousDigest: input.previousDigest,
    repository,
    epic,
    rank: proposal.rank,
    members: proposal.members,
    graph: proposal.graph,
    bindings: proposal.bindings,
    parent: proposal.parent,
    proposalDigest: input.expectedProposalDigest,
    source: input.source,
    recordingActor: runtime.recordingActor ?? 'rank-wave/registered-runtime',
    createdAt: now,
    expiresAt: proposal.expiresAt,
    continuation,
  };
  const wave = sealRankWaveRecord(record);
  const refusal = await verified({
    record,
    snapshot,
    runtime,
    purpose: action === 'revoke' ? 'revoke' : 'authorize',
    notBefore: sourceNotBefore(record, prior.record),
  });
  if (refusal) return refusal;
  if (!(await runtime.reserveOperation(record.id, wave)))
    return {
      status: 'indeterminate',
      code: 'rank-wave-original-operation-pending',
      operationId: record.id,
    };
  let comment;
  try {
    comment = await runtime.createRecord(wave, epic, comments);
  } catch (error) {
    const discovered = (await history(runtime, epic)).filter(
      (c) => c.wave.record.id === record.id && c.wave.digest === wave.digest
    );
    if (discovered.length !== 1)
      return {
        status: 'indeterminate',
        code: 'rank-wave-comment-outcome-unknown',
        operationId: record.id,
        detail: error.message,
      };
    comment = discovered[0];
  }
  if (!same(comment.wave, wave)) return blocked('comment-readback-mismatch');
  return finishPublication({ comment, ...wave, snapshot, runtime, epic });
}
export async function executeRankWaveWrite(args) {
  try {
    if (
      !['record', 'revoke', 'refresh', 'resume'].includes(args.action) ||
      typeof args.runtime.withLock !== 'function'
    )
      return blocked('registered-lock-required');
    return await args.runtime.withLock(() => writeLocked(args));
  } catch (error) {
    return blocked('write-refused', error.message);
  }
}
