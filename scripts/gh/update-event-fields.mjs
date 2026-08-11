#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../task-tracker/config.mjs';
import { getProjectDir, projectTmpDir } from '../task-tracker/paths.mjs';
import { ensureIssueFieldDb } from '../task-tracker/issue-field-db.mjs';
import { loadProjectFieldDefs } from '../task-tracker/project-fields.mjs';
import { fmtTs } from '../task-tracker/gh-timing-comment.mjs';
import { gh, writeProjectFieldValue } from './lib/github-projects.mjs';
import { STATE_TO_CONFIG_KEY } from '../task-tracker/lib/move-state/policy.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';

// Every board state is accepted (#701); states without an event binding are a
// silent no-op below, so the caller never has to know which states carry events.
const VALID_STATES = Object.keys(STATE_TO_CONFIG_KEY);

const STATE_TO_EVENT = {
  refine: 'moveToRefine',
  plan: 'moveToPlan',
  develop: 'moveToDevelopment',
  test: 'moveToTest',
  review: 'moveToReview',
  done: 'moveToDone',
};

const args = process.argv.slice(2);
if (import.meta.url === `file://${process.argv[1]}` && wantsHelp(args)) {
  emitSelfDoc('update-event-fields');
  process.exit(0);
}
const issue = args.find((a) => /^#?\d+$/.test(a))?.replace('#', '');
const state = args.find((a) => VALID_STATES.includes(a));
// indexOf(-1)+1 would alias args[0] as the item id when the flag is absent —
// guard the index so a missing flag falls through to the usage guard (#702).
const idIdx = args.indexOf('--item-id');
const itemId = idIdx === -1 ? '' : args[idIdx + 1] || '';

// No event bindings exist for this state (backlog, assigned) — the sync is a
// no-op by definition, so exit before the arg guard: a missing --item-id is
// irrelevant when there is nothing to write (#701).
if (state && !STATE_TO_EVENT[state]) process.exit(0);

if (!issue || !state || !itemId) {
  console.error(
    `Usage: update-event-fields.mjs <issue#> <${VALID_STATES.join('|')}> --item-id <project-item-id>`
  );
  process.exit(1);
}

const cfg = loadConfig();
if (!cfg.projectId) process.exit(0);

function projectDir() {
  return getProjectDir();
}

function loadEventBindings() {
  const local = path.join(projectDir(), '.ai-task-manager', 'project-field-events.json');
  const fallback = new URL('../../config/project-field-events.default.json', import.meta.url);
  for (const file of [local, fallback]) {
    try {
      if (typeof file === 'string' && !existsSync(file)) continue;
      return JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      /* best-effort: optional read; fall back to default on parse/IO error */
    }
  }
  return {};
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nowText() {
  return fmtTs(new Date());
}

function fieldTypeForKey(fieldDefs, key) {
  return fieldDefs.find((d) => d.key === key)?.type || '';
}

async function writeFieldValue(fieldId, type, value) {
  if (!fieldId) return;
  if (type === 'date') {
    await writeProjectFieldValue({
      projectId: cfg.projectId,
      itemId,
      fieldId,
      value: { date: value },
    });
  } else if (type === 'text') {
    await writeProjectFieldValue({
      projectId: cfg.projectId,
      itemId,
      fieldId,
      value: { text: value },
    });
  } else {
    await writeProjectFieldValue({
      projectId: cfg.projectId,
      itemId,
      fieldId,
      value: { number: Number(value) },
    });
  }
}

async function fetchIssueBody() {
  const out = await gh(['issue', 'view', issue, '-R', cfg.repo, '--json', 'body']);
  return JSON.parse(out).body ?? '';
}

async function writeIssueBody(body) {
  const tmp = path.join(projectTmpDir(projectDir()), `aitm-event-fields-${issue}-${Date.now()}.md`);
  try {
    writeFileSync(tmp, body, 'utf8');
    await gh(['issue', 'edit', issue, '-R', cfg.repo, '--body-file', tmp]);
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* best-effort: cleanup; failure is non-fatal */
    }
  }
}

try {
  const eventName = STATE_TO_EVENT[state];
  const bindings = loadEventBindings()[eventName] || [];
  const fieldDefs = loadProjectFieldDefs(projectDir());
  const issueBody = cfg.repo ? await fetchIssueBody() : '';
  let ensured = ensureIssueFieldDb(issueBody, fieldDefs);
  const values = { ...ensured.values };
  let issueDbChanged = ensured.changed;
  for (const binding of bindings) {
    const fieldKey = binding.field;
    const fieldId =
      cfg.fieldIds?.[fieldKey] ||
      cfg[`field${fieldKey[0].toUpperCase()}${fieldKey.slice(1)}`] ||
      '';
    const fieldType = fieldTypeForKey(fieldDefs, fieldKey);
    let resolved;
    if (binding.value === 'today') resolved = today();
    else if (binding.value === 'now') resolved = nowText();
    else continue;
    if (binding.mode === 'set_once' && values[fieldKey]) {
      continue;
    }
    values[fieldKey] = resolved;
    issueDbChanged = true;
    if (fieldId) await writeFieldValue(fieldId, fieldType, resolved);
    console.log(`✓ ${fieldKey} set for #${issue}`);
  }
  if (issueDbChanged && issueBody) {
    const updated = ensureIssueFieldDb(issueBody, fieldDefs, values);
    await writeIssueBody(updated.body);
  }
} catch (err) {
  console.error(`error: event field update failed: ${err.message}`);
  process.exit(1);
}
