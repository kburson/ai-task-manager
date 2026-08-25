#!/usr/bin/env node
// @story #309
// #327 — `/task chore-mode` verb shape.
//
// Covers AC #3, #4, #5, #8, and #9(e)/(g):
//   - `chore-mode on` writes active=true + previousIssue + reason
//   - `chore-mode on` refuses when fleet has live worktree-scoped agent
//   - `chore-mode off` clears active
//   - `chore-mode off --resume` invokes verbStart for the previous issue
//   - `chore-mode status` formats the current record
//   - liveWorktreeAgents helper classification
//   - buildLiveFleetRefusal shape

import { strict as assert } from 'node:assert';
import { after, before, beforeEach, test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  createChoreModeFixture,
  destroyChoreModeFixture,
  resetChoreModeFixture,
} from '../../../fixtures/chore-mode/chore-mode-fixture.mjs';
import {
  choreModeOn,
  choreModeOff,
  choreModeStatus,
  liveWorktreeAgents,
  buildLiveFleetRefusal,
  formatStatus,
} from '../../../../task-tracker/verbs/chore-mode.mjs';
import { readChoreMode } from '../../../../task-tracker/lib/chore-mode.mjs';

let featureFixture;

before(() => {
  featureFixture = createChoreModeFixture({ repository: { command: 'chore-mode' } });
});
beforeEach(() => resetChoreModeFixture(featureFixture));
after(() => destroyChoreModeFixture(featureFixture));

function createCaseRoot(prefix) {
  const parent = path.join(featureFixture.root, '.tmp', 'cases');
  mkdirSync(parent, { recursive: true });
  return mkdtempSync(path.join(parent, prefix));
}

function statePath(root) {
  // #573: the global ledger lives under `.tmp/aitm/state/`.
  return path.join(root, '.tmp', 'aitm', 'state', 'task-tracker-state.json');
}

function writeState(root, payload) {
  mkdirSync(path.dirname(statePath(root)), { recursive: true });
  writeFileSync(statePath(root), JSON.stringify(payload, null, 2));
}

// Stub writable stream that captures output.
function buf() {
  const chunks = [];
  return {
    write: (s) => chunks.push(String(s)),
    text: () => chunks.join(''),
  };
}

function mkCtx(root, restAfterSub) {
  return {
    statePath: statePath(root),
    projectDir: root,
    rest: ['on', ...restAfterSub], // overwritten per sub-command
    cfg: { repo: 'kburson/ai-task-manager' },
  };
}

test('liveWorktreeAgents filters active+worktreePath entries', () => {
  const fleet = {
    '#1': { status: 'active', worktreePath: '/wt/1', branch: '1-foo' },
    '#2': { status: 'paused', worktreePath: '/wt/2', branch: '2-bar' },
    '#3': { status: 'active' }, // no worktreePath → main-thread bind
    '#4': { status: 'active', worktreePath: '/wt/4', branch: '4-baz' },
  };
  const live = liveWorktreeAgents(fleet);
  assert.equal(live.length, 2);
  assert.deepEqual(live.map((a) => a.ref).sort(), ['#1', '#4']);
});

test('liveWorktreeAgents tolerates null / non-object input', () => {
  assert.deepEqual(liveWorktreeAgents(null), []);
  assert.deepEqual(liveWorktreeAgents(undefined), []);
  assert.deepEqual(liveWorktreeAgents('bogus'), []);
});

