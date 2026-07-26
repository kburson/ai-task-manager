// @story #637
// Coverage lift for heal-entry-markers.mjs: exercises the pure heal-decision
// transforms plus the deps-seam'd gh-I/O primitives and the main/healOne
// orchestration with deterministic offline stubs. No network, no live board.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkOnlyExitCode,
  stripStageMarkers,
  detectIllegalArcs,
  outOfOrderHealableStages,
  backlogCreatedAtFallback,
  planStageHeal,
  fetchOpenIssues,
  fetchIssue,
  writeBody,
  postComment,
  healOne,
  main,
} from '../../../heal-entry-markers.mjs';

// ---- fixtures -------------------------------------------------------------

function entered(stage, ts, visit) {
  const suf = visit ? `-${visit}` : '';
  return `<!-- aitm-entered-${stage}${suf}: ${ts} -->`;
}
function audit(stage) {
  return `<!-- aitm-backfill: ${stage}: reason=x ts=t -->`;
}
function bodyOf(lines) {
  return `# Issue\n\n## Progress\n\n${lines.join('\n')}\n`;
}

const CHAIN = [
  ['backlog', '2026-01-01T00:00:00Z'],
  ['on-deck', '2026-01-01T12:00:00Z'],
  ['refine', '2026-01-02T00:00:00Z'],
  ['plan', '2026-01-03T00:00:00Z'],
  ['develop', '2026-01-04T00:00:00Z'],
  ['test', '2026-01-05T00:00:00Z'],
  ['review', '2026-01-06T00:00:00Z'],
];
function auditedChain(extra = []) {
  const lines = [];
  for (const [s, ts] of CHAIN) {
    lines.push(entered(s, ts));
    lines.push(audit(s));
  }
  return bodyOf(lines.concat(extra));
}

function markersOf(pairs) {
  return Object.fromEntries(pairs);
}

// ---- checkOnlyExitCode ----------------------------------------------------

test('checkOnlyExitCode: error precedence, plan, clean', () => {
  assert.equal(checkOnlyExitCode([{ action: 'error' }, { action: 'plan' }]), 2);
  assert.equal(checkOnlyExitCode([{ action: 'plan' }]), 1);
  assert.equal(checkOnlyExitCode([{ action: 'illegal-arcs' }]), 1);
  assert.equal(checkOnlyExitCode([{ action: 'skip' }]), 0);
});

// ---- stripStageMarkers ----------------------------------------------------

test('stripStageMarkers removes entry + legacy/new audit markers', () => {
  const src = bodyOf([
    entered('refine', '2026-01-02T00:00:00Z'),
    audit('refine'),
    '<!-- aitm-backfill stage="refine" reason=y ts=t -->',
    entered('plan', '2026-01-03T00:00:00Z'),
  ]);
  const out = stripStageMarkers(src, 'refine');
  assert.ok(!/aitm-entered-refine:/.test(out));
  assert.ok(!/aitm-backfill:\s*refine:/.test(out));
  assert.ok(!/aitm-backfill stage="refine"/.test(out));
  assert.ok(/aitm-entered-plan:/.test(out)); // untouched
});

// ---- detectIllegalArcs ----------------------------------------------------

test('detectIllegalArcs: <2 markers empty; legal chain empty; illegal flagged', () => {
  assert.deepEqual(detectIllegalArcs(bodyOf([entered('refine', '2026-01-02T00:00:00Z')])), []);
  assert.deepEqual(detectIllegalArcs(auditedChain()), []);
  const reopened = auditedChain([entered('backlog', '2026-02-01T00:00:00Z', 2)]);
  const arcs = detectIllegalArcs(reopened);
  assert.ok(arcs.length >= 1);
  assert.equal(arcs[arcs.length - 1].to, 'backlog');
});

// ---- outOfOrderHealableStages ---------------------------------------------

