#!/usr/bin/env node
// One-off: side-by-side Status field swap for kburson/options-co-pilot.
//
// Existing Status options: Backlog | Ready | In progress | In review | Done
// Target Status options:   Backlog | Groom | Analyze | Development | Validate | Review | Done
//
// Strategy:
//   1. --create   → create `_Status` SINGLE_SELECT with the 7 target options.
//   2. --translate → for every project item, copy current Status (mapped) into _Status.
//   3. --rename-status → update old Status options in place: rename 5 existing
//      options (Ready→Groom, In progress→Development, In review→Validate;
//      Backlog/Done unchanged), add 2 new (Analyze, Review). Existing option
//      IDs are preserved so already-set Status values auto-display new names.
//   4. --cleanup → delete `_Status` (custom field, OK to delete) and attempt
//      to delete `Iteration` (skips if not deletable).
//
// Each phase supports --dry-run. Run them in order, verifying between.

import { gql } from '../gh/lib/github-projects.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';

const PROJECT_ID = 'PVT_kwHOABCEY84BVBBe'; // @kburson's Options Copilot

if (import.meta.url === `file://${process.argv[1]}` && wantsHelp(process.argv.slice(2))) {
  emitSelfDoc('options-co-pilot-status-swap');
  process.exit(0);
}

const TARGET_OPTIONS = [
  { name: 'Backlog', color: 'GRAY', description: 'Unvetted ideas' },
  { name: 'Groom', color: 'BLUE', description: 'Sized + AC defined' },
  { name: 'Analyze', color: 'PURPLE', description: 'Deep-dive in progress' },
  { name: 'Development', color: 'YELLOW', description: 'Implementation' },
  { name: 'Validate', color: 'ORANGE', description: 'Self-validation pre-PR' },
  { name: 'Review', color: 'PURPLE', description: 'PR open / external review' },
  { name: 'Done', color: 'GREEN', description: 'Merged + closed' },
];

const STATUS_MAP = {
  Backlog: 'Backlog',
  Ready: 'Groom',
  'In progress': 'Development',
  'In review': 'Validate',
  Done: 'Done',
};

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const create = args.includes('--create');
const translate = args.includes('--translate');
const renameStatus = args.includes('--rename-status');
const cleanup = args.includes('--cleanup');

if (!create && !translate && !renameStatus && !cleanup) {
  console.error(
    'usage: options-co-pilot-status-swap.mjs --create|--translate|--rename-status|--cleanup [--dry-run]'
  );
  process.exit(1);
}

async function fetchFields() {
  const data = await gql(
    `
    query($id: ID!) {
      node(id: $id) {
        ... on ProjectV2 {
          fields(first: 100) {
            nodes {
              ... on ProjectV2FieldCommon { id name dataType }
              ... on ProjectV2SingleSelectField { id name dataType options { id name } }
            }
          }
        }
      }
    }`,
    { id: PROJECT_ID }
  );
  return data.node.fields.nodes;
}

function findField(fields, name) {
  return fields.find((f) => f?.name === name);
}

async function createUnderscoreStatus() {
  const fields = await fetchFields();
  if (findField(fields, '_Status')) {
    console.log('_Status already exists — skipping create');
    return;
  }
  console.log('creating _Status with options:', TARGET_OPTIONS.map((o) => o.name).join(', '));
  if (dryRun) {
    console.log('--dry-run: skipping mutation');
    return;
  }
  const data = await gql(
    `
    mutation($project: ID!, $name: String!, $opts: [ProjectV2SingleSelectFieldOptionInput!]!) {
      createProjectV2Field(input: {
        projectId: $project
        dataType: SINGLE_SELECT
        name: $name
        singleSelectOptions: $opts
      }) {
        projectV2Field {
          ... on ProjectV2SingleSelectField { id name options { id name } }
        }
      }
    }`,
    { project: PROJECT_ID, name: '_Status', opts: TARGET_OPTIONS }
  );
  const created = data.createProjectV2Field.projectV2Field;
  console.log(`created _Status (${created.id}) with ${created.options.length} options`);
}

