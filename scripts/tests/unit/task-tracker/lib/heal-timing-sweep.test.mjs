#!/usr/bin/env node
// @story #539
// Backlog-wide duplicate-`start` sweep — `auditBacklog` (read-only) and
// `healBacklog` (apply). All I/O is injected (issue list + comment reader +
// per-issue healer), so the sweep runs offline.
import { strict as assert } from 'node:assert';
import {
  auditBacklog,
  healBacklog,
  countStartRows,
} from '../../../../task-tracker/lib/heal-timing-sweep.mjs';

const HEADER = [
  '⏱ Timing Log',
  '',
  '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |',
  '|---|---|---|---|---|---|---|',
];
const log = (...rows) => [...HEADER, ...rows].join('\n');

const CLEAN = log('| 2026-06-24 09:00 -05:00 | start | 0 | 0 | 0 | 100 | first |');
const DUP2 = log(
  '| 2026-06-24 09:00 -05:00 | start | 0 | 0 | 0 | 100 | first |',
  '| 2026-06-24 11:00 -05:00 | start | 0 | 0 | 0 | 150 | back |'
);
const DUP3 = log(
  '| 2026-06-24 09:00 -05:00 | start | 0 | 0 | 0 | 100 | a |',
  '| 2026-06-24 10:00 -05:00 | start | 0 | 0 | 0 | 120 | b |',
  '| 2026-06-24 11:00 -05:00 | start | 0 | 0 | 0 | 150 | c |'
);

// Reuse-check: the sweep re-exports the #535 core, not a private copy.
{
  assert.equal(countStartRows(DUP2), 2, 'core countStartRows reachable through sweep');
  assert.equal(countStartRows(CLEAN), 1);
}

function reader(map) {
  return async (issue) => map[issue] ?? '';
}

// ---- 1. auditBacklog flags only >1-start logs, never writes -----------------
{
  const bodies = { 1: CLEAN, 2: DUP2, 3: DUP3, 4: '' };
  const audit = await auditBacklog({ issues: [1, 2, 3, 4], readTimingBody: reader(bodies) });

  assert.equal(audit.totalIssues, 4);
  assert.equal(audit.totalCorrupted, 2, 'issues 2 and 3 are corrupted');
  assert.equal(audit.totalExtraStarts, 1 + 2, 'extra starts = (2-1)+(3-1)');
  assert.deepEqual(
    audit.corrupted.map((c) => c.issue),
    [2, 3]
  );
  const row1 = audit.rows.find((r) => r.issue === 1);
  assert.equal(row1.corrupted, false);
  assert.equal(row1.extraStarts, 0);
  const row4 = audit.rows.find((r) => r.issue === 4);
  assert.equal(row4.starts, 0, 'no timing comment -> 0 starts');
  assert.equal(row4.corrupted, false);
}

// ---- 2. healBacklog calls healOne once per corrupted issue ------------------
{
  const bodies = { 1: CLEAN, 2: DUP2, 3: DUP3 };
  const calls = [];
  const healOne = async (issue) => {
    calls.push(issue);
    return { status: 'healed', startsBefore: countStartRows(bodies[issue]), startsAfter: 1 };
  };
  const res = await healBacklog({
    issues: [1, 2, 3],
    readTimingBody: reader(bodies),
    healOne,
  });

  assert.deepEqual(calls, [2, 3], 'heals only the corrupted issues, in order');
  assert.equal(res.totalHealed, 2);
  assert.equal(res.failed.length, 0);
  assert.equal(res.healed.find((h) => h.issue === 3).result.startsBefore, 3);
}

// ---- 3. A throwing healOne is captured per-issue, sweep continues -----------
{
  const bodies = { 2: DUP2, 3: DUP3 };
  const healOne = async (issue) => {
    if (issue === 2) throw new Error('boom');
    return { status: 'healed', startsBefore: 3, startsAfter: 1 };
  };
  const res = await healBacklog({
    issues: [2, 3],
    readTimingBody: reader(bodies),
    healOne,
  });

  assert.equal(res.totalHealed, 1, 'issue 3 still healed despite issue 2 failing');
  assert.equal(res.failed.length, 1);
  assert.equal(res.failed[0].issue, 2);
  assert.match(res.failed[0].error, /boom/);
}

// ---- 4. Idempotent convergence: a re-run over healed logs finds nothing -----
{
  // Simulate the second pass: every body is now canonical (one start).
  const bodies = { 1: CLEAN, 2: CLEAN, 3: CLEAN };
  const calls = [];
  const res = await healBacklog({
    issues: [1, 2, 3],
    readTimingBody: reader(bodies),
    healOne: async (issue) => {
      calls.push(issue);
      return { status: 'already-canonical' };
    },
  });
  assert.equal(res.totalCorrupted, 0, 'no corruption remains on re-run');
  assert.deepEqual(calls, [], 'healOne never invoked when nothing is corrupted');
}

// ---- 5. Empty backlog is a clean no-op -------------------------------------
{
  const audit = await auditBacklog({ issues: [], readTimingBody: reader({}) });
  assert.equal(audit.totalIssues, 0);
  assert.equal(audit.totalCorrupted, 0);
  assert.equal(audit.totalExtraStarts, 0);
}

// ---- 6. Guard rails on missing injected deps -------------------------------
{
  await assert.rejects(() => auditBacklog({ issues: [1] }), /readTimingBody/);
  await assert.rejects(
    () => auditBacklog({ readTimingBody: reader({}) }),
    /issues\[\] is required/
  );
  await assert.rejects(() => healBacklog({ issues: [1], readTimingBody: reader({}) }), /healOne/);
}

console.log('heal-timing-sweep.test.mjs: all assertions passed');
