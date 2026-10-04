// @story #1872
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  prepareRankWave,
  executeRankWaveWrite,
  inspectRankWavePublication,
} from '../../../../task-tracker/lib/epic-rank-wave-store.mjs';
import { buildEpicOrchestrationPlanMarker } from '../../../../task-tracker/lib/epic-orchestration-plan.mjs';
const at = '2026-10-04T01:00:00.000Z';
function fixture() {
  const children = [140, 144].map((number) => ({
    number,
    rank: 2,
    state: 'ready-for-plan',
    boardState: 'ready-for-plan',
    issueState: 'open',
    closeReason: null,
    recoveryPhase: null,
    hasCurrentRefinement: true,
    refinementDigest: 'a'.repeat(64),
    blockedBy: [],
    dependencyReadiness: 'ready',
  }));
  const bindings = children.map((c) => ({
    issue: c.number,
    worktree: `/clone/${c.number}`,
    branch: `child-${c.number}`,
    commonDir: '/clone/.git',
    provider: 'codex',
    sessionId: `native-${c.number}`,
    generation: `gen-${c.number}`,
  }));
  const parent = {
    issue: 107,
    worktree: '/clone/parent',
    branch: 'parent',
    commonDir: '/clone/.git',
    provider: 'codex',
    sessionId: 'native-parent',
    generation: 'parent-gen',
  };
  let body = buildEpicOrchestrationPlanMarker({ children, trunkSha: '1'.repeat(40) });
  const comments = [],
    journal = new Map();
  let posts = 0,
    failBody = false,
    unknown = false,
    failReadback = false;
  const runtime = {
    async withLock(fn) {
      return fn();
    },
    async assertParent() {},
    async readSnapshot() {
      return { body, children, bindings, parent };
    },
    async verifySource() {
      return { status: 'verified' };
    },
    async verifyBindings() {
      return { ok: true };
    },
    async listRecords() {
      return structuredClone(comments);
    },
    async reserveOperation(id, wave) {
      if (journal.has(id)) return false;
      journal.set(id, structuredClone(wave));
      return true;
    },
    async createRecord(wave) {
      posts++;
      if (unknown) throw new Error('unknown transport');
      const c = { commentNodeId: `C${posts}`, wave: structuredClone(wave) };
      comments.push(c);
      return c;
    },
    async mutateBody(mutate) {
      if (failBody) throw new Error('body failure');
      body = await mutate(body);
      if (failReadback) throw new Error('readback unavailable');
      return body;
    },
  };
  return {
    runtime,
    children,
    comments,
    get body() {
      return body;
    },
    get posts() {
      return posts;
    },
    set failBody(v) {
      failBody = v;
    },
    set unknown(v) {
      unknown = v;
    },
    set failReadback(v) {
      failReadback = v;
    },
  };
}
async function prepared(f, id = 'op-1') {
  return prepareRankWave({
    repository: 'o/r',
    epic: 107,
    rank: 2,
    operationId: id,
    expiresAt: null,
    runtime: f.runtime,
  });
}
async function record(f, p) {
  return executeRankWaveWrite({
    action: 'record',
    repository: 'o/r',
    epic: 107,
    now: at,
    runtime: f.runtime,
    input: {
      schema: 'aitm.epic-wave-request/v1',
      proposal: p.proposal,
      expectedProposalDigest: p.digest,
      source: {
        schema: 'aitm.rank-wave-source/v1',
        sessionId: 'real',
        messages: [{ messageId: 'm1', statementHash: `sha256:${'a'.repeat(64)}` }],
      },
      previousDigest: null,
    },
  });
}
async function resume(f, c) {
  return executeRankWaveWrite({
    action: 'resume',
    repository: 'o/r',
    epic: 107,
    now: at,
    runtime: f.runtime,
    input: {
      schema: 'aitm.epic-wave-resume/v1',
      operationId: c.wave.record.id,
      digest: c.wave.digest,
      commentNodeId: c.commentNodeId,
    },
  });
}

