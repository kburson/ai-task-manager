// @story #1657
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ACTIONS = ['bind', 'resume', 'promote', 'test', 'review', 'deliver', 'close'];
const ADAPTERS = ['claude', 'codex'];
const SECTIONS = ['13.2', '14.1', '15.2', '15.5', '17.1', '17.2'];
const GROUPS = [
  'evidence-and-normalization',
  'presentation-shape',
  'typed-causes-and-dispositions',
  'warnings',
  'human-decisions',
  'navigation-and-cross-issue',
  'guidance-and-receipts',
  'diagnostics',
  'project-override',
];

function fail(scope, reason) {
  throw new Error(`${scope}:${reason}`);
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
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

function exactKeys(value, keys, scope, reason = 'shape') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(scope, reason);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(scope, reason);
  }
}

function uniqueStrings(values, scope, reason) {
  if (
    !Array.isArray(values) ||
    values.some((value) => typeof value !== 'string' || value.trim() !== value || value === '') ||
    new Set(values).size !== values.length
  ) {
    fail(scope, reason);
  }
}

function snapshotBytes(projectRoot, record) {
  const stored = readFileSync(path.join(projectRoot, record.snapshotPath));
  if (record.encoding === 'identity') return stored;
  if (record.encoding === 'base64') return Buffer.from(stored.toString('utf8').trim(), 'base64');
  fail('guidance-baseline', 'snapshot-encoding');
}

export function digestJson(value) {
  return sha256(`${JSON.stringify(stable(value))}\n`);
}

export function assertFrozenGuidanceBaseline({ projectRoot, baseline, transcriptOverrides = {} }) {
  if (baseline?.schema !== 'aitm.guidance-legacy-baseline/v1') {
    fail('guidance-baseline', 'schema');
  }
  const closure = structuredClone(baseline);
  delete closure.generationSha256;
  if (sha256(`${JSON.stringify(closure)}\n`) !== baseline.generationSha256) {
    fail('guidance-baseline', 'generation-digest');
  }
  if (baseline.completion?.candidateWorkStarted !== false) {
    fail('guidance-baseline', 'candidate-boundary');
  }

  for (const input of baseline.inputs ?? []) {
    const content = snapshotBytes(projectRoot, input);
    if (content.length !== input.bytes || sha256(content) !== input.sha256) {
      fail('guidance-baseline', 'input-digest');
    }
  }

  const adapters = (baseline.adapters ?? []).map(({ id }) => id).sort();
  if (JSON.stringify(adapters) !== JSON.stringify(ADAPTERS)) fail('guidance-baseline', 'adapters');
  let transcriptEntriesVerified = 0;
  for (const adapter of baseline.adapters) {
    for (const loaded of adapter.loadedText ?? []) {
      const content = snapshotBytes(projectRoot, loaded);
      if (
        content.length !== loaded.bytes ||
        content.toString('utf8').length !== loaded.characters ||
        Math.ceil(loaded.characters / 4) !== loaded.proxyTokens ||
        sha256(content) !== loaded.sha256
      ) {
        fail('guidance-baseline', 'loaded-text-digest');
      }
    }
    const transcriptPath = path.join(projectRoot, adapter.transcriptPath);
    const overridden = Object.hasOwn(transcriptOverrides, adapter.transcriptPath);
    const transcript = overridden
      ? transcriptOverrides[adapter.transcriptPath]
      : JSON.parse(readFileSync(transcriptPath, 'utf8'));
    if (!overridden && sha256(readFileSync(transcriptPath)) !== adapter.transcriptSha256) {
      fail('guidance-baseline', 'transcript-digest');
    }
    if (
      transcript.schema !== 'aitm.guidance-legacy-transcript/v1' ||
      transcript.adapter !== adapter.id ||
      transcript.sourceCommit !== baseline.source.commit
    ) {
      fail('guidance-baseline', 'transcript-identity');
    }
    const lanes = new Set();
    for (const entry of transcript.entries ?? []) {
      lanes.add(`${entry.action}:${entry.outcome}`);
      if (!ACTIONS.includes(entry.action) || !['success', 'refusal'].includes(entry.outcome)) {
        fail('guidance-baseline', 'transcript-lane');
      }
      if (!Array.isArray(entry.physicalRequests) || entry.physicalRequests.length === 0) {
        fail('guidance-baseline', 'transport-evidence');
      }
      if ((entry.stdout?.length ?? 0) + (entry.stderr?.length ?? 0) === 0) {
        fail('guidance-baseline', 'uncaptured-output');
      }
      if (
        entry.outcome === 'success' &&
        (!Array.isArray(entry.effects) || entry.effects.length === 0)
      ) {
        fail('guidance-baseline', 'bypass-derived-success');
      }
      if (entry.outcome === 'refusal' && entry.effects?.length !== 0) {
        fail('guidance-baseline', 'refusal-effect');
      }
      transcriptEntriesVerified += 1;
    }
    for (const action of ACTIONS) {
      if (!lanes.has(`${action}:success`) || !lanes.has(`${action}:refusal`)) {
        fail('guidance-baseline', 'transcript-coverage');
      }
    }
  }

  return {
    actions: ACTIONS,
    adapters,
    candidateWorkStarted: baseline.completion.candidateWorkStarted,
    inputsVerified: baseline.inputs.length,
    transcriptEntriesVerified,
  };
}

