#!/usr/bin/env node
// @story #1767

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';

import { validateCandidateMeasurementArtifacts } from '../tests/helpers/guidance-characterization.mjs';
import {
  captureGuidanceLifecycle,
  measureLifecycleTraffic,
  validateLifecycleTranscript,
} from './capture-guidance-lifecycle.mjs';
import {
  assertFrozenGuidanceBaseline,
  assertOracleTraceability,
  assertSpecClauseIndex,
} from '../tests/helpers/guidance-clause-index.mjs';

const ACTIONS = ['bind', 'resume', 'promote', 'test', 'review', 'deliver', 'close'];
const ADAPTERS = ['claude', 'codex'];
const FIXTURE_ROOT = 'scripts/tests/fixtures/1558';
const USAGE = 'usage: measure-guidance-candidate --all [--assert-feasible] --json';

function fail(reason) {
  throw new Error(`guidance-feasibility:${reason}`);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stable(value[key])])
  );
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function digestJson(value) {
  return sha256(`${JSON.stringify(stable(value))}\n`);
}

function readBytes(projectRoot, relativePath) {
  return readFileSync(path.join(projectRoot, relativePath));
}

function readJson(projectRoot, relativePath) {
  return JSON.parse(readBytes(projectRoot, relativePath).toString('utf8'));
}

function fileRecord(projectRoot, role, relativePath, { id } = {}) {
  const bytes = readBytes(projectRoot, relativePath);
  return {
    role,
    ...(id ? { id } : {}),
    path: relativePath,
    sha256: sha256(bytes),
  };
}

function committedMeasurementArtifacts(projectRoot) {
  return {
    transcripts: Object.fromEntries(
      ADAPTERS.map((adapter) => [
        adapter,
        readJson(projectRoot, `${FIXTURE_ROOT}/candidate-workflow/${adapter}.json`),
      ])
    ),
    actionCardinality: readJson(projectRoot, `${FIXTURE_ROOT}/action-cardinality.json`),
    serializationSensitivity: readJson(
      projectRoot,
      `${FIXTURE_ROOT}/serialization-sensitivity.json`
    ),
    contextComparison: readJson(projectRoot, `${FIXTURE_ROOT}/context-comparison.json`),
  };
}

function acceptedInputRecords({ projectRoot, baseline, clauseIndex, contextComparison }) {
  const records = [
    fileRecord(projectRoot, 'legacy-baseline', `${FIXTURE_ROOT}/legacy-baseline.json`),
    ...baseline.inputs.map((input) => ({
      role: 'legacy-frozen-input',
      id: input.id,
      sourcePath: input.sourcePath,
      snapshotPath: input.snapshotPath,
      encoding: input.encoding,
      bytes: input.bytes,
      contentSha256: input.sha256,
    })),
    fileRecord(projectRoot, 'source-specification', clauseIndex.source.path),
    fileRecord(projectRoot, 'spec-clause-index', `${FIXTURE_ROOT}/spec-clause-index.json`),
    fileRecord(projectRoot, 'oracle-traceability', `${FIXTURE_ROOT}/oracle-traceability.json`),
    fileRecord(
      projectRoot,
      'candidate-oracle-source',
      contextComparison.identities.candidate.oracle.sourcePath
    ),
    ...ACTIONS.map((actionId) =>
      fileRecord(
        projectRoot,
        'candidate-action-fixture',
        `${FIXTURE_ROOT}/action-decision-fixtures/${actionId}.json`,
        { id: actionId }
      )
    ),
    ...ADAPTERS.map((adapter) =>
      fileRecord(
        projectRoot,
        'candidate-transcript',
        `${FIXTURE_ROOT}/candidate-workflow/${adapter}.json`,
        { id: adapter }
      )
    ),
    ...['action-cardinality.json', 'serialization-sensitivity.json', 'context-comparison.json'].map(
      (filename) =>
        fileRecord(projectRoot, 'measurement-report', `${FIXTURE_ROOT}/${filename}`, {
          id: filename.replace(/\.json$/, ''),
        })
    ),
    fileRecord(
      projectRoot,
      'candidate-proposed-static-source',
      contextComparison.identities.candidate.plan.sourcePath
    ),
  ];

  return records.sort((left, right) => {
    const leftKey = `${left.role}:${left.path}:${left.id ?? ''}`;
    const rightKey = `${right.role}:${right.path}:${right.id ?? ''}`;
    return leftKey.localeCompare(rightKey);
  });
}

