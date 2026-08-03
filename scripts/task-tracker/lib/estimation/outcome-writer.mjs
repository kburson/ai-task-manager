import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { runLogicalRecordClaim } from './record-claim.mjs';

function fail(category) {
  throw new Error(`estimation-outcome-writer:${category}`);
}

async function ensureEstimationOutcomeUnlocked({ issue, forecast, outcomePayload, deps }) {
  if (!forecast && outcomePayload?.kind !== 'epic-orchestration')
    return { status: 'legacy-no-forecast' };
  if (
    !Number.isInteger(issue) ||
    issue <= 0 ||
    (forecast && forecast.payload?.issue !== issue) ||
    outcomePayload?.issue !== issue
  )
    fail('input');
  const forecastRecordId = forecast?.recordId ?? null;
  const kind = forecast ? 'story' : 'epic-orchestration';
  if (typeof deps.listOutcomeRecords !== 'function') fail('dependencies');
  const records = await deps.listOutcomeRecords({ issue, forecastRecordId });
  if (!Array.isArray(records)) fail('records');
  const matching = records.filter(
    (record) =>
      record?.envelope?.recordType === 'estimation-outcome' &&
      record.envelope.payload?.issue === issue &&
      record.envelope.payload?.forecastRecordId === forecastRecordId &&
      record.envelope.payload?.kind === kind
  );
  if (matching.length > 1) fail('duplicate');
  if (matching.length === 1) {
    if (canonicalRecordJson(matching[0].envelope.payload) !== canonicalRecordJson(outcomePayload)) {
      fail('payload-mismatch');
    }
    return {
      status: 'existing',
      recordId: matching[0].envelope.recordId,
      commentNodeId: matching[0].commentNodeId,
    };
  }
  if (
    records.some(
      (record) =>
        record?.envelope?.recordType === 'estimation-outcome' &&
        record.envelope.payload?.issue === issue
    )
  ) {
    fail('conflict');
  }
  if (typeof deps.createOutcomeEnvelope !== 'function' || typeof deps.writeOutcome !== 'function') {
    fail('dependencies');
  }
  const envelope = deps.createOutcomeEnvelope({ issue, payload: outcomePayload });
  const written = await deps.writeOutcome({ issue, envelope });
  if (
    written?.envelope?.recordType !== 'estimation-outcome' ||
    written.envelope.payload?.issue !== issue ||
    written.envelope.payload?.forecastRecordId !== forecastRecordId ||
    written.envelope.payload?.kind !== kind
  ) {
    fail('write-readback');
  }
  return {
    status: 'written',
    recordId: written.envelope.recordId,
    commentNodeId: written.commentNodeId,
  };
}

export async function ensureEstimationOutcome({ issue, forecast, outcomePayload, deps = {} } = {}) {
  if (!forecast && outcomePayload?.kind !== 'epic-orchestration') {
    return { status: 'legacy-no-forecast' };
  }
  const forecastRecordId = forecast?.recordId ?? null;
  const kind = forecast ? 'story' : 'epic-orchestration';
  return runLogicalRecordClaim(
    deps,
    { key: `outcome:${issue}:${kind}:${forecastRecordId ?? 'none'}`, issue },
    () => ensureEstimationOutcomeUnlocked({ issue, forecast, outcomePayload, deps })
  );
}
