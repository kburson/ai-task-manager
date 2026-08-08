#!/usr/bin/env node
// @story #620
// Coverage for verbs/supersede.mjs (the `/task supersede <dead#> --by <by#>`
// verb). Drives the pure core `runSupersede` through its dep seam offline to hit
// every result branch — the four arg-guard throws (no dead / no by / self /
// no cfg.repo), superseder-missing (issueExists false → no writes),
// transition-failed (move-state non-zero → no audit comment / close), the
// superseded happy path (marker stamp + dead audit comment + close + back-ref),
// and the back-reference best-effort catch. parseArgs is unit-tested directly.
// verbSupersede's CLI arms (usage exit 2 ×2, success, non-superseded exit 1,
// catch exit 1) run via a process.exit/stdout/stderr trap with injected deps so
// no `gh` subprocess sits inside the trap window (the #618/#619 lesson — a
// subprocess there swallows node:test's buffered reporter output). The cheap
// default I/O helpers (issueExists / mutateBody / postComment / closeNotPlanned)
// are covered by a non-trapping runSupersede call that injects only runMoveState
// and drives the rest against a stateful fake `gh` on PATH.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import { runSupersede, verbSupersede, parseArgs } from '../../../verbs/supersede.mjs';

const cfg = { repo: 'o/r' };
const FIXED_TS = '2026-06-29T00:00:00Z';
const now = () => FIXED_TS;
const BASE = '## Body\n\nsome text\n';

// Unique dead-issue numbers per test keep any future lock/file isolation clean.
let _seq = 9_200_000;
const nextIssue = () => ++_seq;

// --- runSupersede dep harness ----------------------------------------------
function makeDeps(overrides = {}) {
  const calls = {
    exists: [],
    dispositions: [],
    mutates: [],
    moves: [],
    comments: [],
    closes: [],
  };
  const deps = {
    issueExists: async ({ issueNumber }) => {
      calls.exists.push(issueNumber);
      return overrides.exists ?? true;
    },
    writeDisposition: async ({ issueNumber, disposition }) => {
      calls.dispositions.push({ issueNumber, disposition });
    },
    mutateIssueBody: async ({ issueNumber, mutate }) => {
      if (overrides.mutateThrows) throw new Error('mutate boom');
      calls.mutates.push({ issueNumber, body: mutate(overrides.body ?? BASE) });
      return { status: 'ok' };
    },
    runMoveState: async ({ issueNumber }) => {
      calls.moves.push(issueNumber);
      return overrides.moveExit ?? 0;
    },
    postComment: async ({ issueNumber, body }) => {
      if (overrides.commentThrowsFor === issueNumber) throw new Error('comment boom');
      calls.comments.push({ issueNumber, body });
    },
    closeNotPlanned: async ({ issueNumber }) => {
      calls.closes.push(issueNumber);
    },
    now,
    ...overrides.deps,
  };
  return { calls, deps };
}

// --- parseArgs --------------------------------------------------------------
test('parseArgs: positional dead + --by', () => {
  const r = parseArgs(['101', '--by', '202'], null);
  assert.deepEqual(r, { deadIssue: 101, byIssue: 202, byProvided: true });
});
test('parseArgs: dead falls back to active when no positional', () => {
  const r = parseArgs(['--by', '202'], '303');
  assert.equal(r.deadIssue, 303);
  assert.equal(r.byIssue, 202);
});
test('parseArgs: byProvided false when --by absent', () => {
  const r = parseArgs(['101'], null);
  assert.equal(r.byProvided, false);
  assert.equal(r.byIssue, null);
});
test('parseArgs: strips leading # on both args', () => {
  const r = parseArgs(['#101', '--by', '#202'], null);
  assert.deepEqual(r, { deadIssue: 101, byIssue: 202, byProvided: true });
});

// --- runSupersede arg guards (throw) ----------------------------------------
test('runSupersede: missing deadIssue throws', async () => {
  await assert.rejects(
    runSupersede({ deadIssue: 0, byIssue: 2, cfg, deps: makeDeps().deps }),
    /no dead issue/
  );
});
test('runSupersede: missing byIssue throws', async () => {
  await assert.rejects(
    runSupersede({ deadIssue: 1, byIssue: 0, cfg, deps: makeDeps().deps }),
    /--by <superseding#> is required/
  );
});
test('runSupersede: self-supersede throws', async () => {
  await assert.rejects(
    runSupersede({ deadIssue: 5, byIssue: 5, cfg, deps: makeDeps().deps }),
    /cannot supersede itself/
  );
});
test('runSupersede: missing cfg.repo throws', async () => {
  await assert.rejects(
    runSupersede({ deadIssue: 1, byIssue: 2, cfg: {}, deps: makeDeps().deps }),
    /cfg.repo is required/
  );
});

