import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync as removePublicationDir } from 'node:fs';
import {
  formatIssueFieldDb as publicationFields,
  stripIssueFieldDb as stripPublicationFields,
} from '../../../../task-tracker/issue-field-db.mjs';
import {
  createDecompositionRuntime as publicationRuntime,
  collectDecompositionAuthority as publicationCollect,
} from '../../../../task-tracker/lib/decomposition-authority.mjs';
import {
  fixture as publicationFixture,
  subject as publicationSubject,
  observed as publicationObserved,
  freshUnitDir as publicationDir,
} from './decomposition-authority-fixtures.mjs';
import { readDecompositionRecords as publicationRecords } from '../../../../task-tracker/lib/decomposition-records.mjs';
import { runInflateEstimate as realInflate } from '../../../../task-tracker/verbs/inflate-estimate.mjs';

export function registerEstimatePublicationCases() {
  // @story #1988

  // @story #1988 — real publication owner, transport read-back and interruption.

  const publicationCfg = { repo: 'o/r', projectId: 'PVT_a' };
  async function loadPublisher() {
    const module = await import('../../../../task-tracker/lib/decomposition-publication.mjs').catch(
      () => ({})
    );
    assert.equal(
      typeof module.publishEstimateRevision,
      'function',
      'shared resumable publication owner is missing'
    );
    return module.publishEstimateRevision;
  }
  async function publicationCase(hours, failure = null) {
    const f = publicationFixture(10),
      future = publicationFixture(hours);
    f.values.forecast = future.values.forecast = { estimate: null, size: null, recordId: null };
    const dir = publicationDir('publication-');
    let productEffects = 0,
      interrupted = false;
    const effects = [
      {
        id: 'estimate',
        resource: 'project-estimate',
        targetIdentity: 'PVTI_a',
        value: hours,
        read: async () => publicationObserved(f.values.project.estimate),
        apply: async () => {
          productEffects++;
          assert.equal(publicationRecords(f.body).publication.status, 'pending');
          f.values.project.estimate = hours;
          if (failure === 'estimate' && !interrupted) {
            interrupted = true;
            throw new Error('transport unknown');
          }
        },
      },
      {
        id: 'fields',
        resource: 'body-fields',
        targetIdentity: 'o/r#1987:fields',
        value: { estimate: hours, size: 'M' },
        read: async () =>
          publicationObserved({
            estimate: (
              await publicationCollect({
                subject: publicationSubject,
                cfg: publicationCfg,
                projectDir: dir,
                deps: f.deps,
              })
            ).sourceObservations.readIssue.value.body.match(/"estimate":(\d+)/)
              ? JSON.parse(f.body.match(/<!-- aitm-fields: (.+?) -->/)[1]).values.estimate
              : null,
            size: 'M',
          }),
        apply: async () => {
          productEffects++;
          f.body =
            stripPublicationFields(f.body) +
            '\n' +
            publicationFields({ estimate: hours, size: 'M' }) +
            '\n';
          if (failure === 'fields' && !interrupted) {
            interrupted = true;
            throw new Error('transport unknown');
          }
        },
      },
    ];
    f.deps.readPublicationEffect = async ({ effect }) =>
      effects.find((e) => e.id === effect.id).read();
    const before = await publicationCollect({
      subject: publicationSubject,
      cfg: publicationCfg,
      projectDir: dir,
      deps: f.deps,
    });
    const intended = await publicationCollect({
      subject: publicationSubject,
      cfg: publicationCfg,
      projectDir: dir,
      deps: future.deps,
    });
    const args = {
      subject: publicationSubject,
      operationId: 'b41d3bf2-e26e-477e-88d1-b2db32793001',
      expectedInputDigest: before.inputDigest,
      proposal: { estimate: { basis: 'published', hours, proposalId: null }, size: 'M' },
      effects,
      deps: {
        writerId: 'inflate-estimate',
        intendedInputDigest: intended.inputDigest,
        runtime: publicationRuntime({ cfg: publicationCfg, projectDir: dir, deps: f.deps }),
      },
    };
    return {
      f,
      dir,
      args,
      get effects() {
        return productEffects;
      },
    };
  }
  for (const [hours, want] of [
    [23, 'needs-decomposition-review'],
    [24, 'must-decompose'],
    [25, 'must-decompose'],
  ]) {
    test(
      'real publication confirms ' +
        hours +
        ' and preserves lifecycle without false threshold admission',
      async () => {
        const publish = await loadPublisher(),
          c = await publicationCase(hours);
        try {
          const result = await publish(c.args);
          assert.equal(result.status, 'recorded');
          assert.equal(c.effects, 2);
          const r = publicationRecords(c.f.body);
          assert.equal(r.publication.status, 'complete');
          assert.equal(r.assessment.status, want);
          assert.match(c.f.body, /state="develop"/);
          assert.equal(r.assessment.capabilities.includes('scoped-implementation'), hours === 23);
        } finally {
          removePublicationDir(c.dir, { recursive: true, force: true });
        }
      }
    );
  }
  for (const failure of ['estimate', 'fields']) {
    test('uncertain ' + failure + ' retains fence and reconciles before exact replay', async () => {
      const publish = await loadPublisher(),
        c = await publicationCase(25, failure);
      try {
        const first = await publish(c.args);
        assert.equal(first.status, 'partial');
        assert.equal(publicationRecords(c.f.body).publication.status, 'pending');
        assert.equal(
          publicationRecords(c.f.body).assessment.capabilities.includes('scoped-implementation'),
          false
        );
        const second = await publish(c.args);
        assert.equal(second.status, 'recorded');
        assert.equal(c.effects, 2, 'already applied uncertain effect must not repeat');
        assert.equal(
          publicationRecords(c.f.body).publication.effects.filter(
            (e) => e.resource === 'project-estimate'
          ).length,
          1
        );
      } finally {
        removePublicationDir(c.dir, { recursive: true, force: true });
      }
    });
  }
  test('pending before first product effect survives refresh and exact writer recovery', async () => {
    const publish = await loadPublisher(),
      c = await publicationCase(25);
    let once = true;
    c.args.deps.beforeEffects = async () => {
      if (once) {
        once = false;
        throw new Error('process interrupted');
      }
    };
    try {
      assert.equal((await publish(c.args)).status, 'partial');
      assert.equal(c.effects, 0);
      await c.args.deps.runtime.refresh(publicationSubject);
      assert.equal(publicationRecords(c.f.body).publication.status, 'pending');
      assert.equal((await publish(c.args)).status, 'recorded');
    } finally {
      removePublicationDir(c.dir, { recursive: true, force: true });
    }
  });

  test('confirmed field revision makes prior Plan forecast historical while preserving its observation', async () => {
    const publish = await loadPublisher(),
      c = await publicationCase(25);
    c.f.values.forecast = { estimate: 10, size: 'M', recordId: 'forecast-a' };
    const initial = await publicationCollect({
      subject: publicationSubject,
      cfg: publicationCfg,
      projectDir: c.dir,
      deps: c.f.deps,
    });
    const intended = structuredClone(initial.input);
    intended.estimate = { basis: 'published', hours: 25, proposalId: null };
    intended.observations.find((o) => o.resource === 'project').digest = (
      await import('./decomposition-authority-fixtures.mjs')
    ).hash({ projectId: 'PVT_a', projectItemId: 'PVTI_a', estimate: 25, size: 'M' });
    const { decompositionInputDigest } =
      await import('../../../../task-tracker/lib/decomposition-assessment.mjs');
    c.args.expectedInputDigest = initial.inputDigest;
    c.args.deps.intendedInputDigest = decompositionInputDigest(intended);
    try {
      const result = await publish(c.args);
      assert.equal(result.status, 'recorded', result.reason);
      const current = await c.args.deps.runtime.collect(publicationSubject);
      assert.equal(current.input.availability.status, 'complete');
      assert.equal(current.input.estimate.hours, 25);
      assert.equal(
        current.input.observations.find((o) => o.resource === 'forecast').identity,
        'forecast-a'
      );
    } finally {
      removePublicationDir(c.dir, { recursive: true, force: true });
    }
  });

  for (const state of ['backlog', 'refine', 'ready-for-plan', 'plan', 'develop', 'test', 'review'])
    for (const hours of [23, 24, 25]) {
      test(
        'actual inflation adapter ' +
          state +
          ' 10→' +
          hours +
          ' confirms projections and single keyed history',
        async () => {
          const f = publicationFixture(10),
            dir = publicationDir('inflation-');
          f.body = f.body.replace('state="develop"', 'state="' + state + '"');
          f.values.forecast = { estimate: 10, size: 'M', recordId: 'forecast-a' };
          let comment = {
            id: 99,
            body: '<!-- aitm-refined-estimate: 1987 -->\n### Refine estimate\n',
          };
          const cfg = { ...publicationCfg, fieldIds: { size: 'F_SIZE', estimate: 'F_EST' } };
          const deps = {
            decomposition: f.deps,
            projectDir: dir,
            listComments: async () => [comment],
            patchComment: async ({ body }) => {
              comment = { ...comment, body };
            },
            getIssueBody: async () => f.body,
            mutateIssueBody: async ({ mutate }) => {
              f.body = await mutate(f.body);
            },
            projectValuesForIssue: async () => ({
              size: f.values.project.size,
              estimate: f.values.project.estimate,
            }),
            projectItemForIssue: async () => ({ itemId: 'PVTI_a' }),
            fieldOptionMap: async () => ({ F_SIZE: { M: 'M' } }),
            loadProjectFieldDefs: () => [
              { key: 'size', type: 'single_select' },
              { key: 'estimate', type: 'number' },
            ],
            writeProjectFieldValue: async ({ fieldId, value }) => {
              if (fieldId === 'F_EST') f.values.project.estimate = value.number;
              else f.values.project.size = value.singleSelectOptionName;
              return true;
            },
          };
          const args = {
            issueNumber: 1987,
            size: 'M',
            estimate: String(hours),
            reason: 'More work',
            items: ['Work (~1h)'],
          };
          try {
            const result = await realInflate(args, cfg, deps);
            assert.equal(result.status, 'recorded');
            assert.equal(publicationRecords(f.body).publication.status, 'complete');
            assert.equal(f.values.project.estimate, hours);
            assert.match(f.body, new RegExp('state="' + state + '"'));
            await realInflate(args, cfg, deps);
            assert.equal(
              (comment.body.match(/Discovered work — estimate inflation/g) || []).length,
              1
            );
          } finally {
            removePublicationDir(dir, { recursive: true, force: true });
          }
        }
      );
    }

  function recoveryInflationFixture() {
    const f = publicationFixture(10),
      dir = publicationDir('inflation-recovery-');
    f.values.forecast = { estimate: null, size: null, recordId: null };
    let comment = { id: 99, body: '<!-- aitm-refined-estimate: 1987 -->\n### Refine estimate\n' },
      counts = { audit: 0, size: 0, estimate: 0, fields: 0 };
    const cfg = { ...publicationCfg, fieldIds: { size: 'F_SIZE', estimate: 'F_EST' } };
    const deps = {
      decomposition: f.deps,
      projectDir: dir,
      listComments: async () => [comment],
      patchComment: async ({ body }) => {
        counts.audit++;
        comment = { ...comment, body };
      },
      getIssueBody: async () => f.body,
      mutateIssueBody: async ({ mutate }) => {
        counts.fields++;
        f.body = await mutate(f.body);
      },
      projectValuesForIssue: async () => ({ ...f.values.project }),
      projectItemForIssue: async () => ({ itemId: 'PVTI_a' }),
      fieldOptionMap: async () => ({ F_SIZE: { M: 'M', L: 'L' } }),
      loadProjectFieldDefs: () => [
        { key: 'size', type: 'single_select' },
        { key: 'estimate', type: 'number' },
      ],
      writeProjectFieldValue: async ({ fieldId, value }) => {
        if (fieldId === 'F_EST') {
          counts.estimate++;
          f.values.project.estimate = value.number;
        } else {
          counts.size++;
          f.values.project.size = value.singleSelectOptionName;
        }
        return true;
      },
    };
    return {
      f,
      dir,
      cfg,
      deps,
      counts,
      get comment() {
        return comment;
      },
      args: {
        issueNumber: 1987,
        size: 'L',
        estimate: '25',
        reason: 'New work',
        items: ['Large revision (~15h)'],
      },
    };
  }
  for (const effect of ['audit', 'size', 'estimate', 'fields'])
    for (const outcome of ['before', 'after']) {
      test(
        'actual inflation ' +
          outcome +
          ' ' +
          effect +
          ' failure resumes without duplicate confirmed truth',
        async () => {
          const c = recoveryInflationFixture();
          let fail = true;
          const method =
              effect === 'audit'
                ? 'patchComment'
                : effect === 'fields'
                  ? 'mutateIssueBody'
                  : 'writeProjectFieldValue',
            original = c.deps[method];
          c.deps[method] = async (arg) => {
            const matched =
              !['size', 'estimate'].includes(effect) ||
              arg.fieldId === (effect === 'size' ? 'F_SIZE' : 'F_EST');
            if (fail && matched && outcome === 'before') {
              fail = false;
              throw new Error('transport before');
            }
            const result = await original(arg);
            if (fail && matched && outcome === 'after') {
              fail = false;
              throw new Error('transport unknown');
            }
            return result;
          };
          try {
            const first = await realInflate(c.args, c.cfg, c.deps);
            assert.equal(first.status, 'partial');
            assert.equal(publicationRecords(c.f.body).publication.status, 'pending');
            const second = await realInflate(c.args, c.cfg, c.deps);
            assert.equal(second.status, 'recorded', second.reason);
            assert.deepEqual(c.counts, { audit: 1, size: 1, estimate: 1, fields: 1 });
            assert.equal(
              (c.comment.body.match(/Discovered work — estimate inflation/g) || []).length,
              1
            );
          } finally {
            removePublicationDir(c.dir, { recursive: true, force: true });
          }
        }
      );
    }
  test('no refine comment performs zero estimate effects and creates no revision', async () => {
    const c = recoveryInflationFixture();
    c.deps.listComments = async () => [];
    try {
      assert.equal((await realInflate(c.args, c.cfg, c.deps)).status, 'no-refine-comment');
      assert.deepEqual(c.counts, { audit: 0, size: 0, estimate: 0, fields: 0 });
      assert.equal(publicationRecords(c.f.body).publication, null);
    } finally {
      removePublicationDir(c.dir, { recursive: true, force: true });
    }
  });
  test('inherited subprocess issue token cannot obtain publication identity or effects', async () => {
    const c = recoveryInflationFixture(),
      before = process.env.AITM_ISSUE_LOCK_HELD;
    process.env.AITM_ISSUE_LOCK_HELD = '1987';
    try {
      const result = await realInflate(c.args, c.cfg, c.deps);
      assert.equal(result.status, 'refused');
      assert.match(result.reason, /lock-owner|owner-context/);
      assert.deepEqual(c.counts, { audit: 0, size: 0, estimate: 0, fields: 0 });
      assert.equal(publicationRecords(c.f.body).publication, null);
    } finally {
      if (before === undefined) delete process.env.AITM_ISSUE_LOCK_HELD;
      else process.env.AITM_ISSUE_LOCK_HELD = before;
      removePublicationDir(c.dir, { recursive: true, force: true });
    }
  });
  test('publication refuses unregistered effects with a typed outcome and zero writes', async () => {
    const publish = await loadPublisher(),
      c = await publicationCase(25);
    c.args.effects[0].resource = 'arbitrary-effect';
    try {
      const result = await publish(c.args);
      assert.equal(result.status, 'refused');
      assert.match(result.reason, /effect-resource/);
      assert.equal(c.effects, 0);
      assert.equal(c.f.writes.length, 0);
    } finally {
      removePublicationDir(c.dir, { recursive: true, force: true });
    }
  });
  test('published lower value completes truthfully while a higher human proposal still restricts implementation', async () => {
    const publish = await loadPublisher(),
      c = await publicationCase(23);
    c.f.values.forecast = {
      estimate: 10,
      size: 'M',
      recordId: null,
      proposals: [
        {
          proposalId: 'comment:IC_human:human-attention',
          hours: 25,
          size: 'M',
          sourceDigest: 'a'.repeat(64),
        },
      ],
    };
    const initial = await publicationCollect({
        subject: publicationSubject,
        cfg: publicationCfg,
        projectDir: c.dir,
        deps: c.f.deps,
      }),
      intended = structuredClone(initial.input);
    const { hash } = await import('./decomposition-authority-fixtures.mjs');
    intended.observations.find((o) => o.resource === 'project').digest = hash({
      projectId: 'PVT_a',
      projectItemId: 'PVTI_a',
      estimate: 23,
      size: 'M',
    });
    const { decompositionInputDigest } =
      await import('../../../../task-tracker/lib/decomposition-assessment.mjs');
    c.args.expectedInputDigest = initial.inputDigest;
    c.args.deps.intendedInputDigest = decompositionInputDigest(intended);
    try {
      const result = await publish(c.args);
      assert.equal(result.status, 'recorded', result.reason ?? 'publication failed');
      const r = publicationRecords(c.f.body);
      assert.equal(r.publication.proposal.estimate.hours, 23);
      assert.equal(r.assessment.estimate.basis, 'proposed');
      assert.equal(r.assessment.estimate.hours, 25);
      assert.equal(r.assessment.capabilities.includes('scoped-implementation'), false);
      assert.equal(c.f.values.project.estimate, 23);
    } finally {
      removePublicationDir(c.dir, { recursive: true, force: true });
    }
  });

  test('inflation keeps actual half-hour values while the assessment uses the whole-hour threshold', async () => {
    const c = recoveryInflationFixture();
    c.args.estimate = '23.5';
    try {
      const result = await realInflate(c.args, c.cfg, c.deps);
      assert.equal(result.status, 'recorded', result.reason ?? 'publication failed');
      assert.equal(c.f.values.project.estimate, 23.5);
      assert.match(c.f.body, /"estimate":23\.5/);
      const r = publicationRecords(c.f.body);
      assert.equal(r.publication.proposal.estimate.hours, 24);
      assert.equal(r.assessment.status, 'must-decompose');
    } finally {
      removePublicationDir(c.dir, { recursive: true, force: true });
    }
  });
}
