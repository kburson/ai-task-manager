#!/usr/bin/env node
// @story #618
// Coverage for verbs/approve.mjs (Review→Done human gate). Drives runApprove
// through its dep seam to hit every result branch offline — arg guards,
// assertBound, wrong-state, already-approved, the full-auto footnote+auto-notes
// path, the human-driver path (drivers>0 and drivers==0), the review-notes
// post-failure catch, and the lifecycle-tick-noop warn branch. detectFullAuto's
// signal matrix is asserted directly. verbApprove's CLI arms (usage, skip-net,
// IssueLockError→7, generic→1, wrong-state→3, approved, already-approved) are
// driven via a process.exit/stdout/stderr trap and the verb's optional `deps`
// seam. The default fetch/comment/project/prompt helpers are exercised through a
// fake `gh` on PATH so no real network is touched.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import { runApprove, verbApprove, detectFullAuto } from '../../verbs/approve.mjs';
import { IssueLockError } from '../../issue-mutator-lock.mjs';

// #881 — approve requires evidence that the Agent Review Gate (the Review state's
// action) passed. Every fixture body below is suffixed with it; tests that care
// about the refusal path live in approve-agent-review-complete.test.mjs.
const AGENT_REVIEW_PASSED =
  '\n- [ ] Agent Review Passed <!-- aitm-verified gate="agent-review" ts="2026-05-10T00:00:00Z" sha="sandbox" validators="body-sections" result="pass" -->\n';

const cfg = { repo: 'o/r' };
const FIXED_TS = '2026-06-29T00:00:00Z';

// Isolated project dir so withIssueLock writes its lock under scratch, not the
// live worktree.
const PROJ = mkdtempSync(join(projectScratchDir('test'), 'approve-proj-'));

// A fake `gh` on PATH so the default fetch/comment helpers run offline. It
// answers a GraphQL body query, an `issue view --json comments` query, and any
// `issue comment` / `api` write with benign output.
const FAKE_GH_DIR = mkdtempSync(join(projectScratchDir('test'), 'approve-gh-'));
writeFileSync(
  join(FAKE_GH_DIR, 'gh'),
  [
    '#!/usr/bin/env node',
    'const a = process.argv.slice(2);',
    'if (a.includes("graphql")) {',
    '  const body = "## AC\\n- [x] x\\n\\n#### Lifecycle (auto-ticked at Review/Close)\\n- [ ] Passed final human review\\n- [ ] Agent Review Passed <!-- aitm-verified gate=\\"agent-review\\" ts=\\"2026-06-29T00:00:00Z\\" sha=\\"sandbox\\" validators=\\"body-sections\\" result=\\"pass\\" -->\\n";',
    '  process.stdout.write(JSON.stringify({ data: { repository: { issue: { body } } } }));',
    '} else if (a.includes("view")) {',
    '  process.stdout.write(JSON.stringify({ comments: [] }));',
    '} else {',
    '  process.stdout.write("");',
    '}',
  ].join('\n'),
  { mode: 0o755 }
);
chmodSync(join(FAKE_GH_DIR, 'gh'), 0o755);
process.env.PATH = `${FAKE_GH_DIR}:${process.env.PATH}`;

const REVIEW_BODY =
  [
    '## AC',
    '- [x] x',
    '',
    '#### Lifecycle (auto-ticked at Review/Close)',
    '- [ ] Passed final human review',
    '- [ ] Story closed and moved to Done',
    '',
    '<!-- aitm-fields: {"schema":1,"values":{"size":"S"}} -->',
    '',
  ].join('\n') + AGENT_REVIEW_PASSED;

// Body with no Lifecycle section → tickLifecycleItem is a no-op → warn branch.
const NO_LIFECYCLE_BODY = '## AC\n- [x] x\n' + AGENT_REVIEW_PASSED;

