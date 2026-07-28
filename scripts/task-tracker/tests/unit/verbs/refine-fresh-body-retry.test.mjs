#!/usr/bin/env node
// @story #1017
// Regression coverage for the create → first Refine stale-body boundary.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { refreshPreRefineContiguity } from '../../../lib/move-state/contiguity-refresh.mjs';

const refusal = (extra = []) => ({
  ok: false,
  refusals: [
    {
      id: 'contiguity-entry',
      reason: 'contiguity-hole — missing prior-stage entry marker(s): aitm-entered-backlog',
      blockers: ['aitm-entered-backlog'],
    },
    ...extra,
  ],
});

test('stale backlog body recovers from one fresh read before the first Refine walk', async () => {
  let reads = 0;
  const initialBody = '## Scope\n\nstale snapshot';
  const result = await refreshPreRefineContiguity({
    fromState: 'backlog',
    toState: 'on-deck',
    issueNumber: 1017,
    body: initialBody,
    guardResult: refusal(),
    fetchFreshBody: async () => {
      reads += 1;
      return `${initialBody}\n<!-- aitm-entered-backlog ts="2026-07-28T00:05:14Z" -->`;
    },
  });

  assert.equal(reads, 1);
  assert.equal(result.refreshed, true);
  assert.equal(result.guardResult.ok, true);
  assert.deepEqual(result.guardResult.refusals, []);
  assert.equal(
    initialBody,
    '## Scope\n\nstale snapshot',
    'the retry helper must not mutate a body'
  );
});

test('on-deck → refine can recover when the refreshed body contains both prior markers', async () => {
  const result = await refreshPreRefineContiguity({
    fromState: 'on-deck',
    toState: 'refine',
    issueNumber: 1017,
    body: '',
    guardResult: refusal(),
    fetchFreshBody: async () =>
      [
        '<!-- aitm-entered-backlog ts="2026-07-28T00:05:14Z" -->',
        '<!-- aitm-entered-on-deck ts="2026-07-28T00:06:14Z" -->',
      ].join('\n'),
  });

  assert.equal(result.guardResult.ok, true);
  assert.equal(result.attempts, 1);
});

test('genuine marker absence remains fail-closed after exactly one fresh read', async () => {
  let reads = 0;
  const original = refusal();
  const result = await refreshPreRefineContiguity({
    fromState: 'backlog',
    toState: 'on-deck',
    issueNumber: 1017,
    body: '',
    guardResult: original,
    fetchFreshBody: async () => {
      reads += 1;
      return '## Scope\n\nstill genuinely absent';
    },
  });

  assert.equal(reads, 1);
  assert.equal(result.refreshed, false);
  assert.equal(result.guardResult, original);
});

test('fresh-read failure preserves the original refusal', async () => {
  const original = refusal();
  const result = await refreshPreRefineContiguity({
    fromState: 'backlog',
    toState: 'on-deck',
    issueNumber: 1017,
    body: '',
    guardResult: original,
    fetchFreshBody: async () => {
      throw new Error('TLS handshake timeout');
    },
  });

  assert.equal(result.refreshed, false);
  assert.equal(result.guardResult, original);
  assert.match(result.refreshError, /TLS handshake timeout/);
});

test('non-pre-Refine arcs do not perform the fresh read', async () => {
  let reads = 0;
  const original = refusal();
  const result = await refreshPreRefineContiguity({
    fromState: 'plan',
    toState: 'develop',
    issueNumber: 1017,
    body: '',
    guardResult: original,
    fetchFreshBody: async () => {
      reads += 1;
      return '<!-- aitm-entered-plan ts="2026-07-28T00:05:14Z" -->';
    },
  });

  assert.equal(reads, 0);
  assert.equal(result.guardResult, original);
});

test('successful contiguity refresh preserves unrelated refusals', async () => {
  const blocked = { id: 'blocked-by-not-done', reason: 'blocker remains open' };
  const result = await refreshPreRefineContiguity({
    fromState: 'backlog',
    toState: 'on-deck',
    issueNumber: 1017,
    body: '',
    guardResult: refusal([blocked]),
    fetchFreshBody: async () => '<!-- aitm-entered-backlog ts="2026-07-28T00:05:14Z" -->',
  });

  assert.equal(result.guardResult.ok, false);
  assert.deepEqual(result.guardResult.refusals, [blocked]);
});
