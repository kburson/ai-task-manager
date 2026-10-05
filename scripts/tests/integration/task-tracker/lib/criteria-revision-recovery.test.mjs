// @story #1853
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { makeLegacyRevisionFixture } from '../../../fixtures/criteria-revision.mjs';
import {
  deriveProposal,
  renderApprovalStatement,
} from '../../../../task-tracker/lib/criteria-revision/proposal.mjs';
import {
  hashBytes,
  validateRevisionRequest,
} from '../../../../task-tracker/lib/criteria-revision/schema.mjs';
import { mutateIssueBody } from '../../../../task-tracker/lib/issue-body-mutate.mjs';
import { versionedWriteBody } from '../../../../task-tracker/lib/versioned-issue-write.mjs';
import { COMMAND_CATALOG } from '../../../../task-tracker/lib/command-surface/catalog.mjs';
import { listLifecycleActions } from '../../../../task-tracker/lib/lifecycle-policy/actions.mjs';
const engine = await import('../../../../task-tracker/lib/criteria-revision/engine.mjs').catch(
  (e) => {
    if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw e;
  }
);
const store = await import('../../../../task-tracker/lib/criteria-revision/store.mjs').catch(
  (e) => {
    if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw e;
  }
);
const records = await import('../../../../task-tracker/lib/criteria-revision/records.mjs').catch(
  (e) => {
    if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw e;
  }
);
function createRecordedTransport(scenario) {
  assert.equal(typeof store.createRevisionMemory, 'function');
  // The test owns the initial data and fault schedule; the shipped backend owns
  // its memory store. No injected function can wire this execution to GitHub.
  return store.createRevisionMemory({
    observation: scenario.observation,
    comments: [],
    hostMessages: [scenario.rawUserMessage],
  });
}
function fixture() {
  const scenario = makeLegacyRevisionFixture(),
    deps = createRecordedTransport(scenario);
  const context = {
    repository: scenario.observation.repository,
    issue: scenario.observation.issue,
    executor: scenario.observation.executor,
  };
  return { ...scenario, context, deps };
}
function approve(f, proposal, messageId = 'recovery-message') {
  const statement = renderApprovalStatement(proposal);
  const authorizationSource = {
    ...f.authorizationSource,
    sessionId: proposal.executor.sessionId,
    messageId,
    statementHash: hashBytes(statement),
  };
  f.deps.addHostMessage({
    ...f.rawUserMessage,
    id: messageId,
    sessionId: proposal.executor.sessionId,
    content: [{ type: 'input_text', text: statement }],
  });
  return {
    schema: 'aitm.criteria-revision/v1',
    action: proposal.mode === 'revision' ? 'apply' : 'recover',
    proposal,
    authorizationSource,
  };
}
async function prepare(
  f,
  mode,
  operationId = 'op-2',
  edits = { acceptanceCriteria: [], verificationCommands: [] }
) {
  return engine.prepareRevision({
    context: f.context,
    input: { mode, operationId, transactionId: 'tx-1', reason: 'Explicit recovery', edits },
    deps: f.deps,
  });
}
test('interrupted body write resumes original operation exactly once without duplicating archive', async () => {
  const f = fixture();
  f.deps.failAfter = 'body-write';
  await assert.rejects(
    engine.applyRevision({ context: f.context, request: f.request, deps: f.deps }),
    /interrupted/
  );
  const pending = await engine.observeRevision({ context: f.context, deps: f.deps });
  assert.equal(pending.status, 'pending-after');
  const terminal = await engine.recoverRevision({
    context: f.context,
    request: f.request,
    deps: f.deps,
  });
  assert.equal(terminal.status, 'applied');
  assert.equal(f.deps.createdEvents.filter((e) => e.type === 'prepared').length, 1);
  assert.equal(f.deps.createdEvents.filter((e) => e.type === 'recovery-authorized').length, 0);
  assert.equal(f.deps.effects.filter((e) => e === 'body-write').length, 1);
  assert.equal(f.deps.admission.state, 'deny');
  assert.ok(
    f.deps.effects.indexOf('admission-deny') < f.deps.effects.indexOf('event-write:prepared')
  );
});
for (const step of [
  'event-write:prepared',
  'event-readback:prepared',
  'body-write',
  'body-readback',
  'event-write:applied',
  'event-readback:applied',
])
  test(`lost response at ${step} retries same identity without duplicate effects`, async () => {
    const f = fixture();
    f.deps.failAfter = step;
    await assert.rejects(
      engine.applyRevision({ context: f.context, request: f.request, deps: f.deps }),
      /interrupted/
    );
    const result = await engine.recoverRevision({
      context: f.context,
      request: f.request,
      deps: f.deps,
    });
    assert.equal(result.status, 'applied');
    assert.equal(f.deps.createdEvents.filter((e) => e.type === 'prepared').length, 1);
    assert.equal(f.deps.createdEvents.filter((e) => e.type === 'applied').length, 1);
    assert.equal(f.deps.effects.filter((e) => e === 'body-write').length, 1);
  });
