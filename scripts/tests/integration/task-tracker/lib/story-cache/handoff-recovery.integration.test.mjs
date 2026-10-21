// @story #2039 #2057
// Real filesystem faults in disposable Git roots, with no cloud or app mutation.
import * as writer from '../../../../../task-tracker/lib/story-cache/writer-registry.mjs';
import { acknowledgeStoryWriterTransfer } from '../../../../../task-tracker/lib/story-cache/writer-handoff.mjs';
import { withIssueLock } from '../../../../../task-tracker/issue-mutator-lock.mjs';
import { transferStoryWriter } from '../../../../../task-tracker/lib/story-cache/writer-handoff.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {
  fixture,
  transfer,
  owner,
  context,
} from '../../../../helpers/story-handoff-runtime-fixture.mjs';
test('recipient interruption before a payload publication can resume without a poisoned current manifest', async (t) => {
  let armed = false;
  let cache;
  const targetIo = new Proxy(fs, {
    get(target, key) {
      if (key !== 'linkSync') return target[key];
      return (...args) => {
        if (armed && String(args[1]).startsWith(cache + path.sep + 'payloads' + path.sep)) {
          armed = false;
          throw Object.assign(new Error('payload publication interrupted'), { code: 'EIO' });
        }
        return fs.linkSync(...args);
      };
    },
  });
  const f = await fixture(t, { targetIo });
  cache = f.targetStore.cachePath;
  armed = true;
  await assert.rejects(transfer(f));
  assert.deepEqual(owner(f), f.claim);
  const result = await transfer(f);
  assert.equal(result.status, 'transferred');
  assert.deepEqual(await f.targetStore.readGeneration(), f.before);
});

for (const point of ['after-manifest-link', 'after-intent-link'])
  test(`${point} interruption reconciles only owned exact stage aliases`, async (t) => {
    let armed = false;
    let cache;
    const targetIo = new Proxy(fs, {
      get(target, key) {
        if (key !== 'linkSync') return target[key];
        return (...args) => {
          const file = String(args[1]);
          const matches =
            point === 'after-manifest-link'
              ? file === path.join(cache, 'manifest.json')
              : file.startsWith(
                  cache + path.sep + '.writer-handoff' + path.sep + 'received' + path.sep
                ) && file.endsWith(path.sep + 'manifest.json');
          const result = fs.linkSync(...args);
          if (armed && matches) {
            armed = false;
            throw Object.assign(new Error('publication response interrupted'), { code: 'EIO' });
          }
          return result;
        };
      },
    });
    const f = await fixture(t, { targetIo });
    cache = f.targetStore.cachePath;
    armed = true;
    await assert.rejects(transfer(f));
    assert.deepEqual(owner(f), f.claim);
    const result = await transfer(f);
    assert.equal(result.status, 'transferred');
    assert.deepEqual(await f.targetStore.readGeneration(), f.before);
  });
test('a genuine large inventory resumes a partial recipient intent above 64 KiB', async (t) => {
  let armed = false;
  let cache;
  const targetIo = new Proxy(fs, {
    get(target, key) {
      if (key !== 'linkSync') return target[key];
      return (...args) => {
        if (armed && String(args[1]).startsWith(cache + path.sep + 'payloads' + path.sep)) {
          armed = false;
          throw Object.assign(new Error('partial large import'), { code: 'EIO' });
        }
        return fs.linkSync(...args);
      };
    },
  });
  const f = await fixture(t, { targetIo });
  cache = f.targetStore.cachePath;
  for (let i = 0; i < 600; i++)
    fs.writeFileSync(
      path.join(
        f.claim.cachePath,
        'publication',
        'evidence-' + String(i).padStart(4, '0') + '.txt'
      ),
      'retained',
      { mode: 0o600 }
    );
  armed = true;
  await assert.rejects(transfer(f));
  assert.deepEqual(owner(f), f.claim);
  const received = path.join(cache, '.writer-handoff', 'received');
  const id = fs
    .readdirSync(received)
    .find((name) => fs.statSync(path.join(received, name)).isDirectory());
  assert.equal(fs.statSync(path.join(received, id, 'manifest.json')).size > 65536, true);
  assert.equal(fs.existsSync(path.join(received, id + '.json')), false);
  const result = await transfer(f);
  assert.equal(result.status, 'transferred');
  assert.deepEqual(await f.targetStore.readGeneration(), f.before);
});