function requireInteger(value, reason) {
  if (!Number.isSafeInteger(value) || value < 0) fail(reason);
}

function validateEvaluationInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('evaluation-input');
  if (typeof input.completenessPassed !== 'boolean') fail('evaluation-completeness');
  if (typeof input.fidelityPassed !== 'boolean') fail('evaluation-fidelity');
  for (const key of ['routerPlusPickup', 'clean', 'blocked', 'fullLifecycle']) {
    const budget = input.fixedBudgets?.[key];
    requireInteger(budget?.absolute, `budget-${key}`);
    requireInteger(budget?.working, `budget-${key}`);
    if (budget.working > budget.absolute) fail(`budget-${key}`);
  }
  for (const adapter of ADAPTERS) {
    const values = input.adapters?.[adapter];
    for (const key of [
      'staticProxyTokens',
      'cleanProxyTokens',
      'blockedProxyTokens',
      'lifecycleProxyTokens',
      'legacyTotalProxyTokens',
      'candidateTotalProxyTokens',
    ]) {
      requireInteger(values?.[key], `adapter-${adapter}-${key}`);
    }
  }
}

export function evaluateFeasibility(input) {
  validateEvaluationInput(input);
  const adapters = {};
  for (const adapter of ADAPTERS) {
    const values = input.adapters[adapter];
    const measurements = {
      routerPlusPickup: values.staticProxyTokens,
      clean: values.cleanProxyTokens,
      blocked: values.blockedProxyTokens,
      fullLifecycle: values.lifecycleProxyTokens,
    };
    const workingLimits = Object.fromEntries(
      Object.entries(input.fixedBudgets).map(([key, value]) => [key, value.working])
    );
    const absoluteLimits = Object.fromEntries(
      Object.entries(input.fixedBudgets).map(([key, value]) => [key, value.absolute])
    );
    const remainingWorkingMargins = Object.fromEntries(
      Object.entries(measurements).map(([key, value]) => [key, workingLimits[key] - value])
    );
    const remainingAbsoluteMargins = Object.fromEntries(
      Object.entries(measurements).map(([key, value]) => [key, absoluteLimits[key] - value])
    );
    const verdicts = {
      routerPlusPickup: measurements.routerPlusPickup <= workingLimits.routerPlusPickup,
      clean: measurements.clean <= workingLimits.clean,
      blocked: measurements.blocked <= workingLimits.blocked,
      fullLifecycle: measurements.fullLifecycle <= workingLimits.fullLifecycle,
      reduction: values.candidateTotalProxyTokens < values.legacyTotalProxyTokens,
    };
    const absoluteVerdicts = Object.fromEntries(
      Object.entries(measurements).map(([key, value]) => [key, value <= absoluteLimits[key]])
    );
    adapters[adapter] = {
      measurements,
      workingLimits,
      absoluteLimits,
      remainingWorkingMargins,
      remainingAbsoluteMargins,
      totalContext: {
        legacy: values.legacyTotalProxyTokens,
        candidate: values.candidateTotalProxyTokens,
        delta: values.candidateTotalProxyTokens - values.legacyTotalProxyTokens,
      },
      verdicts,
      absoluteVerdicts,
      status:
        Object.values(verdicts).every(Boolean) && Object.values(absoluteVerdicts).every(Boolean)
          ? 'pass'
          : 'fail',
    };
  }

  const budgetsPassed = ADAPTERS.every((adapter) =>
    ['routerPlusPickup', 'clean', 'blocked', 'fullLifecycle'].every(
      (key) => adapters[adapter].verdicts[key] && adapters[adapter].absoluteVerdicts[key]
    )
  );
  const reductionPassed = ADAPTERS.every((adapter) => adapters[adapter].verdicts.reduction);
  const checks = {
    completeness: input.completenessPassed ? 'pass' : 'fail',
    fidelity: input.fidelityPassed ? 'pass' : 'fail',
    budgets: budgetsPassed ? 'pass' : 'fail',
    reduction: reductionPassed ? 'pass' : 'fail',
  };

  return {
    adapters,
    checks,
    verdict: Object.values(checks).every((status) => status === 'pass') ? 'GO' : 'NO-GO',
  };
}