function makeDeps(overrides = {}) {
  const calls = { writes: [], comments: [], stamps: [] };
  let body = overrides.initialBody ?? REVIEW_BODY;
  return {
    calls,
    deps: {
      assertBound: () => {},
      fetchIssueBody: async () => body,
      mutateIssueBody: async ({ mutate }) => {
        const before = body;
        const next = mutate(before);
        if (next !== before) {
          body = next;
          calls.writes.push(next);
        }
        return { status: next !== before ? 'ok' : 'no-op', body };
      },
      getBoardState: async () => overrides.state ?? 'review',
      nowIso: () => FIXED_TS,
      detectFullAuto: () => overrides.auto ?? { fired: false, signals: '' },
      postComment: async ({ body: b }) => {
        calls.comments.push(b);
      },
      fetchComments: async () => [],
      fetchProjectValues: async () => ({}),
      promptDrivers: async () => overrides.drivers ?? [],
      deriveDrivers: overrides.deriveDrivers ?? (() => overrides.autoDrivers ?? []),
      ...overrides.deps,
    },
    getBody: () => body,
  };
}

// node:test runs top-level tests concurrently under some runtimes (e.g. the
// Test-stage sandbox). Several tests reach the *real* `withIssueLock`, so they
// must never share an issue number — colliding lock dirs would make one test
// wait out the retry window and throw IssueLockError. A synchronous monotonic
// counter hands each call its own number; the deps ignore the value, so it is
// transparent to every assertion.
let _issueSeq = 6180;
const nextIssue = () => ++_issueSeq;

function run(overrides = {}) {
  const { deps, calls, getBody } = makeDeps(overrides);
  const issueNumber = overrides.issueNumber ?? nextIssue();
  return runApprove({ issueNumber, cfg, projectDir: PROJ, deps }).then((r) => ({
    r,
    calls,
    getBody,
    issueNumber,
  }));
}

// --- runApprove: arg guards ---
test('runApprove: throws without issueNumber', async () => {
  await assert.rejects(() => runApprove({ cfg }), /issueNumber is required/);
});
test('runApprove: throws without cfg', async () => {
  await assert.rejects(() => runApprove({ issueNumber: 618 }), /cfg is required/);
});
test('runApprove: assertBound may throw', async () => {
  await assert.rejects(
    () =>
      runApprove({
        issueNumber: 618,
        cfg,
        projectDir: PROJ,
        deps: {
          assertBound: () => {
            throw new Error('not bound to #618');
          },
        },
      }),
    /not bound/
  );
});

// --- runApprove: state branches ---
test('runApprove: wrong-state when not in review', async () => {
  const { r, calls } = await run({ state: 'develop' });
  assert.equal(r.status, 'wrong-state');
  assert.match(r.message, /develop/);
  assert.equal(calls.writes.length, 0);
});

test('runApprove: already-approved when marker present', async () => {
  const marked = `${REVIEW_BODY}\n<!-- aitm-review-approved ts="${FIXED_TS}" -->\n`;
  const { r, calls } = await run({ initialBody: marked });
  assert.equal(r.status, 'already-approved');
  assert.equal(calls.writes.length, 0);
});

// --- runApprove: human path, drivers > 0 ---
test('runApprove: human path with drivers posts Review Notes', async () => {
  const { r, calls, getBody } = await run({ drivers: ['did a thing', 'and another'] });
  assert.equal(r.status, 'approved');
  assert.equal(r.fullAuto, false);
  assert.equal(r.notesSource, 'human');
  assert.equal(calls.comments.length, 1);
  assert.match(getBody(), /<!-- aitm-review-approved ts="2026-06-29T00:00:00Z" -->/);
  assert.match(getBody(), /- \[x\] Passed final human review/);
});

// --- runApprove: human path, zero drivers → no comment ---
test('runApprove: human path with no drivers posts nothing', async () => {
  const { r, calls } = await run({ drivers: [] });
  assert.equal(r.status, 'approved');
  assert.equal(r.notesSource, 'human');
  assert.equal(calls.comments.length, 0);
});

