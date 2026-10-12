import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { fixture, subject, observed, freshUnitDir } from './decomposition-authority-fixtures.mjs';
import { readDecompositionRecords } from '../../../../task-tracker/lib/decomposition-records.mjs';
import { formatIssueFieldDb, stripIssueFieldDb } from '../../../../task-tracker/issue-field-db.mjs';
import {
  applyPlanEstimateAuthority,
  adoptLegacyPlanForecast,
  upsertForecastReadyMarker,
} from '../../../../task-tracker/lib/estimation/plan-estimate-authority.mjs';
import { FORECAST_SCHEMA } from '../../../../task-tracker/lib/estimation/forecast-record.mjs';
import { hashRecordPayload } from '../../../../task-tracker/lib/github-records/record-envelope.mjs';

export function registerAdaptivePublicationCases() {
  // @story #1988 — adaptive production authority over real decomposition runtime.

  function adaptiveCase(hours, failAfter = null) {
    const f = fixture(10),
      dir = freshUnitDir('adaptive-publication-');
    f.body = f.body.replace('state="develop"', 'state="plan"');
    const payload = {
      schema: FORECAST_SCHEMA,
      issue: 1987,
      lifecycleState: 'plan',
      refine: { size: 'M', humanHours: 10 },
      plan: {
        size: 'L',
        humanHours: hours,
        deltaHours: hours - 10,
        rationale: 'Discovered implementation complexity.',
      },
      ai: {
        p50EngagedHours: 10,
        p80EngagedHours: 15,
        stages: { plan: 1, develop: 6, test: 2, review: 1 },
      },
      wbs: [
        {
          id: 'all',
          description: 'Implement revised scope',
          humanHours: hours,
          signals: ['estimation'],
        },
      ],
      comparableIssues: [],
      rubric: {
        recordId: '01J00000000000000000000600',
        version: 1,
        cohortSize: 0,
        confidence: 0.1,
      },
      testPlan: { impactedLanes: ['unit'], isolation: 'fixture', expectedMinutes: 5 },
      risks: [],
      recommendation: { action: 'proceed', reason: 'Reviewable.' },
      supersedesForecastRecordId: null,
    };
    const envelope = {
      recordId: '01J00000000000000000000601',
      recordType: 'estimation-forecast',
      payloadHash: hashRecordPayload(payload),
      payload,
    };
    const state = {
      lifecycleState: 'plan',
      refineAppendix: null,
      board: { size: 'M', estimate: 10 },
      bodyFields: { size: 'M', estimate: 10 },
      forecasts: [],
      readyForecastRecordId: null,
      frozenForecastRecordId: null,
    };
    let effects = 0,
      failed = false;
    const check = () =>
      assert.equal(
        readDecompositionRecords(f.body).publication?.status,
        'pending',
        'pending intent must precede every adaptive effect'
      );
    const maybeFail = () => {
      effects++;
      if (effects === failAfter && !failed) {
        failed = true;
        throw new Error('uncertain effect');
      }
    };
    const decomposition = {
      ...f.deps,
      readProject: async () => observed({ ...f.values.project, ...state.board }),
      readForecast: async () => {
        const record = state.forecasts[0];
        const value = {
          estimate: record ? hours : null,
          size: record ? 'L' : null,
          recordId: record?.recordId ?? null,
          proposals: [],
          observedProjections: [{ ...state.board }, { ...state.bodyFields }],
        };
        if (record && state.readyForecastRecordId !== record.recordId) {
          value.publicationTransition = {
            recordId: record.recordId,
            payloadHash: record.payloadHash,
            readyRecordId: state.readyForecastRecordId,
          };
          return { ...observed(value), status: 'unavailable' };
        }
        return observed(value);
      },
    };
    const cfg = { repo: 'o/r', projectId: 'PVT_a' };
    const deps = {
      cfg,
      projectDir: dir,
      decomposition,
      projectItemForIssue: async () => ({ itemId: 'PVTI_a' }),
      readProjection: async () => structuredClone(state),
      writeRefineAppendix: async ({ refine, plan }) => {
        check();
        state.refineAppendix = { refine, plan };
        maybeFail();
      },
      writeBoardEstimate: async ({ estimate }) => {
        check();
        state.board.estimate = estimate;
        maybeFail();
      },
      writeBoardSize: async ({ size }) => {
        check();
        state.board.size = size;
        maybeFail();
      },
      writeBodyFields: async ({ estimate, size }) => {
        check();
        state.bodyFields = { estimate, size };
        f.body = stripIssueFieldDb(f.body) + '\n' + formatIssueFieldDb({ estimate, size }) + '\n';
        maybeFail();
      },
      writeForecast: async ({ envelope: value }) => {
        check();
        state.forecasts.push({
          recordId: value.recordId,
          payloadHash: value.payloadHash,
          commentNodeId: 'IC_forecast',
        });
        maybeFail();
      },
      writeForecastReadyMarker: async ({ recordId }) => {
        check();
        state.readyForecastRecordId = recordId;
        f.body = upsertForecastReadyMarker(f.body, recordId);
        maybeFail();
      },
    };
    return {
      f,
      dir,
      state,
      deps,
      envelope,
      get effects() {
        return effects;
      },
      args: { cfg, issueNumber: 1987, refine: payload.refine, forecastEnvelope: envelope, deps },
    };
  }
  for (const hours of [23, 24, 25])
    test(
      'adaptive authority ' +
        hours +
        ' seals intent before six effects and completes current assessment',
      async () => {
        const c = adaptiveCase(hours);
        try {
          const result = await applyPlanEstimateAuthority(c.args);
          assert.equal(result.status, 'converged', result.reason);
          assert.equal(readDecompositionRecords(c.f.body).publication.status, 'complete');
          assert.equal(
            readDecompositionRecords(c.f.body).assessment.status,
            hours === 23 ? 'needs-decomposition-review' : 'must-decompose'
          );
          assert.equal(c.effects, 6);
          assert.equal(c.state.forecasts.length, 1);
        } finally {
          rmSync(c.dir, { recursive: true, force: true });
        }
      }
    );

  for (let seam = 1; seam <= 6; seam++)
    test(
      'adaptive uncertain effect ' +
        seam +
        ' recovers original manifest without duplicated remote effects',
      async () => {
        const c = adaptiveCase(25, seam);
        try {
          const first = await applyPlanEstimateAuthority(c.args);
          assert.equal(first.status, 'partial');
          assert.equal(readDecompositionRecords(c.f.body).publication.status, 'pending');
          assert.equal(
            readDecompositionRecords(c.f.body).assessment.capabilities.includes(
              'scoped-implementation'
            ),
            false
          );
          const final = await applyPlanEstimateAuthority(c.args);
          assert.equal(final.status, 'converged', final.reason);
          assert.equal(c.effects, 6);
          assert.equal(c.state.forecasts.length, 1);
          assert.equal(readDecompositionRecords(c.f.body).publication.status, 'complete');
        } finally {
          rmSync(c.dir, { recursive: true, force: true });
        }
      }
    );

  test('legacy adoption assesses exact existing values with pending intent before forecast and ready writes', async () => {
    const c = adaptiveCase(25);
    c.state.lifecycleState = 'develop';
    c.state.board = { estimate: 25, size: 'L' };
    c.state.bodyFields = { estimate: 25, size: 'L' };
    c.state.refineAppendix = { refine: c.envelope.payload.refine, plan: c.envelope.payload.plan };
    c.f.body =
      stripIssueFieldDb(c.f.body).replace('state="plan"', 'state="develop"') +
      '\n' +
      formatIssueFieldDb(c.state.bodyFields) +
      '\n';
    try {
      const result = await adoptLegacyPlanForecast(c.args);
      assert.equal(result.status, 'converged', result.reason);
      assert.equal(c.effects, 2);
      assert.equal(readDecompositionRecords(c.f.body).publication.status, 'complete');
      assert.equal(readDecompositionRecords(c.f.body).assessment.status, 'must-decompose');
    } finally {
      rmSync(c.dir, { recursive: true, force: true });
    }
  });
}
