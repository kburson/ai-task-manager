#!/usr/bin/env node
// Repair an existing .ai-task-manager/task-tracker.json by backfilling empty
// kanbanOption* fields and provisioning additive package-defined fields that
// terminal workflow correctness requires.
//
// Usage: node scripts/gh/init-repair.mjs
//
// Idempotent: never overwrites a populated kanbanOption* field. Reports which
// keys were filled, which were already set, and which could not be matched.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { gql } from './lib/github-projects.mjs';
import { getProjectDir } from '../task-tracker/paths.mjs';
import { stateConfigKey, stateIds } from '../task-tracker/lib/lifecycle-policy/index.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';

if (import.meta.url === `file://${process.argv[1]}` && wantsHelp(process.argv.slice(2))) {
  emitSelfDoc('init-repair');
  process.exit(0);
}

// Injectable seam (#648): production wiring defaults to the real node:fs calls,
// the shared gql binding, and getProjectDir. Tests override these to drive the
// backfill/match/write branches offline without touching the filesystem or the
// live board. Behaviour-preserving — every default is the original binding.
export const deps = {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  gql,
  getProjectDir,
  log: (s) => console.log(s),
  err: (s) => process.stderr.write(s),
  exit: (c) => process.exit(c),
};

export const OPTION_KEYS = Object.freeze(
  Object.fromEntries(
    stateIds().map((state) => [
      stateConfigKey(state),
      state === 'ready-for-plan' ? 'ready for planning' : state.replaceAll('-', ' '),
    ])
  )
);

function configPath(d = deps) {
  return path.join(d.getProjectDir(), '.ai-task-manager', 'task-tracker.json');
}

function loadDispositionDefinition(d = deps) {
  const candidates = [
    path.join(d.getProjectDir(), '.ai-task-manager', 'project-fields.json'),
    new URL('../../config/project-fields.default.json', import.meta.url),
  ];
  for (const candidate of candidates) {
    try {
      const defs = JSON.parse(d.readFileSync(candidate, 'utf8'));
      if (!Array.isArray(defs)) continue;
      const definition = defs.find((field) => field?.key === 'disposition');
      if (definition) return definition;
    } catch {
      // Optional local definition may be absent or stale; continue to package
      // defaults before deciding the installed package has no such field.
    }
  }
  return null;
}

export function persistDispositionField(cfg, fieldId) {
  if (!fieldId) return false;
  const nextFieldIds = { ...(cfg.fieldIds || {}), disposition: fieldId };
  const changed = cfg.fieldDisposition !== fieldId || cfg.fieldIds?.disposition !== fieldId;
  if (!changed) return false;
  cfg.fieldDisposition = fieldId;
  cfg.fieldIds = nextFieldIds;
  return true;
}

export async function fetchProjectFields(projectId, gqlFn = deps.gql) {
  const data = await gqlFn(
    `
    query($project: ID!) {
      node(id: $project) {
        ... on ProjectV2 {
          fields(first: 100) {
            nodes {
              ... on ProjectV2Field { id name dataType }
              ... on ProjectV2SingleSelectField {
                id
                name
                options { id name color description }
              }
            }
          }
        }
      }
    }`,
    { project: projectId }
  );
  return data?.node?.fields?.nodes || [];
}

function optionWriteShape(option, existing) {
  const next = {
    name: option.name,
    color: option.color,
    description: option.description,
  };
  if (existing?.id) return { id: existing.id, ...next };
  return next;
}

const PROJECT_OPTION_COLORS = new Set([
  'GRAY',
  'BLUE',
  'GREEN',
  'YELLOW',
  'ORANGE',
  'RED',
  'PINK',
  'PURPLE',
]);

function isBoundedProviderString(value, maximumBytes, { allowEmpty = false } = {}) {
  return (
    typeof value === 'string' &&
    (allowEmpty || value.length > 0) &&
    value === value.trim() &&
    value.isWellFormed() &&
    Buffer.byteLength(value, 'utf8') <= maximumBytes &&
    ![...value].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    })
  );
}

function validateObservedOptions(field, definitionName) {
  if (!isBoundedProviderString(field.id, 256)) {
    throw new Error(`init-repair: field "${definitionName}" has a malformed id; refusing repair`);
  }
  const ids = new Set();
  const names = new Set();
  for (const option of field.options) {
    const keys =
      option && typeof option === 'object' && !Array.isArray(option)
        ? Object.keys(option).sort()
        : [];
    const expectedKeys = ['color', 'description', 'id', 'name'];
    const exactShape =
      keys.length === expectedKeys.length &&
      keys.every((key, index) => key === expectedKeys[index]);
    const normalizedName = typeof option?.name === 'string' ? option.name.toLowerCase() : '';
    if (
      !exactShape ||
      !isBoundedProviderString(option.id, 256) ||
      ids.has(option.id) ||
      !isBoundedProviderString(option.name, 256) ||
      names.has(normalizedName) ||
      !PROJECT_OPTION_COLORS.has(option.color) ||
      !isBoundedProviderString(option.description, 1024, { allowEmpty: true })
    ) {
      throw new Error(
        `init-repair: field "${definitionName}" has malformed or ambiguous options; refusing repair`
      );
    }
    ids.add(option.id);
    names.add(normalizedName);
  }
}

