import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { initializedProtocol } from './co-review-fixture.mjs';

function stageClaimPublicationWindow({ api, root, options }) {
  const statePath = path.join(root, options.dir, 'state.json');
  const lockPath = path.join(root, options.dir, '.co-review-lock');
  const priorState = readFileSync(statePath, 'utf8');
  const settled = api.claimTurn({ cwd: root, dir: options.dir, actor: 'owner-agent' });
  const settledState = readFileSync(statePath, 'utf8');
  writeFileSync(statePath, priorState);
  mkdirSync(lockPath);
  writeFileSync(
    path.join(lockPath, 'owner.json'),
    `${JSON.stringify({
      actor: 'owner-agent',
      command: 'claim',
      pid: 1234,
      host: 'test-host',
      at: '2026-08-19T00:00:00.000Z',
    })}\n`
  );
  return {
    settled,
    publishState() {
      writeFileSync(statePath, settledState);
    },
    publish() {
      writeFileSync(statePath, settledState);
      rmSync(lockPath, { recursive: true });
    },
    releaseLock() {
      rmSync(lockPath, { recursive: true });
    },
  };
}

function stageTwoPublications(fixture) {
  const statePath = path.join(fixture.root, fixture.options.dir, 'state.json');
  const eventsPath = path.join(fixture.root, fixture.options.dir, 'events.jsonl');
  const baseState = readFileSync(statePath, 'utf8');
  const baseEvents = readFileSync(eventsPath, 'utf8');
  fixture.api.claimTurn({
    cwd: fixture.root,
    dir: fixture.options.dir,
    actor: 'owner-agent',
  });
  const firstState = readFileSync(statePath, 'utf8');
  const firstEvents = readFileSync(eventsPath, 'utf8');
  const second = fixture.api.setMaxReviewTurns({
    cwd: fixture.root,
    dir: fixture.options.dir,
    requestedMax: 11,
    humanLogin: 'kendrick',
  });
  const secondState = readFileSync(statePath, 'utf8');
  const secondEvents = readFileSync(eventsPath, 'utf8');
  writeFileSync(statePath, baseState);
  writeFileSync(eventsPath, baseEvents);
  return {
    statePath,
    eventsPath,
    baseState,
    firstState,
    firstEvents,
    second,
    secondState,
    secondEvents,
  };
}

test('status settles a concurrent event-append before reporting integrity', async () => {
  const fixture = await initializedProtocol();
  const window = stageClaimPublicationWindow(fixture);
  let retries = 0;
  const status = fixture.api.statusProtocol({
    cwd: fixture.root,
    dir: fixture.options.dir,
    consistency: {
      maxAttempts: 2,
      delayMilliseconds: 0,
      wait() {
        retries += 1;
        window.publish();
      },
    },
  });

  assert.equal(retries, 1);
  assert.equal(status.integrity.ok, true);
  assert.equal(status.revision, window.settled.revision);
  assert.equal(status.turnState, 'claimed');
  assert.equal(status.claim.actor, 'owner-agent');
});

test('status confirms a publication that completes between state and event reads', async () => {
  const fixture = await initializedProtocol();
  const window = stageClaimPublicationWindow(fixture);
  window.releaseLock();
  let stateReads = 0;
  const status = fixture.api.statusProtocol({
    cwd: fixture.root,
    dir: fixture.options.dir,
    consistency: {
      maxAttempts: 2,
      delayMilliseconds: 0,
      afterStateRead() {
        stateReads += 1;
        if (stateReads === 1) window.publishState();
      },
    },
  });

  assert.equal(stateReads, 1);
  assert.equal(status.integrity.ok, true);
  assert.equal(status.revision, window.settled.revision);
  assert.equal(status.turnState, 'claimed');
});

test('status restarts when a second publication completes before confirmation', async () => {
  const fixture = await initializedProtocol();
  const staged = stageTwoPublications(fixture);
  let stateReads = 0;
  let eventReads = 0;
  const status = fixture.api.statusProtocol({
    cwd: fixture.root,
    dir: fixture.options.dir,
    consistency: {
      maxAttempts: 2,
      delayMilliseconds: 0,
      afterStateRead() {
        stateReads += 1;
        if (stateReads === 1) {
          writeFileSync(staged.statePath, staged.firstState);
          writeFileSync(staged.eventsPath, staged.firstEvents);
        }
      },
      afterEventRead() {
        eventReads += 1;
        if (eventReads === 1) {
          writeFileSync(staged.statePath, staged.secondState);
          writeFileSync(staged.eventsPath, staged.secondEvents);
        }
      },
    },
  });

  assert.equal(stateReads, 2);
  assert.equal(eventReads, 2);
  assert.equal(status.integrity.ok, true);
  assert.equal(status.revision, staged.second.revision);
  assert.equal(status.maxReviewTurns, 11);
});

