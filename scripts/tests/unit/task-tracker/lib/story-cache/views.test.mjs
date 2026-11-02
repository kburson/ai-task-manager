// @story #2049
import { registerStoryViewRecoveryCases } from '../../../../helpers/story-view-recovery-cases.mjs';
registerStoryViewRecoveryCases();
import {
  registerStoryViewAuthorityCases,
  registerStoryViewIdentityCases,
} from '../../../../helpers/story-view-authority-cases.mjs';
registerStoryViewAuthorityCases();
registerStoryViewIdentityCases();
import assert from 'node:assert/strict';
import { identity } from '../../../../helpers/story-timing-candidate-fixture.mjs';
import { fixture as authorityFixture } from '../decomposition-authority-fixtures.mjs';
import {
  test,
  fixture,
  changeGeneration,
} from '../../../../helpers/story-timing-candidate-fixture.mjs';
import { setIssue } from '../../../../helpers/story-batch-fixture.mjs';
const views = await import('../../../../../task-tracker/lib/story-cache/views.mjs').catch((e) => {
  if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
  return {};
});

test('working content and published observation remain separate without granting freshness', async (t) => {
  assert.equal(typeof views.storyView, 'function');
  const f = await fixture(t);
  await changeGeneration(f, (g, p) =>
    setIssue(g, p, 'published approved scope', 'staged changed scope')
  );
  const generation = await f.store.readGeneration();
  const working = views.storyView({ generation, authority: 'working' });
  const published = views.storyView({ generation, authority: 'published' });
  assert.equal(working.body, 'staged changed scope');
  assert.equal(published.body, 'published approved scope');
  assert.equal(working.fresh, false);
  assert.equal(published.fresh, false);
  assert.equal(working.publication.status, 'dirty');
  assert.deepEqual(working.publication.dirtyKeys, ['issue:I_test']);
  assert.equal(working.completionVerified, false);
  assert.equal(published.completionVerified, false);
});

test('explicit authority is mandatory and missing cache never fabricates content', () => {
  assert.equal(typeof views.storyView, 'function');
  assert.throws(() => views.storyView({ generation: null, authority: 'working' }), /generation/);
  assert.throws(() => views.storyView({ authority: 'automatic' }), /authority/);
});

test('exact validated bytes are detached and checksum failures refuse', async (t) => {
  assert.equal(typeof views.storyView, 'function');
  const f = await fixture(t);
  const generation = await f.store.readGeneration();
  const v = views.storyView({ generation, authority: 'working' });
  const ref = generation.generation.working['issue:I_test'];
  generation.payloads.get(ref.payloadPath).fill(0);
  assert.notEqual(v.body, '\0'.repeat(v.body.length));
  assert.throws(() => views.storyView({ generation, authority: 'working' }), /checksum/);
  assert.equal(Object.isFrozen(v), true);
  assert.equal(Object.isFrozen(v.publication.dirtyKeys), true);
});

test('native guard input remains the current observed published body despite local approval edits', async (t) => {
  assert.equal(typeof views.publishedStoryBody, 'function');
  const f = await fixture(t);
  const generation = await f.store.readGeneration();
  const body =
    '<!-- aitm-last-known-state state="develop" ts="2026-10-19T12:00:00Z" -->\nactual current authority';
  assert.equal(
    views.publishedStoryBody({ body, generation, repository: 'owner/repo', issue: 2057 }),
    body
  );
  assert.throws(
    () => views.publishedStoryBody({ body, generation, repository: 'foreign/repo', issue: 2057 }),
    /identity/
  );
  assert.equal(views.publishedStoryBody({ body, repository: 'owner/repo', issue: 2057 }), body);
});

