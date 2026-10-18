// @story #2006
import test from 'node:test';
import assert from 'node:assert/strict';
import { governedFixture } from './decomposition-governed-fixtures.mjs';
import { currentUnitAuthority } from './decomposition-unit-admission-fixture.mjs';
import { unavailable, publication } from './decomposition-authority-fixtures.mjs';
import { verbKind } from '../../../../task-tracker/verbs/kind.mjs';
import { assertGovernedDecompositionRecovery } from '../../../../task-tracker/lib/decomposition-plan-exit-guard.mjs';
import { replaceDecompositionRecords } from '../../../../task-tracker/lib/decomposition-records.mjs';

const absentPlan = {
  path: null,
  commit: null,
  section: null,
  digest: null,
  availability: 'absent',
  content: null,
  references: null,
};
for (const state of ['backlog', 'refine'])
  for (const kind of ['docs-only', 'audit', 'research', 'spike']) {
    // Requiring a split plan for an ordinary kind change obstructs genuine optional-source recovery.
    test(
      'actual owned ' +
        state +
        ' ordinary ' +
        kind +
        ' conversion accepts genuinely absent optional plan',
      async () => {
        const f = await governedFixture(7);
        f.authority.body = f.authority.body.replace(/## Plan Metadata\n[^]*?(?=## )/, '');
        f.authority.values.plan = { ...absentPlan };
        f.ctx.rest = ['1', kind];
        f.deps.readOwnership = async () => ({
          state,
          assignees: ['operator'],
          currentUser: 'operator',
        });
        await f.runtime.refresh(f.subject);
        await verbKind(f.ctx);
        const current = await f.runtime.collect(f.subject);
        assert.equal(current.input.kind, kind);
        assert.equal(current.input.plan.availability, 'absent');
        assert.equal(current.projection.status, 'current');
        assert.equal(current.input.estimate.hours, 7);
      }
    );
  }
test('optional kind recovery still refuses a declared unreadable plan before mutation', async () => {
  const f = await governedFixture(7);
  f.authority.deps.readSelectedPlan = async () => unavailable();
  const before = f.authority.body,
    count = f.authority.writes.length;
  await assert.rejects(() => verbKind(f.ctx), /decomposition:recovery-source-unavailable/);
  assert.equal(f.authority.body, before);
  assert.equal(f.authority.writes.length, count);
});
test('strict governed split recovery retains its required plan', async () => {
  const f = await governedFixture(7);
  f.authority.body = f.authority.body.replace(/## Plan Metadata\n[^]*?(?=## )/, '');
  f.authority.values.plan = { ...absentPlan };
  await assert.rejects(
    () =>
      assertGovernedDecompositionRecovery({
        issueNumber: 1,
        cfg: f.cfg,
        projectDir: f.projectDir,
        deps: { decomposition: f.deps },
      }),
    /decomposition:recovery-source-unavailable/
  );
});
test('pending intent shows intended 25h separately from current published 10h', async () => {
  const f = await currentUnitAuthority({ body: '## AITM Progress Markers\n', hours: 10 });
  const current = await f.runtime.collect(f.subject);
  const pending = publication(current.inputDigest, { subject: f.subject });
  const body = replaceDecompositionRecords(f.authority.body, {
    assessment: current.assessment,
    publication: pending,
  });
  assert.match(body, /Estimate: published 10h/);
  assert.match(body, /Pending intended estimate: proposed 25h/);
  assert.match(body, /Pending intended size: M/);
  assert.equal(current.input.estimate.hours, 10);
});
