// @story #1988 — complete provider model for adaptive authority integration.
import {
  estimationIssueBody,
  estimationPublicationFixture,
  estimationObservation,
} from './estimation-publication.mjs';
import { stripIssueFieldDb, formatIssueFieldDb } from '../../task-tracker/issue-field-db.mjs';
import { writeEstimationRecord } from '../../task-tracker/lib/estimation/renderers.mjs';
export function createAdaptiveAuthorityHarness({ repository, issue, transport, recordLog }) {
  const state = {
    lifecycleState: 'plan',
    refineAppendix: null,
    board: { size: 'M', estimate: 8 },
    bodyFields: { size: 'M', estimate: 8 },
    forecasts: [],
    readyForecastRecordId: null,
    frozenForecastRecordId: null,
  };
  const cfg = { repo: repository, projectId: 'PVT_harness' };
  let body = estimationIssueBody(state.bodyFields);
  const publication = estimationPublicationFixture({
    cfg,
    issueNumber: issue,
    getBody: () => body,
    setBody: (next) => {
      body = next;
    },
    getProject: () => state.board,
    getForecast: () => {
      const active = state.forecasts.filter((record) => record.supersededBy == null),
        record = active[0],
        envelope = recordLog.find((r) => r.envelope.recordId === record?.recordId)?.envelope;
      const value = {
        estimate: envelope?.payload.plan.humanHours ?? null,
        size: envelope?.payload.plan.size ?? null,
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
        return { ...estimationObservation(value), status: 'unavailable' };
      }
      return estimationObservation(value);
    },
  });
  return {
    state,
    deps: {
      cfg,
      ...publication,
      readProjection: async () => structuredClone(state),
      writeRefineAppendix: async ({ refine, plan }) => {
        state.refineAppendix = { refine, plan };
      },
      writeBoardEstimate: async ({ estimate }) => {
        state.board.estimate = estimate;
      },
      writeBoardSize: async ({ size }) => {
        state.board.size = size;
      },
      writeBodyFields: async ({ estimate, size }) => {
        state.bodyFields = { estimate, size };
        body = stripIssueFieldDb(body) + '\n' + formatIssueFieldDb(state.bodyFields) + '\n';
      },
      writeForecast: async ({ envelope: recordEnvelope }) => {
        const written = await writeEstimationRecord({
          envelope: recordEnvelope,
          repository,
          issue,
          ...transport,
        });
        recordLog.push(written);
        state.forecasts.push({
          recordId: written.envelope.recordId,
          payloadHash: written.envelope.payloadHash,
          commentNodeId: written.commentNodeId,
          supersededBy: null,
        });
      },
      writeForecastReadyMarker: async ({ recordId }) => {
        state.readyForecastRecordId = recordId;
        body = body + '\n<!-- aitm-estimation-forecast-ready record-id="' + recordId + '" -->\n';
        state.frozenForecastRecordId = recordId;
      },
    },
  };
}