for (const point of ['before-pointer-rename', 'after-pointer-rename'])
  test(`${point} interruption reconciles the exact new owner without a second acknowledgment`, async (t) => {
    let armed = false,
      reference;
    const sourceIo = new Proxy(fs, {
      get(target, key) {
        if (key !== 'renameSync') return target[key];
        return (...args) => {
          if (armed && String(args[1]) === reference) {
            armed = false;
            if (point === 'after-pointer-rename') fs.renameSync(...args);
            throw Object.assign(new Error('pointer response lost'), { code: 'EIO' });
          }
          return fs.renameSync(...args);
        };
      },
    });
    const f = await fixture(t, { sourceIo });
    reference = path.join(f.registry.path, f.claim.registryKey + '.json');
    armed = true;
    await assert.rejects(transfer(f));
    assert.equal(owner(f).sessionId, point === 'before-pointer-rename' ? 'author-A' : 'author-B');
    f.target.acknowledge = async () => {
      throw new Error('receipt must be reconciled');
    };
    assert.equal((await transfer(f)).status, 'transferred');
    assert.equal(owner(f).sessionId, 'author-B');
    assert.deepEqual(await f.targetStore.readGeneration(), f.before);
  });
test('same-cache interruption after pointer publication can finish its exact remaining fence removal', async (t) => {
  let armed = false,
    reference;
  const sourceIo = new Proxy(fs, {
    get(target, key) {
      if (key !== 'renameSync') return target[key];
      return (...args) => {
        const result = fs.renameSync(...args);
        if (armed && String(args[1]) === reference) {
          armed = false;
          throw Object.assign(new Error('pointer acknowledged late'), { code: 'EIO' });
        }
        return result;
      };
    },
  });
  const f = await fixture(t, { sourceIo });
  reference = path.join(f.registry.path, f.claim.registryKey + '.json');
  f.target = {
    ...f.target,
    worktree: f.root,
    cachePath: f.claim.cachePath,
    acknowledge: (request) =>
      context('author-B', f.root, () =>
        acknowledgeStoryWriterTransfer({ ...request, store: f.store, registry: f.registry })
      ),
  };
  armed = true;
  await assert.rejects(transfer(f));
  assert.equal(owner(f).sessionId, 'author-B');
  assert.equal((await transfer(f)).reconciled, true);
  writer.assertStoryWriter(owner(f), {
    sessionId: 'author-B',
    worktree: f.root,
    registry: f.registry,
  });
});

test('source interruption before freeze publication cannot orphan an ambiguous same-cache export', async (t) => {
  let armed = false;
  const sourceIo = new Proxy(fs, {
    get(target, key) {
      if (key !== 'linkSync') return target[key];
      return (...args) => {
        if (armed && String(args[1]).endsWith(path.sep + 'frozen.json')) {
          armed = false;
          throw Object.assign(new Error('freeze interrupted'), { code: 'EIO' });
        }
        return fs.linkSync(...args);
      };
    },
  });
  const f = await fixture(t, { sourceIo });
  f.target = {
    ...f.target,
    worktree: f.root,
    cachePath: f.claim.cachePath,
    acknowledge: (request) =>
      context('author-B', f.root, () =>
        acknowledgeStoryWriterTransfer({ ...request, store: f.store, registry: f.registry })
      ),
  };
  armed = true;
  await assert.rejects(transfer(f));
  assert.deepEqual(owner(f), f.claim);
  await transfer(f);
  assert.equal((await transfer(f)).reconciled, true);
});