export function assertSpecClauseIndex({ index, specPath, specText }) {
  const scope = 'clause-index';
  if (index?.schema !== 'aitm.guidance-spec-clause-index/v1') fail(scope, 'schema');
  exactKeys(index, ['clauses', 'closure', 'schema', 'source'], scope);
  exactKeys(index.source, ['commit', 'path', 'sha256'], scope, 'source-shape');
  exactKeys(index.closure, ['clauseCount', 'clauseIdsSha256'], scope, 'closure');
  if (index.source.path !== specPath) fail(scope, 'source-path');
  if (!/^[0-9a-f]{40}$/.test(index.source.commit)) fail(scope, 'source-commit');
  if (index.source.sha256 !== sha256(specText)) fail(scope, 'source-digest');
  if (!Array.isArray(index.clauses) || index.clauses.length === 0) fail(scope, 'clauses');

  const ids = [];
  const sections = new Set();
  const groups = new Set();
  for (const clause of index.clauses) {
    exactKeys(
      clause,
      ['group', 'id', 'requirement', 'section', 'sourceSha256'],
      scope,
      'clause-shape'
    );
    if (typeof clause.id !== 'string' || !/^clause\.[a-z0-9.-]+$/.test(clause.id)) {
      fail(scope, 'clause-id');
    }
    if (ids.includes(clause.id)) fail(scope, 'clause-id');
    ids.push(clause.id);
    if (!SECTIONS.includes(clause.section)) fail(scope, 'section');
    if (!GROUPS.includes(clause.group)) fail(scope, 'group');
    if (clause.sourceSha256 !== index.source.sha256) fail(scope, 'clause-source-digest');
    if (
      typeof clause.requirement !== 'string' ||
      clause.requirement.trim() !== clause.requirement
    ) {
      fail(scope, 'requirement');
    }
    sections.add(clause.section);
    groups.add(clause.group);
  }
  if (
    index.closure.clauseCount !== ids.length ||
    index.closure.clauseIdsSha256 !== sha256(`${ids.join('\n')}\n`)
  ) {
    fail(scope, 'closure');
  }
  return {
    clauseCount: ids.length,
    sections: SECTIONS.filter((section) => sections.has(section)),
    groups: GROUPS.filter((group) => groups.has(group)),
  };
}

export function assertOracleTraceability({ index, traceability, requireAllExecuted = false }) {
  const scope = 'oracle-traceability';
  if (traceability?.schema !== 'aitm.guidance-oracle-traceability/v1') fail(scope, 'schema');
  exactKeys(
    traceability,
    [
      'assertions',
      'baselineGenerationSha256',
      'clauseIndexSha256',
      'fixtures',
      'mappings',
      'schema',
    ],
    scope
  );
  if (traceability.clauseIndexSha256 !== digestJson(index)) fail(scope, 'clause-index-digest');
  if (!/^sha256:[0-9a-f]{64}$/.test(traceability.baselineGenerationSha256)) {
    fail(scope, 'baseline-digest');
  }
  exactKeys(traceability.assertions, ['executed', 'registered'], scope, 'assertion-registry');
  exactKeys(traceability.fixtures, ['observed', 'registered'], scope, 'fixture-registry');
  uniqueStrings(traceability.assertions.registered, scope, 'assertion-registry');
  uniqueStrings(traceability.assertions.executed, scope, 'assertion-registry');
  uniqueStrings(traceability.fixtures.registered, scope, 'fixture-registry');
  uniqueStrings(traceability.fixtures.observed, scope, 'fixture-registry');
  const assertions = new Set(traceability.assertions.registered);
  const executedAssertions = new Set(traceability.assertions.executed);
  const fixtures = new Set(traceability.fixtures.registered);
  const observedFixtures = new Set(traceability.fixtures.observed);
  if ([...executedAssertions].some((id) => !assertions.has(id))) fail(scope, 'unknown-assertion');
  if ([...observedFixtures].some((id) => !fixtures.has(id))) fail(scope, 'unknown-fixture');

  const clauseIds = index.clauses.map(({ id }) => id);
  const mappingIds = [];
  let executedCount = 0;
  let pendingCount = 0;
  for (const mapping of traceability.mappings ?? []) {
    exactKeys(
      mapping,
      [
        'adversarialFixtureId',
        'assertionId',
        'clauseId',
        'executionStatus',
        'expectedOutcome',
        'fieldChecks',
        'positiveFixtureId',
      ],
      scope,
      'mapping-shape'
    );
    if (mappingIds.includes(mapping.clauseId)) fail(scope, 'duplicate-clause');
    mappingIds.push(mapping.clauseId);
    if (!assertions.has(mapping.assertionId)) fail(scope, 'unknown-assertion');
    if (!fixtures.has(mapping.positiveFixtureId) || !fixtures.has(mapping.adversarialFixtureId)) {
      fail(scope, 'unknown-fixture');
    }
    if (mapping.expectedOutcome !== 'accept-positive-reject-adversarial') {
      fail(scope, 'expected-outcome');
    }
    uniqueStrings(mapping.fieldChecks, scope, 'field-checks');
    if (mapping.executionStatus === 'executed') {
      if (
        !executedAssertions.has(mapping.assertionId) ||
        !observedFixtures.has(mapping.positiveFixtureId) ||
        !observedFixtures.has(mapping.adversarialFixtureId)
      ) {
        fail(scope, 'unexecuted-identity');
      }
      executedCount += 1;
    } else if (mapping.executionStatus === 'pending-wbs-6') {
      if (requireAllExecuted) fail(scope, 'unexecuted-identity');
      pendingCount += 1;
    } else {
      fail(scope, 'execution-status');
    }
  }
  if (JSON.stringify(mappingIds.sort()) !== JSON.stringify([...clauseIds].sort())) {
    fail(scope, 'coverage');
  }
  return { mappingCount: mappingIds.length, executedCount, pendingCount };
}
