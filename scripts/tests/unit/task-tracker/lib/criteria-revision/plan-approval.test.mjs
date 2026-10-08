// @story #1855

import { canonicalRecordJson } from '../../../../../task-tracker/lib/github-records/canonical-json.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCanonicalRevisionFixture } from '../../../../fixtures/criteria-revision.mjs';

const approval =
  await import('../../../../../task-tracker/lib/criteria-revision/plan-approval.mjs').catch(
    (error) => {
      if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
      throw error;
    }
  );

test('current Plan approval rejects an old revision even when other bindings match', () => {
  const f = makeCanonicalRevisionFixture();
  assert.equal(typeof approval.validateRevisionPlanApproval, 'function');
  const observation = {
    status: 'applied',
    observation: {
      ...f.observation,
      revisionId: f.proposal.after.revisionId,
      contract: {
        value: JSON.parse(
          f.proposal.writeSet.find((write) => write.resource === 'delivery-contract').afterBytes
        ),
      },
      protectedSourceBindings: f.currentApproval.sourceBindings,
    },
    effectiveProposal: f.proposal,
  };
  assert.doesNotThrow(() => approval.validateRevisionPlanApproval(f.currentApproval, observation));
  assert.throws(() => approval.validateRevisionPlanApproval(f.oldApproval, observation), /binding/);
});
import {
  createIssueDirectory,
  renderIssueDirectory,
} from '../../../../../task-tracker/lib/github-records/issue-directory.mjs';
import { createRevisionMemory } from '../../../../../task-tracker/lib/criteria-revision/store.mjs';

const story =
  '## User Story\nAs a release operator\nI want to stop partial publication because registry checks can fail\nSo that consumers receive complete releases\n\n## Deep-Dive Analysis\n### Story Intent\n- **Beneficiary:** release operator\n- **Capability:** stop partial publication\n- **Need:** registry checks can fail\n- **Value or failure prevented:** consumers receive complete releases\n\n';

