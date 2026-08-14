// @story #641
// Offline coverage-lift for backfill-vc-sections.mjs. Drives the pure decision
// core (buildVcBackfill: skip / derived / default), the gh-list enumeration
// through an injected pexec, and every main() orchestration branch (dry-run
// audit, live --apply write, per-issue failure, skip tally) through injected
// deps — no network, no gh, no real body writes.
// (#722 — default flipped to audit-only unless `--apply`; `--help` is now a
// pure usage print that never lists or writes. Fixtures updated to match.)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_VC_COMMANDS,
  buildVcBackfill,
  listOpenIssues,
  main,
} from '../../../../task-tracker/backfill-vc-sections.mjs';

// ── fixtures ────────────────────────────────────────────────────────────────
// No VC section, no evidence markers → default mode (four standard DoD cmds).
const NO_VC = ['# Title', '', 'Plain body, no verification commands.', ''].join('\n');

// An AC checkbox declares a non-standard command via an inline aitm-verified
// marker and there is no VC section → derived mode surfaces that command.
const DERIVED = [
  '# Title',
  '',
  '## Acceptance Criteria',
  '',
  '- [ ] widget works <!-- aitm-verified cmd="`node --test widget.test.mjs`" -->',
  '',
  '## Pickup Directive — MANDATORY, DO NOT SKIP',
  '',
  'do the thing',
  '',
].join('\n');

// ── buildVcBackfill (pure) ───────────────────────────────────────────────────
test('buildVcBackfill: no section + no markers → healed-default', () => {
  const r = buildVcBackfill(NO_VC);
  assert.equal(r.status, 'healed');
  assert.equal(r.mode, 'default');
  assert.deepEqual(r.commands, DEFAULT_VC_COMMANDS);
  assert.match(r.body, /## Verification Commands/);
  // #934: the default seed is the two-lane tests split, not single `test:all`.
  assert.match(r.body, /- \[ \] `npm test`/);
  assert.match(r.body, /- \[ \] `npm run test:slow`/);
});

test('buildVcBackfill: AC evidence command → healed-derived, placed before Pickup', () => {
  const r = buildVcBackfill(DERIVED);
  assert.equal(r.status, 'healed');
  assert.equal(r.mode, 'derived');
  assert.deepEqual(r.commands, ['node --test widget.test.mjs']);
  // VC section inserted immediately before the Pickup Directive anchor.
  assert.ok(
    r.body.indexOf('## Verification Commands') <
      r.body.indexOf('## Pickup Directive — MANDATORY, DO NOT SKIP')
  );
});

test('buildVcBackfill: healed body is idempotent → skip on re-run', () => {
  const once = buildVcBackfill(NO_VC);
  assert.deepEqual(buildVcBackfill(once.body), { status: 'skip' });
});

test('buildVcBackfill: default empty arg → healed-default', () => {
  assert.equal(buildVcBackfill().mode, 'default');
});

// ── listOpenIssues ───────────────────────────────────────────────────────────
test('listOpenIssues: parses gh json via injected pexec', async () => {
  let seen;
  const pexec = async (_cmd, args) => {
    seen = args;
    return { stdout: JSON.stringify([{ number: 9, title: 't', body: 'b' }]) };
  };
  const issues = await listOpenIssues({ pexec });
  assert.equal(issues[0].number, 9);
  assert.ok(seen.includes('--state'));
  assert.ok(seen.includes('open'));
});

// ── main orchestration ───────────────────────────────────────────────────────
test('main: --dry-run logs healed lines + skips clean, no writes', async () => {
  const logs = [];
  let mutated = 0;
  await main(['--dry-run'], {
    listOpenIssues: async () => [
      { number: 5, body: NO_VC },
      { number: 3, body: DERIVED },
      { number: 1, body: buildVcBackfill(NO_VC).body }, // already has VC → skip
    ],
    mutateIssueBody: async () => {
      mutated += 1;
      return { status: 'ok' };
    },
    log: (s) => logs.push(s),
    err: () => {},
  });
  const joined = logs.join('\n');
  assert.match(joined, /#3 {2}healed-derived/);
  assert.match(joined, /#5 {2}healed-default/);
  assert.match(joined, /skipped=1 {2}healed-derived=1 {2}healed-default=1/);
  assert.match(joined, /audit — no writes; pass --apply to write/);
  assert.equal(mutated, 0); // dry-run never writes
});

test('main: default (no flags) audits only, no writes', async () => {
  const logs = [];
  let mutated = 0;
  await main([], {
    listOpenIssues: async () => [{ number: 5, body: NO_VC }],
    mutateIssueBody: async () => {
      mutated += 1;
      return { status: 'ok' };
    },
    log: (s) => logs.push(s),
    err: () => {},
  });
  assert.match(logs.join('\n'), /audit — no writes; pass --apply to write/);
  assert.equal(mutated, 0);
});

test('main: --help prints usage and never lists or writes', async () => {
  const logs = [];
  let listed = false;
  let mutated = 0;
  await main(['--help'], {
    listOpenIssues: async () => {
      listed = true;
      return [];
    },
    mutateIssueBody: async () => {
      mutated += 1;
      return { status: 'ok' };
    },
    log: (s) => logs.push(s),
    err: () => {},
  });
  assert.match(logs.join('\n'), /Usage: backfill-vc-sections\.mjs/);
  assert.equal(listed, false);
  assert.equal(mutated, 0);
});

test('main: live run writes healed issues through mutateIssueBody', async () => {
  const logs = [];
  const mutations = [];
  await main(['--apply'], {
    listOpenIssues: async () => [{ number: 8, body: NO_VC }],
    mutateIssueBody: async ({ issueNumber, mutate }) => {
      // exercise the mutate callback path (base → healed body)
      const nb = mutate(NO_VC);
      mutations.push({ issueNumber, nb });
      return { status: 'updated' };
    },
    log: (s) => logs.push(s),
    err: () => {},
  });
  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].issueNumber, 8);
  assert.match(mutations[0].nb, /## Verification Commands/);
  assert.match(logs.join('\n'), /#8 {2}healed-default {2}updated/);
  assert.match(logs.join('\n'), /failed=0/);
});

test('main: mutate throw is tallied as failed on err channel', async () => {
  const errs = [];
  const logs = [];
  await main(['--apply'], {
    listOpenIssues: async () => [{ number: 7, body: NO_VC }],
    mutateIssueBody: async () => {
      throw new Error('conflict');
    },
    log: (s) => logs.push(s),
    err: (s) => errs.push(s),
  });
  assert.match(errs.join('\n'), /#7 {2}FAILED {2}conflict/);
  assert.match(logs.join('\n'), /failed=1/);
});

console.log('coverage-backfill-vc-sections.test.mjs: ok');
