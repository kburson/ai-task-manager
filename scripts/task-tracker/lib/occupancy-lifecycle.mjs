import path from 'node:path';

import { aiAppName, currentSessionId } from '../word-counter.mjs';
import {
  claimOccupancy,
  heartbeatOccupancy,
  releaseOccupancy,
  rollbackOccupancyClaim,
  touchOccupancy,
} from './occupancy.mjs';
import { allowsCoReviewOccupancy } from '../../review/lib/index.mjs';

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

function generationIdentity(input) {
  return {
    ...identity(input),
    ...(input.bindingGenerationId ? { bindingGenerationId: input.bindingGenerationId } : {}),
    ...(input.cycleId ? { cycleId: input.cycleId } : {}),
    ...(input.repositoryId ? { repositoryId: input.repositoryId } : {}),
  };
}

export function claimBindingOccupancy(input, deps = {}) {
  const claim = deps.claimOccupancy || claimOccupancy;
  return claim(generationIdentity(input), {
    coReviewAllowsWorktree:
      deps.coReviewAllowsWorktree || ((occupancy) => allowsCoReviewOccupancy(occupancy)),
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

export function touchBindingOccupancy(input, deps = {}) {
  const touch = deps.touchOccupancy || touchOccupancy;
  return touch(generationIdentity(input), {
    coReviewAllowsWorktree:
      deps.coReviewAllowsWorktree || ((occupancy) => allowsCoReviewOccupancy(occupancy)),
  });
}

export function releaseBindingOccupancy(input, deps = {}) {
  const { projectDir, issue, bindingGenerationId } = input;
  return (deps.releaseOccupancy || releaseOccupancy)({
    projectDir,
    issue,
    sid: currentSessionId(),
    ...(bindingGenerationId ? { bindingGenerationId } : {}),
  });
}