export function measurementExitCode(decision, { assertFeasible = false } = {}) {
  if (!decision || !new Set(['GO', 'NO-GO']).has(decision.verdict)) {
    fail('decision-verdict');
  }
  if (typeof assertFeasible !== 'boolean') fail('assert-feasible');
  return assertFeasible && decision.verdict !== 'GO' ? 1 : 0;
}

export function buildFeasibilityDecision({ projectRoot, measurementArtifacts } = {}) {
  if (typeof projectRoot !== 'string' || projectRoot === '') fail('project-root');

  const baseline = readJson(projectRoot, `${FIXTURE_ROOT}/legacy-baseline.json`);
  const baselineResult = assertFrozenGuidanceBaseline({ projectRoot, baseline });
  const clauseIndex = readJson(projectRoot, `${FIXTURE_ROOT}/spec-clause-index.json`);
  const specText = readBytes(projectRoot, clauseIndex.source.path);
  const clauseResult = assertSpecClauseIndex({
    index: clauseIndex,
    specPath: clauseIndex.source.path,
    specText,
  });
  const traceability = readJson(projectRoot, `${FIXTURE_ROOT}/oracle-traceability.json`);
  const traceabilityResult = assertOracleTraceability({
    index: clauseIndex,
    traceability,
    requireAllExecuted: true,
  });

  const artifacts = measurementArtifacts ?? committedMeasurementArtifacts(projectRoot);
  validateCandidateMeasurementArtifacts(artifacts, { projectRoot });
  const { actionCardinality, serializationSensitivity, contextComparison } = artifacts;
  const records = acceptedInputRecords({
    projectRoot,
    baseline,
    clauseIndex,
    contextComparison,
  });
  const proposedStaticText = Object.fromEntries(
    ADAPTERS.map((adapter) => [
      adapter,
      contextComparison.adapters[adapter].candidate.static.files.map(
        ({ characters, bytes, proxyTokens, sha256: digest }) => ({
          characters,
          bytes,
          proxyTokens,
          sha256: digest,
        })
      ),
    ])
  );
  const identities = {
    legacySourceCommit: baseline.source.commit,
    oracleSourceCommit: contextComparison.identities.candidate.oracle.sourceCommit,
    proposedStaticSourceCommit: contextComparison.identities.candidate.plan.sourceCommit,
    candidateFixtureSourceCommit: contextComparison.identities.candidate.fixtureSourceCommit,
    candidateFixtureSetSha256: contextComparison.identities.candidate.fixtureSetSha256,
    sourceSpecificationCommit: clauseIndex.source.commit,
    baselineGenerationSha256: traceability.baselineGenerationSha256,
    serializer: contextComparison.identities.candidate.serializer,
    scenarioSha256: contextComparison.identities.legacy.scenarioSha256,
    authorityFixtureSha256: contextComparison.identities.legacy.authorityFixtureSha256,
    runtime: contextComparison.identities.candidate.runtime,
  };
  const acceptedGenerationSha256 = digestJson({
    identities,
    proposedStaticText,
    records,
  });
  const completeness = {
    status: 'pass',
    frozenBaselineInputs: baselineResult.inputsVerified,
    frozenTranscriptEntries: baselineResult.transcriptEntriesVerified,
    indexedClauses: clauseResult.clauseCount,
    tracedClauses: traceabilityResult.mappingCount,
    candidateActions: actionCardinality.actions.length,
    candidateAdapters: Object.keys(artifacts.transcripts).length,
  };
  const fidelity = {
    status: 'pass',
    oracleAssertionsExecuted: traceability.assertions.executed.length,
    oracleFixturesObserved: traceability.fixtures.observed.length,
    captureKind: contextComparison.assumptions.captureKind,
    provisionalStaticObligations: true,
  };
  const evaluation = evaluateFeasibility({
    completenessPassed: completeness.status === 'pass',
    fidelityPassed: fidelity.status === 'pass',
    fixedBudgets: contextComparison.fixedBudgets,
    adapters: Object.fromEntries(
      ADAPTERS.map((adapter) => {
        const comparison = contextComparison.adapters[adapter];
        return [
          adapter,
          {
            staticProxyTokens: comparison.candidate.static.totals.proxyTokens,
            cleanProxyTokens: comparison.candidate.responses.clean.proxyTokens,
            blockedProxyTokens: comparison.candidate.responses.blocked.proxyTokens,
            lifecycleProxyTokens: comparison.candidate.total.proxyTokens,
            legacyTotalProxyTokens: comparison.legacy.total.proxyTokens,
            candidateTotalProxyTokens: comparison.candidate.total.proxyTokens,
          },
        ];
      })
    ),
  });

  return {
    schema: 'aitm.guidance-feasibility-decision/v1',
    owner: {
      issue: 1660,
      wbsRank: 8,
      authority: 'sole-foundation-gate',
    },
    inputs: {
      acceptedGenerationSha256,
      identities,
      proposedStaticText,
      records,
    },
    completeness,
    fidelity,
    fixedBudgets: contextComparison.fixedBudgets,
    adapters: evaluation.adapters,
    heavyCase: {
      inputs: serializationSensitivity.heavyCase.inputs,
      measurement: serializationSensitivity.heavyCase.measurement,
      interpretation:
        'Reachable declared-input sensitivity evidence; not a universal limit and not permission to truncate operational values.',
    },
    assumptions: contextComparison.assumptions,
    checks: evaluation.checks,
    verdict: evaluation.verdict,
    foundation: {
      canAssert: evaluation.verdict === 'GO',
      acceptedInputGenerationSha256: acceptedGenerationSha256,
    },
  };
}

