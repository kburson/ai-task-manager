// @story #1049

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  parseTimingProjectionReceipts,
  postTransitionTimingQueueAliasProjection,
  readTimingProjection,
  readTransitionTimingQueueAliasProjection,
  reconcileTimingProjectionRowEffect,
} from '../../../gh-timing-comment.mjs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import { applyTimingProjection } from '../../../lib/work-lease/bind-orchestration.mjs';
import { coordinateWorkLeaseSwitch } from '../../../lib/work-lease/switch-orchestration.mjs';
import {
  canonicalTimingQueueProjection,
  resolveTimingQueueJournalProjection,
} from '../../../lib/timing-queue-projection.mjs';
import {
  deriveTransitionTimingQueueAliasAuthority,
  isTransitionProjectionAuthorityError,
} from '../../../lib/work-lease/transition-projection-authority.mjs';
import { postRuntimeQueuedTimingEvent } from '../../../runtime.mjs';
import { activeTaskPath, getActiveTask } from '../../../session-state.mjs';
import { drain, peek, removeExactQueueEntries } from '../../../queue.mjs';

const SWITCH_PROJECTION_ID = 'switchLease:switch:session-1:1048:1049:request-1:timing';
const LEGACY_SUB_OPERATION_ID = `${SWITCH_PROJECTION_ID}:queued-source:0:97e36116f5b24020`;
const ROW =
  '| 2026-07-30 11:58:00 +00:00 | develop:completed | 2m 0s |  | 7 | 28 | queued source work | 9 | <!-- row-sec: a=120 i=0 -->';
const ENTRY = Object.freeze({
  kind: 'timing',
  issue: '#1048',
  row: ROW,
  queuedAt: '2026-07-30T11:59:00.000Z',
});
const EMPTY_BODY = [
  '## ⏱ Timing Log',
  '',
  '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Δ Words (full) |',
  '|---|---|---|---|---|---|---|---|',
].join('\n');

function switchAuthorityFixture() {
  const holder = {
    principalKind: 'worker',
    provider: 'codex',
    agentRunId: 'run-1',
    sessionId: 'session-1',
    hostId: 'host-1',
    pid: 123,
    worktreeId: 'worktree-1',
    pathHash: 'path-hash-1',
    branch: 'feature/child/1049',
  };
  return {
    transitionId: 'transition-1',
    request: {
      projectId: 'project-1',
      issueId: '1048',
      leaseId: 'source-lease',
      fencingToken: '7',
      idempotencyKey: 'switch:session-1:1048:1049:request-1',
      switchedAt: '2026-07-30T12:00:00.000Z',
      target: {
        projectId: 'project-1',
        issueId: '1049',
        mode: 'write',
        idempotencyKey: 'switch-target:session-1:1049:request-1',
        requestedAt: '2026-07-30T12:00:00.000Z',
        ttlMs: 900_000,
        holder,
      },
    },
    receipt: {
      lease: {
        projectId: 'project-1',
        issueId: '1049',
        mode: 'write',
        state: 'active',
        leaseId: 'target-lease',
        fencingToken: '8',
        holder,
        acquiredAt: '2026-07-30T12:00:00.000Z',
        heartbeatAt: '2026-07-30T12:00:00.000Z',
        expiresAt: '2026-07-30T12:15:00.000Z',
        audit: { operation: 'switch' },
      },
      transition: {
        transitionId: 'transition-1',
        fromIssueId: '1048',
        fromLeaseId: 'source-lease',
        fromToken: '7',
        toIssueId: '1049',
      },
    },
  };
}

function legacyJournal() {
  return {
    entry: ENTRY,
    entryIndex: 0,
    switchProjectionId: SWITCH_PROJECTION_ID,
    journalProjectionId: SWITCH_PROJECTION_ID,
    journalSubOperationId: LEGACY_SUB_OPERATION_ID,
  };
}

function aliasAuthority() {
  const resolved = resolveTimingQueueJournalProjection(legacyJournal());
  return {
    resolved,
    authority: deriveTransitionTimingQueueAliasAuthority({
      ...switchAuthorityFixture(),
      ...legacyJournal(),
      deliveryProjectionId: resolved.deliveryProjectionId,
      deliverySubOperationId: resolved.deliverySubOperationId,
      issueId: '1048',
      operation: 'evidence-mutation',
    }),
  };
}

