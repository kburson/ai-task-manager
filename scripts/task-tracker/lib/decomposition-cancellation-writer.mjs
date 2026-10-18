import { readDecompositionRecords } from './decomposition-records.mjs';
import { createGitHubEstimationRecordIo } from './estimation/runtime-adapter.mjs';
import { estimateEffectDigest } from './decomposition-publication.mjs';
import { canonicalDecompositionJson } from './decomposition-assessment.mjs';
// @story #1988 — cancellation shares one owner through its authorized move and compensation.
import {
  executeEstimateWriter,
  resolveEstimateOperationId,
  observedEstimateEffect,
  intendedPublishedRevisionInput,
} from './estimate-writer-publication.mjs';
import { intendedCommentProposalInput } from './decomposition-proposal-writer.mjs';
import { assertDecompositionPublicationOwner } from './decomposition-projection.mjs';
import {
  listRefineEstimateComments,
  findRefineEstimateComment,
  removePlannedEstimateAppendix,
  clearPlannedEstimate,
  restorePlannedEstimate,
} from './refine-estimate-comment.mjs';
import { parseIssueFieldDb } from '../issue-field-db.mjs';
import { parseMarker } from './marker-grammar.mjs';
const RECOVERY_RE =
  /<!-- aitm-cancel-plan-recovery schema="1" operation="([0-9a-f-]{36})" digest="([0-9a-f]{64})" payload="([A-Za-z0-9_-]+)" -->/g;
export function readCancellationRecovery(body, operationId) {
  const matches = [...String(body).matchAll(RECOVERY_RE)].filter((m) => m[1] === operationId);
  if (matches.length > 1) throw new Error('cancel-plan:duplicate-recovery');
  if (!matches.length) return null;
  const raw = Buffer.from(matches[0][3], 'base64url').toString('utf8'),
    record = JSON.parse(raw);
  if (
    raw !== canonicalDecompositionJson(record) ||
    Buffer.from(raw).toString('base64url') !== matches[0][3] ||
    estimateEffectDigest(record) !== matches[0][2] ||
    record.schema !== 'aitm.cancel-plan-recovery/v1' ||
    record.operationId !== operationId ||
    !record.fields ||
    !Array.isArray(record.artifacts) ||
    (record.comment !== null && typeof record.comment?.body !== 'string')
  )
    throw new Error('cancel-plan:invalid-recovery');
  return record;
}
function recoveryMarker(record) {
  const raw = canonicalDecompositionJson(record);
  if (Buffer.byteLength(raw, 'utf8') > 32768) throw new Error('cancel-plan:recovery-too-large');
  return `<!-- aitm-cancel-plan-recovery schema="1" operation="${record.operationId}" digest="${estimateEffectDigest(record)}" payload="${Buffer.from(raw).toString('base64url')}" -->`;
}

export function cancellationFieldValuesMatch(value, before, after) {
  return ['priority', 'size', 'estimate', 'rank'].every((key) => {
    const actual = canonicalDecompositionJson(value?.[key] ?? null);
    return (
      actual === canonicalDecompositionJson(before?.[key] ?? null) ||
      actual === canonicalDecompositionJson(after?.[key] ?? null)
    );
  });
}

