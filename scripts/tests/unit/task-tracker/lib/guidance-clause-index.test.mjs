// @story #1657
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertFrozenGuidanceBaseline,
  assertOracleTraceability,
  assertSpecClauseIndex,
  digestJson,
} from '../../../helpers/guidance-clause-index.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const fixtureRoot = path.join(projectRoot, 'scripts/tests/fixtures/1558');
const specPath = path.join(
  projectRoot,
  'docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md'
);

function json(name) {
  return JSON.parse(readFileSync(path.join(fixtureRoot, name), 'utf8'));
}

function clone(value) {
  return structuredClone(value);
}

test('frozen WBS 4 sources, runners, transport evidence and outputs remain closed', () => {
  const result = assertFrozenGuidanceBaseline({
    projectRoot,
    baseline: json('legacy-baseline.json'),
  });
  assert.deepEqual(result.actions, [
    'bind',
    'resume',
    'promote',
    'test',
    'review',
    'deliver',
    'close',
  ]);
  assert.deepEqual(result.adapters, ['claude', 'codex']);
  assert.equal(result.candidateWorkStarted, false);
  assert.equal(result.inputsVerified > 10, true);
  assert.equal(result.transcriptEntriesVerified, 28);
});

test('clause index is independently pinned to the spec and decomposes every required group', () => {
  const index = json('spec-clause-index.json');
  const result = assertSpecClauseIndex({
    index,
    specPath: path.relative(projectRoot, specPath),
    specText: readFileSync(specPath, 'utf8'),
  });

  assert.equal(result.clauseCount >= 45, true, 'normative groups must be individually testable');
  assert.deepEqual(result.sections, ['13.2', '14.1', '15.2', '15.5', '17.1', '17.2']);
  assert.deepEqual(result.groups, [
    'evidence-and-normalization',
    'presentation-shape',
    'typed-causes-and-dispositions',
    'warnings',
    'human-decisions',
    'navigation-and-cross-issue',
    'guidance-and-receipts',
    'diagnostics',
    'project-override',
  ]);
  assert.match(index.source.commit, /^[0-9a-f]{40}$/);
  assert.match(index.source.sha256, /^sha256:[0-9a-f]{64}$/);
  assert.equal(
    index.clauses.every(({ requirement }) => requirement.length >= 24),
    true
  );
});

test('traceability names every clause without claiming the pending WBS 6 executions passed', () => {
  const index = json('spec-clause-index.json');
  const traceability = json('oracle-traceability.json');
  const result = assertOracleTraceability({ index, traceability });

  assert.equal(result.mappingCount, index.clauses.length);
  assert.equal(result.executedCount > 0, true, 'WBS 5 integrity probes must execute');
  assert.equal(result.pendingCount > 0, true, 'complete semantic execution belongs to WBS 6');
  assert.equal(traceability.clauseIndexSha256, digestJson(index));
  assert.throws(
    () => assertOracleTraceability({ index, traceability, requireAllExecuted: true }),
    /oracle-traceability:unexecuted-identity/
  );
});

test('index validation rejects missing and duplicate clauses and stale source digests', () => {
  const index = json('spec-clause-index.json');
  const specText = readFileSync(specPath, 'utf8');
  const args = { specPath: path.relative(projectRoot, specPath), specText };

  const missing = clone(index);
  missing.clauses.pop();
  assert.throws(() => assertSpecClauseIndex({ index: missing, ...args }), /clause-index:closure/);

  const duplicate = clone(index);
  duplicate.clauses.push(clone(duplicate.clauses[0]));
  assert.throws(
    () => assertSpecClauseIndex({ index: duplicate, ...args }),
    /clause-index:clause-id/
  );

  const stale = clone(index);
  stale.source.sha256 = `sha256:${'0'.repeat(64)}`;
  assert.throws(
    () => assertSpecClauseIndex({ index: stale, ...args }),
    /clause-index:source-digest/
  );
});

test('traceability rejects unknown or unexecuted assertion and fixture identities', () => {
  const index = json('spec-clause-index.json');
  const traceability = json('oracle-traceability.json');

  for (const [mutate, expected] of [
    [
      (value) => {
        value.mappings[0].assertionId = 'assertion.unknown';
      },
      /oracle-traceability:unknown-assertion/,
    ],
    [
      (value) => {
        value.mappings[0].positiveFixtureId = 'fixture.unknown';
      },
      /oracle-traceability:unknown-fixture/,
    ],
    [
      (value) => {
        const id = value.mappings.find(
          ({ executionStatus }) => executionStatus === 'executed'
        ).assertionId;
        value.assertions.executed = value.assertions.executed.filter((entry) => entry !== id);
      },
      /oracle-traceability:unexecuted-identity/,
    ],
  ]) {
    const candidate = clone(traceability);
    mutate(candidate);
    assert.throws(() => assertOracleTraceability({ index, traceability: candidate }), expected);
  }
});

test('baseline integrity refuses bypass-derived success, missing transport and uncaptured output', () => {
  const baseline = json('legacy-baseline.json');
  const transcriptPath = baseline.adapters[0].transcriptPath;
  const transcript = JSON.parse(readFileSync(path.join(projectRoot, transcriptPath), 'utf8'));

  for (const [mutate, expected] of [
    [
      (value) => {
        const entry = value.entries.find(({ outcome }) => outcome === 'success');
        entry.effects = [];
      },
      /guidance-baseline:bypass-derived-success/,
    ],
    [
      (value) => {
        value.entries[0].physicalRequests = [];
      },
      /guidance-baseline:transport-evidence/,
    ],
    [
      (value) => {
        value.entries[0].stdout = '';
        value.entries[0].stderr = '';
      },
      /guidance-baseline:uncaptured-output/,
    ],
  ]) {
    const candidate = clone(transcript);
    mutate(candidate);
    assert.throws(
      () =>
        assertFrozenGuidanceBaseline({
          projectRoot,
          baseline,
          transcriptOverrides: { [transcriptPath]: candidate },
        }),
      expected
    );
  }
});
