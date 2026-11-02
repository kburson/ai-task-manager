// @story #2070
// Consume a real completed native coordinator run; do not synthesize passed proof.
import assert from 'node:assert/strict';
import { nativePlanFixture } from './native-plan-transition-fixture.mjs';
import { context, changeGeneration, hash } from './story-timing-candidate-fixture.mjs';
import { setIssue } from './story-batch-fixture.mjs';
import { canonicalRecordJson as json } from '../../task-tracker/lib/github-records/canonical-json.mjs';
import { stateConfigKey } from '../../task-tracker/lib/lifecycle-policy/index.mjs';
import { resolvePhaseEvent } from '../../task-tracker/phase-events.mjs';
import { observeContent } from '../../task-tracker/lib/story-cache/native-observation.mjs';
import { renderTransitionCommitComment } from '../../task-tracker/lib/move-state/transition-commit.mjs';
import { ingestTimingEvents } from '../../task-tracker/lib/story-cache/timing-stage.mjs';
import { freezeTimingCandidate } from '../../task-tracker/lib/story-cache/timing-candidate.mjs';
import {
  prepareNextTransition,
  runTransitionBatch,
} from '../../task-tracker/lib/story-cache/transition-batch.mjs';
export { test as nativeTest } from './story-timing-candidate-fixture.mjs';

export async function legacyTimingAuthority(
  t,
  {
    foreign = false,
    missingVisit = false,
    malformed = false,
    invalidTimestamp = false,
    fencedComment = false,
    fencedVisit = false,
    close = false,
    inlineComment = false,
    inlineVisit = false,
    quotedDuplicate = false,
    exampleProse = false,
  } = {}
) {
  const native = await nativePlanFixture(t);
  assert.equal((await native.run()).status, 'complete');
  await context(native.root, () =>
    prepareNextTransition({ store: native.store, claim: native.claim })
  );
  const before = await native.store.readGeneration();
  const { identity } = before.generation;
  const visitMarker = `<!-- aitm-entered-${close ? 'done' : 'develop-2'} ts="${invalidTimestamp ? 'invalid' : '2026-10-19T12:00:00Z'}" move="move:legacy" -->`;
  const record = {
    schema: 'aitm.transition-commit/v1',
    transitionId: 'move:legacy',
    repository: foreign ? 'foreign/repo' : identity.repository,
    issue: identity.issueNumber,
    source: close ? 'review' : 'test',
    target: close ? 'done' : 'develop',
    visitMarker,
    actor: 'historical-login',
    sentinelFingerprint: 'sha256:' + hash('historical sentinel'),
  };
  let body = malformed
    ? '<!-- aitm-transition-commit broken -->'
    : renderTransitionCommitComment(record);
  if (fencedComment) body = '```md\n' + body + '\n```';
  const marker = renderTransitionCommitComment(record).split('\n').at(-1);
  if (inlineComment) body = 'For example, `' + marker + '`';
  if (quotedDuplicate) body += '\nFor example, `' + marker + '`';
  if (exampleProse) body = 'Documentation example:\n' + body;
  await changeGeneration(native, (g, payloads) => {
    const issueRef = g.baseSnapshot.resources['issue:' + identity.issueNodeId];
    const original = Buffer.from(payloads.get(issueRef.payloadPath)).toString('utf8');
    const issueBody =
      original +
      (close ? '\n<!-- aitm-entered-review ts="2026-10-19T11:59:00Z" move="move:review" -->' : '') +
      (missingVisit
        ? ''
        : '\n' +
          (fencedVisit
            ? '```md\n' + visitMarker + '\n```'
            : inlineVisit
              ? 'Documentation only: `' + visitMarker + '`'
              : visitMarker)) +
      (quotedDuplicate ? '\nDocumentation only: `' + visitMarker + '`' : '');
    setIssue(g, payloads, issueBody, issueBody);
    const { body: ignored, ...observed } = observeContent({
      identity,
      node: {
        id: 'IC_legacy',
        lastEditedAt: null,
        includesCreatedEdit: false,
        userContentEdits: { totalCount: 0, nodes: [] },
      },
      body,
    });
    void ignored;
    payloads.set('base/legacy.md', body);
    g.baseSnapshot.resources['comment:IC_legacy'] = { ...observed, payloadPath: 'base/legacy.md' };
    g.baseSnapshot.inventory.push('IC_legacy');
    g.baseSnapshot.inventory.sort();
  });
  return {
    generation: await native.store.readGeneration(),
    commentKey: 'comment:IC_legacy',
  };
}