test('handoff cannot release ownership after its exact native lock scope has ended', async (t) => {
  const f = await fixture(t);
  let proceed, reached;
  const gate = new Promise((resolve) => {
    proceed = resolve;
  });
  const ready = new Promise((resolve) => {
    reached = resolve;
  });
  const good = f.target.acknowledge;
  f.target.acknowledge = async (request) => {
    reached();
    await gate;
    return good(request);
  };
  await context('author-A', f.root, async () => {
    let pending;
    await withIssueLock({ issue: 2057, projDir: f.root, sessionId: 'author-A' }, async () => {
      pending = transferStoryWriter({
        claim: f.claim,
        target: f.target,
        store: f.store,
        registry: f.registry,
      });
      await ready;
    });
    proceed();
    await assert.rejects(pending, {
      code: 'STORY_WRITER_UNAVAILABLE',
      reason: 'native-lock-owner',
    });
  });
  assert.deepEqual(owner(f), f.claim);
  assert.deepEqual(await f.store.readGeneration(), f.before);
});
for (const point of ['source-export', 'receiver-ack'])
  test(`${point} publication interruption preserves the old owner and resumes exact intent`, async (t) => {
    let armed = false;
    const io = new Proxy(fs, {
      get(target, key) {
        if (key !== 'linkSync') return target[key];
        return (...args) => {
          const file = String(args[1]);
          const matches =
            point === 'source-export'
              ? file.includes(path.sep + 'transfers' + path.sep) &&
                file.includes(path.sep + 'files' + path.sep)
              : file.includes(path.sep + 'received' + path.sep) &&
                /received.[^/]+\.json$/.test(file);
          if (armed && matches) {
            armed = false;
            throw Object.assign(new Error('publication interrupted'), { code: 'EIO' });
          }
          return fs.linkSync(...args);
        };
      },
    });
    const f = await fixture(t, point === 'source-export' ? { sourceIo: io } : { targetIo: io });
    armed = true;
    await assert.rejects(transfer(f));
    assert.equal(armed, false);
    assert.deepEqual(owner(f), f.claim);
    assert.equal((await transfer(f)).status, 'transferred');
    assert.deepEqual(await f.targetStore.readGeneration(), f.before);
  });

test('a lost response after receiver acknowledgment publication reconciles its exact owned stage alias', async (t) => {
  let armed = false;
  const targetIo = new Proxy(fs, {
    get(target, key) {
      if (key !== 'linkSync') return target[key];
      return (...args) => {
        const result = fs.linkSync(...args);
        const file = String(args[1]);
        if (
          armed &&
          file.includes(path.sep + 'received' + path.sep) &&
          /received.[^/]+\.json$/.test(file)
        ) {
          armed = false;
          throw Object.assign(new Error('ack response lost'), { code: 'EIO' });
        }
        return result;
      };
    },
  });
  const f = await fixture(t, { targetIo });
  armed = true;
  await assert.rejects(transfer(f));
  assert.equal(armed, false);
  assert.deepEqual(owner(f), f.claim);
  assert.equal((await transfer(f)).status, 'transferred');
  assert.deepEqual(await f.targetStore.readGeneration(), f.before);
});

test('an unknown acknowledgment hardlink is retained and cannot be reconciled as an owned stage', async (t) => {
  const f = await fixture(t);
  const good = f.target.acknowledge;
  let alias, ackFile;
  f.target.acknowledge = async (request) => {
    const proof = await good(request);
    ackFile = path.join(
      f.targetStore.cachePath,
      '.writer-handoff',
      'received',
      request.transferId + '.json'
    );
    alias = path.join(f.targetStore.cachePath, 'unknown-ack-alias');
    fs.linkSync(ackFile, alias);
    return proof;
  };
  await assert.rejects(transfer(f));
  assert.deepEqual(owner(f), f.claim);
  f.target.acknowledge = good;
  await assert.rejects(transfer(f));
  assert.deepEqual(owner(f), f.claim);
  assert.equal(fs.existsSync(alias), true);
  assert.equal(fs.statSync(ackFile).nlink, 2);
});
