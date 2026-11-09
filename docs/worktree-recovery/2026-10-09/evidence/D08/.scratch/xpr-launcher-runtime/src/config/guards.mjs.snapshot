import path from 'node:path';
import { realpathSync } from 'node:fs';

import { AprError } from '../errors.mjs';

function reject(message, details = {}) {
  throw new AprError('APR_REVIEWER_GUARD', message, {
    recovery:
      'Use the exact peer-review status, resume, or submit command emitted for this reviewer turn.',
    details,
  });
}

function exactPath(value) {
  return typeof value === 'string' && path.isAbsolute(value) && path.normalize(value) === value;
}

export function deriveReviewerGuard(status, context) {
  const workspace = status?.paths?.workspace;
  const response = status?.paths?.response;
  let physicalRepository;
  let physicalWorktree;
  let physicalWorkspace;
  let physicalResponse;
  const resolvePhysical = context?.resolvePhysical ?? realpathSync;
  try {
    physicalRepository = resolvePhysical(context.repositoryRoot);
    physicalWorktree = resolvePhysical(context.worktreeRoot);
    physicalWorkspace = resolvePhysical(workspace);
    physicalResponse = resolvePhysical(response);
  } catch {
    reject('Reviewer paths cannot be resolved physically.');
  }
  const expectedSession =
    context.expectedSessionFingerprint ?? status.participant?.session_fingerprint;
  if (
    status?.state !== 'reviewer-turn' ||
    !exactPath(workspace) ||
    !exactPath(response) ||
    !exactPath(context?.repositoryRoot) ||
    !exactPath(context?.worktreeRoot) ||
    physicalRepository !== physicalWorktree ||
    !physicalWorkspace.startsWith(`${physicalRepository}${path.sep}`) ||
    !physicalResponse.startsWith(`${physicalRepository}${path.sep}`) ||
    !expectedSession ||
    expectedSession !== context.sessionFingerprint
  ) {
    reject('Reviewer authority does not match the pending session or physical worktree.');
  }
  const allowed = new Set([
    JSON.stringify(['peer-review', 'status', workspace, '--json']),
    JSON.stringify(['peer-review', 'resume', workspace]),
    JSON.stringify(['peer-review', 'submit', workspace]),
    JSON.stringify(['peer-review', 'submit', workspace, '--decision', 'accepted']),
    JSON.stringify(['peer-review', 'submit', workspace, '--decision', 'revisions-requested']),
  ]);
  return Object.freeze({
    schema: 'ai-peer-review.reviewer-guard/v1',
    workspace,
    response,
    enforcement: 'command-hook',
    check(argv) {
      if (
        !Array.isArray(argv) ||
        argv.some((argument) => typeof argument !== 'string') ||
        !allowed.has(JSON.stringify(argv))
      ) {
        reject('Reviewer command is outside the closed guard grammar.', { argv });
      }
      return true;
    },
    checkOperation(operation) {
      if (operation?.kind === 'read') return true;
      if (operation?.kind === 'write' && exactPath(operation.path)) {
        try {
          if (resolvePhysical(operation.path) === physicalResponse) return true;
        } catch {
          // The closed rejection below owns missing, linked, and otherwise unsafe paths.
        }
      }
      if (operation?.kind === 'command') return this.check(operation.argv);
      reject('Reviewer operation is outside the exact pending response boundary.', {
        kind: operation?.kind,
        path: operation?.path,
      });
    },
  });
}