test('partial comment publication refuses admission and same-record resume completes exactly one comment', async () => {
  const f = fixture(),
    p = await prepared(f);
  assert.equal(p.status, 'prepared');
  f.failBody = true;
  assert.equal((await record(f, p)).status, 'publication-incomplete');
  assert.equal(f.posts, 1);
  const show = await inspectRankWavePublication({
    repository: 'o/r',
    epic: 107,
    rank: 2,
    now: at,
    runtime: f.runtime,
  });
  assert.equal(show.status, 'publication-incomplete');
  f.failBody = false;
  assert.equal((await resume(f, f.comments[0])).status, 'recorded');
  assert.equal((await resume(f, f.comments[0])).status, 'recorded');
  assert.equal(f.posts, 1);
});

test('body succeeds but read-back fails; retry repairs the same pointer without posting again', async () => {
  const f = fixture(),
    p = await prepared(f);
  f.failReadback = true;
  assert.equal((await record(f, p)).status, 'publication-incomplete');
  f.failReadback = false;
  assert.equal((await resume(f, f.comments[0])).status, 'recorded');
  assert.equal(f.posts, 1);
});

test('unknown comment write stays indeterminate under its original operation ID and never posts twice', async () => {
  const f = fixture(),
    p = await prepared(f);
  f.unknown = true;
  assert.equal((await record(f, p)).status, 'indeterminate');
  f.unknown = false;
  assert.equal((await record(f, p)).status, 'indeterminate');
  assert.equal(f.posts, 1);
});

test('graph drift, source refusal, record tamper and mismatched operation identity refuse repair', async () => {
  for (const change of [
    (f) => (f.children[0].rank = 3),
    (f) => (f.runtime.verifySource = async () => ({ status: 'blocked' })),
    (f) => f.comments[0].wave.record.members.push(999),
  ]) {
    const f = fixture(),
      p = await prepared(f);
    f.failBody = true;
    await record(f, p);
    f.failBody = false;
    change(f);
    assert.equal((await resume(f, f.comments[0])).status, 'blocked');
    assert.equal(f.posts, 1);
  }
  const f = fixture(),
    p = await prepared(f);
  await record(f, p);
  const c = structuredClone(f.comments[0]);
  c.commentNodeId = 'other';
  assert.equal((await resume(f, c)).status, 'blocked');
});

test('newer revocation and expiry cannot be repaired as partial publication', async () => {
  const f = fixture(),
    p = await prepared(f);
  await record(f, p);
  const second = await prepared(f, 'op-2');
  const revoked = await executeRankWaveWrite({
    action: 'revoke',
    repository: 'o/r',
    epic: 107,
    now: at,
    runtime: f.runtime,
    input: {
      schema: 'aitm.epic-wave-request/v1',
      proposal: second.proposal,
      expectedProposalDigest: second.digest,
      source: {
        schema: 'aitm.rank-wave-source/v1',
        sessionId: 'real',
        messages: [{ messageId: 'm2', statementHash: `sha256:${'b'.repeat(64)}` }],
      },
      previousDigest: f.comments[0].wave.digest,
    },
  });
  assert.equal(revoked.status, 'recorded');
  assert.equal((await resume(f, f.comments[0])).status, 'blocked');
  const g = fixture();
  const q = await prepareRankWave({
    repository: 'o/r',
    epic: 107,
    rank: 2,
    operationId: 'expiring',
    expiresAt: '2026-10-04T02:00:00.000Z',
    runtime: g.runtime,
  });
  await record(g, q);
  assert.equal(
    (
      await inspectRankWavePublication({
        repository: 'o/r',
        epic: 107,
        rank: 2,
        now: '2026-10-04T02:00:00.000Z',
        runtime: g.runtime,
      })
    ).status,
    'expired'
  );
});

