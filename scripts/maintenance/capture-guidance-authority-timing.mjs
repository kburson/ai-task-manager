#!/usr/bin/env node
// @story #1770
// Explicit read-only timing capture. Never run as part of deterministic regeneration.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

import { measureFixedActionAuthorityReads } from '../tests/helpers/action-authority-cost.mjs';
import { createObservationAttempt } from '../task-tracker/lib/action-decision/observations.mjs';

const round = (value) => Number(value.toFixed(3));
const local = [];
const cache = [];
for (let index = 0; index < 5; index++) {
  const started = performance.now();
  await measureFixedActionAuthorityReads();
  local.push(round(performance.now() - started));
  const attempt = createObservationAttempt({
    repository: 'example/project',
    issue: 1770,
    boundaryId: `cache-timing:${index}`,
    now: () => '2026-09-23T00:00:00.000Z',
    read: async (request) => ({ ...request, value: { number: 1770 } }),
  });
  const request = { resource: 'issue-body', identity: 'issue:1770', scope: 'timing' };
  await attempt.observe(request);
  const cacheStarted = performance.now();
  for (let hit = 0; hit < 100; hit++) await attempt.observe(request);
  cache.push(round(performance.now() - cacheStarted));
  attempt.finish();
}
const command = [
  'issue',
  'view',
  '1770',
  '-R',
  'kburson/ai-task-manager',
  '--json',
  'number,state',
];
const live = [];
for (let index = 0; index < 5; index++) {
  const started = performance.now();
  const result = spawnSync('gh', command, { encoding: 'utf8', timeout: 30000 });
  if (result.status !== 0) throw new Error(result.stderr || 'controlled live read failed');
  live.push(round(performance.now() - started));
}
const artifact = {
  schema: 'aitm.guidance-authority-timing-input/v1',
  observedAt: new Date().toISOString(),
  localStub: {
    kind: 'local-stub',
    method: 'measureFixedActionAuthorityReads with deterministic observation-port fixture',
    samplesMs: local,
    mutations: 0,
  },
  localCache: {
    kind: 'local-cache',
    method: '100 same-attempt observation memo hits after one fixture read',
    samplesMs: cache,
    mutations: 0,
  },
  controlledLive: {
    kind: 'controlled-read-only',
    command: ['gh', ...command],
    samplesMs: live,
    mutations: 0,
  },
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
};
writeFileSync(
  'scripts/tests/fixtures/1558/authority-after-timing.json',
  `${JSON.stringify(artifact, null, 2)}\n`
);
