#!/usr/bin/env node
// One-off: heal every kburson/options-co-pilot issue body by appending the AITM
// fields-block (`<!-- ai-task-manager:fields:start -->` … `:end -->`) populated
// from the project's custom field values. Operates remotely — no local clone
// of options-co-pilot required.
//
// Covers all 209 issues (open + closed). Skips issues that already have a
// fields-block matching the computed values (idempotent). Use --dry-run to
// preview writes without touching anything.
//
// Field name → AITM key mapping (matches what re-init will produce via aliases):
//   "Priority"             → priority         (single_select)
//   "Size"                 → size             (single_select)
//   "Estimate"             → estimate         (number)
//   "Actual Hours"         → engagedTime      (number, alias)
//   "Actual Session Time"  → sessionTime      (number, alias)
//   "Context Length"       → contextLength    (preserved verbatim, retired in AITM)
//   "Sequence"             → sequence         (number)
//
// Status, Iteration, and the GitHub built-ins (Title/Assignees/etc.) are not
// part of the body block and are ignored here.

import { gh, gql } from '../gh/lib/github-projects.mjs';
import { ensureIssueFieldDb } from '../task-tracker/issue-field-db.mjs';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const REPO = 'kburson/options-co-pilot';
const PROJECT_ID = 'PVT_kwHOABCEY84BVBBe';

// AITM key → project field name for options-co-pilot. Order here also defines
// the order of keys in the body fields-block (via fieldDefs passed to
// ensureIssueFieldDb), keeping diffs readable.
const FIELD_DEFS = [
  { key: 'priority',      name: 'Priority',            type: 'single_select' },
  { key: 'size',          name: 'Size',                type: 'single_select' },
  { key: 'estimate',      name: 'Estimate',            type: 'number' },
  { key: 'engagedTime',   name: 'Actual Hours',        type: 'number' },
  { key: 'sessionTime',   name: 'Actual Session Time', type: 'number' },
  { key: 'contextLength', name: 'Context Length',     type: 'number' },
  { key: 'sequence',      name: 'Sequence',            type: 'number' },
];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;

async function fetchProjectFieldIds() {
  const data = await gql(`
    query($id: ID!) {
      node(id: $id) {
        ... on ProjectV2 {
          fields(first: 100) {
            nodes { ... on ProjectV2FieldCommon { id name } }
          }
        }
      }
    }`, { id: PROJECT_ID });
  const map = {};
  for (const f of data.node.fields.nodes || []) {
    if (f?.name && f.id) map[f.name] = f.id;
  }
  return map;
}

async function fetchAllItems() {
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
              content {
                ... on Issue { number title body url state }
              }
              fieldValues(first: 50) {
                nodes {
                  ... on ProjectV2ItemFieldNumberValue {
                    number
                    field { ... on ProjectV2FieldCommon { id } }
                  }
                  ... on ProjectV2ItemFieldTextValue {
                    text
                    field { ... on ProjectV2FieldCommon { id } }
                  }
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
  return items;
}

function projectValuesFor(item, fieldNameToId) {
  const values = {};
  for (const def of FIELD_DEFS) {
    const fieldId = fieldNameToId[def.name];
    if (!fieldId) continue;
    const node = item.fieldValues.nodes.find(v => v.field?.id === fieldId);
    if (!node) continue;
    if (node.number !== undefined && node.number !== null) values[def.key] = node.number;
    else if (node.text) values[def.key] = node.text;
    else if (node.name) values[def.key] = node.name;
  }
  return values;
}

async function writeIssueBody(issueNumber, body) {
  const dir = mkdtempSync(path.join(tmpdir(), 'aitm-heal-'));
  const file = path.join(dir, `body-${issueNumber}.md`);
  try {
    writeFileSync(file, body, 'utf8');
    await gh(['issue', 'edit', String(issueNumber), '-R', REPO, '--body-file', file]);
  } finally {
    try { unlinkSync(file); } catch {}
  }
}

async function main() {
  const fieldNameToId = await fetchProjectFieldIds();
  const missing = FIELD_DEFS.filter(d => !fieldNameToId[d.name]);
  if (missing.length) {
    console.warn('warning: project missing fields, those keys will be null in bodies:');
    for (const m of missing) console.warn(`  - ${m.name} (${m.key})`);
  }

  const items = await fetchAllItems();
  const issues = items.filter(it => it.content?.number);
  console.log(`fetched ${issues.length} issues from project`);

  let writes = 0;
  let skipped = 0;
  let errors = 0;
  let processed = 0;

  for (const it of issues) {
    if (processed >= limit) break;
    processed++;
    const issue = it.content;
    const projectValues = projectValuesFor(it, fieldNameToId);
    const result = ensureIssueFieldDb(issue.body || '', FIELD_DEFS, projectValues);
    if (!result.changed) { skipped++; continue; }
    writes++;
    const summary = Object.entries(result.values)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${k}=${v}`).join(' ');
    console.log(`  #${issue.number} [${issue.state}] ${summary || '(all null)'}`);
    if (dryRun) continue;
    try {
      await writeIssueBody(issue.number, result.body);
    } catch (e) {
      errors++;
      console.error(`  #${issue.number} write failed: ${e.message}`);
    }
  }

  console.log('');
  console.log(`Summary: ${writes} ${dryRun ? 'planned' : 'written'}, ${skipped} idempotent skips, ${errors} errors${processed < issues.length ? `, ${issues.length - processed} skipped via --limit` : ''}`);
  if (errors > 0) process.exit(2);
}

await main();
