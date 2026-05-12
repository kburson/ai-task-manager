#!/usr/bin/env node
// Map in-flight project items from the legacy 6-state Status vocabulary
// (Ready / In Progress / In Review / R4R) onto the 7-state model
// (Groom / Development / Review). Idempotent — safe to re-run.
//
// Usage:
//   node scripts/migrate/migrate-to-7-state.mjs              # --dry-run (default)
//   node scripts/migrate/migrate-to-7-state.mjs --apply      # perform writes
//   node scripts/migrate/migrate-to-7-state.mjs --config <path>
//
// Reads project + Status field IDs from .ai-task-manager/task-tracker.json.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gql } from '../gh/lib/github-projects.mjs';
import { mapOption } from './lib/state-map.mjs';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const DRY_RUN = !APPLY;
const cfgIdx = argv.indexOf('--config');
const CFG_PATH = cfgIdx >= 0 ? argv[cfgIdx + 1] : '.ai-task-manager/task-tracker.json';
const THROTTLE_MS = 250;

function loadCfg() {
  const p = path.resolve(CFG_PATH);
  if (!existsSync(p)) {
    console.error(`migrate-to-7-state: config not found at ${p}`);
    process.exit(2);
  }
  return JSON.parse(readFileSync(p, 'utf8'));
}

async function fetchStatusOptions(projectId, fieldId) {
  const data = await gql(
    `
    query($project: ID!) {
      node(id: $project) {
        ... on ProjectV2 {
          fields(first: 50) {
            nodes {
              ... on ProjectV2SingleSelectField { id name options { id name } }
            }
          }
        }
      }
    }`,
    { project: projectId }
  );
  const fields = data?.node?.fields?.nodes || [];
  const statusField =
    fields.find((f) => f && f.id === fieldId) ||
    fields.find((f) => f && (f.name || '').toLowerCase() === 'status');
  const opts = statusField?.options || [];
  return Object.fromEntries(opts.map((o) => [o.name, o.id]));
}

async function* iterateItems(projectId, _fieldId) {
  let cursor = null;
  while (true) {
    const data = await gql(
      `
      query($project: ID!, $cursor: String) {
        node(id: $project) {
          ... on ProjectV2 {
            items(first: 100, after: $cursor) {
              pageInfo { hasNextPage endCursor }
              nodes {
                id
                content {
                  ... on Issue { number title state }
                  ... on PullRequest { number title state }
                }
                fieldValueByName(name: "Status") {
                  ... on ProjectV2ItemFieldSingleSelectValue { name optionId }
                }
              }
            }
          }
        }
      }`,
      { project: projectId, cursor }
    );
    const page = data?.node?.items;
    for (const node of page?.nodes || []) yield node;
    if (!page?.pageInfo?.hasNextPage) break;
    cursor = page.pageInfo.endCursor;
  }
}

async function writeStatus({ projectId, itemId, fieldId, optionId }) {
  await gql(
    `
    mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $project, itemId: $item, fieldId: $field,
        value: { singleSelectOptionId: $option }
      }) { projectV2Item { id } }
    }`,
    { project: projectId, item: itemId, field: fieldId, option: optionId }
  );
}

async function main() {
  const cfg = loadCfg();
  const { projectId, kanbanFieldId } = cfg;
  if (!projectId || !kanbanFieldId) {
    console.error('migrate-to-7-state: projectId or kanbanFieldId missing in config');
    process.exit(2);
  }
  const optionsByName = await fetchStatusOptions(projectId, kanbanFieldId);
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Project: ${projectId}`);
  console.log(`Status field: ${kanbanFieldId}`);
  console.log(`Status options: ${Object.keys(optionsByName).join(', ')}`);
  console.log('');

  const planned = [];
  const errors = [];
  for await (const item of iterateItems(projectId, kanbanFieldId)) {
    const currentName = item.fieldValueByName?.name || null;
    const title = item.content?.title || `(no content)`;
    const num = item.content?.number ?? '?';
    if (!currentName) continue;
    let mapping;
    try {
      mapping = mapOption(currentName, optionsByName);
    } catch (e) {
      errors.push({ num, title, error: e.message });
      continue;
    }
    if (!mapping) continue;
    planned.push({
      itemId: item.id,
      num,
      title,
      from: currentName,
      to: mapping.targetOptionName,
      optionId: mapping.targetOptionId,
    });
  }

  if (errors.length) {
    console.error('Errors:');
    for (const e of errors) console.error(`  #${e.num} ${e.title}: ${e.error}`);
  }

  if (planned.length === 0) {
    console.log('0 items to migrate (board already on 7-state vocabulary).');
    process.exit(errors.length ? 1 : 0);
  }

  console.log(`${planned.length} item(s) to migrate:`);
  for (const p of planned) console.log(`  #${p.num} ${p.title.slice(0, 60)} | ${p.from} → ${p.to}`);

  if (DRY_RUN) {
    console.log('\nDry run — no changes written. Re-run with --apply to perform writes.');
    process.exit(errors.length ? 1 : 0);
  }

  console.log('\nApplying...');
  for (const p of planned) {
    await writeStatus({
      projectId,
      itemId: p.itemId,
      fieldId: kanbanFieldId,
      optionId: p.optionId,
    });
    console.log(`  ✓ #${p.num} → ${p.to}`);
    await new Promise((r) => setTimeout(r, THROTTLE_MS));
  }
  console.log(`\nMigrated ${planned.length} item(s).`);
  process.exit(errors.length ? 1 : 0);
}

const isMain = import.meta.url.endsWith(process.argv[1].replace(/^.*?(scripts\/migrate\/)/, '$1'));
if (isMain || process.argv[1].endsWith('migrate-to-7-state.mjs')) {
  main().catch((err) => {
    console.error(err.stack || err.message);
    process.exit(1);
  });
}
