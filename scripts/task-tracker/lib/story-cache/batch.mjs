// @story #2039 #2047
// Pure intent freezing only. The coordinator must persist before any provider effect.
import { createHash } from 'node:crypto';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { validateManifest } from './manifest.mjs';
import { freezeTimingCandidate } from './timing-candidate.mjs';
import { freezeBodyTemplate } from './body-template.mjs';
import { validateStagedComposite } from './stage-capabilities.mjs';
import { validateExecutableTransition } from '../lifecycle-policy/executable-transitions.mjs';
import { assertTimingActorKey } from '../timing-actor.mjs';
import { ownedCommentMarker } from '../owned-comment.mjs';
import { parseAitmRecord } from '../github-records/record-envelope.mjs';
const json = canonicalRecordJson;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const clone = (value) => JSON.parse(json(value));
const same = (a, b) => json(a) === json(b);
const token = (value) =>
  typeof value === 'string' && value.length > 0 && !/[\s\p{Cc}]/u.test(value);
const EFFECT_KEYS = [
  'key',
  'kind',
  'target',
  'beforeDigest',
  'intendedDigest',
  'candidate',
  'dependencies',
  'attempted',
  'outcome',
];
function fail(reason, cause) {
  throw Object.assign(new Error(`Story batch invalid: ${reason}`, { cause }), {
    code: 'STORY_BATCH_INVALID',
    reason,
  });
}
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('shape');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    !same(Reflect.ownKeys(descriptors).sort(), [...keys].sort()) ||
    Object.values(descriptors).some(
      (entry) => !Object.hasOwn(entry, 'value') || entry.enumerable !== true
    )
  )
    fail('shape');
}
function frozen(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}
function payload(record, reference) {
  if (!reference) fail('payload');
  const bytes = record.payloads.get(reference.payloadPath);
  if (!(typeof bytes === 'string' || Buffer.isBuffer(bytes))) fail('payload');
  const value = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
    Buffer.from(bytes)
  );
  if (hash(value) !== reference.digest) fail('payload-digest');
  return value;
}
function stagedIssue(record, key) {
  const generation = record.generation;
  const entry = generation.working[key];
  if (!entry)
    return {
      body: payload(record, generation.baseSnapshot.resources[key]),
      title: generation.baseSnapshot.title,
    };
  if (entry.capabilityRef !== null) fail('retained-capability');
  const raw = payload(record, entry);
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    /* Accepted legacy working Markdown. */
  }
  if (
    value &&
    typeof value.schema === 'string' &&
    value.schema.startsWith('aitm.story-issue-update/')
  ) {
    exact(value, ['schema', 'body', 'title']);
    if (value.schema !== 'aitm.story-issue-update/v1' || json(value) !== raw) fail('issue-payload');
    return { body: value.body, title: value.title };
  }
  return { body: raw, title: generation.baseSnapshot.title };
}
function owner(body, nodeId, identity) {
  try {
    const { envelope } = parseAitmRecord({
      commentNodeId: nodeId,
      body,
      expectedRepository: identity.repository,
      expectedIssue: identity.issueNumber,
    });
    if (body.includes('aitm-owned-comment')) fail('ambiguous-owner');
    return { key: `record:${envelope.recordId}`, binding: json(envelope) };
  } catch (error) {
    if (error.code === 'STORY_BATCH_INVALID') throw error;
    if (error.message !== 'record-envelope:missing') fail('record-envelope', error);
  }
  const matches = [...body.matchAll(/<!-- aitm-owned-comment key="([^"]+)" -->/g)];
  if (!matches.length) return null;
  if (matches.length !== 1) fail('comment-owner');
  const match = matches[0];
  const marker = ownedCommentMarker(match[1]);
  const prefix = body.slice(0, match.index);
  if (
    !prefix.trim() ||
    /<!--\s*aitm-owned-comment\b/i.test(prefix) ||
    prefix.replace(/\n+$/, '') + '\n\n' + marker !== body
  )
    fail('comment-owner');
  return { key: `marker:${match[1]}`, binding: marker };
}
// Same exact typed row contract as the native snapshot/manifest; no value coercion.
function fieldCandidate(row) {
  exact(row, ['itemId', 'fieldId', 'type', 'value']);
  if (
    !token(row.itemId) ||
    !token(row.fieldId) ||
    !['NUMBER', 'TEXT', 'DATE', 'SINGLE_SELECT', 'ITERATION'].includes(row.type)
  )
    fail('field-value');
  const value = row.value;
  if (value === null || same(value, { state: 'absent' })) return;
  if (row.type === 'NUMBER') {
    if (typeof value !== 'number' || !Number.isFinite(value)) fail('field-value');
    return;
  }
  if (row.type === 'SINGLE_SELECT') {
    exact(value, ['optionId', 'name']);
    if (!token(value.optionId) || typeof value.name !== 'string') fail('field-value');
    return;
  }
  if (typeof value !== 'string' || !value.isWellFormed()) fail('field-value');
  if (row.type === 'ITERATION' && !token(value)) fail('field-value');
  if (
    row.type === 'DATE' &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value)
  )
    fail('field-value');
}