test('view readers do not call payload conversion, overridden maps or accessors', async (t) => {
  assert.equal(typeof views.storyView, 'function');
  const f = await fixture(t);
  const generation = await f.store.readGeneration();
  let calls = 0;
  const bytes = generation.payloads.get(generation.generation.working['issue:I_test'].payloadPath);
  bytes.valueOf = () => {
    calls++;
    return Buffer.from('substituted');
  };
  const view = views.storyView({ generation, authority: 'working' });
  assert.equal(calls, 0);
  assert.notEqual(view.body, 'substituted');
  generation.payloads.get = () => {
    calls++;
    return 'substituted';
  };
  assert.throws(() => views.storyView({ generation, authority: 'working' }), /payload-map/);
  assert.equal(calls, 0);
});

test('session readiness refuses unrelated cache identity and keeps one fresh body observation', async (t) => {
  const { evaluateSessionReadiness } =
    await import('../../../../../task-tracker/lib/action-decision/session.mjs');
  const f = await fixture(t);
  const record = await f.store.readGeneration();
  let bodies = 0;
  let generations = 0;
  const args = {
    actionId: 'bind',
    issue: 2057,
    stateBefore: { active: null, paused: false },
    config: { repo: 'foreign/repo', preferences: { gateAssigneeMatch: false } },
    projectDir: '/controlled',
    invokingDir: '/controlled',
    deps: {
      readIssueBody: async () => {
        bodies++;
        return authorityFixture().body;
      },
      readStoryGeneration: async () => {
        generations++;
        return record;
      },
      fetchAssignmentSnapshot: async () => ({ state: 'develop', assignees: [] }),
      readWorktreeIdentity: () => ({ worktreePath: '/controlled' }),
      resolveProjectDir: () => '/controlled',
      readOccupancy: () => ({}),
      findMainWorktreePath: () => '/controlled',
      currentSessionId: () => 'controlled',
      loadMigrationJournal: () => null,
    },
  };
  const result = await evaluateSessionReadiness(args);
  assert.equal(result.status, 'indeterminate');
  assert.equal(bodies, 1);
  assert.equal(generations, 1);
  assert.ok(result.blockers.some((b) => b.args.source === 'issue-body'));
});

test('Explain diagnostics expose cache publication state and real recovery API without altering readiness', async (t) => {
  assert.equal(typeof views.storyViewDiagnostic, 'function');
  const f = await fixture(t);
  const generation = await f.store.readGeneration();
  const message = views.storyViewDiagnostic({
    generation,
    identity,
    repository: 'owner/repo',
    issue: 2057,
  });
  assert.equal(message.guardId, 'authority-collection');
  assert.equal(message.untrusted, true);
  const data = JSON.parse(message.text);
  assert.equal(data.authority, 'published');
  assert.equal(data.fresh, false);
  assert.equal(data.publication.status, 'dirty');
  assert.equal(data.publication.recovery, null);
});

for (const mode of ['uncertain', 'conflict'])
  test(
    'real native coordinator ' + mode + ' remains visible without completion authority',
    async (t) => {
      const { nativePlanFixture } =
        await import('../../../../helpers/native-plan-transition-fixture.mjs');
      const { observeContent } =
        await import('../../../../../task-tracker/lib/story-cache/native-observation.mjs');
      const f = await nativePlanFixture(t);
      if (mode === 'uncertain')
        f.ports.apply = async () => {
          throw new Error('timeout: request can still arrive');
        };
      else {
        const key = 'issue:' + f.cloud.identity.issueNodeId;
        f.cloud.resources[key] = {
          ...observeContent({
            identity: f.cloud.identity,
            node: {
              id: f.cloud.identity.issueNodeId,
              lastEditedAt: null,
              includesCreatedEdit: false,
              userContentEdits: { totalCount: 0, nodes: [] },
            },
            body: f.cloud.resources[key].body + '\nexternal change',
          }),
          ownership: 'owned',
        };
      }
      const result = await f.run();
      assert.equal(result.status, mode);
      const generation = await f.store.readGeneration();
      const before = generation.manifest.payloadDigest;
      const view = views.storyView({ generation, authority: 'published' });
      assert.equal(view.publication.status, mode);
      if (mode === 'uncertain')
        assert.deepEqual(view.publication.recovery, {
          operation: 'recoverStoryBatch',
          allowMutation: false,
          completesTransition: false,
        });
      else {
        assert.equal(view.publication.recovery.operation, null);
        assert.equal(view.publication.recovery.kind, 'manual-intervention');
      }
      assert.equal(view.completionVerified, false);
      assert.equal((await f.store.readGeneration()).manifest.payloadDigest, before);
    }
  );

