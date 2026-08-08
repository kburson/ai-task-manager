// #449 — verb-core bind-context guard.
// Verb-core `run*` functions import and call `assertBoundToIssue` at entry.
// Tests inject `deps.assertBound = () => {}` to opt out.

import { readBoundState } from './bound-state.mjs';
import { resolveProjectDir } from './project-dir.mjs';

export class BindMissingError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'BindMissingError';
  }
}

export class BindMismatchError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'BindMismatchError';
  }
}

export function assertBoundToIssue(
  issueNumber,
  { projectDir, resolveDir = resolveProjectDir } = {}
) {
  const resolvedDir = resolveDir({ issue: issueNumber, deps: { projectDir } });
  const { activeIssue } = readBoundState(resolvedDir);
  const target = `#${String(issueNumber).replace(/^#/, '')}`;
  if (!activeIssue) {
    throw new BindMissingError(
      `No active bind — run \`/task ${target}\` before calling verb-core functions directly`
    );
  }
  if (activeIssue !== target) {
    throw new BindMismatchError(
      `Bind mismatch: active is ${activeIssue}, target is ${target} — run \`/task ${target}\` to rebind`
    );
  }
}