test('outOfOrderHealableStages flags a stage newer than a later stage', () => {
  const m = markersOf([
    ['refine', '2026-02-01T00:00:00Z'],
    ['plan', '2026-01-01T00:00:00Z'],
  ]);
  assert.ok(outOfOrderHealableStages(m).has('refine'));
  const ok = markersOf([
    ['refine', '2026-01-01T00:00:00Z'],
    ['plan', '2026-02-01T00:00:00Z'],
  ]);
  assert.equal(outOfOrderHealableStages(ok).size, 0);
});

// ---- backlogCreatedAtFallback ---------------------------------------------

test('backlogCreatedAtFallback: bumps refine when it collides; throws on bad createdAt', () => {
  const created = '2026-01-01T00:00:00Z';
  const withRefine = backlogCreatedAtFallback({
    markers: { refine: '2026-01-01T00:00:00Z' },
    createdAt: created,
  });
  assert.equal(withRefine.backlogTs, '2026-01-01T00:00:01Z');
  assert.equal(withRefine.refineBumpTs, '2026-01-01T00:00:02Z');
  const noRefine = backlogCreatedAtFallback({ markers: {}, createdAt: created });
  assert.equal(noRefine.refineBumpTs, null);
  assert.throws(() => backlogCreatedAtFallback({ markers: {}, createdAt: 'not-a-date' }));
});

// ---- planStageHeal --------------------------------------------------------

test('planStageHeal: backfill for missing entry with a later marker', () => {
  const body = bodyOf([entered('plan', '2026-01-05T00:00:00Z')]);
  const plan = planStageHeal({ stage: 'refine', body, createdAt: '2026-01-01T00:00:00Z' });
  assert.equal(plan.action, 'backfill');
  assert.equal(plan.mode, 'entry+audit');
});

test('planStageHeal: restamp for out-of-order entry', () => {
  const body = bodyOf([
    entered('refine', '2026-02-01T00:00:00Z'),
    entered('plan', '2026-01-05T00:00:00Z'),
  ]);
  const plan = planStageHeal({ stage: 'refine', body, createdAt: '2026-01-01T00:00:00Z' });
  assert.equal(plan.action, 'restamp');
  assert.ok(plan.strippedBody);
});

test('planStageHeal: audit-only for present-but-unaudited entry', () => {
  const body = bodyOf([
    entered('refine', '2026-01-02T00:00:00Z'),
    entered('plan', '2026-01-05T00:00:00Z'),
  ]);
  const plan = planStageHeal({ stage: 'refine', body, createdAt: '2026-01-01T00:00:00Z' });
  assert.equal(plan.action, 'audit-only');
});

test('planStageHeal: skip when unparseable entry ts (property-grammar form)', () => {
  const body = bodyOf([
    '<!-- aitm-entered-refine ts="2026-01-02T00:00:00Z" -->',
    entered('plan', '2026-01-05T00:00:00Z'),
  ]);
  const plan = planStageHeal({ stage: 'refine', body, createdAt: '2026-01-01T00:00:00Z' });
  assert.equal(plan.action, 'skip');
  assert.equal(plan.reason, 'entry-marker-unparseable');
});

test('planStageHeal: backlog createdAt fallback when refine sits at createdAt', () => {
  const body = bodyOf([entered('refine', '2026-01-01T00:00:00Z')]);
  const plan = planStageHeal({ stage: 'backlog', body, createdAt: '2026-01-01T00:00:00Z' });
  assert.equal(plan.action, 'backfill');
  assert.equal(plan.reason, 'createdAt-anchored-backlog-fallback');
  assert.ok(plan.refineBumpTs);
});

test('planStageHeal: non-backlog with no feasible interval rethrows', () => {
  const body = bodyOf([entered('plan', '2026-01-01T00:00:00Z')]);
  assert.throws(() => planStageHeal({ stage: 'refine', body, createdAt: '2026-01-05T00:00:00Z' }));
});

