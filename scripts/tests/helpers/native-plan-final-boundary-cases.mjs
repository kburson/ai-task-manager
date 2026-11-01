// @story #2069
import assert from 'node:assert/strict';
import * as nativeFixture from './story-timing-candidate-fixture.mjs';
import { nativePlanFixture } from './native-plan-transition-fixture.mjs';

export function registerNativePlanFinalBoundaryTests() {
  nativeFixture.test(
    'candidate decomposition reads its actual selected plan instead of reusing the baseline plan',
    async (t) => {
      const f = await nativePlanFixture(t, { adaptive: true });
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      await fs.writeFile(path.join(f.root, 'docs/alternate-plan.md'), f.configured.planBytes);
      const { collectHookDecompositionSnapshot } =
        await import('../../task-tracker/lib/decomposition-hook-authority.mjs');
      const { derivePlanDecompositionProjection, planProjectionResources } =
        await import('../../task-tracker/lib/plan-decomposition-projection.mjs');
      const { current: source } = await nativeFixture.context(f.root, () =>
        collectHookDecompositionSnapshot({
          issue: nativeFixture.identity.issueNumber,
          cfg: f.ctx.cfg,
          projectDir: f.root,
          deps: f.deps,
        })
      );
      const body = f.base.replace('docs/selected-plan.md', 'docs/alternate-plan.md');
      const candidate = await derivePlanDecompositionProjection({
        source,
        identity: nativeFixture.identity,
        cfg: f.ctx.cfg,
        projectDir: f.root,
        ...planProjectionResources({ snapshot: f.cloud, body }),
        deps: {
          readPlanAtCommit: async ({ planPath }) => {
            assert.equal(planPath, 'docs/alternate-plan.md');
            return f.configured.planBytes.toString();
          },
        },
      });
      assert.equal(candidate.input.plan.path, 'docs/alternate-plan.md');
      assert.notEqual(candidate.inputDigest, source.inputDigest);
      assert.equal(candidate.basis, 'frozen-candidate');
      assert.equal(candidate.sourceObservations.readIssue.status, 'projected');
      assert.equal(source.sourceObservations.readIssue.status, 'observed');
    }
  );
  nativeFixture.test(
    'a material Human Attention proposal cannot reuse the native assessment',
    async (t) => {
      const f = await nativePlanFixture(t);
      const { createHash } = await import('node:crypto');
      const { stageOwnedComment } =
        await import('../../task-tracker/lib/story-cache/stage-comment.mjs');
      const body =
        '### 🔁 Plan re-estimate\n\n**HUMAN ATTENTION**: not auto-applied\n\n| Field | Before | After |\n|---|---|---|\n| Size | M | XL |\n| Estimate (h) | 3 | 100 |\n\n<!-- aitm-owned-comment key="estimate.proposal" -->';
      const key = 'comment:new:estimate-proposal';
      await nativeFixture.context(f.root, () =>
        stageOwnedComment({ store: f.store, claim: f.claim, key, body })
      );
      f.ctx.effects.push({
        key,
        kind: 'comment-create',
        target: {
          identity: nativeFixture.identity,
          commentNodeId: null,
          creationIntent: 'estimate-proposal',
        },
        beforeDigest: null,
        intendedDigest: createHash('sha256').update(body).digest('hex'),
        candidate: body,
        dependencies: [],
        attempted: false,
        outcome: null,
      });
      for (const effect of f.ctx.effects)
        if (effect.kind === 'issue-update' || effect.key === f.ctx.statusKey)
          effect.dependencies = [...effect.dependencies, key].sort();
      const result = await f.run();
      assert.equal(result.status, 'blocked');
      assert.ok(result.guardRefusals.some((row) => row.id === 'plan-exit-decomposition'));
      assert.deepEqual(f.calls, []);
    }
  );
  for (const [uncertain, mode] of [
    [false, 'human'],
    [true, 'human'],
    [false, 'full-auto'],
  ]) {
    nativeFixture.test(
      `a genuinely assessed and approved successor forecast (${mode}) ${uncertain ? 'retains uncertainty before Status' : 'publishes exactly once before Status'}`,
      async (t) => {
        const f = await nativePlanFixture(t, { adaptive: true, pendingForecast: true, mode });
        const record = await f.store.readGeneration();
        const approved = JSON.parse(
          String(record.payloads.get(record.generation.working['issue:I_test'].payloadPath))
        );
        assert.equal(
          approved.nativeApproval.approved.forecastRecordId,
          f.configured.stagedRecord.recordId
        );
        assert.ok(approved.nativeApproval.decomposition.inputDigest);
        const apply = f.ports.apply;
        let attempts = 0;
        f.ports.apply = async (effect) => {
          if (effect.key === 'comment:new:forecast-successor') {
            attempts++;
            if (uncertain) throw new Error('offline unknown successor create');
          }
          return apply(effect);
        };
        assert.equal((await f.run()).status, uncertain ? 'uncertain' : 'complete');
        assert.equal(attempts, 1);
        assert.equal(f.calls.includes('project-field-update'), !uncertain);
        if (!uncertain) {
          const { readDecompositionRecords } =
            await import('../../task-tracker/lib/decomposition-records.mjs');
          assert.equal(
            readDecompositionRecords(f.cloud.resources['issue:I_test'].body).assessment.inputDigest,
            approved.nativeApproval.decomposition.inputDigest
          );
        }
      }
    );
  }
  nativeFixture.test(
    'a field-only estimate divergence cannot reuse the native assessment',
    async (t) => {
      const f = await nativePlanFixture(t);
      const { canonicalRecordJson } =
        await import('../../task-tracker/lib/github-records/canonical-json.mjs');
      const { createHash } = await import('node:crypto');
      const hash = (value) => createHash('sha256').update(value).digest('hex');
      const current = await f.store.readGeneration();
      const before = current.generation.baseSnapshot.fields.find(
        (field) => field.fieldId === 'F_estimate'
      );
      const candidate = { ...before, value: 100 };
      const key = 'project-field:PI_test:F_estimate';
      const raw = canonicalRecordJson(candidate);
      await nativeFixture.changeGeneration(f, (generation, payloads) => {
        payloads.set('working/divergent-field.json', raw);
        generation.working[key] = {
          kind: 'project-field',
          capabilityRef: null,
          payloadPath: 'working/divergent-field.json',
          digest: hash(raw),
        };
        generation.dirtyKeys = [...generation.dirtyKeys, key].sort();
      });
      f.ctx.effects.push({
        key,
        kind: 'project-field-update',
        target: {
          identity: nativeFixture.identity,
          projectId: 'P_test',
          itemId: 'PI_test',
          fieldId: 'F_estimate',
          type: 'NUMBER',
        },
        beforeDigest: hash(canonicalRecordJson(before)),
        intendedDigest: hash(raw),
        candidate,
        dependencies: [],
        attempted: false,
        outcome: null,
      });
      for (const effect of f.ctx.effects)
        if (effect.kind === 'issue-update' || effect.key === f.ctx.statusKey)
          effect.dependencies = [...effect.dependencies, key].sort();
      const result = await f.run();
      assert.equal(result.status, 'blocked');
      assert.ok(result.guardRefusals.some((row) => row.id === 'plan-exit-decomposition'));
      assert.deepEqual(f.calls, []);
    }
  );
  nativeFixture.test(
    'expiry during final body validation preserves confirmed Status without sending the body',
    async (t) => {
      t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-01T12:00:00Z') });
      const f = await nativePlanFixture(t, {
        outcome: 'waived',
        estimate: false,
        waiverExpiresAt: '2026-11-01T12:05:00.000Z',
      });
      f.ports.validateIssue = async () => {
        t.mock.timers.setTime(new Date('2026-11-01T12:10:00Z').getTime());
        return { verified: true };
      };
      await assert.rejects(f.run(), /expired-admission/);
      assert.ok(f.calls.includes('project-field-update'));
      assert.ok(!f.calls.includes('issue-update'));
      const effects = (await f.store.readGeneration()).generation.batch.effects;
      assert.equal(
        effects.find((effect) => effect.key === f.ctx.statusKey).outcome.state,
        'confirmed'
      );
      assert.equal(effects.find((effect) => effect.kind === 'issue-update').attempted, false);
    }
  );
  nativeFixture.test(
    'disabled approval permits a neutral frozen edit without inventing an approval grant',
    async (t) => {
      const f = await nativePlanFixture(t, { outcome: 'not-required', workingEdit: 'neutral' });
      assert.equal((await f.run()).status, 'complete');
      assert.doesNotMatch(f.cloud.resources['issue:I_test'].body, /<!-- aitm-plan-approved/);
    }
  );
  nativeFixture.test(
    'a genuine superseding forecast at equal hours cannot reuse the published assessment',
    async (t) => {
      const f = await nativePlanFixture(t, { adaptive: true });
      const { createAitmRecordEnvelope, renderAitmRecord } =
        await import('../../task-tracker/lib/github-records/record-envelope.mjs');
      const { stageOwnedComment } =
        await import('../../task-tracker/lib/story-cache/stage-comment.mjs');
      const { createHash } = await import('node:crypto');
      const old = f.configured.record;
      const record = createAitmRecordEnvelope({
        ...old,
        ...old.authority,
        recordId: '01M2Y000000000000000000098',
        predecessor: old.recordId,
        supersedes: old.recordId,
        payload: { ...old.payload, supersedesForecastRecordId: old.recordId },
      });
      const body = renderAitmRecord({ envelope: record });
      const key = 'comment:new:successor-forecast';
      await nativeFixture.context(f.root, () =>
        stageOwnedComment({ store: f.store, claim: f.claim, key, body })
      );
      f.ctx.effects.push({
        key,
        kind: 'comment-create',
        target: {
          identity: nativeFixture.identity,
          commentNodeId: null,
          creationIntent: 'successor-forecast',
        },
        beforeDigest: null,
        intendedDigest: createHash('sha256').update(body).digest('hex'),
        candidate: body,
        dependencies: [],
        attempted: false,
        outcome: null,
      });
      for (const effect of f.ctx.effects)
        if (effect.kind === 'issue-update' || effect.key === f.ctx.statusKey)
          effect.dependencies = [...effect.dependencies, key].sort();
      const result = await f.run();
      assert.equal(result.status, 'blocked');
      assert.ok(result.guardRefusals.some((row) => /candidate-inputs-changed/.test(row.reason)));
      assert.deepEqual(f.calls, []);
    }
  );
  nativeFixture.test(
    'waiving approval does not permit a changed business scope to reuse decomposition evidence',
    async (t) => {
      const f = await nativePlanFixture(t, {
        outcome: 'waived',
        estimate: false,
        workingEdit: 'scope',
      });
      const result = await f.run();
      assert.equal(result.status, 'blocked');
      assert.ok(result.guardRefusals.some((row) => /candidate-inputs-changed/.test(row.reason)));
      assert.deepEqual(f.calls, []);
    }
  );
  for (const waiver of ['planning.planned-estimate', 'planning.forecast']) {
    nativeFixture.test(
      `a partial ${waiver} waiver retains independently satisfied native evidence`,
      async (t) => {
        const f = await nativePlanFixture(t, {
          adaptive: true,
          workflowWaiver: true,
          waiverRequirementIds: [waiver],
          estimate: waiver !== 'planning.planned-estimate',
        });
        assert.equal((await f.run()).status, 'complete');
      }
    );
  }
  for (const point of ['validation', 'journal']) {
    nativeFixture.test(
      `expiry during final pre-Status ${point} prevents dispatch and records no send`,
      async (t) => {
        t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-01T12:00:00Z') });
        const f = await nativePlanFixture(t, {
          outcome: 'waived',
          estimate: false,
          waiverExpiresAt: '2026-11-01T12:05:00.000Z',
        });
        if (point === 'validation')
          f.ports.validatePreStatus = async () => {
            t.mock.timers.setTime(new Date('2026-11-01T12:10:00Z').getTime());
            return { verified: true };
          };
        else {
          const fs = (await import('node:fs/promises')).default;
          const rename = fs.rename;
          t.mock.method(fs, 'rename', async (...args) => {
            const value = await rename(...args);
            if (String(args[1]) === f.store.cachePath + '/manifest.json') {
              const record = await f.store.readGeneration();
              const status = record.generation.batch?.effects.find(
                (effect) => effect.key === f.ctx.statusKey
              );
              if (status?.outcome?.state === 'dispatching')
                t.mock.timers.setTime(new Date('2026-11-01T12:10:00Z').getTime());
            }
            return value;
          });
        }
        await assert.rejects(f.run(), /expired-admission/);
        assert.ok(!f.calls.includes('project-field-update'));
        const batch = (await f.store.readGeneration()).generation.batch;
        const status = batch.effects.find((effect) => effect.key === f.ctx.statusKey);
        assert.equal(status.attempted, false);
        assert.equal(status.outcome, null);
        assert.ok(batch.effects.some((effect) => effect.outcome?.state === 'confirmed'));
      }
    );
  }
  for (const missing of [false, true]) {
    nativeFixture.test(
      `a fenced Refine example cannot replace the genuine ${missing ? 'missing' : 'valid'} appendix`,
      async (t) => {
        const f = await nativePlanFixture(t, {
          fencedEstimateExample: true,
          missingEstimateAppendix: missing,
        });
        const result = await f.run();
        assert.equal(result.status, missing ? 'blocked' : 'complete');
        if (missing) assert.deepEqual(f.calls, []);
      }
    );
  }
  nativeFixture.test(
    'a neutral working edit completes when native approval and forecast are waived',
    async (t) => {
      const f = await nativePlanFixture(t, {
        outcome: 'waived',
        estimate: false,
        workingEdit: 'neutral',
      });
      const result = await f.run();
      assert.equal(result.status, 'complete', JSON.stringify(result.guardRefusals));
      assert.match(f.cloud.resources['issue:I_test'].body, /Retain this unrelated local note/);
    }
  );
}
