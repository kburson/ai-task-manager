function fail(category) {
  throw new Error(`estimation-outcome-chain:${category}`);
}

export function activeEstimationOutcomes(records = []) {
  if (!Array.isArray(records)) fail('records');
  const outcomes = records.filter(
    (record) => record?.envelope?.recordType === 'estimation-outcome'
  );
  const byId = new Map();
  for (const record of outcomes) {
    const id = record.envelope.recordId;
    if (typeof id !== 'string' || byId.has(id)) fail('duplicate-id');
    byId.set(id, record);
  }

  const supersededIds = new Set();
  for (const record of outcomes) {
    const supersedes = record.envelope.supersedes ?? null;
    if (supersedes === null) continue;
    if (!byId.has(supersedes)) fail('dangling');
    if (supersededIds.has(supersedes)) fail('fork');
    supersededIds.add(supersedes);
  }

  for (const record of outcomes) {
    const seen = new Set([record.envelope.recordId]);
    let supersedes = record.envelope.supersedes ?? null;
    while (supersedes !== null) {
      if (seen.has(supersedes)) fail('cycle');
      seen.add(supersedes);
      supersedes = byId.get(supersedes).envelope.supersedes ?? null;
    }
  }

  return outcomes.filter((record) => !supersededIds.has(record.envelope.recordId));
}
