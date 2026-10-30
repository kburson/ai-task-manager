// @story #2039 #2055
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { cacheRetentionDecision } from '../../../../../task-tracker/lib/story-cache/retention.mjs';
const digest = (text) => createHash('sha256').update(text).digest('hex');
const identity = {
  host: 'github.com',
  repository: 'owner/repo',
  issueNumber: 2055,
  issueNodeId: 'I_test',
  projectId: 'P_test',
  projectItemId: 'PI_test',
};
// The store verifies all payload bytes before passing this generation to policy.
function clean() {
  return {
    schema: 'aitm.story-cache-generation/v1',
    identity: { ...identity },
    generation: 1,
    publicationGeneration: 0,
    baseSnapshot: { complete: true, resources: { 'issue:I_test': { digest: digest('base') } } },
    working: {},
    dirtyKeys: [],
    conflicts: [],
    batch: null,
    timing: { events: [], ingestedCursor: null, publishedCursor: null, canonicalCommentKey: null },
  };
}
function allowed(generation, operation = 'purge') {
  return cacheRetentionDecision({ generation, operation }).allowed;
}
for (const operation of ['purge', 'refresh', 'reassign', 'migrate']) {
  test(`${operation} allows a clean verified generation`, () =>
    assert.equal(allowed(clean(), operation), true));
  test(`${operation} retains an unpublished body`, () => {
    const generation = clean();
    generation.dirtyKeys = ['issue:I_test'];
    assert.equal(allowed(generation, operation), false);
  });
  test(`${operation} retains conflicts even without dirty tags`, () => {
    const generation = clean();
    generation.conflicts = [{ key: 'issue:I_test' }];
    assert.equal(allowed(generation, operation), false);
  });
  for (const status of [
    'prepared',
    'dispatching',
    'partial',
    'uncertain',
    'conflict',
    'confirmed',
    'unknown',
  ])
    test(`${operation} retains a ${status} publication journal until separately settled`, () => {
      const generation = clean();
      generation.batch = { schema: 'aitm.story-publication-batch/v1', status };
      assert.equal(allowed(generation, operation), false);
    });
}
for (const operation of [undefined, '', 'delete-everything', 'export', null])
  test(`unknown operation ${String(operation)} cannot authorize removal`, () =>
    assert.equal(cacheRetentionDecision({ generation: clean(), operation }).allowed, false));
for (const generation of [null, undefined, {}, [], false, { dirtyKeys: [], batch: null }])
  test(`missing generation evidence ${JSON.stringify(generation)} is retained`, () =>
    assert.equal(allowed(generation), false));
for (const [name, mutate] of [
  [
    'unsupported schema',
    (g) => {
      g.schema = 'aitm.story-cache-generation/v2';
    },
  ],
  [
    'missing identity',
    (g) => {
      delete g.identity;
    },
  ],
  [
    'traversal identity',
    (g) => {
      g.identity.host = '../escape';
    },
  ],
  [
    'missing dirty keys',
    (g) => {
      delete g.dirtyKeys;
    },
  ],
  [
    'malformed dirty keys',
    (g) => {
      g.dirtyKeys = {};
    },
  ],
  [
    'missing batch',
    (g) => {
      delete g.batch;
    },
  ],
  [
    'missing conflicts',
    (g) => {
      delete g.conflicts;
    },
  ],
  [
    'malformed conflicts',
    (g) => {
      g.conflicts = null;
    },
  ],
  [
    'incomplete baseline',
    (g) => {
      g.baseSnapshot.complete = false;
    },
  ],
  [
    'missing resources',
    (g) => {
      delete g.baseSnapshot.resources;
    },
  ],
  [
    'missing working data',
    (g) => {
      delete g.working;
    },
  ],
  [
    'malformed working data',
    (g) => {
      g.working = [];
    },
  ],
  [
    'missing timer',
    (g) => {
      delete g.timing;
    },
  ],
  [
    'missing event list',
    (g) => {
      delete g.timing.events;
    },
  ],
  [
    'missing ingestion cursor',
    (g) => {
      delete g.timing.ingestedCursor;
    },
  ],
  [
    'missing publication cursor',
    (g) => {
      delete g.timing.publishedCursor;
    },
  ],
  [
    'invalid cursor',
    (g) => {
      g.timing.ingestedCursor = g.timing.publishedCursor = '';
    },
  ],
  [
    'invalid storage counter',
    (g) => {
      g.generation = 0;
    },
  ],
  [
    'invalid publication counter',
    (g) => {
      g.publicationGeneration = 2;
    },
  ],
])
  test(`${name} fails closed`, () => {
    const generation = clean();
    mutate(generation);
    assert.equal(allowed(generation), false);
  });
test('retains pending native events even when cursors happen to agree', () => {
  const generation = clean();
  generation.timing.events = [{ eventId: 'evt-1', activeSeconds: null }];
  assert.equal(allowed(generation), false);
});
test('retains unacknowledged timing cursor without manufacturing an event', () => {
  const generation = clean();
  generation.timing.ingestedCursor = 'native-2';
  generation.timing.publishedCursor = 'native-1';
  assert.equal(allowed(generation), false);
});
test('equal opaque acknowledged cursors permit a clean refresh', () => {
  const generation = clean();
  generation.timing.ingestedCursor = generation.timing.publishedCursor = 'native-2';
  assert.equal(allowed(generation, 'refresh'), true);
});
test('changed working bytes remain protected even when a dirty tag is absent', () => {
  const generation = clean();
  generation.working['issue:I_test'] = { digest: digest('changed') };
  assert.equal(allowed(generation), false);
});
test('new unpublished comments remain protected even when a dirty tag is absent', () => {
  const generation = clean();
  generation.working['comment:new:intent-1'] = { digest: digest('new') };
  assert.equal(allowed(generation), false);
});
test('exact baseline working copy can be refreshed without erasing pending intent', () => {
  const generation = clean();
  generation.working['issue:I_test'] = { digest: digest('base') };
  assert.equal(allowed(generation, 'refresh'), true);
});
test('decision neither mutates nor purges its input', () => {
  const generation = clean();
  generation.dirtyKeys = ['issue:I_test'];
  const before = structuredClone(generation);
  const result = cacheRetentionDecision({ generation, operation: 'purge' });
  assert.deepEqual(generation, before);
  assert.equal(result.allowed, false);
  assert.equal(typeof result.reason, 'string');
});
