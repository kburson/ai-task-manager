// @story #1990
import { registerDecompositionTargetCases } from './decomposition-target.cases.mjs';
// @story #1989
import { formatIssueFieldDb } from '../../../../task-tracker/issue-field-db.mjs';
import { replaceDecompositionRecords } from '../../../../task-tracker/lib/decomposition-records.mjs';
import { claimOccupancy } from '../../../../task-tracker/lib/occupancy.mjs';
import {
  publication,
  hash,
} from '../../../unit/task-tracker/lib/decomposition-authority-fixtures.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createBindingFixture } from '../../../helpers/binding-generation-fixture.mjs';
import {
  fixture,
  subject as originalSubject,
  observed,
} from '../../../unit/task-tracker/lib/decomposition-authority-fixtures.mjs';
import { createDecompositionRuntime } from '../../../../task-tracker/lib/decomposition-authority.mjs';
import { verbStart } from '../../../../task-tracker/verbs/start.mjs';
import { evaluateSessionReadiness } from '../../../../task-tracker/lib/action-decision/session.mjs';
import { createObservationAttempt } from '../../../../task-tracker/lib/action-decision/observations.mjs';
import { evaluateAction } from '../../../../task-tracker/lib/action-decision/evaluate.mjs';
import { runExplain } from '../../../../task-tracker/verbs/explain.mjs';
import { verbResume } from '../../../../task-tracker/verbs/resume.mjs';

function binding(hours) {
  const native = createBindingFixture(import.meta.url);
  const authority = fixture(hours);
  const subject = { ...originalSubject, issue: 107 };
  authority.deps.readIssue = async () => observed({ number: 107, body: authority.body });
  authority.deps.readBackIssue = authority.deps.readIssue;
  const cfg = {
    ...native.ctx.cfg,
    repo: 'o/r',
    projectId: 'PVT_a',
    fieldIds: { estimate: 'EST', size: 'SIZE' },
  };
  const runtime = createDecompositionRuntime({
    cfg,
    projectDir: native.root,
    deps: authority.deps,
  });
  return {
    native,
    authority,
    cfg,
    subject,
    runtime,
    ctx: { ...native.ctx, rest: ['#107'], decomposition: { subject, runtime } },
  };
}

test('actual start binds an oversized story for inspection with refreshed restricted authority', async () => {
  const f = binding(25);
  try {
    const result = await verbStart(f.ctx);
    assert.equal(f.native.active().issue, '#107');
    assert.equal(result?.decomposition?.assessment.status, 'must-decompose');
    assert.equal(result.decomposition.projection.status, 'current');
    assert.equal(result.decomposition.capabilities.includes('scoped-implementation'), false);
    assert.ok(result.decomposition.capabilities.includes('inspect'));
    assert.ok(f.authority.writes.length > 0);
    assert.equal(f.authority.values.project.estimate, 25);
  } finally {
    f.native.close();
  }
});

test('already-bound resume rechecks current restriction without duplicating the live timer', async () => {
  const f = binding(25);
  try {
    await verbStart(f.ctx);
    const before = f.native.posts.length;
    const result = await verbResume(f.ctx);
    assert.equal(result?.decomposition?.assessment.status, 'must-decompose');
    assert.equal(result.decomposition.capabilities.includes('scoped-implementation'), false);
    assert.equal(f.native.posts.length, before);
    assert.equal(f.native.active().issue, '#107');
  } finally {
    f.native.close();
  }
});

test('real read-only Explain reports implementation restrictions separately from bind readiness', async () => {
  const f = binding(25);
  try {
    const cfg = { ...f.cfg, preferences: { gateAssigneeMatch: false } };
    const state = {};
    const read = async (request) => {
      const value = {
        'issue-body': { number: 107, body: f.authority.body },
        'project-board': { state: 'develop', assignees: [] },
        'local-config': { repo: 'o/r', projectId: 'PVT_a', gateAssigneeMatch: false },
        'session-state': state,
        worktree: { matches: true },
        occupancy: { available: true },
        'migration-journal': { active: false },
      }[request.resource];
      return {
        ...request,
        value: request.resource === 'decomposition' ? await f.runtime.collect(f.subject) : value,
      };
    };
    let output = '';
    const result = await runExplain(
      { issue: 107, actionId: 'bind', known: [], knownSource: null, diagnostic: false },
      {
        projectRoot: new URL('../../../../../', import.meta.url).pathname,
        evaluate: async () => {
          const attempt = createObservationAttempt({
            repository: 'o/r',
            issue: 107,
            boundaryId: 'continuation-proof',
            now: () => new Date().toISOString(),
            read,
          });
          return {
            decision: await evaluateAction({
              actionId: 'bind',
              repository: 'o/r',
              issue: 107,
              inputs: {
                state: 'develop',
                head: 'a'.repeat(40),
                body: f.authority.body,
                config: cfg,
                sessionState: state,
              },
              attempt,
              deps: {
                effectAttempts: () => f.authority.writes,
                sessionPorts: { decomposition: { subject: f.subject, runtime: f.runtime } },
              },
            }),
          };
        },
        stdout: {
          write: (text) => {
            output += text;
          },
        },
      }
    );
    assert.equal(result.result.status, 'ready');
    assert.ok(
      result.result.warnings.some((warning) => warning.code === 'decomposition-bind-restricted')
    );
    assert.equal(JSON.parse(output).result.status, 'ready');
    assert.equal(f.authority.writes.length, 0);
  } finally {
    f.native.close();
  }
});

