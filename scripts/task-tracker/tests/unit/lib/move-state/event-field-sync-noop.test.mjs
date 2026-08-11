#!/usr/bin/env node
// @story #701
// Regression: `update-event-fields.mjs` must accept every board state and be a
// SILENT no-op for states without an event binding (backlog, assigned).
//
// Before the fix, `syncEventFields` (cache-unpark.mjs) spawned this script for
// every transition target, but the script's whitelist covered only the six
// working states — a backlog→assigned promote tripped the usage guard, exited 1,
// and the caller printed "warning: Start Time field sync failed" on every
// assigned promotion, with a repair hint that failed the same way.
//
// The drift-guard sweep spawns the script once per board state (from
// STATE_TO_CONFIG_KEY, the canonical frozen map) with the issue number
// deliberately omitted: states carrying an event binding must still
// usage-error (the sync path stays guarded), bindingless states must exit 0
// silently. A new board state added to policy.mjs is therefore forced to pick
// a side here.
//
// @story #702: the parse once aliased args[0] as the item id when --item-id
// was absent (indexOf(-1)+1), letting a flagless invocation slip past the
// usage guard and die on the live gh API. The missing-flag cases below pin
// the fixed behavior: fail fast at the guard, never reach the network.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { STATE_TO_CONFIG_KEY } from '../../../../lib/move-state/policy.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/../..';
const SCRIPT = path.resolve(__dir, '..', '../../gh/update-event-fields.mjs');
const REPO_ROOT = path.resolve(__dir, '..', '../../..');

const BOUND_STATES = new Set(['refine', 'plan', 'develop', 'test', 'review', 'done']);

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 30_000,
  });
}

test('assigned with --item-id is a silent exit-0 no-op', () => {
  const r = run(['999999', 'assigned', '--item-id', 'PVTI_fake']);
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}; stderr: ${r.stderr}`);
  assert.equal(r.stdout.trim(), '');
  assert.equal(r.stderr.trim(), '');
});

test('backlog without issue or --item-id is a silent exit-0 no-op (no-op precedes arg guard)', () => {
  const r = run(['backlog']);
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}; stderr: ${r.stderr}`);
  assert.equal(r.stdout.trim(), '');
  assert.equal(r.stderr.trim(), '');
});

test('working state with missing issue number still usage-errors (sync path stays guarded)', () => {
  const r = run(['refine', '--item-id', 'PVTI_fake']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Usage: update-event-fields\.mjs/);
});

test('event-bound state with issue number but no --item-id fails fast at the usage guard (#702)', () => {
  const r = run(['999999', 'refine']);
  assert.equal(r.status, 1, `expected exit 1, got ${r.status}; stderr: ${r.stderr}`);
  assert.match(r.stderr, /Usage: update-event-fields\.mjs/);
  assert.doesNotMatch(r.stderr, /GraphQL|Could not resolve/, 'must not reach the live gh API');
});

test('--item-id parse unchanged when the flag is supplied (bindingless state stays a silent no-op)', () => {
  const r = run(['999999', 'backlog', '--item-id', 'PVTI_fake']);
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}; stderr: ${r.stderr}`);
  assert.equal(r.stdout.trim(), '');
  assert.equal(r.stderr.trim(), '');
});

test('unrecognized state still usage-errors', () => {
  const r = run(['bogus-state', '--item-id', 'PVTI_fake']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Usage: update-event-fields\.mjs/);
});

test('drift guard: every board state is either event-bound or a silent no-op', () => {
  for (const state of Object.keys(STATE_TO_CONFIG_KEY)) {
    const r = run([state, '--item-id', 'PVTI_fake']); // issue number deliberately omitted
    if (BOUND_STATES.has(state)) {
      assert.equal(r.status, 1, `${state}: bound state must usage-error without an issue number`);
      assert.match(r.stderr, /Usage: update-event-fields\.mjs/, `${state}: expected usage`);
    } else {
      assert.equal(r.status, 0, `${state}: bindingless state must exit 0; stderr: ${r.stderr}`);
      assert.equal(r.stderr.trim(), '', `${state}: bindingless state must be silent`);
    }
  }
});
