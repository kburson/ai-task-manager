// @story #2069
// Native local-estimation bytes and source choices; all provider envelopes are offline fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { initial } from './plan-transition-candidate-fixture.mjs';
import { bundle, envelope, outcome, id } from './local-estimation-evidence-fixture.mjs';
import { formatIssueFieldDb } from '../../task-tracker/issue-field-db.mjs';
import { stampRefinementSnapshot } from '../../task-tracker/lib/refinement-snapshot.mjs';
import {
  calculateLocalEstimate,
  LOCAL_ESTIMATION_MODEL,
} from '../../task-tracker/lib/estimation/local-runtime.mjs';
import {
  createAitmRecordEnvelope,
  renderAitmRecord,
} from '../../task-tracker/lib/github-records/record-envelope.mjs';
import {
  planRuntimeMigration,
  applyRuntimeMigration,
} from '../../task-tracker/lib/runtime-migration.mjs';
import { openLocalEvidenceStore } from '../../task-tracker/lib/estimation/local-evidence-store.mjs';
import { importLocalEvidence } from '../../task-tracker/lib/estimation/local-evidence.mjs';
export async function activateNativeForecastFixture(root) {
  // This precedes acquisition of every test writer claim.
  for (const [name, value] of [
    ['state/task-tracker-state.json', '{}'],
    ['state/task-tracker-queue.json', '[]'],
    ['fleet/task-fleet.json', '{}'],
    ['fleet/occupancy.json', '{}'],
  ]) {
    const file = path.join(root, '.tmp/aitm', name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, value);
  }
  const rows = {
    'state/task-tracker-state.json': ['state', 'local', false],
    'state/task-tracker-queue.json': ['queue', 'local', true],
    'fleet/task-fleet.json': ['fleet', 'shared', false],
    'fleet/occupancy.json': ['occupancy', 'shared', false],
  };
  const adapters = {
    classifyLegacy: ({ relative }) => {
      const row = rows[relative];
      if (!row) return null;
      return {
        destination: relative,
        family: row[0],
        scope: row[1],
        validate: (raw) => {
          const value = JSON.parse(raw);
          return row[2]
            ? Array.isArray(value)
            : value && typeof value === 'object' && !Array.isArray(value);
        },
      };
    },
    trustLegacy: () => 'explicit-operator-trust',
    writerCensus: () => ({ complete: true, writers: [], claims: [] }),
    identity: () => ({
      provider: 'fixture',
      sid: 'fixture-migrator',
      pid: process.pid,
      processToken: 'fixture-process',
    }),
    publishTiming: async () => ({ status: 'confirmed' }),
  };
  const plan = await planRuntimeMigration({ projectRoot: root, mainRoot: root, adapters });
  assert.deepEqual(plan.blockers, []);
  assert.equal(
    (await applyRuntimeMigration({ plan, approvedPlanDigest: plan.digest, adapters })).status,
    'complete'
  );
}
export async function configureNativeForecastFixture({
  root,
  base,
  cfg,
  identity,
  historicalPolicy = false,
}) {
  const native = await import('../../task-tracker/lib/estimation/native-plan-selection.mjs').catch(
    (error) => {
      if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
      return {};
    }
  );
  assert.equal(typeof native.readNativePlanForecastSelection, 'function');
  const planBytes = Buffer.from(
    '# Native forecast plan\n\n### Task 1: Bounded delivery\n\nRun: `node verify.mjs`\n\n' +
      initial
        .slice(initial.indexOf('### Story Intent'), initial.indexOf('<!-- aitm-entered'))
        .replace('### Story Intent', '#### Story Intent')
  );
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs/selected-plan.md'), planBytes);
  let body = base.replace(
    '## Plan Metadata\n',
    '## Plan Metadata\n- **Source-plan**: docs/selected-plan.md\n- **Source-plan-commit**: ' +
      'a'.repeat(40) +
      '\n- **Source-plan-section**: ### Task 1: Bounded delivery\n'
  );
  body += formatIssueFieldDb({ priority: 'P1', size: 'M', estimate: 3, rank: 1 });
  body +=
    '\n<!-- aitm-refinement-rationale: {"rationale":"Bounded offline native forecast refinement"} -->\n';
  body = stampRefinementSnapshot(body, { labels: ['feature'], ts: '2026-10-19T00:00:00Z' });
  const selection = await native.readNativePlanForecastSelection({
    identity,
    body,
    projectDir: root,
    cfg,
    readPlanAtCommit: async ({ planCommit, planPath }) => {
      assert.equal(planCommit, 'a'.repeat(40));
      assert.equal(planPath, 'docs/selected-plan.md');
      return planBytes.toString();
    },
  });
  if (historicalPolicy) selection.modelPolicy.policyVersion = 'aitm.local-estimation/previous';
  const evidence = bundle([
    { record: envelope(), provenance: 'imported-local' },
    {
      record: envelope({ recordId: id(10), payload: outcome(1068), issue: 1068 }),
      provenance: 'imported-local',
    },
  ]);
  Object.assign(evidence.manifest, structuredClone(selection));
  evidence.planBytes = planBytes;
  const input = {
    schema: 'aitm.plan-estimation-input/v1',
    wbs: [
      {
        id: 'bounded',
        description: 'One bounded native transition',
        baseHumanHours: 2,
        signals: { modules: ['native-plan'], dependencies: [] },
        independentlyReviewable: true,
      },
    ],
    testImpact: { lanes: ['unit'], isolation: 'test-sandbox', expectedMinutes: 2 },
    risks: [],
    comparableIssueIds: [1068],
  };
  const calculated = calculateLocalEstimate({
    mode: { mode: 'local' },
    evidence,
    planInput: { selection, input },
    model: { ...LOCAL_ESTIMATION_MODEL, policyVersion: selection.modelPolicy.policyVersion },
  });
  assert.equal(calculated.status, 'estimated', calculated.reason);
  const forecast = {
    ...calculated.forecast,
    schema: 'aitm.estimation-forecast/v3',
    localEvidence: calculated.localEvidence,
  };
  body = body.replace(
    /<!-- aitm-fields:[^\n]*-->/,
    formatIssueFieldDb({
      priority: 'P1',
      size: forecast.plan.size,
      estimate: forecast.plan.humanHours,
      rank: 1,
    }).trim()
  );
  const forecastId = id(30);
  body += `\n<!-- aitm-estimation-forecast-ready record-id="${forecastId}" -->\n`;
  const record = createAitmRecordEnvelope({
    recordId: forecastId,
    recordType: 'estimation-forecast',
    repository: identity.repository,
    issue: identity.issueNumber,
    payload: forecast,
    predecessor: null,
    supersedes: null,
    createdAt: '2026-10-19T00:00:00.000Z',
    actor: 'fixture',
    grantId: id(99),
  });
  const evidenceStore = openLocalEvidenceStore({
    projectRoot: root,
    host: identity.host,
    repository: identity.repository,
  });
  await importLocalEvidence({ evidenceStore, bundle: evidence });
  const comment = { id: 'IC_forecast', body: renderAitmRecord({ envelope: record }) };
  return {
    body,
    forecast,
    record,
    comment,
    evidenceStore,
    planBytes,
    plan: {
      path: 'docs/selected-plan.md',
      commit: 'a'.repeat(40),
      section: '### Task 1: Bounded delivery',
      digest: createHash('sha256')
        .update(planBytes.toString().slice(planBytes.toString().indexOf('### Task 1:')))
        .digest('hex'),
      availability: 'available',
      content: planBytes.toString().slice(planBytes.toString().indexOf('### Task 1:')),
      references: null,
    },
  };
}
