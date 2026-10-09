// @story #1857
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, readFileSync, utimesSync, existsSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { createRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { planRuntimeMigration, applyRuntimeMigration } from '../../../../task-tracker/lib/runtime-migration.mjs';
import { fenceRuntimeWriters, inspectRuntimeWriterLeases, inspectRuntimeCoordinator } from '../../../../task-tracker/lib/runtime-migration-lock.mjs';
import { withLock, readFleet, writeFleet } from '../../../../task-tracker/fleet-registry.mjs';
import { enqueue, drain, peek } from '../../../../task-tracker/queue.mjs';
import { projectDirForState, loadState, saveState } from '../../../../task-tracker/state.mjs';
import { statePath, queuePath, sessionDir, fleetPath } from '../../../../task-tracker/paths.mjs';
import { getActiveTask, activeTaskPath } from '../../../../task-tracker/session-state.mjs';
import { currentSessionId } from '../../../../task-tracker/word-counter.mjs';
import { readOccupancy } from '../../../../task-tracker/lib/occupancy.mjs';
import { readStore, record as recordVerifier, lookup } from '../../../../task-tracker/lib/verifier-cache.mjs';
import { loadSession, saveSession, sweepOrphans, sessionFilePath } from '../../../../task-tracker/lib/session-store.mjs';

test('actual queue drain keeps a whole-operation lease while delivery awaits, then drains under the fence', async () => {
  const root = createRuntimeRootFixture('1857-queue-writer-');
  const roots = { projectRoot: root, mainRoot: root };
  const owner = { provider: 'fixture', sid: 'queue-migrator', pid: process.pid, processToken: 'migration' };
  const adapters = { identity: () => owner, trustLegacy: () => 'explicit-operator-trust', writerCensus: () => ({ complete: true, writers: [], claims: [] }) };
  try {
    for (const [relative, value] of Object.entries({
      'state/task-tracker-state.json': {}, 'state/task-tracker-queue.json': [],
      'fleet/task-fleet.json': {}, 'fleet/occupancy.json': {},
    })) {
      const file = path.join(root, '.tmp', 'aitm', relative);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(value));
    }
    const plan = await planRuntimeMigration({ ...roots, adapters });
    await applyRuntimeMigration({ plan, approvedPlanDigest: plan.digest, adapters });
    const queue = path.join(root, '.ai-task-manager', 'runtime', 'store', 'state', 'task-tracker-queue.json');
    assert.equal(projectDirForState(queue), root, 'the rightmost exact store anchor identifies the physical owner');
    assert.throws(() => projectDirForState(path.join(root, 'nested', 'state.json')), { code: 'RUNTIME_OVERRIDE_UNSAFE' }, 'a nested unanchored state path cannot inherit any enclosing project authority');
    assert.throws(() => projectDirForState(path.join(root, '.tmp', 'aitm', 'state', 'state.json')), { code: 'RUNTIME_OVERRIDE_UNSAFE' });
    const stateFile = path.join(path.dirname(queue), 'task-tracker-state.json');
    const originalState = readFileSync(stateFile);
    writeFileSync(stateFile, '{bad');
    assert.throws(() => loadState(stateFile), { code: 'RUNTIME_STATE_CORRUPT' }, 'corrupt durable state cannot become an empty actor or binding');
    assert.equal(readFileSync(stateFile, 'utf8'), '{bad');
    rmSync(stateFile);
    assert.throws(() => loadState(stateFile), { code: 'RUNTIME_STATE_CORRUPT' });
    writeFileSync(stateFile, originalState);
    assert.equal(statePath(root), stateFile);
    assert.equal(queuePath(root), queue);
    assert.equal(sessionDir('fixture-session', root), path.join(root, '.ai-task-manager', 'runtime', 'store', 'sessions', 'fixture-session'));
    assert.equal(fleetPath(root), path.join(root, '.ai-task-manager', 'runtime', 'store', 'fleet', 'task-fleet.json'));
    const state = { active: '#1857', entryStartTs: '2026-10-01T00:00:00.000Z', wordsAtEntryStart: 0 };
    Object.defineProperty(state, 'lastWordMarker', { enumerable: true, get() {
      assert.equal(inspectRuntimeWriterLeases(roots).length, 1, 'state projection must already own its whole-operation lease');
      assert.equal(inspectRuntimeCoordinator(roots).status, 'owned', 'global, binding and actor publication must share the RMW lock');
      return 19;
    } });
    saveState(state, stateFile);
    assert.equal(loadState(stateFile).lastWordMarker, 19);
    assert.equal(loadState(stateFile).active, '#1857');
    assert.equal(inspectRuntimeWriterLeases(roots).length, 0);
    assert.equal(inspectRuntimeCoordinator(roots).status, 'absent');
    const binding = activeTaskPath(currentSessionId(), root);
    const originalBinding = readFileSync(binding);
    writeFileSync(binding, '{bad');
    assert.throws(() => getActiveTask(currentSessionId(), root), { code: 'RUNTIME_STATE_CORRUPT' }, 'corrupt binding cannot become unbound');
    rmSync(binding);
    const legacyBinding = path.join(root, '.tmp', 'legacy-binding.json');
    writeFileSync(legacyBinding, originalBinding);
    symlinkSync(legacyBinding, binding);
    assert.throws(() => getActiveTask(currentSessionId(), root), { code: 'RUNTIME_OVERRIDE_UNSAFE' }, 'a binding alias cannot import volatile authority');
    rmSync(binding);
    writeFileSync(binding, originalBinding);
    const fleetFile = fleetPath(root);
    writeFileSync(fleetFile, '{bad');
    assert.throws(() => readFleet(fleetFile), { code: 'RUNTIME_STATE_CORRUPT' }, 'a corrupt fleet must not become an empty authoritative runtime store');
    writeFileSync(fleetFile, '{}');
    const fleet = {};
    Object.defineProperty(fleet, '#1857', { enumerable: true, get() {
      assert.equal(inspectRuntimeWriterLeases(roots).length, 1);
      assert.equal(inspectRuntimeCoordinator(roots).status, 'owned');
      return { worktreePath: root, branch: 'fixture', startedAt: '2026-10-01T00:00:00Z', status: 'active' };
    } });
    writeFleet(fleetFile, fleet);
    assert.equal(readFleet(fleetFile)['#1857'].branch, 'fixture');
    const occupancyFile = path.join(path.dirname(fleetFile), 'occupancy.json');
    rmSync(occupancyFile);
    assert.throws(() => readOccupancy(occupancyFile), { code: 'RUNTIME_STATE_CORRUPT' }, 'missing occupancy cannot silently release all claims');
    writeFileSync(occupancyFile, '{}');
    const cacheBase = path.dirname(path.dirname(stateFile));
    const cacheFile = path.join(cacheBase, 'cache', 'verifier-results.json');
    mkdirSync(path.dirname(cacheFile), { recursive: true });
    writeFileSync(cacheFile, '{bad');
    assert.throws(() => readStore(cacheBase), { code: 'RUNTIME_STATE_CORRUPT' }, 'corrupt verifier evidence must remain an explicit refusal');
    rmSync(cacheFile);
    const cacheInput = { dir: cacheBase, cmd: 'npm test', sha: 'a'.repeat(40), exit: 0, ts: '2026-10-01T00:00:00Z' };
    assert.equal(recordVerifier(cacheInput), true);
    assert.equal(lookup(cacheInput).sha, cacheInput.sha);
    const gates = path.join(cacheBase, 'gates');
    const gateState = { sessionId: 'gate-fixture', lastPromptedParent: null, gates: { analysisToDevelopment: false, pullRequestReview: true, reviewToDone: null } };
    saveSession(gateState, { dir: gates });
    const gateFile = sessionFilePath(gateState.sessionId, gates);
    const gateBytes = readFileSync(gateFile);
    writeFileSync(gateFile, '{bad');
    assert.throws(() => loadSession(gateState.sessionId, { dir: gates }), { code: 'RUNTIME_STATE_CORRUPT' }, 'corrupt explicit gate policy cannot become fresh defaults');
    writeFileSync(gateFile, gateBytes);
    utimesSync(gateFile, new Date(0), new Date(0));
    assert.equal(sweepOrphans({ dir: gates, now: Date.now(), maxAgeMs: 1 }), 0, 'age alone cannot remove gate authority');
    assert.deepEqual(readFileSync(gateFile), gateBytes);
    const originalQueue = readFileSync(queue);
    rmSync(queue);
    assert.throws(() => peek(queue), { code: 'RUNTIME_STATE_CORRUPT' }, 'missing durable queue must not become an empty queue or legacy fallback');
    writeFileSync(queue, originalQueue);
    writeFileSync(queue, '{broken');
    assert.throws(() => peek(queue), { code: 'RUNTIME_STATE_CORRUPT' });
    writeFileSync(queue, originalQueue);
    mkdirSync(queue + '.lock');
    utimesSync(queue + '.lock', new Date(0), new Date(0));
    assert.throws(() => enqueue({ kind: 'timing', issue: 1857, row: 'blocked' }, queue), { code: 'RUNTIME_LOCK_RECOVERY_REQUIRED' }, 'age cannot authorize stealing an old record lock');
    assert.equal(existsSync(queue + '.lock'), true);
    assert.deepEqual(readFileSync(queue), originalQueue);
    rmSync(queue + '.lock', { recursive: true });
    withLock(queue, () => {
      assert.equal(inspectRuntimeCoordinator(roots).status, 'owned');
      assert.equal(inspectRuntimeWriterLeases(roots).length, 1);
      withLock(queue, () => assert.equal(inspectRuntimeCoordinator(roots).status, 'owned'));
    });
    assert.equal(inspectRuntimeCoordinator(roots).status, 'absent');
    enqueue({ kind: 'timing', issue: 1857, row: '| 2026-10-01 00:00:00 | develop:started | 0 | 0 | 0 | 0 |' }, queue);
    let entered;
    let release;
    const seen = new Promise((resolve) => { entered = resolve; });
    const hold = new Promise((resolve) => { release = resolve; });
    const delivery = drain(async () => { entered(); await hold; }, queue);
    await seen;
    try {
      assert.equal(inspectRuntimeWriterLeases(roots).length, 1, 'the queue handler await must retain its writer lease');
      const fenced = await fenceRuntimeWriters({ ...roots, transactionId: 'queue-drain', approvedPlanDigest: 'sha256:' + 'a'.repeat(64), adapters });
      assert.notEqual(fenced.status, 'quiesced');
      assert.throws(() => peek(queue), { code: 'RUNTIME_TRANSACTION_INCOMPLETE' }, 'ordinary authority reads cannot bypass a pending migration fence');
      assert.throws(() => loadState(stateFile), { code: 'RUNTIME_TRANSACTION_INCOMPLETE' });
      const cacheBefore = readFileSync(cacheFile);
      assert.throws(() => recordVerifier({ ...cacheInput, sha: 'b'.repeat(40) }), { code: 'RUNTIME_TRANSACTION_INCOMPLETE' });
      assert.deepEqual(readFileSync(cacheFile), cacheBefore);
      assert.throws(() => saveSession(gateState, { dir: gates }), { code: 'RUNTIME_TRANSACTION_INCOMPLETE' });
      assert.deepEqual(readFileSync(gateFile), gateBytes);
      const before = readFileSync(queue);
      assert.throws(() => enqueue({ kind: 'timing', issue: 1857, row: 'new' }, queue), { code: 'RUNTIME_TRANSACTION_INCOMPLETE' });
      assert.deepEqual(readFileSync(queue), before);
    } finally { release(); await delivery; }
    assert.equal(await delivery, true);
    assert.equal(inspectRuntimeWriterLeases(roots).length, 0);
    assert.deepEqual(JSON.parse(readFileSync(queue)).items, []);
    assert.throws(() => peek(queue), { code: 'RUNTIME_TRANSACTION_INCOMPLETE' });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