test('a registered exact generation refresh requires positive discharge, preserves source scope and remains resumable', async () => {
  const f = fixture(),
    p = await prepared(f);
  await record(f, p);
  const next = await prepared(f, 'refresh-1');
  next.proposal.bindings[1].sessionId = 'native-replacement';
  next.proposal.bindings[1].generation = 'new-generation';
  const { rankWaveDigest } = await import('../../../../task-tracker/lib/epic-rank-wave-policy.mjs');
  next.digest = rankWaveDigest(next.proposal);
  f.runtime.observeDischarge = async () => ({
    verified: true,
    issue: 144,
    oldGeneration: 'gen-144',
    oldSessionId: 'native-144',
    overlapping: false,
  });
  const request = {
    schema: 'aitm.epic-wave-request/v1',
    proposal: next.proposal,
    expectedProposalDigest: next.digest,
    source: f.comments[0].wave.record.source,
    previousDigest: f.comments[0].wave.digest,
  };
  const result = await executeRankWaveWrite({
    action: 'refresh',
    repository: 'o/r',
    epic: 107,
    now: at,
    runtime: f.runtime,
    input: request,
  });
  assert.equal(result.status, 'recorded');
  assert.equal(f.comments[1].wave.record.continuation?.oldGeneration, 'gen-144');
  assert.equal((await resume(f, f.comments[1])).status, 'recorded');
  assert.equal(f.posts, 2);
});

