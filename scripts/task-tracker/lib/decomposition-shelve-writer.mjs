// @story #1988 — the existing journal remains the recovery authority for Shelve phases.
import {
  executeEstimateWriter,
  observedEstimateEffect,
  intendedPublishedRevisionInput,
} from './estimate-writer-publication.mjs';
import { assertDecompositionPublicationOwner } from './decomposition-projection.mjs';
import { readDecompositionRecords, replaceDecompositionRecords } from './decomposition-records.mjs';
import { parseMarker } from './marker-grammar.mjs';
import { parseIssueFieldDb } from '../issue-field-db.mjs';
import { parseRefinementHistory } from './refinement-history.mjs';
import { intendedCommentProposalInput } from './decomposition-proposal-writer.mjs';
import {
  listRefineEstimateComments,
  removePlannedEstimateAppendix,
  clearPlannedEstimate,
  findRefineEstimateComment,
} from './refine-estimate-comment.mjs';
import { createGitHubEstimationRecordIo } from './estimation/runtime-adapter.mjs';
const fields = (value) =>
  Object.fromEntries(['priority', 'size', 'estimate', 'rank'].map((k) => [k, value?.[k] ?? null]));
const empty = fields(null);
const stripProjection = (body) =>
  replaceDecompositionRecords(body, { assessment: null, publication: null }).replace(
    /\n{3,}/g,
    '\n\n'
  );
