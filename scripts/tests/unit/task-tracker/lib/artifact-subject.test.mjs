// @story #2096
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  resolveArtifactSubject,
  validateArtifactSubject,
  sourceCommit,
  parseArtifactSelection,
} from '../../../../task-tracker/lib/artifact-subject.mjs';

function repository(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'aitm-artifact-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Artifact test');
  git('config', 'user.email', 'artifact@example.test');
  writeFileSync(path.join(root, 'source.txt'), 'candidate');
  writeFileSync(path.join(root, 'package-lock.json'), '{}');
  writeFileSync(path.join(root, 'package.json'), '{}');
  git('add', '.');
  git('commit', '-qm', '[#2096] candidate');
  const candidate = git('rev-parse', 'HEAD');
  const tree = git('rev-parse', 'HEAD^{tree}');
  writeFileSync(path.join(root, 'source.txt'), 'controller');
  git('commit', '-qam', 'Controller advances');
  return { root, git, candidate, tree, operatorHead: git('rev-parse', 'HEAD') };
}

test('immutable source selection preserves the actual controller checkout', (t) => {
  const { root, git, candidate, tree, operatorHead } = repository(t);
  const artifactSubject = resolveArtifactSubject({ projectDir: root, commitSha: candidate });
  assert.deepEqual(artifactSubject, { commitSha: candidate, treeSha: tree });
  assert.equal(Object.isFrozen(artifactSubject), true);
  assert.equal(sourceCommit({ artifactSubject, operatorHead }), candidate);
  assert.equal(sourceCommit({ operatorHead }), operatorHead);
  assert.equal(git('rev-parse', 'HEAD'), operatorHead);
  assert.equal(git('show', 'HEAD:source.txt'), 'controller');
  assert.deepEqual(validateArtifactSubject({ projectDir: root, artifactSubject }), artifactSubject);
  assert.throws(
    () =>
      validateArtifactSubject({
        projectDir: root,
        artifactSubject: { ...artifactSubject, treeSha: '0'.repeat(40) },
      }),
    /tree/
  );
});

test('selection rejects symbolic, missing and noncommit source objects', (t) => {
  const { root, git, candidate, tree } = repository(t);
  for (const commitSha of [
    'HEAD',
    candidate.slice(0, 12),
    '0'.repeat(40),
    tree,
    git('rev-parse', 'HEAD:source.txt'),
  ]) {
    assert.throws(() => resolveArtifactSubject({ projectDir: root, commitSha }), /artifact/);
  }
});

test('selector is removed from label arguments and refuses ambiguous or unsupported use', () => {
  const sha = 'a'.repeat(40);
  assert.deepEqual(
    parseArtifactSelection(['ac-stamp', 'one criterion', '--artifact-commit', sha]),
    {
      argv: ['ac-stamp', 'one criterion'],
      commitSha: sha,
    }
  );
  assert.deepEqual(parseArtifactSelection(['status']), { argv: ['status'], commitSha: null });
  assert.throws(() => parseArtifactSelection(['test', '--artifact-commit']), /artifact/);
  assert.throws(
    () => parseArtifactSelection(['test', '--artifact-commit', sha, '--artifact-commit', sha]),
    /artifact/
  );
  assert.throws(
    () => parseArtifactSelection(['start', '2096', '--artifact-commit', sha]),
    /unsupported/
  );
});

test('commit trail checks artifact source without replacing actor HEAD', async (t) => {
  const { root, candidate, tree, operatorHead } = repository(t);
  const { gateCommitTrailContainsHead } =
    await import('../../../../task-tracker/lib/code-complete-gate.mjs');
  let walked;
  const result = await gateCommitTrailContainsHead({
    cfg: { repo: 'o/r' },
    issueNumber: 2096,
    projectDir: root,
    artifactSubject: { commitSha: candidate, treeSha: tree },
    deps: {
      getHeadSha: async () => operatorHead,
      listComments: async () => [
        { body: `### 🔗 Commits\n<!-- aitm-commits shas="${'b'.repeat(40)}" -->` },
      ],
      attributingCommits: async (_issue, options) => {
        walked = options.refs;
        return [{ sha: candidate }];
      },
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.headSha, candidate);
  assert.deepEqual(walked, [candidate]);
});

test('selected-source execution uses artifact bytes and retains the controller checkout', async (t) => {
  const { root, git, candidate, tree, operatorHead } = repository(t);
  const { withArtifactSource } =
    await import('../../../../task-tracker/lib/artifact-execution.mjs');
  const artifactSubject = { commitSha: candidate, treeSha: tree };
  let sourcePath;
  const result = await withArtifactSource(
    { projectDir: root, artifactSubject },
    async ({ sourceDir }) => {
      sourcePath = sourceDir;
      assert.notEqual(sourceDir, root);
      const actual = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: sourceDir,
        encoding: 'utf8',
      }).trim();
      assert.equal(actual, candidate);
      return execFileSync('git', ['show', 'HEAD:source.txt'], {
        cwd: sourceDir,
        encoding: 'utf8',
      }).trim();
    }
  );
  assert.equal(result, 'candidate');
  assert.equal(git('rev-parse', 'HEAD'), operatorHead);
  assert.equal(git('worktree', 'list', '--porcelain').includes(sourcePath), false);
  await assert.rejects(
    withArtifactSource({ projectDir: root, artifactSubject }, async ({ sourceDir }) => {
      writeFileSync(path.join(sourceDir, 'source.txt'), 'drift');
    }),
    /artifact.*dirty/
  );
});

