#!/usr/bin/env node
// @story #309
// Registered by the #1090 chore-mode contract feature test.
// #327 — chore-mode state read/write helpers.
//
// Covers:
//   - default object on missing file
//   - default object on malformed JSON
//   - default object when `choreMode` key is absent
//   - round-trip write → read preserves shape
//   - write preserves unrelated keys in the global state file
//   - `isChoreModeActive` boolean shortcut

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  readChoreMode,
  writeChoreMode,
  isChoreModeActive,
  EMPTY_CHORE_MODE,
} from '../../task-tracker/lib/chore-mode.mjs';

function statePath(projectDir) {
  // #573: the global ledger lives under `.tmp/aitm/state/`.
  return path.join(projectDir, '.tmp', 'aitm', 'state', 'task-tracker-state.json');
}

export function registerChoreModeStateCases(getFixture) {
  test('readChoreMode returns defaults when state file is missing', () => {
    const tmp = getFixture().root;
    rmSync(statePath(tmp), { force: true });
    const cm = readChoreMode(tmp);
    assert.deepEqual(cm, EMPTY_CHORE_MODE);
    assert.equal(isChoreModeActive(tmp), false);
  });

  test('readChoreMode returns defaults when state JSON is malformed', () => {
    const tmp = getFixture().root;
    mkdirSync(path.dirname(statePath(tmp)), { recursive: true });
    writeFileSync(statePath(tmp), '{ not valid json');
    const cm = readChoreMode(tmp);
    assert.deepEqual(cm, EMPTY_CHORE_MODE);
  });

  test('readChoreMode returns defaults when choreMode key is absent', () => {
    const tmp = getFixture().root;
    mkdirSync(path.dirname(statePath(tmp)), { recursive: true });
    writeFileSync(statePath(tmp), JSON.stringify({ active: '#42', lastActive: '#42' }));
    const cm = readChoreMode(tmp);
    assert.deepEqual(cm, EMPTY_CHORE_MODE);
  });

  test('writeChoreMode → readChoreMode round-trip', () => {
    const tmp = getFixture().root;
    writeChoreMode(tmp, {
      active: true,
      since: '2026-06-07T01:00:00Z',
      previousIssue: '#327',
      reason: 'docs sweep',
    });
    const cm = readChoreMode(tmp);
    assert.equal(cm.active, true);
    assert.equal(cm.since, '2026-06-07T01:00:00Z');
    assert.equal(cm.previousIssue, '#327');
    assert.equal(cm.reason, 'docs sweep');
    assert.equal(isChoreModeActive(tmp), true);
  });

  test('writeChoreMode preserves other top-level keys', () => {
    const tmp = getFixture().root;
    mkdirSync(path.dirname(statePath(tmp)), { recursive: true });
    writeFileSync(
      statePath(tmp),
      JSON.stringify({
        active: '#999',
        lastActive: '#999',
        totalActiveMinutes: 42,
      })
    );
    writeChoreMode(tmp, {
      active: true,
      since: '2026-06-07T01:00:00Z',
      previousIssue: '#999',
      reason: null,
    });
    const raw = JSON.parse(readFileSync(statePath(tmp), 'utf8'));
    assert.equal(raw.active, '#999', 'pre-existing `active` must survive');
    assert.equal(raw.lastActive, '#999');
    assert.equal(raw.totalActiveMinutes, 42);
    assert.equal(raw.choreMode.active, true);
    assert.equal(raw.choreMode.previousIssue, '#999');
  });

  test('readChoreMode coerces non-string/non-boolean fields to defaults', () => {
    const tmp = getFixture().root;
    mkdirSync(path.dirname(statePath(tmp)), { recursive: true });
    writeFileSync(
      statePath(tmp),
      JSON.stringify({
        choreMode: {
          active: 'yes', // not strictly true
          since: 42,
          previousIssue: { not: 'a string' },
          reason: null,
        },
      })
    );
    const cm = readChoreMode(tmp);
    assert.equal(cm.active, false);
    assert.equal(cm.since, null);
    assert.equal(cm.previousIssue, null);
    assert.equal(cm.reason, null);
  });
}
