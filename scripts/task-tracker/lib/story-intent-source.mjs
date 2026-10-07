// @story #1711
// One observation supplies both policy and intent; no pinned-commit or override reads.
import path from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalRecordJson } from './github-records/canonical-json.mjs';
import { linkedPlanReference, extractPlanTasks } from './decomposition-policy.mjs';
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
  return resolveObservedIntent(body, observation);
}

function resolveObservedIntent(body, observation) {
  const options = { mode: 'approval', canonicalTemplate: CANONICAL_USER_STORY_TEMPLATE };
  const story = evaluateStoryBody(body, options);
  if (!story.ok) return { ...story, binding: null };
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

// Historical data only: this never registers a governed read or issues authority.
export function reconstructHistoricalPlanSource({ sourceRead, body, projectDir }) {
  const fail = () => { throw new TypeError('criteria-revision:historical-plan-source'); };
  const keys = ['schema', 'bodyHash', 'projectDir', 'key', 'path', 'text', 'contentSha256'];
  if (!sourceRead || typeof sourceRead !== 'object' || Array.isArray(sourceRead) ||
      canonicalRecordJson(Object.keys(sourceRead).sort()) !== canonicalRecordJson(keys.sort())) fail();
  const digest = text => createHash('sha256').update(text, 'utf8').digest('hex');
  const reference = linkedPlanReference(body);
  if (sourceRead.schema !== 'aitm.native-plan-source-read/v1' ||
      typeof sourceRead.text !== 'string' || !reference ||
      sourceRead.bodyHash !== 'sha256:' + digest(body) ||
      sourceRead.projectDir !== path.resolve(projectDir) ||
      reference.key !== sourceRead.key || reference.path !== sourceRead.path ||
      sourceRead.contentSha256 !== digest(sourceRead.text) ||
      !validateGovernedPlanContent(sourceRead.text).ok) fail();
  const relative = path.relative(path.resolve(projectDir), path.resolve(projectDir, reference.path));
  if (path.isAbsolute(reference.path) || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) fail();
  const observation = { body, projectDir: sourceRead.projectDir, key: sourceRead.key,
    path: sourceRead.path, text: sourceRead.text, contentSha256: sourceRead.contentSha256 };
  const resolved = resolveObservedIntent(body, observation);
  if (!resolved.ok) fail();
  const linkedSource = { schema: 'aitm.linked-plan-source/v1', key: observation.key,
    path: observation.path, contentSha256: observation.contentSha256,
    source: resolved.source, location: resolved.location };
  return { resolved, sourceBindings: bindingsForSource(resolved, linkedSource) };
}

function bindingsForSource(resolved, linkedSource) {
  return [
    { identity: 'user-story', hash: 'sha256:' + resolved.binding.storyDigest },
    { identity: 'story-intent', hash: 'sha256:' + resolved.binding.storyIntentDigest },
    { identity: 'linked-plan', hash: 'sha256:' + createHash('sha256').update(canonicalRecordJson(linkedSource), 'utf8').digest('hex') },
  ];
}

export function planSourceBindings(resolved, governedPlan) {
  let linkedSource = governedPlan;
  if (governedPlan.observation) {
    const observation = governedPlan.observation;
    if (!isGovernedPlanObservation(governedPlan, observation)) throw new TypeError('criteria-revision:plan-source-native-read');
    const actual = resolveStoryIntentSource({ body: observation.body, projectDir: observation.projectDir, governedPlan });
    if (!actual.ok || canonicalRecordJson(actual.binding) !== canonicalRecordJson(resolved.binding) || actual.source !== resolved.source ||
        canonicalRecordJson(actual.location) !== canonicalRecordJson(resolved.location)) throw new TypeError('criteria-revision:plan-source-native-resolution');
    linkedSource = { schema: 'aitm.linked-plan-source/v1', key: observation.key, path: observation.path,
      contentSha256: observation.contentSha256, source: actual.source, location: actual.location };
  }
  return bindingsForSource(resolved, linkedSource);
}