export function validateFeasibilityDecision(decision, { projectRoot } = {}) {
  const expected = buildFeasibilityDecision({ projectRoot });
  if (!isDeepStrictEqual(decision, expected)) fail('decision-drift');
  return decision;
}

const RECHECK_STATIC = ['router', 'pickup', 'claude', 'codex'];
const FIXED_GUIDANCE_BUDGETS = Object.freeze({
  routerPlusPickup: { absolute: 5000, working: 4000 },
  clean: { absolute: 300, working: 240 },
  blocked: { absolute: 500, working: 400 },
  fullLifecycle: { absolute: 7000, working: 5600 },
});
const VERIFIED_MAP_SHA256 =
  'sha256:fc103b05488244900ec6866f01eb4474b01c171da4eb153ca8118561c515ff10';
const RELOCATED_PROTOCOL_FILES = Object.freeze({
  'binding.discussion': ['router'],
  'binding.workspace': ['router'],
  'binding.deferred-pickup': ['router'],
  'binding.session-recovery': ['router'],
  'review.prompt': ['pickup'],
  'review.reject': ['pickup'],
  'review.dismiss': ['pickup'],
  'close.human-instruction': ['router'],
});

export function assertFixedGuidanceBudgets(budgets) {
  if (!isDeepStrictEqual(budgets, FIXED_GUIDANCE_BUDGETS)) fail('fixed-budgets');
  return budgets;
}

