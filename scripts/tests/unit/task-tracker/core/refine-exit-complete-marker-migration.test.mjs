// @story #357
// #357 — asserts the `aitm-refine-complete` stage-completion marker check
// has been migrated out of promote.mjs into the state-keyed exitGuards
// registry. Reads promote.mjs as text and confirms it no longer matches the
// marker regex inline. The guard module + states/refine.mjs registration
// must continue to enforce it via runGuards.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const promotePath = resolve(here, '../../../../task-tracker/verbs/promote.mjs');
const refineStatePath = resolve(here, '../../../../task-tracker/states/refine.mjs');
const guardPath = resolve(
  here,
  '../../../../task-tracker/lib/refine-exit-complete-marker-guard.mjs'
);

test('promote.mjs does not match aitm-refine-complete inline (#357)', async () => {
  const src = await readFile(promotePath, 'utf8');
  assert.ok(
    !/aitm-refine-complete/.test(src),
    'promote.mjs still references aitm-refine-complete — the marker check should live in the refineExitCompleteMarkerGuard, not inline.'
  );
});

test('refineExitCompleteMarkerGuard is registered in refine state exitGuards (#357)', async () => {
  const src = await readFile(refineStatePath, 'utf8');
  assert.ok(
    src.includes('refineExitCompleteMarkerGuard'),
    'states/refine.mjs must import + list refineExitCompleteMarkerGuard in exitGuards.'
  );
});

test('refineExitCompleteMarkerGuard module exports the expected shape (#357)', async () => {
  const mod = await import(guardPath);
  assert.equal(typeof mod.refineExitCompleteMarkerGuard, 'object');
  assert.equal(mod.refineExitCompleteMarkerGuard.id, 'refine-exit-complete-marker');
  assert.equal(typeof mod.refineExitCompleteMarkerGuard.run, 'function');
});

test('guard refuses when toState=ready-for-plan and marker absent (#357)', async () => {
  const { refineExitCompleteMarkerGuard: g } = await import(guardPath);
  const r = await g.run({ toState: 'ready-for-plan', body: '## Scope\nno marker here' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /aitm-refine-complete/);
  assert.ok(Array.isArray(r.blockers) && r.blockers.length >= 1);
});

test('guard passes when marker present (#357)', async () => {
  const { refineExitCompleteMarkerGuard: g } = await import(guardPath);
  const r = await g.run({
    toState: 'ready-for-plan',
    body: 'body\n<!-- aitm-refine-complete: 2026-06-08T00:00:00Z -->\n',
  });
  assert.equal(r.ok, true);
});

test('guard fails-open when toState is not ready-for-plan (#357)', async () => {
  const { refineExitCompleteMarkerGuard: g } = await import(guardPath);
  const r = await g.run({ toState: 'develop', body: '' });
  assert.equal(r.ok, true);
});

test('guard fails-open when ctx is missing (#357)', async () => {
  const { refineExitCompleteMarkerGuard: g } = await import(guardPath);
  const r = await g.run(undefined);
  assert.equal(r.ok, true);
});
