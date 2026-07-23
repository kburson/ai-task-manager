#!/usr/bin/env node
// @story #281
// #281 — pure-formatter coverage for stage-bound-reason.mjs.
//
// Pin the refusal-message shape so future edits don't silently drop the
// state / action / next-transition triple (AC5) or the grandfather hint.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  formatStageBoundRefusal,
  hasStageBoundGrandfather,
} from '../../../lib/stage-bound-reason.mjs';

test('refusal message names state, action, and next transition (AC5)', () => {
  const msg = formatStageBoundRefusal({
    state: 'refine',
    action: 'introducing a `## Deep-Dive Analysis` section',
    nextVerb: '/task promote',
    nextState: 'plan',
    issueNumber: 281,
  });
  assert.match(msg, /stage-bound refusal/);
  assert.match(msg, /state `refine`/);
  assert.match(msg, /Deep-Dive Analysis/);
  assert.match(msg, /#281/);
  assert.match(msg, /\/task promote → plan/);
  assert.match(msg, /aitm-stage-bound-grandfather/);
  // Legacy verb name MUST NOT appear.
  assert.doesNotMatch(msg, /\/task move /);
});

test('issueNumber omitted → falls back to "the active task"', () => {
  const msg = formatStageBoundRefusal({
    state: 'plan',
    action: 'running `git commit`',
    nextVerb: '/task promote',
    nextState: 'develop',
  });
  assert.match(msg, /the active task/);
  assert.match(msg, /state `plan`/);
  assert.match(msg, /\/task promote → develop/);
});

test('hasStageBoundGrandfather detects the marker (case-insensitive)', () => {
  assert.equal(hasStageBoundGrandfather(''), false);
  assert.equal(hasStageBoundGrandfather('no marker here'), false);
  assert.equal(hasStageBoundGrandfather('<!-- aitm-stage-bound-grandfather -->'), true);
  assert.equal(hasStageBoundGrandfather('<!--  aitm-stage-bound-grandfather  -->'), true);
  assert.equal(hasStageBoundGrandfather('<!-- AITM-STAGE-BOUND-GRANDFATHER -->'), true);
  // Different marker — must not match.
  assert.equal(hasStageBoundGrandfather('<!-- aitm-stage-bound-other -->'), false);
});

console.log('stage-bound-reason.test.mjs: all passed');
