// @story #905
// #905 — merge a child back into its epic (design: "Merge-back protocol").
// Opportunistically sync the epic onto its parent (skip if already current),
// rebase the child onto the epic head, run the child's tests, then fast-forward
// only. Refuse on rebase conflict or test failure; clean up on success. git +
// graph + test-runner injected.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildMergeBackGraphNode,
  loadMergeBackGraph,
  mergeBack,
} from '../../../task-tracker/merge-back.mjs';
import { resolveEpicLineage } from '../../../task-tracker/lib/resolve-epic-lineage.mjs';
import { serializeIssueWorktreeLocationMarker } from '../../../task-tracker/lib/issue-worktree-location.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));

const GRAPH = {
  905: { parent: null, children: [910, 920] }, // root epic (parent = trunk)
  910: { parent: 905, children: [] }, // child of 905
  920: { parent: 905, children: [921] }, // nested epic under 905
  921: { parent: 920, children: [] }, // child of nested epic 920
};
const graph = (n) => GRAPH[n] ?? { parent: null, children: [] };

function makeGit({ grandparentIsAncestor = true, rebaseChildFails = false } = {}) {
  const calls = [];
  const git = (args) => {
    calls.push(args);
    if (args[0] === 'merge-base' && args.includes('--is-ancestor')) {
      if (!grandparentIsAncestor) {
        const e = new Error('trunk moved ahead');
        e.status = 1;
        throw e;
      }
      return '';
    }
    // rebase of the CHILD onto the epic: args = ['rebase','feature/epic/905','feature/child/910']
    if (args[0] === 'rebase' && args[2] === 'feature/child/910' && rebaseChildFails) {
      const e = new Error('rebase conflict in child');
      e.status = 1;
      throw e;
    }
    return '';
  };
  git.calls = calls;
  return git;
}

test('clean fast-forward path: sync-skip, rebase child, test, ff, cleanup', () => {
  const git = makeGit(); // grandparent already ancestor → epic sync is a no-op
  const r = mergeBack({
    child: 910,
    path: '/wt/910',
    deps: { graph, git, runTests: () => true },
  });
  assert.equal(r.merged, true);
  assert.equal(r.epic, 'feature/epic/905');
  assert.equal(r.child, 'feature/child/910');
  const kinds = git.calls.map((c) => c.join(' '));
  // epic was NOT rebased onto trunk (grandparent unchanged) ...
  assert.ok(!kinds.includes('rebase trunk feature/epic/905'));
  // ... but the child WAS rebased onto the epic, then ff-merged, then cleaned up.
  assert.ok(kinds.includes('rebase feature/epic/905 feature/child/910'));
  assert.ok(kinds.includes('merge --ff-only feature/child/910'));
  assert.ok(kinds.includes('worktree remove /wt/910'));
  assert.ok(kinds.some((k) => k.startsWith('branch -d feature/child/910')));
});

test('nested epic follows the same recursive merge-back path into its immediate epic parent', () => {
  const git = makeGit();
  let tested;
  const r = mergeBack({
    child: 920,
    path: '/wt/920',
    deps: {
      graph,
      git,
      runTests: (args) => {
        tested = args;
        return true;
      },
    },
  });

  assert.deepEqual(r, {
    merged: true,
    epic: 'feature/epic/905',
    child: 'feature/epic/920',
  });
  assert.deepEqual(tested, { path: '/wt/920', branch: 'feature/epic/920' });

  const kinds = git.calls.map((c) => c.join(' '));
  assert.ok(kinds.includes('rebase feature/epic/905 feature/epic/920'));
  assert.ok(kinds.includes('merge --ff-only feature/epic/920'));
  assert.ok(kinds.includes('worktree remove /wt/920'));
  assert.ok(kinds.includes('branch -d feature/epic/920'));
});

test('grandparent advanced: epic is rebased onto trunk before the child merge', () => {
  const git = makeGit({ grandparentIsAncestor: false });
  mergeBack({ child: 910, path: '/wt/910', deps: { graph, git, runTests: () => true } });
  const kinds = git.calls.map((c) => c.join(' '));
  assert.ok(kinds.includes('rebase trunk feature/epic/905'));
});

test('rebase conflict on the child refuses before any merge', () => {
  const git = makeGit({ rebaseChildFails: true });
  assert.throws(
    () => mergeBack({ child: 910, path: '/wt/910', deps: { graph, git, runTests: () => true } }),
    /rebase|conflict/i
  );
  const kinds = git.calls.map((c) => c.join(' '));
  assert.ok(!kinds.some((k) => k.startsWith('merge --ff-only')));
});

