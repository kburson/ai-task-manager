// @chore
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import {
  applyFrozenRetirementGraduation,
  formatGraduationReport,
  parseGraduationArgs,
  planFrozenRetirementGraduation,
  runGraduationCommand,
} from '../../../maintenance/graduate-frozen-test-retirements.mjs';
import {
  FROZEN_RETIREMENT_ROOT,
  retirementReceiptPathForTestPath,
  TEMPORARY_RETIREMENT_EVIDENCE_ROOT,
  verifyActiveFrozenRetirementDelivery,
} from '../../lib/frozen-test-retirements.mjs';
import { mkdtempProjectIsolated } from '../../../task-tracker/lib/scratch-dir.mjs';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const GIT_TEST_IDENTITY = {
  GIT_AUTHOR_NAME: 'aitm-test',
  GIT_AUTHOR_EMAIL: 'aitm-test@example.com',
  GIT_COMMITTER_NAME: 'aitm-test',
  GIT_COMMITTER_EMAIL: 'aitm-test@example.com',
};

function writeFixture(projectRoot, repositoryPath, contents = 'fixture\n') {
  const absolutePath = path.join(projectRoot, repositoryPath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents);
  return absolutePath;
}

function retirement(name, overrides = {}) {
  const testPath = `scripts/tests/unit/articles/${name}.test.mjs`;
  return {
    receiptFile: `${FROZEN_RETIREMENT_ROOT}/unit/articles/${name}.test.mjs.json`,
    evidenceFile: `${TEMPORARY_RETIREMENT_EVIDENCE_ROOT}/extraction.md`,
    source: 'active',
    schema: 1,
    path: testPath,
    reason: 'Publishing moved to the private writing studio.',
    lastLiveSha256: DIGEST_A,
    evidence: `${TEMPORARY_RETIREMENT_EVIDENCE_ROOT}/extraction.md`,
    ...overrides,
  };
}

function authority(retirements = [], overrides = {}) {
  return {
    retirements,
    errors: [],
    misplacedReceipts: [],
    rootPresent: true,
    ...overrides,
  };
}

function createFiles(projectRoot, retirements) {
  for (const item of retirements) {
    writeFixture(projectRoot, item.receiptFile, '{}\n');
    writeFixture(projectRoot, item.evidenceFile, '# Evidence\n');
  }
}

function planWith(projectRoot, retirements, deliveryByPath = new Map(), overrides = {}) {
  return planFrozenRetirementGraduation({
    projectRoot,
    loadAuthority: () => authority(retirements),
    proveDelivery: ({ retirement: item }) =>
      deliveryByPath.get(item.path) || {
        eligible: true,
        deliveryCommit: `delivery-${item.path.split('/').at(-1)}`,
      },
    ...overrides,
  });
}

function git(projectRoot, args) {
  return execFileSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, ...GIT_TEST_IDENTITY },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function commitAll(projectRoot, message) {
  git(projectRoot, ['add', '--all', '--force']);
  git(projectRoot, ['commit', '--quiet', '--no-verify', '-m', message]);
  return git(projectRoot, ['rev-parse', 'HEAD']);
}

function pushTrunk(projectRoot) {
  git(projectRoot, ['push', '--quiet', 'origin', 'trunk']);
  git(projectRoot, ['fetch', '--quiet', 'origin', 'trunk']);
}

function createActiveHistory(prefix) {
  const projectRoot = mkdtempProjectIsolated(prefix);
  const originRoot = `${projectRoot}-origin.git`;
  mkdirSync(originRoot);
  git(originRoot, ['init', '--quiet', '--bare', '--initial-branch=trunk']);
  git(projectRoot, ['remote', 'add', 'origin', originRoot]);
  const testPath = 'scripts/tests/unit/articles/historical.test.mjs';
  const testContents = '// frozen test before retirement\n';
  writeFixture(projectRoot, testPath, testContents);
  commitAll(projectRoot, 'add frozen test');
  pushTrunk(projectRoot);
  const item = retirement('historical', {
    receiptFile: retirementReceiptPathForTestPath(testPath),
    path: testPath,
    evidenceFile: `${TEMPORARY_RETIREMENT_EVIDENCE_ROOT}/historical.md`,
    evidence: `${TEMPORARY_RETIREMENT_EVIDENCE_ROOT}/historical.md`,
    lastLiveSha256: createHash('sha256').update(testContents).digest('hex'),
  });
  return { projectRoot, item };
}

function addActiveRetirement({ projectRoot, item }) {
  rmSync(path.join(projectRoot, item.path));
  const receiptBody = {
    schema: item.schema,
    path: item.path,
    reason: item.reason,
    lastLiveSha256: item.lastLiveSha256,
    evidence: item.evidence,
  };
  writeFixture(projectRoot, item.receiptFile, `${JSON.stringify(receiptBody, null, 2)}\n`);
  writeFixture(projectRoot, item.evidenceFile, '# Historical evidence\n');
}

