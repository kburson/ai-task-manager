import path from 'node:path';

import { aiAppName, currentSessionId } from '../word-counter.mjs';
import {
  claimOccupancy,
  heartbeatOccupancy,
  releaseOccupancy,
  rollbackOccupancyClaim,
} from './occupancy.mjs';

function identity({ projectDir, issue, now }) {
  return {
    projectDir,
    issue,
    sid: currentSessionId(),
    provider: aiAppName(),
    worktreePath: path.resolve(projectDir),
    now,
  };
}

export function claimBindingOccupancy(input, deps = {}) {
  const claim = deps.claimOccupancy || claimOccupancy;
  return claim(identity(input), {
    coReviewAllowsWorktree: deps.coReviewAllowsWorktree || (() => false),
  });
}

export function rollbackBindingOccupancy(claim, deps = {}) {
  return (deps.rollbackOccupancyClaim || rollbackOccupancyClaim)(claim);
}

export function heartbeatBindingOccupancy(input, deps = {}) {
  const { projectDir, issue, now } = input;
  return (deps.heartbeatOccupancy || heartbeatOccupancy)({
    projectDir,
    issue,
    sid: currentSessionId(),
    now,
  });
}

export function releaseBindingOccupancy(input, deps = {}) {
  const { projectDir, issue } = input;
  return (deps.releaseOccupancy || releaseOccupancy)({
    projectDir,
    issue,
    sid: currentSessionId(),
  });
}