test('post-rebase test failure refuses the merge and skips cleanup', () => {
  const git = makeGit();
  assert.throws(
    () => mergeBack({ child: 910, path: '/wt/910', deps: { graph, git, runTests: () => false } }),
    /test/i
  );
  const kinds = git.calls.map((c) => c.join(' '));
  assert.ok(!kinds.some((k) => k.startsWith('merge --ff-only')));
  assert.ok(!kinds.some((k) => k.startsWith('worktree remove')));
});

test('#864: the test-runner runs bounded sections, not the retired test:all', () => {
  const src = readFileSync(path.join(__dir, '../../../task-tracker/merge-back.mjs'), 'utf8');
  // No functional caller of the retired monolith may remain.
  assert.ok(
    !/\brun',\s*'test:all'|\['run',\s*'test:all'\]/.test(src),
    'merge-back.mjs must not invoke `npm run test:all` (it is retired by #864)'
  );
  // It must instead run each bounded section, each under its own ceiling.
  for (const section of ['test:unit', 'test:integration', 'test:slow']) {
    assert.ok(
      src.includes(`'${section}'`),
      `merge-back.mjs must run the ${section} section in place of test:all`
    );
  }
});

test('refuses a non-child issue', () => {
  const git = makeGit();
  assert.throws(
    () => mergeBack({ child: 905, path: '/wt/x', deps: { graph, git, runTests: () => true } }),
    /not a child/i
  );
});

test('requires child, git, and a test runner', () => {
  const git = makeGit();
  assert.throws(
    () => mergeBack({ path: '/wt/x', deps: { graph, git, runTests: () => true } }),
    /child/i
  );
  assert.throws(() => mergeBack({ child: 910, path: '/wt/x', deps: { graph } }), /git/i);
  assert.throws(() => mergeBack({ child: 910, path: '/wt/x', deps: { graph, git } }), /runTests/i);
});

// ---- #1485: durable parent branch authority at the graph boundary -----------

function parentBodyWith(entries) {
  return entries.map((entry) => serializeIssueWorktreeLocationMarker(entry)).join('\n');
}

test('#1485: graph mapping preserves a valid parent custom branch', () => {
  const parentBody = parentBodyWith([
    {
      worktreePath: '/wt/905',
      worktreeBranch: 'cloud-test-automation',
      sessionId: 'session-1',
      ts: '2026-09-02T00:00:00Z',
    },
  ]);
  assert.deepEqual(buildMergeBackGraphNode({ parent: 905, children: [], parentBody }), {
    parent: 905,
    children: [],
    parentAuthoritativeBranch: 'cloud-test-automation',
  });
});

test('#1485: a parent body with no authority marker preserves canonical fallback', () => {
  const node = buildMergeBackGraphNode({
    parent: 905,
    children: [],
    parentBody: '## Some issue\n\nNo worktree-location history here.\n',
  });
  assert.deepEqual(node, { parent: 905, children: [] });
  assert.equal('parentAuthoritativeBranch' in node, false);
  assert.equal('parentAuthorityError' in node, false);
  // The canonical epic ref is then synthesized downstream, exactly as before.
  assert.equal(
    resolveEpicLineage(910, { deps: { graph: () => node } }).epicBranch,
    'feature/epic/905'
  );
});

test('#1485: a root node with no parent carries no authority fields', () => {
  assert.deepEqual(buildMergeBackGraphNode({ parent: null, children: [910, 920] }), {
    parent: null,
    children: [910, 920],
  });
});

test('#1485: malformed and ambiguous parent authority map to parentAuthorityError', () => {
  const cases = [
    {
      name: 'marker missing ts',
      parentBody:
        '<!-- aitm-worktree-location worktree="/wt/905" branch="cloud-test-automation" -->',
      expected: /malformed/i,
    },
    {
      name: 'two same-timestamp markers naming different branches',
      parentBody: parentBodyWith([
        {
          worktreePath: '/wt/905',
          worktreeBranch: 'cloud-test-automation',
          sessionId: 's1',
          ts: '2026-09-02T00:00:00Z',
        },
        {
          worktreePath: '/wt/905',
          worktreeBranch: 'codex/1268-implementation-plan',
          sessionId: 's2',
          ts: '2026-09-02T00:00:00Z',
        },
      ]),
      expected: /ambiguous/i,
    },
  ];
  for (const { name, parentBody, expected } of cases) {
    const node = buildMergeBackGraphNode({ parent: 905, children: [], parentBody });
    assert.equal('parentAuthoritativeBranch' in node, false, name);
    assert.match(node.parentAuthorityError, expected, name);
  }
});

