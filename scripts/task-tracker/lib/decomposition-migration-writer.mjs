// @story #1988 — existing membership Estimate revisions in actual bulk field-sync callers.
import { publishFieldEstimateRevision } from './decomposition-field-writer.mjs';
import {
  readEstimateWriterAuthority,
  resolveEstimateOperationId,
} from './estimate-writer-publication.mjs';
import { assertDecompositionPublicationOwner } from './decomposition-projection.mjs';
import { mutateIssueBody } from './issue-body-mutate.mjs';
import { buildFieldSyncPlan, valueForProjectField, fieldIdFor } from '../project-fields.mjs';
import { ensureIssueFieldDb, parseIssueFieldDb } from '../issue-field-db.mjs';
import { writeProjectFieldValue, clearProjectFieldValue } from '../../gh/lib/github-projects.mjs';
export async function publishMigrationFields({
  cfg,
  issueNumber,
  itemId,
  values,
  fieldDefs,
  optionMap,
  beforeEffects,
  writerId = 'migrate-project',
  deps = {},
}) {
  if (!['migrate-project', 'bind-issues-to-new-project'].includes(writerId))
    throw new Error('project-migration:writer-id');
  const plan = buildFieldSyncPlan({ cfg, fieldDefs, values });
  for (const field of ['estimate', 'size']) {
    if (
      Object.hasOwn(values, field) &&
      values[field] === null &&
      fieldDefs.some((d) => d.key === field) &&
      fieldIdFor(cfg, field)
    )
      plan.push({ key: field, value: null, fieldId: fieldIdFor(cfg, field) });
  }
  const hasEstimate = plan.some((s) => s.key === 'estimate');
  const write = deps.writeProjectFieldValue ?? writeProjectFieldValue;
  const key = {
    values: plan.map(({ key, value, fieldId }) => ({ key, value, fieldId })),
    projectId: cfg.projectId,
  };
  const mutateBody = deps.mutateIssueBody ?? mutateIssueBody;
  const current = await readEstimateWriterAuthority({ cfg, issueNumber, deps });
  if (current.input.subject.projectItemId !== itemId)
    throw new Error('project-migration:membership-drift');
  const projection = current.sourceObservations.readProject.value,
    body = current.sourceObservations.readIssue.value.body;
  const parsed = parseIssueFieldDb(body);
  if (!parsed.ok) throw new Error('project-migration:body-fields');
  const estimate = hasEstimate ? values.estimate : projection.estimate;
  const size = plan.some((s) => s.key === 'size') ? values.size : projection.size;
  const unchanged =
    estimate === projection.estimate &&
    size === projection.size &&
    estimate === (parsed.values.estimate ?? null) &&
    size === (parsed.values.size ?? null);
  const retry =
    current.publication?.status === 'pending' &&
    current.publication.operationId ===
      resolveEstimateOperationId(writerId, key, current.publication);
  const applyOrdinary = async (context) => {
    if (beforeEffects) await beforeEffects(context);
    for (const step of plan.filter((s) => !['estimate', 'size'].includes(s.key))) {
      if (context)
        await assertDecompositionPublicationOwner(context, {
          subject: context.subject,
          operationId: context.operationId,
          effectId: 'estimate',
          requireIntent: true,
        });
      const result = await write({
        projectId: cfg.projectId,
        itemId,
        fieldId: step.fieldId,
        value: step.value,
        optionMap,
      });
      if (result === false) throw new Error(`project-migration:field-unconfirmed:${step.key}`);
    }
  };
  const applyBody = () =>
    mutateBody({
      issueNumber,
      repo: cfg.repo,
      deps: deps.decomposition,
      mutate: (base) => {
        const live = parseIssueFieldDb(base);
        if (!live.ok) throw new Error('project-migration:body-fields');
        return ensureIssueFieldDb(base, fieldDefs, values, { overrideKeys: Object.keys(values) })
          .body;
      },
    });
  if (unchanged && !retry) {
    await applyOrdinary();
    await applyBody();
    return { status: 'unchanged', itemId };
  }
  if (!hasEstimate && !plan.some((s) => s.key === 'size'))
    throw new Error('project-migration:no-estimate-intent');
  const result = await publishFieldEstimateRevision({
    cfg,
    issueNumber,
    writerId,
    key,
    estimate,
    size,
    deps,
    beforeEffects: applyOrdinary,
    applyBody,
    writeField: async ({ field, value, context, effectId }) => {
      await assertDecompositionPublicationOwner(context, {
        subject: context.subject,
        operationId: context.operationId,
        effectId,
        requireIntent: true,
      });
      if (context.subject.projectId !== cfg.projectId || context.subject.projectItemId !== itemId)
        throw new Error('project-migration:membership-drift');
      const definition = fieldDefs.find((d) => d.key === field);
      const fieldId = fieldIdFor(cfg, field);
      if (!definition || !fieldId) throw new Error(`project-migration:field-missing:${field}`);
      if (value === null) {
        if (
          (await (deps.clearProjectFieldValue ?? clearProjectFieldValue)({
            projectId: cfg.projectId,
            itemId,
            fieldId,
          })) === false
        )
          throw new Error(`project-migration:field-unconfirmed:${field}`);
        return;
      }
      if (
        (await write({
          projectId: cfg.projectId,
          itemId,
          fieldId,
          value: valueForProjectField(value, definition.type),
          optionMap,
        })) === false
      )
        throw new Error(`project-migration:field-unconfirmed:${field}`);
    },
  });
  return { ...result, itemId };
}

