// Create-time Story Origin helpers (#892).

import {
  findUnboldMetadataLabels,
  hasMetadataFields,
  metadataFieldValue,
  normalizeMetadataSection,
  normalizeMetadataValue,
  upsertMetadataField,
} from './metadata-section.mjs';

export const STORY_ORIGIN_HEADING = 'Story Origin';
export const STORY_ORIGIN_PROVENANCE_KEYS = Object.freeze([
  'kind',
  'discovered-during',
  'related',
  'blocks',
  'parent',
  'size-note',
  'size-guess',
]);

export function normalizeStoryOriginValue(value) {
  return normalizeMetadataValue(value);
}

export function normalizeStoryOriginSection(body) {
  return normalizeMetadataSection(body, STORY_ORIGIN_HEADING);
}

export function findUnboldStoryOriginLabels(body) {
  return findUnboldMetadataLabels(body, STORY_ORIGIN_HEADING);
}

export function hasStoryOriginFields(body) {
  return hasMetadataFields(body, STORY_ORIGIN_HEADING);
}

export function storyOriginFieldValue(body, key) {
  return metadataFieldValue(body, STORY_ORIGIN_HEADING, key);
}

export function upsertStoryOriginField(body, key, value) {
  return upsertMetadataField(body, STORY_ORIGIN_HEADING, key, value);
}
