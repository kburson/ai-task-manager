import { createBootstrapRubric, updateEstimationRubric } from './rubric-model.mjs';
import { validateEstimationRubric } from './rubric-record.mjs';

function fail(category) {
  throw new Error(`rubric-refresh:${category}`);
}
function cohortIds(rubric) {
  return rubric.cohort.map((item) => item.outcomeRecordId).sort();
}
function sameCohort(rubric, outcomes) {
  const current = cohortIds(rubric);
  const incoming = outcomes.map((outcome) => outcome.recordId).sort();
  return current.length === incoming.length && current.every((id, index) => id === incoming[index]);
}

function selectLatest(records) {
  if (!Array.isArray(records)) fail('records');
  if (records.length === 0) return null;
  const valid = records
    .map((record) => {
      if (record?.envelope?.recordType !== 'estimation-rubric') fail('record-type');
      validateEstimationRubric(record.envelope.payload);
      return record;
    })
    .sort(
      (left, right) =>
        right.envelope.payload.version - left.envelope.payload.version ||
        right.envelope.payload.generatedAt.localeCompare(left.envelope.payload.generatedAt)
    );
  if (valid.length > 1) {
    const [first, second] = valid;
    if (
      first.envelope.payload.version === second.envelope.payload.version &&
      first.envelope.payload.generatedAt === second.envelope.payload.generatedAt
    )
      fail('conflicting-latest');
  }
  return valid[0];
}

export async function loadOrRefreshRubric({
  cfg,
  rubricIssueNumber = cfg?.estimationRubricIssue,
  through = new Date().toISOString(),
  deps = {},
} = {}) {
  if (!cfg?.repo || !Number.isInteger(rubricIssueNumber) || rubricIssueNumber < 0) fail('input');
  if (rubricIssueNumber === 0)
    return {
      status: 'unconfigured',
      rubric: createBootstrapRubric({ generatedAt: through }),
      commentNodeId: null,
    };
  if (
    typeof deps.listRubricRecords !== 'function' ||
    typeof deps.listEligibleOutcomes !== 'function'
  )
    fail('dependencies');
  const latest = selectLatest(
    await deps.listRubricRecords({ repository: cfg.repo, issue: rubricIssueNumber, through })
  );
  const previous = latest?.envelope.payload ?? createBootstrapRubric({ generatedAt: through });
  const outcomes = await deps.listEligibleOutcomes({ through, cohort: previous.cohort });
  if (!Array.isArray(outcomes)) fail('outcomes');
  if (latest && sameCohort(previous, outcomes))
    return { status: 'current', rubric: previous, commentNodeId: latest.commentNodeId };
  if (typeof deps.writeRubric !== 'function') fail('dependencies');

  const payload =
    outcomes.length === 0
      ? previous
      : updateEstimationRubric({ previous, outcomes, generatedAt: through });
  payload.predecessorRecordId = latest?.envelope.recordId ?? null;
  validateEstimationRubric(payload);
  const written = await deps.writeRubric({
    repository: cfg.repo,
    issue: rubricIssueNumber,
    payload,
    predecessorRecordId: latest?.envelope.recordId ?? null,
  });
  if (written?.envelope?.recordType !== 'estimation-rubric') fail('write-readback');
  validateEstimationRubric(written.envelope.payload);
  if (!sameCohort(written.envelope.payload, outcomes)) fail('write-readback');
  return {
    status: latest ? 'refreshed' : 'bootstrapped',
    rubric: written.envelope.payload,
    commentNodeId: written.commentNodeId,
  };
}
