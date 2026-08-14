// @story #722
// AC3/AC4: every mutateIssueBody-looping one-shot script must have a real
// --help/-h flag that exits without writing, and its default run (no flags)
// must never write without an explicit --apply. Covers the three scripts
// audited alongside backfill-vc-sections.mjs (which has its own dedicated
// test file, backfill-vc-sections-help.test.mjs): backfill-plan-metadata.mjs
// (gap found — no --help handler existed; added in this issue) and
// heal-functional-dod.mjs / heal-vc-refs.mjs (already had --help via
// parseArgs; verified here, not modified).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';

import { main as planMetaMain } from '../../../../task-tracker/backfill-plan-metadata.mjs';
import { parseArgs as healFunctionalDodParseArgs } from '../../../../task-tracker/heal-functional-dod.mjs';
import { parseArgs as healVcRefsParseArgs } from '../../../../task-tracker/heal-vc-refs.mjs';

function sink() {
  const chunks = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  stream.text = () => chunks.join('');
  return stream;
}

// ── backfill-plan-metadata.mjs ───────────────────────────────────────────────
test('backfill-plan-metadata: --help prints usage, never lists or writes', async () => {
  const logs = [];
  let listed = false;
  let mutated = false;
  await planMetaMain(['--help'], {
    listOpenIssues: async () => {
      listed = true;
      return [];
    },
    mutateIssueBody: async () => {
      mutated = true;
      return { status: 'ok' };
    },
    log: (s) => logs.push(s),
    err: () => {},
  });
  assert.match(logs.join('\n'), /Usage: backfill-plan-metadata\.mjs/);
  assert.equal(listed, false, '--help must never enumerate issues');
  assert.equal(mutated, false, '--help must never write');
});

test('backfill-plan-metadata: -h is a recognized alias for --help', async () => {
  const logs = [];
  let listed = false;
  await planMetaMain(['-h'], {
    listOpenIssues: async () => {
      listed = true;
      return [];
    },
    mutateIssueBody: async () => ({ status: 'ok' }),
    log: (s) => logs.push(s),
    err: () => {},
  });
  assert.match(logs.join('\n'), /Usage: backfill-plan-metadata\.mjs/);
  assert.equal(listed, false);
});

test('backfill-plan-metadata: default (no flags) audits only, no writes', async () => {
  const logs = [];
  let mutated = 0;
  await planMetaMain([], {
    listOpenIssues: async () => [{ number: 1, body: '# Title\n\nlabel: value\n' }],
    mutateIssueBody: async () => {
      mutated += 1;
      return { status: 'ok' };
    },
    log: (s) => logs.push(s),
    err: () => {},
  });
  assert.equal(mutated, 0, 'default run must never write without --apply');
});

// ── heal-functional-dod.mjs ──────────────────────────────────────────────────
test('heal-functional-dod: --help exits without writing (via parseArgs exit hook)', () => {
  const out = sink();
  let exitCode;
  const args = healFunctionalDodParseArgs(['--help'], {
    out,
    err: sink(),
    exit: (code) => {
      exitCode = code;
    },
  });
  assert.equal(exitCode, 0);
  assert.match(out.text(), /Usage: heal-functional-dod\.mjs/);
  assert.equal(args.apply, false, '--help must never leave apply=true');
});

test('heal-functional-dod: default parse has apply=false (audit-only)', () => {
  const args = healFunctionalDodParseArgs([], { out: sink(), err: sink(), exit: () => {} });
  assert.equal(args.apply, false);
});

// ── heal-vc-refs.mjs ─────────────────────────────────────────────────────────
test('heal-vc-refs: --help exits without writing (via parseArgs exit hook)', () => {
  const out = sink();
  let exitCode;
  const args = healVcRefsParseArgs(['--help'], {
    out,
    err: sink(),
    exit: (code) => {
      exitCode = code;
    },
  });
  assert.equal(exitCode, 0);
  assert.match(out.text(), /Usage: heal-vc-refs\.mjs/);
  assert.equal(args.apply, false, '--help must never leave apply=true');
});

test('heal-vc-refs: default parse has apply=false (audit-only)', () => {
  const args = healVcRefsParseArgs([], { out: sink(), err: sink(), exit: () => {} });
  assert.equal(args.apply, false);
});

console.log('mutate-issue-body-scripts-help-audit.test.mjs: all assertions passed');
