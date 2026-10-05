// @story #1852
import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryRuntime } from '../../../../fixtures/criteria-revision-runtime.mjs';
const domain = await import('../../../../../task-tracker/lib/criteria-revision/domain.mjs').catch(
  (e) => {
    if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw e;
  }
);
const api = await import('../../../../../task-tracker/lib/criteria-revision/interlock.mjs').catch(
  (e) => {
    if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw e;
  }
);
function setup() {
  const r = memoryRuntime();
  r.context.domain = domain.registerRevisionDomain(
    {
      repository: r.context.repository,
      commonDir: '/git/common',
      host: 'host-one',
      quiescenceConfirmed: true,
    },
    r.ports
  );
  return r;
}
test('opaque invocation capability permits exact nested scopes and expires after release', async () => {
  assert.equal(typeof api.withRevisionInterlock, 'function');
  const r = setup();
  let saved;
  await api.withRevisionInterlock(
    r.context,
    async (cap) => {
      saved = cap;
      assert.throws(
        () => api.assertRevisionCapability({ ...cap }, r.context, r.ports),
        /revision-capability/
      );
      await api.withRevisionInterlock(
        { ...r.context, capability: cap },
        async (inner) => assert.equal(inner, cap),
        r.ports
      );
      await assert.rejects(
        api.withRevisionInterlock(
          { ...r.context, issues: [1852, 1853], capability: cap },
          () => {},
          r.ports
        ),
        /revision-lock-scope/
      );
    },
    r.ports
  );
  assert.throws(
    () => api.assertRevisionCapability(saved, r.context, r.ports),
    /revision-capability/
  );
});
test('sibling asynchronous invocations contend and all issue locks acquire numerically', async () => {
  const r = setup();
  r.context.issues = [9, 2, 9];
  let release, entered;
  const ready = new Promise((res) => {
    entered = res;
  });
  const held = api.withRevisionInterlock(
    r.context,
    async () => {
      const holders = [...r.files.entries()]
        .filter(([p]) => p.endsWith('/holder.json'))
        .map(([, v]) => JSON.parse(v).issue);
      assert.deepEqual(holders, [2, 9]);
      entered();
      await new Promise((res) => {
        release = res;
      });
    },
    r.ports
  );
  await ready;
  await assert.rejects(
    api.withRevisionInterlock(r.context, () => {}, r.ports),
    /revision-lock-held/
  );
  release();
  await held;
});
test('only a proved-dead unchanged local holder is reclaimed; unknown, live and foreign persist', async () => {
  for (const life of ['alive', 'unknown', 'dead']) {
    const r = setup();
    await api.withRevisionInterlock(r.context, () => {}, r.ports);
    const lock = [...r.dirs].find((p) => p.endsWith('/locks'));
    const p = lock + '/1852.lock';
    r.ports.fs.mkdirSync(p);
    const holder = {
      schema: 'aitm.revision-lock-holder/v1',
      repository: 'owner/repo',
      issue: 1852,
      hostId: 'host-one',
      pid: 500,
      invocation: 'orphan',
      epoch: r.context.domain.epoch,
    };
    r.ports.fs.writeFileSync(p + '/holder.json', JSON.stringify(holder));
    r.ports.liveness = () => life;
    if (life === 'dead') await api.withRevisionInterlock(r.context, () => {}, r.ports);
    else
      await assert.rejects(
        api.withRevisionInterlock(r.context, () => {}, r.ports),
        /revision-lock-held/
      );
  }
});
test('foreign, corrupt and replaced holders remain owned; partial multi-issue acquisition unwinds', async () => {
  const r = setup();
  await api.withRevisionInterlock(r.context, () => {}, r.ports);
  const root = [...r.dirs].find((p) => p.endsWith('/locks')),
    p = root + '/1852.lock';
  const holder = {
    schema: 'aitm.revision-lock-holder/v1',
    repository: 'owner/repo',
    issue: 1852,
    hostId: 'foreign',
    pid: 500,
    invocation: 'orphan',
    epoch: r.context.domain.epoch,
  };
  r.ports.fs.mkdirSync(p);
  r.ports.fs.writeFileSync(p + '/holder.json', JSON.stringify(holder));
  r.ports.liveness = () => 'dead';
  await assert.rejects(
    api.withRevisionInterlock({ ...r.context, issues: [2, 1852] }, () => {}, r.ports),
    /revision-lock-held/
  );
  assert.equal(r.dirs.has(root + '/2.lock'), false);
  holder.hostId = 'host-one';
  r.ports.fs.writeFileSync(p + '/holder.json', JSON.stringify(holder));
  r.ports.liveness = () => {
    r.ports.fs.writeFileSync(
      p + '/holder.json',
      JSON.stringify({ ...holder, invocation: 'replacement' })
    );
    return 'dead';
  };
  await assert.rejects(
    api.withRevisionInterlock(r.context, () => {}, r.ports),
    /revision-lock-held/
  );
  assert.equal(JSON.parse(r.files.get(p + '/holder.json')).invocation, 'replacement');
});

test('executor identity must satisfy the closed Task 1 host contract', async () => {
  const r = setup();
  await assert.rejects(
    api.withRevisionInterlock(
      { ...r.context, executor: { ...r.context.executor, sessionId: 'invalid.session' } },
      () => {},
      r.ports
    ),
    /criteria-revision:identifier/
  );
});
