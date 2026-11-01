// @story #2069
// Regression cases from independent native authority review.
import assert from 'node:assert/strict';
import { initial, trunk, hash } from './plan-transition-candidate-fixture.mjs';
import { canonicalRecordJson } from '../../task-tracker/lib/github-records/canonical-json.mjs';
import * as nativeStaging from '../../task-tracker/lib/plan-approval-staging.mjs';
import * as nativeFixture from './story-timing-candidate-fixture.mjs';
import { setIssue } from './story-batch-fixture.mjs';
import { registerNativePlanFinalBoundaryTests } from './native-plan-final-boundary-cases.mjs';
import { registerNativePlanIssuerTests } from './native-plan-issuer-cases.mjs';

export function registerNativePlanReviewRegressions() {
  registerNativePlanFinalBoundaryTests();
  registerNativePlanIssuerTests();
  for (const [actual, supplied] of [
    ['1', {}],
    [undefined, { TT_FULL_AUTO: '1' }],
  ]) {
    nativeFixture.test(
      `durable issuer refuses a mode override in actual ${actual === '1' ? 'Full-Auto' : 'human'} context`,
      async (t) => {
        const f = await nativeFixture.fixture(t);
        await nativeFixture.changeGeneration(f, (g, payloads) => {
          setIssue(g, payloads, initial, initial);
          g.baseSnapshot.fields = [
            {
              itemId: 'PI_test',
              fieldId: 'F_status',
              type: 'SINGLE_SELECT',
              value: { optionId: 'OPT_plan', name: 'Plan' },
            },
          ];
          g.baseSnapshot.fieldsDigest = hash(
            canonicalRecordJson({
              canonicalizationVersion: 'aitm.canonical-json/v1',
              fields: g.baseSnapshot.fields,
            })
          );
        });
        const previous = process.env.TT_FULL_AUTO;
        try {
          if (actual === undefined) delete process.env.TT_FULL_AUTO;
          else process.env.TT_FULL_AUTO = actual;
          await assert.rejects(
            nativeFixture.context(f.root, () =>
              nativeStaging.stageNativePlanApproval({
                store: f.store,
                claim: f.claim,
                cfg: {
                  repo: 'owner/repo',
                  projectId: 'P_test',
                  kanbanFieldId: 'F_status',
                  kanbanOptionPlan: 'OPT_plan',
                },
                deps: {
                  env: supplied,
                  resolveTrunkSha: async () => trunk,
                  fetchEpicChildren: async () => [],
                  nowIso: () => '2026-10-19T01:00:00Z',
                },
              })
            ),
            /native-provenance-override/
          );
        } finally {
          if (previous === undefined) delete process.env.TT_FULL_AUTO;
          else process.env.TT_FULL_AUTO = previous;
        }
      }
    );
  }
  nativeFixture.test(
    'a waiver expired after event capture cannot authorize current admission',
    async (t) => {
      const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
      const f = await nativePlanFixture(t, {
        outcome: 'waived',
        estimate: false,
        waiverExpiresAt: '2026-10-20T00:00:00.000Z',
      });
      const result = await f.run();
      assert.equal(result.status, 'blocked');
      assert.deepEqual(f.calls, []);
    }
  );
  nativeFixture.test(
    'changing the selected transition across guard await cannot bypass native Plan validation',
    async (t) => {
      const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
      const f = await nativePlanFixture(t);
      const planTransition = f.ctx.transition;
      f.ctx.transition = { ...planTransition, from: 'develop', to: 'test' };
      f.ctx.resolvedFromState = 'develop';
      f.ctx.stateArg = 'test';
      f.ctx._runGuardExecution = async () => {
        f.ctx.transition = planTransition;
        f.ctx.resolvedFromState = 'plan';
        f.ctx.stateArg = 'develop';
        return { exit: null };
      };
      for (const name of ['validateFrozenIntent', 'validatePreStatus', 'validateIssue'])
        f.ports[name] = async () => ({ verified: true });
      await assert.rejects(f.run(), /transition-context/);
      assert.deepEqual(f.calls, []);
    }
  );

  nativeFixture.test(
    'waiver expiry after a confirmed prerequisite prevents the next provider effect',
    async (t) => {
      t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-01T12:00:00.000Z') });
      const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
      const f = await nativePlanFixture(t, {
        outcome: 'waived',
        estimate: false,
        waiverExpiresAt: '2026-11-01T12:05:00.000Z',
      });
      const apply = f.ports.apply;
      f.ports.apply = async (effect) => {
        const result = await apply(effect);
        t.mock.timers.tick(6 * 60 * 1000);
        return result;
      };
      await assert.rejects(f.run(), /expired-admission/);
      assert.deepEqual(f.calls, ['comment-update']);
      const effects = (await f.store.readGeneration()).generation.batch.effects;
      assert.equal(
        effects.find((effect) => effect.kind === 'comment-update').outcome.state,
        'confirmed'
      );
      assert.equal(
        effects.find((effect) => effect.kind === 'project-field-update').attempted,
        false
      );
    }
  );

  nativeFixture.test(
    'a fenced approval example preceding the genuine stamp does not prevent recovery',
    async (t) => {
      const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
      const f = await nativePlanFixture(t, { fencedApprovalExample: true });
      assert.equal((await f.run()).status, 'complete');
    }
  );
  nativeFixture.test('durable recovery refuses a second mixed-case approval claim', async (t) => {
    const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
    const f = await nativePlanFixture(t);
    const record = await f.store.readGeneration();
    const staged = JSON.parse(
      String(record.payloads.get(record.generation.working['issue:I_test'].payloadPath))
    );
    const marker = staged.body
      .match(/<!-- aitm-plan-approved[^>]*-->/)[0]
      .replace('aitm-plan-approved', 'AITM-PLAN-APPROVED');
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
      /approval-marker-count|approval-drift/
    );
  });

  nativeFixture.test(
    'a configured rubric does not reinstate a genuinely waived forecast requirement',
    async (t) => {
      const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
      const f = await nativePlanFixture(t, {
        outcome: 'waived',
        estimate: false,
        rubricIssue: 1001,
      });
      assert.equal((await f.run()).status, 'complete');
      assert.doesNotMatch(f.cloud.resources['issue:I_test'].body, /<!-- aitm-plan-approved\b/);
    }
  );
  nativeFixture.test(
    'waiving approval alone does not grant a missing required forecast freeze',
    async (t) => {
      const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
      const f = await nativePlanFixture(t, {
        outcome: 'waived',
        rubricIssue: 1001,
        waiverRequirementIds: ['approval.plan'],
      });
      assert.equal((await f.run()).status, 'blocked');
      assert.deepEqual(f.calls, []);
    }
  );

  nativeFixture.test(
    'conflicting duplicate Refine estimates cannot be selected by inventory order',
    async (t) => {
      const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
      const f = await nativePlanFixture(t, { duplicateEstimate: true });
      const result = await f.run();
      assert.equal(result.status, 'blocked');
      assert.ok(result.guardRefusals.some((row) => /ambiguous-refine/.test(row.reason)));
      assert.deepEqual(f.calls, []);
    }
  );

  nativeFixture.test(
    'a published human approval can be genuinely reauthorized by current Full-Auto invocation',
    async (t) => {
      const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
      const f = await nativePlanFixture(t, { publishedApproval: true, mode: 'full-auto' });
      const local = await f.store.readGeneration();
      const retained = JSON.parse(
        String(local.payloads.get(local.generation.working['issue:I_test'].payloadPath))
      );
      assert.match(retained.nativeApproval.beforeBody, /mode="human"/);
      assert.equal(retained.nativeApproval.approved.mode, 'full-auto');
      assert.equal((await f.run()).status, 'complete');
    }
  );

  nativeFixture.test(
    'stale unattempted approval can be invalidated, genuinely approved again and completed',
    async (t) => {
      const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
      const changedTrunk = 'b'.repeat(40);
      const current = { value: trunk };
      const g = await nativePlanFixture(t, { trunkState: current });
      const stale = await g.store.readGeneration();
      current.value = changedTrunk;
      await assert.rejects(g.run(), /trunk-drift/);
      assert.deepEqual(g.calls, []);
      const prepared = await g.store.readGeneration();
      const coordinator = await import('../../task-tracker/lib/story-cache/transition-batch.mjs');
      await nativeFixture.context(g.root, () =>
        coordinator.releaseUnattemptedTransition({
          store: g.store,
          claim: g.claim,
          batchId: prepared.generation.batch.batchId,
        })
      );
      assert.equal(typeof nativeStaging.invalidateNativePlanApproval, 'function');
      await nativeFixture.context(g.root, () =>
        nativeStaging.invalidateNativePlanApproval({
          store: g.store,
          claim: g.claim,
          approvalRef: prepared.generation.working['issue:I_test'].capabilityRef,
        })
      );
      const reset = await g.store.readGeneration();
      assert.equal(reset.generation.working['issue:I_test'].capabilityRef, null);
      const fresh = await nativeFixture.context(g.root, () =>
        nativeStaging.stageNativePlanApproval({
          store: g.store,
          claim: g.claim,
          cfg: g.ctx.cfg,
          deps: g.deps,
        })
      );
      const rebound = await nativeFixture.context(g.root, () =>
        nativeStaging.rebindNativePlanApproval({
          store: g.store,
          claim: g.claim,
          cfg: g.ctx.cfg,
          deps: g.deps,
        })
      );
      g.ports.capabilities = [
        {
          base: g.base,
          candidate: fresh.body,
          capability: { nativePlanApprovalCapability: rebound.capability },
        },
      ];
      const issue = g.ctx.effects.find((effect) => effect.kind === 'issue-update');
      issue.candidate.body = fresh.body;
      issue.intendedDigest = hash(fresh.body);
      const authority = await import('../../task-tracker/lib/plan-transition-authority.mjs');
      const updated = authority.renderPlanTransitionCandidateAuthority(
        authority.resolvePlanTransitionAuthority({
          repository: 'owner/repo',
          issue: nativeFixture.identity.issueNumber,
          transitionId: g.ctx.transition.id,
          body: fresh.body,
          cfg: g.ctx.cfg,
          recordedAt: g.authorityRecord.recordedAt,
        })
      );
      const effect = g.ctx.effects.find((effect) => effect.kind === 'comment-create');
      effect.candidate = updated;
      effect.intendedDigest = hash(updated);
      await nativeFixture.changeGeneration(g, (generation, payloads) => {
        const entry = generation.working[effect.key];
        payloads.set('working/renewed-authority.md', updated);
        entry.payloadPath = 'working/renewed-authority.md';
        entry.digest = hash(updated);
      });
      assert.equal((await g.run()).status, 'complete');
      assert.equal((await g.store.readGeneration()).generation.batch.status, 'complete');
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      await fs.access(path.join(g.store.cachePath, prepared.manifest.payloadPath));
      assert.ok(stale.manifest.generation > 0);
    }
  );

  nativeFixture.test(
    'approval invalidation refuses any attempted publication and preserves its evidence',
    async (t) => {
      const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
      const f = await nativePlanFixture(t);
      f.ports.apply = async () => {
        throw new Error('offline uncertain effect');
      };
      assert.equal((await f.run()).status, 'uncertain');
      const before = await f.store.readGeneration();
      await assert.rejects(
        nativeFixture.context(f.root, () =>
          nativeStaging.invalidateNativePlanApproval({
            store: f.store,
            claim: f.claim,
            approvalRef: before.generation.working['issue:I_test'].capabilityRef,
          })
        ),
        /publication-pending/
      );
      assert.equal(
        (await f.store.readGeneration()).manifest.generation,
        before.manifest.generation
      );
    }
  );

  nativeFixture.test(
    'a neutral ordinary working edit followed by genuine approval preserves real decomposition admission',
    async (t) => {
      const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
      const f = await nativePlanFixture(t, { workingEdit: 'neutral' });
      const result = await f.run();
      assert.equal(result.status, 'complete', JSON.stringify(result.guardRefusals));
      assert.match(f.cloud.resources['issue:I_test'].body, /Retain this unrelated local note/);
    }
  );
  nativeFixture.test(
    'a genuine business-input edit still requires refreshed decomposition evidence',
    async (t) => {
      const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
      const f = await nativePlanFixture(t, { workingEdit: 'scope' });
      const result = await f.run();
      assert.equal(result.status, 'blocked');
      assert.ok(result.guardRefusals.some((row) => /candidate-inputs-changed/.test(row.reason)));
      assert.deepEqual(f.calls, []);
    }
  );

  nativeFixture.test(
    'a cleared dependency graph cannot carry stale BLOCKED through Status',
    async (t) => {
      const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
      const f = await nativePlanFixture(t, { disposition: 'BLOCKED' });
      const result = await f.run();
      assert.equal(result.status, 'blocked');
      assert.ok(result.guardRefusals.some((row) => /disposition-effect-required/.test(row.reason)));
      assert.deepEqual(f.calls, []);
    }
  );
  nativeFixture.test(
    'an explicit confirmed disposition clear can precede native Status',
    async (t) => {
      const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
      const f = await nativePlanFixture(t, { disposition: 'BLOCKED', clearDisposition: true });
      assert.equal((await f.run()).status, 'complete');
      assert.equal(f.cloud.fields.find((row) => row.fieldId === 'F_disposition').value, null);
    }
  );

  nativeFixture.test(
    'a configured v3 Plan completes using durable bytes and independently observed current native choices',
    async (t) => {
      const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
      const f = await nativePlanFixture(t, { adaptive: true });
      const result = await f.run();
      assert.equal(result.status, 'complete', JSON.stringify(result.guardRefusals));
    }
  );

  nativeFixture.test(
    'native configured v3 supports the existing Estimate field alias',
    async (t) => {
      const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
      const f = await nativePlanFixture(t, { adaptive: true, legacyEstimateAlias: true });
      const result = await f.run();
      assert.equal(result.status, 'complete', JSON.stringify(result.guardRefusals));
    }
  );
  nativeFixture.test(
    'same-grid Refine renewal invalidates durable approval from the actual native source',
    async (t) => {
      const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
      const f = await nativePlanFixture(t, { adaptive: true });
      const record = await f.store.readGeneration();
      const approved = JSON.parse(
        String(record.payloads.get(record.generation.working['issue:I_test'].payloadPath))
      );
      const { stampRefinementSnapshot } =
        await import('../../task-tracker/lib/refinement-snapshot.mjs');
      const { formatIssueFieldDb } = await import('../../task-tracker/issue-field-db.mjs');
      const fields = approved.body.match(/<!-- aitm-fields:[^\n]*-->/)[0];
      let renewed = approved.body.replace(
        fields,
        formatIssueFieldDb({ priority: 'P1', size: 'M', estimate: 3, rank: 1 }).trim()
      );
      renewed = stampRefinementSnapshot(renewed, {
        labels: ['feature'],
        ts: '2026-10-20T00:00:00Z',
      }).replace(/<!-- aitm-fields:[^\n]*-->/, fields);
      await assert.rejects(
        nativeFixture.context(f.root, () =>
          nativeStaging.rebindNativePlanApproval({
            store: f.store,
            claim: f.claim,
            cfg: f.ctx.cfg,
            body: renewed,
            deps: f.deps,
          })
        ),
        /current-selection-drift/
      );
      assert.deepEqual(f.calls, []);
    }
  );
  nativeFixture.test(
    'a self-consistent forecast from an old policy cannot override the current native model',
    async (t) => {
      const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
      const f = await nativePlanFixture(t, { adaptive: true, historicalPolicy: true });
      await assert.rejects(f.run(), /current-selection/);
      assert.deepEqual(f.calls, []);
    }
  );

  nativeFixture.test(
    'a copied published marker is not an admitted native candidate grant',
    async (t) => {
      const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
      const f = await nativePlanFixture(t, { publishedApproval: true, skipApproval: true });
      await assert.rejects(f.run(), /approval-provenance/);
      assert.deepEqual(f.calls, []);
    }
  );
  nativeFixture.test(
    'lost durable v3 evidence refuses locally before every provider effect',
    async (t) => {
      const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
      const f = await nativePlanFixture(t, { adaptive: true });
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      await fs.unlink(
        path.join(
          f.configured.evidenceStore.path,
          'manifests',
          f.configured.forecast.localEvidence.manifestDigest + '.json'
        )
      );
      await assert.rejects(f.run(), /current-selection|local-evidence/);
      assert.deepEqual(f.calls, []);
    }
  );
}
