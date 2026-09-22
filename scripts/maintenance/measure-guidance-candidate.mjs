#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';

import { validateCandidateMeasurementArtifacts } from '../tests/helpers/guidance-characterization.mjs';
import {
  assertFrozenGuidanceBaseline,
  assertOracleTraceability,
  assertSpecClauseIndex,
} from '../tests/helpers/guidance-clause-index.mjs';
import { REQUIRED_RULE_OBLIGATION_IDS } from '../../guidance/requirements.mjs';

const ACTIONS = ['bind', 'resume', 'promote', 'test', 'review', 'deliver', 'close'];
const ADAPTERS = ['claude', 'codex'];
const FIXTURE_ROOT = 'scripts/tests/fixtures/1558';
const PROPOSED_ROOT = `${FIXTURE_ROOT}/obligation-complete-static`;
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

/** The #1660 report above remains the immutable provisional foundation record. */
export function buildObligationCompleteRecheck({ projectRoot, readRelative } = {}) {
  if (typeof projectRoot !== 'string' || projectRoot === '') fail('project-root');
  const readInput = (relativePath) => {
    try {
      return (readRelative ?? ((name) => readBytes(projectRoot, name)))(relativePath);
    } catch {
      fail(`required-input-missing:${relativePath}`);
    }
  };
  const jsonInput = (relativePath) => JSON.parse(readInput(relativePath).toString('utf8'));
  const inputRecord = (role, relativePath, { id } = {}) => ({
    role,
    ...(id ? { id } : {}),
    path: relativePath,
    sha256: sha256(readInput(relativePath)),
  });
  const historical = readJson(projectRoot, `${FIXTURE_ROOT}/feasibility-decision.json`);
  validateFeasibilityDecision(historical, { projectRoot });
  const mapPath = `${FIXTURE_ROOT}/rule-guidance-map.json`;
  const capturePath = `${FIXTURE_ROOT}/actual-explain-traffic.json`;
  const map = jsonInput(mapPath);
  const capture = jsonInput(capturePath);
  if (
    map.schema !== 'aitm.rule-guidance-map/v1' ||
    !Array.isArray(map.rows) ||
    map.rows.length === 0
  ) {
    fail('rule-map');
  }
  if (
    capture.schema !== 'aitm.guidance-actual-cli-capture/v2' ||
    capture.captureKind !== 'actual-public-cli-subprocess' ||
    !Array.isArray(capture.scenarios)
  ) {
    fail('actual-cli-capture');
  }
  const scenarioNames = capture.measurement?.lifecycleScenarioNames;
  if (!Array.isArray(scenarioNames) || scenarioNames.length !== 7) fail('lifecycle-scenarios');
  const actualText = capture.scenarios
    .map(({ argv, stdout, stderr }) => `${argv.join(' ')}\n${stdout}${stderr}`)
    .join('');
  if (
    !isDeepStrictEqual(capture.measurement.actualTraffic, {
      characters: actualText.length,
      bytes: Buffer.byteLength(actualText),
      proxyTokens: Math.ceil(actualText.length / 4),
    })
  )
    fail('actual-traffic-drift');
  if (capture.scenarios.filter(({ name }) => scenarioNames.includes(name)).length !== 7) {
    fail('lifecycle-scenarios');
  }
  const lifecycleText = capture.scenarios
    .filter(({ name }) => scenarioNames.includes(name))
    .map(({ argv, stdout, stderr }) => `${argv.join(' ')}\n${stdout}${stderr}`)
    .join('');
  const lifecycleTraffic = {
    characters: lifecycleText.length,
    bytes: Buffer.byteLength(lifecycleText),
    proxyTokens: Math.ceil(lifecycleText.length / 4),
  };
  if (!isDeepStrictEqual(lifecycleTraffic, capture.measurement.lifecycleTraffic)) {
    fail('actual-lifecycle-drift');
  }
  const clean = capture.scenarios.find(({ name }) => name === 'ready-first-load');
  const blocked = capture.scenarios.find(({ name }) => name === 'blocked-migration-freeze');
  if (!clean || !blocked) fail('actual-response-cases');
  const responseProxy = (scenario) => Math.ceil(scenario.stdout.length / 4);
  if (
    responseProxy(clean) !== clean.proxyTokens ||
    responseProxy(blocked) !== blocked.proxyTokens
  ) {
    fail('actual-response-drift');
  }

  const staticPaths = {
    shim: 'skill/SKILL.md',
    router: `${PROPOSED_ROOT}/router.md`,
    pickup: `${PROPOSED_ROOT}/pickup.md`,
    claude: `${PROPOSED_ROOT}/claude.md`,
    codex: `${PROPOSED_ROOT}/codex.md`,
  };
  const staticText = Object.fromEntries(
    Object.entries(staticPaths).map(([id, relativePath]) => [
      id,
      readInput(relativePath).toString('utf8'),
    ])
  );
  const rowIds = new Set();
  for (const row of map.rows) {
    if (typeof row.id !== 'string' || rowIds.has(row.id)) fail('rule-map-duplicate');
    rowIds.add(row.id);
    if (!row.sourcePath || !readInput(row.sourcePath).toString('utf8').includes(row.sourceAnchor)) {
      fail(`rule-map-source-${row.id}`);
    }
    if (Boolean(row.enforcementPath) === Boolean(row.retainedProtocolRule)) {
      fail(`rule-map-authority-${row.id}`);
    }
    if (row.enforcementPath) readInput(row.enforcementPath);
    if (row.retainedProtocolRule) {
      if (!readInput(row.retainedProtocolRule).toString('utf8').includes(row.protocolAnchor)) {
        fail(`rule-map-protocol-${row.id}`);
      }
      if (!Array.isArray(row.proposedStatic) || row.proposedStatic.length === 0) {
        fail(`rule-map-static-${row.id}`);
      }
      for (const adapter of row.proposedStatic) {
        if (
          !['router', 'pickup', 'claude', 'codex'].includes(adapter) ||
          !staticText[adapter].includes(`[${row.id}]`)
        )
          fail(`rule-map-static-${row.id}`);
      }
    }
  }
  if (
    rowIds.size !== REQUIRED_RULE_OBLIGATION_IDS.length ||
    REQUIRED_RULE_OBLIGATION_IDS.some((id) => !rowIds.has(id))
  )
    fail('rule-map-incomplete');

  const fixedBudgets = historical.fixedBudgets;
  const adapters = {};
  const evaluatedInput = {};
  for (const adapter of ADAPTERS) {
    if (
      capture.measurement.currentFullStaticProxyTokens[adapter] !==
      readJson(projectRoot, `${FIXTURE_ROOT}/context-comparison.json`).adapters[adapter].legacy
        .static.totals.proxyTokens
    )
      fail(`current-static-drift-${adapter}`);
    const files = ['shim', 'router', 'pickup', adapter].map((id) => {
      const content = staticText[id];
      return {
        id,
        path: staticPaths[id],
        characters: content.length,
        bytes: Buffer.byteLength(content),
        proxyTokens: Math.ceil(content.length / 4),
        sha256: sha256(readInput(staticPaths[id])),
      };
    });
    const staticProxyTokens = files.reduce((total, file) => total + file.proxyTokens, 0);
    const proposedFull = staticProxyTokens + lifecycleTraffic.proxyTokens;
    const currentFull =
      capture.measurement.currentFullStaticProxyTokens[adapter] + lifecycleTraffic.proxyTokens;
    adapters[adapter] = {
      files,
      proposedStaticProxyTokens: staticProxyTokens,
      actualLifecycleTrafficProxyTokens: lifecycleTraffic.proxyTokens,
      currentLoadedFullProxyTokens: currentFull,
      proposedFullProxyTokens: proposedFull,
      provisionalEarlierStaticProxyTokens:
        capture.measurement.modeledProposedStatic[adapter].totals.proxyTokens,
    };
    evaluatedInput[adapter] = {
      staticProxyTokens,
      cleanProxyTokens: responseProxy(clean),
      blockedProxyTokens: responseProxy(blocked),
      lifecycleProxyTokens: proposedFull,
      legacyTotalProxyTokens: historical.adapters[adapter].totalContext.legacy,
      candidateTotalProxyTokens: proposedFull,
    };
  }
  const evaluation = evaluateFeasibility({
    completenessPassed: true,
    fidelityPassed: true,
    fixedBudgets,
    adapters: evaluatedInput,
  });
  return {
    schema: 'aitm.guidance-obligation-complete-recheck/v1',
    owner: { issue: 1676, parent: 1558, foundationIssue: 1660 },
    captureKind: capture.captureKind,
    staticObligations: 'mapped-complete-proposed-not-installed',
    inputs: [
      inputRecord('historical-foundation', `${FIXTURE_ROOT}/feasibility-decision.json`),
      inputRecord('rule-guidance-map', mapPath),
      inputRecord('actual-cli-capture', capturePath),
      inputRecord('hydrated-catalog', 'instructions/aitm-guidance.yml'),
      ...Object.entries(staticPaths).map(([id, relativePath]) =>
        inputRecord('proposed-static', relativePath, { id })
      ),
    ],
    mappedObligations: map.rows.length,
    retainedProtocolObligations: map.rows.filter(({ retainedProtocolRule }) => retainedProtocolRule)
      .length,
    fixedBudgets,
    actualResponses: {
      clean: responseProxy(clean),
      blocked: responseProxy(blocked),
    },
    actualLifecycleTraffic: lifecycleTraffic,
    adapters,
    checks: evaluation.checks,
    verdict: evaluation.verdict,
    interpretation:
      'Proposed static text plus the pinned #1675 actual public-CLI lifecycle; final installed adapter and traffic proof remains a later release gate.',
  };
}