async function fetchAllItemsWithStatus(statusFieldId, underscoreFieldId) {
  const items = [];
  let cursor = null;
  for (let page = 0; page < 50; page++) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const data = await gql(`{
      node(id: "${PROJECT_ID}") {
        ... on ProjectV2 {
          items(first: 100${after}) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              content { ... on Issue { number title } }
              fieldValues(first: 50) {
                nodes {
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    name
                    field { ... on ProjectV2FieldCommon { id } }
                  }
                }
              }
            }
          }
        }
      }
    }`);
    const pv2 = data.node;
    items.push(...pv2.items.nodes);
    if (!pv2.items.pageInfo.hasNextPage) break;
    cursor = pv2.items.pageInfo.endCursor;
  }
  return items.map((it) => {
    const cur = it.fieldValues.nodes.find((v) => v.field?.id === statusFieldId)?.name || null;
    const next = it.fieldValues.nodes.find((v) => v.field?.id === underscoreFieldId)?.name || null;
    return {
      itemId: it.id,
      issueNumber: it.content?.number,
      title: it.content?.title,
      currentStatus: cur,
      currentUnderscore: next,
    };
  });
}

async function translateStatusValues() {
  const fields = await fetchFields();
  const status = findField(fields, 'Status');
  const underscore = findField(fields, '_Status');
  if (!status) throw new Error('Status field not found');
  if (!underscore) throw new Error('_Status field not found — run --create first');

  const optionByName = Object.fromEntries(underscore.options.map((o) => [o.name, o.id]));
  for (const target of new Set(Object.values(STATUS_MAP))) {
    if (!optionByName[target]) throw new Error(`_Status missing target option: ${target}`);
  }

  const items = await fetchAllItemsWithStatus(status.id, underscore.id);
  console.log(`scanning ${items.length} project items`);

  let writes = 0;
  let skipped = 0;
  let unmapped = 0;
  let noStatus = 0;

  for (const it of items) {
    if (!it.currentStatus) {
      noStatus++;
      continue;
    }
    const target = STATUS_MAP[it.currentStatus];
    if (!target) {
      console.warn(`  #${it.issueNumber} unmapped status: "${it.currentStatus}"`);
      unmapped++;
      continue;
    }
    if (it.currentUnderscore === target) {
      skipped++;
      continue;
    }
    writes++;
    console.log(
      `  #${it.issueNumber} ${it.currentStatus} → ${target}${it.currentUnderscore ? ` (was _Status=${it.currentUnderscore})` : ''}`
    );
    if (dryRun) continue;
    await gql(
      `
      mutation($p: ID!, $i: ID!, $f: ID!, $o: String!) {
        updateProjectV2ItemFieldValue(input: { projectId: $p, itemId: $i, fieldId: $f, value: { singleSelectOptionId: $o } }) {
          projectV2Item { id }
        }
      }`,
      { p: PROJECT_ID, i: it.itemId, f: underscore.id, o: optionByName[target] }
    );
  }

  console.log('');
  console.log(
    `Summary: ${writes} ${dryRun ? 'planned' : 'written'}, ${skipped} idempotent skips, ${unmapped} unmapped, ${noStatus} no Status set`
  );
  if (unmapped > 0) {
    console.error('ERROR: unmapped statuses present — extend STATUS_MAP and re-run.');
    process.exit(2);
  }
}

