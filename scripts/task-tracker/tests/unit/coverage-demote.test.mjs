#!/usr/bin/env node
// @story #616
// Coverage for verbs/demote.mjs. Drives runDemote directly through its dep seam
// (assertBound / fetchIssueBody / mutateIssueBody / getLiveState / runMoveState)
// so every result branch is hit without network: arg guards, bind assertion,
// missing-board error, bootstrap, drift-refused, unknown-recorded-state,
// invalid-source-refused, transition-failed, and the demoted success path.
// verbDemote's switch arms are driven via a process.exit/stdout/stderr trap and
// the verb's optional deps seam.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import { runDemote, verbDemote } from '../../verbs/demote.mjs';

const CFG = { repo: 'o/r' };
const TS = '2026-06-01T00:00:00Z';

// #935 — demote-to-develop hard-refuses (after the arg guards + assertBound, but
// before any fetch/move) unless a code-change reason is declared. These branch
// tests reach the downstream demote logic, so runDemote calls pass a reason and
// verbDemote arg vectors carry `--rework <reason>`. The refusal branch itself is
// asserted explicitly at the end of this file.
const REWORK = 'code rework needed';
const REWORK_ARGS = ['--rework', REWORK];

// A fake `gh` on PATH so the default I/O dep functions (defaultFetchIssueBody /
// defaultGetLiveState, which both route through `gql` → `gh api graphql`) run
// offline. The fake reads the GraphQL payload on stdin and answers based on the
// query shape: projectItems → live Status, otherwise → issue body.
const FAKE_GH_DIR = mkdtempSync(join(projectScratchDir('test'), 'demote-gh-'));
writeFileSync(
  join(FAKE_GH_DIR, 'gh'),
  [
    '#!/usr/bin/env node',
    "let input = '';",
    "process.stdin.on('data', (c) => (input += c));",
    "process.stdin.on('end', () => {",
    "  const isLive = input.includes('projectItems');",
    '  const data = isLive',
    "    ? { repository: { issue: { projectItems: { nodes: [{ project: { id: 'P' }, fieldValueByName: { name: 'Test' } }] } } } }",
    '    : { repository: { issue: { body: \'## Demote\\n\\n<!-- aitm-last-known-state state="test" ts="2026-06-01T00:00:00Z" -->\\n\' } } };',
    '  process.stdout.write(JSON.stringify({ data }));',
    '});',
  ].join('\n'),
  { mode: 0o755 }
);
chmodSync(join(FAKE_GH_DIR, 'gh'), 0o755);
process.env.PATH = `${FAKE_GH_DIR}:${process.env.PATH}`;

// Body recording a given lastKnownState marker, or none when state is null.
function bodyFor(state) {
  if (!state) return '## Demote\n\nNo recorded state yet.\n';
  return `## Demote\n\n<!-- aitm-last-known-state state="${state}" ts="${TS}" -->\n`;
}

// Assemble a deps object; defaults give a clean, bound, no-op-friendly path.
function deps({
  body = bodyFor('test'),
  live = 'test',
  moveExit = 0,
  onMutate,
  boundThrows = false,
} = {}) {
  return {
    assertBound: () => {
      if (boundThrows) throw new Error('not bound to #5');
    },
    fetchIssueBody: async () => ({ body }),
    getLiveState: async () => live,
    runMoveState: async () => moveExit,
    mutateIssueBody: async ({ mutate }) => {
      if (onMutate) onMutate(mutate(body));
      return { status: 'ok' };
    },
  };
}

test('runDemote: throws without issueNumber', async () => {
  await assert.rejects(() => runDemote({ cfg: CFG }), /issueNumber is required/);
});

test('runDemote: throws without cfg', async () => {
  await assert.rejects(() => runDemote({ issueNumber: 5 }), /cfg is required/);
});

test('runDemote: assertBound is invoked and may throw', async () => {
  await assert.rejects(
    () => runDemote({ issueNumber: 5, cfg: CFG, deps: deps({ boundThrows: true }) }),
    /not bound/
  );
});

