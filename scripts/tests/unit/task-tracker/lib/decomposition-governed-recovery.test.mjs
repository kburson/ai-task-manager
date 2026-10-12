// @story #1991
import test from 'node:test';
import assert from 'node:assert/strict';
import { currentUnitAuthority } from './decomposition-unit-admission-fixture.mjs';
import { publication, observed, unavailable, hash } from './decomposition-authority-fixtures.mjs';
import {
  replaceDecompositionRecords,
  readDecompositionRecords,
} from '../../../../task-tracker/lib/decomposition-records.mjs';
import {
  runDecomposeCheck,
  formatDecomposeCheck,
} from '../../../../task-tracker/verbs/decompose-check.mjs';
import { decompositionPlanExitGuard } from '../../../../task-tracker/lib/decomposition-plan-exit-guard.mjs';
const oldWaiver =
  '\n## Decomposition Waiver\n- **Rationale**: Coordinated delivery\n- **Expected-focused-duration**: 42h\n- **Milestone-checkpoint-plan**: Check the work\n- **Why-no-nested-children**: Shared runtime\n- **Approved-by**: Full-Auto\n- **Approved-at**: 2026-08-03T12:45:50.976Z\n';
async function setup(hours = 25, body = '') {
  const f = await currentUnitAuthority({
    body: body + oldWaiver + '\n## AITM Progress Markers\n',
    hours,
  });
  const deps = {
    subject: f.subject,
    runtime: f.runtime,
    projectDir: f.projectDir,
    loadProjectFieldDefs: () => [],
    projectValuesForIssue: async () => ({ estimate: hours, size: 'M' }),
  };
  return { ...f, deps };
}
test('current decompose-check never grants permission from historical waiver prose', async () => {
  const f = await setup();
  const result = await runDecomposeCheck({
    issueNumber: 1,
    cfg: f.cfg,
    deps: { fetchIssueBody: async () => f.authority.body, decomposition: f.deps },
  });
  assert.equal(result.exitCode, 3);
  assert.equal(result.assessment.status, 'must-decompose');
  assert.doesNotMatch(formatDecomposeCheck(result), /waiver|waived/i);
  assert.match(f.authority.body, /Expected-focused-duration.*42h/);
});
test('Plan exit refuses historical waiver with governed recovery guidance', async () => {
  const f = await setup();
  const result = await decompositionPlanExitGuard.run({
    issueNumber: 1,
    cfg: f.cfg,
    body: f.authority.body,
    deps: { decomposition: f.deps },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'decomposition-required');
  assert.doesNotMatch(result.reason, /waiver/i);
  assert.match(result.reason, /split-plan 1 --dry-run/);
});
test('pending intent survives apparently small current values at both decision producers', async () => {
  const f = await setup(7);
  const current = await f.runtime.collect(f.subject);
  const p = publication(current.inputDigest, { subject: f.subject });
  f.authority.body = replaceDecompositionRecords(f.authority.body, {
    assessment: current.assessment,
    publication: p,
  });
  const checked = await runDecomposeCheck({
    issueNumber: 1,
    cfg: f.cfg,
    deps: { fetchIssueBody: async () => f.authority.body, decomposition: f.deps },
  });
  assert.equal(checked.exitCode, 3);
  assert.equal(checked.assessment.status, 'pending');
  const gate = await decompositionPlanExitGuard.run({
    issueNumber: 1,
    cfg: f.cfg,
    body: f.authority.body,
    deps: { decomposition: f.deps },
  });
  assert.equal(gate.ok, false);
  assert.equal(gate.code, 'decomposition-assessment-pending');
  assert.deepEqual(readDecompositionRecords(f.authority.body).publication, p);
});
test('unavailable forecast cannot become exit-zero from current low board fields', async () => {
  const f = await setup(7);
  f.authority.deps.readForecast = async () => unavailable();
  const result = await runDecomposeCheck({
    issueNumber: 1,
    cfg: f.cfg,
    deps: { fetchIssueBody: async () => f.authority.body, decomposition: f.deps },
  });
  assert.equal(result.exitCode, 3);
  assert.equal(result.assessment.status, 'indeterminate');
});

import { verbKind } from '../../../../task-tracker/verbs/kind.mjs';
import { governedFixture as kindFixture } from './decomposition-governed-fixtures.mjs';
import { saveState } from '../../../../task-tracker/state.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
test('non-epic kind conversion retains mandatory restriction and original estimate', async () => {
  const f = await kindFixture();
  await verbKind(f.ctx);
  const current = await f.runtime.collect(f.subject);
  assert.equal(current.input.kind, 'audit');
  assert.equal(current.assessment.status, 'must-decompose');
  assert.equal(current.projection.status, 'current');
  assert.equal(current.input.estimate.hours, 25);
  assert.equal(current.capabilities.includes('scoped-deliverable'), false);
});
test('kind mutation keeps pending publication intact through current reassessment', async () => {
  const f = await kindFixture(7);
  const before = await f.runtime.collect(f.subject);
  const p = publication(before.inputDigest, { subject: f.subject });
  f.authority.body = replaceDecompositionRecords(f.authority.body, {
    assessment: before.assessment,
    publication: p,
  });
  await verbKind(f.ctx);
  const current = await f.runtime.collect(f.subject);
  assert.equal(current.input.kind, 'audit');
  assert.equal(current.assessment.status, 'pending');
  assert.deepEqual(readDecompositionRecords(f.authority.body).publication, p);
  assert.equal(f.authority.values.project.estimate, 7);
});
test('indeterminate forecast permits exactly governed kind recovery with usable original authority', async () => {
  const f = await kindFixture();
  f.authority.deps.readForecast = async () => unavailable();
  await verbKind(f.ctx);
  const current = await f.runtime.collect(f.subject);
  assert.equal(current.input.kind, 'audit');
  assert.equal(current.assessment.status, 'indeterminate');
  assert.equal(current.capabilities.includes('scoped-implementation'), false);
});
for (const broken of ['ownership', 'scope', 'plan'])
  test(
    'kind recovery refuses missing ' + broken + ' authority before any body effect',
    async () => {
      const f = await kindFixture();
      if (broken === 'ownership')
        f.deps.readOwnership = async () => ({
          state: 'develop',
          assignees: ['someone-else'],
          currentUser: 'operator',
        });
      if (broken === 'scope')
        f.authority.body = f.authority.body.replace('## Scope', '## Missing scope');
      if (broken === 'plan') f.authority.deps.readSelectedPlan = async () => unavailable();
      const before = f.authority.body,
        count = f.authority.writes.length;
      await assert.rejects(() => verbKind(f.ctx), /decomposition:recovery/);
      assert.equal(f.authority.body, before);
      assert.equal(f.authority.writes.length, count);
    }
  );

test('story to epic preserves pending intent and cannot invent completion readiness', async () => {
  const f = await kindFixture(7);
  const before = await f.runtime.collect(f.subject);
  const p = publication(before.inputDigest, { subject: f.subject });
  f.authority.body = replaceDecompositionRecords(f.authority.body, {
    assessment: before.assessment,
    publication: p,
  });
  f.ctx.rest = ['1', 'epic'];
  await verbKind(f.ctx);
  const current = await f.runtime.collect(f.subject);
  assert.equal(current.input.kind, 'epic');
  assert.equal(current.assessment.status, 'pending');
  assert.equal(current.projection.status, 'current');
  assert.equal(current.input.epicReadiness.completion, false);
  assert.deepEqual(readDecompositionRecords(f.authority.body).publication, p);
  assert.equal(current.capabilities.includes('scoped-completion'), false);
});

import { runSplitPlan } from '../../../../task-tracker/verbs/split-plan.mjs';
async function splitFixture() {
  const f = await kindFixture();
  const content = Array.from(
    { length: 4 },
    (_, i) =>
      '### Task ' +
      (i + 1) +
      ': Boundary ' +
      (i + 1) +
      '\n#### Story Intent\n- **Beneficiary:** release operator\n- **Capability:** prevent partial publication\n- **Need:** registry checks can fail\n- **Value or failure prevented:** consumers receive complete releases\n#### Scope\nOne bounded registry check.\nRun: ' +
      String.fromCharCode(96) +
      'node verify-' +
      i +
      '.mjs' +
      String.fromCharCode(96) +
      '\n'
  ).join('\n');
  f.authority.values.plan = { ...f.authority.values.plan, content, digest: hash(content) };
  f.authority.deps.readPlanAtCommit = async () => content;
  writeFileSync(path.join(f.projectDir, 'docs/plan.md'), content);
  await f.runtime.refresh(f.subject);
  let creates = 0;
  const deps = {
    ...f.ctx.deps,
    projectDir: f.projectDir,
    fetchIssueBody: async () => f.authority.body,
    readPlanAtCommit: async () => content,
    fetchParentIssue: async () => null,
    resolveHead: async () => '1'.repeat(40),
    runCreator: async (args) => {
      if (!args.includes('--dry-run')) creates++;
      return {
        exitCode: 0,
        stdout: args.includes('--dry-run')
          ? 'rendered valid child'
          : 'https://github.com/o/r/issues/' + (2000 + creates),
        stderr: '',
      };
    },
  };
  return {
    ...f,
    split: { issueNumber: 1, cfg: f.cfg, mode: 'dry-run', deps },
    creates: () => creates,
  };
}
for (const restriction of ['must-decompose', 'pending', 'indeterminate'])
  test(
    'reviewed split remains usable under ' + restriction + ' with original authority',
    async () => {
      const f = await splitFixture();
      if (restriction === 'pending') {
        const c = await f.runtime.collect(f.subject);
        f.authority.body = replaceDecompositionRecords(f.authority.body, {
          assessment: c.assessment,
          publication: publication(c.inputDigest, { subject: f.subject }),
        });
      }
      if (restriction === 'indeterminate')
        f.authority.deps.readForecast = async () => unavailable();
      const result = await runSplitPlan(f.split);
      assert.equal(result.status, 'dry-run');
      assert.equal(result.proposals.length, 4);
      assert.equal(f.creates(), 0);
      const current = await f.runtime.collect(f.subject);
      assert.equal(current.assessment.status, restriction);
      assert.equal(current.capabilities.includes('scoped-implementation'), false);
    }
  );
for (const broken of ['ownership', 'scope', 'plan'])
  test('split refuses missing ' + broken + ' authority before fragments or children', async () => {
    const f = await splitFixture();
    if (broken === 'ownership')
      f.deps.readOwnership = async () => ({
        state: 'develop',
        assignees: ['foreign'],
        currentUser: 'operator',
      });
    if (broken === 'scope')
      f.authority.body = f.authority.body.replace('## Scope', '## Missing scope');
    if (broken === 'plan') f.authority.deps.readSelectedPlan = async () => unavailable();
    f.split.mode = 'confirm';
    let fragments = 0;
    f.split.deps.writeProposalFragments = async () => {
      fragments++;
      throw new Error('unexpected fragment effect');
    };
    await assert.rejects(() => runSplitPlan(f.split), /decomposition:recovery/);
    assert.equal(fragments, 0);
    assert.equal(f.creates(), 0);
  });

test('new issue continuation assesses initial fields without fabricating estimate publication history', async () => {
  const f = await kindFixture();
  f.authority.body = replaceDecompositionRecords(f.authority.body, {
    assessment: null,
    publication: null,
  });
  const creator = await import('../../../../gh/create-issue.mjs');
  const result = await creator.assessCreatedIssueContinuation({
    issueNumber: 1,
    cfg: f.cfg,
    projectDir: f.projectDir,
    deps: f.ctx.deps,
  });
  assert.equal(result.status, 'confirmed');
  assert.equal(result.current.assessment.status, 'must-decompose');
  assert.equal(result.current.projection.status, 'current');
  assert.equal(readDecompositionRecords(f.authority.body).publication, null);
  assert.equal(f.authority.values.project.estimate, 25);
});

import { assertScopedDecompositionEffect } from '../../../../task-tracker/lib/decomposition-effect-admission.mjs';
test('governed split permission never authorizes sibling product effects', async () => {
  const f = await splitFixture();
  await runSplitPlan(f.split);
  await assert.rejects(
    () =>
      assertScopedDecompositionEffect({
        issue: 1,
        cfg: f.cfg,
        projectDir: f.projectDir,
        activity: 'WRITE_CODE',
        deps: f.ctx.deps,
      }),
    /decomposition-required/
  );
});
test('kind recovery cannot mutate a foreign issue outside the active timer', async () => {
  const f = await kindFixture();
  f.ctx.rest = ['2', 'audit'];
  const before = f.authority.body,
    count = f.authority.writes.length;
  await assert.rejects(() => verbKind(f.ctx), /session/);
  assert.equal(f.authority.body, before);
  assert.equal(f.authority.writes.length, count);
});
test('split retains the first created child when ownership changes before the next child', async () => {
  const f = await splitFixture();
  f.split.mode = 'confirm';
  const creator = f.split.deps.runCreator;
  f.split.deps.runCreator = async (args) => {
    const result = await creator(args);
    if (!args.includes('--dry-run'))
      f.deps.readOwnership = async () => ({
        state: 'develop',
        assignees: ['foreign'],
        currentUser: 'operator',
      });
    return result;
  };
  const r = await runSplitPlan(f.split);
  assert.equal(r.status, 'partial-success');
  assert.equal(f.creates(), 1);
  assert.deepEqual(r.createdChildren, [{ title: 'Boundary 1', issueNumber: 2001 }]);
  assert.match(r.failed.stderr, /recovery-foreign-owner/);
});

test('pending partial board publication does not revoke independently usable kind recovery', async () => {
  const f = await kindFixture(7);
  const before = await f.runtime.collect(f.subject);
  const p = publication(before.inputDigest, { subject: f.subject });
  f.authority.body = replaceDecompositionRecords(f.authority.body, {
    assessment: before.assessment,
    publication: p,
  });
  f.authority.values.project.estimate = 25;
  await verbKind(f.ctx);
  const current = await f.runtime.collect(f.subject);
  assert.equal(current.input.kind, 'audit');
  assert.equal(current.assessment.status, 'pending');
  assert.equal(current.capabilities.includes('scoped-deliverable'), false);
  assert.deepEqual(readDecompositionRecords(f.authority.body).publication, p);
});

test('native bootstrap state timestamps cannot invalidate unchanged decomposition source authority', async () => {
  const f = await kindFixture(7);
  f.authority.body +=
    '\n<!-- aitm-last-known-state state="develop" ts="2026-10-12T19:00:00Z" -->\n';
  const captured = f.authority.body.replace(
    /(aitm-last-known-state state="develop" ts=")[^"]+(" -->)/,
    (_match, pre, suffix) => pre + '2026-10-12T19:00:00.001Z' + suffix
  );
  assert.notEqual(captured, f.authority.body);
  const r = await decompositionPlanExitGuard.run({
    issueNumber: 1,
    cfg: f.cfg,
    body: captured,
    deps: { decomposition: f.deps },
  });
  assert.equal(r.ok, true, r.reason);
});
test('a changed state value still cannot borrow an earlier source snapshot', async () => {
  const f = await kindFixture(7);
  f.authority.body +=
    '\n<!-- aitm-last-known-state state="develop" ts="2026-10-12T19:00:00Z" -->\n';
  const captured = f.authority.body.replace(
    'aitm-last-known-state state="develop"',
    'aitm-last-known-state state="review"'
  );
  const r = await decompositionPlanExitGuard.run({
    issueNumber: 1,
    cfg: f.cfg,
    body: captured,
    deps: { decomposition: f.deps },
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'decomposition-authority-unavailable');
});

test('malformed checkpoint timestamp cannot claim the native timestamp-only exemption', async () => {
  const f = await kindFixture(7);
  f.authority.body +=
    '\n<!-- aitm-last-known-state state="develop" ts="2026-10-12T19:00:00Z" -->\n';
  const captured = f.authority.body.replace('ts="2026-10-12T19:00:00Z"', 'ts="2026"');
  const r = await decompositionPlanExitGuard.run({
    issueNumber: 1,
    cfg: f.cfg,
    body: captured,
    deps: { decomposition: f.deps },
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'decomposition-authority-unavailable');
});

import { setIssueKindMarker } from '../../../../task-tracker/lib/issue-kind.mjs';
test('nested epic split consumes its current decomposition plan while preserving the outer source claim', async () => {
  const f = await splitFixture();
  const nested = f.authority.values.plan.content;
  writeFileSync(path.join(f.projectDir, 'docs/nested.md'), nested);
  f.authority.values.plan.path = 'docs/nested.md';
  f.authority.body = setIssueKindMarker(
    f.authority.body.replace(
      '- **Source-plan**: docs/plan.md',
      '- **Source-plan**: docs/plan.md\n- **Decomposition-plan**: docs/nested.md'
    ),
    'epic'
  );
  f.split.deps.readPlanAtCommit = async ({ planPath }) =>
    planPath === 'docs/nested.md'
      ? nested
      : '### Task 1: Outer source\nRun: ' +
        String.fromCharCode(96) +
        'node outer.mjs' +
        String.fromCharCode(96);
  const r = await runSplitPlan(f.split);
  assert.equal(r.proposals.length, 4);
  assert.ok(r.proposals.every((p) => p.planMetadata.includes('**Source-plan**: docs/nested.md')));
  assert.match(f.authority.body, /Source-plan\*\*: docs\/plan.md/);
});
