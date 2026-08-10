// @story #1168
// cspell:ignore KZMBNJKZNMS statted
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, rmSync } from 'node:fs';
import test from 'node:test';

import { auditEvidenceBranchReachability } from '../../../lib/evidence-branch-reachability.mjs';
import { developExitCodeCompleteGuard } from '../../../lib/develop-exit-code-complete-guard.mjs';
import { developExitSandboxProofGuard } from '../../../lib/develop-exit-sandbox-proof-guard.mjs';
import { runReviewPreflight } from '../../../lib/review-preflight.mjs';
import { testExitDodVerifiedGuard } from '../../../lib/test-exit-dod-verified-guard.mjs';
import { serializeProofMarker } from '../../../lib/proof-marker.mjs';
import { mkdtempProjectIsolated } from '../../../lib/scratch-dir.mjs';

const ISSUE = 1168;
const BOUND_BRANCH = 'feature/child/1168';
const FOREIGN_BRANCH = 'feature/foreign/9999';
const NOW = '2026-08-09T00:00:00.000Z';
const HEAD_SHA = 'a'.repeat(40);
const TRAIL = ['### 🔗 Commits', '', `<!-- aitm-commits: ${HEAD_SHA} -->`].join('\n');

function proof({ sha, branch = FOREIGN_BRANCH, worktree = '/deleted/foreign-worktree' } = {}) {
  return serializeProofMarker({
    cmd: '`node --test focused.test.mjs`',
    exit: '0',
    sha,
    ts: NOW,
    evidence: 'sandbox exit 0',
    worktree,
    branch,
    'bound-issue': String(ISSUE),
  });
}

function receiptMarker({ sha, branch = FOREIGN_BRANCH } = {}) {
  const receipt = {
    schema: 'aitm.verification-receipt/v1',
    receiptId: '01KZMBNJKZNMS8K4BBE1235AKX',
    issue: ISSUE,
    stage: 'test',
    commitSha: sha,
    startedAt: NOW,
    completedAt: NOW,
    environment: {},
    commands: [],
    supersedes: null,
    executionContext: {
      worktreePath: '/deleted/receipt-worktree',
      branch,
      boundIssue: ISSUE,
    },
  };
  const data = Buffer.from(JSON.stringify(receipt)).toString('base64url');
  return `<!-- aitm-verification-receipt stage="test" data="${data}" -->`;
}

function initDivergedRepo() {
  const projectDir = mkdtempProjectIsolated('evidence-reachability-');
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  git('config', 'user.email', 'aitm-test@example.com');
  git('config', 'user.name', 'aitm-test');
  const base = git('rev-parse', 'HEAD');
  git('checkout', '-qb', BOUND_BRANCH);
  appendFileSync(`${projectDir}/.gitignore`, '# bound\n');
  git('commit', '-qam', 'bound');
  const bound = git('rev-parse', 'HEAD');
  git('checkout', '-qb', FOREIGN_BRANCH, base);
  appendFileSync(`${projectDir}/.gitignore`, '# foreign\n');
  git('commit', '-qam', 'foreign');
  const foreign = git('rev-parse', 'HEAD');
  git('checkout', '-q', BOUND_BRANCH);
  return { projectDir, base, bound, foreign };
}

test('rejects genuine green proof unreachable from the bound branch and names both branches (AC1, AC2)', async (t) => {
  const repo = initDivergedRepo();
  t.after(() => rmSync(repo.projectDir, { recursive: true, force: true }));

  const result = await auditEvidenceBranchReachability({
    body: proof({ sha: repo.foreign }),
    issueNumber: ISSUE,
    projectDir: repo.projectDir,
  });

  assert.equal(result.ok, false);
  assert.match(
    result.reasons.join('\n'),
    /evidence is genuine but was produced in the wrong tree/i
  );
  assert.match(result.reasons.join('\n'), new RegExp(FOREIGN_BRANCH.replaceAll('/', '\\/')));
  assert.match(result.reasons.join('\n'), new RegExp(BOUND_BRANCH.replaceAll('/', '\\/')));
  assert.match(result.reasons.join('\n'), new RegExp(repo.foreign.slice(0, 12)));
});

