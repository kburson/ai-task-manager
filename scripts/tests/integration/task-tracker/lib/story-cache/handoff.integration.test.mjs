// @story #2039 #2057
// Actor contexts below exist only in disposable Git fixtures.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {
  context,
  fixture,
  transfer,
  owner,
} from '../../../../helpers/story-handoff-runtime-fixture.mjs';
import { hash, handoffGeneration } from '../../../../helpers/story-handoff-fixture.mjs';
import * as writer from '../../../../../task-tracker/lib/story-cache/writer-registry.mjs';
import {
  transferStoryWriter,
  acknowledgeStoryWriterTransfer,
} from '../../../../../task-tracker/lib/story-cache/writer-handoff.mjs';
test('exact acknowledged bytes move one owning tuple and preserve pending baseline, cursor and journal', async (t) => {
  const f = await fixture(t);
  const old = f.target.acknowledge;
  f.target.acknowledge = async (request) => {
    assert.deepEqual(owner(f), f.claim);
    assert.throws(() =>
      writer.assertStoryWriter(f.claim, {
        sessionId: 'author-A',
        worktree: f.root,
        registry: f.registry,
      })
    );
    return old(request);
  };
  const result = await transfer(f);
  assert.equal(result.status, 'transferred');
  const claim = owner(f);
  assert.equal(claim.claimId, f.claim.claimId);
  assert.equal(claim.sessionId, 'author-B');
  assert.equal(claim.worktree, f.recipient);
  assert.deepEqual(await f.targetStore.readGeneration(), f.before);
  assert.equal(
    fs.readFileSync(path.join(f.targetStore.cachePath, 'publication', 'journal.json'), 'utf8'),
    'uncertain publication; retain exact bytes'
  );
  assert.deepEqual(await f.store.readGeneration(), f.before);
  assert.throws(() =>
    writer.assertStoryWriter(f.claim, {
      sessionId: 'author-A',
      worktree: f.root,
      registry: f.registry,
    })
  );
  writer.assertStoryWriter(claim, {
    sessionId: 'author-B',
    worktree: f.recipient,
    registry: f.targetRegistry,
  });
  assert.equal(
    fs
      .readFileSync(path.join(f.registry.path, f.claim.registryKey + '.json'))
      .includes(Buffer.from('private unpublished body')),
    false
  );
});
for (const acknowledgment of ['missing', 'forged', 'throws'])
  test(`${acknowledgment} acknowledgment preserves and fences the original owner`, async (t) => {
    const f = await fixture(t);
    f.target.acknowledge = async () => {
      if (acknowledgment === 'throws') throw new Error('recipient interrupted');
      return acknowledgment === 'missing' ? undefined : { verified: true, digest: 'forged' };
    };
    await assert.rejects(transfer(f));
    assert.deepEqual(owner(f), f.claim);
    assert.deepEqual(await f.store.readGeneration(), f.before);
    assert.throws(() =>
      writer.assertStoryWriter(f.claim, {
        sessionId: 'author-A',
        worktree: f.root,
        registry: f.registry,
      })
    );
  });
test('a matching retained intent can resume after recipient interruption without losing pending bytes', async (t) => {
  const f = await fixture(t);
  const good = f.target.acknowledge;
  f.target.acknowledge = async () => {
    throw new Error('interrupted');
  };
  await assert.rejects(transfer(f));
  f.target.acknowledge = good;
  const result = await transfer(f);
  assert.equal(result.status, 'transferred');
  assert.deepEqual(await f.targetStore.readGeneration(), f.before);
});
test('post-ack recipient modification refuses release and preserves both copies', async (t) => {
  const f = await fixture(t);
  const good = f.target.acknowledge;
  const file = f.before.generation.working['issue:I_test'].payloadPath;
  f.target.acknowledge = async (request) => {
    const ack = await good(request);
    fs.writeFileSync(path.join(f.targetStore.cachePath, file), 'recipient changed');
    return ack;
  };
  await assert.rejects(transfer(f));
  assert.deepEqual(owner(f), f.claim);
  assert.equal(
    fs.readFileSync(path.join(f.targetStore.cachePath, file), 'utf8'),
    'recipient changed'
  );
  assert.deepEqual(await f.store.readGeneration(), f.before);
});