test('generation refresh cannot extend authorization expiry or reserve a publication', async () => {
  const f = fixture(),
    p = await prepared(f);
  await record(f, p);
  const next = await prepared(f, 'expiry-refresh');
  next.proposal.bindings[1].sessionId = 'native-replacement';
  next.proposal.bindings[1].generation = 'new-generation';
  next.proposal.expiresAt = '2026-10-04T02:00:00.000Z';
  const { rankWaveDigest } = await import('../../../../task-tracker/lib/epic-rank-wave-policy.mjs');
  f.runtime.observeDischarge = async () => ({
    verified: true,
    issue: 144,
    oldGeneration: 'gen-144',
    oldSessionId: 'native-144',
    overlapping: false,
  });
  let reservations = 0;
  const reserve = f.runtime.reserveOperation;
  f.runtime.reserveOperation = async (...args) => {
    reservations++;
    return reserve(...args);
  };
  const result = await executeRankWaveWrite({
    action: 'refresh',
    repository: 'o/r',
    epic: 107,
    now: at,
    runtime: f.runtime,
    input: {
      schema: 'aitm.epic-wave-request/v1',
      proposal: next.proposal,
      expectedProposalDigest: rankWaveDigest(next.proposal),
      source: f.comments[0].wave.record.source,
      previousDigest: f.comments[0].wave.digest,
    },
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.code, 'rank-wave-refresh-scope-or-discharge');
  assert.equal(reservations, 0);
  assert.equal(f.posts, 1);
});

test('fresh observation after comment write prevents publishing a graph that changed in flight', async () => {
  const f = fixture(),
    p = await prepared(f),
    create = f.runtime.createRecord;
  f.runtime.createRecord = async (wave) => {
    const c = await create(wave);
    f.children[0].rank = 3;
    return c;
  };
  const result = await record(f, p);
  assert.equal(result.status, 'blocked');
  assert.equal(result.code, 'rank-wave-graph-stale');
  assert.equal(
    (
      await import('../../../../task-tracker/lib/epic-orchestration-plan.mjs')
    ).parseEpicOrchestrationPlan(f.body).schema,
    1
  );
});

test('strict policy at another rank requires authentic matching pointers for all adopted waves', async () => {
  const f = fixture(),
    p = await prepared(f);
  await record(f, p);
  f.runtime.verifySource = async () => ({ status: 'blocked' });
  assert.equal(
    (
      await inspectRankWavePublication({
        repository: 'o/r',
        epic: 107,
        rank: 3,
        now: at,
        runtime: f.runtime,
      })
    ).status,
    'blocked'
  );
});

test('a prepared proposal cannot be recorded by a replacement parent identity', async () => {
  const f = fixture(),
    p = await prepared(f),
    read = f.runtime.readSnapshot;
  f.runtime.readSnapshot = async () => {
    const snap = await read();
    return {
      ...snap,
      parent: {
        ...snap.parent,
        sessionId: 'replacement-parent',
        generation: 'replacement-generation',
      },
    };
  };
  assert.equal((await record(f, p)).status, 'blocked');
  assert.equal(f.posts, 0);
});

test('duplicate and fenced orchestration examples cannot supply publication authority', async () => {
  const { parseEpicOrchestrationPlan } =
    await import('../../../../task-tracker/lib/epic-orchestration-plan.mjs');
  const f = fixture();
  assert.equal(parseEpicOrchestrationPlan(`${f.body}\n${f.body}`), null);
  assert.equal(parseEpicOrchestrationPlan(`\`\`\`\n${f.body}\n\`\`\``), null);
});

test('scoped revocation can be completed after graph or worker drift without reviving the grant', async () => {
  const f = fixture(),
    p = await prepared(f);
  await record(f, p);
  const prior = f.comments[0].wave;
  const proposal = { ...p.proposal, operationId: 'revoke-drift' };
  const { rankWaveDigest } = await import('../../../../task-tracker/lib/epic-rank-wave-policy.mjs');
  f.children[0].refinementDigest = 'b'.repeat(64);
  f.runtime.verifyBindings = async () => ({ ok: false });
  f.failBody = true;
  const result = await executeRankWaveWrite({
    action: 'revoke',
    repository: 'o/r',
    epic: 107,
    now: '2026-10-04T01:01:00.000Z',
    runtime: f.runtime,
    input: {
      schema: 'aitm.epic-wave-request/v1',
      proposal,
      expectedProposalDigest: rankWaveDigest(proposal),
      source: prior.record.source,
      previousDigest: prior.digest,
    },
  });
  assert.equal(result.status, 'publication-incomplete');
  assert.equal(f.posts, 2);
  f.failBody = false;
  const c = f.comments[1];
  const resumed = await executeRankWaveWrite({
    action: 'resume',
    repository: 'o/r',
    epic: 107,
    now: '2026-10-04T01:02:00.000Z',
    runtime: f.runtime,
    input: {
      schema: 'aitm.epic-wave-resume/v1',
      operationId: c.wave.record.id,
      digest: c.wave.digest,
      commentNodeId: c.commentNodeId,
    },
  });
  assert.equal(resumed.status, 'recorded');
  assert.equal(f.posts, 2);
  assert.equal((await resume(f, f.comments[0])).status, 'blocked');
});

test('new graph adoption requires fresh authorization and replaces stale body scope through the registered action', async () => {
  const f = fixture(),
    p = await prepared(f);
  await record(f, p);
  const prior = f.comments[0].wave;
  f.children[0].refinementDigest = 'b'.repeat(64);
  const next = await prepared(f, 'new-graph');
  const boundaries = [];
  f.runtime.verifySource = async ({ notBefore }) => {
    boundaries.push(notBefore);
    return { status: 'verified' };
  };
  const result = await executeRankWaveWrite({
    action: 'record',
    repository: 'o/r',
    epic: 107,
    now: '2026-10-04T01:01:00.000Z',
    runtime: f.runtime,
    input: {
      schema: 'aitm.epic-wave-request/v1',
      proposal: next.proposal,
      expectedProposalDigest: next.digest,
      source: prior.record.source,
      previousDigest: prior.digest,
    },
  });
  assert.equal(result.status, 'recorded');
  assert.ok(boundaries.includes(prior.record.createdAt));
  assert.equal(
    (
      await inspectRankWavePublication({
        repository: 'o/r',
        epic: 107,
        rank: 2,
        now: '2026-10-04T01:02:00.000Z',
        runtime: f.runtime,
      })
    ).status,
    'ready'
  );
});

test('parent generation drift after comment publication refuses pointer adoption', async () => {
  const f = fixture(),
    p = await prepared(f),
    create = f.runtime.createRecord,
    read = f.runtime.readSnapshot;
  let changed = false;
  f.runtime.createRecord = async (wave) => {
    const c = await create(wave);
    changed = true;
    return c;
  };
  f.runtime.readSnapshot = async () => {
    const s = await read();
    return changed ? { ...s, parent: { ...s.parent, generation: 'replacement-parent' } } : s;
  };
  const result = await record(f, p);
  assert.equal(result.status, 'blocked');
  assert.equal(result.code, 'rank-wave-parent-binding-changed');
  assert.equal(f.posts, 1);
});
