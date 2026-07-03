// @story #638
// Offline coverage-lift for heal-refine-entry-marker.mjs. Drives the pure
// decision helpers (needsBackfill / extractRefineEntryTs via healOne / the
// timestamp normalizer) plus the gh-I/O primitives and main/healOne
// orchestration through injected deps stubs — no network, no gh, no fs writes
// to the real repo.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  needsBackfill,
  fetchOpenIssues,
  fetchIssue,
  writeBody,
  postComment,
  healOne,
  main,
} from '../../heal-refine-entry-marker.mjs';

// ── fixtures ────────────────────────────────────────────────────────────────
const enteredRefine = (ts) => `<!-- aitm-entered-refine: ${ts} -->`;
const laterStage = (stage = 'plan', ts = '2026-02-01T00:00:00Z') =>
  `<!-- aitm-entered-${stage}: ${ts} -->`;
const refineAudit = (ts = '2026-01-01T00:00:00Z') =>
  `<!-- aitm-backfill:refine:pre-gate-refine-traversal:${ts} -->`;
const bodyOf = (...lines) => lines.join('\n');

// ── needsBackfill ───────────────────────────────────────────────────────────
test('needsBackfill: later marker present but refine-entry missing → true', () => {
  assert.equal(needsBackfill(bodyOf(laterStage('develop'))), true);
});

test('needsBackfill: refine-entry + later but no audit → true (audit-only)', () => {
  assert.equal(needsBackfill(bodyOf(enteredRefine('2026-01-01T00:00:00Z'), laterStage())), true);
});

test('needsBackfill: refine-entry + later + audit → false (clean)', () => {
  const b = bodyOf(enteredRefine('2026-01-01T00:00:00Z'), laterStage(), refineAudit());
  assert.equal(needsBackfill(b), false);
});

test('needsBackfill: refine-entry only, no later stage → false', () => {
  assert.equal(needsBackfill(bodyOf(enteredRefine('2026-01-01T00:00:00Z'))), false);
});

test('needsBackfill: empty body → false', () => {
  assert.equal(needsBackfill(''), false);
});

test('needsBackfill: new-grammar audit marker satisfies the audit check', () => {
  const audit = '<!-- aitm-backfill stage="refine" ts="2026-01-01T00:00:00Z" -->';
  const b = bodyOf(enteredRefine('2026-01-01T00:00:00Z'), laterStage(), audit);
  assert.equal(needsBackfill(b), false);
});

// ── gh-I/O primitives via injected pexec ────────────────────────────────────
test('fetchOpenIssues: maps gh json to string numbers', async () => {
  const calls = [];
  const pexec = async (cmd, args) => {
    calls.push({ cmd, args });
    return { stdout: JSON.stringify([{ number: 11 }, { number: 22 }]) };
  };
  const nums = await fetchOpenIssues('o/r', { pexec });
  assert.deepEqual(nums, ['11', '22']);
  assert.equal(calls[0].cmd, 'gh');
  assert.ok(calls[0].args.includes('--state'));
});

test('fetchIssue: parses gh view json', async () => {
  const pexec = async () => ({
    stdout: JSON.stringify({ number: 5, body: 'x', createdAt: '2026-01-01T00:00:00Z' }),
  });
  const issue = await fetchIssue('o/r', '5', { pexec });
  assert.equal(issue.number, 5);
  assert.equal(issue.createdAt, '2026-01-01T00:00:00Z');
});

test('writeBody: writes tmp, invokes gh edit --body-file, unlinks', async () => {
  const written = [];
  let unlinked = 0;
  let ghArgs;
  const deps = {
    pexec: async (_cmd, args) => {
      ghArgs = args;
      return { stdout: '' };
    },
    writeFile: (p, b) => written.push({ p, b }),
    unlink: () => {
      unlinked += 1;
    },
    scratchDir: () => '/scratch',
  };
  await writeBody('o/r', '9', 'NEW BODY', deps);
  assert.equal(written.length, 1);
  assert.equal(written[0].b, 'NEW BODY');
  assert.ok(written[0].p.startsWith('/scratch/'));
  assert.ok(ghArgs.includes('--body-file'));
  assert.equal(unlinked, 1);
});

test('writeBody: unlink failure is swallowed (best-effort cleanup)', async () => {
  const deps = {
    pexec: async () => ({ stdout: '' }),
    writeFile: () => {},
    unlink: () => {
      throw new Error('EBUSY');
    },
    scratchDir: () => '/scratch',
  };
  await writeBody('o/r', '9', 'B', deps); // must not throw
});

test('postComment: shells gh issue comment --body', async () => {
  let seen;
  await postComment('o/r', '7', 'hello', {
    pexec: async (_cmd, args) => {
      seen = args;
      return { stdout: '' };
    },
  });
  assert.ok(seen.includes('comment'));
  assert.ok(seen.includes('hello'));
});