test('production session adapter includes current decomposition with read-only provider ports', async () => {
  const f = binding(25);
  try {
    const cfg = { ...f.cfg, preferences: { gateAssigneeMatch: false } };
    const result = await evaluateSessionReadiness({
      actionId: 'bind',
      issue: 107,
      config: cfg,
      stateBefore: {},
      projectDir: f.native.root,
      invokingDir: f.native.root,
      deps: {
        readIssueBody: async () => f.authority.body,
        fetchAssignmentSnapshot: async () => ({ state: 'develop', assignees: [] }),
        resolveProjectDir: () => f.native.root,
        readWorktreeIdentity: () => ({ worktreePath: f.native.root }),
        readOccupancy: () => ({}),
        loadMigrationJournal: () => null,
        decomposition: { subject: f.subject, runtime: f.runtime },
      },
    });
    assert.equal(result.status, 'ready');
    assert.ok(result.warnings.some((warning) => warning.code === 'decomposition-bind-restricted'));
    assert.equal(f.authority.writes.length, 0);
  } finally {
    f.native.close();
  }
});

test('real lifecycle evaluator surfaces current mandatory decomposition alongside ordinary guards', async () => {
  const f = binding(25);
  try {
    const cfg = { ...f.cfg, preferences: { gateAssigneeMatch: false } };
    const attempt = createObservationAttempt({
      repository: 'o/r',
      issue: 107,
      boundaryId: 'current-lifecycle-proof',
      now: () => new Date().toISOString(),
      read: async (request) => ({
        ...request,
        value:
          request.resource === 'issue-body'
            ? { number: 107, body: f.authority.body }
            : { state: 'develop', assignees: [] },
      }),
    });
    const decision = await evaluateAction({
      actionId: 'promote',
      repository: 'o/r',
      issue: 107,
      inputs: {
        state: 'develop',
        head: 'a'.repeat(40),
        body: f.authority.body,
        config: cfg,
        sessionState: {},
      },
      attempt,
      deps: {
        effectAttempts: () => f.authority.writes,
        decomposition: { subject: f.subject, runtime: f.runtime },
        testPorts: { cfg, projectDir: f.native.root },
      },
    });
    assert.ok(decision.blockers.some((blocker) => blocker.code === 'decomposition-required'));
    assert.equal(f.authority.writes.length, 0);
  } finally {
    f.native.close();
  }
});

for (const [hours, status, permitted] of [
  [7, 'story-ok', true],
  [23, 'needs-decomposition-review', true],
  [24, 'must-decompose', false],
])
  test(
    'real bind respects current ' + hours + '-hour boundary without changing lifecycle or estimate',
    async () => {
      const f = binding(hours);
      try {
        const result = await verbStart(f.ctx);
        assert.equal(result.decomposition.assessment.status, status);
        assert.equal(
          result.decomposition.capabilities.includes('scoped-implementation'),
          permitted
        );
        assert.equal(f.authority.values.project.estimate, hours);
        assert.ok(f.authority.body.includes('state="develop"'));
      } finally {
        f.native.close();
      }
    }
  );

