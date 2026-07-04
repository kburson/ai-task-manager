#!/usr/bin/env node
// @story #636 — coverage lift for scripts/task-tracker/heal-backlog.mjs (part 2).
// Drives the heavier IO/CLI seams (fetchIssueBundle, writeIssueBody,
// postHealComment, runTimingSlugRename, main) fully offline through injected
// deps (loadConfig, getProjectDir, loadProjectFieldDefs, fetch*/write*/
// postComment/syncDiscussLabel, fake gh, findTimingComment/updateTimingComment,
// out/err streams, exit) + real temp project dirs so every branch is covered
// without any network I/O. The pure transforms and GraphQL-only fetch seams
// live in coverage-heal-backlog.test.mjs.
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import {
  renderHealComment,
  fetchIssueBundle,
  writeIssueBody,
  postHealComment,
  runTimingSlugRename,
  main,
} from '../../heal-backlog.mjs';
import { formatIssueFieldDb } from '../../issue-field-db.mjs';

// ---- helpers ---------------------------------------------------------------
function sink() {
  const chunks = [];
  return { chunks, write: (s) => chunks.push(String(s)), text: () => chunks.join('') };
}
function mkTmp() {
  return mkdtempSync(path.join(projectScratchDir('test'), 'aitm-heal-backlog-'));
}

// ---- fixtures --------------------------------------------------------------
const FIELD_DEFS = [
  {
    key: 'priority',
    name: 'Priority',
    type: 'single_select',
    options: [{ name: 'P0' }, { name: 'P1' }, { name: 'P2' }],
  },
  {
    key: 'size',
    name: 'Size',
    type: 'single_select',
    options: [{ name: 'S' }, { name: 'M' }, { name: 'L' }],
  },
  { key: 'estimate', name: 'Estimate', type: 'number' },
  { key: 'rank', name: 'Rank', type: 'number' },
  { key: 'engagedTime', name: 'Engaged Time', type: 'number' },
  { key: 'sessionTime', name: 'Session Time', type: 'number' },
  { key: 'reviewTime', name: 'Review Time', type: 'number' },
  { key: 'startTime', name: 'Start Time', type: 'text' },
];

const TIMING_LOG = [
  '⏱ Timing Log',
  '',
  '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |',
  '|---|---|---|---|---|---|---|',
  '| 2026-06-24 09:00 -05:00 | refine:started | 30 | 0 | 0 | 100 | first |',
  '| 2026-06-24 10:00 -05:00 | review:started | 15 | 0 | 0 | 150 | rev |',
].join('\n');

const STALE_FIELDS = formatIssueFieldDb({
  engagedTime: 12345,
  sessionTime: 0,
  reviewTime: 0,
  startTime: null,
  priority: 'P1',
  size: 'M',
  estimate: 3,
  rank: 1,
});

const RICH_BODY = [
  '## Some Issue',
  '',
  '{discuss}',
  '',
  '- [ ] approved by Human',
  '',
  '## Deep-Dive Analysis',
  '',
  'Prose about the deep dive.',
  '',
  '<!-- aitm-plan-approved ts="2026-06-01T00:00:00Z" -->',
  '',
  STALE_FIELDS,
  '',
].join('\n');

const BACKFILL_TS = '2026-06-01T00:00:00Z';
const PID = 'PVT_target';
const STATUS_OK = {
  name: 'Status',
  options: ['Backlog', 'On Deck', 'Refine', 'Plan', 'Develop', 'Test', 'Review', 'Done'].map(
    (n) => ({ name: n })
  ),
};

