// @story #1711
// One observation supplies both policy and intent; no pinned-commit or override reads.
import path from 'node:path';
import { extractPlanTasks } from './decomposition-policy.mjs';
import {
  validateGovernedLinkedPlan,
  validateGovernedPlanContent,
  isGovernedPlanObservation,
} from './governed-plan-policy.mjs';
import { CANONICAL_USER_STORY_TEMPLATE } from './user-story-author.mjs';
import {
  evaluateStoryBody,
  evaluateStoryProse,
  renderStoryFromIntent,
  resolveStoryIntent,
  storyDigest,
} from './user-story-quality.mjs';

export function resolveStoryIntentSource({ body = '', projectDir, governedPlan, deps = {} } = {}) {
  const options = { mode: 'approval', canonicalTemplate: CANONICAL_USER_STORY_TEMPLATE };
  const story = evaluateStoryBody(body, options);
  if (!story.ok) return { ...story, binding: null };
  const policy = governedPlan ?? validateGovernedLinkedPlan({ body, projectDir, deps });
  const refusal = (message) => ({
    ok: false,
    binding: null,
    violations: [
      {
        code: 'story-intent-source-unresolvable',
        line: null,
        message: String(message).slice(0, 240),
      },
    ],
  });
  if (!policy.ok)
    return refusal(policy.violations?.[0]?.excerpt || 'Linked plan policy validation failed');
  if (!isGovernedPlanObservation(policy, { body, projectDir }))
    return refusal('Policy observation is not a validated read of this body and project');
  const observation = policy.observation;
  if (
    observation &&
    (observation.body !== body ||
      observation.projectDir !== path.resolve(projectDir) ||
      !validateGovernedPlanContent(observation.text).ok)
  ) {
    return refusal('Policy observation does not match this issue body and project');
  }
  const resolved = resolveStoryIntent({
    body,
    plan: observation ? { ...observation, tasks: extractPlanTasks(observation.text) } : null,
  });
  if (!resolved.ok) return { ...resolved, binding: null };
  const quality = evaluateStoryProse(renderStoryFromIntent(resolved.intent), options);
  if (!quality.ok) return { ...quality, binding: null };
  return {
    ...resolved,
    observation: observation ?? null,
    binding: {
      storyDigest: storyDigest(story.lines),
      storyIntentDigest: resolved.digest,
      storyIntentSource: resolved.source,
    },
  };
}
