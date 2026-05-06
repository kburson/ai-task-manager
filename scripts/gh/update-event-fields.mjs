#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadConfig } from '../task-tracker/config.mjs';
import { ensureIssueFieldDb } from '../task-tracker/issue-field-db.mjs';
import { loadProjectFieldDefs } from '../task-tracker/project-fields.mjs';
import { gh, gql, writeProjectFieldValue } from './lib/github-projects.mjs';

const args = process.argv.slice(2);
const issue = args.find(a => /^#?\d+$/.test(a))?.replace('#', '');
const state = args.find(a => ['in-progress', 'in_progress', 'done'].includes(a));
const itemId = args[args.indexOf('--item-id') + 1] || '';

if (!issue || !state || !itemId) {
  console.error('Usage: update-event-fields.mjs <issue#> <in-progress|done> --item-id <project-item-id>');
  process.exit(1);
}

const cfg = loadConfig();
if (!cfg.projectId) process.exit(0);

function projectDir() {
  return process.env.AI_TASK_MANAGER_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function loadEventBindings() {
  const local = path.join(projectDir(), '.ai-task-manager', 'project-field-events.json');
  const fallback = new URL('../../config/project-field-events.default.json', import.meta.url);
  for (const file of [local, fallback]) {
    try {
      if (typeof file === 'string' && !existsSync(file)) continue;
      return JSON.parse(readFileSync(file, 'utf8'));
    } catch {}
  }
  return {};
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function currentDateValue(fieldId) {
  const data = await gql(`
    query($item: ID!) {
      node(id: $item) {
        ... on ProjectV2Item {
          fieldValues(first: 50) {
            nodes {
              ... on ProjectV2ItemFieldDateValue {
                date
                field { ... on ProjectV2FieldCommon { id } }
              }
            }
          }
        }
      }
    }`,
    { item: itemId }
  );
  const values = data.node?.fieldValues?.nodes ?? [];
  return values.find(v => v.field?.id === fieldId)?.date || '';
}

async function writeDate(fieldId, value) {
  if (!fieldId) return;
  await writeProjectFieldValue({ projectId: cfg.projectId, itemId, fieldId, value: { date: value } });
}

async function fetchIssueBody() {
  const out = await gh(['issue', 'view', issue, '-R', cfg.repo, '--json', 'body']);
  return JSON.parse(out).body ?? '';
}

async function writeIssueBody(body) {
  const tmp = path.join(os.tmpdir(), `aitm-event-fields-${issue}-${Date.now()}.md`);
  try {
    writeFileSync(tmp, body, 'utf8');
    await gh(['issue', 'edit', issue, '-R', cfg.repo, '--body-file', tmp]);
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
}

try {
  const eventName = (state === 'in-progress' || state === 'in_progress') ? 'moveToInProgress' : 'moveToDone';
  const bindings = loadEventBindings()[eventName] || [];
  const fieldDefs = loadProjectFieldDefs(projectDir());
  const issueBody = cfg.repo ? await fetchIssueBody() : '';
  let ensured = ensureIssueFieldDb(issueBody, fieldDefs);
  const values = { ...ensured.values };
  let issueDbChanged = ensured.changed;
  for (const binding of bindings) {
    const fieldKey = binding.field;
    const fieldId = cfg.fieldIds?.[fieldKey] || cfg[`field${fieldKey[0].toUpperCase()}${fieldKey.slice(1)}`] || '';
    if (binding.value !== 'today') continue;
    if (binding.mode === 'set_once' && values[fieldKey]) {
      continue;
    }
    values[fieldKey] = today();
    issueDbChanged = true;
    if (fieldId) await writeDate(fieldId, values[fieldKey]);
    console.log(`✓ ${fieldKey} set for #${issue}`);
  }
  if (issueDbChanged && issueBody) {
    const updated = ensureIssueFieldDb(issueBody, fieldDefs, values);
    await writeIssueBody(updated.body);
  }
} catch (err) {
  console.warn(`warn: event field update skipped: ${err.message}`);
}
