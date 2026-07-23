#!/usr/bin/env node
// @story #183
// Visit-aware diagnostics for heal-entry-markers.mjs (#183): the heal script
// consults LEGAL_TRANSITIONS via detectIllegalArcs so legitimate loops
// (review→develop, etc.) are not flagged as bugs while genuine illegal arcs
// (e.g. done→backlog direct) still produce a diagnostic.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { detectIllegalArcs, checkOnlyExitCode } from '../../../heal-entry-markers.mjs';

function entry(stage, ts, visit) {
  const suffix = visit && visit > 1 ? `-${visit}` : '';
  return `<!-- aitm-entered-${stage}${suffix}: ${ts} -->`;
}

test('pure-forward chain: no illegal arcs', () => {
  const body = [
    entry('refine', '2026-05-18T10:00:00Z'),
    entry('plan', '2026-05-18T11:00:00Z'),
    entry('develop', '2026-05-18T12:00:00Z'),
    entry('test', '2026-05-18T13:00:00Z'),
    entry('review', '2026-05-18T14:00:00Z'),
  ].join('\n');
  assert.deepEqual(detectIllegalArcs(body), []);
});

test('one-loop case (review→develop re-entry): not flagged', () => {
  const body = [
    entry('refine', '2026-05-18T10:00:00Z'),
    entry('plan', '2026-05-18T11:00:00Z'),
    entry('develop', '2026-05-18T12:00:00Z', 1),
    entry('test', '2026-05-18T13:00:00Z'),
    entry('review', '2026-05-18T14:00:00Z'),
    entry('develop', '2026-05-18T15:00:00Z', 2),
    entry('test', '2026-05-18T16:00:00Z', 2),
    entry('review', '2026-05-18T17:00:00Z', 2),
  ].join('\n');
  assert.deepEqual(detectIllegalArcs(body), []);
});

test('multi-loop case: not flagged', () => {
  const body = [
    entry('refine', '2026-05-18T10:00:00Z'),
    entry('plan', '2026-05-18T11:00:00Z'),
    entry('develop', '2026-05-18T12:00:00Z', 1),
    entry('refine', '2026-05-18T12:30:00Z', 2),
    entry('plan', '2026-05-18T13:00:00Z', 2),
    entry('develop', '2026-05-18T14:00:00Z', 2),
    entry('test', '2026-05-18T15:00:00Z'),
    entry('review', '2026-05-18T16:00:00Z'),
    entry('develop', '2026-05-18T17:00:00Z', 3),
  ].join('\n');
  assert.deepEqual(detectIllegalArcs(body), []);
});

test('illegal arc detection: backlog→develop direct', () => {
  const body = [
    entry('backlog', '2026-05-18T10:00:00Z'),
    entry('develop', '2026-05-18T11:00:00Z'),
  ].join('\n');
  const arcs = detectIllegalArcs(body);
  assert.equal(arcs.length, 1);
  assert.equal(arcs[0].from, 'backlog');
  assert.equal(arcs[0].to, 'develop');
  assert.equal(arcs[0].atTs, '2026-05-18T11:00:00Z');
});

test('illegal arc detection: done→backlog without intermediate', () => {
  const body = [
    entry('refine', '2026-05-18T10:00:00Z'),
    entry('plan', '2026-05-18T11:00:00Z'),
    entry('develop', '2026-05-18T12:00:00Z'),
    entry('test', '2026-05-18T13:00:00Z'),
    entry('review', '2026-05-18T14:00:00Z'),
    entry('done', '2026-05-18T15:00:00Z'),
    entry('backlog', '2026-05-18T16:00:00Z', 2),
  ].join('\n');
  const arcs = detectIllegalArcs(body);
  assert.equal(arcs.length, 1);
  assert.equal(arcs[0].from, 'done');
  assert.equal(arcs[0].to, 'backlog');
});

test('legacy single-visit chain (no visit suffixes): no illegal arcs', () => {
  const body = [
    entry('refine', '2026-05-18T10:00:00Z'),
    entry('plan', '2026-05-18T11:00:00Z'),
    entry('develop', '2026-05-18T12:00:00Z'),
  ].join('\n');
  assert.deepEqual(detectIllegalArcs(body), []);
});

test('empty body returns empty', () => {
  assert.deepEqual(detectIllegalArcs(''), []);
  assert.deepEqual(detectIllegalArcs(null), []);
});

test('checkOnlyExitCode: illegal-arcs result exits 1', () => {
  assert.equal(checkOnlyExitCode([{ action: 'illegal-arcs', illegalArcs: [{}] }]), 1);
  assert.equal(checkOnlyExitCode([{ action: 'skip' }]), 0);
  assert.equal(checkOnlyExitCode([{ action: 'plan' }]), 1);
  assert.equal(checkOnlyExitCode([{ action: 'error' }]), 2);
});
