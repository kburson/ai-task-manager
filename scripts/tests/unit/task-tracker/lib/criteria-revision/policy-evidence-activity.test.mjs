// @story #1855

import test from 'node:test';
import path from 'node:path';
import { evaluateLocalRevisionActivity } from '../../../../../task-tracker/lib/criteria-revision/policy.mjs';
import assert from 'node:assert/strict';
import { fixture, approvedFixture } from '../../../../helpers/criteria-revision-consumers.mjs';
import { mutateIssueBody } from '../../../../../task-tracker/lib/issue-body-mutate.mjs';
import { observeRevision } from '../../../../../task-tracker/lib/criteria-revision/engine.mjs';
import { memoryRuntime } from '../../../../fixtures/criteria-revision-runtime.mjs';
import { withRevisionConsumer } from '../../../../../task-tracker/lib/criteria-revision/policy.mjs';
import { projectRequirements } from '../../../../../task-tracker/lib/evidence-v2/subject-inputs.mjs';

async function inApprovedConsumer(fn, options) {
  const f = await approvedFixture(options);
  return withRevisionConsumer({ ...f.context, backend: f.backend, activity: 'body-write' }, () =>
    fn(f)
  );
}
import { stampAcEvidenceMarker } from '../../../../../task-tracker/lib/ac-evidence.mjs';

test('requirements projection consumes actual consolidated AC stamps and native multi-VC declarations', () => {
  const body =
    '## Acceptance Criteria\n- [ ] Both verifiers <!-- aitm-verified vc-list="vc:1 vc:2" -->\n## Verification Commands\n- [ ] `node first.mjs` <!-- id=1 -->\n- [ ] `node second.mjs` <!-- id=2 -->\n';
  const stamped = stampAcEvidenceMarker(body, 'Both verifiers', {
    cmd: '`node first.mjs` `node second.mjs`',
    sha: 'a'.repeat(40),
    ts: '2026-10-01T00:00:00Z',
  });
  const result = projectRequirements({
    body: stamped,
    target: { ref: 'trunk' },
    policy: { id: 'p', version: '1' },
  });
  assert.deepEqual(result.acceptanceCriteria[0].verificationIds, ['vc:1', 'vc:2']);
  assert.equal(result.verificationCommands.length, 2);
});

for (const kind of ['legacy', 'canonical']) {
  test(`requirements projection uses observed ${kind} stable identities and current canonical epochs`, async () => {
    const { backend, context } = await approvedFixture({ kind });
    await withRevisionConsumer({ ...context, backend, activity: 'body-write' }, async () => {
      const current = await observeRevision({ context, deps: backend });
      const result = projectRequirements({
        body: backend.observation.body.bytes,
        target: { ref: 'trunk' },
        policy: { id: 'p', version: '1' },
      });
      assert.deepEqual(
        result.acceptanceCriteria.map((x) => x.id),
        current.effectiveProposal.after.definitions
          .filter((x) => x.section === 'ac')
          .map((x) => x.identity)
      );
      assert.equal(
        result.revisionBinding.contractEpoch,
        current.observation.contract?.value.contractEpoch ?? null
      );
      assert.equal(
        result.revisionBinding.authorityEpoch,
        current.observation.contract?.value.authorityEpoch ?? null
      );
      assert.deepEqual(
        result.verificationCommands.map((x) => x.id),
        current.effectiveProposal.after.definitions
          .filter((x) => x.section === 'vc')
          .map((x) => x.identity)
      );
    });
  });
}
import { parseEvidenceAcs } from '../../../../../task-tracker/lib/ac-evidence.mjs';
import {
  stampEvidenceMarker,
  parseFunctionalDodKeys,
} from '../../../../../task-tracker/lib/functional-dod-evidence.mjs';
import { parseProofMarker } from '../../../../../task-tracker/lib/proof-marker.mjs';