test('runDemote: no recorded + no live → error (board item missing)', async () => {
  const r = await runDemote({
    issueNumber: 5,
    cfg: CFG,
    rework: REWORK,
    deps: deps({ body: bodyFor(null), live: null }),
  });
  assert.equal(r.status, 'error');
  assert.match(r.message, /board item missing/);
});

test('runDemote: no recorded + live → bootstrap, then demoted', async () => {
  const stamps = [];
  const r = await runDemote({
    issueNumber: 5,
    cfg: CFG,
    rework: REWORK,
    deps: deps({ body: bodyFor(null), live: 'test', onMutate: (b) => stamps.push(b) }),
  });
  assert.equal(r.status, 'demoted');
  assert.equal(r.bootstrapped, true);
  assert.equal(r.from, 'test');
  assert.equal(r.to, 'develop');
  // First mutate is the bootstrap stamp (live), the second is the post-move stamp.
  assert.match(stamps[0], /aitm-last-known-state state="test"/);
  assert.match(stamps[stamps.length - 1], /aitm-last-known-state state="develop"/);
});

test('runDemote: live disagrees with recorded → drift-refused', async () => {
  const r = await runDemote({
    issueNumber: 5,
    cfg: CFG,
    rework: REWORK,
    deps: deps({ body: bodyFor('test'), live: 'review' }),
  });
  assert.equal(r.status, 'drift-refused');
  assert.equal(r.live, 'review');
  assert.equal(r.recorded, 'test');
});

test('runDemote: unknown recorded state → error', async () => {
  const r = await runDemote({
    issueNumber: 5,
    cfg: CFG,
    rework: REWORK,
    deps: deps({ body: bodyFor('banana'), live: 'banana' }),
  });
  assert.equal(r.status, 'error');
  assert.match(r.message, /unknown recorded state/);
});

test('runDemote: legal-but-non-source state → invalid-source-refused', async () => {
  const r = await runDemote({
    issueNumber: 5,
    cfg: CFG,
    rework: REWORK,
    deps: deps({ body: bodyFor('develop'), live: 'develop' }),
  });
  assert.equal(r.status, 'invalid-source-refused');
  assert.equal(r.from, 'develop');
});

test('runDemote: move-state nonzero exit → transition-failed', async () => {
  const r = await runDemote({
    issueNumber: 5,
    cfg: CFG,
    rework: REWORK,
    deps: deps({ body: bodyFor('review'), live: 'review', moveExit: 7 }),
  });
  assert.equal(r.status, 'transition-failed');
  assert.equal(r.exitCode, 7);
});

test('runDemote: recorded test, live test, move ok → demoted (no bootstrap)', async () => {
  let stamped = null;
  const r = await runDemote({
    issueNumber: 5,
    cfg: CFG,
    rework: REWORK,
    deps: deps({ body: bodyFor('test'), live: 'test', onMutate: (b) => (stamped = b) }),
  });
  assert.equal(r.status, 'demoted');
  assert.equal(r.bootstrapped, false);
  assert.equal(r.from, 'test');
  assert.equal(r.to, 'develop');
  assert.match(stamped, /aitm-last-known-state state="develop"/);
});

test('runDemote: recorded review → demoted from review', async () => {
  const r = await runDemote({
    issueNumber: 5,
    cfg: CFG,
    rework: REWORK,
    deps: deps({ body: bodyFor('review'), live: 'review' }),
  });
  assert.equal(r.status, 'demoted');
  assert.equal(r.from, 'review');
});

test('runDemote: default fetch + live-state deps run via fake gh → demoted', async () => {
  // No fetchIssueBody / getLiveState injected → the real defaults run, each
  // routing through `gql` → the fake `gh`. move-state + the body write are
  // stubbed so the test stays offline and side-effect-free.
  const r = await runDemote({
    issueNumber: 5,
    cfg: { repo: 'o/r', projectId: 'P' },
    rework: REWORK,
    deps: {
      assertBound: () => {},
      runMoveState: async () => 0,
      mutateIssueBody: async () => ({ status: 'ok' }),
    },
  });
  assert.equal(r.status, 'demoted');
  assert.equal(r.from, 'test');
  assert.equal(r.to, 'develop');
});

