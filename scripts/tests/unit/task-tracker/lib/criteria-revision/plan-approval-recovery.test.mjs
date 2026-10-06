// @story #1854
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeCanonicalRevisionFixture,
  makeLegacyRevisionFixture,
} from '../../../../fixtures/criteria-revision.mjs';
import { createRevisionMemory } from '../../../../../task-tracker/lib/criteria-revision/store.mjs';
import {
  createIssueDirectory,
  renderIssueDirectory,
} from '../../../../../task-tracker/lib/github-records/issue-directory.mjs';
import {
  deriveProposal,
  renderApprovalStatement,
} from '../../../../../task-tracker/lib/criteria-revision/proposal.mjs';
import {
  applyRevision,
  observeRevision,
} from '../../../../../task-tracker/lib/criteria-revision/engine.mjs';
import { hashBytes } from '../../../../../task-tracker/lib/criteria-revision/schema.mjs';
import { runPlanApprove } from '../../../../../task-tracker/verbs/plan-approve.mjs';
import { planApprovedGuard } from '../../../../../task-tracker/lib/plan-approved-guard.mjs';
const story =
  '## User Story\nAs a release operator\nI want to stop partial publication because registry checks can fail\nSo that consumers receive complete releases\n\n## Deep-Dive Analysis\n### Story Intent\n- **Beneficiary:** release operator\n- **Capability:** stop partial publication\n- **Need:** registry checks can fail\n- **Value or failure prevented:** consumers receive complete releases\n\n';
const forecast = '01J00000000000000000000009';
const trunk = 'a'.repeat(40);
const cfg = { repo: 'example/criteria' };
function planning(o) {
  return {
    schema: 'aitm.memory-planning/v1',
    repository: o.repository,
    issue: o.issue,
    bodyHash: hashBytes(o.body.bytes),
    epicChildren: [],
    trunkSha: trunk,
    cfg,
  };
}
async function fixture({ revised = false, kind = 'canonical', pending = false } = {}) {
  const f = kind === 'canonical' ? makeCanonicalRevisionFixture() : makeLegacyRevisionFixture();
  f.observation.stage = revised ? 'develop' : 'plan';
  f.observation.body.bytes =
    story +
    f.observation.body.bytes +
    '\n<!-- aitm-entered-ready-for-plan ts="2026-01-01T00:00:00.000Z" -->\n' +
    '<!-- aitm-estimation-forecast-ready record-id="' +
    forecast +
    '" -->\n';
  if (kind === 'canonical')
    f.observation.body.bytes += renderIssueDirectory(
      createIssueDirectory({
        issueNodeId: 'synthetic-issue',
        singletons: {
          'delivery-contract': 'synthetic-contract',
          coordination: 'synthetic-coordination',
          'evidence-projection': 'synthetic-evidence',
          timing: 'synthetic-timing',
        },
      })
    );
  const proposal = deriveProposal({ ...f.context, observation: f.observation });
  const statement = renderApprovalStatement(proposal);
  const backend = createRevisionMemory({
    observation: f.observation,
    comments: [],
    hostMessages: [{ ...f.rawUserMessage, content: [{ type: 'input_text', text: statement }] }],
    planning: planning(f.observation),
  });
  const context = {
    repository: f.observation.repository,
    issue: 124,
    executor: f.observation.executor,
  };
  if (revised) {
    const request = {
      ...f.request,
      proposal,
      authorizationSource: { ...f.authorizationSource, statementHash: hashBytes(statement) },
    };
    if (pending) {
      backend.failAfter = 'event-write:prepared';
      await assert.rejects(applyRevision({ context, request, deps: backend }), /interrupted/);
    } else
      assert.equal((await applyRevision({ context, request, deps: backend })).status, 'applied');
    backend.replacePlanning(planning(backend.observation));
  }
  return { backend, context };
}
const invoke = (backend) =>
  runPlanApprove({
    issueNumber: 124,
    cfg,
    projectDir: process.cwd(),
    deps: { revisionBackend: backend, env: { TT_FULL_AUTO: '1' } },
  });
