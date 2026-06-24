#!/usr/bin/env node
// @story #535
// `runHeal` — the heal command core: locate an issue's ⏱ Timing Log comment,
// rewrite duplicate `start` rows to `resumed`, and write back via the
// timing-comment writer (`updateTimingComment`). I/O is injected so the
// command is exercised offline.
import { strict as assert } from 'node:assert';
import { runHeal } from '../../heal-timing-starts.mjs';

const HEADER = [
  '⏱ Timing Log',
  '',
  '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |',
  '|---|---|---|---|---|---|---|',
];
const log = (...rows) => [...HEADER, ...rows].join('\n');

const DUP = log(
  '| 2026-06-24 09:00 -05:00 | start | 0 | 0 | 0 | 100 | first |',
  '| 2026-06-24 11:00 -05:00 | start | 0 | 0 | 0 | 150 | back |'
);

function fakeDeps(commentBody) {
  const calls = { update: [] };
  return {
    calls,
    findTimingComment: async () =>
      commentBody == null ? null : { id: 'C_kwDO', url: 'u', body: commentBody },
    updateTimingComment: async (id, repo, body) => {
      calls.update.push({ id, repo, body });
    },
  };
}

// ---- 1. --check-only on a duplicate log reports but does not write ----------
{
  const deps = fakeDeps(DUP);
  const res = await runHeal({ issueNumber: '526', repo: 'o/r', apply: false, deps });
  assert.equal(res.status, 'dry-run');
  assert.equal(res.startsBefore, 2);
  assert.equal(res.startsAfter, 1, 'healed body would carry exactly one start');
  assert.equal(deps.calls.update.length, 0, 'check-only must not write');
}

// ---- 2. --apply heals and writes via updateTimingComment -------------------
{
  const deps = fakeDeps(DUP);
  const res = await runHeal({ issueNumber: '526', repo: 'o/r', apply: true, deps });
  assert.equal(res.status, 'healed');
  assert.equal(res.startsBefore, 2);
  assert.equal(res.startsAfter, 1);
  assert.equal(deps.calls.update.length, 1, 'apply must write exactly once');
  const written = deps.calls.update[0].body;
  assert.match(written, /\| start \|/);
  assert.match(written, /\| resumed \|/);
  assert.equal((written.match(/\| start \|/g) || []).length, 1, 'one start row in the write');
}

// ---- 3. Already-canonical log — no write -----------------------------------
{
  const deps = fakeDeps(log('| 2026-06-24 09:00 -05:00 | start | 0 | 0 | 0 | 100 | first |'));
  const res = await runHeal({ issueNumber: '526', repo: 'o/r', apply: true, deps });
  assert.equal(res.status, 'already-canonical');
  assert.equal(res.startsBefore, 1);
  assert.equal(deps.calls.update.length, 0, 'canonical log needs no write');
}

// ---- 4. No timing comment — graceful no-op ---------------------------------
{
  const deps = fakeDeps(null);
  const res = await runHeal({ issueNumber: '999', repo: 'o/r', apply: true, deps });
  assert.equal(res.status, 'no-comment');
  assert.equal(deps.calls.update.length, 0);
}

console.log('heal-timing-starts-command.test.mjs: ok');
