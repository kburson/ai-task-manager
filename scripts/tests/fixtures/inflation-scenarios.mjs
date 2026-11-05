// @story #2163 — fictional data uses production record codecs, never authority substitutes.
import {
  createAitmRecordEnvelope,
  renderAitmRecord,
} from '../../task-tracker/lib/github-records/record-envelope.mjs';
import {
  parseIssueFieldDb,
  stripIssueFieldDb,
  formatIssueFieldDb,
} from '../../task-tracker/issue-field-db.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const inflationScenarioActions = [
  'append-other-comment-byte',
  'remove-other-proposal',
  'insert-other-proposal',
  'append-scope-line',
  'change-plan-pin',
  'change-plan-bytes',
  'board-estimate-drift',
  'alter-audit',
  'truncate-audit',
  'duplicate-audit',
  ...Array.from({ length: 8 }, (_, n) => `apply-field-combination-${n}`),
];
export function applyInflationScenario(state, action, { worker, planPath }) {
  const before = structuredClone(state),
    other = state.comments.find((c) => c.id === 202),
    target = state.comments.find((c) => c.id === 101);
  let fileDelta = null;
  if (action === 'append-other-comment-byte' && other) other.body += ' ';
  else if (action === 'remove-other-proposal' && other)
    state.comments = state.comments.filter((c) => c !== other);
  else if (action === 'insert-other-proposal' && other)
    state.comments.push({ ...structuredClone(other), id: 303, node_id: 'IC_fixture_inserted' });
  else if (action === 'append-scope-line')
    state.body = state.body.replace(
      'Publish one audited estimate revision.',
      'Publish one audited estimate revision. Scope changed.'
    );
  else if (action === 'change-plan-pin')
    state.body = state.body.replace(/(\*\*Plan-commit\*\*: )[a-f0-9]{40}/, '$1' + '0'.repeat(40));
  else if (action === 'change-plan-bytes') {
    const file = path.join(worker, planPath),
      prior = readFileSync(file, 'utf8'),
      after = prior + '\nChanged selected plan bytes.\n';
    writeFileSync(file, after);
    fileDelta = { path: planPath, before: prior, after };
  } else if (action === 'board-estimate-drift') state.board.estimate = 99;
  else if (action === 'alter-audit' && target)
    target.body = target.body.replace('Discovered integration work.', 'Altered integration work.');
  else if (action === 'truncate-audit' && target) target.body = target.body.slice(0, -2);
  else if (action === 'duplicate-audit' && target)
    target.body += target.body.match(/Publication operation: [^\n]+/)?.[0] + '\n';
  else if (action.startsWith('apply-field-combination-')) {
    const n = Number(action.slice(-1));
    if (n & 1) state.board.size = 'M';
    if (n & 2) state.board.estimate = 6;
    if (n & 4)
      state.body = `${stripIssueFieldDb(state.body)}\n${formatIssueFieldDb({ ...parseIssueFieldDb(state.body).values, size: 'M', estimate: 6 })}\n`;
  } else throw new Error('inflation-fixture:scenario-target');
  return { before, after: structuredClone(state), fileDelta };
}

export function withActiveInflationForecast(state) {
  const next = structuredClone(state),
    recordId = '01J00000000000000000000601';
  const payload = {
    schema: 'aitm.estimation-forecast/v2',
    issue: next.number,
    lifecycleState: 'plan',
    refine: { size: 'M', humanHours: 4 },
    plan: { size: 'M', humanHours: 4, deltaHours: 0, rationale: 'Fictional reviewed plan.' },
    ai: {
      p50EngagedHours: 2,
      p80EngagedHours: 3,
      stages: { plan: 0.5, develop: 0.5, test: 0.5, review: 0.5 },
    },
    wbs: [
      {
        id: 'publication',
        description: 'Publish the fixture estimate',
        humanHours: 4,
        signals: ['integration'],
      },
    ],
    comparableIssues: [],
    rubric: { recordId: '01J00000000000000000000600', version: 1, cohortSize: 0, confidence: 0.1 },
    testPlan: { impactedLanes: ['unit'], isolation: 'test-sandbox', expectedMinutes: 5 },
    risks: [],
    recommendation: { action: 'proceed', reason: 'Bounded fictional work.' },
    supersedesForecastRecordId: null,
  };
  const envelope = createAitmRecordEnvelope({
    recordType: 'estimation-forecast',
    repository: next.repository,
    issue: next.number,
    payload,
    actor: 'operator',
    recordId,
    grantId: '01J00000000000000000000602',
    createdAt: '2026-11-05T00:00:00.000Z',
  });
  next.board.size = 'M';
  next.board.estimate = 4;
  next.body = `${stripIssueFieldDb(next.body)}\n${formatIssueFieldDb({ ...parseIssueFieldDb(next.body).values, size: 'M', estimate: 4 })}\n<!-- aitm-estimation-forecast-ready record-id="${recordId}" -->\n`;
  next.comments[0].body = next.comments[0].body
    .replace('| Size | S | S |', '| Size | M | M |')
    .replace('| 2 | 2 |', '| 4 | 4 |');
  next.comments.push({
    ...next.comments[0],
    id: 404,
    node_id: 'IC_fixture_forecast',
    body: renderAitmRecord({ envelope, visibleMarkdown: 'Fictional active forecast.' }),
  });
  return next;
}