test('already-bound external estimate revision replaces stale permission with current restriction', async () => {
  const f = binding(7);
  try {
    const first = await verbStart(f.ctx);
    assert.ok(first.decomposition.capabilities.includes('scoped-implementation'));
    f.authority.body = f.authority.body.replace(
      formatIssueFieldDb({ estimate: 7, size: 'M' }),
      formatIssueFieldDb({ estimate: 25, size: 'M' })
    );
    f.authority.values.project.estimate = 25;
    f.authority.values.forecast.estimate = 25;
    const second = await verbResume(f.ctx);
    assert.equal(second.decomposition.assessment.status, 'must-decompose');
    assert.equal(second.decomposition.projection.status, 'current');
    assert.equal(second.decomposition.capabilities.includes('scoped-implementation'), false);
  } finally {
    f.native.close();
  }
});

test('independent XL and multiple verification groups restrict an advisory 23-hour story', async () => {
  const f = binding(23);
  try {
    f.authority.body = f.authority.body.replace(
      formatIssueFieldDb({ estimate: 23, size: 'M' }),
      formatIssueFieldDb({ estimate: 23, size: 'XL' })
    );
    f.authority.values.project.size = 'XL';
    f.authority.values.forecast.size = 'XL';
    const content =
      '### Task 1: First group\nRun: `node first.mjs`\n\n### Task 2: Second group\nRun: `node second.mjs`';
    f.authority.values.plan = {
      path: 'docs/plan.md',
      commit: '1'.repeat(40),
      section: null,
      digest: hash(content),
      availability: 'available',
      content,
      references: 'shared contract bytes',
    };

    const result = await verbStart(f.ctx);
    assert.equal(result.decomposition.assessment.status, 'must-decompose');
    assert.equal(result.decomposition.capabilities.includes('scoped-implementation'), false);
  } finally {
    f.native.close();
  }
});

test('failed refresh retains inspection binding but cannot reuse old clear permission', async () => {
  const f = binding(7);
  try {
    await f.runtime.refresh(f.subject);
    f.ctx.decomposition.runtime = {
      collect: f.runtime.collect,
      refresh: async () => {
        throw new Error('readback unavailable');
      },
    };
    const result = await verbStart(f.ctx);
    assert.equal(result.status, 'bound');
    assert.ok(f.native.active());
    assert.equal(result.decomposition.capabilities.includes('scoped-implementation'), false);
  } finally {
    f.native.close();
  }
});

test('configured membership loss retains restricted inspection rather than exemption', async () => {
  const f = binding(7);
  try {
    f.authority.values.project.projectItemId = null;
    const result = await verbStart(f.ctx);
    assert.equal(result.decomposition.assessment.status, 'indeterminate');
    assert.equal(result.decomposition.capabilities.includes('scoped-implementation'), false);
    assert.ok(f.native.active());
    assert.equal(f.authority.writes.length, 0);
  } finally {
    f.native.close();
  }
});

test('pending-before-first-effect survives bind refresh despite matching old low fields', async () => {
  const f = binding(7);
  try {
    const current = await f.runtime.collect(f.subject);
    const pending = publication(current.inputDigest, { subject: f.subject });
    f.authority.body = replaceDecompositionRecords(f.authority.body, {
      assessment: current.assessment,
      publication: pending,
    });
    const result = await verbStart(f.ctx);
    assert.equal(result.decomposition.assessment.status, 'pending');
    assert.equal(result.decomposition.publication.operationId, pending.operationId);
    assert.equal(result.decomposition.publication.status, 'pending');
    assert.equal(result.decomposition.capabilities.includes('scoped-implementation'), false);
    assert.equal(f.authority.values.project.estimate, 7);
  } finally {
    f.native.close();
  }
});

test('restricted decomposition never bypasses a real foreign occupancy claim', async () => {
  const f = binding(25);
  try {
    claimOccupancy({
      projectDir: f.native.root,
      issue: 107,
      sid: 'foreign-continuation-owner',
      provider: 'claude',
      worktreePath: f.native.root,
    });
    await assert.rejects(verbStart(f.ctx), { code: 'occupancy-issue-held' });
    assert.equal(f.native.active(), null);
    assert.equal(f.authority.writes.length, 0);
  } finally {
    f.native.close();
  }
});

test('no-network bind remains restricted and does not call decomposition refresh or collect', async () => {
  const f = binding(7);
  const previous = process.env.TT_SKIP_NETWORK;
  let reads = 0;
  try {
    process.env.TT_SKIP_NETWORK = '1';
    f.ctx.decomposition.runtime = {
      refresh: async (...args) => {
        reads++;
        return f.runtime.refresh(...args);
      },
      collect: async (...args) => {
        reads++;
        return f.runtime.collect(...args);
      },
    };
    const result = await verbStart(f.ctx);
    assert.equal(result.decomposition.capabilities.includes('scoped-implementation'), false);
    assert.equal(reads, 0);
    assert.equal(result.decomposition.capabilities.includes('governed-decomposition'), false);
    assert.equal(f.authority.writes.length, 0);
  } finally {
    if (previous === undefined) delete process.env.TT_SKIP_NETWORK;
    else process.env.TT_SKIP_NETWORK = previous;
    f.native.close();
  }
});