export async function ensureDispositionField({ projectId, definition, gqlFn = deps.gql } = {}) {
  if (!projectId) throw new Error('ensureDispositionField: projectId is required');
  if (!definition?.name || !Array.isArray(definition.options)) {
    throw new Error('ensureDispositionField: a single-select definition is required');
  }

  const fields = await fetchProjectFields(projectId, gqlFn);
  const matchingFields = fields.filter(
    (candidate) => String(candidate?.name || '').toLowerCase() === definition.name.toLowerCase()
  );
  if (matchingFields.length > 1) {
    throw new Error(
      `init-repair: ambiguous duplicate "${definition.name}" fields; refusing repair`
    );
  }
  const field = matchingFields[0];
  if (!field) {
    const data = await gqlFn(
      `
      mutation(
        $project: ID!
        $name: String!
        $options: [ProjectV2SingleSelectFieldOptionInput!]!
      ) {
        createProjectV2Field(
          input: {
            projectId: $project
            dataType: SINGLE_SELECT
            name: $name
            singleSelectOptions: $options
          }
        ) {
          projectV2Field { ... on ProjectV2SingleSelectField { id } }
        }
      }`,
      {
        project: projectId,
        name: definition.name,
        options: definition.options.map((option) => optionWriteShape(option)),
      }
    );
    const fieldId = data?.createProjectV2Field?.projectV2Field?.id || '';
    if (!fieldId) throw new Error(`init-repair: failed to create ${definition.name} field`);
    return { fieldId, created: true, optionsUpdated: false };
  }
  if (!Array.isArray(field.options)) {
    throw new Error(
      `init-repair: field "${definition.name}" exists but is not a single-select field`
    );
  }

  validateObservedOptions(field, definition.name);

  const existingByName = new Map();
  for (const option of field.options) {
    const normalizedName = String(option?.name || '').toLowerCase();
    existingByName.set(normalizedName, option);
  }
  for (const option of definition.options) {
    const existing = existingByName.get(option.name.toLowerCase());
    if (
      existing &&
      (existing.name !== option.name ||
        existing.color !== option.color ||
        existing.description !== option.description)
    ) {
      throw new Error(
        `init-repair: existing "${option.name}" option differs from the canonical definition; refusing repair`
      );
    }
  }
  const currentComparable = field.options.map(({ id, name, color, description }) => ({
    id,
    name,
    color,
    description,
  }));
  const missingCanonical = definition.options.filter(
    (option) => !existingByName.has(option.name.toLowerCase())
  );
  const desired = [
    ...currentComparable,
    ...missingCanonical.map((option) => optionWriteShape(option)),
  ];
  if (JSON.stringify(currentComparable) === JSON.stringify(desired)) {
    return { fieldId: field.id, created: false, optionsUpdated: false };
  }

  await gqlFn(
    `
    mutation(
      $field: ID!
      $options: [ProjectV2SingleSelectFieldOptionInput!]!
    ) {
      updateProjectV2Field(
        input: { fieldId: $field, singleSelectOptions: $options }
      ) {
        projectV2Field { ... on ProjectV2SingleSelectField { id } }
      }
    }`,
    { field: field.id, options: desired }
  );
  return { fieldId: field.id, created: false, optionsUpdated: true };
}

export async function fetchStatusOptions(projectId, kanbanFieldId, gqlFn = deps.gql) {
  const data = await gqlFn(
    `
    query($proj: ID!) {
      node(id: $proj) {
        ... on ProjectV2 {
          fields(first: 50) {
            nodes {
              ... on ProjectV2SingleSelectField { id name options { id name } }
            }
          }
        }
      }
    }`,
    { proj: projectId }
  );
  const fields = data?.node?.fields?.nodes || [];
  const statusField =
    fields.find((f) => f && f.id === kanbanFieldId) ||
    fields.find((f) => f && (f.name || '').toLowerCase() === 'status');
  return statusField?.options || [];
}

function loadOptionsFromEnv() {
  const raw = process.env.TT_REPAIR_FAKE_OPTIONS;
  if (!raw) return null;
  return JSON.parse(raw);
}

