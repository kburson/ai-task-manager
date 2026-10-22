// @story #2039 #2043
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as adapter from '../../../../../task-tracker/lib/story-cache/stage-body.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRuntimeRootFixture } from '../../../../helpers/runtime-root-fixture.mjs';
import { context } from '../../../../helpers/story-handoff-runtime-fixture.mjs';
import { handoffGeneration, identity, hash } from '../../../../helpers/story-handoff-fixture.mjs';
import {
  openStoryStore,
  storyCachePath,
} from '../../../../../task-tracker/lib/story-cache/store.mjs';
import {
  acquireStoryWriter,
  openStoryWriterRegistry,
} from '../../../../../task-tracker/lib/story-cache/writer-claim.mjs';

async function fixture(t, body = 'base story') {
  const root = fs.realpathSync(createRuntimeRootFixture('stage-body-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
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
  initial.generation.working = {};
  initial.generation.dirtyKeys = [];
  initial.generation.baseSnapshot.resources['issue:I_test'].digest = hash(body);
  initial.payloads.set('base/body.md', body);
  const before = await store.commitGeneration(initial, { expectedGeneration: null });
  const invoke = (fn) => context('author-A', root, fn);
  const mutate = (mutate, extra = {}) =>
    invoke(() =>
      adapter.stageStoryMutation({ store, claim, key: 'issue:I_test', mutate, ...extra })
    );
  const title = (title, extra = {}) =>
    invoke(() => adapter.stageStoryTitle({ store, claim, title, ...extra }));
  return { root, registry, claim, store, before, invoke, mutate, title };
}
function working(current) {
  const ref = current.generation.working['issue:I_test'];
  return JSON.parse(current.payloads.get(ref.payloadPath).toString());
}
test('stages chained body edits durably without changing baseline or timing', async (t) => {
  const f = await fixture(t, 'base story\n<!-- aitm-body-version version="9" -->');
  const one = await f.mutate((body) => body + '\nfirst');
  assert.equal(one.status, 'staged');
  assert.equal(one.publication, 'unpublished');
  assert.equal(one.generation, 2);
  assert.deepEqual(one.dirtyKeys, ['issue:I_test']);
  const two = await f.mutate(async (body) => body + '\nsecond');
  assert.equal(two.body, 'base story\n<!-- aitm-body-version version="9" -->\nfirst\nsecond');
  const reopened = await openStoryStore({ projectRoot: f.root, identity });
  const current = await reopened.readGeneration();
  assert.equal(current.manifest.generation, 3);
  assert.deepEqual(working(current), {
    schema: 'aitm.story-issue-update/v1',
    body: two.body,
    title: 'Title',
  });
  assert.deepEqual(current.generation.baseSnapshot, f.before.generation.baseSnapshot);
  assert.deepEqual(current.generation.timing, f.before.generation.timing);
  assert.equal(current.generation.publicationGeneration, 0);
});
for (const order of ['title-first', 'body-first'])
  test(`body and title coexist in one dirty issue: ${order}`, async (t) => {
    const f = await fixture(t);
    if (order === 'title-first') {
      await f.title('New title');
      await f.mutate((body) => body + ' changed');
    } else {
      await f.mutate((body) => body + ' changed');
      await f.title('New title');
    }
    const current = await f.store.readGeneration();
    assert.deepEqual(working(current), {
      schema: 'aitm.story-issue-update/v1',
      body: 'base story changed',
      title: 'New title',
    });
    assert.equal(current.generation.baseSnapshot.title, 'Title');
    assert.deepEqual(current.generation.dirtyKeys, ['issue:I_test']);
  });
test('unchanged body or title creates no generation and no dirty key', async (t) => {
  const f = await fixture(t);
  for (const result of [await f.mutate((body) => body), await f.title('Title')]) {
    assert.equal(result.status, 'no-op');
    assert.equal(result.generation, 1);
    assert.deepEqual(result.dirtyKeys, []);
    assert.equal(result.publication, 'unpublished');
  }
  assert.deepEqual(await f.store.readGeneration(), f.before);
});
test('no-op on dirty working bytes preserves its current generation', async (t) => {
  const f = await fixture(t);
  await f.title('Pending');
  const before = await f.store.readGeneration();
  const result = await f.mutate((body) => body);
  assert.equal(result.status, 'no-op');
  assert.equal(result.generation, 2);
  assert.deepEqual(result.dirtyKeys, ['issue:I_test']);
  assert.deepEqual(await f.store.readGeneration(), before);
});
for (const [label, base, mutate, reason] of [
  ['marker loss', 'Story\n<!-- aitm-fields: {"size":"S"} -->', () => 'Story', 'marker-loss'],
  ['section loss', '## User Story\nA\n## Scope\nB', () => '## User Story\nA\nB', 'section-loss'],
  ['unproved tick', '- [ ] real verification', () => '- [x] real verification', 'unverified-ticks'],
  [
    'fabricated proof',
    'Story',
    (body) =>
      body +
      '\n- [x] fabricated <!-- aitm-verified-at: 2026-10-21T00:00:00Z evidence:"synthetic" sha=abcdef1234567 -->',
    'execution-proof',
  ],
  [
    'marker advance',
    'Story',
    (body) => body + '\n<!-- aitm-resident-action-ledger-head junk="true" -->',
    'marker-advance',
  ],
  [
    'reviewed scope',
    'Story',
    (body) => body + '\n<!-- aitm-scope-evidence-policy:v1 -->',
    'reviewed-scope',
  ],
  ['non-string', 'Story', () => null, 'result'],
  ['ill-formed string', 'Story', () => '\ud800', 'result'],
])
  test(`refuses ${label} without dirtying storage`, async (t) => {
    const f = await fixture(t, base);
    await assert.rejects(f.mutate(mutate), { code: 'STORY_MUTATION_INVALID', reason });
    assert.deepEqual(await f.store.readGeneration(), f.before);
  });
for (const capability of [
  true,
  { allowMarkerLoss: true },
  { evidenceStamp: true },
  { allowUnverifiedTicks: true },
])
  test(`caller flags cannot grant staging capability ${JSON.stringify(capability)}`, async (t) => {
    const f = await fixture(t);
    await assert.rejects(
      f.mutate((body) => body + ' edit', { capability }),
      { code: 'STORY_MUTATION_INVALID', reason: 'capability' }
    );
    assert.deepEqual(await f.store.readGeneration(), f.before);
  });
test('refuses a foreign resource key before invoking its callback', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    f.mutate(() => assert.fail('callback invoked'), { key: 'comment:IC_foreign' }),
    { code: 'STORY_MUTATION_INVALID', reason: 'resource-key' }
  );
});
test('requires a persistent claim, not a self-declared owner tuple', async (t) => {
  const f = await fixture(t);
  const claim = { ...f.claim };
  delete claim.registryKey;
  await assert.rejects(
    f.mutate((body) => body + ' edit', { claim }),
    { code: 'STORY_MUTATION_UNAVAILABLE' }
  );
});
test('refuses another session even under the same human login', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    context('author-B', f.root, () =>
      adapter.stageStoryMutation({
        store: f.store,
        claim: f.claim,
        key: 'issue:I_test',
        mutate: (body) => body + ' edit',
      })
    ),
    { code: 'STORY_WRITER_OWNED' }
  );
});
test('refuses a store at a foreign cache path', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    f.mutate((body) => body + ' edit', {
      store: { ...f.store, cachePath: f.store.cachePath + '-other' },
    }),
    { code: 'STORY_MUTATION_UNAVAILABLE', reason: 'store-identity' }
  );
});
test('refuses frozen handoff and rechecks after an awaited callback', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    f.mutate(async (body) => {
      await Promise.resolve();
      fs.mkdirSync(path.join(f.claim.cachePath, '.writer-handoff'), { mode: 0o700 });
      fs.writeFileSync(path.join(f.claim.cachePath, '.writer-handoff/frozen.json'), '{}\n', {
        mode: 0o600,
      });
      return body + ' edit';
    }),
    { code: 'STORY_WRITER_UNAVAILABLE', reason: 'handoff-frozen' }
  );
  assert.deepEqual(await f.store.readGeneration(), f.before);
  await assert.rejects(f.title('Frozen'), {
    code: 'STORY_WRITER_UNAVAILABLE',
    reason: 'handoff-frozen',
  });
});
test('refuses callback rejection with typed diagnostics and no acknowledgement', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    f.mutate(async () => {
      throw 'callback unavailable';
    }),
    { code: 'STORY_MUTATION_UNAVAILABLE' }
  );
  assert.deepEqual(await f.store.readGeneration(), f.before);
});
test('commit failure never returns staged success or retries', async (t) => {
  const f = await fixture(t);
  let attempts = 0;
  await assert.rejects(
    f.mutate((body) => body + ' edit', {
      store: {
        ...f.store,
        commitGeneration: async () => {
          attempts++;
          throw new Error('disk unavailable');
        },
      },
    }),
    { code: 'STORY_MUTATION_UNAVAILABLE' }
  );
  assert.equal(attempts, 1);
  assert.deepEqual(await f.store.readGeneration(), f.before);
});
test('legacy body-version bytes cannot be incremented as staging authority', async (t) => {
  const f = await fixture(t, 'Story\n<!-- aitm-body-version version="9" -->');
  await assert.rejects(
    f.mutate((body) => body.replace('version="9"', 'version="10"')),
    { code: 'STORY_MUTATION_INVALID', reason: 'legacy-version' }
  );
  assert.deepEqual(await f.store.readGeneration(), f.before);
});
test('rejects a corrupt payload instead of treating it as empty working content', async (t) => {
  const f = await fixture(t);
  const store = {
    ...f.store,
    readGeneration: async () => {
      const value = await f.store.readGeneration();
      value.payloads.set(
        value.generation.baseSnapshot.resources['issue:I_test'].payloadPath,
        Buffer.from('corrupt')
      );
      return value;
    },
  };
  await assert.rejects(f.mutate((body) => body + ' edit', { store }));
  assert.deepEqual(await f.store.readGeneration(), f.before);
});
test('the validated generation payload controls state, not an inconsistent returned projection', async (t) => {
  const f = await fixture(t);
  const store = {
    ...f.store,
    readGeneration: async () => {
      const value = await f.store.readGeneration();
      return {
        ...value,
        generation: {
          ...value.generation,
          working: {
            'issue:I_test': {
              payloadPath: 'fake',
              digest: hash('fake'),
              kind: 'issue',
              capabilityRef: null,
            },
          },
        },
      };
    },
  };
  const result = await f.mutate((body) => body + ' edit', { store });
  assert.equal(result.body, 'base story edit');
  assert.equal(working(await f.store.readGeneration()).body, 'base story edit');
});
test('a changed retained publication batch blocks staging rather than mutating its candidate', async (t) => {
  const f = await fixture(t);
  const candidate = await handoffGeneration(f.claim.claimId);
  candidate.generation.generation = 2;
  candidate.generation.publicationGeneration = 1;
  candidate.generation.batch = {
    schema: 'aitm.story-publication-batch/v1',
    publicationGeneration: 1,
    status: 'dispatching',
  };
  await f.store.commitGeneration(candidate, { expectedGeneration: 1 });
  const before = await f.store.readGeneration();
  await assert.rejects(f.title('Later'), {
    code: 'STORY_MUTATION_UNAVAILABLE',
    reason: 'publication-pending',
  });
  assert.deepEqual(await f.store.readGeneration(), before);
});
test('competing same-session staging never overwrites an awaited mutation', async (t) => {
  const f = await fixture(t);
  let enter, release;
  const entered = new Promise((resolve) => {
    enter = resolve;
  });
  const resume = new Promise((resolve) => {
    release = resolve;
  });
  await f.invoke(async () => {
    const first = adapter.stageStoryMutation({
      store: f.store,
      claim: f.claim,
      key: 'issue:I_test',
      mutate: async (body) => {
        enter();
        await resume;
        return body + ' first';
      },
    });
    await entered;
    try {
      await assert.rejects(
        adapter.stageStoryTitle({ store: f.store, claim: f.claim, title: 'Competing' })
      );
    } finally {
      release();
    }
    assert.equal((await first).body, 'base story first');
  });
  assert.equal((await f.store.readGeneration()).manifest.generation, 2);
});
test('native read-only body observations remain immutable while the persistent writer stages an edit', async (t) => {
  const f = await fixture(t);
  assert.equal(f.before.generation.baseSnapshot.resources['issue:I_test'].ownership, 'read-only');
  assert.equal((await f.mutate((body) => body + ' edit')).status, 'staged');
  const current = await f.store.readGeneration();
  assert.deepEqual(current.generation.baseSnapshot, f.before.generation.baseSnapshot);
});
test('loss of persistent claim during callback cannot acknowledge staging', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    f.mutate(async (body) => {
      await Promise.resolve();
      fs.unlinkSync(path.join(f.registry.path, f.claim.registryKey + '.json'));
      return body + ' edit';
    }),
    { code: 'STORY_WRITER_UNAVAILABLE', reason: 'missing-claim' }
  );
  assert.deepEqual(await f.store.readGeneration(), f.before);
});
test('missing required generation is unavailable, never empty hydration', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    f.mutate(() => assert.fail('callback invoked'), {
      store: { ...f.store, readGeneration: async () => null },
    }),
    { code: 'STORY_MUTATION_UNAVAILABLE', reason: 'generation-missing' }
  );
});
test('staging constructs no gh or fetch transport at the actual adapter seam', async (t) => {
  const f = await fixture(t);
  const bin = path.join(f.root, 'bin');
  fs.mkdirSync(bin);
  const marker = path.join(f.root, 'remote-dispatch');
  fs.writeFileSync(path.join(bin, 'gh'), '#!/bin/sh\n: > "' + marker + '"\nexit 91\n', {
    mode: 0o700,
  });
  const previousPath = process.env.PATH;
  const previousFetch = globalThis.fetch;
  let dispatches = 0;
  process.env.PATH = bin + path.delimiter + previousPath;
  globalThis.fetch = async () => {
    dispatches++;
    throw new Error('unexpected fetch');
  };
  try {
    assert.equal((await f.mutate((body) => body + ' local')).status, 'staged');
    assert.equal((await f.title('Local title')).status, 'staged');
    assert.equal(dispatches, 0);
    assert.equal(fs.existsSync(marker), false);
  } finally {
    process.env.PATH = previousPath;
    globalThis.fetch = previousFetch;
  }
});
test('malformed verifier declarations cannot be newly staged', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    f.mutate((body) => body + '\n- [ ] AC <!-- aitm-verified cmd="TBD" -->'),
    { code: 'STORY_MUTATION_INVALID', reason: 'verifier-declaration' }
  );
  assert.deepEqual(await f.store.readGeneration(), f.before);
});
for (const body of [
  'prior unpublished body',
  '{"schema":"user.document/v1","content":"prior body"}',
]) {
  test(`legacy working body is content, including unrelated JSON: ${body}`, async (t) => {
    const f = await fixture(t);
    const generation = structuredClone(f.before.generation);
    generation.generation = 2;
    generation.working['issue:I_test'] = {
      payloadPath: 'working/legacy.txt',
      digest: hash(body),
      kind: 'issue',
      capabilityRef: null,
    };
    generation.dirtyKeys = ['issue:I_test'];
    const payloads = new Map(f.before.payloads);
    payloads.set('working/legacy.txt', body);
    await f.store.commitGeneration(
      { generation, claimId: f.claim.claimId, payloads },
      { expectedGeneration: 1 }
    );
    assert.equal((await f.mutate((current) => current + '\nedit')).body, body + '\nedit');
  });
}
for (const [label, thrown] of [
  ['null', null],
  ['symbol', Symbol('callback failure')],
  [
    'hostile error code getter',
    {
      get code() {
        throw new Error('code unavailable');
      },
    },
  ],
]) {
  test(`callback failure remains typed for ${label}`, async (t) => {
    const f = await fixture(t);
    await assert.rejects(
      f.mutate(() => {
        throw thrown;
      }),
      { code: 'STORY_MUTATION_UNAVAILABLE' }
    );
    assert.deepEqual(await f.store.readGeneration(), f.before);
  });
}
