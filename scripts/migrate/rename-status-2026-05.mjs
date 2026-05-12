#!/usr/bin/env node
// One-shot migration: renames Status field options on the GitHub Project board
// and rewrites local .ai-task-manager/task-tracker.json keys to match.
// Idempotent — safe to re-run.
//
// Renames (option IDs preserved):
//   Grooming → Groom
//   Analysis → Analyze
//   Review   → Validate
//   R4R      → Review
//
// JSON key migrations:
//   kanbanOptionGrooming → kanbanOptionGroom
//   kanbanOptionAnalysis → kanbanOptionAnalyze
//   kanbanOptionReview   → kanbanOptionValidate
//   kanbanOptionR4R      → kanbanOptionReview
//   kanbanOptionReady, kanbanOptionInProgress, kanbanOptionInReview → deleted (deprecated aliases)
//
// Usage:
//   node scripts/migrate/rename-status-2026-05.mjs              # live run, reads project from local config
//   node scripts/migrate/rename-status-2026-05.mjs --dry-run    # plan only, no writes
//   node scripts/migrate/rename-status-2026-05.mjs --config-only   # skip board mutation, only rewrite JSON
//   node scripts/migrate/rename-status-2026-05.mjs --board-only    # skip JSON, only rename board
//   node scripts/migrate/rename-status-2026-05.mjs --config <path> # override config path

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gql } from '../gh/lib/github-projects.mjs';

export const NAME_RENAMES = {
  Grooming: 'Groom',
  Analysis: 'Analyze',
  Review: 'Validate',
  R4R: 'Review',
};

export const KEY_RENAMES = {
  kanbanOptionGrooming: 'kanbanOptionGroom',
  kanbanOptionAnalysis: 'kanbanOptionAnalyze',
  kanbanOptionReview: 'kanbanOptionValidate',
  kanbanOptionR4R: 'kanbanOptionReview',
};

export const DEPRECATED_KEYS = [
  'kanbanOptionReady',
  'kanbanOptionInProgress',
  'kanbanOptionInReview',
];

export const TARGET_NAMES = [
  'Backlog',
  'Groom',
  'Analyze',
  'Development',
  'Validate',
  'Review',
  'Done',
];

// Pure helper: returns { changed: bool, options: [...] } where options preserve
// id/color/description, only names rewritten via NAME_RENAMES. Idempotent — if
// the current names already match TARGET_NAMES, no rewrites are applied (this
// guards against the second-run case where "Review" exists as the new column
// name and would otherwise be re-renamed to "Validate").
export function rewriteOptions(options) {
  const currentNames = options.map((o) => o.name);
  const alreadyMigrated =
    currentNames.length === TARGET_NAMES.length &&
    currentNames.every((n, i) => n === TARGET_NAMES[i]);
  if (alreadyMigrated) return { changed: false, options: options.map((o) => ({ ...o })) };

  let changed = false;
  const out = options.map((o) => {
    const newName = NAME_RENAMES[o.name];
    if (newName && newName !== o.name) {
      changed = true;
      return { ...o, name: newName };
    }
    return { ...o };
  });
  return { changed, options: out };
}

export const TARGET_KANBAN_KEYS = [
  'kanbanOptionBacklog',
  'kanbanOptionGroom',
  'kanbanOptionAnalyze',
  'kanbanOptionDevelopment',
  'kanbanOptionValidate',
  'kanbanOptionReview',
  'kanbanOptionDone',
];

// Pure helper: returns { changed: bool, json: {...} } with renamed keys and
// deprecated keys removed. Idempotent — detects post-migration state via
// TARGET-only marker keys (Groom/Analyze/Validate cannot exist pre-migration).
//
// Why marker-based detection: `kanbanOptionReview` is both a SOURCE key (old
// name for now-Validate) and a TARGET key (new name for formerly-R4R). A naive
// `hasSource` check fires post-migration and re-renames the already-migrated
// `kanbanOptionReview` to `kanbanOptionValidate`, losing data.
export function rewriteJson(json) {
  const POST_MIGRATION_MARKERS = [
    'kanbanOptionGroom',
    'kanbanOptionAnalyze',
    'kanbanOptionValidate',
  ];
  const isPostMigration = POST_MIGRATION_MARKERS.some((k) => k in json);
  const hasDeprecated = DEPRECATED_KEYS.some((k) => k in json);
  if (isPostMigration && !hasDeprecated) {
    return { changed: false, json: { ...json } };
  }

  const out = { ...json };
  let changed = false;
  // Post-migration cleanup path: only strip deprecated keys; don't run renames.
  // Running renames here would treat the already-migrated `kanbanOptionReview`
  // as a source key and delete it.
  if (isPostMigration) {
    for (const k of DEPRECATED_KEYS) {
      if (k in out) {
        delete out[k];
        changed = true;
      }
    }
    return { changed, json: out };
  }

  for (const [oldKey, newKey] of Object.entries(KEY_RENAMES)) {
    if (oldKey in out) {
      if (!(newKey in out)) {
        out[newKey] = out[oldKey];
      }
      delete out[oldKey];
      changed = true;
    }
  }
  for (const k of DEPRECATED_KEYS) {
    if (k in out) {
      delete out[k];
      changed = true;
    }
  }
  return { changed, json: out };
}