export function migrateLegacyAssignedConfig(cfg) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return false;
  const legacyPresent = ['kanbanOptionAssigned', 'kanbanOptionOnDeck'].some((key) =>
    Object.prototype.hasOwnProperty.call(cfg, key)
  );
  if (!legacyPresent) return false;
  const configured = [
    cfg.kanbanOptionReadyForPlan,
    cfg.kanbanOptionAssigned,
    cfg.kanbanOptionOnDeck,
  ].filter(Boolean);
  if (new Set(configured).size > 1) {
    throw new Error('init-repair: Ready for Planning compatibility keys conflict; refusing repair');
  }
  cfg.kanbanOptionReadyForPlan ||= cfg.kanbanOptionAssigned || cfg.kanbanOptionOnDeck;
  delete cfg.kanbanOptionAssigned;
  delete cfg.kanbanOptionOnDeck;
  return true;
}

export async function runRepair(overrides = {}) {
  const d = { ...deps, ...overrides };
  const skipNetwork =
    overrides.skipNetwork !== undefined
      ? overrides.skipNetwork
      : process.env.TT_SKIP_NETWORK === '1';
  const fakeOptions =
    overrides.fakeOptions !== undefined ? overrides.fakeOptions : loadOptionsFromEnv();
  const fakeDispositionFields =
    overrides.fakeDispositionFields !== undefined
      ? overrides.fakeDispositionFields
      : process.env.TT_REPAIR_FAKE_FIELDS
        ? JSON.parse(process.env.TT_REPAIR_FAKE_FIELDS)
        : null;

  const cfgPath = configPath(d);
  if (!d.existsSync(cfgPath)) {
    d.err(`No config found at ${cfgPath}. Run: npx ai-task-manager init\n`);
    return d.exit(1);
  }
  const cfg = JSON.parse(d.readFileSync(cfgPath, 'utf8'));
  const legacyConfigChanged = migrateLegacyAssignedConfig(cfg);
  if (!cfg.projectId || !cfg.kanbanFieldId) {
    d.err('Config is missing projectId or kanbanFieldId. Run: npx ai-task-manager init\n');
    return d.exit(1);
  }

  const empties = Object.keys(OPTION_KEYS).filter((k) => !cfg[k]);
  let options = [];
  if (empties.length > 0) {
    if (skipNetwork) {
      options = fakeOptions || [];
    } else {
      options = await fetchStatusOptions(cfg.projectId, cfg.kanbanFieldId, d.gql);
    }
  }

  const byName = new Map(options.map((o) => [String(o.name || '').toLowerCase(), o.id]));
  const filled = [];
  const unmatched = [];
  for (const key of empties) {
    const id = byName.get(OPTION_KEYS[key]);
    if (id) {
      cfg[key] = id;
      filled.push(key);
    } else unmatched.push(key);
  }

  const dispositionDefinition =
    overrides.dispositionDefinition === undefined
      ? loadDispositionDefinition(d)
      : overrides.dispositionDefinition;
  let disposition = null;
  let dispositionChanged = false;
  if (dispositionDefinition && (!skipNetwork || Array.isArray(fakeDispositionFields))) {
    const dispositionGql = Array.isArray(fakeDispositionFields)
      ? async (query) => {
          if (query.includes('fields(first: 100)')) {
            return { node: { fields: { nodes: fakeDispositionFields } } };
          }
          throw new Error('offline disposition repair cannot create or update fields');
        }
      : d.gql;
    disposition = await ensureDispositionField({
      projectId: cfg.projectId,
      definition: dispositionDefinition,
      gqlFn: dispositionGql,
    });
    dispositionChanged = persistDispositionField(cfg, disposition.fieldId);
  }

  if (filled.length > 0 || dispositionChanged || legacyConfigChanged) {
    d.mkdirSync(path.dirname(cfgPath), { recursive: true });
    d.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  }

  if (empties.length === 0 && !dispositionChanged && !legacyConfigChanged) {
    d.log('All kanbanOption* fields already populated. Nothing to repair.');
  }
  d.log(`Filled: ${filled.length === 0 ? '(none)' : filled.join(', ')}`);
  if (legacyConfigChanged) {
    d.log(
      'Migrated: legacy Assigned/On Deck config → kanbanOptionReadyForPlan (option id preserved)'
    );
  }
  const alreadySet = Object.keys(OPTION_KEYS).filter((k) => !empties.includes(k));
  if (alreadySet.length) d.log(`Already set: ${alreadySet.join(', ')}`);
  if (unmatched.length) {
    d.log(
      `Unmatched (no option named ${unmatched.map((k) => `"${OPTION_KEYS[k]}"`).join(', ')} on Status field): ${unmatched.join(', ')}`
    );
    d.log('  → Add the missing column(s) to the GitHub Project Status field, then re-run repair.');
  }
  if (disposition?.created) d.log(`Created: ${dispositionDefinition.name}`);
  else if (disposition?.optionsUpdated) d.log(`Updated options: ${dispositionDefinition.name}`);
  else if (disposition?.fieldId) d.log(`Already set: ${dispositionDefinition.name}`);
  return { filled, alreadySet, unmatched, disposition, legacyConfigChanged };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  runRepair().catch((e) => {
    process.stderr.write(`Repair failed: ${e.message}\n`);
    process.exit(1);
  });
}
