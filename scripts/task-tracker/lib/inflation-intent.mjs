// @story #2163 — pure prediction; observed authority and sealed retry intent remain independent.
import { isDeepStrictEqual } from 'node:util';
import { collectDecompositionCommentProposals } from './decomposition-authority.mjs';
import { estimateEffectDigest } from './decomposition-publication.mjs';
import {
  intendedPublishedRevisionInput,
  readEstimateBeforeRecord,
} from './estimate-writer-publication.mjs';
import { readDecompositionRecords, replaceDecompositionRecords } from './decomposition-records.mjs';
import { decompositionInputDigest } from './decomposition-assessment.mjs';
import { normalizeDecompositionHours } from './decomposition-policy.mjs';
import { parseIssueFieldDb, stripIssueFieldDb, formatIssueFieldDb } from '../issue-field-db.mjs';
import { parsePreloadedIssueComments } from './github-records/github-comment-store.mjs';
import { maskFencedCodeBlocksPreservingOffsets } from './markers.mjs';
import {
  confirmedForecastRetirement,
  forecastPublicationTransition,
  matchesForecastBaseline,
} from './decomposition-publication-inputs.mjs';

const hash = estimateEffectDigest;
const fail = (code) => {
  throw new Error(`inflate-estimate:${code}`);
};
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const repository = (value) => (nonempty(value) ? value.toLowerCase() : null);

export function correlateInflationComment({ subject, restComment, graphqlComments }) {
  const bad = () => fail('comment-identity');
  if (
    !nonempty(subject?.repository) ||
    !positive(subject.issue) ||
    !Array.isArray(graphqlComments) ||
    !positive(restComment?.id) ||
    !nonempty(restComment.node_id) ||
    typeof restComment.body !== 'string'
  )
    bad();
  let url;
  try {
    url = new URL(restComment.issue_url);
  } catch {
    bad();
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname.toLowerCase() !==
      `/repos/${subject.repository.toLowerCase()}/issues/${subject.issue}`
  )
    bad();
  const opaque = new Set(),
    numeric = new Set();
  for (const node of graphqlComments) {
    if (
      !nonempty(node?.id) ||
      !positive(node.databaseId) ||
      typeof node.body !== 'string' ||
      node.issue?.number !== subject.issue ||
      repository(node.issue?.repository?.nameWithOwner) !== repository(subject.repository) ||
      opaque.has(node.id) ||
      numeric.has(node.databaseId)
    )
      bad();
    opaque.add(node.id);
    numeric.add(node.databaseId);
  }
  const matches = graphqlComments.filter(
    (node) => node.id === restComment.node_id || node.databaseId === restComment.id
  );
  if (
    matches.length !== 1 ||
    matches[0].id !== restComment.node_id ||
    matches[0].databaseId !== restComment.id ||
    matches[0].body !== restComment.body
  )
    bad();
  return {
    repository: subject.repository.toLowerCase(),
    issue: subject.issue,
    restId: restComment.id,
    graphqlId: restComment.node_id,
  };
}

