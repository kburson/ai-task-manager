// @story #1591
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { mkdtempProjectIsolated } from '../../../task-tracker/lib/scratch-dir.mjs';
import {
  inventoryLegacyIndex,
  reconcileLegacyIndex,
  verifyLegacyIndexReconciliation,
} from '../../../review/lib/reconciliation.mjs';

function row(protocolId, overrides = {}) {
  return {
    protocolId,
    dir: `/missing/${protocolId}/runtime`,
    worktree: `/missing/${protocolId}`,
    owner: 'codex',
    reviewer: 'claude',
    lifecycle: 'active',
    artifact: `docs/${protocolId}.md`,
    pendingReviewPath: null,
    claimedRole: null,
    claimedProvider: null,
    claimedSid: null,
    ...overrides,
  };
}

function fixture(t, rows) {
  const projectDir = mkdtempProjectIsolated('aitm-index-reconciliation-');
  t.after(() => rmSync(projectDir, { recursive: true, force: true }));
  const indexFile = path.join(projectDir, '.tmp/aitm/fleet/co-review-index.json');
  const journalFile = path.join(projectDir, '.tmp/aitm/fleet/co-review-index-reconciliation.jsonl');
  mkdirSync(path.dirname(indexFile), { recursive: true });
  writeFileSync(indexFile, `${JSON.stringify(rows, null, 2)}\n`);
  return { projectDir, indexFile, journalFile };
}

function inventory(t, rows, deps = {}) {
  const files = fixture(t, rows);
  return {
    ...files,
    result: inventoryLegacyIndex({
      ...files,
      deps: { archiveSnapshot: () => [], ...deps },
    }),
  };
}

test('inventory accounts for every row in deterministic protocol order', (t) => {
  const rows = {
    zeta: row('zeta', { lifecycle: 'accepted' }),
    alpha: row('alpha'),
  };
  const { result } = inventory(t, rows, { archiveEvidence: () => [] });

  assert.deepEqual(
    result.rows.map(({ protocolId }) => protocolId),
    ['alpha', 'zeta']
  );
  assert.equal(result.rows.length, Object.keys(rows).length);
  assert.deepEqual(result.counts, {
    total: 2,
    remove: 0,
    active: 1,
    unresolved: 1,
    byDisposition: { 'retain-terminal': 1, 'retain-unresolved': 1 },
  });
});

test('missing paths alone remain unresolved', (t) => {
  const { result } = inventory(t, { missing: row('missing') }, { archiveEvidence: () => [] });
  const observed = result.rows[0];

  assert.equal(observed.sourceCategory, 'missing-runtime');
  assert.equal(observed.runtimeExists, false);
  assert.equal(observed.worktreeExists, false);
  assert.equal(observed.disposition, 'retain-unresolved');
  assert.match(observed.reason, /missing paths are not authority/);
});

test('recognized isolated test residue is removable only with fixture identities', (t) => {
  const sandbox = row('sandbox', {
    dir: '/repo/.scratch/test/aitm-co-review-AbC123/.scratch/review',
    worktree: '/repo/.scratch/test/aitm-co-review-AbC123',
    owner: 'author-agent',
    reviewer: 'reviewer-agent',
    artifact: 'docs/artifact.md',
  });
  const ambiguous = row('ambiguous', {
    ...sandbox,
    protocolId: 'ambiguous',
    owner: 'codex',
  });
  const { result } = inventory(t, { sandbox, ambiguous }, { archiveEvidence: () => [] });
  const byId = Object.fromEntries(result.rows.map((entry) => [entry.protocolId, entry]));

  assert.equal(byId.sandbox.sourceCategory, 'test-sandbox');
  assert.equal(byId.sandbox.disposition, 'remove-test-residue');
  assert.equal(byId.ambiguous.disposition, 'retain-unresolved');
});

test('task-test scratch roots are recognized as test residue', (t) => {
  const sandbox = row('task-test', {
    dir: '/repo/.scratch/.task-test-1481-abcd/.scratch/test/aitm-co-review-AbC123/runtime',
    worktree: '/repo/.scratch/.task-test-1481-abcd/.scratch/test/aitm-co-review-AbC123',
    owner: 'owner-agent',
    reviewer: 'reviewer-agent',
    artifact: 'docs/artifact.md',
  });
  const { result } = inventory(t, { 'task-test': sandbox }, { archiveEvidence: () => [] });

  assert.equal(result.rows[0].disposition, 'remove-test-residue');
});

test('the owner provenance inspection probe is removable only with every probe signal', (t) => {
  const probe = row('probe', {
    dir: '/repo/.worktrees/1406/.tmp/inspect/1406-owner-provenance-AbC123/runtime',
    worktree: '/repo/.worktrees/1406',
    owner: 'owner-probe',
    reviewer: 'reviewer-probe',
    artifact: 'docs/superpowers/specs/probe.md',
  });
  const nearMiss = row('near-miss', { ...probe, protocolId: 'near-miss', reviewer: 'claude' });
  const { result } = inventory(t, { probe, 'near-miss': nearMiss }, { archiveEvidence: () => [] });
  const byId = Object.fromEntries(result.rows.map((entry) => [entry.protocolId, entry]));

  assert.equal(byId.probe.disposition, 'remove-inspection-probe');
  assert.equal(byId['near-miss'].disposition, 'retain-unresolved');
});

test('an integrity-valid active runtime always remains live', (t) => {
  const live = row('live', {
    dir: '/repo/live/runtime',
    worktree: '/repo/live',
    owner: 'author-agent',
    reviewer: 'reviewer-agent',
    artifact: 'docs/artifact.md',
  });
  const { result } = inventory(
    t,
    { live },
    {
      existsSync: () => true,
      archiveEvidence: () => [],
      statusProtocol: () => ({ protocolId: 'live', lifecycle: 'active', integrity: { ok: true } }),
    }
  );

  assert.equal(result.rows[0].sourceCategory, 'live-runtime');
  assert.equal(result.rows[0].disposition, 'retain-live');
});

test('a missing historical runtime is removable only when a valid archive supersedes its exact artifact', (t) => {
  const historical = row('historical', { artifact: 'docs/superpowers/specs/accepted.md' });
  const evidence = {
    archivePath: 'docs/superpowers/reviews/42/spec/README.md',
    protocolId: 'accepted-protocol',
    artifactPath: historical.artifact,
    acceptedAt: '2026-09-11T00:00:00.000Z',
    acceptedCommit: 'a'.repeat(40),
    gitBlob: 'b'.repeat(40),
    sha256: `sha256:${'c'.repeat(64)}`,
  };
  const { result } = inventory(t, { historical }, { archiveEvidence: () => [evidence] });

  assert.equal(result.rows[0].sourceCategory, 'historical-worktree');
  assert.equal(result.rows[0].disposition, 'remove-superseded-attempt');
  assert.deepEqual(result.rows[0].evidence.archive, evidence);
});

test('invalid or mismatched archive evidence remains unresolved', (t) => {
  const historical = row('historical', { artifact: 'docs/superpowers/specs/accepted.md' });
  const { result } = inventory(
    t,
    { historical },
    {
      archiveEvidence: () => [
        {
          protocolId: 'accepted-protocol',
          artifactPath: 'docs/superpowers/specs/another.md',
        },
      ],
    }
  );

  assert.equal(result.rows[0].disposition, 'retain-unresolved');
});

// Task 2 and Task 3 imports are exercised in later TDD slices.
assert.equal(typeof reconcileLegacyIndex, 'function');
assert.equal(typeof verifyLegacyIndexReconciliation, 'function');
