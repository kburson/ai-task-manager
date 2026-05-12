#!/usr/bin/env node
// One-shot migration: populate the new `Start time` TEXT field on every project
// item from the issue's timing-log first `start` row. Idempotent (skips writes
// when current value matches). Optional --delete-old-fields removes the
// deprecated `Start date` and `End date` DATE fields after writes complete.
//
// Usage:
//   node scripts/migrate/start-time-field.mjs              # live run
//   node scripts/migrate/start-time-field.mjs --dry-run    # plan only, no writes
//   node scripts/migrate/start-time-field.mjs --delete-old-fields
//
// The deprecated DATE field IDs may live under cfg.fieldIds.startDate /
// cfg.fieldIds.endDate, or directly on a fresh project the names "Start date"
// / "End date" are still discoverable. The flag is gated; default migration
// only writes the new field.

import { loadConfig } from '../task-tracker/config.mjs';
import { firstStartTimestamp } from '../task-tracker/gh-timing-comment.mjs';
import { gql, writeProjectFieldValue } from '../gh/lib/github-projects.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const deleteOldFields = args.includes('--delete-old-fields');

const cfg = loadConfig();
if (!cfg.projectId) {
  console.error('error: cfg.projectId not set; run init-project-config first');
  process.exit(1);
}
const startTimeFieldId = cfg.fieldIds?.startTime || cfg.fieldStartTime || '';
if (!startTimeFieldId && !deleteOldFields) {
  console.error(
    'error: cfg.fieldStartTime not set; run init-project-config to create the Start time field first'
  );
  process.exit(1);
}

async function fetchAllItems() {
  const items = [];
  let cursor = null;
  for (let page = 0; page < 50; page++) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const data = await gql(`{
      node(id: "${cfg.projectId}") {
        ... on ProjectV2 {
          items(first: 100${after}) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              content {
                ... on Issue { number title url repository { nameWithOwner } comments(first: 50) { nodes { body } } }
              }
              fieldValues(first: 50) {
                nodes {
                  ... on ProjectV2ItemFieldTextValue {
                    text
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
    if (!pv2) throw new Error(`Project not found: ${cfg.projectId}`);
    items.push(...pv2.items.nodes);
    if (!pv2.items.pageInfo.hasNextPage) break;
    cursor = pv2.items.pageInfo.endCursor;
  }
  return items;
}

function findTimingCommentBody(comments) {
  for (const c of comments ?? []) {
    if (c.body?.includes('⏱ Timing Log')) return c.body;
  }
  return null;
}

function currentStartTime(item) {
  const node = item.fieldValues.nodes.find((v) => v.field?.id === startTimeFieldId);
  return node?.text || '';
}

async function deleteField(fieldId, label) {
  if (!fieldId) return;
  console.log(`  ✗ deleting ${label} field (${fieldId})`);
  if (dryRun) return;
  await gql(
    `
    mutation($field: ID!) {
      deleteProjectV2Field(input: { fieldId: $field }) { projectV2Field { ... on ProjectV2Field { id } } }
    }`,
    { field: fieldId }
  );
}

async function main() {
  const items = await fetchAllItems();
  let writes = 0;
  let skipped = 0;
  let noTiming = 0;

  for (const item of items) {
    const issue = item.content;
    if (!issue?.number) continue;
    const timingBody = findTimingCommentBody(issue.comments?.nodes);
    if (!timingBody) {
      noTiming++;
      continue;
    }
    const ts = firstStartTimestamp(timingBody);
    if (!ts) {
      noTiming++;
      continue;
    }
    const current = currentStartTime(item);
    if (current === ts) {
      skipped++;
      continue;
    }
    writes++;
    console.log(`  #${issue.number} ${current ? `"${current}"` : '(empty)'} → "${ts}"`);
    if (dryRun) continue;
    await writeProjectFieldValue({
      projectId: cfg.projectId,
      itemId: item.id,
      fieldId: startTimeFieldId,
      value: { text: ts },
    });
  }

  console.log('');
  console.log(
    `Summary: ${writes} ${dryRun ? 'planned' : 'written'}, ${skipped} idempotent skips, ${noTiming} no-timing-log`
  );

  if (deleteOldFields) {
    console.log('');
    console.log('Deleting deprecated DATE fields:');
    const startDateId = cfg.fieldIds?.startDate || '';
    const endDateId = cfg.fieldIds?.endDate || '';
    await deleteField(startDateId, 'Start date');
    await deleteField(endDateId, 'End date');
    if (!dryRun) {
      console.log(
        'NOTE: clear cfg.fieldIds.startDate / endDate from .ai-task-manager/task-tracker.json manually if still present.'
      );
    }
  }
}

await main();