test('a foreign actual session cannot transfer a retained claim even with its exact bytes', async (t) => {
  const f = await fixture(t);
  let called = false;
  f.target.acknowledge = async () => {
    called = true;
  };
  await assert.rejects(
    context('foreign-session', f.root, () =>
      transferStoryWriter({
        claim: f.claim,
        target: f.target,
        store: f.store,
        registry: f.registry,
      })
    ),
    { code: 'STORY_HANDOFF_UNAVAILABLE', reason: 'actor' }
  );
  assert.equal(called, false);
  assert.deepEqual(owner(f), f.claim);
  writer.assertStoryWriter(f.claim, {
    sessionId: 'author-A',
    worktree: f.root,
    registry: f.registry,
  });
});
test('the sender cannot impersonate the named recipient through acknowledgment arguments', async (t) => {
  const f = await fixture(t);
  f.target.acknowledge = (request) =>
    acknowledgeStoryWriterTransfer({ ...request, store: f.targetStore, registry: f.registry });
  await assert.rejects(transfer(f), { code: 'STORY_HANDOFF_UNAVAILABLE', reason: 'actor' });
  assert.deepEqual(owner(f), f.claim);
  assert.deepEqual(await f.targetStore.readGeneration(), null);
});
test('assignment is checked again after acknowledgment before ownership release', async (t) => {
  const f = await fixture(t);
  const good = f.target.acknowledge;
  f.target.acknowledge = async (request) => {
    const ack = await good(request);
    f.target.assignment = ['other'];
    return ack;
  };
  await assert.rejects(transfer(f), { code: 'STORY_HANDOFF_UNAVAILABLE', reason: 'assignment' });
  assert.deepEqual(owner(f), f.claim);
  f.target.assignment = ['tester'];
  f.target.acknowledge = good;
  assert.equal((await transfer(f)).status, 'transferred');
});
test('changed source bytes after acknowledgment are preserved and cannot release ownership', async (t) => {
  const f = await fixture(t);
  const good = f.target.acknowledge;
  const file = f.before.generation.working['issue:I_test'].payloadPath;
  f.target.acknowledge = async (request) => {
    const ack = await good(request);
    fs.writeFileSync(path.join(f.claim.cachePath, file), 'changed source');
    return ack;
  };
  await assert.rejects(transfer(f));
  assert.deepEqual(owner(f), f.claim);
  assert.equal(fs.readFileSync(path.join(f.claim.cachePath, file), 'utf8'), 'changed source');
  assert.deepEqual(await f.targetStore.readGeneration(), f.before);
});
test('changing the named target after acknowledgment cannot grant another actor ownership', async (t) => {
  const f = await fixture(t);
  const good = f.target.acknowledge;
  f.target.acknowledge = async (request) => {
    const ack = await good(request);
    f.target.sessionId = 'different';
    return ack;
  };
  await assert.rejects(transfer(f), {
    code: 'STORY_HANDOFF_UNAVAILABLE',
    reason: 'target-changed',
  });
  assert.deepEqual(owner(f), f.claim);
});
test('completed replay preserves legitimate recipient edits and does not ask for acknowledgment again', async (t) => {
  const f = await fixture(t);
  await transfer(f);
  const claim = owner(f);
  const next = await handoffGeneration(claim.claimId);
  next.generation.generation = 2;
  next.generation.working['issue:I_test'].digest = hash('new owner work');
  next.payloads.set('working/body.md', 'new owner work');
  writer.assertStoryWriter(claim, {
    sessionId: 'author-B',
    worktree: f.recipient,
    registry: f.targetRegistry,
  });
  const changed = await context('author-B', f.recipient, () =>
    f.targetStore.commitGeneration(next, { expectedGeneration: 1 })
  );
  f.target.acknowledge = async () => {
    throw new Error('must not request a second acknowledgment');
  };
  const result = await transfer(f);
  assert.equal(result.reconciled, true);
  assert.deepEqual(await f.targetStore.readGeneration(), changed);
});
test('same-cache explicit session handoff unfences only the acknowledged new owner', async (t) => {
  const f = await fixture(t);
  f.target = {
    ...f.target,
    worktree: f.root,
    cachePath: f.claim.cachePath,
    acknowledge: (request) =>
      context('author-B', f.root, () =>
        acknowledgeStoryWriterTransfer({ ...request, store: f.store, registry: f.registry })
      ),
  };
  const result = await transfer(f);
  assert.equal(result.status, 'transferred');
  assert.equal(owner(f).sessionId, 'author-B');
  writer.assertStoryWriter(owner(f), {
    sessionId: 'author-B',
    worktree: f.root,
    registry: f.registry,
  });
  assert.throws(() =>
    writer.assertStoryWriter(f.claim, {
      sessionId: 'author-A',
      worktree: f.root,
      registry: f.registry,
    })
  );
  assert.equal((await transfer(f)).reconciled, true);
});
test('an unknown recipient alias is retained and never treated as an owned transfer stage', async (t) => {
  const f = await fixture(t);
  const good = f.target.acknowledge;
  const file = path.join(
    f.targetStore.cachePath,
    f.before.generation.working['issue:I_test'].payloadPath
  );
  const alias = file + '.unknown';
  f.target.acknowledge = async (request) => {
    const ack = await good(request);
    fs.linkSync(file, alias);
    return ack;
  };
  await assert.rejects(transfer(f));
  assert.deepEqual(owner(f), f.claim);
  assert.equal(fs.existsSync(alias), true);
  assert.equal(fs.statSync(file).nlink, 2);
});
