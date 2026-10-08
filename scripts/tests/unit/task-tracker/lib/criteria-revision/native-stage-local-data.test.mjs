// @story #1855
// Native local projections are data, never proof of reading or publication.
import { initializeFixtureActor } from '../../../../helpers/fixture-actor.mjs';
initializeFixtureActor(import.meta.url);
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../../../../../task-tracker/lib/scratch-dir.mjs';
import * as config from '../../../../../task-tracker/config.mjs';
const absent = () => ({ source: 'absent', bytes: null });
const captured = (value, source = 'current') => ({ source, bytes: JSON.stringify(value) });

test('recorded config derives the actual native defaults, precedence, field fallbacks and preferences', () => {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), '1855-config-data-'));
  try {
    const projectPath = path.join(dir, 'project.json'),
      userPath = path.join(dir, 'user.json');
    const user = {
      repo: 'example/user',
      wpm: 123,
      fieldIds: { rank: 'old' },
      gatePullRequestReview: true,
    };
    const project = {
      repo: 'example/project',
      fieldIds: { rank: 'R', actualHours: 'A', size: 'S' },
      preferences: { noPushToOrigin: true },
      customIgnored: 'not selected',
      wpm: 'native-permissive',
    };
    writeFileSync(userPath, JSON.stringify(user));
    writeFileSync(projectPath, JSON.stringify(project));
    const actual = config.loadConfig({ projectPath, userPath });
    const input = { project: captured(project), user: captured(user) };
    const original = structuredClone(input);
    const recorded = config.deriveRecordedConfig(input);
    assert.deepEqual(recorded.config, actual);
    assert.deepEqual(recorded.warnings, []);
    assert.equal(recorded.config.wpm, 'native-permissive');
    assert.equal(recorded.config.fieldRank, 'R');
    assert.equal(recorded.config.fieldEngagedTime, 'A');
    assert.equal(recorded.config.sizeFieldId, 'S');
    assert.equal(recorded.config._sources.repo, 'project');
    assert.equal(recorded.config._sources.gatePullRequestReview, 'user');
    assert.equal(recorded.config.customIgnored, undefined);
    assert.equal(recorded.config.preferences.noPushToOrigin, true);
    assert.deepEqual(input, original);
    rmSync(projectPath);
    rmSync(userPath);
    assert.deepEqual(
      config.deriveRecordedConfig({ project: absent(), user: absent() }).config,
      config.loadConfig({ projectPath, userPath })
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('recorded config shares original legacy warnings and conflict semantics without printing or reading', () => {
  const input = {
    project: captured({ kanbanOptionAssigned: 'P_OPTION' }, 'legacy'),
    user: absent(),
  };
  const before = console.warn,
    seen = [];
  console.warn = (message) => seen.push(message);
  try {
    const value = config.deriveRecordedConfig(input);
    assert.equal(value.config.kanbanOptionReadyForPlan, 'P_OPTION');
    assert.deepEqual(value.warnings, [
      '[aitm] legacy project config key kanbanOptionAssigned deprecated; use kanbanOptionReadyForPlan. The option id was loaded canonically.',
    ]);
    assert.deepEqual(seen, []);
    assert.throws(
      () =>
        config.deriveRecordedConfig({
          ...input,
          project: captured({ kanbanOptionAssigned: 'OLD', kanbanOptionReadyForPlan: 'NEW' }),
        }),
      /compatibility keys conflict/
    );
  } finally {
    console.warn = before;
  }
});

test('recorded config distinguishes proven absence from corrupt, unresolved and caller-selected read data', () => {
  const base = { project: absent(), user: absent() };
  for (const project of [
    { source: 'absent', bytes: '{}' },
    { source: 'current', bytes: null },
    { source: 'unavailable', bytes: null },
    { source: 'current', bytes: '{broken' },
    { source: 'current', bytes: 'null' },
    { source: 'current', bytes: '[]' },
    { source: 'current', bytes: '{}', path: 'caller-selected' },
  ]) {
    assert.throws(() => config.deriveRecordedConfig({ ...base, project }), /recorded-config/);
  }
  assert.throws(
    () => config.deriveRecordedConfig({ ...base, read: () => ({}) }),
    /recorded-config/
  );
});

// Same-issue omission must preserve cache/closedAt, while explicit null and
// different-issue records must not inherit them. Literal bytes pin native order.
test('recorded active-task payload preserves native sticky fields and exact atomic-write bytes', async () => {
  const session = await import('../../../../../task-tracker/session-state.mjs');
  const dir = mkdtempSync(path.join(projectScratchDir('test'), '1855-session-data-'));
  try {
    const existing = { issue: 124, kanbanState: 'on-deck', closedAt: 'old', ignoredPrior: 7 };
    const record = { issue: 124, state: 'test', custom: { keep: true }, bindingGenerationId: null };
    const boundAt = '2026-10-01T00:00:00.000Z';
    const input = {
      recordBytes: JSON.stringify(record),
      existingBytes: JSON.stringify(existing),
      boundAt,
    };
    const recorded = session.deriveRecordedActiveTask(input);
    const expected = {
      issue: 124,
      entryStartTs: null,
      wordsAtStart: 0,
      boundAt,
      kanbanState: 'ready-for-plan',
      closedAt: 'old',
      custom: { keep: true },
      bindingGenerationId: null,
    };
    assert.deepEqual(recorded, {
      payload: expected,
      bytes: JSON.stringify(expected, null, 2) + '\n',
    });
    const file = session.activeTaskPath('fixture-local-data', dir);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, input.existingBytes);
    session.setActiveTask('fixture-local-data', { ...record, boundAt }, dir);
    assert.equal(readFileSync(file, 'utf8'), recorded.bytes);
    for (const next of [{ issue: 125 }, { issue: 124, kanbanState: null, closedAt: null }]) {
      const value = session.deriveRecordedActiveTask({
        ...input,
        recordBytes: JSON.stringify(next),
      }).payload;
      assert.equal(value.kanbanState, next.kanbanState);
      assert.equal(value.closedAt, next.closedAt);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('recorded active-task data refuses corrupt or unresolved source and caller effect fields', async () => {
  const session = await import('../../../../../task-tracker/session-state.mjs');
  const base = {
    recordBytes: '{"issue":124}',
    existingBytes: null,
    boundAt: '2026-10-01T00:00:00.000Z',
  };
  assert.equal(session.deriveRecordedActiveTask(base).payload.issue, 124);
  for (const delta of [
    { existingBytes: '{bad' },
    { existingBytes: 'null' },
    { recordBytes: '[]' },
    { recordBytes: null },
    { boundAt: 'invalid' },
    { read: () => ({}) },
    { path: 'caller' },
  ]) {
    assert.throws(
      () => session.deriveRecordedActiveTask({ ...base, ...delta }),
      /recorded-active-task/
    );
  }
});

// Catch loss of actor isolation, native EMPTY_STATE overwrite order, or leaked
// global worktree authority; then pin exact native write bytes independently.
test('recorded state preserves real actor overlay, shared unknown fields and split write bytes', async () => {
  const state = await import('../../../../../task-tracker/state.mjs');
  const session = await import('../../../../../task-tracker/session-state.mjs');
  const actor = await import('../../../../../task-tracker/lib/actor-timing-state.mjs');
  const words = await import('../../../../../task-tracker/word-counter.mjs');
  const dir = mkdtempSync(path.join(projectScratchDir('test'), '1855-state-data-'));
  const statePath = path.join(dir, '.tmp/aitm/state/task-tracker-state.json');
  const identity = { provider: words.aiAppName(), sid: words.currentSessionId() };
  try {
    mkdirSync(path.dirname(statePath), { recursive: true });
    const previous = {
      unknownShared: 9,
      state: 'develop',
      worktreePath: 'stale',
      lastWordMarker: 88,
    };
    writeFileSync(statePath, JSON.stringify(previous));
    const sample = {
      active: 124,
      entryStartTs: '2026-10-01T00:00:00.000Z',
      wordsAtEntryStart: 5,
      lastWordMarker: 17,
      lastFullWordMarker: 19,
      state: 'test',
      custom: 'kept',
      bindingGenerationId: null,
    };
    const projected = state.deriveRecordedStateSave({
      stateBytes: JSON.stringify(sample),
      identity,
      priorBindingBytes: null,
      previousBytes: JSON.stringify(previous),
    });
    assert.deepEqual(projected.bindingRecord, {
      issue: 124,
      entryStartTs: sample.entryStartTs,
      wordsAtStart: 5,
      bindingGenerationId: null,
    });
    assert.equal(
      projected.sharedBytes,
      JSON.stringify({ unknownShared: 9, lastWordMarker: 88, custom: 'kept' }, null, 2) + '\n'
    );
    state.saveState(sample, statePath);
    assert.equal(readFileSync(statePath, 'utf8'), projected.sharedBytes);
    assert.equal(
      readFileSync(actor.actorTimingStatePath(identity, dir), 'utf8'),
      JSON.stringify(projected.actorRecord, null, 2) + '\n'
    );
    const activeBytes = readFileSync(session.activeTaskPath(identity.sid, dir), 'utf8');
    const loaded = state.deriveRecordedState({
      sharedBytes: projected.sharedBytes,
      identity,
      actorBytes: JSON.stringify(projected.actorRecord),
      cursor: null,
      activeBytes,
    });
    assert.deepEqual(loaded, state.loadState(statePath));
    assert.equal(loaded.active, 124);
    assert.equal(loaded.lastWordMarker, 17);
    assert.equal(loaded.unknownShared, 9);
    assert.equal(loaded.state, undefined);
    assert.equal(loaded.worktreePath, undefined);
    assert.equal(loaded.bindingGenerationId, undefined);
    const noActor = state.deriveRecordedState({
      sharedBytes: JSON.stringify(previous),
      identity,
      actorBytes: null,
      cursor: { words: 3, wordsFull: 4 },
      activeBytes: null,
    });
    assert.deepEqual(noActor, {
      ...state.EMPTY_STATE,
      lastWordMarker: 3,
      lastFullWordMarker: 4,
      unknownShared: 9,
    });
    const switched = state.deriveRecordedStateSave({
      stateBytes: JSON.stringify({ ...sample, active: 125, bindingGenerationId: 'old' }),
      identity,
      priorBindingBytes: JSON.stringify({ issue: 124, bindingGenerationId: 'old' }),
      previousBytes: null,
    });
    assert.equal(Object.hasOwn(switched.bindingRecord, 'bindingGenerationId'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('recorded state rejects corrupt, foreign actor and caller read or clock inputs', async () => {
  const state = await import('../../../../../task-tracker/state.mjs');
  const actor = await import('../../../../../task-tracker/lib/actor-timing-state.mjs');
  const identity = { provider: 'codex', sid: 'fixture-recorded-state' };
  const base = {
    sharedBytes: null,
    identity,
    actorBytes: null,
    cursor: { words: 0, wordsFull: 0 },
    activeBytes: null,
  };
  assert.equal(state.deriveRecordedState(base).active, null);
  for (const delta of [
    { sharedBytes: '{bad' },
    { sharedBytes: 'null' },
    { activeBytes: '[]' },
    {
      actorBytes: JSON.stringify(actor.actorTimingStateRecord({ ...identity, sid: 'foreign' }, {})),
      cursor: null,
    },
    { cursor: { words: 0, wordsFull: 0, read: true } },
    { cursor: null },
    { read: () => ({}) },
    { now: 1 },
  ]) {
    assert.throws(() => state.deriveRecordedState({ ...base, ...delta }));
  }
  const save = {
    stateBytes: '{"active":124}',
    identity,
    priorBindingBytes: null,
    previousBytes: null,
  };
  assert.equal(state.deriveRecordedStateSave(save).bindingRecord.issue, 124);
  for (const delta of [
    { previousBytes: '[]' },
    { stateBytes: '{bad' },
    { priorBindingBytes: 'null' },
    { identity: { ...identity, projectDir: 'caller' } },
    { write: () => {} },
  ]) {
    assert.throws(() => state.deriveRecordedStateSave({ ...save, ...delta }));
  }
});

test('recorded Test cache preserves native unknown fields and exact no-op disposition', async () => {
  const session = await import('../../../../../task-tracker/session-state.mjs');
  const dir = mkdtempSync(path.join(projectScratchDir('test'), '1855-cache-data-'));
  try {
    const before = {
      issue: '#124',
      kanbanState: 'develop',
      state: 'legacy',
      bindingGenerationId: 'retained',
      custom: 7,
    };
    const input = { existingBytes: JSON.stringify(before), state: 'test' };
    const projected = session.deriveRecordedSessionKanban(input);
    assert.deepEqual(projected.payload, { ...before, kanbanState: 'test' });
    assert.equal(projected.changed, true);
    const file = session.activeTaskPath('fixture-cache-data', dir);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, input.existingBytes);
    session.setSessionKanbanState('fixture-cache-data', 'test', dir);
    assert.equal(readFileSync(file, 'utf8'), projected.bytes);
    assert.deepEqual(
      session.deriveRecordedSessionKanban({ existingBytes: projected.bytes, state: 'test' }),
      { payload: projected.payload, bytes: projected.bytes, changed: false }
    );
    assert.deepEqual(session.deriveRecordedSessionKanban({ existingBytes: null, state: 'test' }), {
      payload: null,
      bytes: null,
      changed: false,
    });
    for (const delta of [
      { existingBytes: '{bad' },
      { state: 'done' },
      { read: () => ({}) },
      { existingBytes: 'null' },
    ])
      assert.throws(
        () => session.deriveRecordedSessionKanban({ ...input, ...delta }),
        /recorded-session-kanban/
      );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('native config capture retains actual ordered selection and selected source bytes on exact result only', () => {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'native-config-capture-'));
  try {
    const paths = Object.fromEntries(
      ['projectPath', 'legacyProjectPath', 'userPath', 'legacyUserPath'].map((key) => [
        key,
        path.join(dir, key + '.json'),
      ])
    );
    const user = '{"repo":"user/repo","wpm":91}\n',
      project = '{"repo":"project/repo"}\n';
    writeFileSync(paths.legacyUserPath, user);
    writeFileSync(paths.projectPath, project);
    const result = config.loadConfig(paths);
    assert.equal(result.repo, 'project/repo');
    assert.equal(result.wpm, 91);
    const data = config.readConfigSourceData(result);
    assert.deepEqual(data, [
      {
        role: 'user',
        currentPath: paths.userPath,
        currentExists: false,
        legacyPath: paths.legacyUserPath,
        selectedPath: paths.legacyUserPath,
        selectedExists: true,
        bytes: user,
        error: null,
      },
      {
        role: 'project',
        currentPath: paths.projectPath,
        currentExists: true,
        legacyPath: paths.legacyProjectPath,
        selectedPath: paths.projectPath,
        selectedExists: true,
        bytes: project,
        error: null,
      },
    ]);
    assert.ok(Object.isFrozen(data) && data.every(Object.isFrozen));
    assert.equal(config.readConfigSourceData({ ...result }), null);
    assert.equal(config.readConfigSourceData(null), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('native config capture retains parse failure and absence diagnostics without minting default authority', () => {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'native-config-errors-'));
  try {
    const projectPath = path.join(dir, 'project.json'),
      userPath = path.join(dir, 'user.json');
    writeFileSync(projectPath, '{malformed');
    const result = config.loadConfig({ projectPath, userPath });
    assert.equal(result.repo, '');
    const data = config.readConfigSourceData(result);
    assert.equal(data[0].currentExists, false);
    assert.equal(data[0].selectedPath, null);
    assert.equal(data[0].selectedExists, null);
    assert.equal(data[0].bytes, null);
    assert.equal(data[1].bytes, '{malformed');
    assert.equal(data[1].selectedExists, true);
    assert.equal(typeof data[1].error.message, 'string');
    assert.throws(
      () =>
        config.deriveRecordedConfig({
          user: { source: 'absent', bytes: null },
          project: { source: 'current', bytes: data[1].bytes },
        }),
      /recorded-config/
    );
    writeFileSync(projectPath, '"ordinary scalar compatibility"');
    const scalar = config.loadConfig({ projectPath, userPath });
    assert.equal(scalar.repo, '');
    assert.throws(
      () =>
        config.deriveRecordedConfig({
          user: { source: 'absent', bytes: null },
          project: { source: 'current', bytes: config.readConfigSourceData(scalar)[1].bytes },
        }),
      /recorded-config/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

import * as sessionPolicy from '../../../../../task-tracker/lib/session-store.mjs';
test('recorded session policy preserves native original overlay, unknown fields, gates and final SID override', () => {
  const bytes = JSON.stringify({
    sessionId: 'other-original-value',
    lastPromptedParent: '41',
    gates: { reviewToDone: false, extraNativeField: 9 },
    updatedAt: '2026-10-01T00:00:00Z',
    extraNativeField: 'kept',
  });
  const expected = {
    sessionId: 'fixture-session',
    lastPromptedParent: '41',
    gates: {
      analysisToDevelopment: null,
      pullRequestReview: null,
      reviewToDone: false,
      extraNativeField: 9,
    },
    updatedAt: '2026-10-01T00:00:00Z',
    extraNativeField: 'kept',
  };
  const native = sessionPolicy.loadSession('fixture-session', {
    dir: 'fixture-gates',
    fs: {
      existsSync: () => true,
      readFileSync: () => bytes,
    },
  });
  assert.deepEqual(native, expected);
  assert.deepEqual(
    sessionPolicy.deriveRecordedSessionPolicy({ sessionId: 'fixture-session', bytes }),
    expected
  );
  assert.equal(
    sessionPolicy.readSessionPolicySourceData(native),
    null,
    'injected readers never qualify passive native capture'
  );
  assert.deepEqual(sessionPolicy.deriveRecordedSessionPolicy({ sessionId: '', bytes: null }), {
    sessionId: '',
    lastPromptedParent: null,
    gates: { analysisToDevelopment: null, pullRequestReview: null, reviewToDone: null },
    updatedAt: '1970-01-01T00:00:00.000Z',
  });
});
test('recorded session policy rejects corruption and caller reader fields while native permissive fallback stays', () => {
  const base = { sessionId: 'fixture-session', bytes: null };
  for (const bytes of ['{bad', 'null', '[]', '"scalar"']) {
    assert.throws(
      () => sessionPolicy.deriveRecordedSessionPolicy({ ...base, bytes }),
      /recorded-session-policy/
    );
  }
  assert.throws(
    () => sessionPolicy.deriveRecordedSessionPolicy({ ...base, read: () => ({}) }),
    /recorded-session-policy/
  );
  const native = sessionPolicy.loadSession(base.sessionId, {
    dir: 'fixture-gates',
    fs: {
      existsSync: () => true,
      readFileSync: () => '{bad',
    },
  });
  assert.equal(native.gates.reviewToDone, null);
  assert.equal(sessionPolicy.readSessionPolicySourceData(native), null);
});

test('recorded active-task read uses native normalization while preserving unknown fields', async () => {
  const session = await import('../../../../../task-tracker/session-state.mjs');
  const input = {
    bytes: JSON.stringify({ issue: '#1855', kanbanState: 'on-deck', custom: { keep: true } }),
  };
  assert.deepEqual(session.deriveRecordedActiveTaskRead(input), {
    issue: '#1855',
    kanbanState: 'ready-for-plan',
    custom: { keep: true },
  });
  assert.equal(session.deriveRecordedActiveTaskRead({ bytes: null }), null);
  for (const bad of [{ bytes: '{broken' }, { bytes: '[]' }, { bytes: '{}', ready: true }])
    assert.throws(() => session.deriveRecordedActiveTaskRead(bad));
});