function operationLines(body) {
  const lines = [
    ...body.matchAll(
      /^Publication operation: ([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/gm
    ),
  ].map((match) => match[1]);
  if (
    lines.length !== (body.match(/Publication operation:/g) ?? []).length ||
    new Set(lines).size !== lines.length
  )
    fail('audit-markers');
  return lines;
}

function semanticProposals({ body, commentIdentity, issueBody, board, bodyFields }) {
  const records = readDecompositionRecords(issueBody);
  const comparisonBody = replaceDecompositionRecords(issueBody, {
    assessment: records.assessment,
    publication: null,
  });
  const parsed = collectDecompositionCommentProposals({
    comments: [{ id: commentIdentity.graphqlId, body }],
    subject: { repository: commentIdentity.repository, issue: commentIdentity.issue },
    body: comparisonBody,
    published: null,
    board,
    bodyFields,
  });
  if (!parsed.available) fail('audit-semantics');
  return parsed.proposals;
}

export function deriveInflationIntendedInput({
  initial,
  proposal,
  commentIdentity,
  beforeBody,
  intendedBody,
}) {
  if (
    typeof beforeBody !== 'string' ||
    typeof intendedBody !== 'string' ||
    !intendedBody.startsWith(beforeBody) ||
    intendedBody === beforeBody
  )
    fail('audit-prefix');
  const beforeKeys = operationLines(beforeBody),
    afterKeys = operationLines(intendedBody);
  if (
    afterKeys.length !== beforeKeys.length + 1 ||
    !intendedBody.endsWith(`Publication operation: ${afterKeys.at(-1)}\n`)
  )
    fail('audit-markers');
  const sources = initial?.sourceObservations;
  if (
    initial?.input?.availability?.status !== 'complete' ||
    repository(initial.input.subject?.repository) !== commentIdentity?.repository ||
    initial.input.subject?.issue !== commentIdentity?.issue ||
    !nonempty(commentIdentity?.graphqlId) ||
    !positive(commentIdentity?.restId) ||
    ['readIssue', 'readProject', 'readForecast'].some(
      (key) =>
        sources?.[key]?.status !== 'observed' || sources[key].digest !== hash(sources[key].value)
    ) ||
    !Array.isArray(sources.readForecast.value?.proposals)
  )
    fail('intent-source');
  const context = {
    commentIdentity,
    issueBody: sources.readIssue.value.body,
    board: sources.readProject.value,
    bodyFields: sources.readForecast.value.observedProjections?.[1],
  };
  const before = semanticProposals({ ...context, body: beforeBody }),
    after = semanticProposals({ ...context, body: intendedBody });
  const semantics = (proposals) => proposals.map(({ sourceDigest: _digest, ...fields }) => fields);
  if (!isDeepStrictEqual(semantics(before), semantics(after))) fail('audit-semantics');
  const ids = new Set(before.map((p) => p.proposalId));
  const copy = structuredClone(initial),
    forecast = copy.sourceObservations.readForecast;
  let matches = 0;
  forecast.value.proposals = forecast.value.proposals.map((proposal) => {
    if (!ids.has(proposal.proposalId)) return proposal;
    matches++;
    const original = before.find((item) => item.proposalId === proposal.proposalId);
    if (!isDeepStrictEqual(proposal, original) || proposal.sourceDigest !== hash(beforeBody))
      fail('intent-source');
    return { ...proposal, sourceDigest: hash(intendedBody) };
  });
  if (matches > before.length) fail('intent-source');
  forecast.digest = hash(forecast.value);
  return intendedPublishedRevisionInput(copy, proposal);
}

// A comparison against immutable intent. Nothing from this projection is returned
// as authority, persisted, or allowed to replace the publication's sealed digest.
export async function assertInflationRetryAuthority({
  current,
  proposal,
  commentIdentity,
  beforeBody,
  intendedBody,
  publication,
  beforeRecord,
  forecastEvidence,
}) {
  const require = (condition, detail) => {
    if (!condition) fail(`pending-source-drift:${detail}`);
  };
  const same = isDeepStrictEqual;
  try {
    // Publication metadata uses assessment hours; effect seals retain physical half-hours.
    const recordedProposal = {
      ...proposal,
      estimate: {
        ...proposal.estimate,
        hours:
          proposal.estimate.hours === null
            ? null
            : normalizeDecompositionHours(proposal.estimate.hours),
      },
    };
    const sources = current?.sourceObservations,
      retainedTransition = sources?.readForecast?.status === 'unavailable';
    require(sources &&
      Object.entries(sources).every(
        ([key, source]) =>
          (source.status === 'observed' || (key === 'readForecast' && retainedTransition)) &&
          source.digest === hash(source.value)
      ), 'sources');
    require(current.projection.status !== 'malformed' &&
      (retainedTransition
        ? current.input.availability.status === 'incomplete' &&
          (same(current.input.availability.reasons, ['forecast-unavailable']) ||
            same([...current.input.availability.reasons].sort(), [
              'authority-conflict',
              'forecast-unavailable',
            ]))
        : same(current.input.availability, { status: 'complete', reasons: [] }) ||
          same(current.input.availability, {
            status: 'incomplete',
            reasons: ['authority-conflict'],
          })), 'availability');
    const body = sources.readIssue.value.body,
      project = sources.readProject.value,
      forecast = sources.readForecast.value,
      records = readDecompositionRecords(body),
      fields = parseIssueFieldDb(body),
      evidence = forecastEvidence;
    require(fields.ok &&
      evidence.body === body &&
      same(current.publication, publication) &&
      same(records.publication, publication) &&
      same(publication.subject, current.input.subject) &&
      publication.writerId === 'inflate-estimate' &&
      publication.status === 'pending' &&
      same(publication.proposal, recordedProposal) &&
      same(readEstimateBeforeRecord(body), beforeRecord) &&
      same(beforeRecord.subject, publication.subject) &&
      beforeRecord.writerId === publication.writerId &&
      beforeRecord.operationId === publication.operationId &&
      beforeRecord.beforeInputDigest === publication.beforeInputDigest &&
      beforeRecord.intendedInputDigest === publication.intendedInputDigest &&
      publication.effects.find((e) => e.id === 'writer-before-values')?.intendedDigest ===
        hash(beforeRecord), 'metadata');
    const board = { estimate: project.estimate ?? null, size: project.size ?? null },
      bodyFields = { estimate: fields.values.estimate ?? null, size: fields.values.size ?? null },
      projection = evidence.projection;
    require(same(projection.board, board) &&
      same(projection.bodyFields, bodyFields) &&
      same(forecast.observedProjections, [board, bodyFields]), 'snapshots');
    require(same(
      correlateInflationComment({
        subject: publication.subject,
        restComment: {
          id: commentIdentity.restId,
          node_id: commentIdentity.graphqlId,
          body: beforeBody,
          issue_url: `https://api.github.com/repos/${commentIdentity.repository}/issues/${commentIdentity.issue}`,
        },
        graphqlComments: evidence.comments,
      }),
      commentIdentity
    ), 'identity');
    const parsedRecords = parsePreloadedIssueComments({
      nodes: evidence.comments,
      repository: publication.subject.repository,
      issue: publication.subject.issue,
    });
    require(same(parsedRecords, evidence.records), 'records');
    const forecasts = parsedRecords.filter((r) => r.envelope.recordType === 'estimation-forecast'),
      superseded = new Set(forecasts.map((r) => r.envelope.supersedes).filter(Boolean)),
      active = forecasts.filter((r) => !superseded.has(r.envelope.recordId));
    require(active.length <= 1 &&
      same(
        active.map((r) => r.envelope.recordId),
        projection.activeForecastRecordIds
      ), 'active');
    const envelope = active[0]?.envelope,
      known = envelope
        ? {
            estimate: envelope.payload.plan.humanHours,
            size: envelope.payload.plan.size,
            recordId: envelope.recordId,
            payloadHash: envelope.payloadHash,
          }
        : { estimate: null, size: null, recordId: null, payloadHash: null };
    require(Object.entries(known).every(([key, value]) => same(forecast[key], value)) &&
      same(
        beforeRecord.forecastBaseline,
        envelope ? { recordId: known.recordId, payloadHash: known.payloadHash } : null
      ), 'forecast');
    const ready = [
      ...maskFencedCodeBlocksPreservingOffsets(body).matchAll(
        /<!--\s*aitm-estimation-forecast-ready\b[\s\S]*?(?:-->|$)/g
      ),
    ];
    if (projection.forecast) {
      require(envelope &&
        same(projection.forecast.envelope, envelope) &&
        projection.forecast.recordId === envelope.recordId &&
        projection.forecast.payloadHash === envelope.payloadHash &&
        ready.length === 1 &&
        ready[0][0].match(
          /^<!--\s*aitm-estimation-forecast-ready\s+record-id="([0-7][0-9A-HJKMNP-TV-Z]{25})"\s*-->$/
        )?.[1] === envelope.recordId, 'ready');
    } else {
      require(ready.length === 0, 'ready');
      if (envelope && !retainedTransition)
        require(publication.effects.some(
          (e) =>
            e.resource === 'forecast' &&
            e.targetIdentity === `record:${known.recordId}` &&
            e.status === 'confirmed' &&
            e.observedDigest === e.intendedDigest &&
            e.intendedDigest === hash(beforeRecord.forecastBaseline)
        ) &&
          publication.effects.some(
            (e) =>
              e.resource === 'ready-marker' &&
              e.status === 'confirmed' &&
              e.observedDigest === e.intendedDigest &&
              e.intendedDigest === hash(null)
          ), 'retirement');
    }
    // Preserve the actual parser's published input, including retired forecasts.
    const context = {
        comments: evidence.comments,
        subject: publication.subject,
        body,
        published: projection.forecast ? known : null,
        board,
        bodyFields,
      },
      actual = collectDecompositionCommentProposals(context);
    require(actual.available && same(actual.proposals, forecast.proposals), 'proposals');
    if (retainedTransition) {
      require(active.length === 1 &&
        !projection.forecast &&
        ready.length === 0 &&
        same(
          Object.keys(forecast).sort(),
          [
            'estimate',
            'size',
            'recordId',
            'payloadHash',
            'proposals',
            'observedProjections',
            'publicationTransition',
          ].sort()
        ) &&
        same(
          forecast.publicationTransition,
          forecastPublicationTransition({
            ready,
            readyId: null,
            active,
            projection,
            proposalsAvailable: actual.available,
          })
        ), 'retired-transition');
      const retained = {
        'retired-forecast': {
          resource: 'forecast',
          targetIdentity: `record:${known.recordId}`,
          value: beforeRecord.forecastBaseline,
        },
        'retired-ready': {
          resource: 'ready-marker',
          targetIdentity: `${publication.subject.repository}#${publication.subject.issue}:ready-marker`,
          value: null,
        },
      };
      for (const [id, expected] of Object.entries(retained)) {
        const effects = publication.effects.filter((e) => e.id === id),
          seals = beforeRecord.effects.filter((e) => e.id === id),
          digest = hash(expected.value);
        require(effects.length === 1 && seals.length === 1, 'retired-effects');
        const [effect] = effects,
          [seal] = seals;
        require(effect.resource === expected.resource &&
          effect.targetIdentity === expected.targetIdentity &&
          effect.intendedDigest === digest &&
          (effect.status !== 'confirmed' || effect.observedDigest === digest) &&
          same(seal, {
            id,
            resource: expected.resource,
            targetIdentity: expected.targetIdentity,
            beforeDigest: digest,
            intendedDigest: digest,
            permittedDigests: [digest],
          }), 'retired-seal');
      }
      const beforeEffects = publication.effects.filter((e) => e.id === 'writer-before-values'),
        baseline = beforeRecord.fieldBaseline;
      require(beforeEffects.length === 1 &&
        baseline &&
        beforeEffects[0].resource === 'assessment' &&
        beforeEffects[0].targetIdentity.startsWith(
          `${publication.subject.repository}#${publication.subject.issue}:estimate-before:`
        ) &&
        (beforeEffects[0].status !== 'confirmed' ||
          beforeEffects[0].observedDigest === hash(beforeRecord)) &&
        ['size', 'estimate', 'fields'].every(
          (id) =>
            beforeRecord.effects.find((e) => e.id === id)?.beforeDigest ===
            hash(id === 'fields' ? baseline : baseline[id])
        ), 'retired-before');
    }
    const values = {
        audit: beforeBody,
        size: board.size,
        estimate: board.estimate,
        fields: bodyFields,
      },
      intendedValues = {
        audit: intendedBody,
        size: proposal.size,
        estimate: proposal.estimate.hours,
        fields: { estimate: proposal.estimate.hours, size: proposal.size },
      },
      resources = {
        audit: 'comment',
        size: 'project-size',
        estimate: 'project-estimate',
        fields: 'body-fields',
      },
      targets = {
        audit: `comment:${commentIdentity.restId}`,
        size: publication.subject.projectItemId,
        estimate: publication.subject.projectItemId,
        fields: `${publication.subject.repository}#${publication.subject.issue}:fields`,
      };
    for (const id of Object.keys(values)) {
      const saved = beforeRecord.effects.filter((e) => e.id === id),
        effects = publication.effects.filter((e) => e.id === id);
      require(saved.length === 1 && effects.length === 1, 'effect-identity');
      const [effect] = effects,
        [seal] = saved,
        digest = hash(values[id]);
      require(effect.resource === resources[id] &&
        effect.targetIdentity === targets[id] &&
        effect.intendedDigest === hash(intendedValues[id]) &&
        ['id', 'resource', 'targetIdentity', 'intendedDigest'].every(
          (key) => seal[key] === effect[key]
        ) &&
        (effect.status === 'confirmed'
          ? digest === effect.intendedDigest
          : seal.permittedDigests.includes(digest)), `effect-${id}`);
    }
    require(operationLines(intendedBody).includes(publication.operationId) &&
      intendedBody.endsWith(`\nPublication operation: ${publication.operationId}\n`), 'audit');
    const completed = structuredClone(publication);
    for (const effect of completed.effects)
      if (
        Object.hasOwn(values, effect.id) ||
        (retainedTransition &&
          ['retired-forecast', 'retired-ready', 'writer-before-values'].includes(effect.id))
      ) {
        effect.status = 'confirmed';
        effect.observedDigest = effect.intendedDigest;
      }
    let completedBody = replaceDecompositionRecords(body, {
      assessment: records.assessment,
      publication: completed,
    });
    completedBody = `${stripIssueFieldDb(completedBody)}\n\n${formatIssueFieldDb({
      ...fields.values,
      size: proposal.size,
      estimate: proposal.estimate.hours,
    })}\n`;
    const finalFields = intendedValues.fields,
      completedProposals = collectDecompositionCommentProposals({
        ...context,
        comments: evidence.comments.map((c) =>
          c.id === commentIdentity.graphqlId ? { ...c, body: intendedBody } : c
        ),
        body: completedBody,
        board: finalFields,
        bodyFields: finalFields,
      });
    require(completedProposals.available, 'completed-proposals');
    if (retainedTransition)
      require(matchesForecastBaseline({
        publication: completed,
        body: completedBody,
        forecast: envelope,
      }) &&
        (await confirmedForecastRetirement({
          publication: completed,
          active,
          ready,
          project: { ...project, ...finalFields },
          bodyFields: finalFields,
          body: completedBody,
        })), 'completed-retirement');
    const targetIds = new Set(
        semanticProposals({
          body: intendedBody,
          commentIdentity,
          issueBody: body,
          board,
          bodyFields,
        }).map((p) => p.proposalId)
      ),
      other = (proposals) => proposals.filter((p) => !targetIds.has(p.proposalId));
    require(same(
      other(actual.proposals),
      other(completedProposals.proposals)
    ), 'unrelated-proposals');
    const copy = structuredClone(current);
    copy.sourceObservations.readForecast.value.proposals = completedProposals.proposals;
    if (retainedTransition) delete copy.sourceObservations.readForecast.value.publicationTransition;
    copy.sourceObservations.readForecast.digest = hash(copy.sourceObservations.readForecast.value);
    copy.input.availability = { status: 'complete', reasons: [] };
    require(decompositionInputDigest(intendedPublishedRevisionInput(copy, proposal)) ===
      publication.intendedInputDigest, 'intent');
  } catch (error) {
    if (error.message.startsWith('inflate-estimate:pending-source-drift:')) throw error;
    fail('pending-source-drift:evidence');
  }
}
