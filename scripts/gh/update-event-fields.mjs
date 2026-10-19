#!/usr/bin/env node
// @story #1988 — event Estimate effects publish under the same owner as their event.
import { enforceDirectGuidance } from '../task-tracker/lib/direct-guidance-admission.mjs';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../task-tracker/config.mjs';
import { getProjectDir } from '../task-tracker/paths.mjs';
import { ensureIssueFieldDb } from '../task-tracker/issue-field-db.mjs';
import { loadProjectFieldDefs, fieldIdFor } from '../task-tracker/project-fields.mjs';
import { fmtTs } from '../task-tracker/gh-timing-comment.mjs';
import { gh, writeProjectFieldValue } from './lib/github-projects.mjs';
import { STATE_TO_CONFIG_KEY } from '../task-tracker/lib/move-state/policy.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';
import { mutateIssueBody } from '../task-tracker/lib/issue-body-mutate.mjs';
import { publishFieldEstimateRevision } from '../task-tracker/lib/decomposition-field-writer.mjs';
import { assertDecompositionPublicationOwner } from '../task-tracker/lib/decomposition-projection.mjs';
const VALID_STATES = Object.keys(STATE_TO_CONFIG_KEY);
const STATE_TO_EVENT = {
  refine: 'moveToRefine',
  plan: 'moveToPlan',
  develop: 'moveToDevelopment',
  test: 'moveToTest',
  review: 'moveToReview',
  done: 'moveToDone',
};
function loadEventBindings() {
  const local = path.join(getProjectDir(), '.ai-task-manager', 'project-field-events.json');
  for (const file of [
    local,
    new URL('../../config/project-field-events.default.json', import.meta.url),
  ]) {
    try {
      if (typeof file === 'string' && !existsSync(file)) continue;
      return JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      /* Optional local configuration falls back to the packaged default. */
    }
  }
  return {};
}
export async function runUpdateEventFields({
  cfg,
  issueNumber,
  itemId,
  state,
  bindings,
  fieldDefs,
  deps = {},
}) {
  if (!STATE_TO_EVENT[state] || !cfg.projectId) return { status: 'unchanged' };
  const writeField = deps.writeProjectFieldValue ?? writeProjectFieldValue;
  const body = deps.decomposition?.readIssue
    ? (await deps.decomposition.readIssue()).value.body
    : (JSON.parse(
        await gh(['issue', 'view', String(issueNumber), '-R', cfg.repo, '--json', 'body'])
      ).body ?? '');
  const ensured = ensureIssueFieldDb(body, fieldDefs),
    updates = [];
  const now = (deps.now ?? (() => new Date()))();
  for (const binding of bindings) {
    const fieldKey = binding.field,
      fieldId = fieldIdFor(cfg, fieldKey),
      type = fieldDefs.find((d) => d.key === fieldKey)?.type ?? '';
    if (binding.mode === 'set_once' && ensured.values[fieldKey]) continue;
    const isEstimate =
      Boolean(fieldId) && fieldId === fieldIdFor(cfg, 'estimate') && type === 'number';
    let value;
    if (binding.value === 'today') value = now.toISOString().slice(0, 10);
    else if (binding.value === 'now') value = fmtTs(now);
    else if (isEstimate && typeof binding.value === 'number') value = binding.value;
    else continue;
    if (isEstimate && (!Number.isFinite(Number(value)) || Number(value) < 0))
      return { status: 'refused', reason: 'event-field:invalid-estimate' };
    updates.push({ fieldKey, fieldId, type, value, isEstimate });
  }
  const estimates = updates.filter((u) => u.isEstimate);
  if (estimates.length > 1)
    return { status: 'refused', reason: 'event-field:duplicate-estimate-binding' };
  const ordinary = updates.filter((u) => !u.isEstimate);
  const applyOrdinary = async (context) => {
    if (context && context.subject.projectItemId !== itemId)
      throw new Error('event-field:foreign-project-item');
    for (const update of ordinary) {
      if (context)
        await assertDecompositionPublicationOwner(context, {
          subject: context.subject,
          operationId: context.operationId,
          effectId: 'estimate',
          requireIntent: true,
        });
      if (update.fieldId)
        await writeField({
          projectId: cfg.projectId,
          itemId,
          fieldId: update.fieldId,
          value:
            update.type === 'date'
              ? { date: update.value }
              : update.type === 'text'
                ? { text: update.value }
                : { number: Number(update.value) },
        });
    }
    if ((ordinary.length || ensured.changed) && body)
      await (deps.mutateIssueBody ?? mutateIssueBody)({
        issueNumber,
        repo: cfg.repo,
        mutate: (base) =>
          ensureIssueFieldDb(
            base,
            fieldDefs,
            Object.fromEntries(ordinary.map((u) => [u.fieldKey, u.value])),
            { overrideKeys: ordinary.map((u) => u.fieldKey) }
          ).body,
        deps: deps.decomposition,
      });
  };
  if (!estimates.length) {
    await applyOrdinary();
    return { status: 'updated', fields: ordinary.map((u) => u.fieldKey) };
  }
  const estimate = Number(estimates[0].value);
  try {
    const result = await publishFieldEstimateRevision({
      cfg,
      issueNumber,
      writerId: 'event-field',
      key: {
        state,
        estimate,
        bindings: bindings.map((binding) => ({
          field: binding.field,
          value: binding.value ?? null,
          mode: binding.mode ?? null,
        })),
      },
      estimate,
      deps,
      beforeEffects: applyOrdinary,
      writeField: async ({ field, value, context }) => {
        if (context.subject.projectItemId !== itemId)
          throw new Error('event-field:foreign-project-item');
        if (field === 'estimate')
          await writeField({
            projectId: cfg.projectId,
            itemId,
            fieldId: estimates[0].fieldId,
            value: { number: value },
          });
        else throw new Error('event-field:unexpected-size-change');
      },
    });
    if (result.status === 'unchanged') await applyOrdinary();
    return {
      ...result,
      fields:
        result.status === 'recorded' || result.status === 'unchanged'
          ? updates.map((u) => u.fieldKey)
          : [],
    };
  } catch (error) {
    return { status: 'refused', reason: error.message, fields: [] };
  }
}
async function main(args) {
  if (wantsHelp(args)) {
    emitSelfDoc('update-event-fields');
    return;
  }
  const issueNumber = Number(args.find((a) => /^#?\d+$/.test(a))?.replace('#', ''));
  const state = args.find((a) => VALID_STATES.includes(a)),
    index = args.indexOf('--item-id'),
    itemId = index < 0 ? '' : (args[index + 1] ?? '');
  if (state && !STATE_TO_EVENT[state]) return;
  if (!issueNumber || !state || !itemId)
    throw new Error(
      `Usage: update-event-fields.mjs <issue#> <${VALID_STATES.join('|')}> --item-id <project-item-id>`
    );
  const cfg = loadConfig();
  if (!cfg.projectId) return;
  const result = await runUpdateEventFields({
    cfg,
    issueNumber,
    itemId,
    state,
    bindings: loadEventBindings()[STATE_TO_EVENT[state]] ?? [],
    fieldDefs: loadProjectFieldDefs(getProjectDir()),
  });
  if (['partial', 'refused'].includes(result.status)) throw new Error(result.reason);
  for (const field of result.fields ?? []) console.log(`✓ ${field} set for #${issueNumber}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  enforceDirectGuidance(import.meta.url, 'update-event-fields');
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(`error: event field update failed: ${error.message}`);
    process.exitCode = 1;
  }
}
