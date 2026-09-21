// @story #1728
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { computeScopeIdentity } from '../../../../task-tracker/lib/workflow-policy/scope-identity.mjs';
import { validateBlocker } from '../../../../task-tracker/lib/action-decision/contract.mjs';
import { createObservationAttempt } from '../../../../task-tracker/lib/action-decision/observations.mjs';

const repository = 'kburson/ai-task-manager';
const body = '## User Story\nA user\n## Scope\nDo work\n## Acceptance Criteria\n- [ ] It works';
const scope = computeScopeIdentity({ repository, issue: 1728, body });
const clock = () => '2026-09-21T09:20:00.000Z';
const request = { resource: 'issue-body', identity: 'issue:1728', scope };
const response = () => ({
  repository,
  issue: 1728,
  resource: 'issue-body',
  identity: 'issue:1728',
  scope,
  value: { number: 1728, body },
  revision: 'body-v1',
});

test('one attempt memoizes the complete identity and freezes source evidence', async () => {
  let reads = 0;
  const attempt = createObservationAttempt({
    repository,
    issue: 1728,
    boundaryId: 'explain:promote',
    now: clock,
    read: async () => {
      reads += 1;
      return response();
    },
  });
  const first = await attempt.observe(request);
  const second = await attempt.observe(request);
  assert.strictEqual(first, second);
  assert.equal(reads, 1);
  assert.equal(first.status, 'observed');
  assert.equal(first.revision, 'body-v1');
  assert.equal(first.observedAt, clock());
  assert.ok(first.digest.startsWith('sha256:'));
  assert.equal(Object.isFrozen(first.value), true);
  assert.equal(Object.isFrozen(first), true);
  assert.throws(() => {
    first.value.body = 'tampered';
  }, TypeError);
  const bundle = attempt.finish({
    normalizationInputs: [{ normalizerId: 'functional-dod', inputDigest: 'sha256:abc' }],
  });
  assert.equal(bundle.startedAt, clock());
  assert.equal(bundle.completedAt, clock());
  assert.equal(bundle.observations.length, 1);
  assert.equal(bundle.observations[0].digest, first.digest);
  assert.ok(bundle.digest.startsWith('sha256:'));
  assert.equal(Object.isFrozen(bundle.observations), true);
});

test('new attempts and changed scope do not reuse stale reads', async () => {
  let reads = 0;
  const read = async (input) => {
    reads += 1;
    return { ...response(), scope: input.scope };
  };
  const first = createObservationAttempt({
    repository,
    issue: 1728,
    boundaryId: 'explain:promote',
    now: clock,
    read,
  });
  await first.observe(request);
  await first.observe({ ...request, scope: 'sha256:changed' });
  const second = createObservationAttempt({
    repository,
    issue: 1728,
    boundaryId: 'explain:promote',
    now: clock,
    read,
  });
  await second.observe(request);
  assert.equal(reads, 3);
});

test('a refresh replaces superseded body evidence rather than retaining it in the bundle', async () => {
  let revision = 0;
  const attempt = createObservationAttempt({
    repository,
    issue: 1728,
    boundaryId: 'explain:promote',
    now: clock,
    read: async () => ({ ...response(), revision: `body-v${++revision}` }),
  });
  assert.equal((await attempt.observe(request)).revision, 'body-v1');
  assert.equal((await attempt.observe({ ...request, refresh: true })).revision, 'body-v2');
  const bundle = attempt.finish();
  assert.equal(bundle.observations.length, 1);
  assert.equal(bundle.observations[0].revision, 'body-v2');
});

test('invalidation during a pending read cannot return usable authority', async () => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const attempt = createObservationAttempt({
    repository,
    issue: 1728,
    boundaryId: 'explain:promote',
    now: clock,
    read: async () => {
      await pending;
      return response();
    },
  });
  const observed = attempt.observe(request);
  attempt.invalidate('effect-attempt');
  release();
  await assert.rejects(observed, /action-observation:closed/);
  assert.throws(() => attempt.finish(), /action-observation:closed/);
});

test('failed required read retains a typed indeterminate cause and source provenance', async () => {
  const attempt = createObservationAttempt({
    repository,
    issue: 1728,
    boundaryId: 'explain:promote',
    now: clock,
    read: async () => {
      throw new Error('network offline');
    },
  });
  const observed = await attempt.observe(request);
  assert.equal(observed.status, 'indeterminate');
  assert.deepEqual(observed.cause, {
    code: 'authority-read-failed',
    guardId: 'authority-collection',
    args: { source: 'issue-body', reason: 'unavailable', subject: { issue: 1728 } },
    noAutomaticRemediation: { reason: 'authority-investigation-required' },
  });
  assert.deepEqual(validateBlocker(observed.cause, { status: 'indeterminate' }), observed.cause);
  assert.equal(observed.provenance.detail, 'network offline');
  assert.equal(observed.resource, 'issue-body');
  assert.equal(observed.identity, 'issue:1728');
  assert.equal(attempt.finish().observations.length, 1);
});

