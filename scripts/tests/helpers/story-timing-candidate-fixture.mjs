// @story #2039 #2061
// Test-only durable cache fixture. The unit model replaces root discovery, never persistence.
import assert from 'node:assert/strict';
import { test as baseTest } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createUnitRootFixture } from './unit-runtime-root.mjs';
import { handoffGeneration, identity, hash } from './story-handoff-fixture.mjs';
import { withRuntimeRootAdapters } from '../../task-tracker/lib/runtime-storage.mjs';
import { timingActorKey } from '../../task-tracker/lib/timing-actor.mjs';
import { parseTimingRow } from '../../task-tracker/lib/timing-row-reader.mjs';
import { observeContent } from '../../task-tracker/lib/story-cache/native-observation.mjs';
import { openStoryStore, storyCachePath } from '../../task-tracker/lib/story-cache/store.mjs';
import {
  acquireStoryWriter,
  openStoryWriterRegistry,
} from '../../task-tracker/lib/story-cache/writer-claim.mjs';
import { ingestTimingEvents } from '../../task-tracker/lib/story-cache/timing-stage.mjs';
export { identity, hash };
export const adapter =
  await import('../../task-tracker/lib/story-cache/timing-candidate.mjs').catch((error) => {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    return {};
  });
export const actorId = timingActorKey({ provider: 'codex', sid: 'author-A' });
export const transition = { id: 'move:one', from: 'develop', to: 'test', actorId, visit: 1 };
export const historical =
  '⏱ Timing Log\n\n| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Full Word Marker |\n|---|---|---|---|---|---|---|---|\n| 2026-10-01 01:00:00 +00:00 | start |  |  |  | 10 | historical actor | 20 | <!-- row-sec: a=0 i=0 -->\n';
export const event = (id, extra = {}) => ({
  eventId: id,
  actorId,
  transitionId: null,
  timestamp: '2026-10-19T12:00:00.000Z',
  event: 'paused',
  activeSeconds: null,
  idleSeconds: null,
  sourceCursor: `native-${id}`,
  ...extra,
});
export const pair = (move = transition, at = '2026-10-19T12:01:00.000Z') => [
  event('z-exit', {
    actorId: move.actorId,
    transitionId: move.id,
    timestamp: at,
    event: 'develop:completed',
    activeSeconds: 0.25,
    idleSeconds: null,
  }),
  event('a-entry', {
    actorId: move.actorId,
    transitionId: move.id,
    timestamp: at,
    event: 'test:started',
    activeSeconds: 0,
    idleSeconds: 0,
  }),
];
export function test(name, operation) {
  return baseTest(name, async (t) => {
    const root = fs.realpathSync(createUnitRootFixture('timing-candidate-2061-'));
    const commonDir = path.join(root, 'fixture-common');
    fs.mkdirSync(commonDir);
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    t.unitRoot = root;
    return withRuntimeRootAdapters(
      {
        realpath: (p) => fs.realpathSync(p),
        assertOutsideArtifacts: () => {},
        readIdentity: () => ({
          projectRoot: root,
          mainRoot: root,
          worktreeIdentity: { commonDir, registeredRoots: [root], unavailableRoots: [] },
        }),
      },
      () => operation(t)
    );
  });
}
export async function context(root, operation, sid = 'author-A') {
  const beforeSid = process.env.AI_TASK_MANAGER_SESSION_ID;
  const cwd = process.cwd();
  process.env.AI_TASK_MANAGER_SESSION_ID = sid;
  process.chdir(root);
  try {
    return await operation();
  } finally {
    process.chdir(cwd);
    if (beforeSid === undefined) delete process.env.AI_TASK_MANAGER_SESSION_ID;
    else process.env.AI_TASK_MANAGER_SESSION_ID = beforeSid;
  }
}
export async function fixture(t, { absent = false, events = pair() } = {}) {
  assert.equal(
    typeof adapter.freezeTimingCandidate,
    'function',
    'frozen timing candidate is missing'
  );
  assert.equal(
    typeof adapter.confirmTimingPublication,
    'function',
    'verified cursor confirmation is missing'
  );
  const root = t.unitRoot;
  const registry = openStoryWriterRegistry({ projectRoot: root });
  const claim = await acquireStoryWriter({
    identity,
    human: 'tester',
    sessionId: 'author-A',
    worktree: root,
    cachePath: storyCachePath({ projectRoot: root, identity }),
    assignment: ['tester'],
    registry,
  });
  const store = await openStoryStore({ projectRoot: root, identity });
  const initial = await handoffGeneration(claim.claimId);
  initial.generation.timing = {
    events: [],
    ingestedCursor: null,
    publishedCursor: null,
    canonicalCommentKey: absent ? null : 'comment:C_timing',
  };
  if (!absent) {
    const { body: ignored, ...observed } = observeContent({
      identity,
      node: {
        id: 'C_timing',
        lastEditedAt: null,
        includesCreatedEdit: false,
        userContentEdits: { totalCount: 0, nodes: [] },
      },
      body: historical,
    });
    void ignored;
    initial.generation.baseSnapshot.resources['comment:C_timing'] = {
      ...observed,
      ownership: 'owned',
      payloadPath: 'base/timing.md',
    };
    initial.generation.baseSnapshot.inventory = ['C_timing'];
    initial.payloads.set('base/timing.md', historical);
  }
  await store.commitGeneration(initial, { expectedGeneration: null });
  await context(root, () => ingestTimingEvents({ store, claim, events }));
  const freeze = async (move = transition) =>
    adapter.freezeTimingCandidate({ generation: await store.readGeneration(), transition: move });
  const persist = async (effect, changes = {}) => {
    const current = await store.readGeneration();
    const generation = structuredClone(current.generation);
    generation.generation++;
    generation.publicationGeneration++;
    generation.batch = {
      schema: 'aitm.story-publication-batch/v1',
      batchId: 'batch-one',
      publicationGeneration: generation.publicationGeneration,
      transition,
      baseline: structuredClone(generation.baseSnapshot),
      approvedInputDigests: [],
      effects: [{ ...structuredClone(effect), attempted: true }],
      bodyTemplate: null,
      status: 'frozen',
      ...changes,
    };
    return store.commitGeneration(
      { generation, claimId: claim.claimId, payloads: current.payloads },
      { expectedGeneration: current.manifest.generation }
    );
  };
  const observation = (effect, changes = {}) => ({
    identity,
    node: {
      __typename: 'IssueComment',
      id: 'C_timing',
      body: effect.candidate.body,
      lastEditedAt: null,
      includesCreatedEdit: false,
      userContentEdits: { totalCount: 0, nodes: [] },
    },
    body: effect.candidate.body,
    ...changes,
  });
  const confirm = (effect, observed = observation(effect), extra = {}) =>
    context(root, () =>
      adapter.confirmTimingPublication({
        store,
        batchId: 'batch-one',
        observation: observed,
        ...extra,
      })
    );
  return { root, claim, store, freeze, persist, observation, confirm };
}
export const rows = (body) =>
  body
    .split('\n')
    .map(parseTimingRow)
    .filter((row) => row?.actorKey);

export async function changeGeneration(f, operation) {
  const before = await f.store.readGeneration();
  const next = structuredClone(before.generation);
  next.generation++;
  const payloads = new Map(before.payloads);
  operation(next, payloads);
  return f.store.commitGeneration(
    { generation: next, claimId: f.claim.claimId, payloads },
    { expectedGeneration: before.manifest.generation }
  );
}