const guard = (backend) =>
  planApprovedGuard.run({
    toState: 'develop',
    body: backend.observation.body.bytes,
    cfg: { gateAnalysisToDevelopment: true },
    deps: { revisionBackend: backend },
  });
const writes = (backend) => backend.effects.filter((e) => e.endsWith('-write'));
for (const revised of [false, true]) {
  for (const drift of [
    'trunk',
    'forecast',
    'story-marker',
    'forecast-ready',
    'source',
    'proof',
    'contract-body',
  ])
    test(`${revised ? 'revised' : 'baseline'} approval refuses stale ${drift} without effects`, async () => {
      const { backend } = await fixture({ revised });
      assert.equal((await invoke(backend)).status, 'approved');
      const beforeWrites = writes(backend);
      const o = backend.observation;
      if (drift === 'forecast')
        o.body.bytes = o.body.bytes.replace(
          'forecast-record-id="' + forecast,
          'forecast-record-id="01J00000000000000000000010'
        );
      if (drift === 'story-marker')
        o.body.bytes = o.body.bytes.replace(
          /story-digest="[^"]+"/,
          'story-digest="' + 'b'.repeat(64) + '"'
        );
      if (drift === 'forecast-ready')
        o.body.bytes = o.body.bytes.replace(
          'ready record-id="' + forecast,
          'ready record-id="01J00000000000000000000010'
        );
      if (drift === 'source')
        o.body.bytes = o.body.bytes.replace('release operator', 'unreviewed operator');
      if (drift === 'proof')
        o.proofRecords = o.proofRecords.filter((p) => p.identity !== o.capsule.head);
      if (drift === 'contract-body')
        o.body.bytes = o.body.bytes
          .replace('Old model hooks', 'Forged model hooks')
          .replace('Supported model hooks', 'Forged model hooks');
      backend.replaceAuthority(o);
      backend.replacePlanning({
        ...planning(o),
        trunkSha: drift === 'trunk' ? 'b'.repeat(40) : trunk,
      });
      assert.equal((await guard(backend)).ok, false);
      try {
        assert.notEqual((await invoke(backend)).status, 'already-approved');
      } catch (error) {
        assert.match(error.message, /plan-approval|binding|authority/);
      }
      assert.deepEqual(writes(backend), beforeWrites);
    });
  test(`${revised ? 'revised' : 'baseline'} complete current approval reuses every binding without writes`, async () => {
    const { backend } = await fixture({ revised });
    const first = await invoke(backend);
    assert.equal(first.status, 'approved');
    const before = writes(backend);
    assert.equal((await invoke(backend)).recordId, first.recordId);
    assert.equal((await guard(backend)).ok, true);
    assert.deepEqual(writes(backend), before);
  });
}

const steps = [
  'plan-journal-write',
  'plan-journal-readback',
  'plan-audit-write',
  'plan-audit-readback',
  'plan-capsule-write',
  'plan-capsule-readback',
  'plan-contract-write',
  'plan-contract-readback',
  'plan-proof-write',
  'plan-proof-readback',
  'plan-body-write',
  'plan-body-readback',
  'plan-readback',
];
for (const revised of [false, true])
  for (const when of ['failBefore', 'failAfter'])
    for (const step of steps)
      test(`${revised ? 'revised' : 'baseline'} ${when} ${step} resumes from serialized fresh backend`, async () => {
        const { backend: original, context } = await fixture({ revised });
        const history = original.comments;
        original[when] = step;
        await assert.rejects(invoke(original), /interrupted|capsule-chain:store/);
        const snapshot = JSON.parse(JSON.stringify(original.snapshot));
        const sealed = snapshot.planJournal;
        const backend = createRevisionMemory(snapshot);
        assert.equal((await guard(backend)).ok, false);
        const result = await invoke(backend);
        assert.equal(result.status, 'approved', JSON.stringify(result));
        if (sealed) {
          assert.equal(result.recordId, sealed.record.recordId);
          assert.equal(backend.observation.capsule.bytes, sealed.record.bytes);
        }
        assert.deepEqual(backend.comments.slice(0, history.length), history);
        const effects = [...writes(original), ...writes(backend)];
        for (const effect of [
          'plan-journal-write',
          'plan-audit-write',
          'plan-capsule-write',
          'plan-contract-write',
          'plan-proof-write',
          'plan-body-write',
        ])
          assert.equal(effects.filter((e) => e === effect).length, 1, effect);
        assert.equal((await guard(backend)).ok, true);
        assert.equal(
          (await observeRevision({ context, deps: backend })).status,
          revised ? 'applied' : 'empty'
        );
        const after = writes(backend);
        assert.equal((await invoke(backend)).status, 'already-approved');
        assert.deepEqual(writes(backend), after);
      });