async function fetchStatusField(projectId) {
  const data = await gql(
    `
    query($id: ID!) {
      node(id: $id) {
        ... on ProjectV2 {
          field(name: "Status") {
            ... on ProjectV2SingleSelectField {
              id
              options { id name color description }
            }
          }
        }
      }
    }
  `,
    { id: projectId }
  );
  return data?.node?.field;
}

async function updateStatusOptions(fieldId, options) {
  const sanitized = options.map((o) => ({
    id: o.id,
    name: o.name,
    color: o.color || 'GRAY',
    description: o.description || '',
  }));
  await gql(
    `
    mutation($fieldId: ID!, $options: [ProjectV2SingleSelectFieldOptionInput!]!) {
      updateProjectV2Field(input: {
        fieldId: $fieldId
        singleSelectOptions: $options
      }) { projectV2Field { ... on ProjectV2SingleSelectField { id } } }
    }
  `,
    { fieldId, options: sanitized }
  );
}

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  return process.argv[i + 1] || fallback;
}

function flag(name) {
  return process.argv.includes(name);
}

async function main() {
  const dryRun = flag('--dry-run');
  const configOnly = flag('--config-only');
  const boardOnly = flag('--board-only');
  const configPath = arg('--config', '.ai-task-manager/task-tracker.json');

  let projectId = '';
  let json = null;

  if (existsSync(configPath)) {
    json = JSON.parse(readFileSync(configPath, 'utf8'));
    projectId = json.projectId || '';
  } else if (!boardOnly) {
    console.error(`error: config not found at ${configPath}`);
    process.exit(1);
  }

  if (!boardOnly && !json) {
    console.error('error: cannot rewrite JSON without a config file');
    process.exit(1);
  }

  // Step 1: board rename
  if (!configOnly) {
    if (!projectId) {
      console.error('error: projectId not in config; cannot rename board options');
      process.exit(1);
    }
    const field = await fetchStatusField(projectId);
    if (!field) {
      console.error('error: Status field not found on project');
      process.exit(1);
    }
    const { changed, options } = rewriteOptions(field.options);
    if (!changed) {
      console.log('board: option names already in target form (no-op)');
    } else {
      console.log('board: renaming options:');
      for (const o of field.options) {
        const newName = NAME_RENAMES[o.name];
        if (newName) console.log(`  ${o.name} → ${newName}`);
      }
      if (!dryRun) {
        await updateStatusOptions(field.id, options);
        const verify = await fetchStatusField(projectId);
        const names = verify.options.map((o) => o.name);
        console.log(`board: post-rename order = [${names.join(', ')}]`);
      } else {
        console.log('board: --dry-run, skipping mutation');
      }
    }
  }

  // Step 2: JSON rename
  if (!boardOnly) {
    const { changed, json: rewritten } = rewriteJson(json);
    if (!changed) {
      console.log(`config: ${configPath} already in target form (no-op)`);
    } else {
      console.log(`config: rewriting ${configPath}:`);
      for (const [oldKey, newKey] of Object.entries(KEY_RENAMES)) {
        if (oldKey in json) console.log(`  ${oldKey} → ${newKey}`);
      }
      for (const k of DEPRECATED_KEYS) {
        if (k in json) console.log(`  delete ${k}`);
      }
      if (!dryRun) {
        writeFileSync(configPath, JSON.stringify(rewritten, null, 2) + '\n', 'utf8');
        console.log('config: written');
      } else {
        console.log('config: --dry-run, skipping write');
      }
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
