// @story #639
// Offline coverage-lift for backfill-plan-metadata.mjs. Drives the pure
// decision core (buildPlanMetadataBackfill: skip vs healed), the gh-list
// enumeration through an injected pexec, and every main() orchestration branch
// (audit dry-run, --apply healed write, --apply failure, skip tally) through
// injected deps — no network, no gh, no real body writes.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPlanMetadataBackfill,
  listOpenIssues,
  main,
} from '../../../backfill-plan-metadata.mjs';

// ── fixtures ────────────────────────────────────────────────────────────────
const UNBOLD = ['## Plan Metadata', '', '- effort: 2', '- risk: low', '', '## Next'].join('\n');
const BOLD = [
  '## Story Origin',
  '',
  '- **kind**: code',
  '',
  '## Plan Metadata',
  '',
  '- **effort**: 2',
  '- **risk**: low',
  '',
].join('\n');
const NO_SECTION = '# Title\n\nsome body text\n';

// ── buildPlanMetadataBackfill (pure) ─────────────────────────────────────────
test('buildPlanMetadataBackfill: no section → skip', () => {
  assert.deepEqual(buildPlanMetadataBackfill(NO_SECTION), { status: 'skip' });
});

test('buildPlanMetadataBackfill: already-bold section → skip', () => {
  assert.equal(buildPlanMetadataBackfill(BOLD).status, 'skip');
});

test('buildPlanMetadataBackfill: unbold labels → healed w/ bolded body + changed list', () => {
  const r = buildPlanMetadataBackfill(UNBOLD);
  assert.equal(r.status, 'healed');
  assert.deepEqual(r.changed, ['kind', 'effort', 'risk']);
  assert.match(r.body, /## Story Origin\n\n- \*\*kind\*\*: code/);
  assert.match(r.body, /- \*\*effort\*\*: 2/);
  assert.match(r.body, /- \*\*risk\*\*: low/);
});

test('buildPlanMetadataBackfill: default empty arg → skip', () => {
  assert.deepEqual(buildPlanMetadataBackfill(), { status: 'skip' });
});

// ── listOpenIssues ───────────────────────────────────────────────────────────
test('listOpenIssues: parses gh json via injected pexec', async () => {
  let seen;
  const pexec = async (_cmd, args) => {
    seen = args;
    return { stdout: JSON.stringify([{ number: 1, title: 't', body: 'b' }]) };
  };
  const issues = await listOpenIssues({ pexec });
  assert.equal(issues[0].number, 1);
  assert.ok(seen.includes('--state'));
  assert.ok(seen.includes('open'));
});

// ── main orchestration ───────────────────────────────────────────────────────
test('main: audit dry-run logs would-heal + skips clean issues, no writes', async () => {
  const logs = [];
  let mutated = 0;
  await main([], {
    listOpenIssues: async () => [
      { number: 3, body: UNBOLD },
      { number: 1, body: BOLD },
    ],
    mutateIssueBody: async () => {
      mutated += 1;
      return { status: 'ok' };
    },
    log: (s) => logs.push(s),
    err: () => {},
  });
  const joined = logs.join('\n');
  assert.match(joined, /#3 {2}would-heal {2}\[kind, effort, risk\] {2}\(audit\)/);
  assert.match(joined, /skipped=1 {2}healed=1/);
  assert.match(joined, /audit — no writes/);
  assert.equal(mutated, 0); // audit never writes
});

test('main: --apply writes healed issues through mutateIssueBody', async () => {
  const logs = [];
  const mutations = [];
  await main(['--apply'], {
    listOpenIssues: async () => [{ number: 5, body: UNBOLD }],
    mutateIssueBody: async ({ issueNumber, mutate }) => {
      // exercise the mutate callback path (base → bolded body)
      const nb = mutate(UNBOLD);
      mutations.push({ issueNumber, nb });
      return { status: 'updated' };
    },
    log: (s) => logs.push(s),
    err: () => {},
  });
  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].issueNumber, 5);
  assert.match(mutations[0].nb, /\*\*effort\*\*/);
  assert.match(logs.join('\n'), /#5 {2}healed {2}updated/);
  assert.match(logs.join('\n'), /healed=1 {2}failed=0/);
});

test('main: --apply mutate throw is tallied as failed on err channel', async () => {
  const errs = [];
  const logs = [];
  await main(['--apply'], {
    listOpenIssues: async () => [{ number: 7, body: UNBOLD }],
    mutateIssueBody: async () => {
      throw new Error('conflict');
    },
    log: (s) => logs.push(s),
    err: (s) => errs.push(s),
  });
  assert.match(errs.join('\n'), /#7 {2}FAILED {2}conflict/);
  assert.match(logs.join('\n'), /failed=1/);
});

console.log('coverage-backfill-plan-metadata.test.mjs: ok');