test('#1485: a non-null parent with an unavailable body refuses', () => {
  assert.throws(
    () => buildMergeBackGraphNode({ parent: 905, children: [], parentBody: undefined }),
    /parent #905 body unavailable/i
  );
});

test('#1485: graph loader prefetches child and immediate epic by issue number', async () => {
  const loaded = [];
  const nodes = new Map([
    [910, { parent: 905, children: [] }],
    [905, { parent: null, children: [910] }],
  ]);
  const graph = await loadMergeBackGraph({
    child: 910,
    cfg: { repo: 'owner/repo' },
    deps: {
      loadNode: async (issue) => {
        loaded.push(issue);
        return nodes.get(issue);
      },
    },
  });
  assert.deepEqual(loaded, [910, 905]);
  assert.deepEqual(graph(910), nodes.get(910));
  assert.deepEqual(graph(905), nodes.get(905));
  assert.throws(() => graph(999), /not prefetched/);
});

test('#1485: a node outside the prefetched set fails closed rather than being fabricated', async () => {
  const graph = await loadMergeBackGraph({
    child: 42,
    cfg: { repo: 'owner/repo' },
    deps: { loadNode: async () => ({ parent: null, children: [] }) },
  });
  assert.deepEqual(graph(42), { parent: null, children: [] });
  assert.throws(() => graph(905), /not prefetched/);
});

const customGraph = (n) =>
  n === 910
    ? { ...GRAPH[910], parentAuthoritativeBranch: 'cloud-test-automation' }
    : (GRAPH[n] ?? { parent: null, children: [] });

test('#1485: a recorded custom epic branch drives rebase, checkout, and fast-forward', () => {
  const git = makeGit();
  const wtGit = makeGit();
  const result = mergeBack({
    child: 910,
    path: '/wt/910',
    deps: { graph: customGraph, git, worktreeGit: wtGit, runTests: () => true },
  });
  assert.equal(result.epic, 'cloud-test-automation');
  assert.equal(result.child, 'feature/child/910');
  // The child rebases onto the opaque recorded ref, never a synthesized canon.
  assert.deepEqual(wtGit.calls[0], ['rebase', 'cloud-test-automation', 'feature/child/910']);
  const kinds = git.calls.map((c) => c.join(' '));
  assert.ok(kinds.includes('checkout cloud-test-automation'));
  assert.ok(kinds.includes('merge --ff-only feature/child/910'));
  assert.ok(!kinds.some((k) => k.includes('feature/epic/905')));
  // Cleanup still happens, and only after the merge.
  assert.ok(kinds.includes('worktree remove /wt/910'));
  assert.ok(kinds.includes('branch -d feature/child/910'));
  assert.ok(
    kinds.indexOf('merge --ff-only feature/child/910') < kinds.indexOf('worktree remove /wt/910')
  );
});

test('#1485: parent authority failure refuses before any git or test-runner call', () => {
  const git = makeGit();
  const wtGit = makeGit();
  let ranTests = false;
  const brokenGraph = (n) =>
    n === 910
      ? { ...GRAPH[910], parentAuthorityError: 'malformed worktree authority record' }
      : (GRAPH[n] ?? { parent: null, children: [] });
  assert.throws(
    () =>
      mergeBack({
        child: 910,
        path: '/wt/910',
        deps: {
          graph: brokenGraph,
          git,
          worktreeGit: wtGit,
          runTests: () => {
            ranTests = true;
            return true;
          },
        },
      }),
    /malformed worktree authority record/i
  );
  assert.deepEqual(git.calls, []);
  assert.deepEqual(wtGit.calls, []);
  assert.equal(ranTests, false);
});

test('#1485: the CLI wires the prefetched keyed graph, not a constant single node', () => {
  const src = readFileSync(path.join(__dir, '../../../task-tracker/merge-back.mjs'), 'utf8');
  // The constant single-node graph made resolveEpicLineage(epicIssue) read the
  // CHILD's node when asked about the epic. It must not come back.
  assert.ok(
    !/graph:\s*\(\)\s*=>\s*node\b/.test(src),
    'merge-back.mjs main() must not wire a constant single-node graph'
  );
  assert.ok(
    /loadMergeBackGraph\(\{\s*child,\s*cfg\s*\}\)/.test(src),
    'merge-back.mjs main() must build its graph with loadMergeBackGraph({ child, cfg })'
  );
  // Issue identity must never be recovered by parsing an opaque branch ref.
  assert.ok(
    !/parseBranchName\(/.test(src),
    'merge-back.mjs must not parse a branch name for issue identity (#1485)'
  );
});