test('transition host receives selected artifact independently of the invoking checkout', async (t) => {
  const { root, candidate, tree } = repository(t);
  const { runMoveStateInProcess } = await import('../../../../task-tracker/runtime.mjs');
  const artifactSubject = { commitSha: candidate, treeSha: tree };
  let observed;
  const stream = { write() {} };
  await runMoveStateInProcess(
    2096,
    'test',
    { projectDir: root, invokingDir: root, artifactSubject },
    {
      host: async (input) => {
        observed = input;
        return 0;
      },
      stdout: stream,
      stderr: stream,
      log() {},
    }
  );
  assert.deepEqual(observed.artifactSubject, artifactSubject);
  assert.equal(observed.projectDir, root);
  assert.equal(observed.invokingDir, root);
});

test('explicit source receipt reuse requires matching tree and operator context', async (t) => {
  const { root, candidate, tree, operatorHead } = repository(t);
  const { buildVerificationFingerprint, createVerificationReceipt, validateVerificationReceipt } =
    await import('../../../../task-tracker/lib/verification-receipt.mjs');
  const artifactSubject = { commitSha: candidate, treeSha: tree };
  const operatorContext = {
    sessionId: 'actor',
    worktreePath: root,
    branch: 'trunk',
    headSha: operatorHead,
    boundIssue: 2096,
    bindingGenerationId: 'binding',
  };
  const { withArtifactSource } =
    await import('../../../../task-tracker/lib/artifact-execution.mjs');
  const fingerprint = await withArtifactSource(
    { projectDir: root, artifactSubject },
    ({ sourceDir }) =>
      buildVerificationFingerprint({
        projectDir: sourceDir,
        commitSha: candidate,
        artifactSubject,
        operatorContext,
      })
  );
  assert.throws(
    () =>
      buildVerificationFingerprint({
        projectDir: root,
        commitSha: candidate,
        artifactSubject,
        operatorContext,
      }),
    /artifact/
  );
  const receipt = createVerificationReceipt({
    issueNumber: 2096,
    stage: 'test',
    fingerprint,
    commands: [],
    now: () => '2026-10-26T18:00:00.000Z',
  });
  assert.deepEqual(receipt.artifactSubject, artifactSubject);
  assert.deepEqual(receipt.operatorContext, operatorContext);
  const validate = (value) =>
    validateVerificationReceipt({
      receipt: value,
      expectedIssue: 2096,
      expectedStage: 'test',
      fingerprint,
    });
  assert.equal(validate(receipt).ok, true);
  assert.equal(
    validate({ ...receipt, artifactSubject: { ...artifactSubject, treeSha: '0'.repeat(40) } }).ok,
    false
  );
  assert.equal(
    validate({ ...receipt, operatorContext: { ...operatorContext, boundIssue: 2090 } }).ok,
    false
  );
  const { artifactSubject: _artifact, operatorContext: _actor, ...legacy } = receipt;
  assert.equal(validate(legacy).ok, false);
});

test('verifier commands execute selected bytes and return true execution provenance', async (t) => {
  const { root, candidate, tree, operatorHead } = repository(t);
  const { runVerifiers } = await import('../../../../task-tracker/lib/evidence-runner.mjs');
  const { promisify } = await import('node:util');
  const { execFile } = await import('node:child_process');
  const execute = promisify(execFile);
  let output;
  const result = await runVerifiers({
    commands: ['git show HEAD:source.txt'],
    cwd: root,
    artifactSubject: { commitSha: candidate, treeSha: tree },
    boundIssue: 2096,
    pexec: async (...args) => {
      const result = await execute(...args);
      output = result.stdout.trim();
      return result;
    },
  });
  assert.equal(output, 'candidate');
  assert.equal(result.sha, candidate);
  assert.equal(result.executionContext.boundIssue, 2096);
  assert.notEqual(result.executionContext.worktreePath, root);
  assert.equal(result.operatorContext.headSha, operatorHead);
});

test('native operator observation requires the actual matching session binding', async (t) => {
  const { root, git, operatorHead } = repository(t);
  const { captureArtifactOperator } =
    await import('../../../../task-tracker/lib/artifact-execution.mjs');
  const binding = {
    issue: '#2096',
    bindingGenerationId: 'generation',
    worktreePath: realpathSync(root),
    worktreeBranch: git('branch', '--show-current'),
  };
  const deps = { currentSessionId: () => 'actual-session', getActiveTask: () => binding };
  const observed = captureArtifactOperator({ projectDir: root, issueNumber: 2096, deps });
  assert.equal(observed.sessionId, 'actual-session');
  assert.equal(observed.headSha, operatorHead);
  assert.equal(observed.bindingGenerationId, 'generation');
  assert.equal(observed.boundIssue, 2096);
  assert.throws(
    () => captureArtifactOperator({ projectDir: root, issueNumber: 2090, deps }),
    /binding/
  );
  assert.throws(
    () =>
      captureArtifactOperator({
        projectDir: root,
        issueNumber: 2096,
        deps: { ...deps, getActiveTask: () => ({ ...binding, worktreePath: '/foreign' }) },
      }),
    /binding/
  );
});