// ---- fetchIssueBundle with a fake gh ---------------------------------------
{
  const healBody = renderHealComment({ deltas: [{ key: 'x', before: 1, after: 2 }], now: 'T' });
  const ghFn = async () =>
    JSON.stringify({
      body: 'issue body',
      state: 'OPEN',
      createdAt: '2026-01-01T00:00:00Z',
      closedAt: null,
      comments: [{ body: 'chit chat' }, { body: `⏱ Timing Log\nrows` }, { body: healBody }],
    });
  const bundle = await fetchIssueBundle(5, 'o/r', ghFn);
  assert.equal(bundle.body, 'issue body');
  assert.ok(bundle.timing);
  assert.equal(bundle.priorHeal, true);
  assert.equal(bundle.createdAt, '2026-01-01T00:00:00Z');

  const noComments = async () => JSON.stringify({ body: '', state: 'CLOSED' });
  const b2 = await fetchIssueBundle(6, 'o/r', noComments);
  assert.equal(b2.timing, null);
  assert.equal(b2.priorHeal, false);
  assert.equal(b2.body, '');
}

// ---- writeIssueBody / postHealComment with fake gh + real temp dir ---------
{
  const dir = mkTmp();
  try {
    const calls = [];
    await writeIssueBody(9, 'o/r', 'new body', dir, async (argv) => calls.push(argv));
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].slice(0, 4), ['issue', 'edit', '9', '-R']);
    assert.ok(calls[0].includes('--body-file'));

    const calls2 = [];
    await postHealComment(9, 'o/r', 'a comment', dir, async (argv) => calls2.push(argv));
    assert.deepEqual(calls2[0].slice(0, 4), ['issue', 'comment', '9', '-R']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---- runTimingSlugRename ----------------------------------------------------
const OLD_LOG = [
  '⏱ Timing Log',
  '',
  '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |',
  '|---|---|---|---|---|---|---|',
  '| 2026-06-24 09:00 -05:00 | refine:start | 30 | 0 | 0 | 100 | first |',
].join('\n');
{
  // apply + rewrite: findComment returns an old-vocabulary log → updateComment called.
  const dir = mkTmp();
  try {
    const updates = [];
    await runTimingSlugRename(
      {
        cfg: { repo: 'o/r', projectId: PID },
        args: { scope: [1], apply: true, state: 'all' },
        projectDir: dir,
      },
      {
        findTimingComment: async () => ({ id: 'C_1', body: OLD_LOG }),
        updateTimingComment: async (id, repo, body) => updates.push({ id, repo, body }),
      }
    );
    assert.equal(updates.length, 1);
    assert.match(updates[0].body, /refine:started/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
{
  // no-scope → injected fetchAllIssueNumbers path (empty set); no-log + error branches.
  const dir = mkTmp();
  try {
    let fetched = false;
    await runTimingSlugRename(
      {
        cfg: { repo: 'o/r', projectId: PID },
        args: { apply: false, state: 'open' },
        projectDir: dir,
      },
      {
        fetchAllIssueNumbers: async () => {
          fetched = true;
          return [];
        },
      }
    );
    assert.equal(fetched, true);

    await runTimingSlugRename(
      {
        cfg: { repo: 'o/r' },
        args: { scope: [1, 2], apply: false, state: 'all' },
        projectDir: dir,
      },
      {
        findTimingComment: async (ref) => {
          if (ref === '#1') return null; // no-log branch
          throw new Error('boom'); // error branch
        },
      }
    );
    assert.ok(existsSync(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---- main: repo not configured exits 1 -------------------------------------
{
  const err = sink();
  let code = null;
  await main([], { loadConfig: () => ({}), err, exit: (c) => (code = c) });
  assert.equal(code, 1);
  assert.match(err.text(), /repo not configured/);
}
// ---- main: projectId not configured exits 1 --------------------------------
{
  const err = sink();
  let code = null;
  await main([], {
    loadConfig: () => ({ repo: 'o/r' }),
    getProjectDir: () => '/x',
    err,
    exit: (c) => (code = c),
  });
  assert.equal(code, 1);
  assert.match(err.text(), /projectId not configured/);
}
// ---- main: rename mode delegates to runTimingSlugRename ---------------------
{
  const dir = mkTmp();
  try {
    let ran = false;
    await main(['--rename-timing-slugs'], {
      loadConfig: () => ({ repo: 'o/r', projectId: PID }),
      getProjectDir: () => dir,
      runTimingSlugRename: async () => {
        ran = true;
      },
      out: sink(),
    });
    assert.equal(ran, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
// ---- main: dry-run full pass (schema no-drift + delta/skip/error loop) ------
{
  const dir = mkTmp();
  const out = sink();
  try {
    await main([], {
      loadConfig: () => ({ repo: 'o/r', projectId: PID }),
      getProjectDir: () => dir,
      loadProjectFieldDefs: () => FIELD_DEFS,
      fetchProjectFields: async () => [
        { name: 'Priority', options: [{ name: 'P0' }, { name: 'P1' }, { name: 'P2' }] },
        { name: 'Size', options: [{ name: 'S' }, { name: 'M' }, { name: 'L' }] },
        { name: 'Estimate' },
        { name: 'Rank' },
        { name: 'Engaged Time' },
        { name: 'Session Time' },
        { name: 'Review Time' },
        { name: 'Start Time' },
        STATUS_OK,
      ],
      fetchAllIssueNumbers: async () => [1, 2, 3],
      fetchIssueBundle: async (n) => {
        if (n === 1)
          return {
            body: RICH_BODY,
            timing: { body: TIMING_LOG },
            priorHeal: false,
            closedAt: BACKFILL_TS,
            createdAt: null,
          };
        if (n === 2)
          return {
            body: `Body\n\n${STALE_FIELDS}\n`,
            timing: null,
            priorHeal: false,
            closedAt: null,
            createdAt: '2026-01-01T00:00:00Z',
          };
        throw new Error('boom');
      },
      out,
    });
    assert.match(out.text(), /Scanned 3 issues/);
    assert.match(out.text(), /schemaDrift=false/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
// ---- main: apply pass exercises writeBody + postComment + syncLabel --------
{
  const dir = mkTmp();
  const wrote = [];
  const posted = [];
  const synced = [];
  try {
    await main(['--apply', '--scope', '1', '--no-schema-check'], {
      loadConfig: () => ({ repo: 'o/r', projectId: PID }),
      getProjectDir: () => dir,
      loadProjectFieldDefs: () => FIELD_DEFS,
      fetchIssueBundle: async () => ({
        body: RICH_BODY,
        timing: { body: TIMING_LOG },
        priorHeal: false,
        closedAt: BACKFILL_TS,
        createdAt: null,
      }),
      writeIssueBody: async (n) => wrote.push(n),
      postHealComment: async (n) => posted.push(n),
      syncDiscussLabel: async (a) => synced.push(a),
      out: sink(),
    });
    assert.deepEqual(wrote, [1]);
    assert.deepEqual(posted, [1]);
    assert.equal(synced.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
// ---- main: --no-schema-check skips schema fetch; drift-free summary ---------
{
  const dir = mkTmp();
  const out = sink();
  try {
    let fetchedFields = false;
    await main(['--no-schema-check', '--scope', '5'], {
      loadConfig: () => ({ repo: 'o/r', projectId: PID }),
      getProjectDir: () => dir,
      loadProjectFieldDefs: () => FIELD_DEFS,
      fetchProjectFields: async () => {
        fetchedFields = true;
        return [];
      },
      fetchIssueBundle: async () => ({
        body: `Body\n\n${STALE_FIELDS}\n`,
        timing: null,
        priorHeal: false,
        closedAt: null,
        createdAt: null,
      }),
      out,
    });
    assert.equal(fetchedFields, false);
    assert.match(out.text(), /schemaDrift=false/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
// ---- main: schema drift → exit(3) ------------------------------------------
{
  const dir = mkTmp();
  let code = null;
  try {
    await main([], {
      loadConfig: () => ({ repo: 'o/r', projectId: PID }),
      getProjectDir: () => dir,
      loadProjectFieldDefs: () => FIELD_DEFS,
      fetchProjectFields: async () => [{ name: 'Bogus Field' }], // everything missing → drift
      fetchAllIssueNumbers: async () => [],
      out: sink(),
      exit: (c) => (code = c),
    });
    assert.equal(code, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('coverage-heal-backlog-cli.test.mjs: ok');