function planningMemory({ validStory = true } = {}) {
  const f = makeCanonicalRevisionFixture();
  const observation = structuredClone(f.observation);
  observation.stage = 'plan';
  observation.body.bytes =
    (validStory ? story : '') +
    observation.body.bytes +
    '\n' +
    renderIssueDirectory(
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
  return createRevisionMemory({
    observation,
    comments: [],
    hostMessages: [],
    planning: planningSnapshot(observation),
  });
}

test('canonical baseline approval runs the real Plan source policy and persists current binding', async () => {
  const backend = planningMemory();
  assert.equal(typeof approval.runMemoryPlanApproval, 'function');
  const result = await approval.runMemoryPlanApproval({
    issueNumber: 124,
    cfg: { repo: 'example/criteria' },
    projectDir: process.cwd(),
    backend,
    env: { TT_FULL_AUTO: '1' },
  });
  assert.equal(result.status, 'approved', JSON.stringify(result));
  assert.ok(backend.observation.contract.value.acceptedRecordIds.includes(result.recordId));
});

test('canonical baseline missing story fails normal Plan checks before persistence', async () => {
  const backend = planningMemory({ validStory: false });
  assert.equal(typeof approval.runMemoryPlanApproval, 'function');
  const result = await approval.runMemoryPlanApproval({
    issueNumber: 124,
    cfg: { repo: 'example/criteria' },
    projectDir: process.cwd(),
    backend,
    env: { TT_FULL_AUTO: '1' },
  });
  assert.equal(result.status, 'story-approval-binding-invalid', JSON.stringify(result));
  assert.ok(!backend.effects.some((effect) => effect.endsWith('-write')));
});
import { makeLegacyRevisionFixture } from '../../../../fixtures/criteria-revision.mjs';
import {
  deriveProposal,
  renderApprovalStatement,
} from '../../../../../task-tracker/lib/criteria-revision/proposal.mjs';
import { hashBytes } from '../../../../../task-tracker/lib/criteria-revision/schema.mjs';
import {
  applyRevision,
  observeRevision,
  prepareRevision,
} from '../../../../../task-tracker/lib/criteria-revision/engine.mjs';
import { runPlanApprove } from '../../../../../task-tracker/verbs/plan-approve.mjs';

for (const kind of ['legacy', 'canonical'])
  test(`${kind} revised approval uses normal verb and preserves exact observed applied state`, async () => {
    const f = kind === 'legacy' ? makeLegacyRevisionFixture() : makeCanonicalRevisionFixture();
    f.observation.body.bytes = story + f.observation.body.bytes;
    if (kind === 'canonical')
      f.observation.body.bytes +=
        '\n' +
        renderIssueDirectory(
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
    const proposal = deriveProposal({ ...f.context, observation: f.observation }),
      statement = renderApprovalStatement(proposal);
    const request = {
      ...f.request,
      proposal,
      authorizationSource: { ...f.authorizationSource, statementHash: hashBytes(statement) },
    };
    const backend = createRevisionMemory({
      observation: f.observation,
      comments: [],
      hostMessages: [{ ...f.rawUserMessage, content: [{ type: 'input_text', text: statement }] }],
    });
    const context = {
      repository: f.observation.repository,
      issue: 124,
      executor: f.observation.executor,
    };
    assert.equal((await applyRevision({ context, request, deps: backend })).status, 'applied');
    backend.replacePlanning(planningSnapshot(backend.observation));
    const historical = backend.comments;
    const result = await runPlanApprove({
      issueNumber: 124,
      cfg: { repo: 'example/criteria' },
      projectDir: process.cwd(),
      deps: { revisionBackend: backend, env: { TT_FULL_AUTO: '1' } },
    });
    assert.equal(result.status, 'approved', JSON.stringify(result));
    const current = await observeRevision({ context, deps: backend });
    assert.equal(current.status, 'applied', current.code);
    assert.equal(current.observation.revisionId, proposal.after.revisionId);
    assert.deepEqual(backend.comments.slice(0, historical.length), historical);
    assert.equal(backend.observation.stage, 'develop');
    assert.ok(!backend.observation.body.bytes.includes('aitm-entered-plan'));
    assert.equal((await invoke(backend)).status, 'already-approved');
    const old =
      kind === 'canonical'
        ? canonicalRecordJson(backend.observation.contract.value.acceptanceCriteria[0])
        : backend.observation.body.bytes
            .split('\n')
            .find((line) => line.startsWith('- [ ] Supported model hooks'));
    const next = await prepareRevision({
      context,
      input: {
        mode: 'revision',
        operationId: 'next-after-plan',
        transactionId: 'next-after-plan',
        reason: 'Further supported behavior',
        edits: {
          acceptanceCriteria: [
            {
              operation: 'replace',
              occurrence: 1,
              oldBytes: old,
              oldHash: hashBytes(old),
              replacements: [
                {
                  text: 'Further supported model hooks',
                  declaration: { kind: 'vc-list', vcIds: [kind === 'canonical' ? 'vc-hook' : '1'] },
                },
              ],
            },
          ],
          verificationCommands: [],
        },
      },
      deps: backend,
    });
    assert.equal(next.status, 'prepared', next.code);
    assert.ok(
      next.proposal.invalidation.some(
        (item) => item.kind === 'plan-approval' && item.disposition === 'retired'
      )
    );

    const corrupted = backend.observation;
    corrupted.proofRecords.push({
      kind: 'ac-proof',
      identity: 'unrelated',
      criterionIdentity: null,
      bytes: 'unrelated proof',
    });
    backend.replaceAuthority(corrupted);
    assert.equal((await observeRevision({ context, deps: backend })).status, 'authority-drift');
  });

function planningSnapshot(observation) {
  return {
    schema: 'aitm.memory-planning/v1',
    cfg: { repo: observation.repository },
    repository: observation.repository,
    issue: observation.issue,
    bodyHash: hashBytes(observation.body.bytes),
    epicChildren: [],
    trunkSha: null,
  };
}
import { persistMemoryPlanApproval } from '../../../../../task-tracker/lib/criteria-revision/store.mjs';
import { planApprovedGuard } from '../../../../../task-tracker/lib/plan-approved-guard.mjs';

const invoke = (backend, cfg = { repo: 'example/criteria' }) =>
  runPlanApprove({
    issueNumber: 124,
    cfg,
    projectDir: process.cwd(),
    deps: { revisionBackend: backend, env: { TT_FULL_AUTO: '1' } },
  });

test('baseline approval is idempotent and the real Plan exit guard consumes its capsule', async () => {
  const backend = planningMemory();
  const first = await invoke(backend),
    writes = backend.effects.filter((e) => e.endsWith('-write'));
  assert.equal((await invoke(backend)).status, 'already-approved');
  assert.deepEqual(
    backend.effects.filter((e) => e.endsWith('-write')),
    writes
  );
  const ctx = {
    toState: 'develop',
    body: backend.observation.body.bytes,
    cfg: { gateAnalysisToDevelopment: true },
    deps: { revisionBackend: backend },
  };
  assert.equal((await planApprovedGuard.run(ctx)).ok, true);
  const o = backend.observation;
  o.contract.value.acceptedRecordIds = o.contract.value.acceptedRecordIds.filter(
    (id) => id !== first.recordId
  );
  const { renderDeliveryContract } =
    await import('../../../../../task-tracker/lib/github-records/delivery-contract.mjs');
  o.contract.value.projectionHash = renderDeliveryContract({
    contract: o.contract.value,
  }).projectionHash;
  const { canonicalRecordJson } =
    await import('../../../../../task-tracker/lib/github-records/canonical-json.mjs');
  o.contract.bytes = canonicalRecordJson(o.contract.value);
  backend.replaceAuthority(o);
  assert.equal((await planApprovedGuard.run(ctx)).ok, false);
});

test('private completion rejects direct, forged and caller-provider paths with zero writes', async () => {
  const backend = planningMemory();
  await assert.rejects(approval.finishMemoryPlanApproval({}, {}), /plan-completion-capability/);
  await assert.rejects(
    persistMemoryPlanApproval({
      backend,
      token: {},
      before: backend.observation,
      after: backend.observation,
      audit: 'passed',
      record: {},
    }),
    /plan-completion-capability/
  );
  await assert.rejects(
    runPlanApprove({
      issueNumber: 124,
      cfg: { repo: 'example/criteria' },
      deps: {
        revisionBackend: backend,
        fetchIssueBody: () => {
          throw new Error('remote provider must not run');
        },
      },
    }),
    /plan-provider-override/
  );
  await assert.rejects(invoke({ observation: backend.observation }), /production-quarantined/);
  assert.ok(!backend.effects.some((e) => e.endsWith('-write')));
});

test('missing, foreign and drifted planning snapshots cannot substitute planning evidence', async () => {
  const backend = planningMemory(),
    observation = backend.observation;
  const missing = createRevisionMemory({ observation, comments: [], hostMessages: [] });
  await assert.rejects(invoke(missing), /planning-snapshot-unavailable/);
  backend.replacePlanning({
    ...planningSnapshot(observation),
    repository: 'foreign/repository',
    cfg: { repo: 'foreign/repository' },
  });
  await assert.rejects(invoke(backend), /planning-snapshot-stale/);
  backend.replacePlanning(planningSnapshot(observation));
  const pending = invoke(backend);
  backend.replacePlanning({ ...planningSnapshot(observation), trunkSha: 'a'.repeat(40) });
  await assert.rejects(pending, /planning-snapshot-drift/);
  assert.ok(!backend.effects.some((e) => e.endsWith('-write')));
});

test('normal adaptive forecast and trunk provenance requirements remain effective', async () => {
  const backend = planningMemory();
  backend.replacePlanning({
    ...planningSnapshot(backend.observation),
    cfg: { repo: 'example/criteria', estimationRubricIssue: 42 },
  });
  assert.equal(
    (await invoke(backend, { repo: 'example/criteria', estimationRubricIssue: 42 })).status,
    'forecast-missing'
  );
  backend.replacePlanning(planningSnapshot(backend.observation));
  const o = backend.observation;
  o.body.bytes += '\n<!-- aitm-entered-ready-for-plan ts="2026-09-30T00:00:00Z" -->';
  backend.replaceAuthority(o);
  backend.replacePlanning(planningSnapshot(o));
  await assert.rejects(invoke(backend), /memory-trunk-provenance-unavailable/);
  assert.ok(!backend.effects.some((e) => e.endsWith('-write')));
});

test('bounded reapproval refuses Test, Review and unsupported evidence repair without writes', async () => {
  const backend = planningMemory();
  for (const stage of ['develop', 'test', 'review']) {
    const o = backend.observation;
    o.stage = stage;
    backend.replaceAuthority(o);
    assert.equal((await invoke(backend)).status, 'wrong-state');
  }
  assert.equal(
    (
      await runPlanApprove({
        issueNumber: 124,
        cfg: { repo: 'example/criteria' },
        repairFromEvidence: true,
        deps: { revisionBackend: backend },
      })
    ).status,
    'evidence-repair-refused'
  );
  assert.ok(!backend.effects.some((e) => e.endsWith('-write')));
});

test('required current-revision approval entrypoint reruns normal checks and rejects caller verdicts', async () => {
  const backend = planningMemory(),
    context = {
      repository: 'example/criteria',
      issue: 124,
      executor: backend.observation.executor,
    };
  const observation = await observeRevision({ context, deps: backend });
  assert.equal(typeof approval.approveCurrentRevision, 'function');
  await assert.rejects(
    approval.approveCurrentRevision({
      context,
      observation,
      planningEvidence: { passed: true },
      provenance: { mode: 'full-auto' },
      deps: backend,
    }),
    /planning-evidence/
  );
  const result = await approval.approveCurrentRevision({
    context,
    observation,
    planningEvidence: { cfg: { repo: 'example/criteria' }, projectDir: process.cwd() },
    provenance: { mode: 'full-auto' },
    deps: backend,
  });
  assert.equal(result.status, 'approved');
});

test('required approval wrapper refuses stale observations and snapshot policy downgrade', async () => {
  const backend = planningMemory(),
    context = {
      repository: 'example/criteria',
      issue: 124,
      executor: backend.observation.executor,
    },
    observation = await observeRevision({ context, deps: backend });
  const args = {
    context,
    observation,
    planningEvidence: { cfg: { repo: context.repository }, projectDir: process.cwd() },
    provenance: { mode: 'full-auto' },
    deps: backend,
  };
  await assert.rejects(
    approval.approveCurrentRevision({
      ...args,
      planningEvidence: { ...args.planningEvidence, passed: true },
    }),
    /planning-evidence/
  );
  await assert.rejects(
    approval.approveCurrentRevision({ ...args, provenance: { mode: 'full-auto', approved: true } }),
    /plan-provenance/
  );
  await assert.rejects(
    approval.approveCurrentRevision({
      ...args,
      observation: { ...observation, status: 'applied' },
    }),
    /plan-observation-drift/
  );
  backend.replacePlanning({
    ...planningSnapshot(backend.observation),
    cfg: { repo: context.repository, estimationRubricIssue: 42 },
  });
  await assert.rejects(approval.approveCurrentRevision(args), /planning-config-mismatch/);
  assert.ok(!backend.effects.some((e) => e.endsWith('-write')));
});

test('all recognized memory Plan entrypoints reject foreign source roots before any effects', async () => {
  const backend = planningMemory(),
    context = {
      repository: 'example/criteria',
      issue: 124,
      executor: backend.observation.executor,
    },
    observation = await observeRevision({ context, deps: backend });
  await assert.rejects(
    approval.approveCurrentRevision({
      context,
      observation,
      planningEvidence: {
        cfg: { repo: context.repository },
        projectDir: process.cwd() + '/foreign',
      },
      provenance: { mode: 'full-auto' },
      deps: backend,
    }),
    /planning-evidence/
  );
  await assert.rejects(
    approval.runMemoryPlanApproval({
      issueNumber: 124,
      cfg: { repo: context.repository },
      projectDir: process.cwd() + '/foreign',
      backend,
      env: { TT_FULL_AUTO: '1' },
    }),
    /planning-source-root/
  );
  assert.ok(!backend.effects.some((e) => e.endsWith('-write')));
});
import {
  normalizeRefusal,
  validateBlocker,
} from '../../../../../task-tracker/lib/action-decision/contract.mjs';

test('current authority guard returns closed typed indeterminate refusals for absent, failed and unsupported authority', async () => {
  const missing = planningMemory();
  const cases = [
    {
      deps: {
        get revisionBackend() {
          throw new Error('backend unavailable');
        },
      },
      body: '',
      reason: 'current-approval-unverified',
    },
    {
      deps: { revisionBackend: missing },
      body: missing.observation.body.bytes,
      reason: 'current-approval-unverified',
    },
    { deps: { revisionBackend: {} }, body: '', reason: 'current-approval-unverified' },
    {
      deps: {
        revisionBackend: {
          get observation() {
            throw new Error('observation unavailable');
          },
        },
      },
      body: '',
      reason: 'current-approval-unverified',
    },
    { deps: {}, body: missing.observation.body.bytes, reason: 'runtime-unregistered' },
    {
      deps: {},
      body: '<!-- aitm-criteria-revision schema="aitm.criteria-revision/v1" -->',
      reason: 'runtime-unregistered',
    },
    { deps: {}, body: '<!-- aitm-directory\n{ not-json }\n-->', reason: 'directory-invalid' },
  ];
  for (const entry of cases) {
    const result = await planApprovedGuard.run({
      toState: 'develop',
      cfg: { gateAnalysisToDevelopment: true },
      body: entry.body,
      deps: entry.deps,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'plan-approval-authority-unavailable');
    assert.deepEqual(result.args, { reason: entry.reason });
    assert.deepEqual(result.noAutomaticRemediation, { reason: 'authority-investigation-required' });
    const blocker = normalizeRefusal(result, {
      guardId: 'plan-exit-plan-approved',
      registeredGuardIds: ['plan-exit-plan-approved'],
    });
    assert.deepEqual(validateBlocker(blocker, { status: 'indeterminate' }), blocker);
    assert.throws(() => validateBlocker(blocker, { status: 'blocked' }), /status/);
    assert.throws(
      () =>
        validateBlocker(
          { ...blocker, args: { reason: 'assumed-approved' } },
          { status: 'indeterminate' }
        ),
      /args/
    );
    assert.throws(
      () =>
        validateBlocker(
          { ...blocker, args: { ...blocker.args, approved: true } },
          { status: 'indeterminate' }
        ),
      /args/
    );
    assert.throws(
      () =>
        validateBlocker(
          { ...blocker, guardId: 'plan-exit-deep-dive' },
          { status: 'indeterminate' }
        ),
      /producer/
    );
  }
  assert.deepEqual(
    missing.effects.filter((e) => e.endsWith('-write')),
    []
  );
  assert.equal((await invoke(missing)).status, 'approved');
  assert.deepEqual(
    await planApprovedGuard.run({
      toState: 'develop',
      cfg: { gateAnalysisToDevelopment: true },
      deps: { revisionBackend: missing },
    }),
    { ok: true }
  );
});