test('proves an active retirement delivery from canonical origin/trunk history', () => {
  const history = createActiveHistory('graduate-frozen-delivered-');
  addActiveRetirement(history);
  const deliveryCommit = commitAll(history.projectRoot, 'deliver active frozen retirement');
  pushTrunk(history.projectRoot);

  assert.deepEqual(
    verifyActiveFrozenRetirementDelivery({
      projectRoot: history.projectRoot,
      retirement: history.item,
    }),
    { eligible: true, deliveryCommit }
  );
});

test('keeps a feature-only active retirement pending canonical delivery', () => {
  const history = createActiveHistory('graduate-frozen-pending-');
  git(history.projectRoot, ['checkout', '--quiet', '-b', 'feature/retire']);
  addActiveRetirement(history);
  commitAll(history.projectRoot, 'retire only on feature branch');

  const proof = verifyActiveFrozenRetirementDelivery({
    projectRoot: history.projectRoot,
    retirement: history.item,
  });
  assert.equal(proof.eligible, false);
  assert.match(proof.reason, /not delivered in origin\/trunk/);
});

test('requires exactly one mode and accepts json with either mode', () => {
  assert.deepEqual(parseGraduationArgs(['--check']), { mode: 'check', json: false });
  assert.deepEqual(parseGraduationArgs(['--apply', '--json']), { mode: 'apply', json: true });
  for (const args of [[], ['--json'], ['--check', '--apply'], ['--check', '--wat']]) {
    assert.throws(() => parseGraduationArgs(args), /Usage:.*--check\|--apply/s);
  }
});

test('an absent receipt root is a successful deterministic no-op', () => {
  const projectRoot = mkdtempProjectIsolated('graduate-frozen-absent-');
  const plan = planFrozenRetirementGraduation({
    projectRoot,
    loadAuthority: () => authority([], { rootPresent: false }),
    proveDelivery: () => {
      throw new Error('delivery proof must not run');
    },
  });

  assert.deepEqual(plan, {
    schema: 1,
    eligibleCount: 0,
    pendingCount: 0,
    eligible: [],
    pending: [],
    evidenceToRemove: [],
  });
});

test('plans zero, one, and multiple eligible receipts in stable path order', () => {
  const projectRoot = mkdtempProjectIsolated('graduate-frozen-batches-');
  assert.equal(planWith(projectRoot, []).eligibleCount, 0);

  const zed = retirement('zed', { lastLiveSha256: DIGEST_B });
  const alpha = retirement('alpha');
  createFiles(projectRoot, [zed, alpha]);
  const plan = planWith(projectRoot, [zed, alpha]);

  assert.equal(plan.eligibleCount, 2);
  assert.deepEqual(
    plan.eligible.map(({ receiptFile }) => receiptFile),
    [alpha.receiptFile, zed.receiptFile]
  );
  assert.deepEqual(plan.evidenceToRemove, [alpha.evidenceFile]);
  const json = formatGraduationReport(plan, { mode: 'check', json: true });
  assert.equal(json, `${JSON.stringify({ mode: 'check', applied: false, ...plan }, null, 2)}\n`);
  const human = formatGraduationReport(plan, { mode: 'check', json: false });
  for (const value of [
    alpha.receiptFile,
    alpha.path,
    alpha.lastLiveSha256,
    alpha.evidenceFile,
    'delivery-alpha.test.mjs',
  ]) {
    assert.match(human, new RegExp(value.replaceAll('.', '\\.')));
  }
});

test('apply removes eligible receipts and removes shared evidence once', () => {
  const projectRoot = mkdtempProjectIsolated('graduate-frozen-apply-');
  const first = retirement('first');
  const second = retirement('second');
  createFiles(projectRoot, [first, second]);

  const plan = planWith(projectRoot, [first, second]);
  const applied = applyFrozenRetirementGraduation(plan, { projectRoot });

  assert.deepEqual(applied.removedReceipts, [first.receiptFile, second.receiptFile]);
  assert.deepEqual(applied.removedEvidence, [first.evidenceFile]);
  assert.equal(existsSync(path.join(projectRoot, first.receiptFile)), false);
  assert.equal(existsSync(path.join(projectRoot, second.receiptFile)), false);
  assert.equal(existsSync(path.join(projectRoot, first.evidenceFile)), false);
});