export async function completedTimingAuthority(t, options = {}) {
  const native = await nativePlanFixture(t, options);
  assert.equal((await native.run()).status, 'complete');
  const generation = await native.store.readGeneration();
  return completedResult(native, generation);
}

export async function unpublishCompletion(f, mode = 'missing') {
  const n = f.native;
  await context(n.root, () => prepareNextTransition({ store: n.store, claim: n.claim }));
  await changeGeneration(n, (g, payloads) => {
    const ref = g.baseSnapshot.resources['issue:' + g.identity.issueNodeId];
    const body = Buffer.from(payloads.get(ref.payloadPath)).toString('utf8');
    const marker = body.match(/^<!-- aitm-transition-completion .+ -->/m)[0];
    const base =
      mode === 'fenced-only'
        ? body.replace(marker, '```md\n' + marker + '\n```')
        : mode === 'inline-duplicate'
          ? body + '\nDocumentation only: `' + marker + '`'
          : mode === 'fenced-duplicate'
            ? body + '\n```md\n' + marker + '\n```'
            : body.replace(/^<!-- aitm-transition-completion .+ -->\n?/gm, '');
    setIssue(g, payloads, base, body);
  });
  return { ...f.bundle, generation: await n.store.readGeneration() };
}

function completedResult(native, generation) {
  const { identity, baseSnapshot, batch } = generation.generation;
  const ref = baseSnapshot.resources['issue:' + identity.issueNodeId];
  const body = Buffer.from(generation.payloads.get(ref.payloadPath)).toString('utf8');
  const receipt = [...body.matchAll(/^<!-- aitm-transition-completion (.+) -->$/gm)]
    .map((match) => JSON.parse(match[1]))
    .find((receipt) => receipt.transition.id === batch.transition.id);
  assert.ok(receipt, 'actual coordinator did not publish its completion receipt');
  const timing = batch.effects.find(
    (effect) => effect.candidate?.schema === 'aitm.story-timing-candidate/v1'
  );
  assert.ok(timing);
  const confirmedEffects = batch.effects.filter(
    (effect) => effect === timing || receipt.effects.some((ref) => ref.key === effect.key)
  );
  return {
    native,
    generation,
    receipt,
    events: timing.candidate.timing.sourceEvents,
    bundle: { receipt, confirmedEffects, generation },
  };
}

export async function appendProvisionalTransition(f) {
  const n = f.native;
  await context(n.root, () => prepareNextTransition({ store: n.store, claim: n.claim }));
  const transition = { ...f.receipt.transition, id: 'move:second', from: 'develop', to: 'test' };
  const timestamp = new Date(
    Math.max(...f.events.map((e) => Date.parse(e.timestamp))) + 60000
  ).toISOString();
  const events = [
    {
      eventId: 'next-exit',
      actorId: transition.actorId,
      transitionId: transition.id,
      timestamp,
      event: 'develop:completed',
      activeSeconds: 1.25,
      idleSeconds: 0,
      sourceCursor: 'native-next-exit',
    },
    {
      eventId: 'next-entry',
      actorId: transition.actorId,
      transitionId: transition.id,
      timestamp,
      event: 'test:started',
      activeSeconds: 0,
      idleSeconds: 0,
      sourceCursor: 'native-next-entry',
    },
  ];
  await context(n.root, () => ingestTimingEvents({ store: n.store, claim: n.claim, events }));
  const effect = freezeTimingCandidate({ generation: await n.store.readGeneration(), transition });
  await n.persist(effect, { transition });
  await n.confirm(effect);
  const generation = await n.store.readGeneration();
  return {
    ...f,
    generation,
    events: effect.candidate.timing.sourceEvents,
    bundle: { ...f.bundle, generation },
  };
}

export async function appendUnpublishedWork(f) {
  const n = f.native;
  await context(n.root, () => prepareNextTransition({ store: n.store, claim: n.claim }));
  const event = {
    eventId: 'pending-work',
    actorId: f.receipt.transition.actorId,
    transitionId: null,
    timestamp: new Date(
      Math.max(...f.events.map((row) => Date.parse(row.timestamp))) + 60000
    ).toISOString(),
    event: 'paused',
    activeSeconds: 2,
    idleSeconds: 0,
    sourceCursor: 'pending-work',
  };
  await context(n.root, () =>
    ingestTimingEvents({ store: n.store, claim: n.claim, events: [event] })
  );
  const generation = await n.store.readGeneration();
  return {
    ...f,
    generation,
    events: generation.generation.timing.events,
    bundle: { ...f.bundle, generation },
  };
}