test('status confirms multiple publications between the initial state and event reads', async () => {
  const fixture = await initializedProtocol();
  const staged = stageTwoPublications(fixture);
  let stateReads = 0;
  const status = fixture.api.statusProtocol({
    cwd: fixture.root,
    dir: fixture.options.dir,
    consistency: {
      maxAttempts: 2,
      delayMilliseconds: 0,
      afterStateRead() {
        stateReads += 1;
        if (stateReads === 1) {
          writeFileSync(staged.statePath, staged.secondState);
          writeFileSync(staged.eventsPath, staged.secondEvents);
        }
      },
    },
  });

  assert.equal(stateReads, 1);
  assert.equal(status.integrity.ok, true);
  assert.equal(status.revision, staged.second.revision);
  assert.equal(status.maxReviewTurns, 11);
});

test('status refuses projection drift in an earlier state even when the final pair matches', async () => {
  const fixture = await initializedProtocol();
  const staged = stageTwoPublications(fixture);
  const drifted = JSON.parse(staged.baseState);
  drifted.maxReviewTurns -= 1;
  drifted.remainingReviewTurns -= 1;
  writeFileSync(staged.statePath, `${JSON.stringify(drifted, null, 2)}\n`);

  const status = fixture.api.statusProtocol({
    cwd: fixture.root,
    dir: fixture.options.dir,
    consistency: {
      maxAttempts: 2,
      delayMilliseconds: 0,
      afterStateRead() {
        writeFileSync(staged.statePath, staged.secondState);
        writeFileSync(staged.eventsPath, staged.secondEvents);
      },
    },
  });

  assert.equal(status.integrity.ok, false);
  assert.match(status.integrity.errors.join('\n'), /event-projection maxReviewTurns/);
});

test('status refuses projection drift in a partially confirmed state', async () => {
  const fixture = await initializedProtocol();
  const staged = stageTwoPublications(fixture);
  const drifted = JSON.parse(staged.firstState);
  drifted.maxReviewTurns -= 1;
  drifted.remainingReviewTurns -= 1;
  let stateReads = 0;
  const status = fixture.api.statusProtocol({
    cwd: fixture.root,
    dir: fixture.options.dir,
    consistency: {
      maxAttempts: 2,
      delayMilliseconds: 0,
      afterStateRead() {
        stateReads += 1;
        writeFileSync(staged.statePath, staged.firstState);
        writeFileSync(staged.eventsPath, staged.firstEvents);
      },
      afterEventRead() {
        writeFileSync(staged.statePath, `${JSON.stringify(drifted, null, 2)}\n`);
      },
    },
  });

  assert.equal(stateReads, 1);
  assert.equal(status.integrity.ok, false);
  assert.match(status.integrity.errors.join('\n'), /event-projection maxReviewTurns/);
});

test('status carries state-ahead projection proof across a restart', async () => {
  const fixture = await initializedProtocol();
  const staged = stageTwoPublications(fixture);
  const drifted = JSON.parse(staged.secondState);
  drifted.maxReviewTurns -= 1;
  drifted.remainingReviewTurns -= 1;
  let stateReads = 0;
  let eventReads = 0;
  const status = fixture.api.statusProtocol({
    cwd: fixture.root,
    dir: fixture.options.dir,
    consistency: {
      maxAttempts: 2,
      delayMilliseconds: 0,
      afterStateRead() {
        stateReads += 1;
        if (stateReads === 1) {
          writeFileSync(staged.statePath, staged.firstState);
          writeFileSync(staged.eventsPath, staged.firstEvents);
        } else {
          writeFileSync(staged.statePath, staged.secondState);
          writeFileSync(staged.eventsPath, staged.secondEvents);
        }
      },
      afterEventRead() {
        eventReads += 1;
        if (eventReads === 1) {
          writeFileSync(staged.statePath, `${JSON.stringify(drifted, null, 2)}\n`);
          writeFileSync(staged.eventsPath, staged.secondEvents);
        }
      },
    },
  });

  assert.equal(stateReads, 2);
  assert.equal(status.integrity.ok, false);
  assert.match(status.integrity.errors.join('\n'), /event-projection maxReviewTurns/);
});