test('missing source and incompatible repository, issue, or body fail closed', async () => {
  const cases = [
    [undefined, 'incomplete'],
    [{ ...response(), repository: 'other/repo' }, 'invalid'],
    [{ ...response(), issue: 9 }, 'invalid'],
    [{ ...response(), value: { number: 1728, body: `${body}\nchanged` } }, 'invalid'],
  ];
  for (const [returned, reason] of cases) {
    const attempt = createObservationAttempt({
      repository,
      issue: 1728,
      boundaryId: 'explain:promote',
      now: clock,
      read: async () => returned,
    });
    const observed = await attempt.observe(request);
    assert.equal(observed.status, 'indeterminate');
    assert.equal(observed.cause.code, 'authority-read-failed');
    assert.equal(observed.cause.args.reason, reason);
  }
});

test('accessor-bearing response cannot escape typed collection failure or poison the attempt', async () => {
  const hostile = { ...response() };
  Object.defineProperty(hostile, 'repository', {
    enumerable: true,
    get() {
      throw new Error('getter exploded');
    },
  });
  const attempt = createObservationAttempt({
    repository,
    issue: 1728,
    boundaryId: 'explain:promote',
    now: clock,
    read: async () => hostile,
  });
  const observed = await attempt.observe(request);
  assert.equal(observed.status, 'indeterminate');
  assert.equal(observed.cause.args.reason, 'invalid');
  assert.equal(attempt.finish().observations[0].status, 'indeterminate');
});

test('bundle digest binds canonical content and normalization inputs', async () => {
  const collect = async (value, normalizationInputs) => {
    const attempt = createObservationAttempt({
      repository,
      issue: 1728,
      boundaryId: 'explain:promote',
      now: clock,
      read: async () => ({ ...response(), value: { number: 1728, body, note: value } }),
    });
    await attempt.observe(request);
    return attempt.finish({ normalizationInputs }).digest;
  };
  assert.notEqual(await collect('a', []), await collect('b', []));
  assert.notEqual(
    await collect('a', []),
    await collect('a', [{ normalizerId: 'x', inputDigest: 'sha256:a' }])
  );
  assert.equal(await collect('a', []), await collect('a', []));
});

test('an attempt with no observed source cannot finish as an authority bundle', () => {
  const attempt = createObservationAttempt({
    repository,
    issue: 1728,
    boundaryId: 'explain:promote',
    now: clock,
    read: async () => response(),
  });
  assert.throws(() => attempt.finish(), /action-observation:empty/);
});

test('collector leaves the outer effect-attempt ledger empty', async () => {
  const attempts = [];
  const read = async () => response();
  read.fetch = () => {
    attempts.push('network:fetch');
    throw new Error('fetch forbidden');
  };
  read.writeFile = () => {
    attempts.push('file:write');
    throw new Error('write forbidden');
  };
  read.updateRef = () => {
    attempts.push('git:update-ref');
    throw new Error('ref forbidden');
  };
  const attempt = createObservationAttempt({
    repository,
    issue: 1728,
    boundaryId: 'explain:promote',
    now: clock,
    read,
  });
  try {
    assert.equal((await attempt.observe(request)).status, 'observed');
  } finally {
    assert.deepEqual(attempts, []);
  }
});

test('the outer ledger catches swallowed local, Git, and network effects inside a read port', async () => {
  const attempts = [];
  const forbidden = (name) => {
    attempts.push(name);
    throw new Error(`${name} forbidden`);
  };
  const attempt = createObservationAttempt({
    repository,
    issue: 1728,
    boundaryId: 'explain:promote',
    now: clock,
    read: async () => {
      for (const name of ['network:fetch', 'file:write', 'git:update-ref']) {
        try {
          forbidden(name);
        } catch {}
      }
      return response();
    },
  });
  try {
    assert.equal((await attempt.observe(request)).status, 'observed');
  } finally {
    assert.deepEqual(attempts, ['network:fetch', 'file:write', 'git:update-ref']);
    assert.throws(() => assert.deepEqual(attempts, []));
  }
});
