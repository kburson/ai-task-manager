function fail(category) {
  throw new Error(`estimation-outcome-writer:${category}`);
}

export async function ensureEstimationOutcome({ issue, forecast, outcomePayload, deps = {} } = {}) {
  if (!forecast) return { status: 'legacy-no-forecast' };
  if (!Number.isInteger(issue) || issue <= 0 || forecast.payload?.issue !== issue) fail('input');
  if (typeof deps.listOutcomeRecords !== 'function') fail('dependencies');
  const records = await deps.listOutcomeRecords({ issue, forecastRecordId: forecast.recordId });
  if (!Array.isArray(records)) fail('records');
  const matching = records.filter(
    (record) =>
      record?.envelope?.recordType === 'estimation-outcome' &&
      record.envelope.payload?.issue === issue &&
      record.envelope.payload?.forecastRecordId === forecast.recordId
  );
  if (matching.length > 1) fail('duplicate');
  if (matching.length === 1) {
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
    written.envelope.payload?.forecastRecordId !== forecast.recordId
  ) {
    fail('write-readback');
  }
  return {
    status: 'written',
    recordId: written.envelope.recordId,
    commentNodeId: written.commentNodeId,
  };
}
