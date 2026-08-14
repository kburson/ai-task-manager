// @story #647
// Offline coverage-lift for scripts/gh/set-priority.mjs. Drives the exported
// main(argv, deps) + setPriority/getProjectItemId through injected loadConfig,
// gh, gql, log, err, exit stubs — no gh, no network, no live board. Covers the
// help route, every argument-validation branch, the not-configured and
// missing-option guards, the TT_SKIP_NETWORK short-circuit, the item-lookup +
// item-edit write
// write, the not-found skip, and the --cascade sub-issue loop (found / none /
// query-throws).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { main, setPriority, getProjectItemId } from '../../../../gh/set-priority.mjs';

const FULL_CFG = {
  repo: 'o/r',
  projectId: 'P1',
  priorityFieldId: 'PF',
  priorityOptionP0: 'opt0',
  priorityOptionP1: 'opt1',
  priorityOptionP2: 'opt2',
  priorityOptionP3: 'opt3',
};

// Build a deps bundle with collectors for log/err/exit and stubbed I/O.
function harness({ cfg = FULL_CFG, gql, gh, skipNetwork = false } = {}) {
  const logs = [];
  const errs = [];
  const exits = [];
  const ghCalls = [];
  const deps = {
    loadConfig: () => cfg,
    log: (s) => logs.push(s),
    err: (s) => errs.push(s),
    exit: (c) => exits.push(c),
    skipNetwork,
    gql: gql || (async () => ({})),
    gh: gh || (async (args) => ghCalls.push(args)),
  };
  return { deps, logs, errs, exits, ghCalls };
}

const argv = (...rest) => ['node', 'set-priority.mjs', ...rest];

test('help route emits self-doc and exits 0', async () => {
  const h = harness();
  await main(argv('--help'), h.deps);
  assert.deepEqual(h.exits, [0]);
});

test('missing args → usage, exit 1', async () => {
  const h = harness();
  await main(argv(), h.deps);
  assert.deepEqual(h.exits, [1]);
  assert.match(h.errs.join(''), /Usage:/);
});

test('non-numeric issue → usage, exit 1', async () => {
  const h = harness();
  await main(argv('abc', 'p1'), h.deps);
  assert.deepEqual(h.exits, [1]);
});

test('unknown priority → exit 1', async () => {
  const h = harness();
  await main(argv('5', 'p9'), h.deps);
  assert.deepEqual(h.exits, [1]);
  assert.match(h.errs.join(''), /Unknown priority/);
});

test('missing projectId/priorityFieldId (network on) → exit 1', async () => {
  const h = harness({ cfg: { repo: 'o/r' } });
  await main(argv('5', 'p1'), h.deps);
  assert.deepEqual(h.exits, [1]);
  assert.match(h.errs.join(''), /not configured/);
});

test('missing option id for the priority (network on) → exit 1', async () => {
  const h = harness({ cfg: { repo: 'o/r', projectId: 'P1', priorityFieldId: 'PF' } });
  await main(argv('5', 'p1'), h.deps);
  assert.deepEqual(h.exits, [1]);
  assert.match(h.errs.join(''), /option ID/);
});

test('TT_SKIP_NETWORK short-circuit logs the check mark, no gh call', async () => {
  const h = harness({ skipNetwork: true });
  await main(argv('5', 'p2'), h.deps);
  assert.equal(h.ghCalls.length, 0);
  assert.match(h.logs.join('\n'), /#5 → P2/);
  assert.deepEqual(h.exits, []);
});

test('network happy path resolves item and issues item-edit', async () => {
  const gql = async () => ({
    data: undefined,
    repository: { issue: { projectItems: { nodes: [{ id: 'IT1', project: { id: 'P1' } }] } } },
  });
  const h = harness({ gql });
  await main(argv('7', 'p1'), h.deps);
  assert.equal(h.ghCalls.length, 1);
  const args = h.ghCalls[0];
  assert.deepEqual(args.slice(0, 2), ['project', 'item-edit']);
  assert.ok(args.includes('opt1'));
  assert.ok(args.includes('IT1'));
  assert.match(h.logs.join('\n'), /#7 → P1/);
});

test('network item not found → skip, no gh call', async () => {
  const gql = async () => ({
    repository: { issue: { projectItems: { nodes: [{ id: 'X', project: { id: 'OTHER' } }] } } },
  });
  const h = harness({ gql });
  await main(argv('8', 'p1'), h.deps);
  assert.equal(h.ghCalls.length, 0);
  assert.match(h.logs.join('\n'), /not found in project — skipping/);
});

test('cascade with two sub-issues sets priority on parent + each child', async () => {
  let call = 0;
  const gql = async (query) => {
    // First lookup for the parent item, then item lookups for children, plus
    // the subIssues query. Route by query content.
    if (/subIssues/.test(query)) {
      return { repository: { issue: { subIssues: { nodes: [{ number: 11 }, { number: 12 }] } } } };
    }
    call++;
    return {
      repository: {
        issue: { projectItems: { nodes: [{ id: `IT${call}`, project: { id: 'P1' } }] } },
      },
    };
  };
  const h = harness({ gql });
  await main(argv('10', 'p1', '--cascade'), h.deps);
  // parent + 2 children = 3 item-edit writes
  assert.equal(h.ghCalls.length, 3);
  assert.match(h.logs.join('\n'), /Cascading to sub-issues/);
});

test('cascade with no sub-issues logs "No sub-issues found"', async () => {
  const gql = async (query) => {
    if (/subIssues/.test(query)) {
      return { repository: { issue: { subIssues: { nodes: [] } } } };
    }
    return {
      repository: { issue: { projectItems: { nodes: [{ id: 'IT1', project: { id: 'P1' } }] } } },
    };
  };
  const h = harness({ gql });
  await main(argv('10', 'p1', '--cascade'), h.deps);
  assert.match(h.logs.join('\n'), /No sub-issues found/);
});

test('cascade sub-issue query throwing is swallowed → No sub-issues found', async () => {
  const gql = async (query) => {
    if (/subIssues/.test(query)) throw new Error('subIssues unsupported');
    return {
      repository: { issue: { projectItems: { nodes: [{ id: 'IT1', project: { id: 'P1' } }] } } },
    };
  };
  const h = harness({ gql });
  await main(argv('10', 'p1', '--cascade'), h.deps);
  assert.match(h.logs.join('\n'), /No sub-issues found/);
});

// ── direct unit tests for the exported helpers ────────────────────────────────
test('getProjectItemId returns the matching project item id', async () => {
  const gql = async () => ({
    repository: { issue: { projectItems: { nodes: [{ id: 'IT9', project: { id: 'P1' } }] } } },
  });
  const id = await getProjectItemId({
    gql,
    owner: 'o',
    repoName: 'r',
    issueNum: 3,
    projectId: 'P1',
  });
  assert.equal(id, 'IT9');
});

test('getProjectItemId returns "" when no node matches / nodes missing', async () => {
  const gql = async () => ({ repository: { issue: { projectItems: {} } } });
  const id = await getProjectItemId({
    gql,
    owner: 'o',
    repoName: 'r',
    issueNum: 3,
    projectId: 'P1',
  });
  assert.equal(id, '');
});

test('setPriority skipNetwork branch just logs', async () => {
  const logs = [];
  await setPriority('42', { skipNetwork: true, priorityLabel: 'P3', log: (s) => logs.push(s) });
  assert.match(logs.join(''), /#42 → P3/);
});
