// Plan Metadata compatibility wrappers (#488, #892).
//
// The public API stays stable while Story Origin and Plan Metadata share the
// same flat-label grammar and strict heading bounds.

import {
  findUnboldMetadataLabels,
  hasMetadataFields,
  normalizeMetadataLine,
  normalizeMetadataSection,
  normalizeMetadataValue,
  upsertMetadataField,
} from './metadata-section.mjs';

export const PLAN_METADATA_HEADING = 'Plan Metadata';

export const normalizePlanMetadataLine = normalizeMetadataLine;

export function normalizePlanMetadataValue(value) {
  return normalizeMetadataValue(value);
}

export function normalizePlanMetadataSection(body) {
  return normalizeMetadataSection(body, PLAN_METADATA_HEADING);
}

export function findUnboldPlanMetadataLabels(body) {
  return findUnboldMetadataLabels(body, PLAN_METADATA_HEADING);
}

export function hasPlanMetadataFields(body) {
  return hasMetadataFields(body, PLAN_METADATA_HEADING);
}

export function upsertPlanMetadataField(body, key, value) {
  return upsertMetadataField(body, PLAN_METADATA_HEADING, key, value);
}