export async function publishCancellationRevision({
  cfg,
  issueNumber,
  reason,
  resumeAtTarget = false,
  snapshot,
  originalBody,
  originalFields,
  targetBody,
  restoreBody,
  planArtifactMarkers,
  fetchIssueBody,
  fetchBoardFields,
  restoreBoardFields,
  mutateBody,
  runMoveState,
  getLiveState,
  deps = {},
}) {
  const plannedDeps = deps.plannedEstimate ?? {},
    comments = await (plannedDeps.listComments ?? listRefineEstimateComments)({ cfg, issueNumber });
  const key = { reason, snapshot: snapshot.digest },
    operationId = resolveEstimateOperationId(
      'cancel-plan',
      key,
      readDecompositionRecords(originalBody).publication
    );
  let comment = await findRefineEstimateComment({ cfg, issueNumber, deps: plannedDeps });
  const saved = readCancellationRecovery(originalBody, operationId);
  const recovery = saved ?? {
    schema: 'aitm.cancel-plan-recovery/v1',
    operationId,
    fields: originalFields.values,
    artifacts: planArtifactMarkers(originalBody),
    comment: comment
      ? { id: comment.id, nodeId: comment.nodeId ?? String(comment.id), body: comment.body }
      : null,
  };
  const marker = recoveryMarker(recovery);
  if (saved) {
    comment = recovery.comment;
    originalBody = recovery.artifacts.join('\n');
    originalFields = { values: recovery.fields };
  }
  const forecastId =
    originalBody.match(
      /<!--\s*aitm-estimation-forecast-ready\s+record-id="([0-7][0-9A-HJKMNP-TV-Z]{25})"\s*-->/
    )?.[1] ?? null;
  const recordIo = forecastId
    ? (deps.recordIo ?? createGitHubEstimationRecordIo(deps.decomposition?.forecast ?? {}))
    : null;
  const readForecastSnapshot = async () => {
    const records = await recordIo.listIssueRecords({ repository: cfg.repo, issue: issueNumber });
    const matches = records.filter(
      (r) => r.envelope.recordId === forecastId && r.envelope.recordType === 'estimation-forecast'
    );
    if (matches.length !== 1) throw new Error('cancel-plan:forecast-identity');
    return observedEstimateEffect({
      recordId: forecastId,
      payloadHash: matches[0].envelope.payloadHash,
    });
  };
  const forecastSnapshot = forecastId ? (await readForecastSnapshot()).value : null;
  const nextComment = comment ? removePlannedEstimateAppendix(comment.body) : null;
  const fields = Object.fromEntries(
    ['priority', 'size', 'estimate', 'rank'].map((k) => [k, snapshot.fields[k]])
  );
  const selectFields = (value) =>
    Object.fromEntries(['priority', 'size', 'estimate', 'rank'].map((k) => [k, value[k] ?? null]));
  const desiredBody = { fields, artifacts: [], reason };
  const bodyProjection = (body) => ({
    fields: selectFields(parseIssueFieldDb(body).values),
    artifacts: planArtifactMarkers(body),
    reason:
      parseMarker(body.match(/<!--\s*aitm-plan-cancelled\s+[^>]*-->/)?.[0] ?? '')?.props?.reason ??
      null,
  });
  const proposal = {
    estimate: { basis: 'published', hours: fields.estimate, proposalId: null },
    size: fields.size,
  };
  let moved = resumeAtTarget ? { status: 'cancelled', from: 'plan', to: 'ready-for-plan' } : null,
    compensated = null;
  const allowedFields = (value) => cancellationFieldValuesMatch(value, recovery.fields, fields);
  const assertOwner = async (context, effectId) => {
    await assertDecompositionPublicationOwner(context, {
      subject: context.subject,
      operationId: context.operationId,
      writerId: 'cancel-plan',
      effectId,
      requireIntent: true,
    });
    const board = await fetchBoardFields({ cfg, issueNumber }),
      body = parseIssueFieldDb((await fetchIssueBody({ cfg, issueNumber })).body);
    if (!body.ok || !allowedFields(board) || !allowedFields(body.values))
      throw new Error('cancel-plan:field-drift');
  };
  const result = await executeEstimateWriter({
    cfg,
    issueNumber,
    writerId: 'cancel-plan',
    key,
    proposal,
    deriveIntendedInput: (initial) => {
      const input = intendedPublishedRevisionInput(initial, proposal),
        future = structuredClone(initial);
      future.input = input;
      future.sourceObservations.readProject.value = {
        ...future.sourceObservations.readProject.value,
        ...fields,
      };
      if (Array.isArray(future.sourceObservations.readForecast.value.observedProjections))
        future.sourceObservations.readForecast.value.observedProjections =
          future.sourceObservations.readForecast.value.observedProjections.map((value) => ({
            ...value,
            estimate: fields.estimate,
            size: fields.size,
          }));
      future.sourceObservations.readIssue.value.body = targetBody(
        initial.sourceObservations.readIssue.value.body
      );
      return intendedCommentProposalInput({
        initial: future,
        subject: initial.input.subject,
        body: future.sourceObservations.readIssue.value.body,
        comments: comments.map((c) => ({
          id: c.node_id ?? String(c.id),
          body: c.id === comment?.id ? nextComment : c.body,
        })),
      });
    },
    deps: {
      ...deps,
      previewPublicationBody: (base) =>
        readCancellationRecovery(base, operationId) ? base : base.trimEnd() + '\n' + marker + '\n',
      afterPublicationEffects: async (context) => {
        await assertOwner(context, 'board');
        if (resumeAtTarget) {
          if ((await getLiveState({ issueNumber, cfg })) !== 'ready-for-plan')
            throw new Error('cancel-plan:target-drift');
          return;
        }
        let exitCode, error;
        try {
          exitCode = await runMoveState({ issueNumber, target: 'ready-for-plan', reason, cfg });
        } catch (e) {
          exitCode = 1;
          error = e;
        }
        if (exitCode === 0) {
          moved = { status: 'cancelled', from: 'plan', to: 'ready-for-plan' };
          return;
        }
        const actual = await getLiveState({ issueNumber, cfg });
        if (actual === 'ready-for-plan') {
          moved = {
            status: 'cancelled-with-warning',
            exitCode,
            from: 'plan',
            to: 'ready-for-plan',
          };
          return;
        }
        if (actual !== 'plan') {
          moved = {
            status: 'transition-outcome-ambiguous',
            exitCode,
            from: 'plan',
            liveAfter: actual,
          };
          throw new Error('cancel-plan:transition-outcome-ambiguous');
        }
        moved = {
          status: 'transition-failed-restored',
          exitCode,
          from: 'plan',
          ...(error ? { error: error.message } : {}),
        };
        throw new Error('cancel-plan:transition-failed');
      },
      onPublicationFailure: async (context, error) => {
        if (
          ['cancelled', 'cancelled-with-warning', 'transition-outcome-ambiguous'].includes(
            moved?.status
          )
        )
          return;
        try {
          if (error.message === 'cancel-plan:comment-drift') return;
          await assertOwner(context, 'body');
          const pending = context.publication();
          for (const effect of pending.effects)
            if (effect.id !== 'authority-context') {
              effect.status = 'unknown';
              effect.observedDigest = null;
            }
          await context.persistPublication(pending);
          await assertOwner(context, 'body');
          await mutateBody({
            issueNumber,
            repo: cfg.repo,
            mutate: (base) => restoreBody(base, originalBody, originalFields),
            allowMarkerLoss: true,
          });
          await assertOwner(context, 'board');
          await restoreBoardFields({
            issueNumber,
            cfg,
            fields: originalFields.values,
            context,
            effectId: 'board',
          });
          if (comment && nextComment !== comment.body) {
            await assertOwner(context, 'appendix');
            await restorePlannedEstimate({
              cfg,
              issueNumber,
              record: { commentId: comment.id, originalBody: comment.body },
              context,
              effectId: 'appendix',
              deps: plannedDeps,
            });
          }
          compensated = true;
        } catch (rollback) {
          compensated = false;
          if (moved) moved.error = rollback.message;
        }
      },
    },
    effects: async ({ subject }) => [
      ...(forecastId
        ? [
            {
              id: 'forecast-snapshot',
              resource: 'forecast',
              targetIdentity: `record:${forecastId}`,
              value: forecastSnapshot,
              read: readForecastSnapshot,
              apply: () => {
                throw new Error('cancel-plan:forecast-drift');
              },
            },
          ]
        : []),
      {
        id: 'recovery',
        resource: 'body-fields',
        targetIdentity: `${cfg.repo}#${issueNumber}:cancel-plan-recovery`,
        value: recovery,
        read: async () =>
          observedEstimateEffect(
            readCancellationRecovery((await fetchIssueBody({ cfg, issueNumber })).body, operationId)
          ),
        apply: () =>
          mutateBody({
            issueNumber,
            repo: cfg.repo,
            mutate: (base) => {
              if (readCancellationRecovery(base, operationId)) return base;
              return base.trimEnd() + '\n' + marker + '\n';
            },
          }),
      },
      ...(comment && nextComment !== comment.body
        ? [
            {
              id: 'appendix',
              resource: 'comment',
              targetIdentity: `comment:${comment.nodeId ?? comment.id}`,
              value: nextComment,
              read: async () => {
                const current = await findRefineEstimateComment({
                  cfg,
                  issueNumber,
                  deps: plannedDeps,
                });
                if (current?.id !== comment.id) throw new Error('cancel-plan:comment-identity');
                if (current.body !== comment.body && current.body !== nextComment)
                  throw new Error('cancel-plan:comment-drift');
                return observedEstimateEffect(current.body);
              },
              apply: async (context) => {
                await assertOwner(context, 'appendix');
                const r = await clearPlannedEstimate({
                  cfg,
                  issueNumber,
                  context,
                  effectId: 'appendix',
                  deps: plannedDeps,
                });
                if (r.status !== 'cleared') throw new Error(`cancel-plan:${r.status}`);
              },
            },
          ]
        : []),
      {
        id: 'board',
        resource: 'project-estimate',
        targetIdentity: subject.projectItemId,
        value: fields,
        read: async () =>
          observedEstimateEffect(selectFields(await fetchBoardFields({ cfg, issueNumber }))),
        apply: async (context) => {
          await assertOwner(context, 'board');
          return restoreBoardFields({ cfg, issueNumber, fields, context, effectId: 'board' });
        },
      },
      {
        id: 'body',
        resource: 'body-fields',
        targetIdentity: `${cfg.repo}#${issueNumber}:cancellation`,
        value: desiredBody,
        read: async () =>
          observedEstimateEffect(bodyProjection((await fetchIssueBody({ cfg, issueNumber })).body)),
        apply: async (context) => {
          await assertOwner(context, 'body');
          return mutateBody({
            issueNumber,
            repo: cfg.repo,
            mutate: targetBody,
            allowMarkerLoss: true,
            context,
            effectId: 'body',
          });
        },
      },
      ...(forecastId
        ? [
            {
              id: 'ready',
              resource: 'ready-marker',
              targetIdentity: `${cfg.repo}#${issueNumber}:ready-marker`,
              value: null,
              read: async () =>
                observedEstimateEffect(
                  (await fetchIssueBody({ cfg, issueNumber })).body.match(
                    /<!--\s*aitm-estimation-forecast-ready\s+record-id="([0-7][0-9A-HJKMNP-TV-Z]{25})"\s*-->/
                  )?.[1] ?? null
                ),
              apply: async () => {
                throw new Error('cancel-plan:ready-retirement-drift');
              },
            },
          ]
        : []),
    ],
  });
  if (result.status === 'recorded')
    return { ...moved, operationId: result.operationId, publicationStatus: 'complete' };
  if (moved)
    return {
      ...moved,
      status:
        moved.status === 'transition-failed-restored' && !compensated
          ? 'transition-failed-recovery-uncertain'
          : ['cancelled', 'cancelled-with-warning'].includes(moved.status)
            ? 'cancelled-publication-pending'
            : moved.status,
      operationId: result.operationId,
      publicationStatus: 'pending',
      reason: result.reason,
    };
  return {
    ...result,
    status: compensated ? 'publication-failed-restored' : result.status,
    publicationStatus: 'pending',
  };
}