// ── healOne ─────────────────────────────────────────────────────────────────
test('healOne: skip when body clean (entry+later+audit)', async () => {
  const body = bodyOf(enteredRefine('2026-01-01T00:00:00Z'), laterStage(), refineAudit());
  const r = await healOne({
    repo: 'o/r',
    num: '1',
    apply: false,
    deps: { fetchIssue: async () => ({ number: 1, body }) },
  });
  assert.equal(r.action, 'skip');
});

test('healOne: plan (dry-run) entry+audit mode uses createdAt', async () => {
  const body = bodyOf(laterStage('develop'));
  const r = await healOne({
    repo: 'o/r',
    num: '2',
    apply: false,
    deps: { fetchIssue: async () => ({ number: 2, body, createdAt: '2026-03-04T05:06:07.888Z' }) },
  });
  assert.equal(r.action, 'plan');
  assert.equal(r.mode, 'entry+audit');
  assert.equal(r.ts, '2026-03-04T05:06:07Z'); // normalized (sub-second stripped)
});

test('healOne: plan (dry-run) audit-only mode reuses existing entry ts', async () => {
  const body = bodyOf(enteredRefine('2026-02-02T02:02:02Z'), laterStage());
  const r = await healOne({
    repo: 'o/r',
    num: '3',
    apply: false,
    deps: { fetchIssue: async () => ({ number: 3, body, createdAt: '2026-01-01T00:00:00Z' }) },
  });
  assert.equal(r.action, 'plan');
  assert.equal(r.mode, 'audit-only');
  assert.equal(r.ts, '2026-02-02T02:02:02Z');
});

test('healOne: apply entry+audit writes body + posts comment', async () => {
  const body = bodyOf(laterStage('test'));
  let wroteBody;
  let comment;
  const r = await healOne({
    repo: 'o/r',
    num: '4',
    apply: true,
    deps: {
      fetchIssue: async () => ({ number: 4, body, createdAt: '2026-01-01T00:00:00Z' }),
      writeBody: async (_repo, _num, nb) => {
        wroteBody = nb;
      },
      postComment: async (_repo, _num, c) => {
        comment = c;
      },
    },
  });
  assert.equal(r.action, 'applied');
  assert.equal(r.mode, 'entry+audit');
  assert.match(wroteBody, /aitm-entered-refine/);
  assert.match(comment, /backfilled/);
});

test('healOne: apply audit-only posts the audit-marker comment', async () => {
  const body = bodyOf(enteredRefine('2026-05-05T05:05:05Z'), laterStage());
  let comment;
  const r = await healOne({
    repo: 'o/r',
    num: '5',
    apply: true,
    deps: {
      fetchIssue: async () => ({ number: 5, body, createdAt: '2026-01-01T00:00:00Z' }),
      writeBody: async () => {},
      postComment: async (_repo, _num, c) => {
        comment = c;
      },
    },
  });
  assert.equal(r.mode, 'audit-only');
  assert.match(comment, /audit marker/);
});

// ── main orchestration ───────────────────────────────────────────────────────
test('main: single-issue dry-run prints "would backfill" plan line', async () => {
  const out = [];
  await main(['#2'], {
    loadConfig: () => ({ repo: 'o/r' }),
    healOne: async ({ num }) => ({ num, action: 'plan', ts: '2026-01-01T00:00:00Z', reason: 'r' }),
    out: (s) => out.push(s),
    err: () => {},
  });
  const joined = out.join('');
  assert.match(joined, /#2: would backfill ts=2026-01-01T00:00:00Z/);
  assert.match(joined, /dry-run/);
});

test('main: apply prints backfilled + skip lines, no dry-run footer', async () => {
  const out = [];
  const seq = [
    { num: '1', action: 'applied', ts: '2026-01-01T00:00:00Z' },
    { num: '2', action: 'skip', reason: 'already' },
  ];
  let i = 0;
  await main(['1', '2', '--apply'], {
    loadConfig: () => ({ repo: 'o/r' }),
    healOne: async () => seq[i++],
    out: (s) => out.push(s),
    err: () => {},
  });
  const joined = out.join('');
  assert.match(joined, /#1: backfilled/);
  assert.match(joined, /#2: skip \(already\)/);
  assert.doesNotMatch(joined, /dry-run/);
});

test('main: healOne throw is captured as an error line on stderr', async () => {
  const errs = [];
  await main(['9'], {
    loadConfig: () => ({ repo: 'o/r' }),
    healOne: async () => {
      throw new Error('boom');
    },
    out: () => {},
    err: (s) => errs.push(s),
  });
  assert.match(errs.join(''), /#9: ERROR boom/);
});

test('main: no issue args → scans open issues via fetchOpenIssues', async () => {
  const healed = [];
  await main([], {
    loadConfig: () => ({ repo: 'o/r' }),
    fetchOpenIssues: async () => ['31', '32'],
    healOne: async ({ num }) => {
      healed.push(num);
      return { num, action: 'skip', reason: 'clean' };
    },
    out: () => {},
    err: () => {},
  });
  assert.deepEqual(healed, ['31', '32']);
});

console.log('coverage-heal-refine-entry-marker.test.mjs: ok');