test('failed preparation proved absent leaves no event and retries normally', async () => {
  const f = fixture();
  f.deps.failBefore = 'event-write:prepared';
  await assert.rejects(
    engine.applyRevision({ context: f.context, request: f.request, deps: f.deps }),
    /interrupted/
  );
  assert.equal(
    (await engine.observeRevision({ context: f.context, deps: f.deps })).status,
    'empty'
  );
  assert.equal(f.deps.createdEvents.length, 0);
  assert.equal(
    (await engine.applyRevision({ context: f.context, request: f.request, deps: f.deps })).status,
    'applied'
  );
});
test('lost pages, duplicate events, malformed archive and stale source fail closed before body effects', async () => {
  for (const fault of ['page-read', 'authority-read']) {
    const f = fixture();
    f.deps.failBefore = fault;
    assert.equal(
      (await engine.observeRevision({ context: f.context, deps: f.deps })).status,
      'indeterminate'
    );
    assert.equal(f.deps.effects.includes('body-write'), false);
  }
  const f = fixture();
  f.deps.failAfter = 'event-write:prepared';
  await assert.rejects(
    engine.applyRevision({ context: f.context, request: f.request, deps: f.deps })
  );
  f.deps.addComment({ ...f.deps.comments[0], id: 'duplicate' });
  assert.equal(
    (await engine.observeRevision({ context: f.context, deps: f.deps })).status,
    'indeterminate'
  );
  assert.equal(
    (await engine.recoverRevision({ context: f.context, request: f.request, deps: f.deps })).status,
    'refused'
  );
});
test('new executor resume seals the existing after bytes, IDs and revision against the current vector', async () => {
  const f = fixture();
  f.deps.failAfter = 'body-write';
  await assert.rejects(
    engine.applyRevision({ context: f.context, request: f.request, deps: f.deps })
  );
  const current = f.deps.observation;
  current.executor = { ...current.executor, sessionId: 'successor' };
  f.deps.replaceAuthority(current);
  f.context = { ...f.context, executor: current.executor };
  const prepared = await prepare(f, 'resume');
  assert.equal(prepared.status, 'prepared');
  assert.deepEqual(prepared.proposal.writeSet, f.proposal.writeSet);
  assert.deepEqual(prepared.proposal.after, f.proposal.after);
  assert.deepEqual(prepared.proposal.identityMap, f.proposal.identityMap);
  const request = approve(f, prepared.proposal);
  validateRevisionRequest(request);
  const resumed = await engine.recoverRevision({ context: f.context, request, deps: f.deps });
  assert.equal(resumed.status, 'applied', JSON.stringify(resumed));
  assert.equal(f.deps.effects.filter((e) => e === 'body-write').length, 1);
  assert.equal(f.deps.createdEvents.filter((e) => e.type === 'recovery-authorized').length, 1);
  assert.equal(f.deps.createdEvents.at(-1).operationId, 'op-2');
  assert.equal(
    (
      await engine.recoverRevision({
        context: { ...f.context, executor: f.proposal.executor },
        request: f.request,
        deps: f.deps,
      })
    ).status,
    'refused'
  );
});
test('abort requires exact untouched original authority and explicit new approval', async () => {
  const f = fixture();
  f.deps.failAfter = 'event-write:prepared';
  await assert.rejects(
    engine.applyRevision({ context: f.context, request: f.request, deps: f.deps })
  );
  const p = await prepare(f, 'abort');
  const request = approve(f, p.proposal);
  assert.equal(
    (await engine.recoverRevision({ context: f.context, request, deps: f.deps })).status,
    'aborted'
  );
  assert.equal(f.deps.observation.body.bytes, f.observation.body.bytes);
  const changed = fixture();
  changed.deps.failAfter = 'body-write';
  await assert.rejects(
    engine.applyRevision({ context: changed.context, request: changed.request, deps: changed.deps })
  );
  assert.equal((await prepare(changed, 'abort')).status, 'refused');
});
test('unrelated authority drift refuses original retry and never reverses retired proof', async () => {
  const f = fixture();
  f.deps.failAfter = 'body-write';
  await assert.rejects(
    engine.applyRevision({ context: f.context, request: f.request, deps: f.deps })
  );
  const current = f.deps.observation;
  current.protectedSourceBindings[0].hash = hashBytes('changed source');
  f.deps.replaceAuthority(current);
  assert.equal(
    (await engine.observeRevision({ context: f.context, deps: f.deps })).status,
    'pending-drift'
  );
  assert.equal(
    (await engine.recoverRevision({ context: f.context, request: f.request, deps: f.deps })).status,
    'refused'
  );
  assert.equal(f.deps.observation.body.bytes.includes('aitm-plan-approved'), false);
});
test('fresh pagination collector rejects missing pages and duplicate comment identities', async () => {
  assert.equal(typeof store.readRevisionChain, 'function');
  const context = { repository: 'example/criteria', issue: 124 };
  for (const page of [
    { page: 1, totalCount: 2, nextPage: null, comments: [] },
    { page: 2, totalCount: 0, nextPage: null, comments: [] },
  ])
    await assert.rejects(
      store.readRevisionChain({ context, transport: { readCommentPage: async () => page } })
    );
});
test('shipped deep-import engine and body adapters cannot reach production using forged deps/capabilities', async () => {
  assert.equal(typeof engine.applyRevision, 'function');
  const require = createRequire(import.meta.url);
  const path =
    require.resolve('ai-task-manager/scripts/task-tracker/lib/criteria-revision/engine.mjs');
  const shipped = await import(pathToFileURL(path));
  const f = makeLegacyRevisionFixture();
  let effects = 0;
  for (const deps of [
    undefined,
    {},
    {
      transport: {
        createComment() {
          effects++;
        },
      },
      loadUserMessage() {
        effects++;
      },
    },
    { revisionBackend: true, ports: {} },
  ]) {
    assert.equal(
      (await shipped.applyRevision({ context: f.context, request: f.request, deps })).status,
      'refused'
    );
    assert.equal(
      (await shipped.recoverRevision({ context: f.context, request: f.request, deps })).status,
      'refused'
    );
  }
  for (const writer of [mutateIssueBody, versionedWriteBody])
    await assert.rejects(
      writer({
        repo: 'example/criteria',
        issueNumber: 124,
        mutate: () => f.proposal.writeSet[0].afterBytes,
        criteriaRevisionCapability: {},
        deps: {
          fetchBody: async () => {
            effects++;
            return f.observation.body.bytes;
          },
          pushBody: async () => effects++,
        },
      }),
      /revision/
    );
  assert.equal(effects, 0);
  assert.equal(
    COMMAND_CATALOG.some((x) => x.name.startsWith('criteria-revise')),
    false
  );
  assert.equal(
    listLifecycleActions().some((x) => x.id.startsWith('criteria-revise')),
    false
  );
});
test('before-approval preview is non-publishable; real unbounded principal is measured before locks', async () => {
  const f = fixture();
  const input = {
    mode: 'revision',
    operationId: 'op-1',
    transactionId: 'tx-1',
    reason: f.proposal.reason,
    edits: f.edits,
  };
  const preview = await engine.prepareRevision({ context: f.context, input, deps: f.deps });
  assert.equal(preview.status, 'prepared');
  assert.equal(preview.publishable, false);
  assert.equal(preview.rendering, 'non-publishable-preview');
  const exact = await engine.prepareRevision({
    context: f.context,
    input: { ...input, authorizationSource: f.authorizationSource },
    deps: f.deps,
  });
  assert.equal(exact.status, 'prepared');
  assert.equal(exact.publishable, true);
  assert.equal(exact.size, Buffer.byteLength(exact.rendered));
  const raw = { ...f.rawUserMessage, principal: '界'.repeat(30000) };
  const deps = store.createRevisionMemory({
    observation: f.observation,
    comments: [],
    hostMessages: [raw],
  });
  const result = await engine.applyRevision({ context: f.context, request: f.request, deps });
  assert.equal(result.status, 'refused');
  assert.match(result.code, /archive-too-large/);
  assert.equal(
    deps.effects.some(
      (x) => x === 'admission-deny' || x.startsWith('event-write') || x === 'body-write'
    ),
    false
  );
});
test('body capabilities cannot cross backends, execute forged proof, drop sections or fall through to GitHub', async () => {
  const f = fixture();
  const { withLegacyWriteCapability } =
    await import('../../../../task-tracker/lib/criteria-revision/legacy.mjs');
  let escaped;
  let callbacks = 0;
  await store.withMemoryInterlock(f.deps, f.context, async (capability) => {
    await withLegacyWriteCapability(
      {
        backend: f.deps,
        capability,
        context: f.context,
        proposal: f.proposal,
        before: f.observation.body.bytes,
      },
      async (token) => {
        escaped = token;
        for (const writer of [mutateIssueBody, versionedWriteBody]) {
          for (const deps of [
            {},
            { revisionBackend: createRecordedTransport(f) },
            { revisionBackend: f.deps, pushBody: () => callbacks++ },
          ]) {
            await assert.rejects(
              writer({
                repo: f.context.repository,
                issueNumber: f.context.issue,
                criteriaRevisionCapability: token,
                deps,
                mutate: () => f.proposal.writeSet[0].afterBytes,
              }),
              /revision/
            );
          }
          for (const after of [
            f.proposal.writeSet[0].afterBytes + '\n<!-- aitm-test-verified sha="fake" -->',
            f.proposal.writeSet[0].afterBytes.replace('## Scope', '## Removed scope'),
          ])
            await assert.rejects(
              writer({
                repo: f.context.repository,
                issueNumber: f.context.issue,
                criteriaRevisionCapability: token,
                deps: { revisionBackend: f.deps },
                mutate: () => after,
              }),
              /revision/
            );
        }
      }
    );
  });
  await assert.rejects(
    versionedWriteBody({
      repo: f.context.repository,
      issueNumber: f.context.issue,
      criteriaRevisionCapability: escaped,
      deps: { revisionBackend: f.deps },
      mutate: () => f.proposal.writeSet[0].afterBytes,
    }),
    /revision/
  );
  assert.equal(callbacks, 0);
  assert.equal(f.deps.effects.includes('body-write'), false);
});
test('authorization injection, inactive stage, transition and mixed writers refuse before preparation', async () => {
  for (const patch of [
    { stage: 'test' },
    { stage: 'review' },
    { issueState: 'closed' },
    { delivery: { state: 'delivered', records: [] } },
  ]) {
    const f = fixture(),
      o = f.deps.observation;
    Object.assign(o, patch);
    f.deps.replaceAuthority(o);
    assert.equal(
      (await engine.applyRevision({ context: f.context, request: f.request, deps: f.deps })).status,
      'refused'
    );
    assert.equal(f.deps.createdEvents.length, 0);
  }
  for (const field of ['lifecycleTransition', 'supportedWriters']) {
    const f = fixture();
    f.deps[field] = field === 'lifecycleTransition';
    assert.equal(
      (await engine.applyRevision({ context: f.context, request: f.request, deps: f.deps })).status,
      'refused'
    );
    assert.equal(f.deps.createdEvents.length, 0);
  }
  const f = fixture();
  const forged = { ...f.request, loadUserMessage: () => f.rawUserMessage };
  assert.equal(
    (await engine.applyRevision({ context: f.context, request: forged, deps: f.deps })).status,
    'refused'
  );
});
test('authorized forward repair becomes the effective target across a later successor resume', async () => {
  const f = fixture();
  f.deps.failAfter = 'body-write';
  await assert.rejects(
    engine.applyRevision({ context: f.context, request: f.request, deps: f.deps })
  );
  const old = f.deps.observation.body.bytes
    .split('\n')
    .find((x) => x.startsWith('- [ ] Supported model hooks'));
  const edits = {
    acceptanceCriteria: [
      {
        operation: 'replace',
        occurrence: 1,
        oldBytes: old,
        oldHash: hashBytes(old),
        replacements: [
          { text: 'Repaired model hooks', declaration: { kind: 'vc-list', vcIds: ['1'] } },
        ],
      },
    ],
    verificationCommands: [],
  };
  const prepared = await prepare(f, 'forward-repair', 'repair-2', edits);
  assert.equal(prepared.status, 'prepared', JSON.stringify(prepared));
  const request = approve(f, prepared.proposal, 'repair-message');
  f.deps.failAfter = 'event-write:recovery-authorized';
  await assert.rejects(
    engine.recoverRevision({ context: f.context, request, deps: f.deps }),
    /interrupted/
  );
  const next = await prepare(f, 'resume', 'resume-3');
  assert.equal(next.status, 'prepared', JSON.stringify(next));
  assert.deepEqual(next.proposal.writeSet, prepared.proposal.writeSet);
  assert.deepEqual(next.proposal.after, prepared.proposal.after);
  assert.equal(
    (
      await engine.recoverRevision({
        context: f.context,
        request: approve(f, next.proposal, 'resume-third'),
        deps: f.deps,
      })
    ).status,
    'applied'
  );
  assert.ok(f.deps.observation.body.bytes.includes('Repaired model hooks'));
  assert.equal(f.deps.observation.body.bytes.includes('aitm-plan-approved'), false);
  assert.equal(f.deps.createdEvents.filter((e) => e.type === 'prepared').length, 1);
  const end = f.deps.createdEvents.at(-1);
  assert.equal(end.operationId, 'resume-3');
  assert.equal(end.outcome.originalDigest, f.proposal.after.semanticContractDigest);
  assert.equal(end.outcome.effectiveDigest, prepared.proposal.after.semanticContractDigest);
});
test('a later distinct revision follows the verified terminal and preserves complete chain authority', async () => {
  const f = fixture();
  assert.equal(
    (await engine.applyRevision({ context: f.context, request: f.request, deps: f.deps })).status,
    'applied'
  );
  const old = f.deps.observation.body.bytes
    .split('\n')
    .find((x) => x.startsWith('- [ ] Supported model hooks'));
  const edits = {
    acceptanceCriteria: [
      {
        operation: 'replace',
        occurrence: 1,
        oldBytes: old,
        oldHash: hashBytes(old),
        replacements: [
          { text: 'Next model hooks', declaration: { kind: 'vc-list', vcIds: ['1'] } },
        ],
      },
    ],
    verificationCommands: [],
  };
  const prepared = await engine.prepareRevision({
    context: f.context,
    input: {
      mode: 'revision',
      transactionId: 'tx-2',
      operationId: 'revision-2',
      reason: 'Next requirement',
      edits,
    },
    deps: f.deps,
  });
  assert.equal(prepared.status, 'prepared', JSON.stringify(prepared));
  const result = await engine.applyRevision({
    context: f.context,
    request: approve(f, prepared.proposal, 'second-approval'),
    deps: f.deps,
  });
  assert.equal(result.status, 'applied', JSON.stringify(result));
  assert.equal(f.deps.createdEvents.length, 4);
});
test('complete collector follows every page and refuses missing, duplicate and hash-mismatched referenced archives', async () => {
  const f = fixture();
  f.deps.pageSize = 1;
  f.deps.addComment({ id: 'unrelated', body: 'Ordinary comment' });
  f.deps.failAfter = 'event-write:prepared';
  await assert.rejects(
    engine.applyRevision({ context: f.context, request: f.request, deps: f.deps })
  );
  const p = await prepare(f, 'resume');
  f.deps.failAfter = 'event-write:recovery-authorized';
  await assert.rejects(
    engine.recoverRevision({ context: f.context, request: approve(f, p.proposal), deps: f.deps })
  );
  const comments = f.deps.comments;
  const missing = store.createRevisionMemory({
    observation: f.deps.observation,
    comments: comments.filter((c) => !c.body.includes('"type":"prepared"')),
    hostMessages: [f.rawUserMessage],
  });
  assert.equal(
    (await engine.observeRevision({ context: f.context, deps: missing })).status,
    'indeterminate'
  );
  const tampered = structuredClone(comments);
  const root = tampered.find((c) => c.body.includes('"type":"prepared"'));
  root.body = root.body.replace('Replace obsolete model hooks', 'Changed obsolete model hooks');
  const bad = store.createRevisionMemory({
    observation: f.deps.observation,
    comments: tampered,
    hostMessages: [f.rawUserMessage],
  });
  assert.equal(
    (await engine.observeRevision({ context: f.context, deps: bad })).status,
    'indeterminate'
  );
  f.deps.pageFault = { nextPage: null };
  assert.equal(
    (await engine.observeRevision({ context: f.context, deps: f.deps })).status,
    'indeterminate'
  );
});
test('runtime writer-domain drift cannot continue an original approved pending operation', async () => {
  const f = fixture();
  f.deps.failAfter = 'body-write';
  await assert.rejects(
    engine.applyRevision({ context: f.context, request: f.request, deps: f.deps })
  );
  const o = f.deps.observation;
  o.writerDomain.hostId = 'foreign-host';
  f.deps.replaceAuthority(o);
  const result = await engine.recoverRevision({
    context: f.context,
    request: f.request,
    deps: f.deps,
  });
  assert.equal(result.status, 'refused', JSON.stringify(result));
  assert.equal(f.deps.createdEvents.at(-1).type, 'prepared');
});
test('forward repair under changed source bindings retires previously preserved individual proof', async () => {
  const f = fixture();
  f.deps.failAfter = 'body-write';
  await assert.rejects(
    engine.applyRevision({ context: f.context, request: f.request, deps: f.deps })
  );
  const o = f.deps.observation;
  o.protectedSourceBindings[0].hash = hashBytes('new source authority');
  f.deps.replaceAuthority(o);
  const old = o.body.bytes.split('\n').find((x) => x.startsWith('- [ ] Supported model hooks'));
  const edits = {
    acceptanceCriteria: [
      {
        operation: 'replace',
        occurrence: 1,
        oldBytes: old,
        oldHash: hashBytes(old),
        replacements: [
          { text: 'Repaired source hooks', declaration: { kind: 'vc-list', vcIds: ['1'] } },
        ],
      },
    ],
    verificationCommands: [],
  };
  const prepared = await prepare(f, 'forward-repair', 'source-repair', edits);
  assert.equal(prepared.status, 'prepared', JSON.stringify(prepared));
  const independent = prepared.proposal.archive.definitions.find(
    (d) => d.text === 'Independent requirement'
  );
  assert.equal(
    prepared.proposal.invalidation.find((x) => x.criterionIdentity === independent.identity)
      .disposition,
    'retired'
  );
  const result = await engine.recoverRevision({
    context: f.context,
    request: approve(f, prepared.proposal, 'source-repair-message'),
    deps: f.deps,
  });
  assert.equal(result.status, 'applied', JSON.stringify(result));
  assert.match(f.deps.observation.body.bytes, /- \[ \] Independent requirement/);
});
test('fresh non-body authority drift keeps the pending fence even when body and event head match', async () => {
  const f = fixture();
  f.deps.failAfter = 'body-write';
  await assert.rejects(
    engine.applyRevision({ context: f.context, request: f.request, deps: f.deps })
  );
  const o = f.deps.observation;
  o.proofRecords.push({
    kind: 'test',
    identity: 'unexpected-current-test',
    bytes: 'new external authority',
    criterionIdentity: null,
  });
  f.deps.replaceAuthority(o);
  const pending = await engine.observeRevision({ context: f.context, deps: f.deps });
  assert.equal(pending.status, 'pending-drift');
  assert.equal(
    (await engine.recoverRevision({ context: f.context, request: f.request, deps: f.deps })).status,
    'refused'
  );
});
test('unplanned delivery authority refuses new proposals, resume and terminal revalidation', async () => {
  for (const phase of ['before', 'prepared', 'applied']) {
    const f = fixture();
    if (phase === 'prepared') {
      f.deps.failAfter = 'body-write';
      await assert.rejects(
        engine.applyRevision({ context: f.context, request: f.request, deps: f.deps })
      );
    }
    if (phase === 'applied')
      assert.equal(
        (await engine.applyRevision({ context: f.context, request: f.request, deps: f.deps }))
          .status,
        'applied'
      );
    const o = f.deps.observation;
    o.delivery.records.push({
      identity: 'unexpected-delivery',
      bytes: 'actual remote delivery bytes',
    });
    f.deps.replaceAuthority(o);
    const effects = f.deps.effects.length;
    const result = await engine.applyRevision({
      context: f.context,
      request: f.request,
      deps: f.deps,
    });
    assert.equal(result.status, 'refused', phase);
    if (phase === 'prepared') assert.equal((await prepare(f, 'resume')).status, 'refused');
    assert.equal(
      f.deps.effects.slice(effects).some((x) => x.startsWith('event-write') || x === 'body-write'),
      false
    );
  }
});
