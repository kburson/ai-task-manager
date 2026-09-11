// @story #1591
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { mkdtempProjectIsolated } from '../../../task-tracker/lib/scratch-dir.mjs';
import {
  inventoryLegacyIndex,
  reconcileLegacyIndex,
  verifyLegacyIndexReconciliation,
} from '../../../review/lib/reconciliation.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const cliPath = path.join(repoRoot, 'scripts/review/reconcile-legacy-index.mjs');

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
  execFileSync('git', ['init', '--quiet'], { cwd: projectDir });
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

function testResidue(protocolId = 'sandbox') {
  return row(protocolId, {
    dir: `/repo/.scratch/test/aitm-co-review-${protocolId}/.scratch/review`,
    worktree: `/repo/.scratch/test/aitm-co-review-${protocolId}`,
    owner: 'author-agent',
    reviewer: 'reviewer-agent',
    artifact: 'docs/artifact.md',
  });
}

function reconciliationDeps(overrides = {}) {
  return {
    archiveEvidence: () => [],
    archiveSnapshot: () => [
      { path: 'docs/superpowers/reviews/accepted/README.md', sha256: `sha256:${'a'.repeat(64)}` },
    ],
    ...overrides,
  };
}

function journal(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function addProductionConsumers(projectDir) {
  const consumers = [
    ['scripts/task-tracker/lib/occupancy-lifecycle.mjs', '../../review/lib/index.mjs'],
    ['scripts/task-tracker/lib/command-surface/entrypoints.mjs', 'scripts/review/co-review.mjs'],
    ['scripts/lib/self-doc.mjs', 'scripts/review/co-review.mjs'],
  ];
  for (const [relative, marker] of consumers) {
    const file = path.join(projectDir, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `// ${marker}\n`);
  }
}

function runCli(files, ...args) {
  return spawnSync(
    process.execPath,
    [
      cliPath,
      '--project-dir',
      files.projectDir,
      '--index-file',
      files.indexFile,
      '--journal-file',
      files.journalFile,
      ...args,
    ],
    { cwd: repoRoot, encoding: 'utf8' }
  );
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

test('apply removes only proven stale active projections and preserves all other rows', (t) => {
  const terminal = row('terminal', { lifecycle: 'accepted' });
  const unresolved = row('unresolved');
  const files = fixture(t, { sandbox: testResidue(), terminal, unresolved });
  const result = reconcileLegacyIndex({ ...files, deps: reconciliationDeps() });
  const remaining = JSON.parse(readFileSync(files.indexFile, 'utf8'));

  assert.equal(result.status, 'applied');
  assert.deepEqual(result.removed, ['sandbox']);
  assert.deepEqual(result.blockers, ['unresolved']);
  assert.deepEqual(remaining, { terminal, unresolved });
});

test('apply records every removed row and its evidence before changing the index', (t) => {
  const files = fixture(t, { one: testResidue('one'), two: testResidue('two') });
  reconcileLegacyIndex({ ...files, deps: reconciliationDeps() });
  const records = journal(files.journalFile);

  assert.equal(records.length, 2);
  assert.equal(records[0].recordType, 'prepared');
  assert.deepEqual(
    records[0].model.removed.map(({ protocolId }) => protocolId),
    ['one', 'two']
  );
  assert.equal(records[0].model.removed[0].row.lifecycle, 'active');
  assert.equal(records[0].model.removed[0].evidence.pathPattern, 'isolated-test');
  assert.equal(records[1].recordType, 'applied');
  assert.equal(records[1].operationId, records[0].operationId);
});

test('archive paths and hashes are identical before and after apply', (t) => {
  const snapshot = [
    { path: 'docs/superpowers/reviews/42/spec/README.md', sha256: `sha256:${'b'.repeat(64)}` },
    { path: 'docs/superpowers/reviews/42/spec/review.md', sha256: `sha256:${'c'.repeat(64)}` },
  ];
  const files = fixture(t, { sandbox: testResidue() });
  const result = reconcileLegacyIndex({
    ...files,
    deps: reconciliationDeps({ archiveSnapshot: () => structuredClone(snapshot) }),
  });

  assert.deepEqual(result.archiveSnapshot, snapshot);
  assert.deepEqual(journal(files.journalFile)[0].model.archiveSnapshot, snapshot);
  assert.deepEqual(journal(files.journalFile)[1].archiveSnapshot, snapshot);
});

test('lock contention changes neither index nor journal', (t) => {
  const files = fixture(t, { sandbox: testResidue() });
  const before = readFileSync(files.indexFile, 'utf8');

  assert.throws(
    () =>
      reconcileLegacyIndex({
        ...files,
        deps: reconciliationDeps({
          withLock: () => {
            throw new Error('fleet-registry: lock timeout');
          },
        }),
      }),
    /lock timeout/
  );
  assert.equal(readFileSync(files.indexFile, 'utf8'), before);
  assert.equal(existsSync(files.journalFile), false);
});

test('retry after prepared journal interruption completes the original operation', (t) => {
  const files = fixture(t, { sandbox: testResidue() });
  const interrupted = reconciliationDeps({
    afterPrepared: () => {
      throw new Error('simulated prepared interruption');
    },
  });

  assert.throws(
    () => reconcileLegacyIndex({ ...files, deps: interrupted }),
    /prepared interruption/
  );
  assert.equal(journal(files.journalFile).length, 1);
  assert.ok(JSON.parse(readFileSync(files.indexFile, 'utf8')).sandbox);

  const result = reconcileLegacyIndex({ ...files, deps: reconciliationDeps() });
  assert.equal(result.status, 'recovered');
  assert.equal(journal(files.journalFile).length, 2);
  assert.equal(JSON.parse(readFileSync(files.indexFile, 'utf8')).sandbox, undefined);
});

test('retry after index rename records the missing applied line', (t) => {
  const files = fixture(t, { sandbox: testResidue() });
  const interrupted = reconciliationDeps({
    afterIndexWrite: () => {
      throw new Error('simulated post-rename interruption');
    },
  });

  assert.throws(() => reconcileLegacyIndex({ ...files, deps: interrupted }), /post-rename/);
  assert.equal(journal(files.journalFile).length, 1);
  assert.equal(JSON.parse(readFileSync(files.indexFile, 'utf8')).sandbox, undefined);

  const result = reconcileLegacyIndex({ ...files, deps: reconciliationDeps() });
  assert.equal(result.status, 'recovered');
  assert.equal(journal(files.journalFile).length, 2);
});

test('completed replay is idempotent and does not duplicate journal records', (t) => {
  const files = fixture(t, { sandbox: testResidue() });
  const first = reconcileLegacyIndex({ ...files, deps: reconciliationDeps() });
  const second = reconcileLegacyIndex({ ...files, deps: reconciliationDeps() });

  assert.equal(first.status, 'applied');
  assert.equal(second.status, 'unchanged');
  assert.equal(second.operationId, first.operationId);
  assert.equal(journal(files.journalFile).length, 2);
});

test('unexpected index drift during recovery fails closed', (t) => {
  const files = fixture(t, { sandbox: testResidue() });
  assert.throws(
    () =>
      reconcileLegacyIndex({
        ...files,
        deps: reconciliationDeps({
          afterPrepared: () => {
            throw new Error('simulated prepared interruption');
          },
        }),
      }),
    /prepared interruption/
  );
  writeFileSync(files.indexFile, `${JSON.stringify({ other: row('other') }, null, 2)}\n`);

  assert.throws(
    () => reconcileLegacyIndex({ ...files, deps: reconciliationDeps() }),
    /recovery index digest conflict/
  );
  assert.equal(journal(files.journalFile).length, 1);
});

test('CLI inspect prints deterministic counts without mutation', (t) => {
  const files = fixture(t, {
    sandbox: testResidue(),
    terminal: row('terminal', { lifecycle: 'accepted' }),
  });
  const result = runCli(files);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.mode, 'inspect');
  assert.equal(output.counts.total, 2);
  assert.equal(output.counts.remove, 1);
  assert.equal(existsSync(files.journalFile), false);
  assert.ok(JSON.parse(readFileSync(files.indexFile, 'utf8')).sandbox);
});

test('CLI apply prints the operation and before and after summaries', (t) => {
  const files = fixture(t, { sandbox: testResidue() });
  const result = runCli(files, '--apply');

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.mode, 'apply');
  assert.equal(output.status, 'applied');
  assert.equal(output.removedCount, 1);
  assert.equal(output.blockerCount, 0);
  assert.equal(output.archiveFiles, 0);
  assert.equal('removed' in output, false);
  assert.equal('archiveSnapshot' in output, false);
  assert.match(output.before, /^sha256:/);
  assert.match(output.after, /^sha256:/);
});

test('CLI verify refuses any remaining active row', (t) => {
  const files = fixture(t, { unresolved: row('unresolved') });
  const result = runCli(files, '--verify');

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /active legacy rows remain: unresolved/);
});

test('CLI verify validates the applied journal and reaches production consumer checks', (t) => {
  const files = fixture(t, { sandbox: testResidue() });
  addProductionConsumers(files.projectDir);
  assert.equal(runCli(files, '--apply').status, 0);
  const result = runCli(files, '--verify');

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.mode, 'verify');
  assert.equal(output.active, 0);
  assert.equal(output.migrationGuard, 'production-consumers');
  assert.match(output.operationId, /^sha256:/);
});

test('CLI rejects conflicting modes and unknown arguments', (t) => {
  const files = fixture(t, {});
  const conflicting = runCli(files, '--apply', '--verify');
  const unknown = runCli(files, '--unknown');

  assert.notEqual(conflicting.status, 0);
  assert.match(conflicting.stderr, /choose exactly one mode/);
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /unknown argument --unknown/);
});

assert.equal(typeof verifyLegacyIndexReconciliation, 'function');