test('malformed v2 approval envelopes refuse instead of silently becoming Markdown', async (t) => {
  const f = await fixture(t);
  const stored = await f.store.readGeneration();
  const generation = {
    manifest: structuredClone(stored.manifest),
    generation: structuredClone(stored.generation),
    payloads: new Map(stored.payloads),
  };
  // Adversarial in-memory record with consistent hashes, not a native publication.
  const { canonicalRecordJson } =
    await import('../../../../../task-tracker/lib/github-records/canonical-json.mjs');
  const { createHash } = await import('node:crypto');
  const hash = (v) => createHash('sha256').update(v).digest('hex');
  const ref = generation.generation.working['issue:I_test'];
  const raw = canonicalRecordJson({
    schema: 'aitm.story-issue-update/v2',
    body: 'new',
    title: 'new',
  });
  generation.payloads.set(ref.payloadPath, raw);
  ref.digest = hash(raw);
  const payload = canonicalRecordJson(generation.generation);
  generation.payloads.set(generation.manifest.payloadPath, payload);
  generation.manifest.payloadDigest = hash(payload);
  assert.throws(
    () => views.storyView({ generation, authority: 'working' }),
    /issue-candidate|approval-envelope/
  );
});

test('a same-login competing session still blocks bind with a valid cache', async (t) => {
  const { evaluateSessionReadiness } =
    await import('../../../../../task-tracker/lib/action-decision/session.mjs');
  const f = await fixture(t);
  const generation = await f.store.readGeneration();
  const result = await evaluateSessionReadiness({
    actionId: 'bind',
    issue: 2057,
    stateBefore: { active: null, paused: false },
    config: { repo: 'owner/repo', preferences: { gateAssigneeMatch: true } },
    projectDir: '/controlled',
    invokingDir: '/controlled',
    deps: {
      readIssueBody: async () => authorityFixture().body,
      readStoryGeneration: async () => generation,
      fetchAssignmentSnapshot: async () => ({ state: 'develop', assignees: ['tester'] }),
      readCurrentUser: async () => 'tester',
      readWorktreeIdentity: () => ({ worktreePath: '/controlled' }),
      resolveProjectDir: () => '/controlled',
      readOccupancy: () => ({ 2057: { sid: 'other-session', worktreePath: '/controlled' } }),
      findMainWorktreePath: () => '/controlled',
      currentSessionId: () => 'own-session',
      loadMigrationJournal: () => null,
    },
  });
  assert.equal(result.status, 'blocked', JSON.stringify(result));
  assert.ok(result.blockers.some((b) => b.code === 'occupancy-conflict'));
});