for (const damage of [
  'target',
  'record',
  'chain',
  'foreign',
  'trunk',
  'forecast',
  'source',
  'unrelated',
  'audit',
  'missing-journal',
  'extra-key',
])
  test(`approval continuation refuses ${damage} drift with zero new writes`, async () => {
    const { backend: original } = await fixture({ revised: true });
    original.failAfter = 'plan-capsule-write';
    await assert.rejects(invoke(original), /capsule-chain:store/);
    const snapshot = original.snapshot;
    if (damage === 'target') snapshot.planJournal.after.body.bytes += '\nforged target';
    if (damage === 'record') snapshot.planJournal.record.bytes += '\nforged capsule';
    if (damage === 'chain') snapshot.planJournal.revisionEventHead = 'foreign-head';
    if (damage === 'foreign') snapshot.planJournal.before.executor.sessionId = 'foreign-session';
    if (damage === 'trunk') snapshot.planning.trunkSha = 'b'.repeat(40);
    if (damage === 'forecast')
      snapshot.observation.body.bytes = snapshot.observation.body.bytes.replace(
        forecast,
        '01J00000000000000000000010'
      );
    if (damage === 'source')
      snapshot.observation.body.bytes = snapshot.observation.body.bytes.replace(
        'release operator',
        'unreviewed operator'
      );
    if (damage === 'unrelated')
      snapshot.observation.proofRecords.push({
        kind: 'ac-proof',
        identity: 'foreign-proof',
        bytes: 'foreign',
        criterionIdentity: null,
      });
    if (damage === 'audit') snapshot.comments.at(-1).body += 'forged audit';
    if (damage === 'missing-journal') delete snapshot.planJournal;
    if (damage === 'extra-key') snapshot.planJournal.approved = true;
    snapshot.planning.bodyHash = hashBytes(snapshot.observation.body.bytes);
    let backend;
    try {
      backend = createRevisionMemory(snapshot);
      assert.equal((await guard(backend)).ok, false);
      const result = await invoke(backend);
      assert.notEqual(result.status, 'approved');
      assert.notEqual(result.status, 'already-approved');
    } catch (error) {
      assert.match(error.message, /plan-|planning-|binding|authority/);
    }
    if (backend) assert.deepEqual(writes(backend), []);
  });
test('legacy applied approval resumes audit interruption in a fresh backend', async () => {
  const { backend: original } = await fixture({ revised: true, kind: 'legacy' });
  original.failAfter = 'plan-audit-write';
  await assert.rejects(invoke(original), /interrupted/);
  const backend = createRevisionMemory(original.snapshot);
  assert.equal((await invoke(backend)).status, 'approved');
  assert.equal((await guard(backend)).ok, true);
  assert.equal(backend.effects.filter((e) => e === 'plan-audit-write').length, 0);
});

