// @story #560
// Config authoring/merge extracted from the inline `node -e` block in
// scripts/gh/init-project-config.sh (Step 5). The behavior is identical:
//   - load the existing .ai-task-manager/task-tracker.json (falling back to a
//     legacy .claude/ copy when the new path is absent),
//   - overwrite the required field-id keys unconditionally,
//   - write optional keys only when non-empty (never clobber a hand-set value
//     with an empty string from a field that wasn't discovered),
//   - shallow-merge a fieldIds JSON blob when it carries any keys,
//   - serialize with two-space indent and a trailing newline.

import fs from 'node:fs';
import { SHARED_DIR_SEGMENT, LEGACY_CLAUDE_DIR } from '../../paths.mjs';

// Map of config key → environment variable that supplies it. The required set
// is always written; the optional set is written only when the env value is
// truthy (matches the bash `if (v) updates[k] = v` guard).
const REQUIRED_ENV = {
  repo: 'REPO',
  projectId: 'PROJECT_NODE_ID',
  kanbanFieldId: 'KANBAN_FIELD_ID',
  kanbanOptionBacklog: 'OPTION_BACKLOG',
  kanbanOptionAssigned: 'OPTION_ASSIGNED',
  kanbanOptionRefine: 'OPTION_REFINE',
  kanbanOptionPlan: 'OPTION_PLAN',
  kanbanOptionDevelop: 'OPTION_DEVELOP',
  kanbanOptionTest: 'OPTION_TEST',
  kanbanOptionReview: 'OPTION_REVIEW',
  kanbanOptionDone: 'OPTION_DONE',
  priorityFieldId: 'PRIORITY_FIELD_ID',
  priorityOptionP0: 'OPTION_P0',
  priorityOptionP1: 'OPTION_P1',
  priorityOptionP2: 'OPTION_P2',
  priorityOptionP3: 'OPTION_P3',
};

const OPTIONAL_ENV = {
  sizeFieldId: 'SIZE_FIELD_ID',
  fieldEstimate: 'FIELD_ESTIMATE',
  fieldEngagedTime: 'FIELD_ENGAGED_TIME',
  fieldSessionTime: 'FIELD_SESSION_TIME',
  fieldRank: 'FIELD_RANK',
  rankFieldId: 'FIELD_RANK',
  fieldStartTime: 'FIELD_START_TIME',
  fieldBlockedBy: 'FIELD_BLOCKED_BY',
  fieldDisposition: 'FIELD_DISPOSITION',
  fieldReviewTime: 'FIELD_REVIEW_TIME',
  fieldPlanTime: 'FIELD_PLAN_TIME',
};

// buildUpdates(env) → the updates object that gets Object.assign'd over the
// existing config. Pure: no I/O, deterministic from env alone.
export function buildUpdates(env = {}) {
  const updates = {};
  for (const [key, varName] of Object.entries(REQUIRED_ENV)) {
    updates[key] = env[varName];
  }
  for (const [key, varName] of Object.entries(OPTIONAL_ENV)) {
    if (env[varName]) updates[key] = env[varName];
  }
  try {
    const fieldIds = JSON.parse(env.FIELD_IDS_JSON || '{}');
    if (Object.keys(fieldIds).length) updates.fieldIds = fieldIds;
  } catch {
    /* malformed FIELD_IDS_JSON is ignored, exactly as the bash try/catch did */
  }
  return updates;
}

// mergeConfig(existing, env) → the config object to serialize. Pure.
export function mergeConfig(existing = {}, env = {}) {
  const normalized = normalizeExistingConfig(existing);
  return Object.assign(normalized, buildUpdates(env));
}

// normalizeExistingConfig(existing) validates and canonicalizes the one-release
// Assigned config-key fallback without writing anything. Keeping this separate
// lets the interactive shell fail closed before it performs any project
// mutation, while writeConfig reuses the exact same conflict rule.
export function normalizeExistingConfig(existing = {}) {
  const normalized = { ...existing };
  if (
    normalized.kanbanOptionOnDeck &&
    normalized.kanbanOptionAssigned &&
    normalized.kanbanOptionOnDeck !== normalized.kanbanOptionAssigned
  ) {
    throw new Error(
      'config-init: kanbanOptionOnDeck conflicts with kanbanOptionAssigned; refusing repair'
    );
  }
  normalized.kanbanOptionAssigned ||= normalized.kanbanOptionOnDeck;
  delete normalized.kanbanOptionOnDeck;
  return normalized;
}

// loadExisting(file, deps) → parsed config from `file`, or from the legacy
// .claude/ path, or {} when neither parses. Mirrors the bash double try/catch.
export function loadExisting(file, deps = {}) {
  const reader = deps.readFileSync || fs.readFileSync;
  const legacyFile = file.replace(SHARED_DIR_SEGMENT, `/${LEGACY_CLAUDE_DIR}/`);
  try {
    return JSON.parse(reader(file, 'utf8'));
  } catch {
    try {
      return JSON.parse(reader(legacyFile, 'utf8'));
    } catch {
      return {};
    }
  }
}

// preflightConfig({file}, deps) performs the read + compatibility validation
// phase only. It deliberately has no writer dependency and cannot mutate the
// config or GitHub project.
export function preflightConfig({ file }, deps = {}) {
  return normalizeExistingConfig(loadExisting(file, deps));
}

// serializeConfig(config) → the exact on-disk string (2-space indent + \n).
export function serializeConfig(config) {
  return JSON.stringify(config, null, 2) + '\n';
}

// writeConfig({file, env}, deps) → performs the full load → merge → write,
// returning the merged object. The thin shim in init-project-config.sh calls
// this in place of the old inline `node -e`.
export function writeConfig({ file, env = process.env }, deps = {}) {
  const writer = deps.writeFileSync || fs.writeFileSync;
  const existing = loadExisting(file, deps);
  const merged = mergeConfig(existing, env);
  writer(file, serializeConfig(merged));
  return merged;
}