// Renames the existing built-in Status field's options in place to the 7-state
// schema. Preserves existing option IDs for the 5 that map (so already-set
// Status values auto-pick up new names) and adds 2 new options (Analyze, Review).
//
// Old → New mapping (by name):
//   Backlog       → Backlog       (unchanged, ID preserved)
//   Ready         → Groom         (renamed, ID preserved)
//   In progress   → Development   (renamed, ID preserved)
//   In review     → Validate      (renamed, ID preserved)
//   Done          → Done          (unchanged, ID preserved)
// New options added without IDs: Analyze, Review.
async function renameStatusInPlace() {
  const fields = await fetchFields();
  const status = findField(fields, 'Status');
  if (!status) throw new Error('Status field not found');

  const RENAME = {
    Backlog: 'Backlog',
    Ready: 'Groom',
    'In progress': 'Development',
    'In review': 'Validate',
    Done: 'Done',
  };
  const NEW_NAMES = ['Analyze', 'Review'];

  // Detect already-renamed: if any current option name matches a target that
  // didn't exist pre-migration (Groom/Analyze/Development/Validate/Review),
  // assume migration already ran.
  const targets = new Set(['Groom', 'Analyze', 'Development', 'Validate', 'Review']);
  const alreadyRenamed = (status.options || []).some((o) => targets.has(o.name));
  if (alreadyRenamed) {
    console.log('Status options already include target names — skipping rename');
    return;
  }

  // Build target option list. Order: Backlog, Groom, Analyze, Development, Validate, Review, Done.
  const byCurrentName = Object.fromEntries((status.options || []).map((o) => [o.name, o]));
  const TARGET_BY_NAME = Object.fromEntries(TARGET_OPTIONS.map((t) => [t.name, t]));
  const desiredOrder = ['Backlog', 'Groom', 'Analyze', 'Development', 'Validate', 'Review', 'Done'];
  const newOptions = [];
  for (const name of desiredOrder) {
    const target = TARGET_BY_NAME[name];
    // Find which existing option (by old name) maps to this target.
    const oldName = Object.entries(RENAME).find(([, newName]) => newName === name)?.[0];
    const existing = oldName ? byCurrentName[oldName] : null;
    if (existing) {
      newOptions.push({
        id: existing.id,
        name: target.name,
        color: target.color,
        description: target.description,
      });
    } else if (NEW_NAMES.includes(name)) {
      newOptions.push({ name: target.name, color: target.color, description: target.description });
    } else {
      throw new Error(`unmapped target option ${name}`);
    }
  }

  console.log('plan: update Status options to →');
  for (const o of newOptions) {
    console.log(`  ${o.id ? `[${o.id}] ` : '[new]    '}${o.name} (${o.color})`);
  }
  if (dryRun) {
    console.log('--dry-run: skipping mutation');
    return;
  }

  await gql(
    `
    mutation($field: ID!, $options: [ProjectV2SingleSelectFieldOptionInput!]!) {
      updateProjectV2Field(input: { fieldId: $field, singleSelectOptions: $options }) {
        projectV2Field {
          ... on ProjectV2SingleSelectField { id name options { id name } }
        }
      }
    }`,
    { field: status.id, options: newOptions }
  );

  const after = await fetchFields();
  const verify = findField(after, 'Status');
  console.log(`Status options now: [${(verify.options || []).map((o) => o.name).join(', ')}]`);
}

// Deletes _Status and attempts to delete Iteration. Tolerant of "Only custom
// fields can be deleted" errors — reports and continues.
async function cleanupExtras() {
  const fields = await fetchFields();
  const underscore = findField(fields, '_Status');
  const iteration = findField(fields, 'Iteration');

  console.log('plan:');
  console.log(underscore ? `  delete _Status (${underscore.id})` : '  _Status absent');
  console.log(iteration ? `  attempt delete Iteration (${iteration.id})` : '  Iteration absent');
  if (dryRun) {
    console.log('--dry-run: skipping mutations');
    return;
  }

  if (underscore) {
    await gql(
      `
      mutation($f: ID!) {
        deleteProjectV2Field(input: { fieldId: $f }) { projectV2Field { ... on ProjectV2FieldCommon { id } } }
      }`,
      { f: underscore.id }
    );
    console.log(`deleted _Status`);
  }
  if (iteration) {
    try {
      await gql(
        `
        mutation($f: ID!) {
          deleteProjectV2Field(input: { fieldId: $f }) { projectV2Field { ... on ProjectV2FieldCommon { id } } }
        }`,
        { f: iteration.id }
      );
      console.log(`deleted Iteration`);
    } catch (e) {
      if (/Only custom fields can be deleted/.test(e.message)) {
        console.warn(`Iteration is built-in and cannot be deleted — leaving in place`);
      } else {
        throw e;
      }
    }
  }
}

async function main() {
  if (create) await createUnderscoreStatus();
  if (translate) await translateStatusValues();
  if (renameStatus) await renameStatusInPlace();
  if (cleanup) await cleanupExtras();
}

await main();
