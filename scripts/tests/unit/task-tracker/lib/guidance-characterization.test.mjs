// @story #1861
// @story #1660
// @story #1859
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const fixtureRoot = path.join(projectRoot, 'scripts/tests/fixtures/1558');

// Historical reports certify the exact shim bytes they measured. Later product
// guidance must not silently replace their inputs or change their recorded GO.
function historicalCandidateRoot() {
  const record = json('pre-slim-static/manifest.json').files.find(
    ({ sourcePath }) => sourcePath === 'skill/SKILL.md'
  );
  const bytes = Buffer.from(
    readFileSync(path.join(projectRoot, record.snapshotPath), 'utf8').trim(),
    'base64'
  );
  assert.equal(`sha256:${createHash('sha256').update(bytes).digest('hex')}`, record.sha256);
  assert.equal(
    record.sha256,
    json('context-comparison.json').adapters.codex.candidate.static.files.find(
      ({ id }) => id === 'shim'
    ).sha256
  );
  const historicalRoot = mkdtempSync(
    path.join(projectScratchDir('test', projectRoot), 'guidance-historical-')
  );
  after(() => rmSync(historicalRoot, { recursive: true, force: true }));
  for (const directory of ['scripts', 'docs']) {
    symlinkSync(path.join(projectRoot, directory), path.join(historicalRoot, directory), 'dir');
  }
  mkdirSync(path.join(historicalRoot, 'skill'));
  writeFileSync(path.join(historicalRoot, 'skill/SKILL.md'), bytes);
  return historicalRoot;
}

function json(relativePath) {
  return JSON.parse(readFileSync(path.join(fixtureRoot, relativePath), 'utf8'));
}

function clone(value) {
  return structuredClone(value);
}

async function measurementTool() {
  return import('../../../../maintenance/measure-guidance-candidate.mjs');
}

