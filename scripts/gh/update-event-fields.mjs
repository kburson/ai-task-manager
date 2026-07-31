#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../task-tracker/config.mjs';
import { getProjectDir, projectTmpDir } from '../task-tracker/paths.mjs';
import { ensureIssueFieldDb } from '../task-tracker/issue-field-db.mjs';
import { loadProjectFieldDefs } from '../task-tracker/project-fields.mjs';
import { gh, writeProjectFieldValue } from './lib/github-projects.mjs';
import { STATE_TO_CONFIG_KEY } from '../task-tracker/lib/move-state/policy.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';

const VALID_STATES = Object.keys(STATE_TO_CONFIG_KEY);
const STATE_TO_EVENT = {
  refine: 'moveToRefine',
  plan: 'moveToPlan',
  develop: 'moveToDevelopment',
  test: 'moveToTest',
  review: 'moveToReview',
  done: 'moveToDone',
};

function loadEventBindings(projectDir) {
  const local = path.join(projectDir, '.ai-task-manager', 'project-field-events.json');
  const fallback = new URL('../../config/project-field-events.default.json', import.meta.url);
  for (const file of [local, fallback]) {
    try {
      if (typeof file === 'string' && !existsSync(file)) continue;
      return JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      /* optional read; fall through */
    }
  }
  return {};
}

function fieldTypeForKey(fieldDefs, key) {
  return fieldDefs.find((definition) => definition.key === key)?.type || '';
}

// Keep the bindingless CLI fast path independent of gh-timing-comment.mjs.
// That module imports lease authority and therefore Node's experimental
// SQLite implementation; loading it before the silent no-op guards emits an
// ExperimentalWarning on Node 25.
function fmtTs(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const offset = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${offset}`;
}

const GOVERNED_AUTHORITY_ERROR_CODES = new Set([
  'invalid-request',
  'idempotency-conflict',
  'lease-contended',
  'worktree-contended',
  'fence-stale',
  'authority-unauthenticated',
  'authority-forbidden',
  'authority-unavailable',
  'holder-live',
  'lease-not-held',
  'main-worktree-unresolved',
]);

function isGovernedAuthorityRefusal(error) {
  return error?.name === 'WorkLeaseError' || GOVERNED_AUTHORITY_ERROR_CODES.has(error?.code);
}

function resolveValue(value) {
  if (value === 'today') return new Date().toISOString().slice(0, 10);
  if (value === 'now') return fmtTs(new Date());
  return undefined;
}

async function defaultWriteIssueBody({ projectDir, issue, repo, body, ghFn, reverify }) {
  const tmp = path.join(projectTmpDir(projectDir), `aitm-event-fields-${issue}-${Date.now()}.md`);
  try {
    writeFileSync(tmp, body, 'utf8');
    await reverify();
    await ghFn(['issue', 'edit', issue, '-R', repo, '--body-file', tmp]);
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* best-effort cleanup */
    }
  }
}

// Callable mutation surface used by move-state's in-process tail. Every field
// and body write reverifies the exact caller-provided issue+operation
// continuation immediately before the write. Direct CLI use opens one runtime
// authority root and maps the returned numeric code only after it unwinds.
export async function main(args = process.argv.slice(2), deps = {}) {
  if (wantsHelp(args)) {
    emitSelfDoc('update-event-fields');
    return 0;
  }

  const issue = args.find((arg) => /^#?\d+$/.test(arg))?.replace('#', '');
  const state = args.find((arg) => VALID_STATES.includes(arg));
  const idIdx = args.indexOf('--item-id');
  const itemId = idIdx === -1 ? '' : args[idIdx + 1] || '';

  if (state && !STATE_TO_EVENT[state]) return 0;
  if (!issue || !state || !itemId) {
    console.error(
      `Usage: update-event-fields.mjs <issue#> <${VALID_STATES.join('|')}> --item-id <project-item-id>`
    );
    return 1;
  }

  const cfg = deps.cfg || loadConfig();
  if (!cfg.projectId) return 0;
  const projectDir = deps.projectDir || getProjectDir();
  const ghFn = deps.gh || gh;
  const writeField = deps.writeProjectFieldValue || writeProjectFieldValue;
  const withGovernedEffect =
    deps.withGovernedEffect ||
    (
      await import('../task-tracker/lib/work-lease/governed-effect.mjs')
    ).createRuntimeGovernedEffectAdapter({ projectDir, config: cfg });
  const operation = deps.operation || 'lifecycle-mutation';
  let authorityEntered = false;

  try {
    const eventName = STATE_TO_EVENT[state];
    const bindings = (deps.loadEventBindings || loadEventBindings)(projectDir)[eventName] || [];
    const fieldDefs = (deps.loadProjectFieldDefs || loadProjectFieldDefs)(projectDir);
    const issueBody = cfg.repo
      ? await (
          deps.fetchIssueBody ||
          (async () => {
            const out = await ghFn(['issue', 'view', issue, '-R', cfg.repo, '--json', 'body']);
            return JSON.parse(out).body ?? '';
          })
        )()
      : '';
    const ensured = ensureIssueFieldDb(issueBody, fieldDefs);
    const values = { ...ensured.values };
    let issueDbChanged = ensured.changed;

    await withGovernedEffect({ issueId: issue, operation, heartbeat: true }, async (authority) => {
      authorityEntered = true;
      for (const binding of bindings) {
        const fieldKey = binding.field;
        const fieldId =
          cfg.fieldIds?.[fieldKey] ||
          cfg[`field${fieldKey[0].toUpperCase()}${fieldKey.slice(1)}`] ||
          '';
        const resolved = resolveValue(binding.value);
        if (resolved === undefined) continue;
        if (binding.mode === 'set_once' && values[fieldKey]) continue;

        values[fieldKey] = resolved;
        issueDbChanged = true;
        if (fieldId) {
          const type = fieldTypeForKey(fieldDefs, fieldKey);
          const value =
            type === 'date'
              ? { date: resolved }
              : type === 'text'
                ? { text: resolved }
                : { number: Number(resolved) };
          await authority.reverify();
          await writeField({ projectId: cfg.projectId, itemId, fieldId, value });
        }
        console.log(`✓ ${fieldKey} set for #${issue}`);
      }

      if (issueDbChanged && issueBody) {
        const updated = ensureIssueFieldDb(issueBody, fieldDefs, values);
        const writeBody =
          deps.writeIssueBody ||
          ((options) =>
            defaultWriteIssueBody({
              ...options,
              projectDir,
              issue,
              repo: cfg.repo,
              ghFn,
            }));
        await writeBody({ body: updated.body, reverify: authority.reverify });
      }
    });
    return 0;
  } catch (error) {
    if (isGovernedAuthorityRefusal(error) || (deps.withGovernedEffect && !authorityEntered)) {
      throw error;
    }
    console.error(`error: event field update failed: ${error.message}`);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(`error: event field update failed: ${error.message}`);
      process.exitCode = 1;
    }
  );
}
