// @story #2069
import assert from 'node:assert/strict';
import * as nativeFixture from './story-timing-candidate-fixture.mjs';
import { nativePlanFixture } from './native-plan-transition-fixture.mjs';
import { registerNativePlanLocalPortTests } from './native-plan-local-port-cases.mjs';

export function registerNativePlanIssuerTests() {
  for (const changed of [false, true]) {
    nativeFixture.test(
      `a native Not Planned child without board Status ${changed ? 'supports an epic assessment change' : 'permits its epic to complete'}`,
      async (t) => {
        const f = await nativePlanFixture(t, {
          epic: true,
          epicProposal: changed,
          epicChildMode: 'not-planned-unset',
        });
        assert.equal(f.stagingRemoteReads, 0);
        const children = f.epicFixture.mappedChildren();
        const { isAcceptedTerminalChild } =
          await import('../../task-tracker/lib/epic-children-gate.mjs');
        assert.equal(children[0].boardState, '');
        assert.equal(isAcceptedTerminalChild(children[0]), true);
        assert.equal((await f.run()).status, 'complete');
        assert.ok(
          !f.epicFixture.rawChildren[0].projectItems.nodes[0].fieldValues.nodes.some(
            (field) => field.field.id === f.ctx.cfg.kanbanFieldId
          )
        );
      }
    );
  }
  nativeFixture.test(
    'a Completed child without board Done still refuses native epic effects',
    async (t) => {
      const f = await nativePlanFixture(t, { epic: true, epicChildMode: 'completed-unset' });
      const result = await f.run();
      assert.equal(result.status, 'blocked');
      assert.deepEqual(f.calls, []);
    }
  );
  nativeFixture.test(
    'an open child with no board Status cannot become retained planning authority',
    async (t) => {
      await assert.rejects(
        nativePlanFixture(t, { epic: true, epicChildMode: 'open-unset' }),
        /native-child-inventory-invalid|decomposition:readiness-child-state/
      );
    }
  );
  nativeFixture.test(
    'an independently changed epic child graph cannot publish under retained approval',
    async (t) => {
      const f = await nativePlanFixture(t, { epic: true });
      f.epicFixture.rawChildren[0].projectItems.nodes[0].fieldValues.nodes.find(
        (field) => field.field.id === 'F_rank'
      ).number = 2;
      const result = await f.run();
      assert.equal(result.status, 'blocked');
      assert.deepEqual(f.calls, []);
    }
  );
  nativeFixture.test(
    'an incomplete retained epic child descriptor refuses assessment staging locally',
    async (t) => {
      await assert.rejects(
        nativePlanFixture(t, {
          epic: true,
          epicProposal: true,
          stagingOverride: async (input) => {
            const inventory = structuredClone(input.deps.nativeChildInventory);
            delete inventory.children[0].body;
            return {
              ...input,
              deps: {
                ...input.deps,
                nativeChildInventory: inventory,
                fetchEpicChildren: () => assert.fail('provider child lookup'),
              },
            };
          },
        }),
        /native-child-inventory-invalid/
      );
    }
  );
  for (const changed of [false, true]) {
    nativeFixture.test(
      `a retained nonempty epic graph ${changed ? 'supports a freshly assessed proposal' : 'supports genuine approval and native admission'}`,
      async (t) => {
        const f = await nativePlanFixture(t, { epic: true, epicProposal: changed });
        assert.equal(f.stagingRemoteReads, 0);
        const record = await f.store.readGeneration();
        const issue = JSON.parse(
          String(record.payloads.get(record.generation.working['issue:I_test'].payloadPath))
        );
        const { verifyEpicOrchestrationPlan } =
          await import('../../task-tracker/lib/epic-orchestration-plan.mjs');
        assert.equal(
          verifyEpicOrchestrationPlan(issue.body, {
            children: f.epicFixture.mappedChildren(),
            trunkSha: 'a'.repeat(40),
          }).ok,
          true
        );
        if (changed) assert.ok(issue.nativeApproval.decomposition.inputDigest);
        const result = await f.run();
        assert.equal(result.status, 'complete', JSON.stringify(result.guardRefusals));
      }
    );
  }
  for (const drift of [false, true]) {
    nativeFixture.test(
      `an older solo Plan without Ready-for-Planning history ${drift ? 'refuses later trunk drift' : 'retains a genuine current trunk and completes'}`,
      async (t) => {
        const current = { value: 'a'.repeat(40) };
        const f = await nativePlanFixture(t, { legacyPlan: true, trunkState: current });
        const record = await f.store.readGeneration();
        const issue = JSON.parse(
          String(record.payloads.get(record.generation.working['issue:I_test'].payloadPath))
        );
        assert.equal(issue.nativeApproval.approved.trunkSha, 'a'.repeat(40));
        assert.doesNotMatch(issue.body, /aitm-entered-ready-for-plan/);
        if (drift) {
          current.value = 'b'.repeat(40);
          await assert.rejects(f.run(), /trunk-drift/);
          assert.deepEqual(f.calls, []);
        } else assert.equal((await f.run()).status, 'complete');
      }
    );
  }
  registerNativePlanLocalPortTests();
  nativeFixture.test(
    'stable logical proposal identity survives a confirmed create with reverse lexical provider IDs',
    async (t) => {
      const f = await nativePlanFixture(t, { adaptive: true, proposalOrderCase: true });
      const { openStoryStore } = await import('../../task-tracker/lib/story-cache/store.mjs');
      f.args.store = await openStoryStore({
        projectRoot: f.root,
        identity: nativeFixture.identity,
      });
      let reopenedConfirmation = false;
      f.ports.validatePreStatus = async () => {
        const reopened = await openStoryStore({
          projectRoot: f.root,
          identity: nativeFixture.identity,
        });
        const journal = await reopened.readGeneration();
        assert.equal(
          journal.generation.batch.effects.find(
            (effect) => effect.key === 'comment:new:A_new_proposal'
          ).outcome.state,
          'confirmed'
        );
        reopenedConfirmation = true;
        return { verified: true };
      };
      assert.equal(f.stagingRemoteReads, 0);
      assert.equal((await f.run()).status, 'complete');
      assert.equal(reopenedConfirmation, true);
      assert.ok(
        f.cloud.inventory.indexOf('IC_A_new_proposal') <
          f.cloud.inventory.indexOf('IC_Z_prior_proposal')
      );
      const batch = (await f.store.readGeneration()).generation.batch;
      assert.equal(
        batch.effects.find((effect) => effect.key === 'comment:new:A_new_proposal').outcome.state,
        'confirmed'
      );
      assert.equal(
        batch.effects.find((effect) => effect.key === f.ctx.statusKey).outcome.state,
        'confirmed'
      );
    }
  );
  nativeFixture.test(
    'assessment staging never exposes a native cloud-write capability',
    async (t) => {
      const f = await nativePlanFixture(t, {
        adaptive: true,
        pendingForecast: true,
        probeAssessment: true,
      });
      assert.deepEqual(f.assessmentProbe, { escaped: false, returnedCapability: false });
      assert.equal((await f.run()).status, 'complete');
    }
  );
  nativeFixture.test(
    'an already hydrated successor approval stages with zero remote authority reads',
    async (t) => {
      const f = await nativePlanFixture(t, { adaptive: true, pendingForecast: true });
      assert.equal(f.stagingRemoteReads, 0);
      assert.equal((await f.run()).status, 'complete');
    }
  );
  nativeFixture.test(
    'logical proposal order is stable and old assessment evidence remains readable through native refresh',
    async (t) => {
      const { fixture, subject, hash } =
        await import('../unit/task-tracker/lib/decomposition-authority-fixtures.mjs');
      const { collectDecompositionAuthority } =
        await import('../../task-tracker/lib/decomposition-authority.mjs');
      const { refreshDecompositionProjection } =
        await import('../../task-tracker/lib/decomposition-projection.mjs');
      const { readDecompositionRecords, replaceDecompositionRecords } =
        await import('../../task-tracker/lib/decomposition-records.mjs');
      const { assessDecomposition } =
        await import('../../task-tracker/lib/decomposition-assessment.mjs');
      const f = fixture(3);
      const proposals = [
        {
          proposalId: 'comment:proposal-b:human-attention',
          hours: 3,
          size: 'M',
          sourceDigest: hash('b'),
        },
        {
          proposalId: 'comment:proposal-a:human-attention',
          hours: 3,
          size: 'M',
          sourceDigest: hash('a'),
        },
      ];
      f.values.forecast.proposals = proposals;
      const args = {
        subject,
        cfg: { repo: 'o/r', projectId: 'PVT_a' },
        projectDir: t.unitRoot,
        deps: f.deps,
      };
      const current = await nativeFixture.context(t.unitRoot, () =>
        collectDecompositionAuthority(args)
      );
      const oldInput = structuredClone(current.input);
      oldInput.observations.find((row) => row.resource === 'forecast').digest = hash(
        f.values.forecast
      );
      oldInput.estimate.proposalId = proposals[1].proposalId;
      const old = assessDecomposition(oldInput, { assessedAt: '2026-10-19T00:00:00.000Z' });
      const oldBytes = replaceDecompositionRecords(f.body, { assessment: old, publication: null });
      f.body = oldBytes;
      assert.deepEqual(readDecompositionRecords(oldBytes).assessment, old);
      assert.equal(
        (await nativeFixture.context(t.unitRoot, () => collectDecompositionAuthority(args)))
          .projection.status,
        'stale'
      );
      const refreshed = await nativeFixture.context(t.unitRoot, () =>
        refreshDecompositionProjection(args)
      );
      assert.equal(refreshed.status, 'confirmed');
      const before = await nativeFixture.context(t.unitRoot, () =>
        collectDecompositionAuthority(args)
      );
      f.values.forecast.proposals = [...proposals].reverse();
      const reversed = await nativeFixture.context(t.unitRoot, () =>
        collectDecompositionAuthority(args)
      );
      assert.equal(reversed.inputDigest, before.inputDigest);
      assert.equal(reversed.projection.status, 'current');
      assert.deepEqual(readDecompositionRecords(oldBytes).assessment, old);
    }
  );
}