for (const section of ['ac', 'dod']) {
  test(`actual ${section} individual stamper binds current revision and its reader rejects stripped new proof`, async () => {
    await inApprovedConsumer(({ backend, context }) => {
      const before = backend.observation.body.bytes;
      const evidence = {
        cmd: '`node --test supported-hook.test.mjs`',
        sha: 'b'.repeat(40),
        ts: '2026-10-01T00:00:00Z',
        exit: 0,
        revisionBinding: { revisionId: 'forged' },
      };
      const after =
        section === 'ac'
          ? stampAcEvidenceMarker(before, 'Supported model hooks', evidence)
          : stampEvidenceMarker(before, 'tests', evidence);
      const read = (body) =>
        section === 'ac'
          ? parseEvidenceAcs(body).find((x) => x.label === 'Supported model hooks')
          : parseFunctionalDodKeys(body).find((x) => x.key === 'tests');
      const row = read(after);
      const props = parseProofMarker(after.split('\n')[row.lineIndex]);
      assert.ok(props['revision-binding']);
      assert.equal(JSON.parse(props['revision-binding']).issue, context.issue);
      assert.ok(row.evidenceMarker);
      const stripped = after.replace(/ revision-binding="[^"]*"/, '');
      assert.equal(read(stripped).evidenceMarker, null);
    });
  });
}

test('only exact preserved legacy individual proof survives current revision read side', async () => {
  await inApprovedConsumer(({ backend }) => {
    const body = backend.observation.body.bytes;
    const read = (value) =>
      parseEvidenceAcs(value).find((x) => x.label === 'Independent requirement').evidenceMarker;
    assert.ok(read(body));
    const changed = body.replace(
      /(Independent requirement[^\n]*sha=")[^"]+/,
      '$1' + 'b'.repeat(40)
    );
    assert.equal(read(changed), null);
  });
});

test('metadata continuation rejects duplicate body-version control claims before push', async () => {
  await inApprovedConsumer(async ({ backend, context }) => {
    let pushes = 0;
    let refusal;
    try {
      await mutateIssueBody({
        repo: context.repository,
        issueNumber: context.issue,
        mutate: (body) =>
          body +
          '\n<!-- aitm-body-version version="100" -->\n<!-- aitm-body-version version="200" -->\n<!-- aitm-body-version version="300" -->\n',
        deps: {
          revisionBackend: backend,
          fetchBody: async () => backend.observation.body.bytes,
          pushBody: async () => {
            pushes++;
          },
        },
      });
    } catch (error) {
      refusal = error;
    }
    assert.equal(pushes, 0);
    assert.equal(refusal?.code, 'criteria-revision-required');
  });
});

for (const activity of ['status', 'plan-approve', 'invented-consumer']) {
  test(`caller activity ${activity} cannot turn a stale approval into mutation authority`, async () => {
    const { backend, context } = await fixture('stale');
    let effects = 0,
      refusal;
    try {
      await withRevisionConsumer({ ...context, backend, activity }, () => {
        effects++;
      });
    } catch (error) {
      refusal = error;
    }
    assert.equal(effects, 0);
    assert.ok(refusal);
  });
}

test('unknown mutation activity cannot execute even against an empty verified chain', async () => {
  const { backend, context } = await fixture('baseline');
  let effects = 0;
  let refusal;
  try {
    await withRevisionConsumer({ ...context, backend, activity: 'invented-consumer' }, () => {
      effects++;
    });
  } catch (error) {
    refusal = error;
  }
  assert.equal(effects, 0);
  assert.ok(refusal);
});