// --- runApprove: full-auto path → footnote + auto notes always posted ---
test('runApprove: full-auto path inserts footnote and posts auto notes', async () => {
  const { r, calls, getBody } = await run({
    auto: { fired: true, signals: 'reviewer-unset=1,env=0,tty=1,ci=0' },
    autoDrivers: ['auto-derived'],
  });
  assert.equal(r.status, 'approved');
  assert.equal(r.fullAuto, true);
  assert.equal(r.notesSource, 'auto');
  assert.equal(calls.comments.length, 1);
  assert.match(getBody(), /full-auto/i);
});

// --- runApprove: review-notes post failure is caught, approval proceeds ---
test('runApprove: review-notes post failure does not block approval', async () => {
  const { r, calls } = await run({
    drivers: ['x'],
    deps: {
      postComment: async () => {
        throw new Error('comment boom');
      },
    },
  });
  assert.equal(r.status, 'approved');
  assert.equal(calls.writes.length, 1);
});

// --- runApprove: lifecycle-tick-noop warn branch (no Lifecycle section) ---
test('runApprove: lifecycle-noop warns but still approves', async () => {
  const realErr = process.stderr.write.bind(process.stderr);
  const errOut = [];
  process.stderr.write = (s) => (errOut.push(String(s)), true);
  try {
    const { r } = await run({ initialBody: NO_LIFECYCLE_BODY });
    assert.equal(r.status, 'approved');
  } finally {
    process.stderr.write = realErr;
  }
  assert.match(errOut.join(''), /lifecycle-tick-noop/);
});

// --- runApprove: default helpers via fake gh (full-auto path) ---
test('runApprove: default fetch/comment/project helpers run offline', async () => {
  const r = await runApprove({
    issueNumber: nextIssue(),
    cfg,
    projectDir: PROJ,
    deps: {
      assertBound: () => {},
      getBoardState: async () => 'review',
      detectFullAuto: () => ({ fired: true, signals: 'reviewer-unset=1' }),
      mutateIssueBody: async ({ mutate }) => {
        const body = mutate(REVIEW_BODY);
        return { status: 'ok', body };
      },
    },
  });
  assert.equal(r.status, 'approved');
  assert.equal(r.fullAuto, true);
  assert.equal(r.notesSource, 'auto');
});

// --- runApprove: default promptDrivers (non-TTY) via human path ---
test('runApprove: default promptDrivers resolves [] off a TTY', async () => {
  const r = await runApprove({
    issueNumber: nextIssue(),
    cfg,
    projectDir: PROJ,
    deps: {
      assertBound: () => {},
      getBoardState: async () => 'review',
      detectFullAuto: () => ({ fired: false, signals: '' }),
      mutateIssueBody: async ({ mutate }) => ({ status: 'ok', body: mutate(REVIEW_BODY) }),
    },
  });
  assert.equal(r.status, 'approved');
  assert.equal(r.notesSource, 'human');
  assert.deepEqual(r.drivers, []);
});

// --- detectFullAuto signal matrix ---
test('detectFullAuto: not fired when reviewer set, interactive, no CI', () => {
  const out = detectFullAuto({
    env: { TASK_TRACKER_HUMAN_REVIEWER: 'alice' },
    tty: true,
  });
  assert.equal(out.fired, false);
  assert.equal(out.signals, '');
});
test('detectFullAuto: fired via reviewer-unset', () => {
  const out = detectFullAuto({ env: {}, tty: true });
  assert.equal(out.fired, true);
  assert.match(out.signals, /reviewer-unset=1/);
});
test('detectFullAuto: fired via TT_FULL_AUTO', () => {
  const out = detectFullAuto({
    env: { TASK_TRACKER_HUMAN_REVIEWER: 'a', TT_FULL_AUTO: '1' },
    tty: true,
  });
  assert.equal(out.fired, true);
  assert.match(out.signals, /env=1/);
});
test('detectFullAuto: fired via tty=false', () => {
  const out = detectFullAuto({ env: { TASK_TRACKER_HUMAN_REVIEWER: 'a' }, tty: false });
  assert.equal(out.fired, true);
  assert.match(out.signals, /tty=0/);
});
test('detectFullAuto: fired via CI', () => {
  const out = detectFullAuto({ env: { TASK_TRACKER_HUMAN_REVIEWER: 'a', CI: 'true' }, tty: true });
  assert.equal(out.fired, true);
  assert.match(out.signals, /ci=1/);
});

