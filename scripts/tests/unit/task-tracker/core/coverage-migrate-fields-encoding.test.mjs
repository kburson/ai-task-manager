// @story #643
// Offline coverage-lift for migrate-fields-encoding.mjs. Drives the pure
// transformBody through legacy/new/no-op/invalid branches and the CLI/IO layer
// (fetchBody, writeBody, scanOpenIssues, migrateOne, main) through injected
// deps — no gh, no fs, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  transformBody,
  fetchBody,
  writeBody,
  scanOpenIssues,
  migrateOne,
  main,
} from '../../../../task-tracker/migrate-fields-encoding.mjs';

// ── fixtures ────────────────────────────────────────────────────────────────
const LEGACY = [
  '# Title',
  '',
  'body text',
  '',
  '<!-- ai-task-manager:fields:start -->',
  '```json',
  '{"schema":1,"values":{"priority":"P2"}}',
  '```',
  '<!-- ai-task-manager:fields:end -->',
  '',
].join('\n');

const NEW_ONLY = '# T\n\n<!-- aitm-fields: {"schema":1,"values":{"priority":"P2"}} -->\n';
const BAD_FENCE =
  '<!-- ai-task-manager:fields:start -->\nno fence here\n<!-- ai-task-manager:fields:end -->\n';

// ── transformBody (pure) ──────────────────────────────────────────────────────
test('transformBody: legacy fence → migrated to single-line aitm-fields', () => {
  const r = transformBody(LEGACY);
  assert.equal(r.changed, true);
  assert.equal(r.legacyCount, 1);
  assert.doesNotMatch(r.body, /ai-task-manager:fields:start/);
  assert.match(r.body, /<!-- aitm-fields: \{"schema":1/);
});

test('transformBody: single new-encoding block → no-op', () => {
  const r = transformBody(NEW_ONLY);
  assert.equal(r.changed, false);
  assert.equal(r.newCount, 1);
});

test('transformBody: legacy block with invalid fence → unchanged w/ reason', () => {
  const r = transformBody(BAD_FENCE);
  assert.equal(r.changed, false);
  assert.equal(r.reason, 'invalid-fence');
});

// ── fetchBody / writeBody / scanOpenIssues (injected gh/fs) ────────────────────
test('fetchBody: returns gh stdout body', async () => {
  const body = await fetchBody(
    { repo: 'o/r', issueNumber: 1 },
    { pexec: async () => ({ stdout: 'B' }) }
  );
  assert.equal(body, 'B');
});

test('writeBody: mkdtemp + write + gh edit + rm cleanup', async () => {
  const written = [];
  const removed = [];
  let ghArgs;
  await writeBody(
    { repo: 'o/r', issueNumber: 2, body: 'new' },
    {
      scratchDir: () => '/scratch',
      mkdtemp: (p) => `${p}XXX`,
      writeFile: (f, b) => written.push({ f, b }),
      rm: (d) => removed.push(d),
      pexec: async (_c, args) => {
        ghArgs = args;
        return { stdout: '' };
      },
    }
  );
  assert.equal(written.length, 1);
  assert.equal(written[0].b, 'new');
  assert.ok(ghArgs.includes('--body-file'));
  assert.equal(removed.length, 1);
});

test('scanOpenIssues: parses gh search json → numbers', async () => {
  const nums = await scanOpenIssues(
    { repo: 'o/r' },
    { pexec: async () => ({ stdout: JSON.stringify([{ number: 4 }, { number: 5 }]) }) }
  );
  assert.deepEqual(nums, [4, 5]);
});

test('scanOpenIssues: gh failure → [] with err note', async () => {
  const errs = [];
  const nums = await scanOpenIssues(
    { repo: 'o/r' },
    {
      pexec: async () => {
        throw new Error('restricted');
      },
      err: (s) => errs.push(s),
    }
  );
  assert.deepEqual(nums, []);
  assert.match(errs.join(''), /scan failed: restricted/);
});

// ── migrateOne ────────────────────────────────────────────────────────────────
test('migrateOne: no change → reports, no write', async () => {
  const out = [];
  let wrote = 0;
  await migrateOne(
    { repo: 'o/r', issueNumber: 1, dry: false },
    {
      fetchBody: async () => NEW_ONLY,
      writeBody: async () => (wrote += 1),
      out: (s) => out.push(s),
    }
  );
  assert.match(out.join(''), /#1: no change/);
  assert.equal(wrote, 0);
});

test('migrateOne: dry-run → would-migrate, no write', async () => {
  const out = [];
  let wrote = 0;
  await migrateOne(
    { repo: 'o/r', issueNumber: 3, dry: true },
    { fetchBody: async () => LEGACY, writeBody: async () => (wrote += 1), out: (s) => out.push(s) }
  );
  assert.match(out.join(''), /#3: would migrate/);
  assert.equal(wrote, 0);
});

test('migrateOne: live → writes migrated body', async () => {
  const out = [];
  const writes = [];
  await migrateOne(
    { repo: 'o/r', issueNumber: 6, dry: false },
    {
      fetchBody: async () => LEGACY,
      writeBody: async ({ body }) => writes.push(body),
      out: (s) => out.push(s),
    }
  );
  assert.match(out.join(''), /#6: migrated/);
  assert.equal(writes.length, 1);
  assert.match(writes[0], /aitm-fields/);
});

// ── main orchestration ────────────────────────────────────────────────────────
test('main: missing repo → err + exit 2', async () => {
  let code;
  let err = '';
  await main(['node', 'x', '5'], {
    loadConfig: () => ({}),
    err: (s) => (err += s),
    exit: (c) => (code = c),
  });
  assert.equal(code, 2);
  assert.match(err, /missing `repo`/);
});

test('main: no targets → usage + exit 2', async () => {
  let code;
  let err = '';
  await main(['node', 'x'], {
    loadConfig: () => ({ repo: 'o/r' }),
    err: (s) => (err += s),
    exit: (c) => (code = c),
  });
  assert.equal(code, 2);
  assert.match(err, /usage: migrate-fields-encoding/);
});

test('main: explicit numbers + --scan union, migrateOne per target, error captured', async () => {
  const seen = [];
  let err = '';
  await main(['node', 'x', '10', '--scan'], {
    loadConfig: () => ({ repo: 'o/r' }),
    scanOpenIssues: async () => [11],
    migrateOne: async ({ issueNumber }) => {
      seen.push(issueNumber);
      if (issueNumber === 11) throw new Error('boom');
    },
    out: () => {},
    err: (s) => (err += s),
    exit: () => {},
  });
  assert.deepEqual(
    seen.sort((a, b) => a - b),
    [10, 11]
  );
  assert.match(err, /#11: error — boom/);
});

console.log('coverage-migrate-fields-encoding.test.mjs: ok');