test('accepts legacy proof and receipts with no provenance without probing Git (AC3)', async () => {
  let probes = 0;
  const legacyProof = serializeProofMarker({
    cmd: '`node --test legacy.test.mjs`',
    exit: '0',
    sha: HEAD_SHA,
    ts: NOW,
  });
  const receipt = {
    schema: 'aitm.verification-receipt/v1',
    receiptId: '01KZMBNJKZNMS8K4BBE1235AKX',
    issue: ISSUE,
    stage: 'test',
    commitSha: HEAD_SHA,
    startedAt: NOW,
    completedAt: NOW,
    environment: {},
    commands: [],
    supersedes: null,
  };
  const marker = `<!-- aitm-verification-receipt stage="test" data="${Buffer.from(JSON.stringify(receipt)).toString('base64url')}" -->`;
  const result = await auditEvidenceBranchReachability({
    body: `${legacyProof}\n${marker}`,
    issueNumber: ISSUE,
    projectDir: '/bound',
    deps: {
      readWorktreeIdentity: () => ({ worktreePath: '/bound', worktreeBranch: BOUND_BRANCH }),
      isAncestor: async () => {
        probes += 1;
        return true;
      },
    },
  });
  assert.equal(result.ok, true, result.reasons.join('\n'));
  assert.equal(probes, 0);
});

test('uses Git ancestry even when the recorded worktree directory no longer exists (AC4)', async () => {
  const calls = [];
  const result = await auditEvidenceBranchReachability({
    body: proof({ sha: HEAD_SHA, worktree: '/path/that/does/not/exist' }),
    issueNumber: ISSUE,
    projectDir: '/bound',
    deps: {
      readWorktreeIdentity: () => ({ worktreePath: '/bound', worktreeBranch: BOUND_BRANCH }),
      pathExists: () => {
        throw new Error('historical worktree paths must not be statted');
      },
      isAncestor: async (args) => {
        calls.push(args);
        return true;
      },
    },
  });
  assert.equal(result.ok, true, result.reasons.join('\n'));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].ancestor, HEAD_SHA);
  assert.equal(calls[0].descendant, BOUND_BRANCH);
});

test('evaluates verification-receipt execution context with the same predicate', async () => {
  const result = await auditEvidenceBranchReachability({
    body: receiptMarker({ sha: HEAD_SHA }),
    issueNumber: ISSUE,
    projectDir: '/bound',
    deps: {
      readWorktreeIdentity: () => ({ worktreePath: '/bound', worktreeBranch: BOUND_BRANCH }),
      isAncestor: async () => false,
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.reasons.join('\n'), /verification receipt/i);
  assert.match(result.reasons.join('\n'), /wrong tree/i);
});

test('Develop exit, Test entry and exit, and review-preflight all enforce the shared audit (AC5)', async () => {
  const reason = `evidence is genuine but was produced in the wrong tree: ${FOREIGN_BRANCH} -> ${BOUND_BRANCH}`;
  const reject = async () => ({ ok: false, reasons: [reason] });
  const ctx = {
    issueNumber: ISSUE,
    cfg: { repo: 'o/r' },
    projectDir: '/bound',
    body: `<!-- aitm-dod-verified sha="${HEAD_SHA}" ts="${NOW}" -->`,
    toState: 'test',
    deps: {
      evidenceBranchReachability: reject,
      codeCompleteGate: async () => {
        throw new Error('reachability must refuse first');
      },
    },
  };

  const developExit = await developExitCodeCompleteGuard.run(ctx);
  assert.equal(developExit.ok, false);
  assert.match(developExit.reason, /wrong tree/);

  const testEntry = await developExitSandboxProofGuard.run(ctx);
  assert.equal(testEntry.ok, false);
  assert.match(testEntry.reason, /wrong tree/);

  const testExit = await testExitDodVerifiedGuard.run({ ...ctx, toState: 'review' });
  assert.equal(testExit.ok, false);
  assert.match(testExit.reason, /wrong tree/);

  const review = await runReviewPreflight({
    issueNumber: ISSUE,
    repo: 'o/r',
    projectDir: '/bound',
    deps: {
      gitStatus: async () => '',
      gitHeadSha: async () => HEAD_SHA,
      findTrailComment: async () => ({ body: TRAIL }),
      hasAttributingCommit: async () => true,
      getIssueBody: async () => '',
      evidenceBranchReachability: reject,
    },
  });
  assert.equal(review.ok, false);
  assert.ok(review.reasons.includes(reason));
});

test('allow-foreign-worktree cannot bypass artifact reachability (AC6)', async () => {
  const result = await developExitSandboxProofGuard.run({
    issueNumber: ISSUE,
    projectDir: '/bound',
    body: proof({ sha: HEAD_SHA }),
    toState: 'test',
    allowForeignWorktree: true,
    deps: {
      evidenceBranchReachability: async () => ({
        ok: false,
        reasons: ['evidence is genuine but was produced in the wrong tree'],
      }),
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /wrong tree/);
});