test('shared evidence remains while any referencing receipt is pending delivery', () => {
  const projectRoot = mkdtempProjectIsolated('graduate-frozen-shared-');
  const delivered = retirement('delivered');
  const pending = retirement('pending');
  createFiles(projectRoot, [delivered, pending]);
  const deliveryByPath = new Map([
    [pending.path, { eligible: false, reason: 'not delivered in origin/trunk' }],
  ]);

  const plan = planWith(projectRoot, [delivered, pending], deliveryByPath);
  assert.equal(plan.eligibleCount, 1);
  assert.equal(plan.pendingCount, 1);
  assert.deepEqual(plan.evidenceToRemove, []);
  applyFrozenRetirementGraduation(plan, { projectRoot });
  assert.equal(existsSync(path.join(projectRoot, delivered.receiptFile)), false);
  assert.equal(existsSync(path.join(projectRoot, pending.receiptFile)), true);
  assert.equal(existsSync(path.join(projectRoot, pending.evidenceFile)), true);
});

test('one invalid receipt aborts planning before any apply deletion', () => {
  const projectRoot = mkdtempProjectIsolated('graduate-frozen-invalid-');
  const valid = retirement('valid');
  createFiles(projectRoot, [valid]);

  assert.throws(
    () =>
      planFrozenRetirementGraduation({
        projectRoot,
        loadAuthority: () =>
          authority([valid], {
            errors: [{ receiptFile: 'bad.json', error: 'invalid receipt' }],
          }),
        proveDelivery: () => ({ eligible: true, deliveryCommit: 'delivery' }),
      }),
    /invalid receipt/
  );
  assert.equal(existsSync(path.join(projectRoot, valid.receiptFile)), true);
});

test('the complete batch validates before apply can remove its first receipt', () => {
  const projectRoot = mkdtempProjectIsolated('graduate-frozen-atomic-');
  const first = retirement('first');
  const second = retirement('second');
  createFiles(projectRoot, [first, second]);

  assert.throws(
    () =>
      planFrozenRetirementGraduation({
        projectRoot,
        loadAuthority: () => authority([first, second]),
        proveDelivery: ({ retirement: item }) => {
          if (item.path === second.path) throw new Error('canonical proof failed');
          return { eligible: true, deliveryCommit: 'delivery' };
        },
      }),
    /canonical proof failed/
  );
  assert.equal(existsSync(path.join(projectRoot, first.receiptFile)), true);
  assert.equal(existsSync(path.join(projectRoot, second.receiptFile)), true);
});

test('planning and applying reject deletion targets outside the two owned roots', () => {
  const projectRoot = mkdtempProjectIsolated('graduate-frozen-confined-');
  const unsafe = retirement('unsafe', { receiptFile: 'package.json' });
  assert.throws(() => planWith(projectRoot, [unsafe]), /outside retirement-owned roots/);

  const safe = retirement('safe');
  createFiles(projectRoot, [safe]);
  const plan = planWith(projectRoot, [safe]);
  plan.eligible[0].receiptFile = 'package.json';
  assert.throws(
    () => applyFrozenRetirementGraduation(plan, { projectRoot }),
    /outside retirement-owned roots/
  );
  assert.equal(existsSync(path.join(projectRoot, safe.receiptFile)), true);
});

test('--check reports without deletion and --apply returns the applied report', () => {
  const projectRoot = mkdtempProjectIsolated('graduate-frozen-command-');
  const item = retirement('command');
  createFiles(projectRoot, [item]);
  const output = [];
  const dependencies = {
    loadAuthority: () => authority([item]),
    proveDelivery: () => ({ eligible: true, deliveryCommit: 'canonical-delivery' }),
    writeOutput: (value) => output.push(value),
  };

  const checked = runGraduationCommand({
    argv: ['--check', '--json'],
    projectRoot,
    ...dependencies,
  });
  assert.equal(checked.applied, false);
  assert.equal(existsSync(path.join(projectRoot, item.receiptFile)), true);
  assert.deepEqual(JSON.parse(output.pop()), checked);

  const applied = runGraduationCommand({
    argv: ['--apply', '--json'],
    projectRoot,
    ...dependencies,
  });
  assert.equal(applied.applied, true);
  assert.equal(existsSync(path.join(projectRoot, item.receiptFile)), false);
  assert.deepEqual(applied.removedReceipts, [item.receiptFile]);
});

test('apply refuses a plan whose target disappeared after validation', () => {
  const projectRoot = mkdtempProjectIsolated('graduate-frozen-stale-');
  const item = retirement('stale');
  createFiles(projectRoot, [item]);
  const plan = planWith(projectRoot, [item]);
  writeFileSync(path.join(projectRoot, item.receiptFile), '{"changed":true}\n');

  assert.throws(
    () => applyFrozenRetirementGraduation(plan, { projectRoot }),
    /changed after validation/
  );
  assert.equal(
    readFileSync(path.join(projectRoot, item.receiptFile), 'utf8'),
    '{"changed":true}\n'
  );
});
