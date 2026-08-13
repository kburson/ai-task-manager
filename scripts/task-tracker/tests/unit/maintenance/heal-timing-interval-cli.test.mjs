// @story #1249
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  main,
  parseArgs,
  printUsage,
  runHealTimingInterval,
} from '../../../heal-timing-interval.mjs';
import { EXECUTABLE_ENTRYPOINTS } from '../../../lib/command-surface/entrypoints.mjs';
import { proposeTimingIntervalRepair } from '../../../lib/heal-timing-interval.mjs';
import { emitSelfDoc } from '../../../../lib/self-doc.mjs';

const header = `⏱ Timing Log

| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Full Word Marker |
|---|---|---|---|---|---|---|---|`;
const body = `${header}
| 2026-08-13 10:00:00 -05:00 | develop:started |  |  |  | 100 | fixture | 200 | <!-- row-sec: a=0 i=0 -->
| 2026-08-13 10:10:00 -05:00 | develop:completed | 0h 10m 00s |  | 20 | 120 | fixture | 240 | <!-- row-sec: a=600 i=0 -->
`;
const start = '2026-08-13T10:02:00-05:00';
const end = '2026-08-13T10:06:00-05:00';
const intended = proposeTimingIntervalRepair(body, { start, end }).body;

function ioHarness(initial = body) {
  let current = initial;
  const updates = [];
  const deps = {
    findTimingComment: async () => ({ id: 'IC_1249', body: current }),
    updateTimingComment: async (id, repo, nextBody) => {
      updates.push({ id, repo, body: nextBody });
      current = nextBody;
    },
  };
  return { deps, updates, read: () => current, write: (value) => (current = value) };
}

test('dry-run reports authoritative before and after totals without writing', async () => {
  const harness = ioHarness();
  const result = await runHealTimingInterval({
    issueNumber: 1249,
    repo: 'kburson/ai-task-manager',
    start,
    end,
    apply: false,
    deps: harness.deps,
  });

  assert.equal(result.status, 'dry-run');
  assert.equal(result.intervalSec, 240);
  assert.equal(result.before.totalActiveSec, 600);
  assert.equal(result.after.totalActiveSec, 360);
  assert.deepEqual(harness.updates, []);
  assert.equal(harness.read(), body);
});

test('apply writes once and requires exact fresh read-back', async () => {
  const harness = ioHarness();
  const result = await runHealTimingInterval({
    issueNumber: 1249,
    repo: 'kburson/ai-task-manager',
    start,
    end,
    apply: true,
    deps: harness.deps,
  });

  assert.equal(result.status, 'healed');
  assert.equal(harness.updates.length, 1);
  assert.equal(harness.updates[0].body, intended);
  assert.equal(harness.read(), intended);

  const mismatch = ioHarness();
  mismatch.deps.updateTimingComment = async () => {};
  await assert.rejects(
    () =>
      runHealTimingInterval({
        issueNumber: 1249,
        repo: 'kburson/ai-task-manager',
        start,
        end,
        apply: true,
        deps: mismatch.deps,
      }),
    /exact read-back/i
  );
});

test('ambiguous update is reconciled only when the intended body landed', async () => {
  const landed = ioHarness();
  landed.deps.updateTimingComment = async (_id, _repo, nextBody) => {
    landed.write(nextBody);
    throw new Error('transport lost after write');
  };
  const recovered = await runHealTimingInterval({
    issueNumber: 1249,
    repo: 'kburson/ai-task-manager',
    start,
    end,
    apply: true,
    deps: landed.deps,
  });
  assert.equal(recovered.status, 'healed-after-ambiguous-write');

  const absent = ioHarness();
  absent.deps.updateTimingComment = async () => {
    throw new Error('transport failed before write');
  };
  await assert.rejects(
    () =>
      runHealTimingInterval({
        issueNumber: 1249,
        repo: 'kburson/ai-task-manager',
        start,
        end,
        apply: true,
        deps: absent.deps,
      }),
    (error) => error.cause?.message === 'transport failed before write'
  );

  let reads = 0;
  const unreadable = ioHarness();
  unreadable.deps.findTimingComment = async () => {
    reads += 1;
    if (reads === 1) return { id: 'IC_1249', body };
    throw new Error('read-back transport failed');
  };
  unreadable.deps.updateTimingComment = async () => {
    throw new Error('ambiguous update transport failed');
  };
  await assert.rejects(
    () =>
      runHealTimingInterval({
        issueNumber: 1249,
        repo: 'kburson/ai-task-manager',
        start,
        end,
        apply: true,
        deps: unreadable.deps,
      }),
    (error) =>
      error.cause?.message === 'ambiguous update transport failed' &&
      error.readBackCause?.message === 'read-back transport failed'
  );
});