import { withIssueLock, currentIssueLockOwner } from '../issue-mutator-lock.mjs';
import { findMainWorktreePath } from '../fleet-registry.mjs';
import { getProjectDir } from '../paths.mjs';
import {
  addIssueToProject,
  projectItemForIssue,
  projectValuesForIssue,
  gh,
} from '../../gh/lib/github-projects.mjs';
import { stripBodyVersion } from './versioned-issue-write.mjs';
export async function withMigrationIssueOwner({ issueNumber, deps = {} }, operation) {
  const main = (deps.decomposition?.findMainWorktreePath ?? findMainWorktreePath)(
    deps.projectDir ?? getProjectDir()
  );
  return withIssueLock(
    { issue: issueNumber, verb: 'project-migration', projDir: main },
    async () => {
      if (!currentIssueLockOwner(issueNumber))
        throw new Error('project-migration:in-process-owner-required');
      return operation();
    }
  );
}
export async function fetchMigrationIssueBody({ cfg, issueNumber, deps = {} }) {
  if (deps.fetchIssueBody) {
    const record = await deps.fetchIssueBody({ cfg, issueNumber });
    return typeof record === 'string' ? record : record.body;
  }
  return JSON.parse(
    await gh(['issue', 'view', String(issueNumber), '--repo', cfg.repo, '--json', 'body'])
  ).body;
}
export async function copyInitialMigrationFields({
  cfg,
  issueNumber,
  issueId,
  body,
  values,
  fieldDefs,
  optionMap,
  beforeEffects,
  deps = {},
}) {
  if (!currentIssueLockOwner(issueNumber))
    throw new Error('project-migration:in-process-owner-required');
  const parsed = parseIssueFieldDb(body);
  if (
    !parsed.ok ||
    ['estimate', 'size'].some((key) => (parsed.values[key] ?? null) !== (values[key] ?? null))
  )
    return { status: 'refused', reason: 'project-migration:initial-copy-is-a-revision' };
  let itemId = null;
  try {
    itemId = await (deps.addIssueToProject ?? addIssueToProject)(cfg.projectId, issueId);
    const observed = await (deps.projectItemForIssue ?? projectItemForIssue)({
      repo: cfg.repo,
      projectId: cfg.projectId,
      issueNumber,
    });
    if (!itemId || observed.itemId !== itemId)
      throw new Error('project-migration:membership-unconfirmed');
    if (beforeEffects) await beforeEffects(null, itemId);
    const plan = buildFieldSyncPlan({ cfg, fieldDefs, values });
    for (const step of plan) {
      if (!currentIssueLockOwner(issueNumber))
        throw new Error('project-migration:in-process-owner-required');
      if (
        (await (deps.writeProjectFieldValue ?? writeProjectFieldValue)({
          projectId: cfg.projectId,
          itemId,
          fieldId: step.fieldId,
          value: step.value,
          optionMap,
        })) === false
      )
        throw new Error(`project-migration:field-unconfirmed:${step.key}`);
    }
    const actual = await (deps.projectValuesForIssue ?? projectValuesForIssue)({
      cfg,
      fieldDefs,
      issueNumber,
    });
    for (const step of plan)
      if (
        actual[step.key] !==
        (step.value.number ?? step.value.text ?? step.value.singleSelectOptionName)
      )
        throw new Error(`project-migration:read-back:${step.key}`);
    await (deps.mutateIssueBody ?? mutateIssueBody)({
      issueNumber,
      repo: cfg.repo,
      deps: deps.decomposition,
      mutate: (base) => {
        if (stripBodyVersion(base) !== stripBodyVersion(body))
          throw new Error('project-migration:source-body-drift');
        return ensureIssueFieldDb(base, fieldDefs, values, { overrideKeys: Object.keys(values) })
          .body;
      },
    });
    return { status: 'copied', itemId };
  } catch (error) {
    return { status: 'partial', itemId, reason: error.message };
  }
}
