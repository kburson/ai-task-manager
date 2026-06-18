// #449 — verb-core bind-context guard.
// Verb-core `run*` functions import and call `assertBoundToIssue` at entry.
// Tests inject `deps.assertBound = () => {}` to opt out.

import { readBoundState } from './bound-state.mjs';

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

export function assertBoundToIssue(issueNumber, { projectDir = process.cwd() } = {}) {
  const { activeIssue } = readBoundState(projectDir);
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