function bodyWith(projections) {
  let body = EMPTY_BODY;
  for (const { projectionId, subOperationId, row = ROW } of projections) {
    body = reconcileTimingProjectionRowEffect(body, {
      projectionId,
      subOperationId,
      row,
    }).body;
  }
  return body;
}

function remote(initialBody) {
  let body = initialBody;
  let writes = 0;
  const post = async (input) => {
    const effect = reconcileTimingProjectionRowEffect(body, input);
    if (effect.status === 'missing') {
      writes += 1;
      body = effect.body;
    }
    return { status: effect.status };
  };
  const read = async (input) =>
    readTimingProjection({
      ...input,
      deps: {
        readTimingCommentBody: async () => ({ status: 'found', body, error: null }),
      },
    });
  return {
    post,
    read,
    deps: {
      findTimingComment: async () => ({ id: 'comment-1', body }),
      updateTimingComment: async (_id, _repo, nextBody) => {
        writes += 1;
        body = nextBody;
      },
      createTimingComment: async (_issue, _repo, nextBody) => {
        writes += 1;
        body = nextBody;
      },
      readTimingCommentBody: async () => ({ status: 'found', body, error: null }),
    },
    body: () => body,
    writes: () => writes,
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function waitForLockAttempt() {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

function aliasCall(authority, resolved, deps, projectDir) {
  return {
    aliasAuthority: authority,
    ...switchAuthorityFixture(),
    projectionName: 'timing',
    journalProjectionId: SWITCH_PROJECTION_ID,
    journalSubOperationId: LEGACY_SUB_OPERATION_ID,
    projectionId: resolved.deliveryProjectionId,
    subOperationId: resolved.deliverySubOperationId,
    issueNumber: '1048',
    repo: 'owner/repo',
    row: ROW,
    projDir: projectDir,
    lock: true,
    retries: 0,
    deps,
  };
}

const UPGRADE_PROJECT_DIR = '/tmp/aitm-1049-upgrade-fixture-project';
const upgradeFixturePath = new URL(
  '../../fixtures/pre-canonical-timing-queue-intent.json',
  import.meta.url
);

function readUpgradeFixture() {
  const bytes = readFileSync(upgradeFixturePath);
  return { bytes, value: JSON.parse(bytes) };
}

function upgradeRemote(fixture, receiptState = 'neither') {
  const queued = fixture.workLeaseIntent.projections.timing.input.queuedSourceEntries[0];
  const canonical = canonicalTimingQueueProjection(queued.entry);
  const legacy = {
    projectionId: queued.deliveryProjectionId,
    subOperationId: queued.deliverySubOperationId,
  };
  const canonicalProjection = {
    projectionId: canonical.projectionId,
    subOperationId: canonical.subOperationId,
  };
  const initialBody =
    receiptState === 'both'
      ? bodyWith([legacy, canonicalProjection])
      : receiptState === 'legacy-only'
        ? bodyWith([legacy])
        : receiptState === 'canonical-only'
          ? bodyWith([canonicalProjection])
          : EMPTY_BODY;
  return remote(initialBody);
}

function upgradeProjectionContext(dir, queuePath, remoteState) {
  return {
    projectDir: dir,
    queuePath,
    postTimingQueueAliasProjection: (input) =>
      postTransitionTimingQueueAliasProjection({
        ...input,
        deps: remoteState.deps,
      }),
    readTimingQueueAliasProjection: (input) =>
      readTransitionTimingQueueAliasProjection({
        ...input,
        deps: remoteState.deps,
      }),
    postTimingProjection: async () => ({ status: 'posted' }),
    readTimingProjection: async ({ projectionId }) => ({
      reconciled: true,
      projectionId,
    }),
    removeExactQueueEntries,
  };
}

test('pre-upgrade journal identity is accepted only as an exact canonical alias', () => {
  const resolved = resolveTimingQueueJournalProjection(legacyJournal());
  assert.equal(resolved.mode, 'legacy-switch-alias');
  assert.deepEqual(
    {
      projectionId: resolved.deliveryProjectionId,
      subOperationId: resolved.deliverySubOperationId,
    },
    canonicalTimingQueueProjection(ENTRY)
  );
  for (const corrupt of [
    { journalProjectionId: 'attacker' },
    { journalSubOperationId: `${LEGACY_SUB_OPERATION_ID}0` },
    { entryIndex: 1 },
    { entry: { ...ENTRY, row: `${ROW} ` } },
  ]) {
    assert.throws(
      () => resolveTimingQueueJournalProjection({ ...legacyJournal(), ...corrupt }),
      /journal projection identity does not match/
    );
  }
});

for (const state of ['legacy-only', 'canonical-only', 'neither']) {
  test(`sealed alias recovery adopts ${state} without a second remote effect`, async () => {
    const dir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-upgrade-alias-'));
    try {
      const { authority, resolved } = aliasAuthority();
      const legacy = {
        projectionId: SWITCH_PROJECTION_ID,
        subOperationId: LEGACY_SUB_OPERATION_ID,
      };
      const canonical = {
        projectionId: resolved.deliveryProjectionId,
        subOperationId: resolved.deliverySubOperationId,
      };
      const remoteState = remote(
        state === 'legacy-only'
          ? bodyWith([legacy])
          : state === 'canonical-only'
            ? bodyWith([canonical])
            : EMPTY_BODY
      );
      const call = aliasCall(authority, resolved, remoteState.deps, dir);
      const result = await postTransitionTimingQueueAliasProjection(call);
      const proof = await readTransitionTimingQueueAliasProjection(call);

      assert.equal(
        result.adoptedProjectionId,
        state === 'legacy-only' ? legacy.projectionId : canonical.projectionId
      );
      assert.equal(proof.reconciled, true);
      assert.equal(proof.projectionId, SWITCH_PROJECTION_ID);
      assert.equal(remoteState.writes(), state === 'neither' ? 1 : 0);
      assert.equal(
        parseTimingProjectionReceipts(remoteState.body()).length,
        1,
        'one receipt family must represent the one remote effect'
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

for (const state of [
  'both',
  'legacy-mismatch',
  'canonical-mismatch',
  'legacy-duplicate',
  'canonical-duplicate',
]) {
  test(`sealed alias recovery fails closed for ${state}`, async () => {
    const dir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-upgrade-alias-bad-'));
    try {
      const { authority, resolved } = aliasAuthority();
      const legacy = {
        projectionId: SWITCH_PROJECTION_ID,
        subOperationId: LEGACY_SUB_OPERATION_ID,
      };
      const canonical = {
        projectionId: resolved.deliveryProjectionId,
        subOperationId: resolved.deliverySubOperationId,
      };
      const family = state.startsWith('legacy') ? legacy : canonical;
      let body =
        state === 'both'
          ? bodyWith([legacy, canonical])
          : bodyWith([
              {
                ...family,
                row: state.endsWith('mismatch')
                  ? ROW.replace('queued source work', 'tampered source work')
                  : ROW,
              },
            ]);
      if (state.endsWith('duplicate')) {
        const receiptRow = body.split('\n').find((line) => line.includes('work-lease-projection'));
        body = `${body.trimEnd()}\n${receiptRow}`;
      }
      const remoteState = remote(body);
      const before = remoteState.body();
      await assert.rejects(
        () =>
          postTransitionTimingQueueAliasProjection(
            aliasCall(authority, resolved, remoteState.deps, dir)
          ),
        /timing queue alias/
      );
      assert.equal(remoteState.writes(), 0);
      assert.equal(remoteState.body(), before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('ordinary callers cannot forge or select a timing queue alias', async () => {
  const { resolved } = aliasAuthority();
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-upgrade-alias-proof-'));
  try {
    await assert.rejects(
      () =>
        postTransitionTimingQueueAliasProjection(
          aliasCall(Object.freeze({}), resolved, remote(EMPTY_BODY).deps, dir)
        ),
      (error) => isTransitionProjectionAuthorityError(error)
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('byte-exact pre-upgrade switch journal replays once and clears after upgrade', async () => {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-upgrade-journal-'));
  const priorProjectDir = process.env.AI_TASK_MANAGER_PROJECT_DIR;
  try {
    mkdirSync(UPGRADE_PROJECT_DIR, { recursive: true });
    process.env.AI_TASK_MANAGER_PROJECT_DIR = UPGRADE_PROJECT_DIR;
    const fixture = readUpgradeFixture();
    const journalPath = activeTaskPath('session-1', dir);
    mkdirSync(path.dirname(journalPath), { recursive: true });
    writeFileSync(journalPath, fixture.bytes);
    assert.deepEqual(readFileSync(journalPath), fixture.bytes, 'restart begins byte-exact');

    const queued =
      fixture.value.workLeaseIntent.projections.timing.input.queuedSourceEntries[0].entry;
    const queuePath = path.join(dir, 'timing-queue.json');
    writeFileSync(queuePath, `${JSON.stringify([queued], null, 2)}\n`);
    const remoteState = upgradeRemote(fixture.value);
    const ctx = upgradeProjectionContext(dir, queuePath, remoteState);
    const persistedRequest = JSON.parse(fixture.value.workLeaseIntent.canonicalRequest);
    const persistedReceipt = fixture.value.workLeaseIntent.receipt;
    const projectionInputs = Object.fromEntries(
      Object.entries(fixture.value.workLeaseIntent.projections).map(([name, projection]) => [
        name,
        projection.input,
      ])
    );
    const projections = {
      session: async () => assert.fail('completed session projection must not replay'),
      fleet: async () => assert.fail('completed fleet projection must not replay'),
      timing: (options) => applyTimingProjection(ctx, options),
      github: async ({ projectionName, projectionId }) => ({
        reconciled: true,
        projectionName,
        projectionId,
      }),
    };
    const result = await coordinateWorkLeaseSwitch({
      sourceIssueId: '1049',
      targetIssueId: '1051',
      sessionId: 'session-1',
      projectDir: dir,
      hostId: 'host-1',
      provider: 'codex',
      agentRunId: 'run-1',
      pid: 123,
      branch: 'feature/child/1049',
      getStore: async () => ({
        projectId: 'project-1',
        switchLease: async () => assert.fail('persisted receipt must not replay authority'),
        verify: async () => ({ allowed: true, lease: persistedReceipt.lease }),
      }),
      preparedEligibility: {
        ok: true,
        claimRequired: false,
        currentUser: 'worker',
        assignees: ['worker'],
      },
      readEligibility: async () =>
        assert.fail('committed forward phase must not reopen target eligibility'),
      reconcileClaim: async () => assert.fail('persisted claim proof must not replay'),
      projectionInputs,
      projectionContext: {
        statePath: '/projection/state',
        markerPath: '/projection/word-marker',
        pendingPausePath: '/projection/pending-pause',
        displayPath: '/repo/worktree-1',
        sourceState: {
          active: '#1049',
          lastActive: '#1049',
          entryStartTs: '2026-07-30T11:45:00.000Z',
          wordsAtEntryStart: 12,
        },
      },
      projections,
      resolveWorktreeIdentity: async () => ({
        worktreeId: persistedRequest.target.holder.worktreeId,
        pathHash: persistedRequest.target.holder.pathHash,
        displayPath: '/repo/worktree-1',
      }),
      now: () => new Date('2026-07-30T12:00:00.000Z'),
      randomUUID: () => assert.fail('restart must not create a request'),
    });

    assert.equal(result.receipt.transition.transitionId, 'transition-forward');
    assert.deepEqual(peek(queuePath), []);
    assert.equal(getActiveTask('session-1', dir).workLeaseIntent, undefined);
    assert.equal(remoteState.writes(), 1);
    assert.equal(parseTimingProjectionReceipts(remoteState.body()).length, 1);
  } finally {
    if (priorProjectDir === undefined) delete process.env.AI_TASK_MANAGER_PROJECT_DIR;
    else process.env.AI_TASK_MANAGER_PROJECT_DIR = priorProjectDir;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('upgrade alias refusal preserves exact queue and journal bytes', async () => {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-upgrade-refusal-'));
  try {
    const fixture = readUpgradeFixture();
    const intent = fixture.value.workLeaseIntent;
    const timing = intent.projections.timing;
    const queued = timing.input.queuedSourceEntries[0].entry;
    const queuePath = path.join(dir, 'timing-queue.json');
    const queueBytes = Buffer.from(`${JSON.stringify([queued], null, 2)}\n`);
    writeFileSync(queuePath, queueBytes);
    const journalPath = path.join(dir, 'journal.json');
    writeFileSync(journalPath, fixture.bytes);
    const remoteState = upgradeRemote(fixture.value, 'both');
    const ctx = upgradeProjectionContext(dir, queuePath, remoteState);

    await assert.rejects(
      () =>
        applyTimingProjection(ctx, {
          input: timing.input,
          projectionId: timing.projectionId,
          receipt: intent.receipt,
          request: JSON.parse(intent.canonicalRequest),
          transitionId: intent.transitionId,
        }),
      /timing queue alias/
    );
    assert.deepEqual(readFileSync(queuePath), queueBytes);
    assert.deepEqual(readFileSync(journalPath), fixture.bytes);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('generic drain owns the legacy queue entry before sealed upgrade recovery', async () => {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-upgrade-generic-first-'));
  try {
    const fixture = readUpgradeFixture().value;
    const intent = fixture.workLeaseIntent;
    const timing = intent.projections.timing;
    const queued = timing.input.queuedSourceEntries[0].entry;
    const queuePath = path.join(dir, 'timing-queue.json');
    writeFileSync(queuePath, `${JSON.stringify([queued], null, 2)}\n`);
    const remoteState = upgradeRemote(fixture);
    const snapshotReached = deferred();
    const resumeGeneric = deferred();
    const generic = drain(async (event) => {
      snapshotReached.resolve();
      await resumeGeneric.promise;
      await postRuntimeQueuedTimingEvent(event, {
        repo: 'owner/repo',
        timeoutMs: 2000,
        withGovernedEffect: async (_options, callback) => callback(),
        post: remoteState.post,
        read: remoteState.read,
      });
    }, queuePath);
    await snapshotReached.promise;

    let sealedSettled = false;
    const sealed = applyTimingProjection(upgradeProjectionContext(dir, queuePath, remoteState), {
      input: timing.input,
      projectionId: timing.projectionId,
      receipt: intent.receipt,
      request: JSON.parse(intent.canonicalRequest),
      transitionId: intent.transitionId,
    }).finally(() => {
      sealedSettled = true;
    });
    await waitForLockAttempt();
    assert.equal(sealedSettled, false, 'sealed recovery must wait for the generic drain claim');

    resumeGeneric.resolve();
    assert.equal(await generic, true);
    assert.equal((await sealed).reconciled, true);
    assert.equal(remoteState.writes(), 1);
    assert.equal(parseTimingProjectionReceipts(remoteState.body()).length, 1);
    assert.deepEqual(peek(queuePath), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sealed upgrade recovery owns the legacy queue entry before generic drain', async () => {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-upgrade-sealed-first-'));
  try {
    const fixture = readUpgradeFixture().value;
    const intent = fixture.workLeaseIntent;
    const timing = intent.projections.timing;
    const queued = timing.input.queuedSourceEntries[0].entry;
    const queuePath = path.join(dir, 'timing-queue.json');
    writeFileSync(queuePath, `${JSON.stringify([queued], null, 2)}\n`);
    const remoteState = upgradeRemote(fixture);
    const aliasPostReached = deferred();
    const resumeSealed = deferred();
    const ctx = upgradeProjectionContext(dir, queuePath, remoteState);
    const postAlias = ctx.postTimingQueueAliasProjection;
    ctx.postTimingQueueAliasProjection = async (input) => {
      aliasPostReached.resolve();
      await resumeSealed.promise;
      return postAlias(input);
    };
    const sealed = applyTimingProjection(ctx, {
      input: timing.input,
      projectionId: timing.projectionId,
      receipt: intent.receipt,
      request: JSON.parse(intent.canonicalRequest),
      transitionId: intent.transitionId,
    });
    await aliasPostReached.promise;

    let genericHandled = false;
    const generic = drain(async () => {
      genericHandled = true;
    }, queuePath);
    await waitForLockAttempt();
    assert.equal(genericHandled, false, 'generic drain must wait for sealed recovery');

    resumeSealed.resolve();
    assert.equal((await sealed).reconciled, true);
    assert.equal(await generic, true);
    assert.equal(genericHandled, false, 'sealed recovery removes the exact queue entry first');
    assert.equal(remoteState.writes(), 1);
    assert.equal(parseTimingProjectionReceipts(remoteState.body()).length, 1);
    assert.deepEqual(peek(queuePath), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
