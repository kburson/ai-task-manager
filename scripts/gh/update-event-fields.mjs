#!/usr/bin/env node
import { enforceDirectGuidance } from '../task-tracker/lib/direct-guidance-admission.mjs';
enforceDirectGuidance(import.meta.url, 'update-event-fields');
import { writeFileSync, unlinkSync } from 'node:fs';
import { loadConfig } from '../task-tracker/config.mjs';
import { getProjectDir, projectTmpDir } from '../task-tracker/paths.mjs';
import { eventFieldUpdateProgram, eventFieldBodyWriteProgram } from '../task-tracker/lib/event-field-update.mjs';
import { loadProjectFieldDefs, loadProjectFieldEvents } from '../task-tracker/project-fields.mjs';
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

// No event bindings exist for this state (backlog, ready-for-plan) — the sync is a
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

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nowText() {
  return fmtTs(new Date());
}

async function fetchIssueBody() {
  const out = await gh(['issue', 'view', issue, '-R', cfg.repo, '--json', 'body']);
  return JSON.parse(out).body ?? '';
}

async function writeIssueBody(body) {
  const program = eventFieldBodyWriteProgram({ body, issue, cfg });
  let next = program.next();
  while (!next.done) {
    const operation = next.value;
    let value;
    try {
      switch (operation.kind) {
        case 'tmp-directory':
          value = projectTmpDir(projectDir());
          break;
        case 'tmp-clock':
          value = Date.now();
          break;
        case 'write-file':
          value = writeFileSync(operation.file, operation.body, operation.encoding);
          break;
        case 'edit-body':
          value = await gh(operation.args);
          break;
        case 'unlink-file':
          value = unlinkSync(operation.file);
          break;
        default:
          throw new TypeError('event-field-body-operation');
      }
    } catch (error) {
      next = program.throw(error);
      continue;
    }
    next = program.next(value);
  }
}

try {
  const eventName = STATE_TO_EVENT[state];
  const program = eventFieldUpdateProgram({ cfg, issue, itemId, eventName });
  let next = program.next();
  while (!next.done) {
    const operation = next.value;
    let value;
    switch (operation.kind) {
      case 'read-bindings':
        value = loadProjectFieldEvents()[operation.eventName];
        break;
      case 'read-definitions':
        value = loadProjectFieldDefs(projectDir());
        break;
      case 'read-body':
        value = await fetchIssueBody();
        break;
      case 'today':
        value = today();
        break;
      case 'now':
        value = nowText();
        break;
      case 'write-field':
        value = await writeProjectFieldValue(operation.input);
        break;
      case 'log':
        value = console.log(operation.message);
        break;
      case 'write-body':
        value = await writeIssueBody(operation.body);
        break;
      default:
        throw new TypeError('event-field-operation');
    }
    next = program.next(value);
  }
} catch (err) {
  console.error(`error: event field update failed: ${err.message}`);
  process.exit(1);
}