test('accepted WBS 5-7 generation produces the sole pinned GO decision', async () => {
  const { buildFeasibilityDecision, validateFeasibilityDecision } = await measurementTool();
  const historicalRoot = historicalCandidateRoot();
  const decision = buildFeasibilityDecision({ projectRoot: historicalRoot });

  assert.equal(validateFeasibilityDecision(decision, { projectRoot: historicalRoot }), decision);
  assert.equal(decision.schema, 'aitm.guidance-feasibility-decision/v1');
  assert.deepEqual(decision.owner, {
    issue: 1660,
    wbsRank: 8,
    authority: 'sole-foundation-gate',
  });
  assert.match(decision.inputs.acceptedGenerationSha256, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(decision.completeness, {
    status: 'pass',
    frozenBaselineInputs: 19,
    frozenTranscriptEntries: 28,
    indexedClauses: 70,
    tracedClauses: 70,
    candidateActions: 7,
    candidateAdapters: 2,
  });
  assert.deepEqual(decision.fidelity, {
    status: 'pass',
    oracleAssertionsExecuted: 10,
    oracleFixturesObserved: 20,
    captureKind: 'candidate-model-not-actual-cli',
    provisionalStaticObligations: true,
  });

  assert.deepEqual(decision.adapters.claude, {
    measurements: {
      routerPlusPickup: 840,
      clean: 121,
      blocked: 170,
      fullLifecycle: 4446,
    },
    workingLimits: {
      routerPlusPickup: 4000,
      clean: 240,
      blocked: 400,
      fullLifecycle: 5600,
    },
    absoluteLimits: {
      routerPlusPickup: 5000,
      clean: 300,
      blocked: 500,
      fullLifecycle: 7000,
    },
    remainingWorkingMargins: {
      routerPlusPickup: 3160,
      clean: 119,
      blocked: 230,
      fullLifecycle: 1154,
    },
    remainingAbsoluteMargins: {
      routerPlusPickup: 4160,
      clean: 179,
      blocked: 330,
      fullLifecycle: 2554,
    },
    totalContext: { legacy: 18169, candidate: 4446, delta: -13723 },
    verdicts: {
      routerPlusPickup: true,
      clean: true,
      blocked: true,
      fullLifecycle: true,
      reduction: true,
    },
    absoluteVerdicts: {
      routerPlusPickup: true,
      clean: true,
      blocked: true,
      fullLifecycle: true,
    },
    status: 'pass',
  });
  assert.deepEqual(decision.adapters.codex, {
    measurements: {
      routerPlusPickup: 833,
      clean: 121,
      blocked: 170,
      fullLifecycle: 4439,
    },
    workingLimits: {
      routerPlusPickup: 4000,
      clean: 240,
      blocked: 400,
      fullLifecycle: 5600,
    },
    absoluteLimits: {
      routerPlusPickup: 5000,
      clean: 300,
      blocked: 500,
      fullLifecycle: 7000,
    },
    remainingWorkingMargins: {
      routerPlusPickup: 3167,
      clean: 119,
      blocked: 230,
      fullLifecycle: 1161,
    },
    remainingAbsoluteMargins: {
      routerPlusPickup: 4167,
      clean: 179,
      blocked: 330,
      fullLifecycle: 2561,
    },
    totalContext: { legacy: 18083, candidate: 4439, delta: -13644 },
    verdicts: {
      routerPlusPickup: true,
      clean: true,
      blocked: true,
      fullLifecycle: true,
      reduction: true,
    },
    absoluteVerdicts: {
      routerPlusPickup: true,
      clean: true,
      blocked: true,
      fullLifecycle: true,
    },
    status: 'pass',
  });
  assert.deepEqual(decision.heavyCase, {
    inputs: { action: 'close', attempts: 2, blockersPerAttempt: 7, observationsPerAttempt: 8 },
    measurement: { characters: 3682, bytes: 3682, proxyTokens: 921 },
    interpretation:
      'Reachable declared-input sensitivity evidence; not a universal limit and not permission to truncate operational values.',
  });
  assert.deepEqual(decision.checks, {
    completeness: 'pass',
    fidelity: 'pass',
    budgets: 'pass',
    reduction: 'pass',
  });
  assert.equal(decision.verdict, 'GO');
  assert.deepEqual(decision.foundation, {
    canAssert: true,
    acceptedInputGenerationSha256: decision.inputs.acceptedGenerationSha256,
  });
});

test('decision pins complete source, runner, oracle, serializer, fixture and proposed-text identities', async () => {
  const { buildFeasibilityDecision } = await measurementTool();
  const historicalRoot = historicalCandidateRoot();
  const decision = buildFeasibilityDecision({ projectRoot: historicalRoot });
  const roles = new Set(decision.inputs.records.map(({ role }) => role));

  assert.deepEqual(
    [...roles].sort(),
    [
      'candidate-action-fixture',
      'candidate-oracle-source',
      'candidate-proposed-static-source',
      'candidate-transcript',
      'legacy-baseline',
      'legacy-frozen-input',
      'measurement-report',
      'oracle-traceability',
      'source-specification',
      'spec-clause-index',
    ].sort()
  );
  assert.equal(
    decision.inputs.records.filter(({ role }) => role === 'legacy-frozen-input').length,
    19
  );
  for (const input of json('legacy-baseline.json').inputs) {
    assert.deepEqual(
      decision.inputs.records.find(
        ({ role, id }) => role === 'legacy-frozen-input' && id === input.id
      ),
      {
        role: 'legacy-frozen-input',
        id: input.id,
        sourcePath: input.sourcePath,
        snapshotPath: input.snapshotPath,
        encoding: input.encoding,
        bytes: input.bytes,
        contentSha256: input.sha256,
      }
    );
  }
  assert.equal(
    decision.inputs.records.filter(({ role }) => role === 'candidate-action-fixture').length,
    7
  );
  assert.equal(
    decision.inputs.records.filter(({ role }) => role === 'candidate-transcript').length,
    2
  );
  assert.equal(
    decision.inputs.records.filter(({ role }) => role === 'candidate-proposed-static-source')
      .length,
    1
  );
  assert.equal(
    decision.inputs.identities.serializer,
    'guidance-characterization/candidate-workflow-v1'
  );
  assert.match(decision.inputs.identities.legacySourceCommit, /^[0-9a-f]{40}$/);
  assert.match(decision.inputs.identities.oracleSourceCommit, /^[0-9a-f]{40}$/);
  assert.match(decision.inputs.identities.proposedStaticSourceCommit, /^[0-9a-f]{40}$/);
  assert.match(decision.inputs.identities.candidateFixtureSetSha256, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(decision.inputs.proposedStaticText).sort(), ['claude', 'codex']);
  for (const adapter of ['claude', 'codex']) {
    assert.equal(decision.inputs.proposedStaticText[adapter].length, 4);
    assert.equal(
      decision.inputs.proposedStaticText[adapter].every(
        ({ characters, bytes, proxyTokens, sha256 }) =>
          Number.isInteger(characters) &&
          Number.isInteger(bytes) &&
          Number.isInteger(proxyTokens) &&
          /^sha256:[0-9a-f]{64}$/.test(sha256)
      ),
      true
    );
  }
});

test('honest NO-GO remains reportable while the foundation assertion exits nonzero', async () => {
  const { evaluateFeasibility, measurementExitCode } = await measurementTool();
  const noGo = evaluateFeasibility({
    completenessPassed: true,
    fidelityPassed: true,
    fixedBudgets: {
      routerPlusPickup: { absolute: 5000, working: 4000 },
      clean: { absolute: 300, working: 240 },
      blocked: { absolute: 500, working: 400 },
      fullLifecycle: { absolute: 7000, working: 5600 },
    },
    adapters: {
      claude: {
        staticProxyTokens: 4001,
        cleanProxyTokens: 121,
        blockedProxyTokens: 170,
        lifecycleProxyTokens: 4446,
        legacyTotalProxyTokens: 18169,
        candidateTotalProxyTokens: 4446,
      },
      codex: {
        staticProxyTokens: 833,
        cleanProxyTokens: 121,
        blockedProxyTokens: 170,
        lifecycleProxyTokens: 4439,
        legacyTotalProxyTokens: 18083,
        candidateTotalProxyTokens: 4439,
      },
    },
  });

  assert.equal(noGo.verdict, 'NO-GO');
  assert.equal(noGo.adapters.claude.verdicts.routerPlusPickup, false);
  assert.equal(measurementExitCode(noGo, { assertFeasible: false }), 0);
  assert.equal(measurementExitCode(noGo, { assertFeasible: true }), 1);
});

test('missing, stale, shortened or relabeled inputs cannot become a decision', async () => {
  const { buildFeasibilityDecision, validateFeasibilityDecision, withFrozenCandidateRuntime } =
    await measurementTool();
  const { buildCandidateMeasurementArtifacts } =
    await import('../../../helpers/guidance-characterization.mjs');
  const historicalRoot = historicalCandidateRoot();
  const artifacts = withFrozenCandidateRuntime(() =>
    buildCandidateMeasurementArtifacts({ projectRoot: historicalRoot })
  );
  assert.deepEqual(
    buildFeasibilityDecision({ projectRoot: historicalRoot, measurementArtifacts: artifacts }),
    json('feasibility-decision.json')
  );

  for (const mutate of [
    (value) => value.transcripts.codex.entries.pop(),
    (value) => (value.contextComparison.identities.candidate.fixtureSetSha256 = 'sha256:1234'),
    (value) => (value.contextComparison.assumptions.captureKind = 'actual-cli-capture'),
  ]) {
    const candidate = clone(artifacts);
    mutate(candidate);
    assert.throws(
      () =>
        buildFeasibilityDecision({ projectRoot: historicalRoot, measurementArtifacts: candidate }),
      /guidance-candidate:measurement-artifact-drift/
    );
  }

  const decision = buildFeasibilityDecision({ projectRoot: historicalRoot });
  decision.inputs.records.pop();
  assert.throws(
    () => validateFeasibilityDecision(decision, { projectRoot: historicalRoot }),
    /guidance-feasibility:decision-drift/
  );
});

test('historical foundation stays immutable and obsolete recertification cannot assert current GO', async (t) => {
  // #1857: current replay uses an isolated fixture actor; archived captures
  // and their original provenance assertions remain unchanged.
  const keys = ['AI_TASK_MANAGER_SESSION_ID', 'AI_TASK_MANAGER_APP_NAME'];
  const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.AI_TASK_MANAGER_SESSION_ID = 'fixture-guidance-replay';
  process.env.AI_TASK_MANAGER_APP_NAME = 'codex';
  t.after(() => {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const { buildFeasibilityDecision, buildCurrentRecertificationDecision, runMeasurementCommand } =
    await measurementTool();
  const historicalRoot = historicalCandidateRoot();
  assert.deepEqual(
    json('feasibility-decision.json'),
    buildFeasibilityDecision({ projectRoot: historicalRoot })
  );

  // The #1767 capture predates this catalog and is historical evidence. The
  // README-only routing also changed the obligation map; its pinned hash
  // refuses this obsolete certificate before replay. Do not relabel
  // this older capture or turn a failed replay into a fabricated recertification.
  assert.throws(
    () => buildCurrentRecertificationDecision({ projectRoot }),
    /guidance-feasibility:obligation-map-drift/
  );
  for (const args of [
    ['--all', '--json'],
    ['--all', '--assert-feasible', '--json'],
  ]) {
    let stdout = '';
    let stderr = '';
    const status = runMeasurementCommand(args, {
      projectRoot,
      writeStdout: (value) => (stdout += value),
      writeStderr: (value) => (stderr += value),
    });
    assert.equal(status, 1);
    assert.equal(stdout, '');
    assert.match(stderr, /guidance-feasibility:obligation-map-drift/);
  }

  let stderr = '';
  const invalid = runMeasurementCommand(['--json'], {
    projectRoot,
    writeStdout: () => {},
    writeStderr: (value) => (stderr += value),
  });
  assert.notEqual(invalid, 0);
  assert.match(stderr, /usage: measure-guidance-candidate/);
});