// --- verbApprove: process.exit + stdout/stderr trapped, deps injected ---
function runVerb(rest, deps) {
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
  return verbApprove(rest, cfg, deps)
    .then(result)
    .catch((err) => {
      if (!/__exit_\d+__/.test(err.message)) throw err;
      return result();
    })
    .finally(restore);
}

const okVerbDeps = {
  assertBound: () => {},
  fetchIssueBody: async () => REVIEW_BODY,
  mutateIssueBody: async ({ mutate }) => ({ status: 'ok', body: mutate(REVIEW_BODY) }),
  getBoardState: async () => 'review',
  nowIso: () => FIXED_TS,
  detectFullAuto: () => ({ fired: false, signals: '' }),
  postComment: async () => {},
  fetchComments: async () => [],
  fetchProjectValues: async () => ({}),
  promptDrivers: async () => [],
};

test('verbApprove: no issue number → usage, exit 1', async () => {
  const r = await runVerb([]);
  assert.equal(r.exitCode, 1);
  assert.match(r.stderr, /Usage: \/task approve/);
});

test('verbApprove: TT_SKIP_NETWORK=1 → exit 1', async () => {
  const prev = process.env.TT_SKIP_NETWORK;
  process.env.TT_SKIP_NETWORK = '1';
  try {
    const r = await runVerb(['618']);
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /TT_SKIP_NETWORK/);
  } finally {
    if (prev === undefined) delete process.env.TT_SKIP_NETWORK;
    else process.env.TT_SKIP_NETWORK = prev;
  }
});

test('verbApprove: IssueLockError → exit 7', async () => {
  delete process.env.TT_SKIP_NETWORK;
  const r = await runVerb(['618'], {
    assertBound: () => {
      throw new IssueLockError('issue 618 locked by session x (held since now)', { issue: 618 });
    },
  });
  assert.equal(r.exitCode, 7);
});

test('verbApprove: generic error → exit 1', async () => {
  delete process.env.TT_SKIP_NETWORK;
  const r = await runVerb(['618'], {
    assertBound: () => {
      throw new Error('kaboom');
    },
  });
  assert.equal(r.exitCode, 1);
  assert.match(r.stderr, /approve: kaboom/);
});

test('verbApprove: wrong-state → exit 3', async () => {
  delete process.env.TT_SKIP_NETWORK;
  const r = await runVerb(['618'], { ...okVerbDeps, getBoardState: async () => 'develop' });
  assert.equal(r.exitCode, 3);
  assert.match(r.stderr, /expected 'review'/);
});

test('verbApprove: approved → stdout, no exit', async () => {
  delete process.env.TT_SKIP_NETWORK;
  const n = nextIssue();
  const r = await runVerb([String(n)], okVerbDeps);
  assert.equal(r.exitCode, null);
  assert.match(r.stdout, new RegExp(`Review approved for #${n}`));
});

test('verbApprove: already-approved → stdout, no exit', async () => {
  delete process.env.TT_SKIP_NETWORK;
  const n = nextIssue();
  const marked = `${REVIEW_BODY}\n<!-- aitm-review-approved ts="${FIXED_TS}" -->\n`;
  const r = await runVerb([String(n)], { ...okVerbDeps, fetchIssueBody: async () => marked });
  assert.equal(r.exitCode, null);
  assert.match(r.stdout, /already has a review-approval marker/);
});

console.log('coverage-approve.test.mjs: defined');