test('unconfigured activity retains ordinary gates only after fresh proof that host has no enabled revision domains', () => {
  const r = memoryRuntime();
  r.ports.inspect = () => {
    throw new Error('repository unavailable');
  };
  assert.equal(
    evaluateLocalRevisionActivity({ repository: '', issue: 1855 }, r.ports).status,
    'ready'
  );
  r.ports.fs.writeFileSync(path.join(r.ports.configRoot, 'unknown-registration.json'), '{}');
  assert.equal(
    evaluateLocalRevisionActivity({ repository: '', issue: 1855 }, r.ports).status,
    'indeterminate'
  );
  const unreadable = {
    ...r.ports,
    fs: {
      ...r.ports.fs,
      readdirSync() {
        throw new Error('unreadable');
      },
    },
  };
  assert.equal(
    evaluateLocalRevisionActivity({ repository: '', issue: 1855 }, unreadable).status,
    'indeterminate'
  );
});
import { runGuards, GUARDS } from '../../../../../task-tracker/lib/guard-registry.mjs';
import '../../../../../task-tracker/lib/guard-bootstrap.mjs';

for (const state of ['pending', 'stale', 'unavailable', 'malformed', 'baseline', 'approved']) {
  test(`registered lifecycle revision guard preserves typed ${state} authority without publishing admission`, async () => {
    const { backend, context } =
      state === 'approved' ? await approvedFixture() : await fixture(state);
    if (state === 'malformed')
      backend.addComment({ id: 'bad', body: '<!-- aitm.criteria-revision-event/v1 {broken} -->' });
    assert.ok(GUARDS.done.entry.some((guard) => guard.id === 'criteria-revision-admission'));
    const before = backend.effects.length;
    const result = await runGuards('', 'done', {
      cfg: { repo: context.repository },
      issueNumber: context.issue,
      deps: { revisionBackend: backend },
    });
    const refusal = result.refusals.find((value) => value.id === 'criteria-revision-admission');
    if (['baseline', 'approved'].includes(state)) assert.equal(refusal, undefined);
    else {
      assert.ok(refusal, JSON.stringify(result));
      assert.equal(
        refusal.code,
        state === 'pending'
          ? 'revision-pending'
          : state === 'stale'
            ? 'revision-approval-stale'
            : 'revision-authority-unavailable'
      );
    }
    assert.equal(
      backend.effects.slice(before).includes('admission-deny'),
      false,
      'read-only guard does not publish mutation admission'
    );
  });
}
import { lintRefusalInventory } from '../../../../../maintenance/lint-action-refusals.mjs';

test('new typed guard conformance requires discovered producer and complete typed emissions while preserving frozen legacy rules', () => {
  const id = 'criteria-revision-admission';
  const source = `export const guard = { id: '${id}', run() { return { ok: false, code: 'revision-pending', args: {}, noAutomaticRemediation: { reason: 'authority-investigation-required' } }; } };`;
  const lint = (value, guardId = id) =>
    lintRefusalInventory({
      inventory: { version: 1, guards: {} },
      registeredGuardIds: [guardId],
      sources: [{ file: 'scripts/task-tracker/lib/new-typed-guard.mjs', source: value }],
    });
  assert.deepEqual(lint(source), []);
  for (const invalid of [
    source.replace('revision-pending', 'unknown-revision-code'),
    source.replace(
      "code: 'revision-pending', args: {}, noAutomaticRemediation: { reason: 'authority-investigation-required' }",
      "reason: 'untyped'"
    ),
    source.replace("id: 'criteria-revision-admission'", 'id: callerId'),
    source.replace("code: 'revision-pending'", "code: 'authority-read-failed'"),
    `export const guard = { id: '${id}', run() { return { ok: true }; } };`,
    source.replace('run() {', "run() { if (unknown) return { ok: false, reason: 'legacy' };"),
    source.replace('run() {', 'run() { if (unknown) return alias();') +
      "function refusal() { return { ok: false, reason: 'legacy' }; } const alias = refusal;",
    `export const guard = { id: '${id}', run() { return helper(); } };` +
      source.replaceAll(id, 'different-guard').replace('const guard', 'const sibling'),
  ])
    assert.ok(lint(invalid).length > 0, invalid);
  assert.ok(lint(source.replaceAll(id, 'invented-guard'), 'invented-guard').length > 0);
});