test('an exact prior repair is a no-write idempotent success', async () => {
  const harness = ioHarness(intended);
  const result = await runHealTimingInterval({
    issueNumber: 1249,
    repo: 'kburson/ai-task-manager',
    start,
    end,
    apply: true,
    deps: harness.deps,
  });
  assert.equal(result.status, 'already-applied');
  assert.deepEqual(harness.updates, []);
});

test('strict argv requires one issue and complete unique interval options', () => {
  assert.deepEqual(parseArgs(['1249', '--start', start, '--end', end]), {
    issue: '1249',
    start,
    end,
    apply: false,
    yes: false,
    help: false,
  });
  assert.throws(() => parseArgs(['1249', '--start', start]), /--end is required/i);
  assert.throws(
    () => parseArgs(['1249', '--start', start, '--start', start, '--end', end]),
    /duplicate --start/i
  );
  assert.throws(() => parseArgs(['1249', '--start', '', '--end', end]), /--start.*non-empty/i);
  assert.throws(
    () => parseArgs(['1249', '--start', start, '--end', end, '--apply', '--check-only']),
    /cannot combine --apply and --check-only/i
  );

  let usage = '';
  printUsage({ write: (chunk) => (usage += chunk) });
  assert.match(usage, /--start TIMESTAMP --end TIMESTAMP/);
  assert.match(usage, /dry-run is the default/i);
  assert.match(usage, /timing-v2/i);
});

test('main serializes the full operation under the issue timing lock', async () => {
  const out = [];
  const err = [];
  const exits = [];
  const locks = [];
  const calls = [];
  await main(['1249', '--start', start, '--end', end], {
    out: { write: (chunk) => out.push(chunk) },
    err: { write: (chunk) => err.push(chunk) },
    exit: (code) => exits.push(code),
    loadConfig: async () => ({ repo: 'kburson/ai-task-manager' }),
    getProjectDir: () => '/project',
    withLock: async (path, fn, options) => {
      locks.push({ path, options });
      return fn();
    },
    runHealTimingInterval: async (input) => {
      calls.push(input);
      return {
        status: 'dry-run',
        phaseEvent: 'develop:started',
        intervalSec: 240,
        before: { totalActiveSec: 600, totalIdleSec: 0 },
        after: { totalActiveSec: 360, totalIdleSec: 240 },
      };
    },
  });

  assert.deepEqual(exits, []);
  assert.equal(err.join(''), '');
  assert.equal(locks.length, 1);
  assert.match(locks[0].path, /1249/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].apply, false);
  assert.match(out.join(''), /active 600s → 360s/);
  assert.match(out.join(''), /idle 0s → 240s/);
});

test('main obtains blast-radius authority before an apply operation', async () => {
  const exits = [];
  let ran = false;
  await main(['1249', '--start', start, '--end', end, '--apply'], {
    out: { write() {} },
    err: { write() {} },
    exit: (code) => exits.push(code),
    loadConfig: async () => ({ repo: 'kburson/ai-task-manager' }),
    confirmBlastRadius: async () => ({ proceed: false }),
    runHealTimingInterval: async () => {
      ran = true;
    },
  });
  assert.deepEqual(exits, [2]);
  assert.equal(ran, false);
});

test('the installed command is classified and self-documents its authority boundary', () => {
  const entry = EXECUTABLE_ENTRYPOINTS.find(
    (candidate) => candidate.path === 'scripts/task-tracker/heal-timing-interval.mjs'
  );
  assert.equal(entry?.classification, 'live-maintenance-or-migration');

  let doc = '';
  emitSelfDoc('heal-timing-interval', (chunk) => (doc += chunk));
  assert.match(doc, /--start TIMESTAMP/);
  assert.match(doc, /--end TIMESTAMP/);
  assert.match(doc, /dry-run by default/i);
  assert.match(doc, /timing lock/i);
  assert.match(doc, /exact read-back/i);
});
