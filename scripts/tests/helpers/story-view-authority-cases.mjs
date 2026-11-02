// @story #2049
// Registered by the exact views root. Native fixtures own all runtime identity.
import assert from 'node:assert/strict';
import { test, fixture, identity } from './story-timing-candidate-fixture.mjs';
import * as views from '../../task-tracker/lib/story-cache/views.mjs';
export function registerStoryViewAuthorityCases() {
  for (const mode of ['human', 'full-auto'])
    test('genuine native v2 approval stays unpublished and inspectable: ' + mode, async (t) => {
      const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
      const f = await nativePlanFixture(t, { mode });
      const generation = await f.store.readGeneration();
      const key = 'issue:' + identity.issueNodeId;
      const candidate = JSON.parse(
        String(generation.payloads.get(generation.generation.working[key].payloadPath))
      );
      assert.equal(candidate.schema, 'aitm.story-issue-update/v2');
      const working = views.storyView({ generation, authority: 'working' });
      assert.equal(working.body, candidate.body);
      assert.equal(working.title, candidate.title);
      assert.notEqual(views.storyView({ generation, authority: 'published' }).body, working.body);
      assert.equal(working.completionVerified, false);
      assert.equal((await f.run()).status, 'complete');
    });

  function mutableRecord(record) {
    return {
      manifest: structuredClone(record.manifest),
      generation: structuredClone(record.generation),
      payloads: new Map(record.payloads),
    };
  }
  async function rewriteWorking(record, key, candidate) {
    const { canonicalRecordJson: json } =
      await import('../../task-tracker/lib/github-records/canonical-json.mjs');
    const { createHash } = await import('node:crypto');
    const hash = (v) => createHash('sha256').update(v).digest('hex');
    const ref = record.generation.working[key];
    const raw = json(candidate);
    record.payloads.set(ref.payloadPath, raw);
    ref.digest = hash(raw);
    const payload = json(record.generation);
    record.payloads.set(record.manifest.payloadPath, payload);
    record.manifest.payloadDigest = hash(payload);
  }
  for (const variant of ['fieldId', 'itemId', 'type', 'value'])
    test('bound working field refuses adversarial ' + variant, async (t) => {
      const { fieldInput } = await import('./story-batch-fixture.mjs');
      const { f } = await fieldInput(t, 2);
      const record = mutableRecord(await f.store.readGeneration());
      const key = record.generation.dirtyKeys.find((k) => k.startsWith('project-field:'));
      const value = JSON.parse(
        String(record.payloads.get(record.generation.working[key].payloadPath))
      );
      value[variant] = variant === 'value' ? 'invalid-number' : 'foreign';
      await rewriteWorking(record, key, value);
      assert.throws(() => views.storyView({ generation: record, authority: 'working' }));
    });

  test('nested proxies and two-record switches are rejected without invoking traps', async (t) => {
    const f = await fixture(t);
    const switched = mutableRecord(await f.store.readGeneration());
    const record = mutableRecord(switched);
    const { canonicalRecordJson: json } =
      await import('../../task-tracker/lib/github-records/canonical-json.mjs');
    const { storyIdentityKey } = await import('../../task-tracker/lib/story-cache/manifest.mjs');
    const { createHash } = await import('node:crypto');
    const hash = (v) => createHash('sha256').update(v).digest('hex');
    record.manifest.identity.repository = 'foreign/repository';
    record.manifest.identityKey = storyIdentityKey(record.manifest.identity);
    record.generation = JSON.parse(
      json(record.generation).replaceAll('owner/repo', 'foreign/repository')
    );
    const raw = json(record.generation);
    record.manifest.payloadDigest = hash(raw);
    record.payloads.set(record.manifest.payloadPath, raw);
    assert.equal(
      views.storyView({ generation: record, authority: 'published' }).identity.repository,
      'foreign/repository'
    );
    let traps = 0;
    record.manifest.identity = new Proxy(record.manifest.identity, {
      ownKeys(target) {
        traps++;
        record.manifest = switched.manifest;
        record.generation = switched.generation;
        return Reflect.ownKeys(target);
      },
      get(target, key) {
        traps++;
        return target[key];
      },
      getOwnPropertyDescriptor(target, key) {
        traps++;
        return Object.getOwnPropertyDescriptor(target, key);
      },
    });
    assert.throws(
      () =>
        views.storyViewDiagnostic({
          generation: record,
          identity,
          repository: 'owner/repo',
          issue: 2057,
        }),
      new RegExp('generation-data')
    );
    assert.equal(traps, 0);
  });
  for (const component of ['host', 'issueNodeId', 'projectId', 'projectItemId'])
    test('same-number cache still binds expected ' + component, async (t) => {
      const f = await fixture(t);
      const generation = await f.store.readGeneration();
      assert.throws(
        () =>
          views.publishedStoryBody({
            body: 'fresh',
            generation,
            identity: { ...identity, [component]: 'foreign' },
          }),
        new RegExp('identity')
      );
      const diagnostic = views.storyViewDiagnostic({
        generation,
        repository: 'owner/repo',
        issue: 2057,
      });
      const data = JSON.parse(diagnostic.text);
      assert.equal(data.available, false);
      assert.equal(data.reason, 'identity-incomplete');
      assert.equal(Object.hasOwn(data, 'identity'), false);
    });

  test('native read-only cache discovery preserves the exact manifest and missing caches remain remote-only', async (t) => {
    const f = await fixture(t);
    const before = await f.store.readGeneration();
    const local = views.readLocalStoryView({
      projectRoot: f.root,
      repository: 'owner/repo',
      issue: 2057,
      projectId: 'P_test',
    });
    assert.equal(local.view.body, 'base story');
    assert.deepEqual(local.identity, identity);
    assert.equal(
      (await f.store.readGeneration()).manifest.payloadDigest,
      before.manifest.payloadDigest
    );
    assert.equal(
      views.readLocalStoryView({
        projectRoot: f.root,
        repository: 'owner/repo',
        issue: 99999,
        projectId: 'P_test',
      }),
      null
    );
  });

  test('pending timing compares authenticated event bytes when different actors reuse one cursor', async (t) => {
    const { completedTimingAuthority } = await import('./story-timing-authority-fixture.mjs');
    const { context } = await import('./story-timing-candidate-fixture.mjs');
    const { prepareNextTransition } =
      await import('../../task-tracker/lib/story-cache/transition-batch.mjs');
    const { ingestTimingEvents } =
      await import('../../task-tracker/lib/story-cache/timing-stage.mjs');
    const { timingActorKey } = await import('../../task-tracker/lib/timing-actor.mjs');
    const f = await completedTimingAuthority(t);
    const n = f.native;
    await context(n.root, () => prepareNextTransition({ store: n.store, claim: n.claim }));
    const baseline = await n.store.readGeneration();
    assert.equal(
      views.storyView({ generation: baseline, authority: 'published' }).publication.timingPending,
      false
    );
    await context(n.root, () =>
      ingestTimingEvents({
        store: n.store,
        claim: n.claim,
        events: [
          {
            eventId: 'other-actor-pending',
            actorId: timingActorKey({ provider: 'codex', sid: 'other-actor' }),
            transitionId: null,
            timestamp: '2026-10-20T12:00:00.000Z',
            event: 'paused',
            activeSeconds: 3,
            idleSeconds: null,
            sourceCursor: baseline.generation.timing.publishedCursor,
          },
        ],
      })
    );
    const generation = await n.store.readGeneration();
    assert.equal(
      generation.generation.timing.ingestedCursor,
      generation.generation.timing.publishedCursor
    );
    const view = views.storyView({ generation, authority: 'published' });
    assert.equal(view.publication.timingPending, true);
    assert.equal(view.publication.status, 'dirty');
  });

  test('confirmed batch advice names the actual coordinator continuation without provider replay', async (t) => {
    const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
    const f = await nativePlanFixture(t);
    f.ports.validateFinal = async () => {
      throw new Error('retained final validation interruption');
    };
    await assert.rejects(f.run(), new RegExp('retained final validation interruption'));
    const generation = await f.store.readGeneration();
    assert.equal(generation.generation.batch.status, 'confirmed');
    const publication = views.storyView({ generation, authority: 'published' }).publication;
    assert.equal(publication.recovery.operation, 'runTransitionBatch');
    const effects = f.calls.length;
    f.ports.validateFinal = async () => ({ verified: true });
    assert.equal((await f.run()).status, 'complete');
    assert.equal(f.calls.length, effects);
  });

  for (const actionId of ['promote', 'deliver'])
    test(
      'real Explain preserves uncertain local diagnostics on ' +
        actionId +
        ' read failure without upgrading readiness',
      async (t) => {
        const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
        const { evaluateExplanation } = await import('../../task-tracker/verbs/explain.mjs');
        const f = await nativePlanFixture(t);
        f.ports.apply = async () => {
          throw new Error('request can still arrive');
        };
        assert.equal((await f.run()).status, 'uncertain');
        const record = mutableRecord(await f.store.readGeneration());
        const evaluated = await evaluateExplanation({
          issue: identity.issueNumber,
          actionId,
          projectRoot: f.root,
          storyIdentity: identity,
          readStoryGeneration: async () => record,
          deliveryDeps: {},
          deps: {
            loadConfig: () => ({ repo: identity.repository, projectId: identity.projectId }),
            loadSessionState: () => ({}),
            readIssueObservation: async () => {
              record.manifest = {};
              record.generation = {};
              record.payloads.clear();
              throw new Error('fresh provider unavailable');
            },
          },
        });
        assert.notEqual(evaluated.decision.status, 'ready');
        const data = JSON.parse(evaluated.diagnosticMessages[0].text);
        assert.equal(data.publication.status, 'uncertain');
        assert.deepEqual(data.identity, identity);
        assert.equal(data.fresh, false);
      }
    );

  test('real Explain missing-cache failure retains remote-only unavailability', async (t) => {
    const { evaluateExplanation } = await import('../../task-tracker/verbs/explain.mjs');
    const f = await fixture(t);
    const result = await evaluateExplanation({
      issue: identity.issueNumber,
      actionId: 'promote',
      projectRoot: f.root,
      readStoryGeneration: async () => null,
      deps: {
        loadConfig: () => ({ repo: identity.repository, projectId: identity.projectId }),
        readIssueObservation: async () => {
          throw new Error('unavailable');
        },
      },
    });
    assert.equal(result.decision.status, 'indeterminate');
    assert.deepEqual(result.diagnosticMessages, []);
  });

  test('bounded published observation reads exactly one target and disables incomplete cache attachment', async () => {
    let calls = 0;
    const args = {
      repository: 'owner/repo',
      issue: 2057,
      projectId: 'P_test',
      transport: async () => {
        calls++;
        return {
          repository: {
            issue: {
              id: 'I_test',
              number: 2057,
              repository: { nameWithOwner: 'owner/repo' },
              body: 'fresh published',
              projectItems: {
                nodes: [{ id: 'PI_test', project: { id: 'P_test' } }],
                pageInfo: { hasNextPage: false },
              },
            },
          },
        };
      },
    };
    const result = await views.readPublishedStoryObservation(args);
    assert.equal(calls, 1);
    assert.deepEqual(result.identity, identity);
    assert.equal(result.body, 'fresh published');
    args.transport = async () => {
      calls++;
      return {
        repository: {
          issue: {
            id: 'I_test',
            number: 2057,
            repository: { nameWithOwner: 'owner/repo' },
            body: 'current',
            projectItems: { nodes: [], pageInfo: { hasNextPage: true } },
          },
        },
      };
    };
    const partial = await views.readPublishedStoryObservation(args);
    assert.equal(calls, 2);
    assert.equal(partial.identity, null);
    assert.equal(partial.body, 'current');
  });

  test('actual completion probe reads only published target bytes and preserves genuine published completion', async (t) => {
    const { defaultProbeCompletion } =
      await import('../../task-tracker/lib/move-state/move-state-core.mjs');
    const { completedTimingAuthority } = await import('./story-timing-authority-fixture.mjs');
    const f = await completedTimingAuthority(t);
    const record = f.generation;
    const body = String(
      record.payloads.get(record.generation.baseSnapshot.resources['issue:I_test'].payloadPath)
    );
    // The legacy native pair producer remains the source of legacy replay evidence.
    const { emitPhasePairRows } =
      await import('../../task-tracker/lib/move-state/audit-timing.mjs');
    const { buildRow } = await import('../../task-tracker/gh-timing-comment.mjs');
    const { PHASE_EVENTS } = await import('../../task-tracker/phase-events.mjs');
    const posted = [];
    await emitPhasePairRows({
      issueArg: '2057',
      stateArg: 'develop',
      resolvedFromState: 'plan',
      transitionId: f.receipt.transition.id,
      demoteFlag: false,
      cfg: { repo: 'owner/repo' },
      SKIP_NETWORK: false,
      deps: {
        // Standalone shared-row fixture owns no actor interval to flush.
        flushBoundActorInterval: async () => {},
        ghTimingComment: {
          buildRow,
          postTimingEvent: async ({ row }) => posted.push(row),
          readTimingCommentBody: async () => '',
          bodyOf: (v) => v,
        },
        timingRows: {
          deriveStateMoveDelta: () => ({ activeSec: 0, idleSec: 0 }),
          computePhaseCloseDelta: () => ({ matched: false }),
        },
        phaseEvents: { PHASE_EVENTS },
        bankTail: () => ({ marker: 1, fullMarker: 1, fullMarkerAvailable: true }),
      },
    });
    const timing = posted.join('\n');
    let reads = 0;
    const ctx = {
      issueArg: '2057',
      stateArg: 'develop',
      cfg: { repo: 'owner/repo', projectId: 'P_test' },
      SKIP_NETWORK: false,
      body,
      resolveLiveStateName: async () => 'develop',
      _fetchTimingBody: async () => timing,
      _publishedStoryTransport: async (_document, variables) => {
        reads++;
        assert.equal(variables.issue, 2057);
        return {
          repository: {
            issue: {
              id: 'I_test',
              number: 2057,
              repository: { nameWithOwner: 'owner/repo' },
              body: reads === 1 ? 'current published body without staged sentinel' : body,
              projectItems: {
                nodes: [{ id: 'PI_test', project: { id: 'P_test' } }],
                pageInfo: { hasNextPage: false },
              },
            },
          },
        };
      },
    };
    const pending = await defaultProbeCompletion(ctx);
    assert.equal(pending.sentinelState, '');
    assert.equal(pending.entryMarkerPresent, false);
    const completed = await defaultProbeCompletion(ctx);
    assert.equal(reads, 2);
    assert.equal(completed.sentinelState, 'develop');
    assert.equal(completed.entryMarkerPresent, true);
    assert.equal(completed.exitRowPresent, true);
    assert.equal(completed.entryRowPresent, true);
  });

  test('hook deadline remains active across a stalled optional cache reader', async (t) => {
    const { collectHookDecompositionSnapshot } =
      await import('../../task-tracker/lib/decomposition-hook-authority.mjs');
    const { makeTrafficFixture } = await import('../fixtures/refinement-traffic-cases.mjs');
    const sourceRoot = process.cwd();
    const f = await fixture(t);
    const traffic = await makeTrafficFixture({
      sourceRoot,
      fixtureId: 'empty-leaf',
      projectDir: f.root,
    });
    try {
      const start = performance.now();
      await assert.rejects(
        collectHookDecompositionSnapshot({
          issue: 2073,
          cfg: traffic.cfg,
          projectDir: f.root,
          deps: {
            graphql: traffic.provider.graphql,
            readStoryGeneration: () => new Promise(() => {}),
          },
        }),
        new RegExp('total-deadline')
      );
      assert.ok(performance.now() - start < 7000);
      assert.equal(traffic.provider.ledger.length, 1);
      traffic.provider.assertNoEscapes();
    } finally {
      traffic.close();
    }
  });
}