// --- runSupersede result branches -------------------------------------------
test('runSupersede: superseder-missing — no writes', async () => {
  const dead = nextIssue();
  const { calls, deps } = makeDeps({ exists: false });
  const r = await runSupersede({ deadIssue: dead, byIssue: 999, cfg, deps });
  assert.equal(r.status, 'superseder-missing');
  assert.equal(r.deadIssue, dead);
  assert.match(r.message, /does not exist/);
  assert.deepEqual(calls.mutates, []);
  assert.deepEqual(calls.moves, []);
  assert.deepEqual(calls.comments, []);
  assert.deepEqual(calls.closes, []);
});

test('runSupersede: transition-failed — marker stamped, no audit/close', async () => {
  const dead = nextIssue();
  const { calls, deps } = makeDeps({ moveExit: 2 });
  const r = await runSupersede({ deadIssue: dead, byIssue: 42, cfg, deps });
  assert.equal(r.status, 'transition-failed');
  assert.equal(r.exitCode, 2);
  assert.equal(calls.mutates.length, 1);
  assert.match(calls.mutates[0].body, /superseded-by/);
  assert.deepEqual(calls.comments, []);
  assert.deepEqual(calls.closes, []);
});

test('runSupersede: superseded happy path — stamp + audit + close + back-ref', async () => {
  const dead = nextIssue();
  const by = 77;
  const { calls, deps } = makeDeps();
  const r = await runSupersede({ deadIssue: dead, byIssue: by, cfg, deps });
  assert.equal(r.status, 'superseded');
  assert.equal(r.deadIssue, dead);
  assert.equal(r.byIssue, by);
  assert.equal(r.ts, FIXED_TS);
  // marker stamped on the dead story
  assert.match(calls.mutates[0].body, /superseded-by/);
  // move-state driven for the dead story
  assert.deepEqual(calls.moves, [dead]);
  // audit comment on dead, back-ref comment on by
  assert.equal(calls.comments.length, 2);
  assert.equal(calls.comments[0].issueNumber, dead);
  assert.match(calls.comments[0].body, /Superseded by #77/);
  assert.equal(calls.comments[1].issueNumber, by);
  assert.match(calls.comments[1].body, /Superseded #/);
  // closed not-planned
  assert.deepEqual(calls.closes, [dead]);
});

test('runSupersede: back-reference comment failure is tolerated', async () => {
  const dead = nextIssue();
  const by = 88;
  // only the back-ref comment (on `by`) throws; the dead audit comment succeeds
  const { calls, deps } = makeDeps({ commentThrowsFor: by });
  const r = await runSupersede({ deadIssue: dead, byIssue: by, cfg, deps });
  assert.equal(r.status, 'superseded');
  // dead audit comment + close still happened despite the back-ref failure
  assert.equal(calls.comments.length, 1);
  assert.equal(calls.comments[0].issueNumber, dead);
  assert.deepEqual(calls.closes, [dead]);
});

// --- verbSupersede CLI arms (injected deps, no subprocess in trap) -----------
// Isolate from the live session's active task: a state file under a scratch
// `.tmp/aitm/state/` anchors projectDirForState to a scratch root with no
// active-task.json, so loadState's session overlay resolves active → null.
const STATE_ROOT = mkdtempSync(join(projectScratchDir('test'), 'supersede-proj-'));
const STATE_DIR = join(STATE_ROOT, '.tmp', 'aitm', 'state');
mkdirSync(STATE_DIR, { recursive: true });
function stateFile(active) {
  const p = join(STATE_DIR, 'state.json');
  writeFileSync(p, JSON.stringify({ active: active ?? null, lastActive: active ?? null }));
  return p;
}

function runVerb(rest, deps, active = null) {
  const ctx = { cfg, statePath: stateFile(active), rest };
  const realExit = process.exit;
  const realErr = process.stderr.write.bind(process.stderr);
  const realOut = process.stdout.write.bind(process.stdout);
  let exitCode = null;
  const errOut = [];
  const outOut = [];
  process.exit = (code) => {
    exitCode = code ?? 0;
    throw new Error(`__exit_${exitCode}__`);
  };
  process.stderr.write = (s) => (errOut.push(String(s)), true);
  process.stdout.write = (s) => (outOut.push(String(s)), true);
  const restore = () => {
    process.exit = realExit;
    process.stderr.write = realErr;
    process.stdout.write = realOut;
  };
  const result = () => ({ exitCode, stderr: errOut.join(''), stdout: outOut.join('') });
  return verbSupersede(ctx, deps)
    .then(result)
    .catch((err) => {
      if (!/__exit_\d+__/.test(err.message)) throw err;
      return result();
    })
    .finally(restore);
}

test('verbSupersede: no dead issue → usage, exit 2', async () => {
  const r = await runVerb(['--by', '42'], makeDeps().deps, null);
  assert.equal(r.exitCode, 2);
  assert.match(r.stderr, /Usage: \/task supersede/);
});
test('verbSupersede: --by missing → usage, exit 2', async () => {
  const r = await runVerb(['101'], makeDeps().deps, null);
  assert.equal(r.exitCode, 2);
  assert.match(r.stderr, /--by <superseding#> is required/);
});
test('verbSupersede: success → no exit', async () => {
  const r = await runVerb(['101', '--by', '42'], makeDeps().deps, null);
  assert.equal(r.exitCode, null);
});
test('verbSupersede: non-superseded result → exit 1', async () => {
  const r = await runVerb(['101', '--by', '42'], makeDeps({ exists: false }).deps, null);
  assert.equal(r.exitCode, 1);
  assert.match(r.stderr, /does not exist/);
});
test('verbSupersede: thrown error → exit 1', async () => {
  const r = await runVerb(['101', '--by', '42'], makeDeps({ mutateThrows: true }).deps, null);
  assert.equal(r.exitCode, 1);
  assert.match(r.stderr, /mutate boom/);
});

// --- default I/O helpers via fake gh ----------------------------------------
// Drive runSupersede injecting only the board-specific terminal seams
// (move-state and Disposition; both need live Projects state). issueExists,
// defaultMutateBody, defaultPostComment, defaultCloseNotPlanned then execute
// against a stateful fake `gh` on PATH. No global stdout trap here, so the
// subprocess can't corrupt node:test's reporter.
const FAKE_GH_DIR = mkdtempSync(join(projectScratchDir('test'), 'supersede-gh-'));
const BODY_FILE = join(FAKE_GH_DIR, 'body.txt');
writeFileSync(BODY_FILE, BASE);
writeFileSync(
  join(FAKE_GH_DIR, 'gh'),
  [
    '#!/usr/bin/env node',
    'import fs from "node:fs";',
    'const a = process.argv.slice(2);',
    'const bf = process.env.FAKE_GH_BODY_FILE;',
    'if (a[0] === "issue" && a[1] === "view") {',
    '  // `--json body -q .body` (versionedWriteBody read) → raw body string;',
    '  // `--json number` (defaultIssueExists) → just needs exit 0.',
    '  if (a.includes("body")) process.stdout.write(fs.readFileSync(bf, "utf8"));',
    '  else process.stdout.write(JSON.stringify({ number: Number(a[2]) }));',
    '  process.exit(0);',
    '}',
    'if (a[0] === "issue" && a[1] === "edit") {',
    '  // `--body-file -` → persist new body from stdin.',
    '  const i = a.indexOf("--body-file");',
    '  if (i !== -1) {',
    '    const src = a[i + 1];',
    '    const next = src === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(src, "utf8");',
    '    fs.writeFileSync(bf, next);',
    '  }',
    '  process.exit(0);',
    '}',
    '// issue comment / issue close: succeed silently.',
    'process.exit(0);',
  ].join('\n'),
  { mode: 0o755 }
);
process.env.PATH = `${FAKE_GH_DIR}:${process.env.PATH}`;

test('runSupersede: default I/O helpers drive a fake gh end-to-end', async () => {
  process.env.FAKE_GH_BODY_FILE = BODY_FILE;
  try {
    const r = await runSupersede({
      deadIssue: nextIssue(),
      byIssue: 4242,
      cfg,
      deps: {
        runMoveState: async () => 0,
        writeDisposition: async () => {},
        now,
      },
    });
    assert.equal(r.status, 'superseded');
  } finally {
    delete process.env.FAKE_GH_BODY_FILE;
  }
});
