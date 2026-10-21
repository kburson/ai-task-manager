// @story #2039 #2045
import { createHash } from 'node:crypto';
import { canonicalRecordJson } from '../../task-tracker/lib/github-records/canonical-json.mjs';
import {
  createAitmRecordEnvelope,
  hashRecordPayload,
} from '../../task-tracker/lib/github-records/record-envelope.mjs';
import { createBootstrapRubric } from '../../task-tracker/lib/estimation/rubric-model.mjs';
export const time = '2026-10-21T00:00:00.000Z';
export const id = (n) => '01J00000000000000000000' + String(n).padStart(3, '0');
export const bytes = (v) => Buffer.from(canonicalRecordJson(v));
export const hash = (v) => createHash('sha256').update(v).digest('hex');
export function rubric({ version = 1, predecessor = null } = {}) {
  return {
    ...createBootstrapRubric({ generatedAt: time }),
    version,
    predecessorRecordId: predecessor,
  };
}
export function outcome(issue = 1002) {
  return {
    schema: 'aitm.estimation-outcome/v1',
    kind: 'story',
    issue,
    forecastRecordId: id(90),
    humanPlanHours: 3.5,
    aiForecast: { p50EngagedHours: 3, p80EngagedHours: 4 },
    actual: {
      engagedHours: 3,
      stages: { plan: 0.5, develop: 1.5, test: 0.5, review: 0.5 },
      reviewFixCycles: 0,
      commands: [],
    },
    landscape: {
      filesChanged: 2,
      modules: ['estimation'],
      lanes: ['unit'],
      dependencyBreadth: 1,
      childOutcomeRecordIds: [],
    },
    variance: { vsAiP50Hours: 0, vsAiP80Hours: -1 },
    costClassification: {
      necessaryHours: 3,
      avoidableProcessWasteHours: 0,
      unclassifiedHours: 0,
      drivers: [],
    },
  };
}
export function envelope({
  recordId = id(1),
  payload = rubric(),
  issue = 1001,
  predecessor = null,
  supersedes = null,
} = {}) {
  return createAitmRecordEnvelope({
    recordId,
    recordType:
      payload.schema === 'aitm.estimation-rubric/v1' ? 'estimation-rubric' : 'estimation-outcome',
    repository: 'owner/repo',
    issue,
    payload,
    predecessor,
    supersedes,
    createdAt: time,
    actor: 'fixture',
    grantId: id(99),
  });
}
export function derived({
  recordId = id(1),
  payload = rubric(),
  issue = 1001,
  predecessor = null,
  supersedes = null,
} = {}) {
  return {
    schema: 'aitm.local-derived-record/v1',
    recordId,
    recordType:
      payload.schema === 'aitm.estimation-rubric/v1' ? 'estimation-rubric' : 'estimation-outcome',
    repository: 'owner/repo',
    issue,
    createdAt: time,
    predecessor,
    supersedes,
    payload,
    payloadHash: hashRecordPayload(payload),
    modelPolicy: { modelVersion: 'fixture-model/v1', policyVersion: 'fixture-policy/v1' },
  };
}
export function bundle(
  records = [{ record: derived(), provenance: 'derived-local' }],
  overrides = {}
) {
  const planBytes = Buffer.from('### Selected plan\nRetain complete local evidence.\n');
  const payloads = new Map();
  const inputs = records.map(({ record, provenance = 'derived-local', ...extra }) => {
    const raw = bytes(record);
    const digest = hash(raw);
    const payloadPath = 'payloads/' + digest + '.json';
    payloads.set(payloadPath, raw);
    return {
      recordId: record.recordId,
      recordType: record.recordType,
      schema: record.schema,
      payloadDigest: digest,
      payloadPath,
      predecessorRecordId: record.predecessor,
      supersedesRecordId: record.supersedes,
      provenance,
      sourceCommentId: provenance === 'observed-cloud' ? 'IC_fixture_' + record.recordId : null,
      observedAt: provenance === 'observed-cloud' ? time : null,
      importedAt: provenance === 'imported-local' ? time : null,
      ...extra,
    };
  });
  const manifest = {
    schema: 'aitm.local-estimation-evidence/v1',
    canonicalizationVersion: 'aitm.canonical-json/v1',
    host: 'github.com',
    repository: 'owner/repo',
    issue: 2045,
    configuration: { estimationRubricIssue: 1001 },
    plan: {
      path: 'docs/selected-plan.md',
      section: '### Selected plan',
      commit: 'a'.repeat(40),
      digest: hash(planBytes),
    },
    refine: {
      size: 'S',
      humanHours: 3.5,
      source: { kind: 'imported-local', id: 'refine-fixture', digest: 'b'.repeat(64) },
    },
    modelPolicy: { modelVersion: 'fixture-model/v1', policyVersion: 'fixture-policy/v1' },
    inputs,
    ...overrides,
  };
  return { manifest, payloads, planBytes };
}

// Synthetic offline native telemetry fixture; never published as lifecycle evidence.
export async function incompleteOutcome(issue = 1002) {
  const { buildEstimationOutcome } =
    await import('../../task-tracker/lib/estimation/outcome-builder.mjs');
  const { timingActorKey, timingActorMarker } =
    await import('../../task-tracker/lib/timing-actor.mjs');
  const actor = timingActorKey({ provider: 'fixture', sid: 'local-evidence-test' });
  const snapshot =
    [
      '| 2026-10-01 00:00:00 +00:00 | develop:started | | | | 0 | phase |',
      '| 2026-10-01 00:00:01 +00:00 | start | | | | 0 | legacy |',
      '| 2026-10-01 00:01:00 +00:00 | pause | Unknown | Unknown | 12 | 112 | work | 1020 |' +
        timingActorMarker(actor) +
        ' <!-- aitm-engagement:v1 start=1790812800000 end=1790812860000 active=unknown wstart=100 wend=112 fstart=1000 fend=1020 -->',
    ].join('\n') + '\n';
  return buildEstimationOutcome({
    issue,
    forecast: {
      recordId: id(90),
      payload: { issue, plan: { humanHours: 3.5 }, ai: { p50EngagedHours: 3, p80EngagedHours: 4 } },
    },
    timing: { source: { repository: 'owner/repo', commentNodeId: 'IC_fixture_timing', snapshot } },
    verificationSha: 'a'.repeat(40),
    verificationProvenance: {
      mode: 'exact-test',
      issueKind: 'code',
      recordId: id(80),
      recordDigest: '1'.repeat(64),
      acceptedSha: 'a'.repeat(40),
    },
    verification: [
      {
        classification: 'test-unit',
        durationMs: 100,
        attempts: 1,
        executions: [
          {
            receiptId: id(80),
            stage: 'test',
            commitSha: 'a'.repeat(40),
            command: 'node',
            args: ['--test'],
            exitCode: 0,
            durationMs: 100,
            reusedFrom: null,
          },
        ],
      },
    ],
    diff: { filesChanged: 1, modules: ['fixture'], lanes: ['unit'], dependencyBreadth: 0 },
    review: { fixCycles: 0 },
  });
}

// Exact byte boundary fixtures; independent of production validation/read limits.
export function sizedBundle(kind, size) {
  const b = bundle();
  if (kind === 'plan') {
    b.planBytes = Buffer.alloc(size, 97);
    b.manifest.plan.digest = hash(b.planBytes);
  } else {
    b.manifest.plan.section = '';
    const overhead = bytes(b.manifest).length;
    b.manifest.plan.section = 'a'.repeat(size - overhead);
  }
  return b;
}