// --- verbDemote: process.exit + stdout/stderr trapped, deps injected ---
// The verb forwards its third arg straight to runDemote's dep seam, so we drive
// every switch branch (and the try/catch) offline without any network.
function runVerb(rest, { deps } = {}) {
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
  return verbDemote(rest, CFG, deps)
    .then(result)
    .catch((err) => {
      if (!/__exit_\d+__/.test(err.message)) throw err;
      return result();
    })
    .finally(restore);
}

test('verbDemote: no issue number → usage, exit 1', async () => {
  const r = await runVerb([]);
  assert.equal(r.exitCode, 1);
  assert.match(r.stderr, /Usage:/);
});

test('verbDemote: demoted → stdout, no exit', async () => {
  const r = await runVerb(['5', ...REWORK_ARGS], {
    deps: deps({ body: bodyFor('test'), live: 'test' }),
  });
  assert.equal(r.exitCode, null);
  assert.match(r.stdout, /demoted: test → develop/);
});

test('verbDemote: bootstrap demoted → stdout notes bootstrap', async () => {
  const r = await runVerb(['#5', ...REWORK_ARGS], {
    deps: deps({ body: bodyFor(null), live: 'test' }),
  });
  assert.equal(r.exitCode, null);
  assert.match(r.stdout, /bootstrap/);
});

test('verbDemote: drift-refused → stderr, exit 4', async () => {
  const r = await runVerb(['5', ...REWORK_ARGS], {
    deps: deps({ body: bodyFor('test'), live: 'review' }),
  });
  assert.equal(r.exitCode, 4);
  assert.match(r.stderr, /drift detected/);
});

test('verbDemote: invalid-source-refused → stderr, exit 4', async () => {
  const r = await runVerb(['5', ...REWORK_ARGS], {
    deps: deps({ body: bodyFor('develop'), live: 'develop' }),
  });
  assert.equal(r.exitCode, 4);
  assert.match(r.stderr, /only valid from test or review/);
});

test('verbDemote: transition-failed → stderr, exit code', async () => {
  const r = await runVerb(['5', ...REWORK_ARGS], {
    deps: deps({ body: bodyFor('review'), live: 'review', moveExit: 7 }),
  });
  assert.equal(r.exitCode, 7);
  assert.match(r.stderr, /exited 7/);
});

test('verbDemote: error status → stderr, exit 1', async () => {
  const r = await runVerb(['5', ...REWORK_ARGS], {
    deps: deps({ body: bodyFor(null), live: null }),
  });
  assert.equal(r.exitCode, 1);
  assert.match(r.stderr, /board item missing/);
});

test('verbDemote: runDemote throws → stderr, exit 1', async () => {
  const r = await runVerb(['5'], { deps: deps({ boundThrows: true }) });
  assert.equal(r.exitCode, 1);
  assert.match(r.stderr, /demote: not bound/);
});
test('runDemote: no --rework → rework-required (refuses before any fetch)', async () => {
  let fetched = false;
  const r = await runDemote({
    issueNumber: 5,
    cfg: CFG,
    deps: {
      assertBound: () => {},
      fetchIssueBody: async () => ((fetched = true), { body: bodyFor('test') }),
      getLiveState: async () => 'test',
      runMoveState: async () => 0,
      mutateIssueBody: async () => ({ status: 'ok' }),
    },
  });
  assert.equal(r.status, 'rework-required');
  assert.match(r.message, /CODE-REWORK path/);
  assert.equal(fetched, false, 'no network fetch on the refusal path');
});

test('verbDemote: rework-required → stderr, exit 4', async () => {
  const r = await runVerb(['5'], { deps: deps({ body: bodyFor('test'), live: 'test' }) });
  assert.equal(r.exitCode, 4);
  assert.match(r.stderr, /CODE-REWORK path/);
});

// NB: verbDemote's `default` switch arm is unreachable here on purpose —
// runDemote only ever returns the statuses tested above, so forcing it would
// require fabricating an impossible result. Left uncovered honestly.

console.log('coverage-demote.test.mjs: defined');