test('status refuses protocol drift in a state-ahead confirmation', async () => {
  const fixture = await initializedProtocol();
  const staged = stageTwoPublications(fixture);
  const drifted = JSON.parse(staged.secondState);
  drifted.protocolId = '00000000-0000-4000-8000-000000000001';
  let attempts = 0;
  let eventReads = 0;
  const status = fixture.api.statusProtocol({
    cwd: fixture.root,
    dir: fixture.options.dir,
    consistency: {
      maxAttempts: 2,
      delayMilliseconds: 0,
      beforeStateRead({ attempt }) {
        attempts += 1;
        if (attempt === 2) {
          writeFileSync(staged.statePath, staged.secondState);
          writeFileSync(staged.eventsPath, staged.secondEvents);
        }
      },
      afterStateRead({ attempt }) {
        if (attempt === 1) {
          writeFileSync(staged.statePath, staged.firstState);
          writeFileSync(staged.eventsPath, staged.firstEvents);
        }
      },
      afterEventRead() {
        eventReads += 1;
        if (eventReads === 1) {
          writeFileSync(staged.statePath, `${JSON.stringify(drifted, null, 2)}\n`);
          writeFileSync(staged.eventsPath, staged.secondEvents);
        }
      },
    },
  });

  assert.equal(attempts, 1);
  assert.equal(status.integrity.ok, false);
  assert.match(status.integrity.errors.join('\n'), /event-protocol/);
});

test('wait settles a concurrent event-append before evaluating the requested role', async () => {
  const fixture = await initializedProtocol();
  const window = stageClaimPublicationWindow(fixture);
  let retries = 0;
  const result = await fixture.api.waitForTurn({
    cwd: fixture.root,
    dir: fixture.options.dir,
    actor: 'reviewer-agent',
    timeoutSeconds: 0,
    consistency: {
      maxAttempts: 2,
      delayMilliseconds: 0,
      wait() {
        retries += 1;
        window.publish();
      },
    },
  });

  assert.equal(retries, 1);
  assert.equal(result.status, 'timeout');
  assert.equal(result.state.integrity.ok, true);
  assert.equal(result.state.revision, window.settled.revision);
});

test('persistent event leads fail closed without a mutex and after the retry bound', async () => {
  const unlocked = await initializedProtocol();
  const unlockedWindow = stageClaimPublicationWindow(unlocked);
  unlockedWindow.releaseLock();
  let unlockedRetries = 0;
  const unlockedStatus = unlocked.api.statusProtocol({
    cwd: unlocked.root,
    dir: unlocked.options.dir,
    consistency: {
      maxAttempts: 3,
      delayMilliseconds: 0,
      wait() {
        unlockedRetries += 1;
      },
    },
  });
  assert.equal(unlockedRetries, 0);
  assert.equal(unlockedStatus.integrity.ok, false);
  assert.deepEqual(unlockedStatus.integrity.errors, ['event-count: expected 1, actual 2']);

  const multi = await initializedProtocol();
  const multiStaged = stageTwoPublications(multi);
  writeFileSync(multiStaged.eventsPath, multiStaged.secondEvents);
  const multiStatus = multi.api.statusProtocol({
    cwd: multi.root,
    dir: multi.options.dir,
    consistency: { maxAttempts: 3, delayMilliseconds: 0 },
  });
  assert.equal(multiStatus.integrity.ok, false);
  assert.deepEqual(multiStatus.integrity.errors, ['event-count: expected 1, actual 3']);

  const locked = await initializedProtocol();
  stageClaimPublicationWindow(locked);
  let lockedRetries = 0;
  const lockedStatus = locked.api.statusProtocol({
    cwd: locked.root,
    dir: locked.options.dir,
    consistency: {
      maxAttempts: 3,
      delayMilliseconds: 0,
      wait() {
        lockedRetries += 1;
      },
    },
  });
  assert.equal(lockedRetries, 2);
  assert.equal(lockedStatus.integrity.ok, false);
  assert.deepEqual(lockedStatus.integrity.errors, ['event-count: expected 1, actual 2']);
});