export function validateObligationCoverage({ projectRoot, map, coverage }) {
  if (coverage?.schema !== 'aitm.guidance-obligation-coverage/v1') fail('obligation-coverage');
  if (!Array.isArray(map?.rows) || !Array.isArray(coverage.entries)) fail('obligation-coverage');
  const retained = map.rows.filter((row) => row.retainedProtocolRule);
  const byId = new Map(coverage.entries.map((entry) => [entry.id, entry]));
  if (byId.size !== retained.length || coverage.entries.length !== retained.length)
    fail('obligation-coverage-count');
  const uncovered = [];
  const relocations = [];
  for (const row of map.rows) {
    if (!readBytes(projectRoot, row.sourcePath).includes(row.sourceAnchor))
      fail(`obligation-source:${row.id}`);
    if (row.enforcementPath) {
      readBytes(projectRoot, row.enforcementPath);
      continue;
    }
    if (!readBytes(projectRoot, row.retainedProtocolRule).includes(row.protocolAnchor))
      fail(`obligation-protocol:${row.id}`);
    const entry = byId.get(row.id);
    if (
      !entry ||
      entry.sourceAnchor !== row.sourceAnchor ||
      entry.protocolAnchor !== row.protocolAnchor
    )
      fail(`obligation-anchor:${row.id}`);
    const expectedFiles = row.proposedStatic ?? RELOCATED_PROTOCOL_FILES[row.id];
    if (!expectedFiles || !isDeepStrictEqual(entry.requiredFiles, expectedFiles))
      fail(`obligation-file:${row.id}`);
    if (!row.proposedStatic) relocations.push({ id: row.id, proposedStatic: expectedFiles });
    if (!isDeepStrictEqual(Object.keys(entry.evidence ?? {}).sort(), [...expectedFiles].sort()))
      fail(`obligation-file:${row.id}`);
    for (const name of expectedFiles) {
      const snippet = entry.evidence[name];
      if (typeof snippet !== 'string' || snippet.length < 20) fail(`obligation-content:${row.id}`);
      const staticText = readBytes(
        projectRoot,
        `${FIXTURE_ROOT}/obligation-complete-static/${name}.md`
      ).toString('utf8');
      if (!staticText.includes(`${snippet} [${row.id}]`)) fail(`obligation-content:${row.id}`);
    }
  }
  return { retained: retained.length, relocations, uncovered };
}
const RECHECK_ACTIONS = [
  ['lifecycle-resume', 'resume'],
  ['lifecycle-promote', 'promote'],
  ['lifecycle-test', 'test'],
  ['lifecycle-review', 'review'],
  ['lifecycle-deliver', 'deliver'],
  ['lifecycle-close', 'close'],
];

function verifyCaptureSource(projectRoot, capture) {
  const commit = capture.identity?.sourceCommit;
  if (!/^[0-9a-f]{40}$/.test(commit ?? '')) fail('capture-source-commit');
  for (const record of capture.identity.implementationFiles ?? []) {
    const original = spawnSync('git', ['show', `${commit}:${record.path}`], {
      cwd: projectRoot,
      encoding: null,
    });
    if (original.status !== 0 || sha256(original.stdout) !== record.sha256)
      fail(`capture-committed-source:${record.path}`);
  }
  const required = [
    'bin/aitm.mjs',
    'scripts/task-tracker/verbs/explain.mjs',
    'scripts/maintenance/capture-guidance-lifecycle.mjs',
    'scripts/task-tracker/lib/action-decision/close.mjs',
    'instructions/aitm-guidance.yml',
  ];
  for (const relativePath of required) {
    if (
      !capture.identity.implementationFiles.some(
        ({ path: candidate }) => candidate === relativePath
      )
    )
      fail(`capture-source-missing:${relativePath}`);
  }
}

