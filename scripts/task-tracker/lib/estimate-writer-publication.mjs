import { parseIssueFieldDb } from '../issue-field-db.mjs';
import {
  readRegisteredEstimateEffect,
  reconcileEstimatePredecessor,
} from './decomposition-writer-registry.mjs';
import { mutateIssueBody } from './issue-body-mutate.mjs';
import {
  DECOMPOSITION_EFFECT_RESOURCES,
  DECOMPOSITION_WRITER_IDS,
  exactDecompositionKeys,
} from './decomposition-assessment.mjs';
import { normalizeDecompositionHours } from './decomposition-policy.mjs';
import {
  estimateProjectionFromProposals,
  isMigrationProjectionRepair,
} from './decomposition-publication-inputs.mjs';
// @story #1988 — adapter preparation; only current reads grant ownership.
import { createHash } from 'node:crypto';
import { projectItemForIssue } from '../../gh/lib/github-projects.mjs';
import { getProjectDir } from '../paths.mjs';
import { createDecompositionRuntime } from './decomposition-authority.mjs';
import {
  canonicalDecompositionJson,
  decompositionInputDigest,
} from './decomposition-assessment.mjs';
import { publishEstimateRevision, estimateEffectDigest } from './decomposition-publication.mjs';
export const observedEstimateEffect = (value) => ({
  status: 'observed',
  value,
  digest: estimateEffectDigest(value),
});
export function estimateOperationId(writerId, key) {
  const hex = createHash('sha256')
    .update(canonicalDecompositionJson({ writerId, key }))
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
// Intent identity is sealed in the before-record target even if interruption
// occurs before that record lands. New revisions bind the predecessor operation;
// identical retries retain their exact operation, including older record shapes.
export function resolveEstimateOperationId(writerId, key, publication = null) {
  const intentId = estimateOperationId(writerId, key);
  const prefix = publication
    ? `${publication.subject.repository}#${publication.subject.issue}:estimate-before`
    : null;
  const before = publication?.effects.find((effect) => effect.id === 'writer-before-values');
  if (
    publication?.writerId === writerId &&
    (before?.targetIdentity === `${prefix}:${intentId}` ||
      (publication.operationId === intentId && before?.targetIdentity === prefix))
  )
    return publication.operationId;
  return estimateOperationId(writerId, { intentId, predecessor: publication?.operationId ?? null });
}
// This is an intended-value calculation, never an authority observation or admission.
export function intendedPublishedRevisionInput(initial, proposal) {
  const input = structuredClone(initial.input);
  input.estimate = structuredClone(proposal.estimate);
  input.size = proposal.size;
  if (
    isMigrationProjectionRepair(initial, initial.migrationWriterId, {
      ...proposal,
      estimate: {
        ...proposal.estimate,
        hours:
          proposal.estimate.hours === null
            ? null
            : normalizeDecompositionHours(proposal.estimate.hours),
      },
    })
  )
    input.availability = { status: 'complete', reasons: [] };
  const project = {
    ...initial.sourceObservations.readProject.value,
    estimate: proposal.estimate.hours,
    size: proposal.size,
  };
  input.observations.find((o) => o.resource === 'project').digest = estimateEffectDigest({
    projectId: project.projectId,
    projectItemId: project.projectItemId,
    estimate: project.estimate,
    size: project.size,
  });
  const forecast = structuredClone(initial.sourceObservations.readForecast.value);
  if (Array.isArray(forecast?.observedProjections))
    forecast.observedProjections = forecast.observedProjections.map((value) => ({
      ...value,
      estimate: proposal.estimate.hours,
      size: proposal.size,
    }));
  input.observations.find((o) => o.resource === 'forecast').digest = forecast
    ? estimateEffectDigest(forecast)
    : null;
  Object.assign(
    input,
    estimateProjectionFromProposals({
      hours: proposal.estimate.hours,
      size: proposal.size,
      proposals: forecast?.proposals,
    })
  );
  return input;
}
const BEFORE_RE = /<!-- aitm-estimate-before schema="1" payload="([A-Za-z0-9_-]+)" -->/g;
function beforeFailure(code) {
  throw new Error(`estimate-publication:${code}`);
}
export function readEstimateBeforeRecord(body) {
  const broad = [...String(body).matchAll(/<!--\s*aitm-estimate-before\b[^>]*-->/g)],
    matches = [...String(body).matchAll(BEFORE_RE)];
  if (broad.length !== matches.length || matches.length > 1) beforeFailure('before-record');
  if (!matches.length) return null;
  const raw = Buffer.from(matches[0][1], 'base64url').toString('utf8');
  if (Buffer.byteLength(raw, 'utf8') > 8192) beforeFailure('before-record-limit');
  const record = JSON.parse(raw);
  if (
    raw !== canonicalDecompositionJson(record) ||
    Buffer.from(raw).toString('base64url') !== matches[0][1]
  )
    beforeFailure('before-record-encoding');
  exactDecompositionKeys(
    record,
    [
      'schema',
      'subject',
      'operationId',
      'writerId',
      'beforeInputDigest',
      'intendedInputDigest',
      'effects',
      ...(Object.hasOwn(record, 'fieldBaseline') ? ['fieldBaseline'] : []),
      ...(Object.hasOwn(record, 'forecastBaseline') ? ['forecastBaseline'] : []),
    ],
    'before-record'
  );
  if (
    record.schema !== 'aitm.estimate-before/v1' ||
    !DECOMPOSITION_WRITER_IDS.includes(record.writerId) ||
    !Array.isArray(record.effects) ||
    record.effects.length > 30
  )
    beforeFailure('before-record');
  if (Object.hasOwn(record, 'fieldBaseline') && record.fieldBaseline !== null) {
    exactDecompositionKeys(record.fieldBaseline, ['estimate', 'size'], 'before-field-baseline');
    if (
      (record.fieldBaseline.estimate !== null &&
        (typeof record.fieldBaseline.estimate !== 'number' ||
          !Number.isFinite(record.fieldBaseline.estimate) ||
          record.fieldBaseline.estimate < 0)) ||
      (record.fieldBaseline.size !== null &&
        !['XS', 'S', 'M', 'L', 'XL'].includes(record.fieldBaseline.size))
    )
      beforeFailure('before-field-baseline');
  }
  if (record.forecastBaseline != null) {
    exactDecompositionKeys(
      record.forecastBaseline,
      ['recordId', 'payloadHash'],
      'before-forecast-baseline'
    );
    if (
      !/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(record.forecastBaseline.recordId) ||
      !/^sha256:[a-f0-9]{64}$/.test(record.forecastBaseline.payloadHash)
    )
      beforeFailure('before-forecast-baseline');
  }
  for (const value of [record.beforeInputDigest, record.intendedInputDigest])
    if (!/^[a-f0-9]{64}$/.test(value)) beforeFailure('before-record-digest');
  for (const effect of record.effects) {
    exactDecompositionKeys(
      effect,
      ['id', 'resource', 'targetIdentity', 'beforeDigest', 'intendedDigest', 'permittedDigests'],
      'before-effect'
    );
    if (
      !DECOMPOSITION_EFFECT_RESOURCES.includes(effect.resource) ||
      !Array.isArray(effect.permittedDigests) ||
      effect.permittedDigests.length > 16 ||
      [effect.beforeDigest, effect.intendedDigest, ...effect.permittedDigests].some(
        (d) => !/^[a-f0-9]{64}$/.test(d)
      )
    )
      beforeFailure('before-effect');
  }
  return record;
}
function replaceBeforeRecord(body, record) {
  const raw = canonicalDecompositionJson(record);
  if (Buffer.byteLength(raw, 'utf8') > 8192) beforeFailure('before-record-limit');
  const existing = readEstimateBeforeRecord(body);
  if (existing && canonicalDecompositionJson(existing) === raw) return body;
  return (
    String(body).replace(BEFORE_RE, '').trimEnd() +
    `\n<!-- aitm-estimate-before schema="1" payload="${Buffer.from(raw).toString('base64url')}" -->\n`
  );
}
async function readAdapter(effect) {
  const result = await effect.read();
  if (result?.status !== 'observed' || result.digest !== estimateEffectDigest(result.value))
    beforeFailure('effect-read-back');
  return result;
}
function permittedEffectDigests(effect, before) {
  const values = [before, effect.value];
  if (
    effect.resource === 'project-estimate' &&
    before &&
    effect.value &&
    typeof before === 'object' &&
    typeof effect.value === 'object' &&
    Object.keys(before).every((k) => ['estimate', 'size', 'priority', 'rank'].includes(k)) &&
    canonicalDecompositionJson(Object.keys(before).sort()) ===
      canonicalDecompositionJson(Object.keys(effect.value).sort())
  ) {
    let combinations = [{}];
    for (const key of Object.keys(before))
      combinations = combinations.flatMap((v) =>
        [...new Set([before[key], effect.value[key]])].map((value) => ({ ...v, [key]: value }))
      );
    values.push(...combinations);
  }
  return [...new Set(values.map(estimateEffectDigest))];
}

export async function executeEstimateWriter({
  cfg,
  issueNumber,
  writerId,
  key,
  proposal,
  effects: makeEffects,
  deriveIntendedInput,
  deriveProposal,
  deps = {},
}) {
  const { subject, projectDir } = await resolveEstimateWriterSubject({ cfg, issueNumber, deps });
  let adapters = [],
    beforeRecord = null,
    supersedes = null,
    previousPublication = null;
  const runtime = createDecompositionRuntime({
    cfg,
    projectDir,
    deps: {
      ...deps.decomposition,
      publicationMetadataBody: (base) =>
        beforeRecord ? replaceBeforeRecord(base, beforeRecord) : base,
      previewPublicationBody: (base) => {
        const preview = deps.previewPublicationBody?.(base) ?? base;
        return beforeRecord ? replaceBeforeRecord(preview, beforeRecord) : preview;
      },
      readPublicationEffect: async ({ effect, operationId: readOperationId }) => {
        if (
          previousPublication &&
          readOperationId === previousPublication.operationId &&
          previousPublication.operationId !== operationId
        )
          return readRegisteredEstimateEffect({
            cfg,
            issueNumber,
            publication: previousPublication,
            effect,
            collect: () => runtime.collect(subject),
            deps,
          });
        const adapter = adapters.find((e) => e.id === effect.id);
        if (!adapter) throw new Error('estimate-publication:unregistered-effect');
        return adapter.read();
      },
    },
  });
  const initial = await runtime.collect(subject),
    operationId = resolveEstimateOperationId(writerId, key, initial.publication);
  const prior = initial.publication?.operationId === operationId ? initial.publication : null;
  previousPublication = initial.publication;
  supersedes = prior?.supersedes ?? null;
  if (
    !prior &&
    initial.publication?.status === 'pending' &&
    deps.supersedePending &&
    ['cancel-plan', 'shelve'].includes(writerId)
  )
    supersedes = await reconcileEstimatePredecessor({
      cfg,
      issueNumber,
      publication: initial.publication,
      collect: () => runtime.collect(subject),
      deps,
    });
  if (deriveProposal) proposal = deriveProposal(initial);
  const migrationRepair = isMigrationProjectionRepair(initial, writerId, {
    ...proposal,
    estimate: {
      ...proposal.estimate,
      hours:
        proposal.estimate.hours === null
          ? null
          : normalizeDecompositionHours(proposal.estimate.hours),
    },
  });
  if (migrationRepair) initial.migrationWriterId = writerId;
  if (!prior && initial.input.availability.status !== 'complete' && !migrationRepair)
    throw new Error(
      `estimate-publication:authority-unavailable:${initial.input.availability.reasons.join(',')}`
    );
  adapters = await makeEffects({
    subject,
    operationId,
    createdAt: prior?.createdAt ?? new Date().toISOString(),
    initial,
  });
  const retiredSource = initial.sourceObservations.readForecast.value;
  const retainsRetirement =
    initial.publication?.effects.some(
      (e) => e.resource === 'forecast' && e.status === 'confirmed'
    ) &&
    initial.publication.effects.some(
      (e) =>
        e.resource === 'ready-marker' &&
        e.status === 'confirmed' &&
        e.intendedDigest === estimateEffectDigest(null)
    );
  if (
    !adapters.some((e) => e.resource === 'forecast') &&
    (retainsRetirement || prior?.effects.some((e) => e.id === 'retired-forecast'))
  ) {
    if (!retiredSource?.recordId || !retiredSource?.payloadHash)
      throw new Error('estimate-publication:retired-forecast-unavailable');
    adapters.unshift(
      {
        id: 'retired-forecast',
        resource: 'forecast',
        targetIdentity: `record:${retiredSource.recordId}`,
        value: { recordId: retiredSource.recordId, payloadHash: retiredSource.payloadHash },
        read: async () => {
          const value = (await runtime.collect(subject)).sourceObservations.readForecast.value;
          return observedEstimateEffect({
            recordId: value.recordId,
            payloadHash: value.payloadHash,
          });
        },
        apply: () => {
          throw new Error('estimate-publication:retired-forecast-drift');
        },
      },
      {
        id: 'retired-ready',
        resource: 'ready-marker',
        targetIdentity: `${cfg.repo}#${issueNumber}:ready-marker`,
        value: null,
        read: async () =>
          observedEstimateEffect(
            (await runtime.collect(subject)).sourceObservations.readIssue.value.body.match(
              /<!--\s*aitm-estimation-forecast-ready\s+record-id="([0-7][0-9A-HJKMNP-TV-Z]{25})"\s*-->/
            )?.[1] ?? null
          ),
        apply: () => {
          throw new Error('estimate-publication:retired-ready-drift');
        },
      }
    );
  }
  const intended =
    prior?.intendedInputDigest ??
    decompositionInputDigest(
      deriveIntendedInput
        ? deriveIntendedInput(initial)
        : intendedPublishedRevisionInput(initial, proposal)
    );
  const saved = readEstimateBeforeRecord(initial.sourceObservations.readIssue.value.body);
  const previousBefore = prior?.effects.find((effect) => effect.id === 'writer-before-values');
  if (saved?.operationId === operationId) {
    if (
      saved.writerId !== writerId ||
      canonicalDecompositionJson(saved.subject) !== canonicalDecompositionJson(subject) ||
      saved.beforeInputDigest !== (prior?.beforeInputDigest ?? initial.inputDigest) ||
      saved.intendedInputDigest !== intended ||
      previousBefore?.intendedDigest !== estimateEffectDigest(saved)
    )
      beforeFailure('before-record-drift');
    beforeRecord = saved;
  } else {
    if (
      prior &&
      (!previousBefore ||
        previousBefore.status === 'confirmed' ||
        initial.inputDigest !== prior.beforeInputDigest ||
        prior.effects.some(
          (e) =>
            !['authority-context', 'writer-before-values'].includes(e.id) && e.status !== 'pending'
        ))
    )
      beforeFailure('before-record-missing');
    beforeRecord = {
      schema: 'aitm.estimate-before/v1',
      subject,
      operationId,
      writerId,
      beforeInputDigest: prior?.beforeInputDigest ?? initial.inputDigest,
      intendedInputDigest: intended,
      forecastBaseline:
        initial.sourceObservations.readForecast.value?.recordId &&
        initial.sourceObservations.readForecast.value?.payloadHash
          ? {
              recordId: initial.sourceObservations.readForecast.value.recordId,
              payloadHash: initial.sourceObservations.readForecast.value.payloadHash,
            }
          : null,
      fieldBaseline:
        initial.input.availability.status === 'complete' &&
        initial.sourceObservations.readProject.value?.estimate ===
          parseIssueFieldDb(initial.sourceObservations.readIssue.value.body).values?.estimate &&
        initial.sourceObservations.readProject.value?.size ===
          parseIssueFieldDb(initial.sourceObservations.readIssue.value.body).values?.size
          ? {
              estimate: initial.sourceObservations.readProject.value.estimate ?? null,
              size: initial.sourceObservations.readProject.value.size ?? null,
            }
          : null,
      effects: await Promise.all(
        adapters.map(async (effect) => {
          const before = await readAdapter(effect);
          return {
            id: effect.id,
            resource: effect.resource,
            targetIdentity: effect.targetIdentity,
            beforeDigest: before.digest,
            intendedDigest: estimateEffectDigest(effect.value),
            permittedDigests: permittedEffectDigests(effect, before.value),
          };
        })
      ),
    };
  }
  const ids = adapters.map((e) => ({
    id: e.id,
    resource: e.resource,
    targetIdentity: e.targetIdentity,
    intendedDigest: estimateEffectDigest(e.value),
  }));
  if (
    canonicalDecompositionJson(ids) !==
    canonicalDecompositionJson(
      beforeRecord.effects.map(({ id, resource, targetIdentity, intendedDigest }) => ({
        id,
        resource,
        targetIdentity,
        intendedDigest,
      }))
    )
  )
    beforeFailure('before-manifest-drift');
  const business = adapters;
  const checkpoint = async (owner) => {
    const state = owner.publication();
    for (const effect of business) {
      const evidence = beforeRecord.effects.find((e) => e.id === effect.id),
        actual = await readAdapter(effect),
        confirmed = state.effects.find((e) => e.id === effect.id)?.status === 'confirmed';
      if (
        confirmed
          ? actual.digest !== evidence.intendedDigest
          : !evidence.permittedDigests.includes(actual.digest)
      )
        beforeFailure(`effect-drift:${effect.id}`);
    }
  };
  adapters = [
    {
      id: 'writer-before-values',
      resource: 'assessment',
      targetIdentity:
        previousBefore?.targetIdentity ??
        `${subject.repository}#${subject.issue}:estimate-before:${estimateOperationId(writerId, key)}`,
      value: beforeRecord,
      read: async () =>
        observedEstimateEffect(
          readEstimateBeforeRecord(
            (await runtime.collect(subject)).sourceObservations.readIssue.value.body
          )
        ),
      apply: () =>
        mutateIssueBody({
          issueNumber,
          repo: cfg.repo,
          mutate: (base) => replaceBeforeRecord(base, beforeRecord),
          deps: deps.decomposition,
        }),
    },
    ...business,
  ];
  return publishEstimateRevision({
    subject,
    operationId,
    expectedInputDigest: prior?.beforeInputDigest ?? initial.inputDigest,
    proposal: {
      ...proposal,
      estimate: {
        ...proposal.estimate,
        hours:
          proposal.estimate.hours === null
            ? null
            : normalizeDecompositionHours(proposal.estimate.hours),
      },
    },
    effects: adapters,
    deps: {
      runtime,
      writerId,
      supersedes,
      intendedInputDigest: intended,
      beforeEffects: async (owner) => {
        await checkpoint(owner);
        if (deps.beforePublicationEffects) await deps.beforePublicationEffects(owner);
      },
      beforeEffect: checkpoint,
      afterEffects: deps.afterPublicationEffects,
      onFailure: deps.onPublicationFailure,
      withEffects: deps.withPublicationEffects,
    },
  });
}

export async function resolveEstimateWriterSubject({ cfg, issueNumber, deps = {} }) {
  if (!cfg?.repo || !cfg.projectId)
    throw new Error('estimate-publication:configured-membership-required');
  const item = await (deps.projectItemForIssue ?? projectItemForIssue)({
    repo: cfg.repo,
    projectId: cfg.projectId,
    issueNumber,
  });
  if (!item?.itemId) throw new Error('estimate-publication:configured-membership-required');
  const subject = {
    repository: cfg.repo.toLowerCase(),
    issue: issueNumber,
    projectId: cfg.projectId,
    projectItemId: item.itemId,
  };
  const projectDir = deps.projectDir ?? getProjectDir();
  return { subject, projectDir };
}

export async function readEstimateWriterAuthority({ cfg, issueNumber, deps = {} }) {
  const { subject, projectDir } = await resolveEstimateWriterSubject({ cfg, issueNumber, deps });
  return createDecompositionRuntime({ cfg, projectDir, deps: deps.decomposition ?? {} }).collect(
    subject
  );
}