test('buildLiveFleetRefusal includes each agent ref + worktreePath', () => {
  const refusal = buildLiveFleetRefusal([{ ref: '#42', branch: '42-foo', worktreePath: '/wt/42' }]);
  assert.equal(refusal.code, 'chore-mode-live-fleet');
  assert.match(refusal.message, /#42/);
  assert.match(refusal.message, /\/wt\/42/);
  assert.match(refusal.message, /single-thread main-loop only/);
});

test('formatStatus renders all fields', () => {
  const text = formatStatus({
    active: true,
    since: '2026-06-07T01:00:00Z',
    previousIssue: '#327',
    reason: 'docs sweep',
  });
  assert.match(text, /chore-mode: on/);
  assert.match(text, /since: 2026-06-07T01:00:00Z/);
  assert.match(text, /previousIssue: #327/);
  assert.match(text, /reason: docs sweep/);
});

test('chore-mode on writes active=true with reason and previousIssue', async () => {
  const root = createCaseRoot('chore-on-');
  try {
    writeState(root, { active: '#999', lastActive: '#999', entryStartTs: null });
    const out = buf();
    const err = buf();
    const ctx = {
      statePath: statePath(root),
      projectDir: root,
      rest: ['on', 'docs', 'sweep'],
    };
    const rc = await choreModeOn(ctx, {
      readFleet: () => ({}),
      findMainWorktreePath: () => root,
      out,
      err,
      nowIso: () => '2026-06-07T02:00:00Z',
    });
    assert.equal(rc, 0);
    const cm = readChoreMode(root);
    assert.equal(cm.active, true);
    assert.equal(cm.previousIssue, '#999');
    assert.equal(cm.reason, 'docs sweep');
    assert.equal(cm.since, '2026-06-07T02:00:00Z');
    // Active task was detached.
    const persisted = JSON.parse(readFileSync(statePath(root), 'utf8'));
    assert.equal(persisted.active, null);
    assert.equal(persisted.lastActive, '#999');
    assert.match(out.text(), /chore-mode: on/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('chore-mode on refuses when fleet has live worktree-scoped agent', async () => {
  const root = createCaseRoot('chore-on-refuse-');
  try {
    writeState(root, { active: null, lastActive: null });
    const out = buf();
    const err = buf();
    const ctx = {
      statePath: statePath(root),
      projectDir: root,
      rest: ['on'],
    };
    const rc = await choreModeOn(ctx, {
      readFleet: () => ({
        '#888': { status: 'active', worktreePath: '/wt/888', branch: '888-x' },
      }),
      findMainWorktreePath: () => root,
      out,
      err,
    });
    assert.equal(rc, 2);
    assert.match(err.text(), /chore-mode-live-fleet/);
    assert.match(err.text(), /#888/);
    const cm = readChoreMode(root);
    assert.equal(cm.active, false, 'must not flip active on refusal');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('chore-mode on is idempotent when already on', async () => {
  const root = createCaseRoot('chore-on-idem-');
  try {
    writeState(root, {
      active: null,
      lastActive: '#42',
      choreMode: {
        active: true,
        since: '2026-06-07T00:00:00Z',
        previousIssue: '#42',
        reason: 'first',
      },
    });
    const out = buf();
    const ctx = {
      statePath: statePath(root),
      projectDir: root,
      rest: ['on', 'second'],
    };
    const rc = await choreModeOn(ctx, {
      readFleet: () => ({}),
      findMainWorktreePath: () => root,
      out,
      err: buf(),
    });
    assert.equal(rc, 0);
    const cm = readChoreMode(root);
    assert.equal(cm.reason, 'first', 'reason must not be overwritten when already on');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('chore-mode off clears active without --resume', async () => {
  const root = createCaseRoot('chore-off-');
  try {
    writeState(root, {
      active: null,
      lastActive: '#327',
      choreMode: {
        active: true,
        since: '2026-06-07T00:00:00Z',
        previousIssue: '#327',
        reason: 'docs',
      },
    });
    const out = buf();
    const ctx = {
      statePath: statePath(root),
      projectDir: root,
      rest: ['off'],
    };
    let started = false;
    const rc = await choreModeOff(ctx, {
      verbStart: async () => {
        started = true;
      },
      out,
    });
    assert.equal(rc, 0);
    assert.equal(started, false, '--resume not present → no verbStart');
    const cm = readChoreMode(root);
    assert.equal(cm.active, false);
    assert.equal(cm.previousIssue, '#327', 'previousIssue retained one cycle for debug');
    assert.match(out.text(), /tracker idle/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('chore-mode off --resume invokes verbStart with previous issue context', async () => {
  const root = createCaseRoot('chore-off-resume-');
  try {
    writeState(root, {
      active: null,
      lastActive: '#327',
      choreMode: {
        active: true,
        since: '2026-06-07T00:00:00Z',
        previousIssue: '#327',
        reason: null,
      },
    });
    const out = buf();
    const ctx = {
      statePath: statePath(root),
      projectDir: root,
      rest: ['off', '--resume'],
    };
    let startedReason = null;
    const rc = await choreModeOff(ctx, {
      verbStart: async (_ctx, reason) => {
        startedReason = reason;
      },
      out,
    });
    assert.equal(rc, 0);
    assert.equal(startedReason, 'chore-mode exit');
    const cm = readChoreMode(root);
    assert.equal(cm.active, false);
    assert.match(out.text(), /resumed #327/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('chore-mode off is idempotent when already off', async () => {
  const root = createCaseRoot('chore-off-idem-');
  try {
    writeState(root, { active: null, lastActive: null });
    const out = buf();
    const ctx = {
      statePath: statePath(root),
      projectDir: root,
      rest: ['off'],
    };
    const rc = await choreModeOff(ctx, { out });
    assert.equal(rc, 0);
    assert.match(out.text(), /already off/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('chore-mode status reports off + defaults on fresh state', () => {
  const root = createCaseRoot('chore-status-');
  try {
    const out = buf();
    const ctx = { statePath: statePath(root), projectDir: root, rest: ['status'] };
    choreModeStatus(ctx, { out });
    const text = out.text();
    assert.match(text, /chore-mode: off/);
    assert.match(text, /previousIssue: none/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