function graph(effects) {
  const byKey = new Map(effects.map((effect) => [effect.key, effect]));
  const active = new Set();
  const done = new Set();
  const ordered = [];
  const visit = (key) => {
    if (active.has(key)) fail('dependency-cycle');
    if (done.has(key)) return;
    const effect = byKey.get(key);
    if (!effect) fail('undeclared-dependency');
    active.add(key);
    for (const dependency of [...effect.dependencies].sort()) visit(dependency);
    active.delete(key);
    done.add(key);
    ordered.push(effect);
  };
  for (const key of [...byKey.keys()].sort()) visit(key);
  return ordered;
}
/** Consumes a verified {manifest,generation,payloads} store record, not unverified body references. */
export function freezeStoryBatch(input) {
  try {
    exact(input, ['generation', 'transition', 'effects', 'capabilities']);
    const source = input.generation;
    exact(source, ['manifest', 'generation', 'payloads']);
    if (!(source.payloads instanceof Map)) fail('generation');
    const suppliedGeneration = clone(source.generation);
    const payloads = new Map(
      [...Map.prototype.entries.call(source.payloads)].map(([key, value]) => [
        key,
        Buffer.isBuffer(value) ? Buffer.from(value) : value,
      ])
    );
    const verified = validateManifest(clone(source.manifest), {
      identity: suppliedGeneration.identity,
      payloads,
    });
    if (!same(suppliedGeneration, verified.generation)) fail('generation-drift');
    const generation = verified.generation;
    if (
      generation.conflicts.length ||
      (generation.batch !== null && generation.batch.status !== 'complete')
    )
      fail('pending-batch');
    const transition = clone(input.transition);
    exact(transition, ['id', 'from', 'to', 'actorId', 'visit']);
    const allowed = validateExecutableTransition(transition.from, transition.to);
    if (
      !token(transition.id) ||
      !Number.isSafeInteger(transition.visit) ||
      transition.visit < 1 ||
      !allowed.ok ||
      allowed.noop
    )
      fail('transition');
    assertTimingActorKey(transition.actorId);
    const effects = clone(input.effects);
    if (
      !Array.isArray(effects) ||
      !effects.length ||
      new Set(effects.map((e) => e.key)).size !== effects.length
    )
      fail('effects');
    for (const effect of effects) {
      exact(effect, EFFECT_KEYS);
      if (
        !token(effect.key) ||
        effect.attempted !== false ||
        effect.outcome !== null ||
        !Array.isArray(effect.dependencies) ||
        effect.dependencies.some((key) => !token(key)) ||
        new Set(effect.dependencies).size !== effect.dependencies.length ||
        !same(effect.target?.identity, generation.identity)
      )
        fail('effect');
    }
    for (const key of generation.dirtyKeys)
      if (!effects.some((effect) => effect.key === key)) fail('dirty-coverage');
    const issues = effects.filter((effect) => effect.kind === 'issue-update');
    if (issues.length !== 1) fail('final-issue');
    const issue = issues[0];
    const issueKey = `issue:${generation.identity.issueNodeId}`;
    exact(issue.target, ['identity', 'issueNodeId']);
    if (
      issue.key !== issueKey ||
      issue.target.issueNodeId !== generation.identity.issueNodeId ||
      issue.beforeDigest !== generation.baseSnapshot.resources[issueKey].digest
    )
      fail('issue-identity');
    const record = { manifest: verified.manifest, generation, payloads };
    const intent = stagedIssue(record, issueKey);
    const candidate = issue.candidate;
    const templated = candidate?.schema === 'aitm.story-final-body-template/v1';
    exact(
      candidate,
      templated ? ['schema', 'body', 'title', 'slots'] : ['schema', 'body', 'title']
    );
    if (
      (!templated && candidate.schema !== 'aitm.story-issue-update/v1') ||
      !same({ body: candidate.body, title: candidate.title }, intent) ||
      issue.intendedDigest !== (templated ? null : hash(candidate.body))
    )
      fail('issue-intent');
    if (!Array.isArray(input.capabilities)) fail('capabilities');
    validateStagedComposite({
      base: payload(record, generation.baseSnapshot.resources[issueKey]),
      candidate: candidate.body,
      operations: input.capabilities,
    });
    const timings = effects.filter(
      (effect) => effect.candidate?.schema === 'aitm.story-timing-candidate/v1'
    );
    if (
      timings.length !== 1 ||
      !same(timings[0], freezeTimingCandidate({ generation: record, transition }))
    )
      fail('timing-effect');
    for (const effect of effects) {
      if (effect === issue || effect === timings[0]) continue;
      if (
        !generation.dirtyKeys.includes(effect.key) ||
        !generation.working[effect.key] ||
        generation.working[effect.key].capabilityRef !== null
      )
        fail('undeclared-intent');
      if (effect.kind === 'project-field-update') {
        exact(effect.target, ['identity', 'projectId', 'itemId', 'fieldId', 'type']);
        const target = effect.target;
        const before = generation.baseSnapshot.fields.find((row) => row.fieldId === target.fieldId);
        fieldCandidate(effect.candidate);
        if (
          !before ||
          target.projectId !== generation.identity.projectId ||
          target.itemId !== generation.identity.projectItemId ||
          effect.key !== `project-field:${target.itemId}:${target.fieldId}` ||
          !same(
            { itemId: target.itemId, fieldId: target.fieldId, type: target.type },
            { itemId: before.itemId, fieldId: before.fieldId, type: before.type }
          ) ||
          !same({ ...before, value: effect.candidate.value }, effect.candidate) ||
          effect.beforeDigest !== hash(json(before)) ||
          json(effect.candidate) !== payload(record, generation.working[effect.key]) ||
          effect.intendedDigest !== hash(json(effect.candidate))
        )
          fail('field-intent');
        continue;
      }
      if (
        !['comment-create', 'comment-update'].includes(effect.kind) ||
        !effect.key.startsWith('comment:')
      )
        fail('unsupported-effect');
      exact(effect.target, ['identity', 'commentNodeId', 'creationIntent']);
      const creation = effect.kind === 'comment-create';
      const baseline = generation.baseSnapshot.resources[effect.key];
      if (
        creation
          ? !effect.key.startsWith('comment:new:') ||
            baseline ||
            effect.beforeDigest !== null ||
            effect.target.commentNodeId !== null ||
            effect.target.creationIntent !== effect.key.slice(12)
          : effect.key.startsWith('comment:new:') ||
            !baseline ||
            effect.beforeDigest !== baseline.digest ||
            effect.target.commentNodeId !== effect.key.slice(8) ||
            effect.target.creationIntent !== null
      )
        fail('comment-identity');
      if (
        typeof effect.candidate !== 'string' ||
        payload(record, generation.working[effect.key]) !== effect.candidate ||
        hash(effect.candidate) !== effect.intendedDigest
      )
        fail('comment-intent');
      const ownership = owner(effect.candidate, effect.key.slice(8), generation.identity);
      if (!ownership) fail('foreign-comment');
      const before = baseline ? payload(record, baseline) : '';
      if (baseline && !same(owner(before, effect.key.slice(8), generation.identity), ownership))
        fail('owner-change');
      for (const [key, reference] of [
        ...Object.entries(generation.baseSnapshot.resources),
        ...Object.entries(generation.working),
      ]) {
        if (key === effect.key || !key.startsWith('comment:')) continue;
        const other = owner(payload(record, reference), key.slice(8), generation.identity);
        if (other?.key === ownership.key) fail('duplicate-ownership');
      }
      validateStagedComposite({
        base: before,
        candidate: effect.candidate,
        operations: [{ base: before, candidate: effect.candidate }],
      });
    }
    if (
      !same(
        [...issue.dependencies].sort(),
        effects
          .filter((effect) => effect !== issue)
          .map((effect) => effect.key)
          .sort()
      )
    )
      fail('final-dependencies');
    const ordered = graph(effects);
    const template = freezeBodyTemplate({
      body: candidate.body,
      title: candidate.title,
      slots: templated ? candidate.slots : [],
      effects,
    });
    issue.candidate = template;
    issue.intendedDigest = null;
    const approvedInputDigests = [
      ...new Set([
        verified.manifest.payloadDigest,
        ...generation.dirtyKeys.map((key) => generation.working[key].digest),
        hash(json(template)),
        hash(
          json(
            input.capabilities.map((operation) => ({
              base: operation.base,
              candidate: operation.candidate,
            }))
          )
        ),
      ]),
    ].sort();
    const publicationGeneration = generation.publicationGeneration + 1;
    if (!Number.isSafeInteger(publicationGeneration)) fail('publication-counter');
    const batch = {
      schema: 'aitm.story-publication-batch/v1',
      publicationGeneration,
      transition,
      baseline: clone(generation.baseSnapshot),
      approvedInputDigests,
      effects: ordered,
      bodyTemplate: template,
      status: 'frozen',
    };
    const batchId = `batch:${hash(json(batch))}`;
    return frozen({ schema: batch.schema, batchId, ...batch });
  } catch (error) {
    if (error.code === 'STORY_BATCH_INVALID') throw error;
    fail('native-input', error);
  }
}