// Follow-on non-Plan moves use real coordinator publication and receipt validation.
// Host admission is an offline port, not a claim of live gate coverage.
export async function completeNextTimingAuthority(f, { to, visit = 1 } = {}) {
  const n = f.native;
  await context(n.root, () => prepareNextTransition({ store: n.store, claim: n.claim }));
  const from = f.receipt.transition.to;
  const transition = {
    ...f.receipt.transition,
    id: `move:${from}-${to}-${visit}`,
    from,
    to,
    visit,
  };
  const timestamp = new Date(
    Math.max(...f.events.map((e) => Date.parse(e.timestamp))) + 60000
  ).toISOString();
  const events = ['complete', 'enter'].map((phase, index) => ({
    eventId: `${transition.id}-${phase}`,
    actorId: transition.actorId,
    transitionId: transition.id,
    timestamp,
    event: resolvePhaseEvent({ state: index ? to : from, phase }).event,
    activeSeconds: index ? 0 : 1.25,
    idleSeconds: 0,
    sourceCursor: `${transition.id}-${phase}`,
  }));
  await context(n.root, () => ingestTimingEvents({ store: n.store, claim: n.claim, events }));
  let record = await n.store.readGeneration();
  const identity = record.generation.identity;
  const issueKey = 'issue:' + identity.issueNodeId;
  const ref = record.generation.baseSnapshot.resources[issueKey];
  const base = Buffer.from(record.payloads.get(ref.payloadPath)).toString();
  const candidate = base + '\nRetained subsequent visit.\n';
  await changeGeneration(n, (g, payloads) => {
    setIssue(g, payloads, base, candidate);
    g.dirtyKeys = [issueKey];
  });
  record = await n.store.readGeneration();
  const timing = freezeTimingCandidate({ generation: record, transition });
  const before = record.generation.baseSnapshot.fields.find(
    (field) => field.fieldId === n.ctx.cfg.kanbanFieldId
  );
  const optionId = n.ctx.cfg[stateConfigKey(to)] ?? `OPT_${to}`;
  const field = { ...before, value: { optionId, name: to[0].toUpperCase() + to.slice(1) } };
  const status = {
    key: `project-field:${identity.projectItemId}:${field.fieldId}`,
    kind: 'project-field-update',
    target: {
      identity,
      projectId: identity.projectId,
      itemId: identity.projectItemId,
      fieldId: field.fieldId,
      type: field.type,
    },
    beforeDigest: hash(json(before)),
    intendedDigest: hash(json(field)),
    candidate: field,
    dependencies: [timing.key],
    attempted: false,
    outcome: null,
  };
  await changeGeneration(n, (g, payloads) => {
    const raw = json(field);
    const payloadPath = `working/${to}-${visit}-status.json`;
    payloads.set(payloadPath, raw);
    g.working[status.key] = {
      payloadPath,
      digest: hash(raw),
      kind: 'project-field',
      capabilityRef: null,
    };
    g.dirtyKeys.push(status.key);
    g.dirtyKeys.sort();
  });
  const issue = {
    key: issueKey,
    kind: 'issue-update',
    target: { identity, issueNodeId: identity.issueNodeId },
    beforeDigest: hash(base),
    intendedDigest: hash(candidate),
    candidate: {
      schema: 'aitm.story-issue-update/v1',
      body: candidate,
      title: record.generation.baseSnapshot.title,
    },
    dependencies: [timing.key, status.key].sort(),
    attempted: false,
    outcome: null,
  };
  const ctx = {
    ...n.ctx,
    transition,
    transitionId: transition.id,
    resolvedFromState: from,
    stateArg: to,
    effects: [issue, timing, status],
    statusKey: status.key,
    cfg: {
      ...n.ctx.cfg,
      [stateConfigKey(from)]: before.value.optionId,
      [stateConfigKey(to)]: optionId,
    },
  };
  const ports = {
    capabilities: [{ base, candidate }],
    readSnapshot: n.ports.readSnapshot,
    apply: n.ports.apply,
    observe: n.ports.observe,
    validatePreStatus: async () => ({ verified: true }),
    validateIssue: async () => ({ verified: true }),
    validateFinal: async () => ({ verified: true }),
  };
  assert.equal(
    (
      await context(n.root, () =>
        runTransitionBatch({ ctx, store: n.store, claim: n.claim, ports })
      )
    ).status,
    'complete'
  );
  return completedResult(n, await n.store.readGeneration());
}
