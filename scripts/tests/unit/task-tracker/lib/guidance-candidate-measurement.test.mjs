// @story #1659
import assert from 'node:assert/strict';
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

test('obligation-complete recheck binds exact proposed files and actual CLI capture', async () => {
  const {
    buildObligationCompleteRecheck,
    validateObligationCompleteRecheck,
    buildObligationCompleteComparison,
    validateObligationCompleteComparison,
  } = await import('../../../../maintenance/measure-guidance-candidate.mjs');
  const report = buildObligationCompleteRecheck({ projectRoot });
  assert.equal(report.schema, 'aitm.guidance-obligation-complete-recheck/v1');
  assert.equal(report.captureKind, 'actual-public-cli-subprocess');
  assert.equal(report.staticObligations, 'incomplete-proposed-not-installed');
  assert.equal(report.trafficScope, 'all-captured-scenarios-not-a-coherent-lifecycle');
  assert.equal(report.verdict, 'NO-GO');
  assert.equal(report.adapters.claude.files.length, 10);
  assert.equal(report.adapters.codex.files.length, 10);
  assert.ok(report.inputs.some(({ role }) => role === 'rule-guidance-map'));
  assert.ok(report.inputs.some(({ role }) => role === 'actual-cli-capture'));
  assert.equal(validateObligationCompleteRecheck(report, { projectRoot }), report);
  assert.deepEqual(json('feasibility-recheck-1676.json'), report);
  const comparison = buildObligationCompleteComparison({ projectRoot });
  assert.deepEqual(json('context-comparison-1676.json'), comparison);
  assert.equal(validateObligationCompleteComparison(comparison, { projectRoot }), comparison);
  const changed = clone(report);
  changed.adapters.codex.files[2].sha256 = 'sha256:' + '0'.repeat(64);
  assert.throws(
    () => validateObligationCompleteRecheck(changed, { projectRoot }),
    /decision-drift/
  );
});

test('a feasibility recheck counts every captured query and every rule its proposal loads', async () => {
  const { buildObligationCompleteRecheck } =
    await import('../../../../maintenance/measure-guidance-candidate.mjs');
  const report = buildObligationCompleteRecheck({ projectRoot });
  assert.equal(report.actualLifecycleTraffic.proxyTokens, 4725);
  for (const adapter of ['claude', 'codex']) {
    const paths = report.adapters[adapter].files.map(({ path: file }) => file);
    for (const rule of ['bind', 'state-walk', 'review', 'deliver', 'close', 'commit-trail']) {
      assert.ok(paths.includes(`skill/shared/rules/${rule}.md`), `${adapter}:${rule}`);
    }
    assert.ok(report.adapters[adapter].proposedFullProxyTokens > 5600);
  }
  assert.equal(report.verdict, 'NO-GO');
});

test('recheck rejects missing map, static bytes, actual capture, and provisional substitution', async () => {
  const { buildObligationCompleteRecheck, validateObligationCompleteRecheck } =
    await import('../../../../maintenance/measure-guidance-candidate.mjs');
  const readRelative = (name) => readFileSync(path.join(projectRoot, name));
  for (const missing of [
    'scripts/tests/fixtures/1558/rule-guidance-map.json',
    'scripts/tests/fixtures/1558/obligation-complete-static/router.md',
    'scripts/tests/fixtures/1558/actual-explain-traffic.json',
  ]) {
    assert.throws(
      () =>
        buildObligationCompleteRecheck({
          projectRoot,
          readRelative: (name) => {
            if (name === missing) throw new Error('missing');
            return readRelative(name);
          },
        }),
      /required-input-missing/
    );
  }
  const original = buildObligationCompleteRecheck({ projectRoot });
  assert.throws(
    () =>
      buildObligationCompleteRecheck({
        projectRoot,
        readRelative: (name) => {
          const bytes = readRelative(name);
          if (!name.endsWith('/rule-guidance-map.json')) return bytes;
          const map = JSON.parse(bytes.toString('utf8'));
          map.rows.pop();
          return Buffer.from(JSON.stringify(map));
        },
      }),
    /rule-map-incomplete/
  );
  assert.throws(
    () =>
      validateObligationCompleteRecheck(original, {
        projectRoot,
        readRelative: (name) => {
          const bytes = readRelative(name);
          return name.endsWith('/router.md')
            ? Buffer.concat([bytes, Buffer.from('changed')])
            : bytes;
        },
      }),
    /decision-drift/
  );
  assert.throws(
    () =>
      buildObligationCompleteRecheck({
        projectRoot,
        readRelative: (name) => {
          const bytes = readRelative(name);
          if (!name.endsWith('/actual-explain-traffic.json')) return bytes;
          const capture = JSON.parse(bytes.toString('utf8'));
          capture.captureKind = 'candidate-model-not-actual-cli';
          return Buffer.from(JSON.stringify(capture));
        },
      }),
    /actual-cli-capture/
  );
});

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
  const artifacts = buildCandidateMeasurementArtifacts({ projectRoot });
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
