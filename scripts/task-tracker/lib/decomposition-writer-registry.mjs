// @story #1988 — closed, read-only registrations for predecessor reconciliation.
import { parseIssueFieldDb } from '../issue-field-db.mjs';
import { listRefineEstimateComments } from './refine-estimate-comment.mjs';
import { createGitHubEstimationRecordIo, plannedAppendix } from './estimation/runtime-adapter.mjs';
import {
  readEstimateBeforeRecord,
  observedEstimateEffect,
} from './estimate-writer-publication.mjs';
import { DECOMPOSITION_WRITER_IDS } from './decomposition-assessment.mjs';
export async function readRegisteredEstimateEffect({
  cfg,
  issueNumber,
  publication,
  effect,
  collect,
  deps = {},
}) {
  if (!DECOMPOSITION_WRITER_IDS.includes(publication.writerId))
    throw new Error('estimate-publication:unregistered-writer');
  const current = await collect(),
    body = current.sourceObservations.readIssue.value.body,
    project = current.sourceObservations.readProject.value,
    subject = current.input.subject;
  const bodyTarget = `${cfg.repo}#${issueNumber}:fields`;
  let value;
  if (
    effect.id === 'authority-context' &&
    effect.resource === 'assessment' &&
    effect.targetIdentity === `${subject.repository}#${issueNumber}:authority-context`
  )
    value = {
      subject,
      scopeDigest: current.input.scopeDigest,
      kind: current.input.kind,
      policyDigest: current.input.policy.digest,
    };
  else if (
    effect.id === 'writer-before-values' &&
    effect.resource === 'assessment' &&
    (effect.targetIdentity === `${subject.repository}#${issueNumber}:estimate-before` ||
      (effect.targetIdentity.startsWith(`${subject.repository}#${issueNumber}:estimate-before:`) &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
          effect.targetIdentity.split(':').at(-1)
        )))
  )
    value = readEstimateBeforeRecord(body);
  else if (
    publication.writerId === 'cancel-plan' &&
    effect.resource === 'body-fields' &&
    effect.id === 'recovery' &&
    effect.targetIdentity === `${cfg.repo}#${issueNumber}:cancel-plan-recovery`
  ) {
    const { readCancellationRecovery } = await import('./decomposition-cancellation-writer.mjs');
    value = readCancellationRecovery(body, publication.operationId);
  } else if (
    ['cancel-plan', 'shelve'].includes(publication.writerId) &&
    effect.id === 'board' &&
    effect.resource === 'project-estimate' &&
    effect.targetIdentity === subject.projectItemId
  ) {
    const { fetchRefinementBoardFields } = await import('./refinement-snapshot-guard.mjs');
    const { defaultFetchSnapshot } = await import('./shelve-transaction.mjs');
    const actual =
      publication.writerId === 'shelve'
        ? (await (deps.fetchSnapshot ?? defaultFetchSnapshot)({ cfg, issueNumber })).fields
        : await (deps.fetchBoardFields ?? fetchRefinementBoardFields)({ cfg, issueNumber });
    value = Object.fromEntries(
      ['priority', 'size', 'estimate', 'rank'].map((key) => [key, actual[key] ?? null])
    );
  } else if (
    publication.writerId === 'cancel-plan' &&
    effect.id === 'body' &&
    effect.resource === 'body-fields' &&
    effect.targetIdentity === `${cfg.repo}#${issueNumber}:cancellation`
  ) {
    const { planArtifactMarkers } = await import('../verbs/cancel-plan.mjs');
    const { parseMarker } = await import('./marker-grammar.mjs');
    const fields = parseIssueFieldDb(body);
    if (!fields.ok) throw new Error('estimate-publication:body-fields');
    value = {
      fields: Object.fromEntries(
        ['priority', 'size', 'estimate', 'rank'].map((key) => [key, fields.values[key] ?? null])
      ),
      artifacts: planArtifactMarkers(body),
      reason:
        parseMarker(body.match(/<!--\s*aitm-plan-cancelled\s+[^>]*-->/)?.[0] ?? '')?.props
          ?.reason ?? null,
    };
  } else if (
    publication.writerId === 'shelve' &&
    effect.id === 'transaction' &&
    effect.resource === 'body-fields' &&
    effect.targetIdentity === `${cfg.repo}#${issueNumber}:shelve-journal`
  ) {
    const { defaultFetchSnapshot, parseShelveJournal } = await import('./shelve-transaction.mjs');
    const snapshot = await (deps.fetchSnapshot ?? defaultFetchSnapshot)({ cfg, issueNumber });
    if (snapshot.itemId && snapshot.itemId !== subject.projectItemId)
      throw new Error('estimate-publication:membership-drift');
    const parsed = parseIssueFieldDb(snapshot.body);
    if (!parsed.ok) throw new Error('estimate-publication:body-fields');
    value =
      parseShelveJournal(snapshot.body)?.phase === 'verified' &&
      snapshot.state === 'backlog' &&
      [snapshot.fields, parsed.values].every((fields) =>
        ['priority', 'size', 'estimate', 'rank'].every((key) => (fields[key] ?? null) === null)
      )
        ? { phase: 'verified' }
        : null;
  } else if (
    effect.id === 'estimate' &&
    effect.resource === 'project-estimate' &&
    effect.targetIdentity === subject.projectItemId
  )
    value = project.estimate ?? null;
  else if (
    effect.id === 'size' &&
    effect.resource === 'project-size' &&
    effect.targetIdentity === subject.projectItemId
  )
    value = project.size ?? null;
  else if (
    effect.id === 'fields' &&
    effect.resource === 'body-fields' &&
    effect.targetIdentity.toLowerCase() === bodyTarget.toLowerCase()
  ) {
    const parsed = parseIssueFieldDb(body);
    if (!parsed.ok) throw new Error('estimate-publication:body-fields');
    value = { estimate: parsed.values.estimate ?? null, size: parsed.values.size ?? null };
  } else if (
    effect.resource === 'comment' &&
    ['audit', 'appendix'].includes(effect.id) &&
    effect.targetIdentity.startsWith('comment:')
  ) {
    const id = effect.targetIdentity.slice(8),
      comments = await (
        (deps.plannedEstimate ?? deps.plannedComment ?? {}).listComments ??
        listRefineEstimateComments
      )({ cfg, issueNumber });
    const matches = comments.filter(
      (c) =>
        String(c.node_id ?? c.nodeId ?? c.id) === id ||
        String(c.id) === id ||
        c.body.includes(`<!-- aitm-estimate-operation: ${id} -->`)
    );
    if (matches.length > 1) throw new Error('estimate-publication:duplicate-effect-comment');
    value = matches[0]?.body ?? null;
  } else if (
    effect.id === 'appendix' &&
    effect.resource === 'plan-appendix' &&
    effect.targetIdentity.toLowerCase() ===
      `${cfg.repo}#${issueNumber}:planned-estimate`.toLowerCase()
  ) {
    const comments = await (
      (deps.plannedEstimate ?? deps.plannedComment ?? {}).listComments ?? listRefineEstimateComments
    )({ cfg, issueNumber });
    value = plannedAppendix(comments, issueNumber);
  } else if (
    ['ready', 'retired-ready'].includes(effect.id) &&
    effect.resource === 'ready-marker' &&
    effect.targetIdentity.toLowerCase() === `${cfg.repo}#${issueNumber}:ready-marker`.toLowerCase()
  )
    value =
      body.match(
        /<!--\s*aitm-estimation-forecast-ready\s+record-id="([0-7][0-9A-HJKMNP-TV-Z]{25})"\s*-->/
      )?.[1] ?? null;
  else if (
    effect.resource === 'forecast' &&
    ['forecast', 'forecast-snapshot', 'retired-forecast'].includes(effect.id) &&
    /^record:[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(effect.targetIdentity)
  ) {
    const records = await (
      deps.recordIo ?? createGitHubEstimationRecordIo(deps.decomposition?.forecast ?? {})
    ).listIssueRecords({ repository: cfg.repo, issue: issueNumber });
    const id = effect.targetIdentity.slice(7),
      matches = records.filter(
        (r) => r.envelope.recordId === id && r.envelope.recordType === 'estimation-forecast'
      );
    if (matches.length > 1) throw new Error('estimate-publication:duplicate-effect-forecast');
    value = matches.length ? { recordId: id, payloadHash: matches[0].envelope.payloadHash } : null;
  } else
    throw new Error(
      `estimate-publication:unregistered-effect:${publication.writerId}:${effect.id}`
    );
  return observedEstimateEffect(value);
}
export async function reconcileEstimatePredecessor({ publication, ...input }) {
  const effects = [];
  for (const effect of publication.effects) {
    const observed = await readRegisteredEstimateEffect({ ...input, publication, effect });
    // A failed effect means its current value is observed, but differs from the old intent.
    // The owner independently repeats this read before recording supersession.
    effects.push({
      ...effect,
      status: observed.digest === effect.intendedDigest ? 'confirmed' : 'failed',
      observedDigest: observed.digest,
    });
  }
  return { operationId: publication.operationId, effects };
}
