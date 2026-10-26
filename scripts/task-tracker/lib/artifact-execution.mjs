// @story #2096
// Temporary verification materialization; native authority stays with the caller.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateArtifactSubject } from './artifact-subject.mjs';
import { currentSessionId } from '../word-counter.mjs';
import { getActiveTask } from '../session-state.mjs';
import { readWorktreeIdentity } from './worktree-binding-guard.mjs';

function git(projectDir, ...args) {
  return execFileSync('git', args, {
    cwd: projectDir,
    encoding: 'utf8',
    timeout: 30000,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function observeArtifactOperator(projectDir) {
  return Object.freeze({
    worktreePath: realpathSync(projectDir),
    headSha: git(projectDir, 'rev-parse', 'HEAD'),
    branch: readWorktreeIdentity({ projectDir }).worktreeBranch,
  });
}

export function assertArtifactOperator(projectDir, expected) {
  const actual = observeArtifactOperator(projectDir);
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error('artifact: operator context changed');
}

export function assertArtifactSource(sourceDir, artifactSubject) {
  validateArtifactSubject({ projectDir: sourceDir, artifactSubject });
  if (git(sourceDir, 'rev-parse', 'HEAD') !== artifactSubject.commitSha)
    throw new Error('artifact: execution HEAD mismatch');
  if (git(sourceDir, 'rev-parse', 'HEAD^{tree}') !== artifactSubject.treeSha)
    throw new Error('artifact: execution tree mismatch');
  if (git(sourceDir, 'status', '--porcelain', '--untracked-files=no'))
    throw new Error('artifact: execution source dirty');
}

export async function withArtifactSource(
  { projectDir, artifactSubject, installDependencies = false },
  action
) {
  if (!artifactSubject) return action({ sourceDir: projectDir });
  validateArtifactSubject({ projectDir, artifactSubject });
  const operatorContext = observeArtifactOperator(projectDir);
  const parent = mkdtempSync(path.join(tmpdir(), 'aitm-artifact-source-'));
  const sourceDir = path.join(parent, 'source');
  // Reuse the native Test sandbox lifecycle, including its nested-fixture cleanup.
  const { defaultCreateWorktree, defaultRemoveWorktree, defaultNpmCi } =
    await import('../verbs/test.mjs');
  try {
    await defaultCreateWorktree({ projectDir, path: sourceDir, ref: artifactSubject.commitSha });
    assertArtifactSource(sourceDir, artifactSubject);
    if (installDependencies) await defaultNpmCi({ path: sourceDir });
    const result = await action({ sourceDir, operatorContext, artifactSubject });
    assertArtifactSource(sourceDir, artifactSubject);
    assertArtifactOperator(projectDir, operatorContext);
    return result;
  } finally {
    await defaultRemoveWorktree({ projectDir, path: sourceDir });
    rmSync(parent, { recursive: true, force: true });
  }
}

export function captureArtifactOperator({ projectDir, issueNumber, deps = {} } = {}) {
  const sessionId = (deps.currentSessionId ?? currentSessionId)();
  const binding = (deps.getActiveTask ?? getActiveTask)(sessionId, projectDir);
  const observed = observeArtifactOperator(projectDir);
  const boundIssue = Number(String(binding?.issue ?? '').replace(/^#/, ''));
  if (
    !sessionId ||
    !binding?.bindingGenerationId ||
    boundIssue !== Number(issueNumber) ||
    binding.worktreePath !== observed.worktreePath ||
    binding.worktreeBranch !== observed.branch ||
    binding.closedAt
  ) {
    throw new Error('artifact: actual session binding mismatch');
  }
  return Object.freeze({
    ...observed,
    sessionId,
    boundIssue,
    bindingGenerationId: binding.bindingGenerationId,
  });
}

export function assertNativeArtifactOperator({ projectDir, issueNumber, operatorContext }) {
  const current = captureArtifactOperator({ projectDir, issueNumber });
  if (JSON.stringify(current) !== JSON.stringify(operatorContext))
    throw new Error('artifact: operator binding changed');
}
