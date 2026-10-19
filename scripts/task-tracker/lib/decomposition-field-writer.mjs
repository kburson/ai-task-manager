// @story #1988 — shared concrete board and body Estimate effects.
import {
  executeEstimateWriter,
  readEstimateWriterAuthority,
  observedEstimateEffect,
} from './estimate-writer-publication.mjs';
import { mutateIssueBody } from './issue-body-mutate.mjs';
import { parseIssueFieldDb, formatIssueFieldDb, stripIssueFieldDb } from '../issue-field-db.mjs';
export async function publishFieldEstimateRevision({
  cfg,
  issueNumber,
  writerId,
  key,
  estimate,
  size,
  writeField,
  beforeEffects,
  applyBody,
  extraEffects = [],
  deriveIntendedInput,
  deps = {},
}) {
  const current = await readEstimateWriterAuthority({ cfg, issueNumber, deps });
  const actual = current.sourceObservations.readProject.value;
  if (!actual) throw new Error('estimate-publication:project-unavailable');
  if (size === undefined) size = actual.size;
  if (
    actual.estimate === estimate &&
    actual.size === size &&
    parseIssueFieldDb(current.sourceObservations.readIssue.value.body).values.estimate ===
      estimate &&
    parseIssueFieldDb(current.sourceObservations.readIssue.value.body).values.size === size &&
    current.publication?.status !== 'pending'
  )
    return { status: 'unchanged' };
  const readAuthority = () => readEstimateWriterAuthority({ cfg, issueNumber, deps });
  return executeEstimateWriter({
    cfg,
    issueNumber,
    writerId,
    key,
    proposal: {
      estimate: {
        basis: estimate === null ? 'unset' : 'published',
        hours: estimate,
        proposalId: null,
      },
      size,
    },
    deriveIntendedInput,
    deps: { ...deps, beforePublicationEffects: beforeEffects },
    effects: async ({ subject }) => [
      ...extraEffects,
      ...[
        ['estimate', estimate, 'project-estimate'],
        ['size', size, 'project-size'],
      ].map(([field, value, resource]) => ({
        id: field,
        resource,
        targetIdentity: subject.projectItemId,
        value,
        read: async () =>
          observedEstimateEffect(
            (await readAuthority()).sourceObservations.readProject.value[field] ?? null
          ),
        apply: (context) => writeField({ field, value, context, effectId: field }),
      })),
      {
        id: 'fields',
        resource: 'body-fields',
        targetIdentity: `${cfg.repo}#${issueNumber}:fields`,
        value: { estimate, size },
        read: async () => {
          const values = parseIssueFieldDb(
            (await readAuthority()).sourceObservations.readIssue.value.body
          ).values;
          return observedEstimateEffect({
            estimate: values.estimate ?? null,
            size: values.size ?? null,
          });
        },
        apply: async (context) =>
          applyBody
            ? applyBody(context)
            : (deps.mutateIssueBody ?? mutateIssueBody)({
                issueNumber,
                repo: cfg.repo,
                mutate: (base) => {
                  const parsed = parseIssueFieldDb(base);
                  if (!parsed.ok) throw new Error('estimate-publication:body-fields');
                  return (
                    stripIssueFieldDb(base) +
                    '\n' +
                    formatIssueFieldDb({ ...parsed.values, estimate, size }) +
                    '\n'
                  );
                },
                deps: deps.decomposition,
              }),
      },
    ],
  });
}