test('planStageHeal: skip when nothing to heal', () => {
  const body = auditedChain();
  const plan = planStageHeal({ stage: 'refine', body, createdAt: '2026-01-01T00:00:00Z' });
  assert.equal(plan.action, 'skip');
});

// ---- gh-I/O primitives (deps.pexec stub) ----------------------------------

test('fetchOpenIssues maps numbers to strings via stub gh', async () => {
  const calls = [];
  const pexec = async (cmd, args) => {
    calls.push([cmd, ...args]);
    return { stdout: JSON.stringify([{ number: 1 }, { number: 2 }]) };
  };
  const nums = await fetchOpenIssues('o/r', { pexec });
  assert.deepEqual(nums, ['1', '2']);
  assert.equal(calls[0][0], 'gh');
  assert.ok(calls[0].includes('open'));
});

test('fetchIssue returns parsed JSON via stub gh', async () => {
  const pexec = async () => ({
    stdout: JSON.stringify({ number: 5, body: 'b', createdAt: 'c' }),
  });
  const issue = await fetchIssue('o/r', '5', { pexec });
  assert.equal(issue.number, 5);
});

test('writeBody writes a temp file, edits, and unlinks (unlink error swallowed)', async () => {
  const editArgs = [];
  const pexec = async (cmd, args) => {
    editArgs.push(args);
    return { stdout: '' };
  };
  const written = [];
  await writeBody('o/r', '7', 'BODY', {
    pexec,
    writeFile: (p, b) => written.push([p, b]),
    unlink: () => {
      throw new Error('gone');
    },
    scratchDir: () => '/tmp-scratch',
  });
  assert.equal(written[0][1], 'BODY');
  assert.ok(editArgs[0].includes('--body-file'));
});

test('postComment shells gh issue comment', async () => {
  const seen = [];
  await postComment('o/r', '9', 'hi', {
    pexec: async (cmd, args) => {
      seen.push(args);
      return { stdout: '' };
    },
  });
  assert.ok(seen[0].includes('comment'));
  assert.ok(seen[0].includes('hi'));
});

// ---- healOne (deps-injected fetch/write/post) -----------------------------

function healDeps(issue, sink) {
  return {
    fetchIssue: async () => issue,
    writeBody: async (repo, num, body) => sink.writes.push(body),
    postComment: async (repo, num, body) => sink.comments.push(body),
  };
}

test('healOne: skip when body is a clean audited chain', async () => {
  const deps = healDeps(
    { body: auditedChain(), createdAt: '2026-01-01T00:00:00Z' },
    {
      writes: [],
      comments: [],
    }
  );
  const r = await healOne({ repo: 'o/r', num: '1', apply: false, deps });
  assert.equal(r.action, 'skip');
});

test('healOne: dry-run returns plan without writing', async () => {
  const sink = { writes: [], comments: [] };
  const body = bodyOf([entered('plan', '2026-01-05T00:00:00Z')]);
  const deps = healDeps({ body, createdAt: '2026-01-01T00:00:00Z' }, sink);
  const r = await healOne({ repo: 'o/r', num: '2', apply: false, deps });
  assert.equal(r.action, 'plan');
  assert.equal(sink.writes.length, 0);
});

test('healOne: apply writes body + posts comment', async () => {
  const sink = { writes: [], comments: [] };
  const body = bodyOf([entered('plan', '2026-01-05T00:00:00Z')]);
  const deps = healDeps({ body, createdAt: '2026-01-01T00:00:00Z' }, sink);
  const r = await healOne({ repo: 'o/r', num: '3', apply: true, deps });
  assert.equal(r.action, 'applied');
  assert.equal(sink.writes.length, 1);
  assert.equal(sink.comments.length, 1);
});

test('healOne: apply restamp path (out-of-order) rewrites body', async () => {
  const sink = { writes: [], comments: [] };
  const body = bodyOf([
    entered('refine', '2026-02-01T00:00:00Z'),
    entered('plan', '2026-01-05T00:00:00Z'),
    audit('plan'),
  ]);
  const deps = healDeps({ body, createdAt: '2026-01-01T00:00:00Z' }, sink);
  const r = await healOne({ repo: 'o/r', num: '4', apply: true, deps });
  assert.equal(r.action, 'applied');
  assert.ok(sink.writes.length === 1);
});