function committedCurrentHead(projectRoot, relativePath) {
  const head = spawnSync('git', ['log', '-1', '--format=%H', '--', relativePath], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  if (head.status !== 0 || !/^[0-9a-f]{40}$/.test(head.stdout.trim()))
    fail('decision-source-commit');
  const commit = head.stdout.trim();
  const original = spawnSync('git', ['show', `${commit}:${relativePath}`], {
    cwd: projectRoot,
    encoding: null,
  });
  if (
    original.status !== 0 ||
    sha256(original.stdout) !== sha256(readBytes(projectRoot, relativePath))
  )
    fail('decision-committed-source');
  return commit;
}

function replayComparableEvent(event) {
  const comparable = structuredClone(event);
  if (comparable.argv?.[1]?.endsWith('/bin/aitm.mjs')) {
    comparable.argv[1] = '<project>/bin/aitm.mjs';
  }
  if (comparable.remoteAuthorityCalls) {
    comparable.remoteAuthorityCalls = comparable.remoteAuthorityCalls
      .map((call) => JSON.stringify(stable(call)))
      .sort();
  }
  if (comparable.name === 'diagnostic') {
    const diagnostic = JSON.parse(comparable.stdout);
    const snapshot = diagnostic.fullDecision?.snapshot;
    if (!snapshot || !Array.isArray(snapshot.observations)) fail('capture-replay-diagnostic');
    delete snapshot.digest;
    delete snapshot.startedAt;
    delete snapshot.completedAt;
    for (const observation of snapshot.observations) {
      delete observation.observedAt;
      delete observation.digest;
    }
    comparable.stdout = { parsed: diagnostic, characters: comparable.stdout.length };
  }
  return comparable;
}

function verifyCaptureReplay(capture) {
  const replay = captureGuidanceLifecycle({ mode: 'recertification' });
  for (const key of [
    'scenarioManifestSha256',
    'initialFixtureSha256',
    'initialBodySha256',
    'configSha256',
    'fakeGhSha256',
  ]) {
    if (capture.identity[key] !== replay.identity[key]) fail(`capture-replay-identity:${key}`);
  }
  // Source bytes are pinned to the recorded commit above. Later implementation
  // changes are allowed only when the public CLI replay remains equivalent.
  if (
    !isDeepStrictEqual(
      capture.events.map(replayComparableEvent),
      replay.events.map(replayComparableEvent)
    )
  )
    fail('capture-replay-events');
  if (
    !isDeepStrictEqual(
      capture.measurement.modeledProposedStatic,
      replay.measurement.modeledProposedStatic
    ) ||
    !isDeepStrictEqual(capture.measurement.budgets, replay.measurement.budgets)
  )
    fail('capture-replay-measurement');
  return {
    eventsCompared: capture.events.length,
    fixtureSha256: replay.identity.initialFixtureSha256,
  };
}

function validateRecheckCapture(projectRoot, capture) {
  if (capture.schema !== 'aitm.guidance-lifecycle-capture/v1') fail('capture-schema');
  if (capture.identity?.mode !== 'recertification') fail('capture-mode');
  if (
    capture.captureKind !== 'actual-public-cli-with-deterministic-authority' ||
    capture.authority !== 'deterministic-fixture'
  )
    fail('capture-authority');
  verifyCaptureSource(projectRoot, capture);
  validateLifecycleTranscript(capture);
  const first = capture.events[0];
  if (
    capture.identity.initialFixtureSha256 !== first.snapshotSha256 ||
    capture.identity.initialBodySha256 !== first.authorityBodySha256
  )
    fail('capture-initial-fixture');
  for (const key of ['scenarioManifestSha256', 'configSha256', 'fakeGhSha256']) {
    if (!/^sha256:[0-9a-f]{64}$/.test(capture.identity[key] ?? ''))
      fail(`capture-fixture-identity:${key}`);
  }
  if (capture.identity.transcriptSha256 !== sha256(JSON.stringify(capture.events)))
    fail('capture-transcript-digest');
  const traffic = measureLifecycleTraffic(capture.events);
  if (!isDeepStrictEqual(traffic, capture.measurement.traffic)) fail('capture-traffic');
  const actionResults = RECHECK_ACTIONS.map(([name, actionId]) => {
    const event = capture.events.find((candidate) => candidate.name === name);
    if (!event || event.kind !== 'query' || event.exitCode !== 0) fail(`capture-action:${name}`);
    let parsed;
    try {
      parsed = JSON.parse(event.stdout);
    } catch {
      fail(`capture-action-json:${name}`);
    }
    if (
      parsed.result?.actionId !== actionId ||
      parsed.result?.status !== event.typed?.status ||
      parsed.result?.status !== 'ready'
    )
      fail(`capture-action-readiness:${name}`);
    return { name, actionId, status: parsed.result.status };
  });
  const remoteAuthorityReads = capture.events
    .filter(({ kind }) => kind !== 'transition')
    .reduce((total, event) => total + (event.remoteAuthorityReads ?? 0), 0);
  if (remoteAuthorityReads <= 0) fail('capture-remote-authority');
  const replay = verifyCaptureReplay(capture);
  return { traffic, actionResults, remoteAuthorityReads, replay };
}

export function buildCurrentRecertificationDecision({ projectRoot, capture } = {}) {
  if (typeof projectRoot !== 'string' || projectRoot === '') fail('project-root');
  const mapPath = `${FIXTURE_ROOT}/rule-guidance-map.json`;
  const capturePath = `${FIXTURE_ROOT}/actual-explain-traffic-recertification.json`;
  const historicalPath = `${FIXTURE_ROOT}/actual-explain-traffic-corrected.json`;
  const historicalDecisionPath = `${FIXTURE_ROOT}/feasibility-recheck-1676.json`;
  const map = readJson(projectRoot, mapPath);
  if (map.schema !== 'aitm.rule-guidance-map/v1' || map.rows?.length !== 41) fail('obligation-map');
  if (fileRecord(projectRoot, 'obligation-map', mapPath).sha256 !== VERIFIED_MAP_SHA256)
    fail('obligation-map-drift');
  const currentCapture = capture ?? readJson(projectRoot, capturePath);
  const verifiedCapture = validateRecheckCapture(projectRoot, currentCapture);
  const historical = readJson(projectRoot, historicalPath);
  const historicalDecision = readJson(projectRoot, historicalDecisionPath);
  if (
    historical.measurement?.traffic?.proxyTokens <= 5600 ||
    historicalDecision.verdict !== 'NO-GO'
  )
    fail('historical-negative-controls');

  const staticFiles = Object.fromEntries(
    RECHECK_STATIC.map((name) => {
      const relativePath = `${FIXTURE_ROOT}/obligation-complete-static/${name}.md`;
      const text = readBytes(projectRoot, relativePath).toString('utf8');
      return [name, { text, record: fileRecord(projectRoot, 'proposed-static', relativePath) }];
    })
  );
  const shim = {
    text: readBytes(projectRoot, 'skill/SKILL.md').toString('utf8'),
    record: fileRecord(projectRoot, 'proposed-static-shim', 'skill/SKILL.md'),
  };
  const retained = map.rows.filter((row) => row.retainedProtocolRule);
  const enforcement = map.rows.filter((row) => row.enforcementPath);
  if (retained.length !== 24 || enforcement.length !== 17) fail('obligation-partition');
  const coveragePath = `${FIXTURE_ROOT}/obligation-complete-static/coverage.json`;
  const coverage = readJson(projectRoot, coveragePath);
  const { uncovered, relocations } = validateObligationCoverage({ projectRoot, map, coverage });
  const comparison = readJson(projectRoot, `${FIXTURE_ROOT}/context-comparison.json`);
  const budgets = assertFixedGuidanceBudgets(comparison.fixedBudgets);
  const adapterMeasurements = Object.fromEntries(
    ADAPTERS.map((adapter) => {
      const names = ['router', 'pickup', adapter];
      const staticProxyTokens =
        Math.ceil(shim.text.length / 4) +
        names.reduce((sum, name) => sum + Math.ceil(staticFiles[name].text.length / 4), 0);
      const clean = currentCapture.events.find(({ name }) => name === 'ready-first-load');
      const blocked = currentCapture.events.find(({ name }) => name === 'blocked-migration-freeze');
      const cleanProxyTokens = Math.ceil(clean.stdout.length / 4);
      const blockedProxyTokens = Math.ceil(blocked.stdout.length / 4);
      const lifecycleProxyTokens = staticProxyTokens + verifiedCapture.traffic.proxyTokens;
      if (
        currentCapture.measurement.modeledProposedStatic?.[adapter]?.totals?.proxyTokens !==
          staticProxyTokens ||
        currentCapture.measurement.modeledProposedTotals?.[adapter] !== lifecycleProxyTokens
      )
        fail(`capture-static-measurement:${adapter}`);
      return [
        adapter,
        {
          staticProxyTokens,
          cleanProxyTokens,
          blockedProxyTokens,
          lifecycleProxyTokens,
          legacyTotalProxyTokens: comparison.adapters[adapter].legacy.total.proxyTokens,
          candidateTotalProxyTokens: lifecycleProxyTokens,
        },
      ];
    })
  );
  const evaluation = evaluateFeasibility({
    completenessPassed: uncovered.length === 0,
    fidelityPassed: true,
    fixedBudgets: budgets,
    adapters: adapterMeasurements,
  });
  const records = [
    fileRecord(
      projectRoot,
      'recertification-decision-runner',
      'scripts/maintenance/measure-guidance-candidate.mjs'
    ),
    fileRecord(projectRoot, 'obligation-map', mapPath),
    fileRecord(projectRoot, 'obligation-coverage', coveragePath),
    shim.record,
    ...RECHECK_STATIC.map((name) => staticFiles[name].record),
    ...(capture ? [] : [fileRecord(projectRoot, 'recertification-capture', capturePath)]),
    fileRecord(projectRoot, 'historical-capture', historicalPath),
    fileRecord(projectRoot, 'historical-recheck', historicalDecisionPath),
    fileRecord(projectRoot, 'context-comparison', `${FIXTURE_ROOT}/context-comparison.json`),
  ];
  const decisionSourceCommit = committedCurrentHead(
    projectRoot,
    'scripts/maintenance/measure-guidance-candidate.mjs'
  );
  return {
    schema: 'aitm.guidance-feasibility-recertification/v1',
    owner: { issue: 1767, parentIssue: 1558, foundationIssue: 1660 },
    releaseProof: 'proposed-static-and-deterministic-authority-only',
    inputs: {
      records,
      decisionSourceCommit,
      captureSourceCommit: currentCapture.identity.sourceCommit,
      captureImplementationFiles: currentCapture.identity.implementationFiles,
      fixture: {
        scenarioManifestSha256: currentCapture.identity.scenarioManifestSha256,
        initialFixtureSha256: currentCapture.identity.initialFixtureSha256,
        initialBodySha256: currentCapture.identity.initialBodySha256,
        configSha256: currentCapture.identity.configSha256,
        fakeGhSha256: currentCapture.identity.fakeGhSha256,
      },
    },
    obligations: {
      total: map.rows.length,
      retainedProtocol: retained.length,
      enforcement: enforcement.length,
      relocations,
      uncovered,
    },
    capture: {
      events: currentCapture.events.filter(({ kind }) => kind !== 'transition').length,
      actionResults: verifiedCapture.actionResults,
      remoteAuthorityReads: verifiedCapture.remoteAuthorityReads,
      dynamicProxyTokens: verifiedCapture.traffic.proxyTokens,
      transcriptSha256: currentCapture.identity.transcriptSha256,
      replay: verifiedCapture.replay,
    },
    historicalNegativeControl: {
      verdict: historicalDecision.verdict,
      dynamicProxyTokens: historical.measurement.traffic.proxyTokens,
    },
    fixedBudgets: budgets,
    adapters: evaluation.adapters,
    checks: evaluation.checks,
    verdict: evaluation.verdict,
  };
}

function parseArgs(args) {
  const report = ['--all', '--json'];
  const assertion = ['--all', '--assert-feasible', '--json'];
  if (isDeepStrictEqual(args, report)) return { assertFeasible: false };
  if (isDeepStrictEqual(args, assertion)) return { assertFeasible: true };
  throw new Error(USAGE);
}

export function runMeasurementCommand(
  args,
  {
    projectRoot,
    writeStdout = (value) => process.stdout.write(value),
    writeStderr = (value) => process.stderr.write(value),
  } = {}
) {
  try {
    const options = parseArgs(args);
    const decision = buildCurrentRecertificationDecision({ projectRoot });
    writeStdout(`${JSON.stringify(decision, null, 2)}\n`);
    return measurementExitCode(decision, options);
  } catch (error) {
    writeStderr(`${error.message}\n`);
    return 1;
  }
}

function runCli() {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  process.exitCode = runMeasurementCommand(process.argv.slice(2), { projectRoot });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runCli();
}
