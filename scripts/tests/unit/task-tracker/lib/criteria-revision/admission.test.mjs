// @story #1852
import test from 'node:test';
import { validateGovernedLinkedPlan } from '../../../../../task-tracker/lib/governed-plan-policy.mjs';
import { hashRevisionValue } from '../../../../../task-tracker/lib/criteria-revision/schema.mjs';
import assert from 'node:assert/strict';
import { memoryRuntime, authorityResult } from '../../../../fixtures/criteria-revision-runtime.mjs';
import {
  COMMAND_CATALOG,
  routeIdentityForCommand,
} from '../../../../../task-tracker/lib/command-surface/catalog.mjs';
import { listLifecycleActions } from '../../../../../task-tracker/lib/lifecycle-policy/actions.mjs';
import { readFileSync } from 'node:fs';
const domain = await import('../../../../../task-tracker/lib/criteria-revision/domain.mjs').catch(
  (e) => {
    if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw e;
  }
);
const lock = await import('../../../../../task-tracker/lib/criteria-revision/interlock.mjs').catch(
  (e) => {
    if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw e;
  }
);
const api = await import('../../../../../task-tracker/lib/criteria-revision/admission.mjs').catch(
  (e) => {
    if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw e;
  }
);
function setup() {
  const r = memoryRuntime();
  r.context.domain = domain.registerRevisionDomain(
    {
      repository: r.context.repository,
      commonDir: '/git/common',
      host: 'host-one',
      quiescenceConfirmed: true,
    },
    r.ports
  );
  r.context.issue = 1852;
  return r;
}
test('missing, corrupt, wrong-version, dirty and restarted-domain admission deny', async () => {
  assert.equal(typeof api.readAdmission, 'function');
  const r = setup();
  assert.equal(api.readAdmission(r.context, r.ports).state, 'deny');
  await api.refreshAdmission(
    { context: r.context, observe: () => authorityResult(r.context, r.context.domain) },
    r.ports
  );
  assert.equal(api.readAdmission(r.context, r.ports).state, 'allow');
  const p = [...r.files.keys()].find((p) => p.endsWith('/1852.json'));
  const good = r.files.get(p);
  for (const value of [
    'bad',
    JSON.stringify({ ...JSON.parse(good), schema: 'future' }),
    JSON.stringify({ ...JSON.parse(good), dirty: true }),
    JSON.stringify(
      Object.fromEntries(
        Object.entries({ ...JSON.parse(good), schema: 'aitm.revision-admission/v1' }).filter(
          ([key]) => key !== 'localPlan'
        )
      )
    ),
  ]) {
    r.files.set(p, value);
    assert.equal(api.readAdmission(r.context, r.ports).state, 'deny');
  }
  r.files.set(p, good);
  domain.registerRevisionDomain(
    {
      repository: 'owner/repo',
      commonDir: '/git/common',
      host: 'host-one',
      quiescenceConfirmed: true,
    },
    r.ports
  );
  assert.equal(api.readAdmission(r.context, r.ports).state, 'deny');
});
test('allow requires verified complete empty chain and baseline admission; failed refresh replaces allow with deny', async () => {
  const r = setup();
  for (const change of [
    (x) => {
      x.authority.complete = false;
    },
    (x) => {
      x.authority.chain = 'unknown';
    },
    (x) => {
      x.authority.baselineAllowed = false;
    },
    (x) => {
      x.authority.pending = true;
    },
  ]) {
    const result = authorityResult(r.context, r.context.domain);
    change(result);
    await api.refreshAdmission({ context: r.context, observe: () => result }, r.ports);
    assert.equal(api.readAdmission(r.context, r.ports).state, 'deny');
  }
  await api.refreshAdmission(
    { context: r.context, observe: () => authorityResult(r.context, r.context.domain) },
    r.ports
  );
  assert.equal(api.readAdmission(r.context, r.ports).state, 'allow');
  await api.refreshAdmission(
    {
      context: r.context,
      observe: () => {
        throw new Error('offline');
      },
    },
    r.ports
  );
  assert.equal(api.readAdmission(r.context, r.ports).state, 'deny');
});
test('raw observations cannot publish allow and a prior receipt cannot overwrite a newer deny', async () => {
  const r = setup();
  await lock.withRevisionInterlock(
    r.context,
    async (capability) => {
      const observation = await api.observeAdmission(
        {
          capability,
          context: r.context,
          observe: () => authorityResult(r.context, r.context.domain),
        },
        r.ports
      );
      await assert.rejects(
        api.publishAdmission(
          { capability, observation: authorityResult(r.context, r.context.domain), state: 'allow' },
          r.ports
        ),
        /admission-observation/
      );
      await api.publishAdmission(
        { capability, observation: { issue: 1852 }, state: 'deny' },
        r.ports
      );
      await assert.rejects(
        api.publishAdmission({ capability, observation, state: 'allow' }, r.ports),
        /admission-stale/
      );
      assert.equal(api.readAdmission(r.context, r.ports).state, 'deny');
    },
    r.ports
  );
});
test('registered command, action and executable catalogs have no revision transaction route', () => {
  assert.equal(
    COMMAND_CATALOG.some((x) => x.name.startsWith('criteria-revise')),
    false
  );
  assert.equal(
    listLifecycleActions().some((x) => x.id.startsWith('criteria-revise')),
    false
  );
  assert.equal(routeIdentityForCommand('criteria-revise'), null);
  const pkg = JSON.parse(
    readFileSync(new URL('../../../../../../package.json', import.meta.url), 'utf8')
  );
  assert.equal(
    Object.values(pkg.bin).some((entry) => /criteria-revision|criteria-revise/.test(entry)),
    false
  );
});
test('a revised admission requires the current revision, contract epoch and protected sources', async () => {
  const r = setup();
  function revised() {
    const result = authorityResult(r.context, r.context.domain),
      o = result.observation;
    o.revision = 1;
    o.revisionId = 'revision-one';
    const planSources = ['user-story', 'story-intent', 'linked-plan'].map((identity, index) => ({
      identity,
      hash:
        identity === 'linked-plan'
          ? hashRevisionValue(
              validateGovernedLinkedPlan({ body: o.body.bytes, projectDir: o.executor.worktree })
            )
          : 'sha256:' + String(index + 1).repeat(64),
    }));
    o.protectedSourceBindings.push(...planSources);
    o.revisionRecords.records = [
      {
        eventId: 'event-one',
        transactionId: 'transaction-one',
        operationId: 'operation-one',
        proposalDigest: 'sha256:' + 'b'.repeat(64),
        bytes: 'verified applied event',
      },
    ];
    result.authority = {
      ...result.authority,
      chain: 'verified',
      head: 'event-one',
      baselineAllowed: false,
      planApproval: {
        schema: 'aitm.plan-approval-binding/v1',
        revisionId: 'revision-one',
        semanticContractDigest: 'sha256:' + 'a'.repeat(64),
        contractEpoch: null,
        sourceBindings: structuredClone(planSources),
        provenance: { mode: 'full-auto', authorityReference: 'authority', auditReference: 'audit' },
      },
    };
    return result;
  }
  await api.refreshAdmission({ context: r.context, observe: revised }, r.ports);
  assert.equal(api.readAdmission(r.context, r.ports).state, 'allow');
  assert.deepEqual(
    api.readAdmission(r.context, r.ports).sourceBindings,
    revised().observation.protectedSourceBindings
  );
  for (const change of [
    (x) => {
      x.authority.planApproval.revisionId = 'old';
    },
    (x) => {
      x.authority.planApproval.contractEpoch = 99;
    },
    (x) => {
      x.authority.planApproval.sourceBindings = [];
    },
    (x) => {
      x.authority.planApproval.schema = 'future';
    },
    (x) => {
      x.authority.planApproval.provenance = null;
    },
    (x) => {
      x.observation.protectedSourceBindings = x.observation.protectedSourceBindings.filter(
        (b) => b.identity !== 'user-story'
      );
    },
    (x) => {
      x.observation.protectedSourceBindings.find((b) => b.identity === 'linked-plan').hash =
        'sha256:' + 'f'.repeat(64);
    },
    (x) => {
      x.observation.protectedSourceBindings.push({ ...x.observation.protectedSourceBindings[0] });
    },
    (x) => {
      x.authority.planApproval.sourceBindings[1] = {
        ...x.authority.planApproval.sourceBindings[0],
      };
    },
    (x) => {
      x.authority.planApproval.extra = true;
    },
    (x) => {
      x.observation.revisionRecords.records[0].eventId = 'foreign-head';
    },
  ]) {
    const result = revised();
    change(result);
    await api.refreshAdmission({ context: r.context, observe: () => result }, r.ports);
    assert.equal(api.readAdmission(r.context, r.ports).state, 'deny');
  }
});
test('corrupt allow records with malformed Plan approval or binding fields deny', async () => {
  const r = setup();
  await api.refreshAdmission(
    { context: r.context, observe: () => authorityResult(r.context, r.context.domain) },
    r.ports
  );
  const p = [...r.files.keys()].find((p) => p.endsWith('/1852.json')),
    good = JSON.parse(r.files.get(p));
  for (const change of [
    (x) => {
      x.revision = 1;
      x.revisionId = 'rev';
      x.eventHead = 'event';
      x.planApproval = {};
    },
    (x) => {
      x.sourceBindings = [{ identity: 'x', hash: 'sha256:' + 'a'.repeat(64), unexpected: true }];
    },
    (x) => {
      x.planApproval = { unexpected: true };
    },
  ]) {
    const value = structuredClone(good);
    change(value);
    r.files.set(p, JSON.stringify(value));
    assert.equal(api.readAdmission(r.context, r.ports).state, 'deny');
  }
});

test('verified receipt snapshots cannot be changed through the observer result after validation', async () => {
  const r = setup(),
    result = authorityResult(r.context, r.context.domain);
  const original = structuredClone(result.observation.protectedSourceBindings);
  await lock.withRevisionInterlock(
    r.context,
    async (capability) => {
      const observation = await api.observeAdmission(
        { capability, context: r.context, observe: () => result },
        r.ports
      );
      result.observation.protectedSourceBindings[0].hash = 'sha256:' + 'f'.repeat(64);
      await api.publishAdmission({ capability, observation, state: 'allow' }, r.ports);
      assert.deepEqual(api.readAdmission(r.context, r.ports).sourceBindings, original);
    },
    r.ports
  );
});
