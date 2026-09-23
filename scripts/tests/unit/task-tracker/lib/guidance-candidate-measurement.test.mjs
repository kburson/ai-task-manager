// @story #1659
// @story #1767
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const fixtureRoot = path.join(projectRoot, 'scripts/tests/fixtures/1558');
const actions = ['bind', 'resume', 'promote', 'test', 'review', 'deliver', 'close'];

function json(file) {
  return JSON.parse(readFileSync(path.join(fixtureRoot, file), 'utf8'));
}

function actionFixtures() {
  return Object.fromEntries(
    actions.map((action) => [action, json(`action-decision-fixtures/${action}.json`)])
  );
}

function clone(value) {
  return structuredClone(value);
}

async function measurement() {
  return import('../../../helpers/guidance-characterization.mjs');
}

test('static files round separately while aggregate traffic rounds exactly once', async () => {
  const { measureStaticFiles, measureTrafficParts } = await measurement();
  const staticMeasurement = measureStaticFiles([
    { id: 'one', text: 'a' },
    { id: 'two', text: 'é' },
  ]);
  const trafficMeasurement = measureTrafficParts([
    { category: 'command', text: 'a' },
    { category: 'stdout', text: 'é' },
  ]);

  assert.deepEqual(staticMeasurement, {
    files: [
      { id: 'one', characters: 1, bytes: 1, proxyTokens: 1 },
      { id: 'two', characters: 1, bytes: 2, proxyTokens: 1 },
    ],
    totals: { characters: 2, bytes: 3, proxyTokens: 2 },
  });
  assert.deepEqual(trafficMeasurement, {
    parts: [
      { category: 'command', characters: 1, bytes: 1 },
      { category: 'stdout', characters: 1, bytes: 2 },
    ],
    totals: { characters: 2, bytes: 3, proxyTokens: 1 },
  });
});

test('candidate workflow retains every lane and required query boundary without executing refusals', async () => {
  const { buildCandidateWorkflow, candidateConstants } = await measurement();
  const transcript = buildCandidateWorkflow({
    adapter: 'codex',
    fixtures: actionFixtures(),
    legacyTranscript: json('legacy-workflow/transcripts/codex.json'),
  });

  assert.equal(transcript.schema, 'aitm.guidance-candidate-transcript/v1');
  assert.equal(transcript.captureKind, 'candidate-model-not-actual-cli');
  assert.equal(transcript.adapter, 'codex');
  assert.deepEqual(
    transcript.entries.map(({ boundary }) => boundary),
    [
      'first-expanded',
      'refusal-remediation',
      'repeat-matching-receipt',
      'routine',
      'refusal-remediation',
      'routine',
      'changed-stale-receipt',
      'post-compaction',
      'routine',
      'explicit-diagnostic',
      'routine',
      'refusal-remediation',
      'external-approval-after',
      'external-approval-before',
      'routine',
      'refusal-remediation',
    ]
  );

  const lanes = new Set(
    transcript.entries
      .filter(({ comparableLane }) => comparableLane)
      .map(({ action, outcome }) => `${action}:${outcome}`)
  );
  assert.deepEqual(
    [...lanes].sort(),
    actions.flatMap((action) => [`${action}:refusal`, `${action}:success`]).sort()
  );
  assert.deepEqual(
    transcript.entries.map(({ sequence }) => sequence),
    transcript.entries.map((_, index) => index + 1)
  );

  for (const entry of transcript.entries) {
    assert.equal(typeof entry.commandInput, 'string');
    assert.equal(typeof entry.receiptInput, 'string');
    assert.equal(typeof entry.stdout, 'string');
    assert.equal(typeof entry.stderr, 'string');
    assert.equal(typeof entry.receiptOutput, 'string');
    assert.equal(typeof entry.diagnosticOutput, 'string');
    assert.notEqual(entry.commandInput, '');
    assert.notEqual(entry.stdout, '');
    if (entry.outcome === 'refusal') assert.equal(entry.execution, null);
  }

  const repeat = transcript.entries.find(({ boundary }) => boundary === 'repeat-matching-receipt');
  assert.match(repeat.receiptInput, new RegExp(candidateConstants.GUIDANCE_DIGEST));
  assert.match(repeat.stdout, /"status":"not-modified"/);
  assert.equal(repeat.receiptOutput, '');

  const changed = transcript.entries.find(({ boundary }) => boundary === 'changed-stale-receipt');
  assert.match(changed.receiptInput, /sha256:0{64}/);
  assert.match(changed.stdout, new RegExp(candidateConstants.GUIDANCE_DIGEST));
  assert.match(changed.stdout, /"status":"expanded"/);
  assert.match(changed.receiptOutput, new RegExp(candidateConstants.GUIDANCE_DIGEST));

  const compacted = transcript.entries.find(({ boundary }) => boundary === 'post-compaction');
  assert.equal(compacted.receiptInput, '');
  assert.match(compacted.stdout, /"status":"expanded"/);

  const diagnostic = transcript.entries.find(({ boundary }) => boundary === 'explicit-diagnostic');
  assert.notEqual(diagnostic.diagnosticOutput, '');
  assert.match(diagnostic.diagnosticOutput, /"fullDecision"/);
  assert.match(diagnostic.diagnosticOutput, /"diagnosticMessages"/);

  const approval = transcript.entries.find(
    ({ boundary }) => boundary === 'external-approval-before'
  );
  assert.match(approval.stdout, new RegExp(candidateConstants.FULL_HEAD));
  assert.equal(approval.execution, null);
});

