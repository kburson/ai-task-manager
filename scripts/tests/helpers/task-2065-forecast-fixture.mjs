// @story #2039 #2065
// Synthetic offline retained/transport fixtures; no cloud hydration or live authority.
import { bundle } from './local-estimation-evidence-fixture.mjs';
import { validateLocalEvidence } from '../../task-tracker/lib/estimation/local-evidence.mjs';
import {
  createAitmRecordEnvelope,
  hashRecordPayload,
  renderAitmRecord,
  parseAitmRecord,
} from '../../task-tracker/lib/github-records/record-envelope.mjs';

export function retainedContext({ repository, issue, rubricIssue, rubric, refine }) {
  const evidence = bundle([{ record: rubric, provenance: 'imported-local' }], {
    repository,
    issue,
    configuration: { estimationRubricIssue: rubricIssue },
    refine: {
      ...refine,
      source: { kind: 'imported-local', id: 'integration-refine', digest: 'b'.repeat(64) },
    },
    modelPolicy: {
      modelVersion: 'aitm.forecast-model/v2',
      policyVersion: 'aitm.local-estimation/v1',
    },
  });
  const {
    inputs: _inputs,
    schema: _schema,
    canonicalizationVersion: _canonical,
    ...selection
  } = evidence.manifest;
  const retained = validateLocalEvidence(evidence);
  return {
    evidence,
    selection,
    localForecast: {
      manifestDigest: retained.manifestDigest,
      evidenceStore: { read: () => validateLocalEvidence(evidence) },
      identity: { host: 'github.com', repository, issue },
      selection,
    },
  };
}

export function forecastEnvelopeFixture(fields) {
  if (
    fields.recordType !== 'estimation-forecast' ||
    fields.payload.schema === 'aitm.estimation-forecast/v3'
  )
    return createAitmRecordEnvelope(fields);
  const { recordType, repository, issue, payload, predecessor, supersedes, actor } = fields;
  const legacy = {
    schema: 'aitm.record/v1',
    recordType,
    repository,
    issue,
    payload,
    predecessor,
    supersedes,
    createdAt: fields.createdAt,
    recordId: fields.recordId,
    authority: { grantId: fields.grantId, epoch: 1, actor },
    payloadHash: hashRecordPayload(payload),
  };
  return parseAitmRecord({
    commentNodeId: 'IC_legacy_fixture',
    body: renderAitmRecord({ envelope: legacy }),
    expectedRepository: repository,
    expectedIssue: issue,
  }).envelope;
}