export function validateObligationCompleteRecheck(report, { projectRoot, readRelative } = {}) {
  if (!isDeepStrictEqual(report, buildObligationCompleteRecheck({ projectRoot, readRelative }))) {
    fail('decision-drift');
  }
  return report;
}

export function buildObligationCompleteComparison({ projectRoot } = {}) {
  const report = buildObligationCompleteRecheck({ projectRoot });
  return {
    schema: 'aitm.guidance-obligation-complete-comparison/v1',
    source: 'actual-public-cli-subprocess-plus-proposed-static',
    inputs: report.inputs,
    mappedObligations: report.mappedObligations,
    retainedProtocolObligations: report.retainedProtocolObligations,
    fixedBudgets: report.fixedBudgets,
    actualResponses: report.actualResponses,
    actualLifecycleTraffic: report.actualLifecycleTraffic,
    adapters: Object.fromEntries(
      ADAPTERS.map((adapter) => [
        adapter,
        {
          currentLoadedFullProxyTokens: report.adapters[adapter].currentLoadedFullProxyTokens,
          provisionalEarlierStaticProxyTokens:
            report.adapters[adapter].provisionalEarlierStaticProxyTokens,
          proposedStaticProxyTokens: report.adapters[adapter].proposedStaticProxyTokens,
          proposedFullProxyTokens: report.adapters[adapter].proposedFullProxyTokens,
          files: report.adapters[adapter].files,
        },
      ])
    ),
    verdict: report.verdict,
  };
}

export function validateObligationCompleteComparison(comparison, { projectRoot } = {}) {
  if (!isDeepStrictEqual(comparison, buildObligationCompleteComparison({ projectRoot }))) {
    fail('comparison-drift');
  }
  return comparison;
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
    const decision = buildObligationCompleteRecheck({ projectRoot });
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
