// @story #1167
// Additive execution provenance for evidence writers. Worktree and branch are
// read from the checkout that actually ran the verifier; issue authority comes
// from the already-bound task state supplied by the caller.

import { readWorktreeIdentity } from './worktree-binding-guard.mjs';

function normalizeBoundIssue(value) {
  const issue = Number(String(value ?? '').replace(/^#/, ''));
  if (!Number.isInteger(issue) || issue <= 0) {
    throw new TypeError('evidence-provenance: boundIssue must be a positive issue number');
  }
  return issue;
}

export function captureEvidenceProvenance({ projectDir, boundIssue, deps = {} } = {}) {
  if (typeof projectDir !== 'string' || projectDir.trim() === '') {
    throw new TypeError('evidence-provenance: projectDir is required');
  }
  const readIdentity = deps.readWorktreeIdentity || readWorktreeIdentity;
  const identity = readIdentity({ projectDir });
  return Object.freeze({
    worktreePath: identity.worktreePath,
    branch: identity.worktreeBranch,
    boundIssue: normalizeBoundIssue(boundIssue),
  });
}

export function markerProvenanceProperties(evidence = {}) {
  const present = ['worktreePath', 'branch', 'boundIssue'].filter(
    (key) => evidence[key] !== undefined
  );
  if (present.length === 0) return {};
  if (
    present.length !== 3 ||
    typeof evidence.worktreePath !== 'string' ||
    evidence.worktreePath.length === 0 ||
    typeof evidence.branch !== 'string' ||
    evidence.branch.length === 0
  ) {
    throw new TypeError('evidence-provenance: marker provenance must be complete');
  }
  return {
    worktree: evidence.worktreePath,
    branch: evidence.branch,
    'bound-issue': String(normalizeBoundIssue(evidence.boundIssue)),
  };
}