test('healOne: illegal-arcs only (no heals) reported', async () => {
  const body = auditedChain([entered('backlog', '2026-02-01T00:00:00Z', 2)]);
  const deps = healDeps({ body, createdAt: '2026-01-01T00:00:00Z' }, { writes: [], comments: [] });
  const r = await healOne({ repo: 'o/r', num: '5', apply: false, deps });
  assert.equal(r.action, 'illegal-arcs');
  assert.ok(r.illegalArcs.length >= 1);
});

// ---- main -----------------------------------------------------------------

function mainSink() {
  const out = [];
  const err = [];
  let code = null;
  return {
    out: (s) => out.push(s),
    err: (s) => err.push(s),
    exit: (c) => {
      code = c;
    },
    text: () => out.join(''),
    errText: () => err.join(''),
    code: () => code,
  };
}

test('main: --apply and --check-only are mutually exclusive → exit 2', async () => {
  const s = mainSink();
  await main(['--apply', '--check-only'], { ...s, loadConfig: () => ({ repo: 'o/r' }) });
  assert.equal(s.code(), 2);
  assert.match(s.errText(), /mutually exclusive/);
});

test('main: dry-run over explicit issues prints all result branches', async () => {
  const s = mainSink();
  const results = {
    10: {
      num: '10',
      action: 'plan',
      stagesActed: [{ stage: 'refine', action: 'backfill', ts: 't', reason: 'r' }],
      illegalArcs: [{ from: 'done', to: 'backlog', atTs: 't2' }],
    },
    11: {
      num: '11',
      action: 'illegal-arcs',
      illegalArcs: [{ from: 'done', to: 'backlog', atTs: 't3' }],
    },
    12: { num: '12', action: 'skip', reason: 'no-heal-needed' },
  };
  await main(['#10', '11', '12'], {
    ...s,
    loadConfig: () => ({ repo: 'o/r' }),
    healOne: async ({ num }) => results[num],
  });
  const t = s.text();
  assert.match(t, /would heal/);
  assert.match(t, /illegal arcs detected/);
  assert.match(t, /skip \(no-heal-needed\)/);
  assert.match(t, /dry-run/);
});

test('main: apply prints applied, and healOne throw becomes error', async () => {
  const s = mainSink();
  await main(['20', '21', '--apply'], {
    ...s,
    loadConfig: () => ({ repo: 'o/r' }),
    confirmBlastRadius: async () => ({ proceed: true }),
    healOne: async ({ num }) => {
      if (num === '21') throw new Error('boom');
      return {
        num,
        action: 'applied',
        stagesActed: [{ stage: 'plan', action: 'backfill', ts: 't' }],
      };
    },
  });
  assert.match(s.text(), /healed/);
  assert.match(s.errText(), /ERROR boom/);
});

test('main: no explicit issues scans open issues via fetchOpenIssues', async () => {
  const s = mainSink();
  let scanned = false;
  await main([], {
    ...s,
    loadConfig: () => ({ repo: 'o/r' }),
    fetchOpenIssues: async () => {
      scanned = true;
      return ['30'];
    },
    healOne: async ({ num }) => ({ num, action: 'skip', reason: 'no-heal-needed' }),
  });
  assert.ok(scanned);
});

test('main: --check-only exits with checkOnlyExitCode', async () => {
  const s = mainSink();
  await main(['40', '--check-only'], {
    ...s,
    loadConfig: () => ({ repo: 'o/r' }),
    healOne: async ({ num }) => ({ num, action: 'skip', reason: 'clean' }),
  });
  assert.equal(s.code(), 0);
});

console.log('coverage-heal-entry-markers.test.mjs: ok');