export async function publishShelveRevision({
  cfg,
  issueNumber,
  reason,
  removeOwner,
  refreshStaleBlockers,
  snapshot,
  fetchSnapshot,
  mutateBody,
  runTransaction,
  invalidateBody,
  parseJournal,
  deps = {},
}) {
  const history = parseRefinementHistory(snapshot.body).at(-1);
  const digest =
    parseMarker(snapshot.body.match(/<!--\s*aitm-refinement-snapshot\s+[^>]*-->/)?.[0] ?? '')?.props
      .digest ?? history?.refinementSnapshotDigest;
  if (!digest) throw new Error('shelve:publication-source-missing');
  const key = {
    reason,
    removeOwner: Boolean(removeOwner),
    refreshStaleBlockers: Boolean(refreshStaleBlockers),
    snapshot: digest,
  };
  const proposal = { estimate: { basis: 'unset', hours: null, proposalId: null }, size: null };
  const planned = deps.plannedEstimate ?? {};
  const comments = await (planned.listComments ?? listRefineEstimateComments)({ cfg, issueNumber });
  const comment = await findRefineEstimateComment({ cfg, issueNumber, deps: planned });
  const nextComment = comment ? removePlannedEstimateAppendix(comment.body) : null;
  const readyId =
    snapshot.body.match(
      /<!--\s*aitm-estimation-forecast-ready\s+record-id="([0-7][0-9A-HJKMNP-TV-Z]{25})"\s*-->/
    )?.[1] ?? null;
  const io = readyId
    ? (deps.recordIo ?? createGitHubEstimationRecordIo(deps.decomposition?.forecast ?? {}))
    : null;
  const forecastRead = async () => {
    const all = await io.listIssueRecords({ repository: cfg.repo, issue: issueNumber });
    const matches = all.filter(
      (r) => r.envelope.recordId === readyId && r.envelope.recordType === 'estimation-forecast'
    );
    if (matches.length !== 1) throw new Error('shelve:forecast-identity');
    return observedEstimateEffect({
      recordId: readyId,
      payloadHash: matches[0].envelope.payloadHash,
    });
  };
  const forecast = readyId ? (await forecastRead()).value : null;
  let domain = null;
  const read = () => fetchSnapshot({ cfg, issueNumber });
  const assertOwner = async (context) => {
    await assertDecompositionPublicationOwner(context, {
      subject: context.subject,
      operationId: context.operationId,
      writerId: 'shelve',
      effectId: 'transaction',
      requireIntent: true,
    });
    const current = await read(),
      recorded = parseRefinementHistory(current.body).at(-1);
    const before = recorded?.fields ?? snapshot.fields;
    for (const value of [current.fields, parseIssueFieldDb(current.body).values])
      for (const name of Object.keys(empty))
        if (value[name] !== null && value[name] !== undefined && value[name] !== before[name])
          throw new Error('shelve:field-drift');
  };
  const sourceView = (value) => ({ ...value, body: stripProjection(value.body) });
  const outcome = await executeEstimateWriter({
    cfg,
    issueNumber,
    writerId: 'shelve',
    key,
    proposal,
    deps: { ...deps, supersedePending: true },
    deriveIntendedInput: (initial) => {
      const future = structuredClone(initial);
      future.input = intendedPublishedRevisionInput(initial, proposal);
      Object.assign(future.sourceObservations.readProject.value, empty);
      const raw = future.sourceObservations.readForecast.value;
      if (Array.isArray(raw.observedProjections))
        raw.observedProjections = raw.observedProjections.map((v) => ({
          ...v,
          estimate: null,
          size: null,
        }));
      const body = invalidateBody(initial.sourceObservations.readIssue.value.body);
      return intendedCommentProposalInput({
        initial: future,
        subject: initial.input.subject,
        body,
        comments: comments.map((c) => ({
          id: c.node_id ?? String(c.id),
          body: c.id === comment?.id ? nextComment : c.body,
        })),
      });
    },
    effects: async ({ subject }) => [
      ...(readyId
        ? [
            {
              id: 'forecast-snapshot',
              resource: 'forecast',
              targetIdentity: `record:${readyId}`,
              value: forecast,
              read: forecastRead,
              apply: () => {
                throw new Error('shelve:forecast-drift');
              },
            },
          ]
        : []),
      ...(comment && nextComment !== comment.body
        ? [
            {
              id: 'appendix',
              resource: 'comment',
              targetIdentity: `comment:${comment.nodeId ?? comment.id}`,
              value: nextComment,
              read: async () => {
                const c = await findRefineEstimateComment({ cfg, issueNumber, deps: planned });
                if (c?.id !== comment.id) throw new Error('shelve:comment-identity');
                return observedEstimateEffect(c.body);
              },
              apply: async (context) => {
                const r = await clearPlannedEstimate({
                  cfg,
                  issueNumber,
                  context,
                  effectId: 'appendix',
                  deps: planned,
                });
                if (r.status !== 'cleared') throw new Error(`shelve:${r.status}`);
              },
            },
          ]
        : []),
      {
        id: 'transaction',
        resource: 'body-fields',
        targetIdentity: `${cfg.repo}#${issueNumber}:shelve-journal`,
        value: { phase: 'verified' },
        read: async () => {
          const s = await read(),
            j = parseJournal(s.body);
          return observedEstimateEffect(
            j?.phase === 'verified' &&
              s.state === 'backlog' &&
              Object.values(fields(s.fields)).every((v) => v === null) &&
              Object.values(fields(parseIssueFieldDb(s.body).values)).every((v) => v === null)
              ? { phase: 'verified' }
              : null
          );
        },
        apply: async (context) => {
          const guarded = {
            ...deps,
            fetchSnapshot: async (args) => sourceView(await fetchSnapshot(args)),
            mutateBody: async (args) => {
              await assertOwner(context);
              return mutateBody({
                ...args,
                mutate: (base) => {
                  const records = readDecompositionRecords(base);
                  return replaceDecompositionRecords(args.mutate(stripProjection(base)), records);
                },
              });
            },
          };
          for (const name of ['clearBoardFields', 'runMoveState', 'removeOwner']) {
            const fn = deps[name];
            if (fn)
              guarded[name] = async (args) => {
                await assertOwner(context);
                return fn({ ...args, context, effectId: 'transaction' });
              };
          }
          domain = await runTransaction(guarded);
          if (domain.status !== 'shelved')
            throw new Error(`shelve:${domain.status}:${domain.error ?? ''}`);
        },
      },
      {
        id: 'board',
        resource: 'project-estimate',
        targetIdentity: subject.projectItemId,
        value: empty,
        read: async () => observedEstimateEffect(fields((await read()).fields)),
        apply: () => {
          throw new Error('shelve:journal-board-unconfirmed');
        },
      },
      {
        id: 'fields',
        resource: 'body-fields',
        targetIdentity: `${cfg.repo}#${issueNumber}:fields`,
        value: { estimate: null, size: null },
        read: async () => {
          const f = parseIssueFieldDb((await read()).body).values;
          return observedEstimateEffect({ estimate: f.estimate ?? null, size: f.size ?? null });
        },
        apply: () => {
          throw new Error('shelve:journal-body-unconfirmed');
        },
      },
      ...(readyId
        ? [
            {
              id: 'ready',
              resource: 'ready-marker',
              targetIdentity: `${cfg.repo}#${issueNumber}:ready-marker`,
              value: null,
              read: async () =>
                observedEstimateEffect(
                  (await read()).body.match(
                    /<!--\s*aitm-estimation-forecast-ready\s+record-id="([0-7][0-9A-HJKMNP-TV-Z]{25})"\s*-->/
                  )?.[1] ?? null
                ),
              apply: () => {
                throw new Error('shelve:journal-ready-unconfirmed');
              },
            },
          ]
        : []),
    ],
  });
  if (outcome.status === 'recorded')
    return (
      domain ?? {
        status: 'shelved',
        from: parseJournal((await read()).body)?.from,
        to: 'backlog',
        tx: parseJournal((await read()).body)?.tx,
      }
    );
  return {
    status: 'recovery-pending',
    publicationStatus: 'pending',
    reason: outcome.reason,
    phase: parseJournal((await read()).body)?.phase ?? null,
  };
}