test('lifecycle Explain honors skipped network before reading current decomposition', async () => {
  const f = binding(25);
  const prior = process.env.TT_SKIP_NETWORK;
  let reads = 0;
  try {
    process.env.TT_SKIP_NETWORK = '1';
    const attempt = createObservationAttempt({
      repository: 'o/r',
      issue: 107,
      boundaryId: 'skipped-continuation-proof',
      now: () => new Date().toISOString(),
      read: async (request) => ({
        ...request,
        value: { number: 107, body: f.authority.body, state: 'develop', assignees: [] },
      }),
    });
    const decision = await evaluateAction({
      actionId: 'promote',
      repository: 'o/r',
      issue: 107,
      inputs: {
        state: 'develop',
        head: 'a'.repeat(40),
        body: f.authority.body,
        config: f.cfg,
        sessionState: {},
      },
      attempt,
      deps: {
        effectAttempts: () => f.authority.writes,
        decomposition: {
          subject: f.subject,
          runtime: {
            collect: async (...args) => {
              reads++;
              return f.runtime.collect(...args);
            },
          },
        },
        testPorts: { cfg: f.cfg, projectDir: f.native.root },
      },
    });
    assert.equal(reads, 0);
    assert.ok(
      decision.blockers.some((blocker) => blocker.code === 'decomposition-authority-unavailable')
    );
    assert.equal(f.authority.writes.length, 0);
  } finally {
    if (prior === undefined) delete process.env.TT_SKIP_NETWORK;
    else process.env.TT_SKIP_NETWORK = prior;
    f.native.close();
  }
});

test('four independent plan tasks restrict a 23-hour M story through actual bind composition', async () => {
  const f = binding(23);
  try {
    const content = Array.from(
      { length: 4 },
      (_, i) =>
        '### Task ' +
        (i + 1) +
        ': Deliver independently\nRun: ' +
        '\x60node verify-' +
        i +
        '.mjs\x60'
    ).join('\n\n');
    f.authority.values.plan = {
      path: 'docs/plan.md',
      commit: '1'.repeat(40),
      section: null,
      digest: hash(content),
      availability: 'available',
      content,
      references: 'shared contract bytes',
    };
    const result = await verbStart(f.ctx);
    assert.equal(result.decomposition.assessment.status, 'must-decompose');
    assert.equal(result.decomposition.capabilities.includes('scoped-implementation'), false);
  } finally {
    f.native.close();
  }
});

test('read-only session observation refuses stale projection without repairing it', async () => {
  const f = binding(7);
  try {
    await f.runtime.refresh(f.subject);
    f.authority.body = f.authority.body.replace(
      'Collect current authority.',
      'Collect current and revised authority.'
    );
    const writes = f.authority.writes.length;
    const cfg = { ...f.cfg, preferences: { gateAssigneeMatch: false } };
    const result = await evaluateSessionReadiness({
      actionId: 'bind',
      issue: 107,
      config: cfg,
      stateBefore: {},
      projectDir: f.native.root,
      invokingDir: f.native.root,
      deps: {
        readIssueBody: async () => f.authority.body,
        fetchAssignmentSnapshot: async () => ({ state: 'develop', assignees: [] }),
        resolveProjectDir: () => f.native.root,
        readWorktreeIdentity: () => ({ worktreePath: f.native.root }),
        readOccupancy: () => ({}),
        loadMigrationJournal: () => null,
        decomposition: { subject: f.subject, runtime: f.runtime },
      },
    });
    assert.equal(result.status, 'ready');
    assert.ok(
      result.warnings.some(
        (warning) => warning.args.reason === 'decomposition-authority-unavailable'
      )
    );
    assert.equal(f.authority.writes.length, writes);
    assert.equal((await f.runtime.collect(f.subject)).projection.status, 'stale');
  } finally {
    f.native.close();
  }
});

import { registerDecompositionHookCases } from './decomposition-hook.cases.mjs';
registerDecompositionHookCases();

import { registerDecompositionRemoteCases } from './decomposition-remote.cases.mjs';
registerDecompositionRemoteCases();

registerDecompositionTargetCases();
