// @story #2069
// Domain preview only: no provider observations or mutation capabilities are minted.
import { createHash } from 'node:crypto';
import { canonicalRecordJson as json } from './github-records/canonical-json.mjs';
import { parseAitmRecord } from './github-records/record-envelope.mjs';
import { recordsForProjection } from './estimation/runtime-adapter.mjs';
import {
  deriveDecompositionAuthority,
  deriveDecompositionForecastObservation,
  readDecompositionSelectedPlan,
} from './decomposition-authority.mjs';
import { classifyDecompositionKind } from './decomposition-kind.mjs';
import { projectNativePlanChildren } from './plan-child-inventory.mjs';
import { readCandidateForecastReady } from './plan-approved-guard.mjs';
import { fieldIdFor } from '../project-fields.mjs';
import { parseIssueFieldDb } from '../issue-field-db.mjs';
import { hydrateJournalSnapshot } from './story-cache/journal.mjs';

const projected = (value) => ({
  status: 'projected',
  value,
  revision: null,
  digest: createHash('sha256').update(json(value)).digest('hex'),
});

export function planProjectionResources({ record, snapshot, body, effects = [], statusKey }) {
  const source =
    snapshot ?? hydrateJournalSnapshot(record.generation.baseSnapshot, record.payloads);
  const fields = new Map(source.fields.map((field) => [field.fieldId, field]));
  const comments = new Map(
    source.inventory.map((id) => [id, { id, body: source.resources['comment:' + id].body }])
  );
  for (const effect of effects) {
    if (
      effect.key === statusKey ||
      effect.kind === 'issue-update' ||
      effect.outcome?.state === 'confirmed'
    )
      continue;
    if (effect.kind === 'project-field-update') fields.set(effect.target.fieldId, effect.candidate);
    else {
      const id = effect.kind === 'comment-create' ? effect.key : effect.target.commentNodeId;
      comments.set(id, {
        id,
        body: typeof effect.candidate === 'string' ? effect.candidate : effect.candidate.body,
      });
    }
  }
  return { body, fields: [...fields.values()], comments: [...comments.values()] };
}

export async function derivePlanDecompositionProjection({
  source,
  identity,
  cfg,
  projectDir,
  body,
  fields,
  comments,
  assessedAt,
  deps = {},
}) {
  const subject = source.input.subject;
  if (
    subject.issue !== identity.issueNumber ||
    subject.repository !== identity.repository ||
    subject.projectId !== identity.projectId ||
    subject.projectItemId !== identity.projectItemId
  )
    throw new Error('decomposition:projection-subject');
  const values = new Map(fields.map((field) => [field.fieldId, field.value]));
  const board = {
    estimate: values.get(fieldIdFor(cfg, 'estimate')) ?? null,
    size: values.get(fieldIdFor(cfg, 'size'))?.name ?? null,
  };
  const parsed = parseIssueFieldDb(body);
  if (!parsed.ok) throw new Error('decomposition:projection-fields');
  const bodyFields = { estimate: parsed.values.estimate ?? null, size: parsed.values.size ?? null };
  const records = comments
    .filter((row) => /<!--\s*aitm-record/i.test(row.body))
    .map((row) =>
      parseAitmRecord({
        commentNodeId: row.id,
        body: row.body,
        expectedRepository: identity.repository,
        expectedIssue: identity.issueNumber,
      })
    );
  const forecasts = recordsForProjection(records);
  const ready = readCandidateForecastReady(body);
  const projection = {
    forecast: forecasts.find((row) => row.recordId === ready) ?? null,
    activeForecastRecordIds: forecasts
      .filter((row) => row.supersededBy === null)
      .map((row) => row.recordId),
    board,
    bodyFields,
  };
  const forecast = await deriveDecompositionForecastObservation({
    subject,
    body,
    comments,
    records,
    projection,
    projectionKind: 'frozen-candidate',
  });
  const observed = source.sourceObservations;
  const plan = await readDecompositionSelectedPlan({
    body,
    kind: classifyDecompositionKind(body).kind,
    projectDir,
    deps,
  });
  return deriveDecompositionAuthority({
    subject,
    cfg,
    projectDir,
    deps,
    projectionKind: 'frozen-candidate',
    assessedAt,
    issue: projected({ number: subject.issue, body }),
    reads: [
      projected({
        ...observed.readProject.value,
        ...board,
        ...(Array.isArray(observed.readProject.value.children)
          ? { children: projectNativePlanChildren(observed.readProject.value.children) }
          : {}),
      }),
      {
        status: 'observed',
        value: plan,
        revision: null,
        digest: createHash('sha256').update(json(plan)).digest('hex'),
      },
      forecast,
      observed.readPolicy,
    ],
  });
}
