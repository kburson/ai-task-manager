// @story #1006

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { stateIds } from '../../../lib/lifecycle-policy/index.mjs';

const AUDIT_PATH = 'docs/superpowers/specs/2026-07-28-operational-state-engine-jit-audit.md';
const audit = readFileSync(join(process.cwd(), AUDIT_PATH), 'utf8');

const EXPECTED_INPUTS = [
  819, 899, 902, 921, 927, 932, 947, 952, 953, 963, 968, 972, 981, 983, 984, 994, 1003, 1004,
];

test('#1006 JIT audit records the converged entry milestone and scope contract', () => {
  assert.match(audit, /\*\*Entry tree:\*\* `5add5b0`/);
  assert.match(audit, /\*\*Post-defect tree:\*\* `d4317d2`/);
  assert.match(audit, /\*\*Completion tree:\*\* `91379bf`/);
  assert.match(audit, /#1012 Closed\/Done/);
  assert.deepEqual(stateIds(), [
    'backlog',
    'refine',
    'ready-for-plan',
    'plan',
    'develop',
    'test',
    'review',
    'done',
  ]);
  assert.match(
    audit,
    /does not\s+reopen lifecycle, timing-event, or command-surface policy ownership/
  );
  assert.match(audit, /Correctness defects\s+block #1006/);
});

test('#1006 JIT audit maps every assigned evidence input exactly once', () => {
  const rows = [...audit.matchAll(/^\| #(\d+)\s+\|/gm)].map((match) => Number(match[1]));
  assert.deepEqual(rows, EXPECTED_INPUTS);
});

test('#1006 JIT audit gives every evidence row concrete ownership and regression evidence', () => {
  const rows = audit.split('\n').filter((line) => /^\| #\d+\s+\|/.test(line));
  assert.equal(rows.length, EXPECTED_INPUTS.length);
  for (const row of rows) {
    const cells = row.split('|').map((cell) => cell.trim());
    assert.equal(cells.length, 8, `six-column evidence row required: ${row}`);
    assert.notEqual(cells[3], '', `concrete modules/coupling missing: ${row}`);
    assert.notEqual(cells[4], '', `current owner/query missing: ${row}`);
    assert.match(cells[5], /test\.mjs/, `regression test missing: ${row}`);
    assert.match(
      cells[6],
      /Already clean|Targeted refactor|Blocking defect/,
      `final disposition missing: ${row}`
    );
  }
});

test('#1006 JIT audit records only focused required findings', () => {
  for (const heading of [
    'D1 — Demotion recovery can preserve stale verification proof',
    'R1 — Shared Timing Log row reader',
    'R2 — Recovery-gap policy dependency direction',
    'R3 — Shared review-failure block boundary parser',
  ]) {
    assert.match(audit, new RegExp(`^### ${heading}$`, 'm'));
  }
  assert.match(audit, /Blocking correctness defects: D1 was resolved and closed by #1037/);
  assert.match(audit, /cleared the\s+blocker on #1006/);
  assert.match(audit, /Optional cleanup: none required/);
  assert.doesNotMatch(audit, /\bTBD\b|\bTODO\b/);
});

test('#1006 JIT audit records every required child as closed and integrated', () => {
  for (const [issue, tree] of [
    [1038, 'd79d988'],
    [1039, '8b9f420'],
    [1040, '91379bf'],
  ]) {
    assert.match(
      audit,
      new RegExp(`Resolution: #${issue} is Closed/Done and squash-integrated at \\\`${tree}\\\``)
    );
  }
  assert.match(audit, /final independent reviews found no remaining defects/);
  assert.match(audit, /no descendant\s+defect issue remains open/);
  assert.match(audit, /#1006 VC6 before closure/);
});