test('paired artifacts reconcile exact identities, context categories, sensitivity and cardinality', async () => {
  const { buildCandidateMeasurementArtifacts } = await measurement();
  const artifacts = buildCandidateMeasurementArtifacts({ projectRoot });

  assert.deepEqual(Object.keys(artifacts).sort(), [
    'actionCardinality',
    'contextComparison',
    'serializationSensitivity',
    'transcripts',
  ]);
  assert.deepEqual(Object.keys(artifacts.transcripts).sort(), ['claude', 'codex']);
  assert.equal(artifacts.actionCardinality.schema, 'aitm.guidance-action-cardinality/v1');
  assert.equal(
    artifacts.serializationSensitivity.schema,
    'aitm.guidance-serialization-sensitivity/v1'
  );
  assert.equal(artifacts.contextComparison.schema, 'aitm.guidance-context-comparison/v1');
  assert.equal(Object.hasOwn(artifacts.contextComparison, 'authoritativeVerdict'), false);

  const identities = artifacts.contextComparison.identities;
  assert.match(identities.legacy.sourceCommit, /^[0-9a-f]{40}$/);
  assert.match(identities.legacy.scenarioSha256, /^sha256:[0-9a-f]{64}$/);
  assert.match(identities.legacy.authorityFixtureSha256, /^sha256:[0-9a-f]{64}$/);
  assert.match(identities.candidate.oracle.sourceCommit, /^[0-9a-f]{40}$/);
  assert.match(identities.candidate.oracle.sha256, /^sha256:[0-9a-f]{64}$/);
  assert.match(identities.candidate.plan.sourceCommit, /^[0-9a-f]{40}$/);
  assert.match(identities.candidate.plan.sha256, /^sha256:[0-9a-f]{64}$/);
  assert.match(identities.candidate.fixtureSetSha256, /^sha256:[0-9a-f]{64}$/);
  assert.equal(identities.candidate.serializer, 'guidance-characterization/candidate-workflow-v1');

  assert.match(artifacts.contextComparison.assumptions.staticObligations, /provisional/i);
  assert.match(artifacts.contextComparison.assumptions.replacementOwner, /WBS 24/i);
  assert.equal(
    artifacts.contextComparison.assumptions.captureKind,
    'candidate-model-not-actual-cli'
  );

  for (const adapter of ['claude', 'codex']) {
    const comparison = artifacts.contextComparison.adapters[adapter];
    assert.equal(comparison.candidate.static.files.length, 4);
    assert.match(comparison.candidate.transcriptSha256, /^sha256:[0-9a-f]{64}$/);
    assert.deepEqual(
      comparison.candidate.traffic.categories.map(({ category }) => category),
      [
        'command-input',
        'receipt-input',
        'operational-stdout',
        'operational-stderr',
        'receipt-output',
        'explicit-diagnostics',
      ]
    );
    assert.equal(
      comparison.candidate.static.totals.proxyTokens,
      comparison.candidate.static.files.reduce((sum, file) => sum + file.proxyTokens, 0)
    );
    assert.equal(
      comparison.candidate.traffic.totals.proxyTokens,
      Math.ceil(comparison.candidate.traffic.totals.characters / 4)
    );
    assert.equal(
      comparison.candidate.total.proxyTokens,
      comparison.candidate.static.totals.proxyTokens +
        comparison.candidate.traffic.totals.proxyTokens
    );
    assert.equal(
      comparison.delta.proxyTokens,
      comparison.candidate.total.proxyTokens - comparison.legacy.total.proxyTokens
    );
    assert.equal(
      comparison.candidate.total.proxyTokens < comparison.legacy.total.proxyTokens,
      true
    );
    assert.deepEqual(comparison.remainingMargins, {
      routerPlusPickup: {
        absolute: 5000 - comparison.candidate.static.totals.proxyTokens,
        working: 4000 - comparison.candidate.static.totals.proxyTokens,
      },
      clean: {
        absolute: 300 - comparison.candidate.responses.clean.proxyTokens,
        working: 240 - comparison.candidate.responses.clean.proxyTokens,
      },
      blocked: {
        absolute: 500 - comparison.candidate.responses.blocked.proxyTokens,
        working: 400 - comparison.candidate.responses.blocked.proxyTokens,
      },
      fullLifecycle: {
        absolute: 7000 - comparison.candidate.total.proxyTokens,
        working: 5600 - comparison.candidate.total.proxyTokens,
      },
    });
  }

  assert.equal(artifacts.serializationSensitivity.evidenceOnlyGrowth.routine.charactersDelta, 0);
  assert.equal(
    artifacts.serializationSensitivity.operationalGrowth.blocked.charactersDelta > 0,
    true
  );
  assert.deepEqual(artifacts.serializationSensitivity.heavyCase.inputs, {
    action: 'close',
    attempts: 2,
    blockersPerAttempt: 7,
    observationsPerAttempt: 8,
  });
  assert.equal(artifacts.serializationSensitivity.heavyCase.measurement.characters > 0, true);

  assert.deepEqual(
    artifacts.actionCardinality.actions.map(({ action }) => action),
    actions
  );
  assert.deepEqual(artifacts.actionCardinality.finiteHeavyInputs, {
    action: 'close',
    attempts: 2,
    blockersPerAttempt: 7,
    observationsPerAttempt: 8,
  });
  assert.deepEqual(artifacts.actionCardinality.unboundedDimensions, [
    'body-length',
    'child-count',
    'dependency-count',
    'pagination',
    'retry-history',
  ]);
});

