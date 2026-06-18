#!/usr/bin/env node
// @story #189
// Unit tests for isPausedTask in scripts/task-tracker/hook-handler.mjs.
//
// Regression coverage for #189: SessionStart hook used to interpret any
// (!active && lastActive) state as "paused", which falsely flagged
// closed-and-deregistered tasks. The hook now consults the fleet registry
// via this pure helper.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { isPausedTask } from '../../hook-handler.mjs';

test('isPausedTask: returns true when entry status is "paused"', () => {
  const fleet = { '#167': { status: 'paused' } };
  assert.equal(isPausedTask(fleet, '#167'), true);
});

test('isPausedTask: returns false when entry status is "active"', () => {
  const fleet = { '#167': { status: 'active' } };
  assert.equal(isPausedTask(fleet, '#167'), false);
});

test('isPausedTask: returns false when entry status is "done"', () => {
  const fleet = { '#167': { status: 'done' } };
  assert.equal(isPausedTask(fleet, '#167'), false);
});

test('isPausedTask: returns false when entry is absent (post-close)', () => {
  const fleet = {};
  assert.equal(isPausedTask(fleet, '#167'), false);
});

test('isPausedTask: returns false when lastActive is null', () => {
  const fleet = { '#167': { status: 'paused' } };
  assert.equal(isPausedTask(fleet, null), false);
});

test('isPausedTask: returns false when lastActive is undefined', () => {
  const fleet = { '#167': { status: 'paused' } };
  assert.equal(isPausedTask(fleet, undefined), false);
});

test('isPausedTask: returns false when fleet is null', () => {
  assert.equal(isPausedTask(null, '#167'), false);
});

test('isPausedTask: returns false when entry has no status field', () => {
  const fleet = { '#167': {} };
  assert.equal(isPausedTask(fleet, '#167'), false);
});