test('the real Explain command core retains readiness and emits optional untrusted publication diagnostics', async (t) => {
  const { runExplain } = await import('../../../../../task-tracker/verbs/explain.mjs');
  const { createHash } = await import('node:crypto');
  const f = await fixture(t);
  const storyGeneration = await f.store.readGeneration();
  // Synthetic read-only decision for presentation testing, never lifecycle evidence.
  const snapshotCore = {
    state: 'develop',
    head: 'a'.repeat(40),
    startedAt: '2026-10-19T12:00:00.000Z',
    completedAt: '2026-10-19T12:00:01.000Z',
    observations: [
      {
        source: 'issue-body',
        identity: 'issue:2057',
        observedAt: '2026-10-19T12:00:00.500Z',
        digest: 'sha256:' + 'c'.repeat(64),
      },
    ],
    normalizationInputs: [],
  };
  const decision = {
    schema: 'aitm.action-decision/v2',
    issue: 2057,
    actionId: 'promote',
    status: 'ready',
    snapshot: {
      ...snapshotCore,
      digest: 'sha256:' + createHash('sha256').update(JSON.stringify(snapshotCore)).digest('hex'),
    },
    blockers: [],
    normalizations: [],
    warnings: [],
    humanDecision: null,
    guidanceIds: ['action.promote'],
  };
  delete decision.snapshot.normalizationInputs;
  const agentIndex = {
    schema: 'aitm.guidance-agent-index/v1',
    byId: {
      'action.promote': {
        id: 'action.promote',
        agentDigest: 'sha256:' + 'd'.repeat(64),
        instruction: [{ query: 'promote' }],
      },
    },
  };
  for (const diagnostic of [false, true]) {
    let evaluations = 0;
    const result = await runExplain(
      { issue: 2057, actionId: 'promote', known: [], diagnostic },
      {
        evaluate: async () => {
          evaluations++;
          return {
            decision,
            repository: 'owner/repo',
            diagnosticMessages: [
              views.storyViewDiagnostic({
                generation: storyGeneration,
                identity,
                repository: 'owner/repo',
                issue: 2057,
              }),
            ],
          };
        },
        loadAgentIndex: () => agentIndex,
        stdout: { write() {} },
      }
    );
    assert.equal(evaluations, 1);
    assert.equal(result.result.status, 'ready', JSON.stringify(result.result));
    if (diagnostic) {
      const data = JSON.parse(result.diagnosticMessages[0].text);
      assert.equal(data.publication.status, 'dirty');
      assert.equal(data.fresh, false);
      assert.equal(result.diagnosticMessages[0].untrusted, true);
    } else assert.equal(Object.hasOwn(result, 'diagnosticMessages'), false);
  }
});

test('working title and body consume actual native composite staging', async (t) => {
  const { context } = await import('../../../../helpers/story-timing-candidate-fixture.mjs');
  const { stageStoryTitle } =
    await import('../../../../../task-tracker/lib/story-cache/stage-body.mjs');
  const f = await fixture(t);
  await context(f.root, () =>
    stageStoryTitle({ store: f.store, claim: f.claim, title: 'Local draft title' })
  );
  const generation = await f.store.readGeneration();
  const working = views.storyView({ generation, authority: 'working' });
  const published = views.storyView({ generation, authority: 'published' });
  assert.equal(working.title, 'Local draft title');
  assert.equal(published.title, 'Title');
  assert.equal(working.body, 'private unpublished body');
  assert.equal(published.body, 'base story');
});

test('working field projection preserves published fields separately', async (t) => {
  const { fieldInput } = await import('../../../../helpers/story-batch-fixture.mjs');
  const { f } = await fieldInput(t, 2);
  const generation = await f.store.readGeneration();
  assert.equal(views.storyView({ generation, authority: 'working' }).fields[0].value, 2);
  assert.equal(views.storyView({ generation, authority: 'published' }).fields[0].value, 1);
});

test('fresh hook admission refuses an unrelated supplied generation after its real shallow observation', async (t) => {
  const { collectHookDecompositionSnapshot } =
    await import('../../../../../task-tracker/lib/decomposition-hook-authority.mjs');
  const { makeTrafficFixture } = await import('../../../../fixtures/refinement-traffic-cases.mjs');
  const sourceRoot = process.cwd();
  const f = await fixture(t);
  const generation = await f.store.readGeneration();
  const traffic = await makeTrafficFixture({
    sourceRoot,
    fixtureId: 'empty-leaf',
    projectDir: f.root,
  });
  try {
    let reads = 0;
    await assert.rejects(
      collectHookDecompositionSnapshot({
        issue: 2073,
        cfg: traffic.cfg,
        projectDir: f.root,
        deps: {
          graphql: traffic.provider.graphql,
          readStoryGeneration: async () => {
            reads++;
            return generation;
          },
        },
      }),
      new RegExp('identity')
    );
    assert.equal(reads, 1);
    assert.equal(traffic.provider.ledger.length, 1);
    traffic.provider.assertNoEscapes();
  } finally {
    traffic.close();
  }
});
