// @story #2039 #2055
// Pure retention only. Callers first verify the store's manifest and payloads.
// An allowed decision grants no ownership, transfer, or cloud publication authority.
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { storyIdentityKey } from './manifest.mjs';
const operations = new Set(['purge', 'refresh', 'reassign', 'migrate']);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const cursor = (value) =>
  value === null || (typeof value === 'string' && value.length > 0 && !/[\s\p{Cc}]/u.test(value));
const digest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const decision = (allowed, reason) => Object.freeze({ allowed, reason });
export function cacheRetentionDecision(input = {}) {
  if (!object(input) || !operations.has(input.operation))
    return decision(false, 'unknown-operation');
  try {
    const generation = JSON.parse(canonicalRecordJson(input.generation));
    if (!object(generation) || generation.schema !== 'aitm.story-cache-generation/v1')
      return decision(false, 'invalid-generation');
    storyIdentityKey(generation.identity);
    if (
      !Number.isSafeInteger(generation.generation) ||
      generation.generation < 1 ||
      !Number.isSafeInteger(generation.publicationGeneration) ||
      generation.publicationGeneration < 0 ||
      generation.publicationGeneration > generation.generation ||
      !Array.isArray(generation.dirtyKeys) ||
      !Array.isArray(generation.conflicts) ||
      !object(generation.working) ||
      !object(generation.baseSnapshot) ||
      generation.baseSnapshot.complete !== true ||
      !object(generation.baseSnapshot.resources)
    )
      return decision(false, 'invalid-generation');
    if (generation.dirtyKeys.length) return decision(false, 'dirty');
    if (generation.conflicts.length) return decision(false, 'conflict');
    // Even confirmed journals remain until their owner explicitly settles them.
    // Policy never silently clears recovery data to make a generation clean.
    if (generation.batch !== null) return decision(false, 'retained-publication');
    for (const [key, entry] of Object.entries(generation.working)) {
      const base = Object.hasOwn(generation.baseSnapshot.resources, key)
        ? generation.baseSnapshot.resources[key]
        : null;
      if (
        !object(entry) ||
        !object(base) ||
        !digest(entry.digest) ||
        !digest(base.digest) ||
        entry.digest !== base.digest
      )
        return decision(false, 'unpublished-working-data');
    }
    const timing = generation.timing;
    if (
      !object(timing) ||
      !Array.isArray(timing.events) ||
      !cursor(timing.ingestedCursor) ||
      !cursor(timing.publishedCursor)
    )
      return decision(false, 'invalid-timing');
    if (timing.events.length || timing.ingestedCursor !== timing.publishedCursor)
      return decision(false, 'retained-timing');
    return decision(true, 'clean');
  } catch {
    return decision(false, 'invalid-generation');
  }
}
