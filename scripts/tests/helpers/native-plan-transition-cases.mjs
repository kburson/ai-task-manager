// @story #2069
// Registered by the story's exact verifier; these cases exercise real native storage.
import assert from 'node:assert/strict';
import { registerNativePlanReviewRegressions } from './native-plan-review-regressions.mjs';
import { initial, trunk, transition, hash } from './plan-transition-candidate-fixture.mjs';
import { canonicalRecordJson } from '../../task-tracker/lib/github-records/canonical-json.mjs';
import { validateStagedComposite } from '../../task-tracker/lib/story-cache/stage-capabilities.mjs';
const nativeStaging = await import('../../task-tracker/lib/plan-approval-staging.mjs').catch(
  (error) => {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    return {};
  }
);
const nativeFixture = await import('./story-timing-candidate-fixture.mjs');
const { setIssue } = await import('./story-batch-fixture.mjs');

export function registerNativePlanCandidateTests() {
  nativeFixture.test(
    'native approval stages durable provenance with zero cloud effects',
    async (t) => {
      assert.equal(typeof nativeStaging.stageNativePlanApproval, 'function');
      const move = { ...nativeFixture.transition, id: transition.id, from: 'plan', to: 'develop' };
      const events = nativeFixture.pair(move).map((event) => ({
        ...event,
        event: event.event === 'develop:completed' ? 'plan:completed' : 'develop:started',
      }));
      const f = await nativeFixture.fixture(t, { events });
      await nativeFixture.changeGeneration(f, (generation, payloads) => {
        setIssue(generation, payloads, initial, initial);
        generation.baseSnapshot.fields = [
          {
            itemId: 'PI_test',
            fieldId: 'F_status',
            type: 'SINGLE_SELECT',
            value: { optionId: 'OPT_plan', name: 'Plan' },
          },
        ];
        generation.baseSnapshot.fieldsDigest = hash(
          canonicalRecordJson({
            canonicalizationVersion: 'aitm.canonical-json/v1',
            fields: generation.baseSnapshot.fields,
          })
        );
      });
      const result = await nativeFixture.context(f.root, () =>
        nativeStaging.stageNativePlanApproval({
          store: f.store,
          claim: f.claim,
          cfg: {
            repo: 'owner/repo',
            projectId: 'P_test',
            kanbanFieldId: 'F_status',
            kanbanOptionPlan: 'OPT_plan',
            estimationRubricIssue: 0,
          },
          deps: {
            resolveTrunkSha: async () => trunk,
            nativeChildInventory: {
              schema: 'aitm.native-plan-children/v1',
              identity: nativeFixture.identity,
              issueDigest: hash(initial),
              complete: true,
              children: [],
            },
            nowIso: () => '2026-10-19T01:00:00Z',
            mutateIssueBody: () => assert.fail('cloud body mutation'),
            postComment: () => assert.fail('cloud comment mutation'),
          },
        })
      );
      assert.equal(result.status, 'staged');
      assert.equal(result.publication, 'unpublished');
      const record = await f.store.readGeneration();
      const working = record.generation.working['issue:I_test'];
      const payload = JSON.parse(String(record.payloads.get(working.payloadPath)));
      assert.equal(payload.schema, 'aitm.story-issue-update/v2');
      assert.match(payload.body, /aitm-plan-approved/);
      assert.equal(payload.nativeApproval.approved.mode, 'human');
      assert.equal(payload.nativeApproval.approved.trunkSha, trunk);
      assert.equal(payload.nativeApproval.beforeBody, initial);
      const { openStoryStore } = await import('../../task-tracker/lib/story-cache/store.mjs');
      const reopened = await openStoryStore({
        projectRoot: f.root,
        identity: nativeFixture.identity,
      });
      assert.equal(typeof nativeStaging.rebindNativePlanApproval, 'function');
      const rebound = await nativeFixture.context(f.root, () =>
        nativeStaging.rebindNativePlanApproval({
          store: reopened,
          claim: f.claim,
          cfg: payload.nativeApproval.cfg,
          deps: { resolveTrunkSha: async () => trunk },
        })
      );
      const { withIssueLock } = await import('../../task-tracker/issue-mutator-lock.mjs');
      await nativeFixture.context(f.root, () =>
        withIssueLock(
          {
            issue: nativeFixture.identity.issueNumber,
            projDir: f.root,
            sessionId: 'author-A',
            retries: 0,
          },
          async () => {
            assert.equal(
              validateStagedComposite({
                base: initial,
                candidate: payload.body,
                operations: [
                  {
                    base: initial,
                    candidate: payload.body,
                    capability: { nativePlanApprovalCapability: rebound.capability },
                  },
                ],
              }),
              true
            );
            const { freezeStoryBatch } =
              await import('../../task-tracker/lib/story-cache/batch.mjs');
            const generation = await reopened.readGeneration();
            const timing = await f.freeze(move);
            const issue = {
              key: 'issue:I_test',
              kind: 'issue-update',
              target: { identity: nativeFixture.identity, issueNodeId: 'I_test' },
              beforeDigest: hash(initial),
              intendedDigest: hash(payload.body),
              candidate: {
                schema: 'aitm.story-issue-update/v1',
                body: payload.body,
                title: payload.title,
              },
              dependencies: [timing.key],
              attempted: false,
              outcome: null,
            };
            const batch = freezeStoryBatch({
              generation,
              transition: move,
              effects: [issue, timing],
              capabilities: [
                {
                  base: initial,
                  candidate: payload.body,
                  capability: { nativePlanApprovalCapability: rebound.capability },
                },
              ],
            });
            assert.equal(batch.transition.from, 'plan');
            assert.equal(batch.transition.to, 'develop');

            assert.throws(() =>
              validateStagedComposite({
                base: initial,
                candidate: payload.body,
                operations: [
                  {
                    base: initial,
                    candidate: payload.body,
                    capability: {
                      nativePlanApprovalCapability: structuredClone(rebound.capability),
                    },
                  },
                ],
              })
            );
          }
        )
      );
      const retained = await reopened.readGeneration();
      assert.equal(
        String(retained.payloads.get(retained.generation.working['issue:I_test'].payloadPath)),
        String(record.payloads.get(working.payloadPath))
      );
    }
  );

  nativeFixture.test(
    'ordinary store commit cannot introduce a forged native approval descriptor',
    async (t) => {
      const f = await nativeFixture.fixture(t);
      await assert.rejects(
        nativeFixture.changeGeneration(f, (generation, payloads) => {
          const nativeApproval = {
            schema: 'aitm.native-plan-approval/v1',
            approved: { mode: 'human' },
          };
          const raw = canonicalRecordJson({
            schema: 'aitm.story-issue-update/v2',
            body: initial,
            title: 'Title',
            nativeApproval,
          });
          payloads.set('working/forged.json', Buffer.from(raw));
          generation.working['issue:I_test'] = {
            kind: 'issue',
            capabilityRef: 'plan-approved:' + hash(canonicalRecordJson(nativeApproval)),
            payloadPath: 'working/forged.json',
            digest: hash(raw),
          };
        }),
        (error) =>
          error.code === 'STORY_STORE_UNAVAILABLE' &&
          /native-approval-issuance/.test(error.cause?.message)
      );
    }
  );

  nativeFixture.test(
    'native Plan callbacks accept typed timing, confirmed Status and the exact final body',
    async (t) => {
      const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
      const f = await nativePlanFixture(t);
      const outcome = await f.run();
      assert.equal(outcome.status, 'complete', JSON.stringify(outcome.guardRefusals));
      assert.deepEqual(f.calls.slice(0, 2).sort(), ['comment-create', 'comment-update']);
      assert.deepEqual(f.calls.slice(2), ['project-field-update', 'issue-update']);
      assert.equal((await f.store.readGeneration()).generation.batch.status, 'complete');
    }
  );

  for (const outcome of ['not-required', 'waived']) {
    nativeFixture.test(
      `native Plan preserves ${outcome} policy without fabricating human approval`,
      async (t) => {
        const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
        const f = await nativePlanFixture(t, { outcome, estimate: outcome !== 'waived' });
        assert.equal((await f.run()).status, 'complete');
        assert.equal(f.authorityRecord.outcome, outcome);
        assert.equal(
          f.authorityRecord.evidence.kind,
          outcome === 'waived' ? 'workflow-exception' : 'gate-policy'
        );
        assert.doesNotMatch(f.cloud.resources['issue:I_test'].body, /<!-- aitm-plan-approved\b/);
      }
    );
  }

  nativeFixture.test(
    'invalid frozen Plan intent refuses before the first provider effect',
    async (t) => {
      const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
      const f = await nativePlanFixture(t, { estimate: false });
      const refusal = await f.run();
      assert.equal(refusal.status, 'blocked');
      assert.ok(refusal.guardRefusals.some((row) => row.id === 'plan-exit-planned-estimate'));
      assert.deepEqual(f.calls, []);
      assert.ok(
        (await f.store.readGeneration()).generation.batch.effects.every(
          (effect) => !effect.attempted
        )
      );
    }
  );

  nativeFixture.test(
    'uncertain Plan authority creation prevents Status and is not automatically replayed',
    async (t) => {
      const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
      const f = await nativePlanFixture(t);
      const apply = f.ports.apply;
      f.ports.apply = async (effect) => {
        if (effect.kind === 'comment-create') {
          f.calls.push(effect.kind);
          throw new Error('offline timeout');
        }
        return apply(effect);
      };
      assert.equal((await f.run()).status, 'uncertain');
      assert.deepEqual(f.calls, ['comment-update', 'comment-create']);
      assert.equal((await f.run()).status, 'pending');
      assert.equal(f.calls.length, 2);
    }
  );

  nativeFixture.test(
    'altered materialized Plan body cannot dispatch after confirmed Status',
    async (t) => {
      const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
      const f = await nativePlanFixture(t);
      const validate = f.ports.validateIssue;
      f.ports.validateIssue = (input) =>
        validate({
          ...input,
          candidate: { ...input.candidate, body: input.candidate.body + '\nforeign final bytes' },
        });
      await assert.rejects(f.run(), /materialized-intent/);
      assert.equal(f.calls.includes('project-field-update'), true);
      assert.equal(f.calls.includes('issue-update'), false);
      const persisted = await f.store.readGeneration();
      assert.equal(
        persisted.generation.batch.effects.find((effect) => effect.kind === 'project-field-update')
          .outcome.state,
        'confirmed'
      );
      const rebound = await nativeFixture.context(f.root, () =>
        nativeStaging.rebindNativePlanApproval({
          store: f.store,
          claim: f.claim,
          cfg: f.ctx.cfg,
          deps: { resolveTrunkSha: async () => trunk },
        })
      );
      assert.equal(rebound.admitted.approved.mode, 'human');
      assert.equal((await f.run()).status, 'pending');
      assert.equal(f.calls.includes('issue-update'), false);
    }
  );

  nativeFixture.test(
    'omitting a dirty Plan prerequisite fails before every provider effect',
    async (t) => {
      const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
      const f = await nativePlanFixture(t);
      f.ctx.effects = f.ctx.effects.filter((effect) => effect.kind !== 'comment-create');
      await assert.rejects(f.run(), /dirty-coverage/);
      assert.deepEqual(f.calls, []);
    }
  );

  nativeFixture.test(
    'caller supplied Plan policy and guard cannot replace genuine native admission',
    async (t) => {
      const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
      const f = await nativePlanFixture(t);
      f.ctx.planTransitionAuthorityInput = {
        body: initial,
        workflowPolicy: { decision: () => ({ outcome: 'waived' }) },
      };
      f.ctx._runGuardExecution = async () => ({ exit: null });
      assert.equal((await f.run()).status, 'complete');
      assert.equal(f.authorityRecord.outcome, 'satisfied');
    }
  );

  nativeFixture.test(
    'store refuses an accessor that swaps approval intent between admission and persistence',
    async (t) => {
      const f = await nativeFixture.fixture(t);
      const current = await f.store.readGeneration();
      const ordinary = structuredClone(current.generation);
      ordinary.generation++;
      const forged = structuredClone(ordinary);
      const nativeApproval = {
        schema: 'aitm.native-plan-approval/v1',
        approved: { mode: 'human' },
      };
      const raw = canonicalRecordJson({
        schema: 'aitm.story-issue-update/v2',
        body: initial,
        title: 'Title',
        nativeApproval,
      });
      const payloads = new Map(current.payloads);
      payloads.set('working/forged.json', Buffer.from(raw));
      forged.working['issue:I_test'] = {
        kind: 'issue',
        capabilityRef: 'plan-approved:' + hash(canonicalRecordJson(nativeApproval)),
        payloadPath: 'working/forged.json',
        digest: hash(raw),
      };
      let reads = 0;
      const next = {
        get generation() {
          return ++reads <= 2 ? ordinary : forged;
        },
        claimId: f.claim.claimId,
        payloads,
      };
      await assert.rejects(
        f.store.commitGeneration(next, { expectedGeneration: current.manifest.generation })
      );
      assert.equal(
        (await f.store.readGeneration()).manifest.generation,
        current.manifest.generation
      );
    }
  );

  nativeFixture.test(
    'an injected filesystem store cannot issue native approval authority',
    async (t) => {
      const f = await nativeFixture.fixture(t);
      const { openStoryStore } = await import('../../task-tracker/lib/story-cache/store.mjs');
      const { default: io } = await import('node:fs/promises');
      const injected = await openStoryStore({
        projectRoot: f.root,
        identity: nativeFixture.identity,
        fs: { ...io },
      });
      await assert.rejects(
        nativeFixture.context(f.root, () =>
          nativeStaging.stageNativePlanApproval({
            store: injected,
            claim: f.claim,
            cfg: { repo: 'owner/repo', projectId: 'P_test', kanbanOptionPlan: 'OPT_plan' },
          })
        ),
        /native-store-required/
      );
    }
  );

  nativeFixture.test(
    'generic success callbacks cannot skip mandatory native Plan validation',
    async (t) => {
      const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
      const f = await nativePlanFixture(t, { baselineAuthorityOnly: true });
      for (const name of ['validateFrozenIntent', 'validatePreStatus', 'validateIssue'])
        f.ports[name] = async () => ({ verified: true });
      await assert.rejects(f.run(), /required-authority-effect/);
      assert.deepEqual(f.calls, []);
    }
  );

  nativeFixture.test(
    'missing configured Plan field and option cannot be treated as a Plan observation',
    async (t) => {
      const f = await nativeFixture.fixture(t);
      await assert.rejects(
        nativeFixture.context(f.root, () =>
          nativeStaging.stageNativePlanApproval({
            store: f.store,
            claim: f.claim,
            cfg: { repo: 'owner/repo', projectId: 'P_test' },
          })
        ),
        /approval-plan-state/
      );
    }
  );

  nativeFixture.test(
    'a matching published authority row cannot substitute for a required batch effect',
    async (t) => {
      const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
      const f = await nativePlanFixture(t, { baselineAuthorityOnly: true });
      await assert.rejects(f.run(), /required-authority-effect/);
      assert.deepEqual(f.calls, []);
    }
  );

  nativeFixture.test(
    'native Full-Auto Plan publishes its canonical audit before Status',
    async (t) => {
      const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
      const f = await nativePlanFixture(t, { mode: 'full-auto' });
      assert.equal((await f.run()).status, 'complete');
      assert.equal(f.calls.filter((kind) => kind === 'comment-create').length, 2);
      const effects = (await f.store.readGeneration()).generation.batch.effects;
      assert.equal(
        effects.filter(
          (effect) =>
            effect.kind === 'comment-create' &&
            /Full-Auto Plan-Approval Audit/.test(effect.candidate)
        ).length,
        1
      );
      const status = effects.find((effect) => effect.kind === 'project-field-update');
      assert.ok(
        effects
          .filter((effect) => effect.kind === 'comment-create')
          .every(
            (effect) =>
              status.dependencies.includes(effect.key) && effect.outcome.state === 'confirmed'
          )
      );
    }
  );

  nativeFixture.test(
    'an entirely unattempted failed Plan batch can be released without losing working intent',
    async (t) => {
      const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
      const f = await nativePlanFixture(t, { estimate: false });
      const refusal = await f.run();
      assert.equal(refusal.status, 'blocked');
      assert.ok(refusal.guardRefusals.some((row) => row.id === 'plan-exit-planned-estimate'));
      const before = await f.store.readGeneration();
      const coordinator = await import('../../task-tracker/lib/story-cache/transition-batch.mjs');
      assert.equal(typeof coordinator.releaseUnattemptedTransition, 'function');
      await nativeFixture.context(f.root, () =>
        coordinator.releaseUnattemptedTransition({
          store: f.store,
          claim: f.claim,
          batchId: before.generation.batch.batchId,
        })
      );
      const after = await f.store.readGeneration();
      assert.equal(after.generation.batch, null);
      assert.deepEqual(after.generation.working, before.generation.working);
      assert.deepEqual(after.generation.dirtyKeys, before.generation.dirtyKeys);
      assert.deepEqual(after.generation.timing, before.generation.timing);
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      await fs.access(path.join(f.store.cachePath, before.manifest.payloadPath));
      assert.deepEqual(f.calls, []);
    }
  );

  nativeFixture.test('durable approval recovery refuses duplicate approval markers', async (t) => {
    const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
    const f = await nativePlanFixture(t);
    const record = await f.store.readGeneration();
    const staged = JSON.parse(
      String(record.payloads.get(record.generation.working['issue:I_test'].payloadPath))
    );
    const marker = staged.body.match(/<!-- aitm-plan-approved[^>]*-->/)[0];
    await assert.rejects(
      nativeFixture.context(f.root, () =>
        nativeStaging.rebindNativePlanApproval({
          store: f.store,
          claim: f.claim,
          cfg: f.ctx.cfg,
          body: staged.body + '\n' + marker,
          deps: { resolveTrunkSha: async () => trunk },
        })
      ),
      /approval-marker-count/
    );
  });

  nativeFixture.test(
    'Plan uses the real native registry and refuses a missing VC instead of an injected guard success',
    async (t) => {
      const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
      const f = await nativePlanFixture(t, { omitVc: true });
      f.ctx._runGuardExecution = async () => assert.fail('caller guard replaced native evaluation');
      const result = await f.run();
      assert.equal(result.status, 'blocked');
      assert.ok(result.guardRefusals.some((refusal) => refusal.id === 'plan-exit-vc-presence'));
      assert.deepEqual(f.calls, []);
    }
  );
  nativeFixture.test(
    'an authority comment cannot attest its own chosen transition instant',
    async (t) => {
      const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
      const f = await nativePlanFixture(t, { authorityRecordedAt: '2099-01-01T00:00:00.000Z' });
      await assert.rejects(f.run(), /authority-record-mismatch/);
      assert.deepEqual(f.calls, []);
    }
  );
  registerNativePlanReviewRegressions();
}
