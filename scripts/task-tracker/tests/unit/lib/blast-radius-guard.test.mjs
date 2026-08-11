// @story #880
// #880 — the blast-radius confirmation guard in isolation.
import test from 'node:test';
import assert from 'node:assert/strict';

import { confirmBlastRadius } from '../../../lib/blast-radius-guard.mjs';

function collector() {
  const lines = [];
  return { fn: (s) => lines.push(s), lines };
}

test('0 issues never confirms', async () => {
  const log = collector();
  const warn = collector();
  const r = await confirmBlastRadius({ issueNumbers: [], log: log.fn, warn: warn.fn });
  assert.equal(r.proceed, true);
  assert.equal(r.reason, 'under-threshold');
  assert.equal(r.count, 0);
  assert.equal(warn.lines.length, 0);
  assert.match(log.lines[0], /About to write 0 issue\(s\)/);
});

test('exactly at threshold (default 1) never confirms', async () => {
  const log = collector();
  const r = await confirmBlastRadius({ issueNumbers: [42], log: log.fn });
  assert.equal(r.proceed, true);
  assert.equal(r.reason, 'under-threshold');
  assert.equal(r.count, 1);
  assert.match(log.lines[0], /About to write 1 issue\(s\): #42/);
});

test('above threshold with --yes proceeds without prompting', async () => {
  const log = collector();
  let promptCalled = false;
  const r = await confirmBlastRadius({
    issueNumbers: [1, 2, 3],
    yes: true,
    log: log.fn,
    promptFn: async () => {
      promptCalled = true;
      return 'y';
    },
  });
  assert.equal(r.proceed, true);
  assert.equal(r.reason, 'yes-flag');
  assert.equal(r.count, 3);
  assert.equal(promptCalled, false);
});

test('above threshold, non-TTY, no --yes refuses with zero prompting', async () => {
  const log = collector();
  const warn = collector();
  let promptCalled = false;
  const r = await confirmBlastRadius({
    issueNumbers: [1, 2, 3],
    isTTY: false,
    log: log.fn,
    warn: warn.fn,
    promptFn: async () => {
      promptCalled = true;
      return 'y';
    },
  });
  assert.equal(r.proceed, false);
  assert.equal(r.reason, 'non-tty-refused');
  assert.equal(promptCalled, false);
  assert.match(warn.lines[0], /refusing.*3 issue\(s\)/);
});

test('above threshold, TTY, prompt accept proceeds', async () => {
  const r = await confirmBlastRadius({
    issueNumbers: [1, 2, 3],
    isTTY: true,
    log: () => {},
    promptFn: async () => 'y',
  });
  assert.equal(r.proceed, true);
  assert.equal(r.reason, 'tty-confirmed');
});

test('above threshold, TTY, prompt decline refuses', async () => {
  const warn = collector();
  const r = await confirmBlastRadius({
    issueNumbers: [1, 2, 3],
    isTTY: true,
    log: () => {},
    warn: warn.fn,
    promptFn: async () => 'n',
  });
  assert.equal(r.proceed, false);
  assert.equal(r.reason, 'tty-declined');
  assert.match(warn.lines[0], /declined/);
});

test('issue numbers are sorted and reported regardless of input order', async () => {
  const log = collector();
  await confirmBlastRadius({ issueNumbers: [30, 10, 20], log: log.fn });
  assert.match(log.lines[0], /#10, #20, #30/);
});

test('generic write targets use the supplied label without pretending to be issues', async () => {
  const log = collector();
  const r = await confirmBlastRadius({
    targets: ['Status option OPT_ASSIGNED'],
    targetLabel: 'project Status option',
    log: log.fn,
  });
  assert.equal(r.proceed, true);
  assert.equal(r.count, 1);
  assert.match(
    log.lines[0],
    /About to write 1 project Status option\(s\): Status option OPT_ASSIGNED/
  );
  assert.doesNotMatch(log.lines[0], /#\d+/);
});

test('custom threshold shifts the boundary', async () => {
  const noConfirm = await confirmBlastRadius({
    issueNumbers: [1, 2, 3, 4, 5],
    threshold: 5,
    log: () => {},
  });
  assert.equal(noConfirm.proceed, true);
  assert.equal(noConfirm.reason, 'under-threshold');

  const needsConfirm = await confirmBlastRadius({
    issueNumbers: [1, 2, 3, 4, 5, 6],
    threshold: 5,
    isTTY: false,
    log: () => {},
    warn: () => {},
  });
  assert.equal(needsConfirm.proceed, false);
});