// Additional evaluator subject checks are registered separately by the same exact root.
export function registerStoryViewIdentityCases() {
  test('published adapters refuse a working-purpose view', async (t) => {
    const f = await fixture(t);
    const view = views.storyView({
      generation: await f.store.readGeneration(),
      authority: 'working',
    });
    assert.throws(
      () => views.publishedStoryBody({ body: 'fresh', view, identity }),
      new RegExp('authority')
    );
    assert.throws(() => views.storyViewDiagnostic({ view, identity }), new RegExp('authority'));
  });

  for (const partial of [false, true])
    test(
      'real Explain suppresses unbound cache attachment after fresh identity: ' +
        (partial ? 'incomplete' : 'mismatch'),
      async (t) => {
        const { evaluateExplanation } = await import('../../task-tracker/verbs/explain.mjs');
        const { fixture: bodyFixture } =
          await import('../unit/task-tracker/lib/decomposition-authority-fixtures.mjs');
        const f = await fixture(t);
        const record = await f.store.readGeneration();
        const subject = { ...identity };
        delete subject.projectItemId;
        const result = await evaluateExplanation({
          issue: 2057,
          actionId: 'promote',
          projectRoot: f.root,
          storyIdentity: identity,
          readStoryGeneration: async () => record,
          deps: {
            loadConfig: () => ({ repo: 'owner/repo', projectId: 'P_test' }),
            readHead: async () => {
              throw new Error('no further authority supplied');
            },
            readIssueObservation: async () => ({
              body: bodyFixture().body,
              identity: partial ? null : { ...identity, projectItemId: 'foreign' },
              subject,
            }),
          },
        });
        assert.notEqual(result.decision.status, 'ready');
        if (partial) {
          const data = JSON.parse(result.diagnosticMessages[0].text);
          assert.equal(data.available, false);
          assert.equal(Object.hasOwn(data, 'identity'), false);
        } else {
          assert.equal(
            result.diagnosticMessages[0].text,
            'story-view:observed-subject-validation-unavailable'
          );
        }
      }
    );
}
