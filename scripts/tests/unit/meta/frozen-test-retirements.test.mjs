// @chore
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

import {
  FROZEN_RETIREMENT_ROOT,
  hydrateHistoricalFrozenRetirement,
  loadActiveFrozenRetirements,
  loadFrozenRetirements,
  retirementReceiptPathForTestPath,
  TEMPORARY_RETIREMENT_EVIDENCE_ROOT,
} from '../../lib/frozen-test-retirements.mjs';
import { mkdtempProjectIsolated } from '../../../task-tracker/lib/scratch-dir.mjs';

const SHA256 = 'a'.repeat(64);
const GIT_TEST_IDENTITY = {
  GIT_AUTHOR_NAME: 'aitm-test',
  GIT_AUTHOR_EMAIL: 'aitm-test@example.com',
  GIT_COMMITTER_NAME: 'aitm-test',
  GIT_COMMITTER_EMAIL: 'aitm-test@example.com',
};

function writeFixture(projectRoot, repositoryPath, value) {
  const absolutePath = path.join(projectRoot, repositoryPath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(
    absolutePath,
    typeof value === 'string' || Buffer.isBuffer(value)
      ? value
      : `${JSON.stringify(value, null, 2)}\n`
  );
}

function receiptFor(testPath, overrides = {}) {
  return {
    schema: 1,
    path: testPath,
    reason: 'The extracted subsystem no longer belongs to this package.',
    lastLiveSha256: SHA256,
    evidence: `${TEMPORARY_RETIREMENT_EVIDENCE_ROOT}/2026-08-25-extraction.md`,
    ...overrides,
  };
}

function load(
  projectRoot,
  { finalizedFrozenPaths = [], postSnapshotRecordPaths = [], liveDiscoveredPaths = [] } = {}
) {
  return loadActiveFrozenRetirements({
    projectRoot,
    finalizedFrozenPaths,
    postSnapshotRecordPaths,
    liveDiscoveredPaths,
  });
}

function writeReceipt(projectRoot, testPath, receipt = receiptFor(testPath), receiptFile) {
  const file = receiptFile || retirementReceiptPathForTestPath(testPath);
  writeFixture(projectRoot, file, receipt);
  return file;
}

function writeEvidence(projectRoot, evidence) {
  writeFixture(projectRoot, evidence, '# Temporary retirement evidence\n');
}

function rawGit(projectRoot, args) {
  return execFileSync('git', args, {
    cwd: projectRoot,
    encoding: 'buffer',
    env: { ...process.env, ...GIT_TEST_IDENTITY },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function git(projectRoot, args) {
  return rawGit(projectRoot, args).toString('utf8').trim();
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

function createHistoryRepository(prefix, testContents = '// frozen test before retirement\n') {
  const projectRoot = mkdtempProjectIsolated(prefix);
  const originRoot = `${projectRoot}-origin.git`;
  mkdirSync(originRoot);
  git(originRoot, ['init', '--quiet', '--bare', '--initial-branch=trunk']);
  git(projectRoot, ['remote', 'add', 'origin', originRoot]);

  const testPath = 'scripts/tests/unit/articles/historical.test.mjs';
  writeFixture(projectRoot, testPath, testContents);
  commitAll(projectRoot, 'add frozen test');
  pushTrunk(projectRoot);

  return {
    projectRoot,
    originRoot,
    testContents,
    testPath,
    receiptFile: retirementReceiptPathForTestPath(testPath),
    evidenceFile: `${TEMPORARY_RETIREMENT_EVIDENCE_ROOT}/historical.md`,
    digest: createHash('sha256').update(testContents).digest('hex'),
  };
}

function addRetirementTree(history, overrides = {}, { evidence = true } = {}) {
  rmSync(path.join(history.projectRoot, history.testPath));
  const receipt = receiptFor(history.testPath, {
    lastLiveSha256: history.digest,
    evidence: history.evidenceFile,
    ...overrides,
  });
  writeReceipt(history.projectRoot, history.testPath, receipt);
  if (evidence) writeEvidence(history.projectRoot, receipt.evidence);
  return receipt;
}

function graduateRetirement(history, { removeEvidence = true } = {}) {
  rmSync(path.join(history.projectRoot, history.receiptFile));
  if (removeEvidence && existsSync(path.join(history.projectRoot, history.evidenceFile))) {
    rmSync(path.join(history.projectRoot, history.evidenceFile));
  }
  const commit = commitAll(history.projectRoot, 'graduate frozen retirement receipt');
  pushTrunk(history.projectRoot);
  return commit;
}

function hydrate(history, overrides = {}) {
  return hydrateHistoricalFrozenRetirement({
    projectRoot: history.projectRoot,
    testPath: history.testPath,
    receiptFile: history.receiptFile,
    ...overrides,
  });
}

function assertHistoricalRetirement(retirement, history, receipt) {
  assert.deepEqual(retirement, {
    receiptFile: history.receiptFile,
    evidenceFile: history.evidenceFile,
    source: 'historical',
    ...receipt,
  });
}

function removeLooseObject(projectRoot, objectId) {
  const looseObject = path.join(
    projectRoot,
    '.git',
    'objects',
    objectId.slice(0, 2),
    objectId.slice(2)
  );
  assert.equal(existsSync(looseObject), true);
  rmSync(looseObject);
}

test('maps canonical frozen test paths to deterministic retirement receipts', () => {
  assert.equal(
    retirementReceiptPathForTestPath('scripts/tests/unit/articles/publish-articles.test.mjs'),
    'scripts/tests/fixtures/test-corpus-frozen-retirements/unit/articles/publish-articles.test.mjs.json'
  );
  assert.throws(
    () => retirementReceiptPathForTestPath('scripts/tests/unit/articles/../publish.test.mjs'),
    /noncanonical test path/
  );
  assert.throws(
    () => retirementReceiptPathForTestPath('scripts/gh/not-a-test.test.mjs'),
    /noncanonical test path/
  );
});

test('loads one complete frozen receipt from its deterministic location', () => {
  const projectRoot = mkdtempProjectIsolated('frozen-retirements-valid-');
  const testPath = 'scripts/tests/unit/articles/publish-articles.test.mjs';
  const receipt = receiptFor(testPath);
  const receiptFile = writeReceipt(projectRoot, testPath, receipt);
  writeEvidence(projectRoot, receipt.evidence);

  assert.deepEqual(load(projectRoot, { finalizedFrozenPaths: [testPath] }), {
    retirements: [
      {
        receiptFile,
        evidenceFile: receipt.evidence,
        source: 'active',
        ...receipt,
      },
    ],
    errors: [],
    misplacedReceipts: [],
    rootPresent: true,
  });
});

test('accepts only exact receipt keys, schema, digest, and a non-empty sentence reason', () => {
  const projectRoot = mkdtempProjectIsolated('frozen-retirements-schema-');
  const frozenPaths = [
    'scripts/tests/unit/articles/extra.test.mjs',
    'scripts/tests/unit/articles/missing.test.mjs',
    'scripts/tests/unit/articles/schema.test.mjs',
    'scripts/tests/unit/articles/digest.test.mjs',
    'scripts/tests/unit/articles/reason.test.mjs',
    'scripts/tests/unit/articles/fragment.test.mjs',
  ];
  const extraPath = frozenPaths[0];
  const missingPath = frozenPaths[1];
  const schemaPath = frozenPaths[2];
  const digestPath = frozenPaths[3];
  const reasonPath = frozenPaths[4];
  const fragmentPath = frozenPaths[5];
  const receipts = [
    receiptFor(extraPath, { extra: true }),
    (() => {
      const { evidence, ...missingEvidence } = receiptFor(missingPath);
      return missingEvidence;
    })(),
    receiptFor(schemaPath, { schema: '1' }),
    receiptFor(digestPath, { lastLiveSha256: 'A'.repeat(64) }),
    receiptFor(reasonPath, { reason: '   ' }),
    receiptFor(fragmentPath, {
      reason: 'The extracted subsystem no longer belongs to this package',
    }),
  ];
  for (const receipt of receipts) {
    writeReceipt(projectRoot, receipt.path, receipt);
  }
  writeEvidence(projectRoot, receiptFor(extraPath).evidence);

  const loaded = load(projectRoot, { finalizedFrozenPaths: frozenPaths });
  assert.deepEqual(loaded.retirements, []);
  assert.deepEqual(
    loaded.errors.map(({ receiptFile }) => receiptFile),
    frozenPaths.map(retirementReceiptPathForTestPath).sort()
  );
  assert.match(
    loaded.errors.find(({ receiptFile }) => receiptFile.includes('extra.')).error,
    /keys/
  );
  assert.match(
    loaded.errors.find(({ receiptFile }) => receiptFile.includes('missing.')).error,
    /keys/
  );
  assert.match(
    loaded.errors.find(({ receiptFile }) => receiptFile.includes('schema.')).error,
    /schema/
  );
  assert.match(
    loaded.errors.find(({ receiptFile }) => receiptFile.includes('digest.')).error,
    /SHA-256/
  );
  assert.match(
    loaded.errors.find(({ receiptFile }) => receiptFile.includes('reason.')).error,
    /reason/
  );
  assert.match(
    loaded.errors.find(({ receiptFile }) => receiptFile.includes('fragment.')).error,
    /reason/
  );
});

test('reports malformed JSON and continues loading later valid receipts', () => {
  const projectRoot = mkdtempProjectIsolated('frozen-retirements-json-');
  const badPath = 'scripts/tests/unit/articles/bad-json.test.mjs';
  const validPath = 'scripts/tests/unit/articles/valid.test.mjs';
  writeFixture(projectRoot, retirementReceiptPathForTestPath(badPath), '{ invalid json\n');
  const validReceipt = receiptFor(validPath);
  writeReceipt(projectRoot, validPath, validReceipt);
  writeEvidence(projectRoot, validReceipt.evidence);

  const loaded = load(projectRoot, { finalizedFrozenPaths: [badPath, validPath] });
  assert.deepEqual(
    loaded.retirements.map(({ path: testPath }) => testPath),
    [validPath]
  );
  assert.equal(loaded.errors.length, 1);
  assert.match(loaded.errors[0].error, /invalid JSON/);
});

test('reports malformed field types without stopping the scan', () => {
  const projectRoot = mkdtempProjectIsolated('frozen-retirements-field-type-');
  const validPath = 'scripts/tests/unit/articles/type-valid.test.mjs';
  const malformedFile = `${FROZEN_RETIREMENT_ROOT}/unit/articles/type-invalid.test.mjs.json`;
  writeFixture(projectRoot, malformedFile, receiptFor(validPath, { path: 7 }));
  const validReceipt = receiptFor(validPath);
  writeReceipt(projectRoot, validPath, validReceipt);
  writeEvidence(projectRoot, validReceipt.evidence);

  const loaded = load(projectRoot, { finalizedFrozenPaths: [validPath] });
  assert.deepEqual(
    loaded.retirements.map(({ path: testPath }) => testPath),
    [validPath]
  );
  assert.deepEqual(
    loaded.errors.map(({ receiptFile }) => receiptFile),
    [malformedFile]
  );
  assert.match(loaded.errors[0].error, /noncanonical test path/);
});

test('rejects non-frozen paths and post-snapshot overlap', () => {
  const projectRoot = mkdtempProjectIsolated('frozen-retirements-membership-');
  const nonFrozenPath = 'scripts/tests/unit/articles/non-frozen.test.mjs';
  const overlapPath = 'scripts/tests/unit/articles/post-snapshot.test.mjs';
  for (const testPath of [nonFrozenPath, overlapPath]) {
    const receipt = receiptFor(testPath);
    writeReceipt(projectRoot, testPath, receipt);
    writeEvidence(projectRoot, receipt.evidence);
  }

  const loaded = load(projectRoot, {
    finalizedFrozenPaths: [overlapPath],
    postSnapshotRecordPaths: [overlapPath],
  });
  assert.deepEqual(loaded.retirements, []);
  assert.match(
    loaded.errors.find(({ receiptFile }) => receiptFile.includes('non-frozen.')).error,
    /not a finalized frozen path/
  );
  assert.match(
    loaded.errors.find(({ receiptFile }) => receiptFile.includes('post-snapshot.')).error,
    /post-snapshot/
  );
});

test('rejects missing and escaping evidence paths', () => {
  const projectRoot = mkdtempProjectIsolated('frozen-retirements-evidence-');
  const missingPath = 'scripts/tests/unit/articles/missing-evidence.test.mjs';
  const escapingPath = 'scripts/tests/unit/articles/escaping-evidence.test.mjs';
  const absolutePath = 'scripts/tests/unit/articles/absolute-evidence.test.mjs';
  writeReceipt(projectRoot, missingPath, receiptFor(missingPath));
  writeReceipt(
    projectRoot,
    escapingPath,
    receiptFor(escapingPath, { evidence: `${TEMPORARY_RETIREMENT_EVIDENCE_ROOT}/../escape.md` })
  );
  writeReceipt(projectRoot, absolutePath, receiptFor(absolutePath, { evidence: '/tmp/escape.md' }));

  const loaded = load(projectRoot, {
    finalizedFrozenPaths: [missingPath, escapingPath, absolutePath],
  });
  assert.deepEqual(loaded.retirements, []);
  assert.match(
    loaded.errors.find(({ receiptFile }) => receiptFile.includes('missing-evidence.')).error,
    /evidence file is missing/
  );
  assert.match(
    loaded.errors.find(({ receiptFile }) => receiptFile.includes('escaping-evidence.')).error,
    /evidence path/
  );
  assert.match(
    loaded.errors.find(({ receiptFile }) => receiptFile.includes('absolute-evidence.')).error,
    /evidence path/
  );
});

test('reports duplicate declarations without authorizing either receipt', () => {
  const projectRoot = mkdtempProjectIsolated('frozen-retirements-duplicate-');
  const testPath = 'scripts/tests/unit/articles/duplicate.test.mjs';
  const receipt = receiptFor(testPath);
  const first = writeReceipt(projectRoot, testPath, receipt);
  const second = `${FROZEN_RETIREMENT_ROOT}/unit/articles/z-duplicate.test.mjs.json`;
  writeFixture(projectRoot, second, receipt);
  writeEvidence(projectRoot, receipt.evidence);

  const loaded = load(projectRoot, { finalizedFrozenPaths: [testPath] });
  assert.deepEqual(loaded.retirements, []);
  assert.deepEqual(
    loaded.errors.map(({ receiptFile }) => receiptFile),
    [second]
  );
  assert.match(loaded.errors[0].error, /duplicate declared path/);
  assert.deepEqual(loaded.misplacedReceipts, [
    { receiptFile: second, expectedReceiptFile: first, path: testPath },
  ]);
});

test('does not authorize a valid receipt when an invalid duplicate declares its path', () => {
  const projectRoot = mkdtempProjectIsolated('frozen-retirements-mixed-duplicate-');
  const testPath = 'scripts/tests/unit/articles/mixed-duplicate.test.mjs';
  const receipt = receiptFor(testPath);
  const first = writeReceipt(projectRoot, testPath, receipt);
  const second = `${FROZEN_RETIREMENT_ROOT}/unit/articles/z-mixed-duplicate.test.mjs.json`;
  writeFixture(
    projectRoot,
    second,
    receiptFor(testPath, {
      reason: 'The extracted subsystem no longer belongs to this package',
    })
  );
  writeEvidence(projectRoot, receipt.evidence);

  const loaded = load(projectRoot, { finalizedFrozenPaths: [testPath] });
  assert.deepEqual(loaded.retirements, []);
  assert.deepEqual(
    loaded.errors.map(({ receiptFile }) => receiptFile),
    [second, second]
  );
  assert.match(loaded.errors[0].error, /duplicate declared path/);
  assert.match(loaded.errors[1].error, /reason/);
  assert.deepEqual(loaded.misplacedReceipts, [
    { receiptFile: second, expectedReceiptFile: first, path: testPath },
  ]);
});

test('reports a receipt at the wrong deterministic location without authorizing it', () => {
  const projectRoot = mkdtempProjectIsolated('frozen-retirements-misplaced-');
  const testPath = 'scripts/tests/integration/articles/misplaced.test.mjs';
  const receipt = receiptFor(testPath);
  const receiptFile = `${FROZEN_RETIREMENT_ROOT}/unit/articles/misplaced.test.mjs.json`;
  writeReceipt(projectRoot, testPath, receipt, receiptFile);
  writeEvidence(projectRoot, receipt.evidence);

  const loaded = load(projectRoot, { finalizedFrozenPaths: [testPath] });
  assert.deepEqual(loaded.errors, []);
  assert.deepEqual(loaded.retirements, []);
  assert.deepEqual(loaded.misplacedReceipts, [
    {
      receiptFile,
      expectedReceiptFile: retirementReceiptPathForTestPath(testPath),
      path: testPath,
    },
  ]);
});

test('reports receipt and live-test overlap without authorizing the retirement', () => {
  const projectRoot = mkdtempProjectIsolated('frozen-retirements-live-overlap-');
  const testPath = 'scripts/tests/slow/articles/live.test.mjs';
  const receipt = receiptFor(testPath);
  const receiptFile = writeReceipt(projectRoot, testPath, receipt);
  writeEvidence(projectRoot, receipt.evidence);
  writeFixture(projectRoot, testPath, '// live test\n');

  const loaded = load(projectRoot, {
    finalizedFrozenPaths: [testPath],
    liveDiscoveredPaths: [testPath],
  });
  assert.deepEqual(loaded.retirements, []);
  assert.match(loaded.errors[0].error, /live discovered test/);
});

test('permits shared evidence and sorts diagnostics by receipt path', () => {
  const projectRoot = mkdtempProjectIsolated('frozen-retirements-sorted-');
  const firstPath = 'scripts/tests/unit/articles/a-valid.test.mjs';
  const secondPath = 'scripts/tests/unit/articles/z-valid.test.mjs';
  const sharedEvidence = `${TEMPORARY_RETIREMENT_EVIDENCE_ROOT}/shared.md`;
  const invalidA = 'scripts/tests/unit/articles/a-invalid.test.mjs';
  const invalidZ = 'scripts/tests/unit/articles/z-invalid.test.mjs';
  for (const testPath of [firstPath, secondPath]) {
    writeReceipt(projectRoot, testPath, receiptFor(testPath, { evidence: sharedEvidence }));
  }
  writeEvidence(projectRoot, sharedEvidence);
  writeReceipt(projectRoot, invalidZ, receiptFor(invalidZ, { reason: '' }));
  writeReceipt(projectRoot, invalidA, receiptFor(invalidA, { reason: '' }));

  const loaded = load(projectRoot, {
    finalizedFrozenPaths: [firstPath, secondPath, invalidA, invalidZ],
  });
  assert.deepEqual(
    loaded.retirements.map(({ path: testPath }) => testPath),
    [firstPath, secondPath]
  );
  assert.deepEqual(
    loaded.errors.map(({ receiptFile }) => receiptFile),
    [invalidA, invalidZ].map(retirementReceiptPathForTestPath)
  );
});

test('returns an absent receipt root without errors and recognizes an existing root', () => {
  const absentRoot = mkdtempProjectIsolated('frozen-retirements-no-root-');
  assert.deepEqual(load(absentRoot), {
    retirements: [],
    errors: [],
    misplacedReceipts: [],
    rootPresent: false,
  });

  const presentRoot = mkdtempProjectIsolated('frozen-retirements-root-present-');
  mkdirSync(path.join(presentRoot, FROZEN_RETIREMENT_ROOT), { recursive: true });
  const loaded = load(presentRoot);
  assert.equal(loaded.rootPresent, true);
  assert.equal(existsSync(path.join(presentRoot, FROZEN_RETIREMENT_ROOT)), true);
});

test('combines an active receipt without invoking historical Git inspection', () => {
  const projectRoot = mkdtempProjectIsolated('frozen-retirements-active-combined-');
  const testPath = 'scripts/tests/unit/articles/active-combined.test.mjs';
  const receipt = receiptFor(testPath);
  const receiptFile = writeReceipt(projectRoot, testPath, receipt);
  writeEvidence(projectRoot, receipt.evidence);
  let gitCalls = 0;

  const loaded = loadFrozenRetirements({
    projectRoot,
    finalizedFrozenPaths: [testPath],
    git() {
      gitCalls += 1;
      throw new Error('historical Git inspection must not run for an active receipt');
    },
  });

  assert.equal(gitCalls, 0);
  assert.deepEqual(loaded, {
    retirements: [
      {
        receiptFile,
        evidenceFile: receipt.evidence,
        source: 'active',
        ...receipt,
      },
    ],
    errors: [],
    misplacedReceipts: [],
  });
});

test('hydrates a graduated fast-forward delivery from origin/trunk', () => {
  const history = createHistoryRepository('frozen-retirements-history-ff-');
  git(history.projectRoot, ['checkout', '--quiet', '-b', 'feature/retire']);
  const receipt = addRetirementTree(history);
  commitAll(history.projectRoot, 'retire frozen test on feature');
  git(history.projectRoot, ['checkout', '--quiet', 'trunk']);
  git(history.projectRoot, ['merge', '--quiet', '--ff-only', 'feature/retire']);
  pushTrunk(history.projectRoot);
  graduateRetirement(history);

  assertHistoricalRetirement(hydrate(history), history, receipt);
});

test('hashes the raw direct-parent blob bytes without UTF-8 replacement', () => {
  const testBytes = Buffer.from([0xff, 0xfe, 0x00, 0x61, 0x0a]);
  const history = createHistoryRepository('frozen-retirements-history-raw-blob-', testBytes);
  const receipt = addRetirementTree(history);
  commitAll(history.projectRoot, 'deliver retirement for non-UTF-8 test bytes');
  pushTrunk(history.projectRoot);
  graduateRetirement(history);

  assert.equal(receipt.lastLiveSha256, createHash('sha256').update(testBytes).digest('hex'));
  assertHistoricalRetirement(hydrate(history), history, receipt);
});

test('hydrates a graduated rebased delivery from origin/trunk', () => {
  const history = createHistoryRepository('frozen-retirements-history-rebase-');
  git(history.projectRoot, ['checkout', '--quiet', '-b', 'feature/retire']);
  const receipt = addRetirementTree(history);
  commitAll(history.projectRoot, 'retire frozen test before rebase');
  git(history.projectRoot, ['checkout', '--quiet', 'trunk']);
  writeFixture(history.projectRoot, 'canonical-trunk-change.txt', 'canonical trunk change\n');
  commitAll(history.projectRoot, 'advance canonical trunk');
  pushTrunk(history.projectRoot);
  git(history.projectRoot, ['checkout', '--quiet', 'feature/retire']);
  git(history.projectRoot, ['rebase', '--quiet', 'trunk']);
  git(history.projectRoot, ['checkout', '--quiet', 'trunk']);
  git(history.projectRoot, ['merge', '--quiet', '--ff-only', 'feature/retire']);
  pushTrunk(history.projectRoot);
  graduateRetirement(history);

  assertHistoricalRetirement(hydrate(history), history, receipt);
});

test('hydrates a squash-shaped delivery without trusting the unreachable feature commit', () => {
  const history = createHistoryRepository('frozen-retirements-history-squash-');
  git(history.projectRoot, ['checkout', '--quiet', '-b', 'feature/retire']);
  const receipt = addRetirementTree(history);
  const featureCommit = commitAll(history.projectRoot, 'feature retirement commit');
  git(history.projectRoot, ['checkout', '--quiet', 'trunk']);
  git(history.projectRoot, ['merge', '--quiet', '--squash', 'feature/retire']);
  commitAll(history.projectRoot, 'squash-deliver frozen retirement');
  pushTrunk(history.projectRoot);
  graduateRetirement(history);

  assert.throws(() =>
    git(history.projectRoot, ['merge-base', '--is-ancestor', featureCommit, 'origin/trunk'])
  );
  assertHistoricalRetirement(hydrate(history), history, receipt);
});

test('hydrates a merge result whose live parent contains the pre-deletion blob', () => {
  const history = createHistoryRepository('frozen-retirements-history-merge-');
  git(history.projectRoot, ['checkout', '--quiet', '-b', 'feature/retire']);
  const receipt = addRetirementTree(history, {}, { evidence: false });
  commitAll(history.projectRoot, 'prepare retirement without evidence');
  git(history.projectRoot, ['checkout', '--quiet', 'trunk']);
  writeFixture(history.projectRoot, 'canonical-trunk-change.txt', 'canonical trunk change\n');
  commitAll(history.projectRoot, 'advance trunk before merge');
  pushTrunk(history.projectRoot);
  git(history.projectRoot, ['merge', '--quiet', '--no-ff', '--no-commit', 'feature/retire']);
  writeEvidence(history.projectRoot, history.evidenceFile);
  const mergeCommit = commitAll(history.projectRoot, 'merge retirement with evidence');
  assert.equal(
    git(history.projectRoot, ['rev-list', '--parents', '-n', '1', mergeCommit]).split(' ').length,
    3
  );
  pushTrunk(history.projectRoot);
  graduateRetirement(history);

  assertHistoricalRetirement(hydrate(history), history, receipt);
});

test('combines a graduated receipt deleted with its evidence in later canonical history', () => {
  const history = createHistoryRepository('frozen-retirements-history-graduated-');
  const receipt = addRetirementTree(history);
  commitAll(history.projectRoot, 'deliver frozen retirement');
  pushTrunk(history.projectRoot);
  graduateRetirement(history);
  assert.equal(existsSync(path.join(history.projectRoot, history.receiptFile)), false);
  assert.equal(existsSync(path.join(history.projectRoot, history.evidenceFile)), false);

  assert.deepEqual(
    loadFrozenRetirements({
      projectRoot: history.projectRoot,
      finalizedFrozenPaths: [history.testPath],
      liveDiscoveredPaths: [],
    }),
    {
      retirements: [
        {
          receiptFile: history.receiptFile,
          evidenceFile: history.evidenceFile,
          source: 'historical',
          ...receipt,
        },
      ],
      errors: [],
      misplacedReceipts: [],
    }
  );
});

test('rejects a complete retirement chain that exists only on an undelivered feature branch', () => {
  const history = createHistoryRepository('frozen-retirements-history-undelivered-');
  git(history.projectRoot, ['checkout', '--quiet', '-b', 'feature/retire']);
  addRetirementTree(history);
  commitAll(history.projectRoot, 'undelivered feature receipt');
  rmSync(path.join(history.projectRoot, history.receiptFile));
  rmSync(path.join(history.projectRoot, history.evidenceFile));
  commitAll(history.projectRoot, 'undelivered feature graduation');

  assert.throws(
    () => hydrate(history),
    new RegExp(`origin/trunk history.*${history.receiptFile.replaceAll('.', '\\.')}`)
  );
});

test('rejects a receipt digest that differs from every live merge parent blob', () => {
  const history = createHistoryRepository('frozen-retirements-history-digest-');
  git(history.projectRoot, ['checkout', '--quiet', '-b', 'feature/retire']);
  writeFixture(history.projectRoot, history.testPath, '// feature parent test bytes\n');
  commitAll(history.projectRoot, 'change test on feature parent');
  git(history.projectRoot, ['checkout', '--quiet', 'trunk']);
  writeFixture(history.projectRoot, 'canonical-trunk-change.txt', 'canonical trunk change\n');
  commitAll(history.projectRoot, 'advance trunk parent');
  git(history.projectRoot, ['merge', '--quiet', '--no-ff', '--no-commit', 'feature/retire']);
  const expectedDigest = 'b'.repeat(64);
  addRetirementTree(history, { lastLiveSha256: expectedDigest });
  commitAll(history.projectRoot, 'merge retirement with mismatched digest');
  pushTrunk(history.projectRoot);
  graduateRetirement(history);

  assert.throws(
    () => hydrate(history),
    new RegExp(`${history.testPath.replaceAll('.', '\\.')}.*${expectedDigest}`)
  );
});

test('rejects canonical receipt history when evidence is absent from the receipt tree', () => {
  const history = createHistoryRepository('frozen-retirements-history-no-evidence-');
  addRetirementTree(history, {}, { evidence: false });
  commitAll(history.projectRoot, 'deliver receipt without evidence');
  pushTrunk(history.projectRoot);
  graduateRetirement(history, { removeEvidence: false });

  assert.throws(
    () => hydrate(history),
    new RegExp(`evidence.*${history.receiptFile.replaceAll('.', '\\.')}`)
  );
});

test('rejects a delivered receipt whose graduation deletion is not reachable from origin/trunk', () => {
  const history = createHistoryRepository('frozen-retirements-history-no-graduation-');
  addRetirementTree(history);
  commitAll(history.projectRoot, 'deliver active receipt');
  pushTrunk(history.projectRoot);
  git(history.projectRoot, ['checkout', '--quiet', '-b', 'feature/graduation']);
  rmSync(path.join(history.projectRoot, history.receiptFile));
  rmSync(path.join(history.projectRoot, history.evidenceFile));
  commitAll(history.projectRoot, 'graduate only on feature branch');

  assert.throws(
    () => hydrate(history),
    new RegExp(`graduation.*${history.receiptFile.replaceAll('.', '\\.')}`)
  );
});

test('fails closed with fetch guidance when origin/trunk is absent', () => {
  const history = createHistoryRepository('frozen-retirements-history-no-origin-trunk-');
  git(history.projectRoot, ['remote', 'remove', 'origin']);

  assert.throws(
    () => hydrate(history),
    /fetch complete canonical history for origin\/trunk and retry/
  );
});

test('fails closed with fetch guidance in a shallow repository', () => {
  const history = createHistoryRepository('frozen-retirements-history-shallow-source-');
  addRetirementTree(history);
  commitAll(history.projectRoot, 'deliver receipt before shallow clone');
  pushTrunk(history.projectRoot);
  graduateRetirement(history);
  const container = mkdtempProjectIsolated('frozen-retirements-history-shallow-clone-');
  const shallowRoot = path.join(container, 'clone');
  git(container, [
    'clone',
    '--quiet',
    '--depth',
    '1',
    '--branch',
    'trunk',
    pathToFileURL(history.originRoot).href,
    shallowRoot,
  ]);
  assert.equal(git(shallowRoot, ['rev-parse', '--is-shallow-repository']), 'true');

  assert.throws(
    () => hydrate({ ...history, projectRoot: shallowRoot }),
    /fetch complete canonical history for origin\/trunk and retry/
  );
});

test('fails closed and names the receipt when a required parent blob is missing', () => {
  const history = createHistoryRepository('frozen-retirements-history-missing-blob-');
  addRetirementTree(history);
  const deliveryCommit = commitAll(history.projectRoot, 'deliver receipt before blob loss');
  pushTrunk(history.projectRoot);
  graduateRetirement(history);
  const parentCommit = git(history.projectRoot, ['rev-parse', `${deliveryCommit}^`]);
  const blob = git(history.projectRoot, ['rev-parse', `${parentCommit}:${history.testPath}`]);
  removeLooseObject(history.projectRoot, blob);

  assert.throws(
    () => hydrate(history),
    (error) => {
      assert.match(error.message, /required parent blob/);
      assert.match(error.message, new RegExp(history.receiptFile.replaceAll('.', '\\.')));
      assert.match(error.message, /fetch complete canonical history for origin\/trunk and retry/);
      return true;
    }
  );
});

test('fails closed when a receipt object is missing during a canonical path check', () => {
  const history = createHistoryRepository('frozen-retirements-history-missing-receipt-object-');
  addRetirementTree(history);
  const deliveryCommit = commitAll(history.projectRoot, 'deliver receipt before object loss');
  pushTrunk(history.projectRoot);
  graduateRetirement(history);
  const receiptBlob = git(history.projectRoot, [
    'rev-parse',
    `${deliveryCommit}:${history.receiptFile}`,
  ]);
  removeLooseObject(history.projectRoot, receiptBlob);

  assert.throws(
    () => hydrate(history),
    (error) => {
      assert.match(error.message, new RegExp(history.receiptFile.replaceAll('.', '\\.')));
      assert.match(error.message, /fetch complete canonical history for origin\/trunk and retry/);
      return true;
    }
  );
});

test('fails closed when canonical graduation enumeration cannot complete', () => {
  const history = createHistoryRepository('frozen-retirements-history-graduation-enumeration-');
  addRetirementTree(history);
  commitAll(history.projectRoot, 'deliver receipt before enumeration failure');
  pushTrunk(history.projectRoot);
  graduateRetirement(history);
  const runGit = (args) => {
    if (
      args.length === 5 &&
      args[0] === 'rev-list' &&
      args[1] === '--full-history' &&
      args[2] === 'origin/trunk' &&
      args[3] === '--' &&
      args[4] === history.receiptFile
    ) {
      const error = new Error('simulated missing graduation history object');
      error.status = 128;
      throw error;
    }
    return rawGit(history.projectRoot, args);
  };

  assert.throws(
    () => hydrate(history, { git: runGit }),
    (error) => {
      assert.match(error.message, /graduation history/);
      assert.match(error.message, new RegExp(history.receiptFile.replaceAll('.', '\\.')));
      assert.match(error.message, /fetch complete canonical history for origin\/trunk and retry/);
      return true;
    }
  );
});