test('artifact validation rejects incomplete, shortened, relabeled or latency-guessed evidence', async () => {
  const { buildCandidateMeasurementArtifacts, validateCandidateMeasurementArtifacts } =
    await measurement();
  const artifacts = buildCandidateMeasurementArtifacts({ projectRoot });
  assert.equal(validateCandidateMeasurementArtifacts(artifacts, { projectRoot }), artifacts);

  const mutations = [
    (value) => value.transcripts.codex.entries.pop(),
    (value) => value.contextComparison.adapters.claude.candidate.traffic.categories.pop(),
    (value) =>
      (value.contextComparison.identities.candidate.fixtureSetSha256 = 'sha256:123456789abc'),
    (value) => (value.contextComparison.assumptions.captureKind = 'actual-cli-capture'),
    (value) => (value.serializationSensitivity.fixtureLatencyMs = 5),
    (value) => value.contextComparison.adapters.codex.candidate.traffic.totals.characters--,
  ];
  for (const mutate of mutations) {
    const candidate = clone(artifacts);
    mutate(candidate);
    assert.throws(
      () => validateCandidateMeasurementArtifacts(candidate, { projectRoot }),
      /guidance-candidate:measurement-artifact-drift/
    );
  }
});

test('committed candidate transcripts and reports exactly match regeneration', async () => {
  const { buildCandidateMeasurementArtifacts } = await measurement();
  const { withFrozenCandidateRuntime } =
    await import('../../../../maintenance/measure-guidance-candidate.mjs');
  const artifacts = withFrozenCandidateRuntime(() =>
    buildCandidateMeasurementArtifacts({ projectRoot })
  );
  const expected = new Map([
    ['action-cardinality.json', artifacts.actionCardinality],
    ['serialization-sensitivity.json', artifacts.serializationSensitivity],
    ['context-comparison.json', artifacts.contextComparison],
    ['candidate-workflow/claude.json', artifacts.transcripts.claude],
    ['candidate-workflow/codex.json', artifacts.transcripts.codex],
  ]);

  for (const [relativePath, value] of expected) {
    const artifactPath = path.join(fixtureRoot, relativePath);
    assert.equal(existsSync(artifactPath), true, `missing generated artifact: ${relativePath}`);
    assert.deepEqual(JSON.parse(readFileSync(artifactPath, 'utf8')), value);
  }
});

