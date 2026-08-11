// @story #648
// Offline coverage-lift for scripts/gh/init-repair.mjs. Drives runRepair() and
// fetchStatusOptions() through the injectable `deps` seam — no filesystem, no
// gql, no live board. Covers the missing-config exit, the missing-field exit,
// the all-populated early return, the network option-fetch match/write path,
// the skipNetwork fake-options path, the unmatched-key branch, and the
// no-fill (nothing written) branch.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runRepair, fetchStatusOptions } from '../../../../gh/init-repair.mjs';

const ALL_COLUMNS = ['backlog', 'assigned', 'refine', 'plan', 'develop', 'test', 'review', 'done'];

// Options list where every kanban column maps to `<name>-id`.
const FULL_OPTIONS = ALL_COLUMNS.map((name) => ({ id: `${name}-id`, name }));

// Build a deps bundle: an in-memory config file plus log/err/exit collectors.
function harness({ cfg, exists = true, gql } = {}) {
  const logs = [];
  const errs = [];
  const exits = [];
  const writes = [];
  const overrides = {
    getProjectDir: () => '/proj',
    existsSync: () => exists,
    readFileSync: () => JSON.stringify(cfg),
    writeFileSync: (p, data) => writes.push({ p, data }),
    mkdirSync: () => {},
    gql: gql || (async () => ({})),
    log: (s) => logs.push(s),
    err: (s) => errs.push(s),
    exit: (c) => exits.push(c),
  };
  return { overrides, logs, errs, exits, writes };
}

test('missing config file → err + exit 1', async () => {
  const h = harness({ exists: false });
  await runRepair(h.overrides);
  assert.deepEqual(h.exits, [1]);
  assert.match(h.errs.join(''), /No config found/);
});

test('config missing projectId/kanbanFieldId → err + exit 1', async () => {
  const h = harness({ cfg: { repo: 'o/r' } });
  await runRepair(h.overrides);
  assert.deepEqual(h.exits, [1]);
  assert.match(h.errs.join(''), /missing projectId or kanbanFieldId/);
});

test('all kanbanOption* already populated → early return, no write', async () => {
  const cfg = { projectId: 'P', kanbanFieldId: 'K' };
  for (const c of ALL_COLUMNS) {
    cfg[
      'kanbanOption' + c.replace(/(^| )(\w)/g, (_, __, ch) => ch.toUpperCase()).replace(/ /g, '')
    ] = `${c}-id`;
  }
  const h = harness({ cfg });
  const res = await runRepair(h.overrides);
  assert.equal(res.filled.length, 0);
  assert.equal(res.alreadySet.length, 8);
  assert.equal(h.writes.length, 0);
  assert.match(h.logs.join('\n'), /Nothing to repair/);
});

test('network path: fetches options, fills every empty key, writes config', async () => {
  const cfg = { projectId: 'P', kanbanFieldId: 'K' };
  const gql = async () => ({
    node: { fields: { nodes: [{ id: 'K', name: 'Status', options: FULL_OPTIONS }] } },
  });
  const h = harness({ cfg, gql });
  const res = await runRepair({ ...h.overrides, skipNetwork: false });
  assert.equal(res.filled.length, 8);
  assert.equal(res.unmatched.length, 0);
  assert.equal(h.writes.length, 1);
  assert.match(h.writes[0].data, /backlog-id/);
  assert.match(h.logs.join('\n'), /Filled: /);
});

test('skipNetwork with fakeOptions: partial match logs Already set + Unmatched', async () => {
  // Only backlog is pre-set; options only cover backlog+refine, so the rest are
  // unmatched. Exercises alreadySet + unmatched log branches and a real write.
  const cfg = { projectId: 'P', kanbanFieldId: 'K', kanbanOptionBacklog: 'pre' };
  const fakeOptions = [
    { id: 'refine-id', name: 'Refine' },
    { id: 'plan-id', name: 'Plan' },
  ];
  const h = harness({ cfg });
  const res = await runRepair({ ...h.overrides, skipNetwork: true, fakeOptions });
  assert.deepEqual(res.filled.sort(), ['kanbanOptionPlan', 'kanbanOptionRefine']);
  assert.ok(res.alreadySet.includes('kanbanOptionBacklog'));
  assert.ok(res.unmatched.includes('kanbanOptionDone'));
  assert.equal(h.writes.length, 1);
  assert.match(h.logs.join('\n'), /Already set:/);
  assert.match(h.logs.join('\n'), /Unmatched/);
});

test('skipNetwork with no options → nothing filled, no write', async () => {
  const cfg = { projectId: 'P', kanbanFieldId: 'K' };
  const h = harness({ cfg });
  const res = await runRepair({ ...h.overrides, skipNetwork: true, fakeOptions: null });
  assert.equal(res.filled.length, 0);
  assert.equal(res.unmatched.length, 8);
  assert.equal(h.writes.length, 0);
  assert.match(h.logs.join('\n'), /Filled: \(none\)/);
});

// ── direct unit test for the exported helper ─────────────────────────────────
test('fetchStatusOptions matches by field id, else by name "status"', async () => {
  const byId = async () => ({
    node: { fields: { nodes: [{ id: 'K', name: 'Whatever', options: [{ id: 'a', name: 'A' }] }] } },
  });
  assert.deepEqual(await fetchStatusOptions('P', 'K', byId), [{ id: 'a', name: 'A' }]);

  const byName = async () => ({
    node: { fields: { nodes: [{ id: 'X', name: 'Status', options: [{ id: 'b', name: 'B' }] }] } },
  });
  assert.deepEqual(await fetchStatusOptions('P', 'K', byName), [{ id: 'b', name: 'B' }]);

  const none = async () => ({ node: { fields: { nodes: [] } } });
  assert.deepEqual(await fetchStatusOptions('P', 'K', none), []);
});
