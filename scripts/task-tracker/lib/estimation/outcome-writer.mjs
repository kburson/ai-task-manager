import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { runLogicalRecordClaim } from './record-claim.mjs';
import { activeEstimationOutcomes } from './outcome-chain.mjs';

function fail(category) {
  throw new Error(`estimation-outcome-writer:${category}`);
}

async function ensureEstimationOutcomeUnlocked({
  issue,
  forecast,
  outcomePayload,
  supersedeExisting,
  deps,
}) {
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
  const issueOutcomes = records.filter(
    (record) =>
      record?.envelope?.recordType === 'estimation-outcome' &&
      record.envelope.payload?.issue === issue
  );
  const matching = records.filter(
    (record) =>
      record?.envelope?.recordType === 'estimation-outcome' &&
      record.envelope.payload?.issue === issue &&
      record.envelope.payload?.forecastRecordId === forecastRecordId &&
      record.envelope.payload?.kind === kind
  );
  let active;
  try {
    active = activeEstimationOutcomes(matching);
  } catch {
    fail('duplicate');
  }
  if (active.length > 1 || (matching.length > 0 && active.length === 0)) fail('duplicate');
  if (supersedeExisting) {
    let globallyActive;
    try {
      globallyActive = activeEstimationOutcomes(issueOutcomes);
    } catch {
      fail('duplicate');
    }
    if (
      globallyActive.length !== 1 ||
      active.length !== 1 ||
      globallyActive[0].envelope.recordId !== active[0].envelope.recordId
    ) {
      fail('correction-predecessor');
    }
  }
  if (active.length === 1) {
    if (canonicalRecordJson(active[0].envelope.payload) !== canonicalRecordJson(outcomePayload)) {
      if (!supersedeExisting) fail('payload-mismatch');
      if (
        typeof deps.createOutcomeEnvelope !== 'function' ||
        typeof deps.writeOutcome !== 'function'
      ) {
        fail('dependencies');
      }
      const envelope = deps.createOutcomeEnvelope({
        issue,
        payload: outcomePayload,
        supersedes: active[0].envelope.recordId,
      });
      const written = await deps.writeOutcome({ issue, envelope });
      if (
        written?.envelope?.recordType !== 'estimation-outcome' ||
        written.envelope.payload?.issue !== issue ||
        written.envelope.payload?.forecastRecordId !== forecastRecordId ||
        written.envelope.payload?.kind !== kind ||
        written.envelope.supersedes !== active[0].envelope.recordId
      ) {
        fail('write-readback');
      }
      const refreshed = await deps.listOutcomeRecords({ issue, forecastRecordId });
      if (!Array.isArray(refreshed)) fail('write-readback');
      let refreshedActive;
      try {
        refreshedActive = activeEstimationOutcomes(
          refreshed.filter(
            (record) =>
              record?.envelope?.recordType === 'estimation-outcome' &&
              record.envelope.payload?.issue === issue
          )
        );
      } catch {
        fail('write-readback');
      }
      if (
        refreshedActive.length !== 1 ||
        refreshedActive[0].envelope.recordId !== written.envelope.recordId ||
        canonicalRecordJson(refreshedActive[0].envelope.payload) !==
          canonicalRecordJson(outcomePayload)
      ) {
        fail('write-readback');
      }
      return {
        status: 'written',
        recordId: written.envelope.recordId,
        commentNodeId: written.commentNodeId,
      };
    }
    return {
      status: 'existing',
      recordId: active[0].envelope.recordId,
      commentNodeId: active[0].commentNodeId,
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

export async function ensureEstimationOutcome({
  issue,
  forecast,
  outcomePayload,
  supersedeExisting = false,
  deps = {},
} = {}) {
  if (!forecast && outcomePayload?.kind !== 'epic-orchestration') {
    return { status: 'legacy-no-forecast' };
  }
  const forecastRecordId = forecast?.recordId ?? null;
  const kind = forecast ? 'story' : 'epic-orchestration';
  return runLogicalRecordClaim(
    deps,
    { key: `outcome:${issue}:${kind}:${forecastRecordId ?? 'none'}`, issue },
    () =>
      ensureEstimationOutcomeUnlocked({
        issue,
        forecast,
        outcomePayload,
        supersedeExisting,
        deps,
      })
  );
}