test('current recertification binds every obligation and the complete public CLI lifecycle', async () => {
  const { buildCurrentRecertificationDecision } =
    await import('../../../../maintenance/measure-guidance-candidate.mjs');
  const decision = buildCurrentRecertificationDecision({ projectRoot });
  assert.equal(decision.schema, 'aitm.guidance-feasibility-recertification/v1');
  assert.equal(decision.owner.issue, 1767);
  assert.equal(decision.owner.foundationIssue, 1660);
  assert.equal(decision.verdict, 'GO');
  assert.equal(decision.obligations.total, 41);
  assert.equal(decision.obligations.retainedProtocol, 24);
  assert.equal(decision.obligations.enforcement, 17);
  assert.equal(decision.obligations.uncovered.length, 0);
  assert.equal(decision.capture.events, 17);
  assert.equal(
    decision.capture.actionResults.every(({ status }) => status === 'ready'),
    true
  );
  for (const adapter of ['claude', 'codex']) {
    assert.equal(decision.adapters[adapter].status, 'pass');
    assert.ok(decision.adapters[adapter].measurements.fullLifecycle <= 5600);
  }
});

test('recertification refuses a relabeled or altered lifecycle capture', async () => {
  const { buildCurrentRecertificationDecision } =
    await import('../../../../maintenance/measure-guidance-candidate.mjs');
  const committed = JSON.parse(
    readFileSync(path.join(fixtureRoot, 'actual-explain-traffic-recertification.json'), 'utf8')
  );
  const modeDrift = structuredClone(committed);
  modeDrift.identity.mode = 'historical';
  assert.throws(
    () => buildCurrentRecertificationDecision({ projectRoot, capture: modeDrift }),
    /guidance-feasibility:capture-mode/
  );
  const transcriptDrift = structuredClone(committed);
  transcriptDrift.events.find(({ name }) => name === 'lifecycle-close').typed.status = 'blocked';
  assert.throws(
    () => buildCurrentRecertificationDecision({ projectRoot, capture: transcriptDrift }),
    /guidance-feasibility:capture-transcript-digest/
  );
  const sourceDrift = structuredClone(committed);
  sourceDrift.identity.implementationFiles[0].sha256 = `sha256:${'0'.repeat(64)}`;
  assert.throws(
    () => buildCurrentRecertificationDecision({ projectRoot, capture: sourceDrift }),
    /guidance-feasibility:capture-committed-source/
  );
  const selfConsistentDrift = structuredClone(committed);
  const first = selfConsistentDrift.events.find(({ name }) => name === 'ready-first-load');
  first.stdout = first.stdout.replace('"query":"bind"', '"query":"noop"');
  selfConsistentDrift.identity.transcriptSha256 = `sha256:${createHash('sha256')
    .update(JSON.stringify(selfConsistentDrift.events))
    .digest('hex')}`;
  assert.throws(
    () => buildCurrentRecertificationDecision({ projectRoot, capture: selfConsistentDrift }),
    /capture-replay/
  );
});

test('current release gate refuses budget relaxation', async () => {
  const { assertFixedGuidanceBudgets } =
    await import('../../../../maintenance/measure-guidance-candidate.mjs');
  const fixed = {
    routerPlusPickup: { absolute: 5000, working: 4000 },
    clean: { absolute: 300, working: 240 },
    blocked: { absolute: 500, working: 400 },
    fullLifecycle: { absolute: 7000, working: 5600 },
  };
  assert.deepEqual(assertFixedGuidanceBudgets(fixed), fixed);
  const relaxed = structuredClone(fixed);
  relaxed.fullLifecycle.working = 6500;
  assert.throws(() => assertFixedGuidanceBudgets(relaxed), /fixed-budgets/);
});

test('retained obligation coverage binds each reviewed sentence to its required file', async () => {
  const { validateObligationCoverage } =
    await import('../../../../maintenance/measure-guidance-candidate.mjs');
  const map = JSON.parse(readFileSync(path.join(fixtureRoot, 'rule-guidance-map.json')));
  const coverage = JSON.parse(
    readFileSync(path.join(fixtureRoot, 'obligation-complete-static/coverage.json'))
  );
  assert.equal(validateObligationCoverage({ projectRoot, map, coverage }).uncovered.length, 0);
  const weakened = structuredClone(coverage);
  weakened.entries.find(({ id }) => id === 'close.human-instruction').evidence.router =
    'Close whenever convenient.';
  assert.throws(
    () => validateObligationCoverage({ projectRoot, map, coverage: weakened }),
    /obligation-content/
  );
  const relocated = structuredClone(coverage);
  relocated.entries.find(({ id }) => id === 'review.prompt').requiredFiles = ['router'];
  assert.throws(
    () => validateObligationCoverage({ projectRoot, map, coverage: relocated }),
    /obligation-file/
  );
});
