// @story #1049

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { canonicalRequestDigest } from '@kburson/aitm-ledger';

import * as timingGh from '../../../gh-timing-comment.mjs';
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
  authenticateTransitionMutationCommit,
  deriveTransitionTimingQueueAliasAuthority,
  deriveTransitionTimingQueueAliasCollisionGroupAuthority,
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
let STANDARD_COMMIT_AUTHORITY;

function switchAuthorityFixture() {
  const displayPath = '/repo/worktree-1';
  const sourceHolder = {
    principalKind: 'worker',
    provider: 'codex',
    agentRunId: 'run-1',
    sessionId: 'session-1',
    hostId: 'host-1',
    pid: 123,
    worktreeId: 'worktree-1',
    pathHash: createHash('sha256').update(displayPath).digest('hex'),
    branch: 'feature/child/1049',
  };
  const targetHolder = { ...sourceHolder };
  const sourceBinding = {
    sessionId: 'session-1',
    issueId: '1048',
    worktreeId: 'worktree-1',
    displayPath,
  };
  const targetBinding = {
    ...sourceBinding,
    issueId: '1049',
  };
  return {
    commitAuthority: STANDARD_COMMIT_AUTHORITY,
    transitionId: 'transition-1',
    request: {
      projectId: 'project-1',
      issueId: '1048',
      leaseId: 'source-lease',
      fencingToken: '7',
      holder: sourceHolder,
      binding: sourceBinding,
      idempotencyKey: 'switch:session-1:1048:1049:request-1',
      switchedAt: '2026-07-30T12:00:00.000Z',
      target: {
        projectId: 'project-1',
        issueId: '1049',
        mode: 'write',
        idempotencyKey: 'switch-target:session-1:1049:request-1',
        requestedAt: '2026-07-30T12:00:00.000Z',
        ttlMs: 900_000,
        holder: targetHolder,
        binding: targetBinding,
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
        holder: targetHolder,
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

{
  const { request, receipt, transitionId } = switchAuthorityFixture();
  STANDARD_COMMIT_AUTHORITY = await authenticateTransitionMutationCommit({
    store: {
      replayMutation: async (selector) => ({
        selector,
        outcome: 'committed',
        statusCode: 200,
        result: receipt,
      }),
    },
    rawRequest: request,
    request,
    receipt,
    transitionId,
  });
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
const collisionUpgradeFixturePath = new URL(
  '../../fixtures/pre-canonical-timing-queue-collision-intent.json',
  import.meta.url
);
const COLLISION_FIXTURE_SHA256 = 'b4095d244141d28a974b3c9baa6c7958b054b22b83c6af391792c51fca5fdffd';

function readUpgradeFixture() {
  const bytes = readFileSync(upgradeFixturePath);
  return { bytes, value: JSON.parse(bytes) };
}

function readCollisionUpgradeFixture() {
  const bytes = readFileSync(collisionUpgradeFixturePath);
  return { bytes, value: JSON.parse(bytes) };
}

function historicalTargetBinding(intent) {
  const request = JSON.parse(intent.canonicalRequest);
  return {
    projectId: request.projectId,
    leaseId: intent.receipt.lease.leaseId,
    fencingToken: intent.receipt.lease.fencingToken,
    sessionId: request.target.holder.sessionId,
    issueId: request.target.issueId,
    worktreeId: request.target.holder.worktreeId,
    displayPath: '/repo/worktree-1',
  };
}

function historicalObservation(intent, { leases, bindings } = {}) {
  return {
    leases: leases ?? [structuredClone(intent.receipt.lease)],
    bindings: bindings ?? [historicalTargetBinding(intent)],
  };
}

async function historicalProjectionAuthority(intent) {
  const rawRequest = JSON.parse(intent.canonicalRequest);
  const displayPath = '/repo/worktree-1';
  const request = {
    ...rawRequest,
    holder: { ...rawRequest.target.holder },
    binding: {
      sessionId: rawRequest.target.holder.sessionId,
      issueId: rawRequest.issueId,
      worktreeId: rawRequest.target.holder.worktreeId,
      displayPath,
    },
    target: {
      ...rawRequest.target,
      binding: {
        sessionId: rawRequest.target.holder.sessionId,
        issueId: rawRequest.target.issueId,
        worktreeId: rawRequest.target.holder.worktreeId,
        displayPath,
      },
    },
  };
  const commitAuthority = await authenticateTransitionMutationCommit({
    store: {
      replayMutation: async (selector) => ({
        selector,
        outcome: 'committed',
        statusCode: 200,
        result: intent.receipt,
      }),
    },
    rawRequest,
    request,
    receipt: intent.receipt,
    transitionId: intent.transitionId,
  });
  return { request, receipt: intent.receipt, transitionId: intent.transitionId, commitAuthority };
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
    reconcileTimingQueueAliasCollisionGroupProjection: (input) =>
      timingGh.reconcileTransitionTimingQueueAliasCollisionGroupProjection({
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

function collisionRemote(fixture, state) {
  const queued = fixture.workLeaseIntent.projections.timing.input.queuedSourceEntries;
  const legacy = queued.map((item) => ({
    projectionId: item.deliveryProjectionId,
    subOperationId: item.deliverySubOperationId,
  }));
  const canonical = canonicalTimingQueueProjection(queued[0].entry);
  let body =
    state === 'legacy'
      ? bodyWith(legacy)
      : state === 'canonical'
        ? bodyWith([canonical])
        : state === 'mixed'
          ? bodyWith([canonical, legacy[0]])
          : state === 'partial-legacy'
            ? bodyWith([legacy[0]])
            : state === 'legacy-mismatch'
              ? bodyWith([
                  legacy[0],
                  {
                    ...legacy[1],
                    row: ROW.replace('queued source work', 'tampered source work'),
                  },
                ])
              : state === 'canonical-mismatch'
                ? bodyWith([
                    {
                      ...canonical,
                      row: ROW.replace('queued source work', 'tampered source work'),
                    },
                  ])
                : EMPTY_BODY;
  if (state === 'duplicate-canonical' || state === 'duplicate-legacy') {
    body = state === 'duplicate-canonical' ? bodyWith([canonical]) : bodyWith(legacy);
    const receiptRow = body.split('\n').find((line) => line.includes('work-lease-projection'));
    body = `${body.trimEnd()}\n${receiptRow}`;
  }
  return remote(body);
}

function collisionMembers(fixture) {
  const timing = fixture.workLeaseIntent.projections.timing;
  return timing.input.queuedSourceEntries.map((item, entryIndex) => {
    const canonical = canonicalTimingQueueProjection(item.entry);
    return {
      entry: item.entry,
      entryIndex,
      switchProjectionId: timing.projectionId,
      journalProjectionId: item.deliveryProjectionId,
      journalSubOperationId: item.deliverySubOperationId,
      deliveryProjectionId: canonical.projectionId,
      deliverySubOperationId: canonical.subOperationId,
      issueId: String(item.entry.issue).replace(/^#/, ''),
    };
  });
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
    const authorityOrder = [];
    const projectionInputs = Object.fromEntries(
      Object.entries(fixture.value.workLeaseIntent.projections).map(([name, projection]) => [
        name,
        projection.input,
      ])
    );
    const projections = {
      session: async () => assert.fail('completed session projection must not replay'),
      fleet: async () => assert.fail('completed fleet projection must not replay'),
      timing: (options) => {
        authorityOrder.push('timing');
        assert.deepEqual(authorityOrder.slice(0, 2), ['replay', 'verify']);
        return applyTimingProjection(ctx, options);
      },
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
        replayMutation: async (selector) => {
          authorityOrder.push('replay');
          assert.equal(selector.requestDigest, canonicalRequestDigest(persistedRequest));
          return { selector, outcome: 'committed', statusCode: 200, result: persistedReceipt };
        },
        verify: async (verifyRequest) => {
          authorityOrder.push('verify');
          assert.deepEqual(authorityOrder, ['replay', 'verify']);
          assert.deepEqual(verifyRequest.holder, persistedRequest.target.holder);
          assert.deepEqual(verifyRequest.binding, {
            sessionId: 'session-1',
            issueId: '1051',
            worktreeId: 'wt:v1:worktree-1',
            displayPath: '/repo/worktree-1',
          });
          return { allowed: true, lease: persistedReceipt.lease };
        },
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
    assert.deepEqual(authorityOrder.slice(0, 3), ['replay', 'verify', 'timing']);
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
      async () =>
        applyTimingProjection(ctx, {
          ...(await historicalProjectionAuthority(intent)),
          input: timing.input,
          projectionId: timing.projectionId,
        }),
      /timing queue alias/
    );
    assert.deepEqual(readFileSync(queuePath), queueBytes);
    assert.deepEqual(readFileSync(journalPath), fixture.bytes);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('byte-exact pre-upgrade collision fixture has distinct old identities and one canonical identity', () => {
  const fixture = readCollisionUpgradeFixture();
  assert.equal(createHash('sha256').update(fixture.bytes).digest('hex'), COLLISION_FIXTURE_SHA256);
  const queued = fixture.value.workLeaseIntent.projections.timing.input.queuedSourceEntries;
  assert.equal(queued.length, 2);
  assert.notEqual(queued[0].entry.queuedAt, queued[1].entry.queuedAt);
  assert.notEqual(queued[0].deliverySubOperationId, queued[1].deliverySubOperationId);
  assert.deepEqual(
    canonicalTimingQueueProjection(queued[0].entry),
    canonicalTimingQueueProjection(queued[1].entry)
  );
  for (const [entryIndex, item] of queued.entries()) {
    assert.equal(
      resolveTimingQueueJournalProjection({
        entry: item.entry,
        entryIndex,
        switchProjectionId: fixture.value.workLeaseIntent.projections.timing.projectionId,
        journalProjectionId: item.deliveryProjectionId,
        journalSubOperationId: item.deliverySubOperationId,
      }).mode,
      'legacy-switch-alias'
    );
  }
  assert.deepEqual(
    fixture.value.workLeaseIntent.projections.github.input.switch.issueTimeExpected,
    readUpgradeFixture().value.workLeaseIntent.projections.github.input.switch.issueTimeExpected,
    'the historical duplicate row does not change its persisted issue-time expectation'
  );
  assert.equal(fixture.bytes.at(-1), 10, 'fixture retains the historical final newline');
});

test('ordinary callers cannot forge or alter the sealed collision member list', async () => {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-upgrade-collision-proof-'));
  try {
    const fixture = readCollisionUpgradeFixture().value;
    const intent = fixture.workLeaseIntent;
    const members = collisionMembers(fixture);
    const canonical = canonicalTimingQueueProjection(members[0].entry);
    const authority = deriveTransitionTimingQueueAliasCollisionGroupAuthority({
      ...(await historicalProjectionAuthority(intent)),
      members,
    });
    const remoteState = collisionRemote(fixture, 'neither');
    const call = {
      collisionAuthority: authority,
      transitionId: intent.transitionId,
      projectionName: 'timing',
      members,
      projectionId: canonical.projectionId,
      subOperationId: canonical.subOperationId,
      issueNumber: '1049',
      repo: 'owner/repo',
      row: members[0].entry.row,
      projDir: dir,
      retries: 0,
      deps: remoteState.deps,
    };

    await assert.rejects(
      () =>
        timingGh.reconcileTransitionTimingQueueAliasCollisionGroupProjection({
          ...call,
          collisionAuthority: Object.freeze({}),
        }),
      (error) => isTransitionProjectionAuthorityError(error)
    );
    await assert.rejects(
      () =>
        timingGh.reconcileTransitionTimingQueueAliasCollisionGroupProjection({
          ...call,
          members: [...members].reverse(),
        }),
      (error) => isTransitionProjectionAuthorityError(error)
    );
    const zeroEffectDeps = {
      findTimingComment: async () => assert.fail('coordinate drift must precede remote read'),
      createTimingComment: async () => assert.fail('coordinate drift must precede remote create'),
      updateTimingComment: async () => assert.fail('coordinate drift must precede remote update'),
      readTimingCommentBody: async () =>
        assert.fail('coordinate drift must precede remote read-back'),
    };
    for (const coordinates of [
      { issueNumber: '1051' },
      { issueNumber: '9999' },
      { row: `${call.row} ` },
      { projectionId: `${call.projectionId}:attacker` },
      { subOperationId: `${call.subOperationId}:attacker` },
    ]) {
      await assert.rejects(
        () =>
          timingGh.reconcileTransitionTimingQueueAliasCollisionGroupProjection({
            ...call,
            ...coordinates,
            deps: zeroEffectDeps,
          }),
        (error) => isTransitionProjectionAuthorityError(error)
      );
    }
    assert.equal(remoteState.writes(), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

for (const state of ['legacy', 'canonical', 'neither']) {
  test(`sealed collision group recovers from ${state} receipts`, async () => {
    const dir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-upgrade-collision-'));
    try {
      const fixture = readCollisionUpgradeFixture().value;
      const intent = fixture.workLeaseIntent;
      const timing = intent.projections.timing;
      const entries = timing.input.queuedSourceEntries.map((item) => item.entry);
      const queuePath = path.join(dir, 'timing-queue.json');
      writeFileSync(queuePath, `${JSON.stringify(entries, null, 2)}\n`);
      const remoteState = collisionRemote(fixture, state);

      const result = await applyTimingProjection(
        upgradeProjectionContext(dir, queuePath, remoteState),
        {
          ...(await historicalProjectionAuthority(intent)),
          input: timing.input,
          projectionId: timing.projectionId,
        }
      );

      assert.equal(result.reconciled, true);
      assert.equal(remoteState.writes(), state === 'neither' ? 1 : 0);
      assert.equal(
        parseTimingProjectionReceipts(remoteState.body()).length,
        state === 'legacy' ? 2 : 1
      );
      assert.deepEqual(peek(queuePath), []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('byte-exact pre-upgrade collision journal replays once and clears after upgrade', async () => {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-upgrade-collision-journal-'));
  const priorProjectDir = process.env.AI_TASK_MANAGER_PROJECT_DIR;
  try {
    mkdirSync(UPGRADE_PROJECT_DIR, { recursive: true });
    process.env.AI_TASK_MANAGER_PROJECT_DIR = UPGRADE_PROJECT_DIR;
    const fixture = readCollisionUpgradeFixture();
    const intent = fixture.value.workLeaseIntent;
    const journalPath = activeTaskPath('session-1', dir);
    mkdirSync(path.dirname(journalPath), { recursive: true });
    writeFileSync(journalPath, fixture.bytes);
    assert.deepEqual(readFileSync(journalPath), fixture.bytes, 'restart begins byte-exact');

    const entries = intent.projections.timing.input.queuedSourceEntries.map((item) => item.entry);
    const queuePath = path.join(dir, 'timing-queue.json');
    writeFileSync(queuePath, `${JSON.stringify(entries, null, 2)}\n`);
    const remoteState = collisionRemote(fixture.value, 'neither');
    const ctx = upgradeProjectionContext(dir, queuePath, remoteState);
    const persistedRequest = JSON.parse(intent.canonicalRequest);
    const projectionInputs = Object.fromEntries(
      Object.entries(intent.projections).map(([name, projection]) => [name, projection.input])
    );
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
        replayMutation: async (selector) => ({
          selector,
          outcome: 'committed',
          statusCode: 200,
          result: intent.receipt,
        }),
        verify: async () => ({ allowed: true, lease: intent.receipt.lease }),
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
      projections: {
        session: async () => assert.fail('completed session projection must not replay'),
        fleet: async () => assert.fail('completed fleet projection must not replay'),
        timing: (options) => applyTimingProjection(ctx, options),
        github: async ({ projectionName, projectionId }) => ({
          reconciled: true,
          projectionName,
          projectionId,
        }),
      },
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

test('collision group retains every exact queue member until remote read-back succeeds', async () => {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-upgrade-collision-readback-'));
  try {
    const fixture = readCollisionUpgradeFixture();
    const intent = fixture.value.workLeaseIntent;
    const timing = intent.projections.timing;
    const entries = timing.input.queuedSourceEntries.map((item) => item.entry);
    const queuePath = path.join(dir, 'timing-queue.json');
    const queueBytes = Buffer.from(`${JSON.stringify(entries, null, 2)}\n`);
    writeFileSync(queuePath, queueBytes);
    const journalPath = path.join(dir, 'journal.json');
    writeFileSync(journalPath, fixture.bytes);
    const remoteState = collisionRemote(fixture.value, 'neither');
    const read = remoteState.deps.readTimingCommentBody;
    remoteState.deps.readTimingCommentBody = async () => ({
      status: 'error',
      body: '',
      error: new Error('read response lost'),
    });
    const ctx = upgradeProjectionContext(dir, queuePath, remoteState);
    const options = {
      ...(await historicalProjectionAuthority(intent)),
      input: timing.input,
      projectionId: timing.projectionId,
    };

    await assert.rejects(
      () => applyTimingProjection(ctx, options),
      /collision read-back is unavailable/
    );
    assert.equal(remoteState.writes(), 1, 'the canonical remote effect was committed');
    assert.deepEqual(readFileSync(queuePath), queueBytes);
    assert.deepEqual(readFileSync(journalPath), fixture.bytes);

    remoteState.deps.readTimingCommentBody = read;
    assert.equal((await applyTimingProjection(ctx, options)).reconciled, true);
    assert.equal(remoteState.writes(), 1, 'retry adopts the exact canonical receipt');
    assert.deepEqual(peek(queuePath), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

for (const state of [
  'mixed',
  'partial-legacy',
  'legacy-mismatch',
  'canonical-mismatch',
  'duplicate-legacy',
  'duplicate-canonical',
]) {
  test(`sealed collision group refuses ${state} receipts without local mutation`, async () => {
    const dir = mkdtempSync(
      path.join(projectScratchDir('test'), 'aitm-upgrade-collision-refusal-')
    );
    try {
      const fixture = readCollisionUpgradeFixture();
      const intent = fixture.value.workLeaseIntent;
      const timing = intent.projections.timing;
      const entries = timing.input.queuedSourceEntries.map((item) => item.entry);
      const queuePath = path.join(dir, 'timing-queue.json');
      const queueBytes = Buffer.from(`${JSON.stringify(entries, null, 2)}\n`);
      writeFileSync(queuePath, queueBytes);
      const journalPath = path.join(dir, 'journal.json');
      writeFileSync(journalPath, fixture.bytes);
      const remoteState = collisionRemote(fixture.value, state);
      const remoteBefore = remoteState.body();

      await assert.rejects(
        async () =>
          applyTimingProjection(upgradeProjectionContext(dir, queuePath, remoteState), {
            ...(await historicalProjectionAuthority(intent)),
            input: timing.input,
            projectionId: timing.projectionId,
          }),
        /timing queue|persisted timing source/
      );
      assert.equal(remoteState.writes(), 0);
      assert.equal(remoteState.body(), remoteBefore);
      assert.deepEqual(readFileSync(queuePath), queueBytes);
      assert.deepEqual(readFileSync(journalPath), fixture.bytes);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

for (const mutation of ['mixed-journal', 'forged-journal', 'ordinary-canonical']) {
  test(`collision grandfather refuses ${mutation} members before remote effects`, async () => {
    const dir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-upgrade-collision-member-'));
    try {
      const fixture = readCollisionUpgradeFixture().value;
      const intent = fixture.workLeaseIntent;
      const timing = structuredClone(intent.projections.timing);
      const canonical = canonicalTimingQueueProjection(timing.input.queuedSourceEntries[0].entry);
      const second = timing.input.queuedSourceEntries[1];
      if (mutation === 'forged-journal') {
        second.deliverySubOperationId = `${second.deliverySubOperationId}0`;
      } else {
        second.entry.projectionId = canonical.projectionId;
        second.entry.subOperationId = canonical.subOperationId;
        second.deliveryProjectionId = canonical.projectionId;
        second.deliverySubOperationId = canonical.subOperationId;
        if (mutation === 'ordinary-canonical') {
          const first = timing.input.queuedSourceEntries[0];
          first.entry.projectionId = canonical.projectionId;
          first.entry.subOperationId = canonical.subOperationId;
          first.deliveryProjectionId = canonical.projectionId;
          first.deliverySubOperationId = canonical.subOperationId;
        }
      }
      const entries = timing.input.queuedSourceEntries.map((item) => item.entry);
      const queuePath = path.join(dir, 'timing-queue.json');
      writeFileSync(queuePath, `${JSON.stringify(entries, null, 2)}\n`);
      let remoteCalls = 0;
      const ctx = upgradeProjectionContext(dir, queuePath, collisionRemote(fixture, 'neither'));
      ctx.postTimingQueueAliasProjection = async () => {
        remoteCalls += 1;
      };
      ctx.reconcileTimingQueueAliasCollisionGroupProjection = async () => {
        remoteCalls += 1;
      };

      await assert.rejects(
        async () =>
          applyTimingProjection(ctx, {
            ...(await historicalProjectionAuthority(intent)),
            input: timing.input,
            projectionId: timing.projectionId,
          }),
        /persisted timing source queue entry is malformed/
      );
      assert.equal(remoteCalls, 0);
      assert.deepEqual(peek(queuePath), entries);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

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
      ...(await historicalProjectionAuthority(intent)),
      input: timing.input,
      projectionId: timing.projectionId,
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
      ...(await historicalProjectionAuthority(intent)),
      input: timing.input,
      projectionId: timing.projectionId,
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

test('generic drain owns a legacy collision group before sealed recovery', async () => {
  const dir = mkdtempSync(
    path.join(projectScratchDir('test'), 'aitm-upgrade-collision-generic-first-')
  );
  try {
    const fixture = readCollisionUpgradeFixture().value;
    const intent = fixture.workLeaseIntent;
    const timing = intent.projections.timing;
    const entries = timing.input.queuedSourceEntries.map((item) => item.entry);
    const queuePath = path.join(dir, 'timing-queue.json');
    writeFileSync(queuePath, `${JSON.stringify(entries, null, 2)}\n`);
    const remoteState = collisionRemote(fixture, 'neither');
    const snapshotReached = deferred();
    const resumeGeneric = deferred();
    let first = true;
    const generic = drain(async (event) => {
      if (first) {
        first = false;
        snapshotReached.resolve();
        await resumeGeneric.promise;
      }
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
      ...(await historicalProjectionAuthority(intent)),
      input: timing.input,
      projectionId: timing.projectionId,
    }).finally(() => {
      sealedSettled = true;
    });
    await waitForLockAttempt();
    assert.equal(
      sealedSettled,
      false,
      'sealed collision recovery must wait for the generic drain claim'
    );

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

test('sealed recovery owns a legacy collision group before generic drain', async () => {
  const dir = mkdtempSync(
    path.join(projectScratchDir('test'), 'aitm-upgrade-collision-sealed-first-')
  );
  try {
    const fixture = readCollisionUpgradeFixture().value;
    const intent = fixture.workLeaseIntent;
    const timing = intent.projections.timing;
    const entries = timing.input.queuedSourceEntries.map((item) => item.entry);
    const queuePath = path.join(dir, 'timing-queue.json');
    writeFileSync(queuePath, `${JSON.stringify(entries, null, 2)}\n`);
    const remoteState = collisionRemote(fixture, 'neither');
    const collisionPostReached = deferred();
    const resumeSealed = deferred();
    const ctx = upgradeProjectionContext(dir, queuePath, remoteState);
    const reconcileCollision = ctx.reconcileTimingQueueAliasCollisionGroupProjection;
    ctx.reconcileTimingQueueAliasCollisionGroupProjection = async (input) => {
      collisionPostReached.resolve();
      await resumeSealed.promise;
      return reconcileCollision(input);
    };
    const sealed = applyTimingProjection(ctx, {
      ...(await historicalProjectionAuthority(intent)),
      input: timing.input,
      projectionId: timing.projectionId,
    });
    await collisionPostReached.promise;

    let genericHandled = false;
    const generic = drain(async () => {
      genericHandled = true;
    }, queuePath);
    await waitForLockAttempt();
    assert.equal(genericHandled, false, 'generic drain must wait for sealed collision recovery');

    resumeSealed.resolve();
    assert.equal((await sealed).reconciled, true);
    assert.equal(await generic, true);
    assert.equal(
      genericHandled,
      false,
      'sealed collision recovery removes every exact member first'
    );
    assert.equal(remoteState.writes(), 1);
    assert.equal(parseTimingProjectionReceipts(remoteState.body()).length, 1);
    assert.deepEqual(peek(queuePath), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