import {
  parseAitmRecord,
  createAitmRecordEnvelope,
  renderAitmRecord,
} from '../../../../../task-tracker/lib/github-records/record-envelope.mjs';
import { canonicalRecordJson } from '../../../../../task-tracker/lib/github-records/canonical-json.mjs';
for (const state of ['expired', 'revoked', 'replaced'])
  test(`approval retry refuses durable ${state} native grant without restoring it`, async () => {
    const { backend: original } = await fixture({ revised: true });
    original.failAfter = 'plan-capsule-write';
    await assert.rejects(invoke(original), /capsule-chain:store/);
    const snapshot = original.snapshot,
      o = snapshot.observation;
    const grant = JSON.parse(o.grant.bytes);
    if (state === 'expired') {
      grant.expiresAt = '2026-10-01T00:00:00.000Z';
      const r = o.canonicalArchive.records[0],
        e = parseAitmRecord({
          commentNodeId: r.recordId,
          body: r.bytes,
          expectedRepository: o.repository,
          expectedIssue: o.issue,
        }).envelope;
      r.bytes = renderAitmRecord({
        envelope: createAitmRecordEnvelope({
          ...e,
          payload: grant,
          actor: e.authority.actor,
          epoch: e.authority.epoch,
          grantId: e.authority.grantId,
        }),
      });
      o.grant.bytes = canonicalRecordJson(grant);
    } else {
      const append = (recordType, payload, recordId) => {
        const envelope = createAitmRecordEnvelope({
          repository: o.repository,
          issue: o.issue,
          recordType,
          payload,
          recordId,
          predecessor: o.capsule.head,
          actor: grant.coordinator.actor,
          epoch: 1,
          grantId: grant.grantId,
          createdAt: new Date().toISOString(),
        });
        const bytes = renderAitmRecord({ envelope });
        o.canonicalArchive.records.push({ recordId, bytes });
        o.capsule = { head: recordId, bytes };
      };
      if (state === 'replaced')
        append(
          'coordinator-grant',
          { ...grant, grantId: '01J00000000000000000000006', epoch: 2, issuer: grant.coordinator },
          '01J00000000000000000000007'
        );
      append(
        'coordinator-revocation',
        {
          schema: 'aitm.coordinator-revocation/v1',
          grantId: grant.grantId,
          epoch: 1,
          state,
          ...(state === 'replaced' ? { replacementGrantId: '01J00000000000000000000006' } : {}),
        },
        '01J00000000000000000000008'
      );
    }
    const backend = createRevisionMemory(snapshot),
      before = backend.snapshot;
    assert.equal((await guard(backend)).ok, false);
    await assert.rejects(invoke(backend), /plan-journal|revision-authority-unavailable/);
    assert.deepEqual(writes(backend), []);
    assert.deepEqual(backend.snapshot, before);
  });
test('closed journal data and a copied completed record cannot substitute the private completion token', async () => {
  const { backend } = await fixture();
  backend.failAfter = 'plan-journal-write';
  await assert.rejects(invoke(backend), /interrupted/);
  const snapshot = backend.snapshot;
  const { persistMemoryPlanApproval } =
    await import('../../../../../task-tracker/lib/criteria-revision/store.mjs');
  await assert.rejects(
    persistMemoryPlanApproval({ backend, token: {}, ...snapshot.planJournal }),
    /plan-completion-capability/
  );
  snapshot.planJournal.record.recordId = 'forged';
  assert.notEqual(backend.snapshot.planJournal.record.recordId, 'forged');
  assert.deepEqual(writes(backend), ['plan-journal-write']);
});

for (const kind of ['canonical', 'legacy'])
  test(`${kind} genuinely pending revision cannot acquire Plan approval`, async () => {
    const { backend, context } = await fixture({ revised: true, pending: true, kind });
    assert.equal((await observeRevision({ context, deps: backend })).status, 'pending-before');
    const before = writes(backend);
    assert.equal((await guard(backend)).ok, false);
    const result = await invoke(backend);
    assert.equal(result.status, 'revision-approval-refused');
    assert.equal(result.code, 'pending-before');
    assert.deepEqual(writes(backend), before);
  });
