#!/usr/bin/env node
// @story #733
// cspell:ignore gpgsign
// #733 — the three gates (`commit-trace`, `review-preflight`, `close`) consume
// the #731 message-attribution engine instead of SHA reachability. These are the
// demonstrable proofs bound to #733's ACs.
//
//   AC1 — commit-trace ASSERTS message-based attribution (≥1 `[#N]` commit),
//         surfacing an `attributed` flag; non-fatal (never crashes a drive).
//   AC2 — an unreachable/orphaned recorded SHA still lets the gate pass, because
//         a `[#N]`-attributed commit exists. No deadlock.
//   AC3 — a deliverable committed on a feature branch (its own SHA unreachable
//         from HEAD/trunk) is accepted once its `[#N]` message token is present
//         in the relevant scope (`--all` for review/commit-trace, `trunkRef` for
//         close after a merge/cherry-pick).
//   AC4 — this file (the negative cases prove the gates aren't neutered).
//
// Hermetic where possible (injected `pexec`/deps); one end-to-end integration
// test builds a throwaway git repo in an OS temp dir for the AC3 proof.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { rmSync } from 'node:fs';

import {
  attributingCommits,
  hasAttributingCommit,
} from '../../../../task-tracker/lib/commit-attribution.mjs';
import { runCommitTrace } from '../../../../task-tracker/verbs/commit-trace.mjs';
import { runReviewPreflight } from '../../../../task-tracker/lib/review-preflight.mjs';
import { commitsOnTrunkGate } from '../../../../task-tracker/lib/close-gates.mjs';
import { mkdtempOutsideRepo } from '../../../../task-tracker/lib/scratch-dir.mjs';

const pexec = promisify(execFile);

// A `git log --format=%H%x09%s%x09%aI` row: SHA \t subject \t iso-timestamp.
function logRow(sha, subject, ts = '2026-07-07T20:00:00Z') {
  return `${sha}\t${subject}\t${ts}`;
}

// A fake pexec that returns canned stdout and records the git argv it saw, so a
// scope-scoped attribution query can be asserted verbatim.
function fakePexec(stdout, sink) {
  return async (file, args) => {
    if (sink) {
      sink.file = file;
      sink.args = args;
    }
    return { stdout };
  };
}

const TRAIL = (shas) =>
  ['### 🔗 Commits', '', `<!-- aitm-commits: ${shas.join(',')} -->`].join('\n');

// ---------------------------------------------------------------------------
// AC1 — commit-trace asserts message-based attribution and surfaces the flag.
// ---------------------------------------------------------------------------

test('AC1 commit-trace: surfaces attributed=true when a [#N] commit exists', async () => {
  const r = await runCommitTrace({
    issueNumber: '733',
    cfg: { repo: 'o/r' },
    projectDir: '/repo',
    deps: {
      gitInfo: async () => ({ sha: 'deadf00', subject: 's', author: 'a', ts: 't' }),
      postCommitTrail: async () => ({ action: 'created' }),
      hasAttributingCommit: async () => true,
    },
  });
  assert.equal(r.action, 'created');
  assert.equal(r.attributed, true);
  assert.equal(r.attributionError, null);
});

test('AC1 commit-trace: surfaces attributed=false when NO [#N] commit exists', async () => {
  const r = await runCommitTrace({
    issueNumber: '733',
    cfg: { repo: 'o/r' },
    projectDir: '/repo',
    deps: {
      gitInfo: async () => ({ sha: 'deadf00', subject: 's', author: 'a', ts: 't' }),
      postCommitTrail: async () => ({ action: 'created' }),
      hasAttributingCommit: async () => false,
    },
  });
  // The trail still posts; attribution is advisory, not a throw.
  assert.equal(r.action, 'created');
  assert.equal(r.attributed, false);
});

test('AC1 commit-trace: attribution error is NON-FATAL — never crashes the drive', async () => {
  const r = await runCommitTrace({
    issueNumber: '733',
    cfg: { repo: 'o/r' },
    projectDir: '/repo',
    deps: {
      gitInfo: async () => ({ sha: 'deadf00', subject: 's', author: 'a', ts: 't' }),
      postCommitTrail: async () => ({ action: 'created' }),
      hasAttributingCommit: async () => {
        throw new Error('git log exploded');
      },
    },
  });
  // No throw propagated; the trail still posted; the error is surfaced, not fatal.
  assert.equal(r.action, 'created');
  assert.equal(r.attributed, null);
  assert.match(r.attributionError, /git log exploded/);
});

// ---------------------------------------------------------------------------
// AC2 — an unreachable/orphaned recorded SHA still passes each --all gate,
// because a [#N]-attributed commit exists. Proves no deadlock.
// ---------------------------------------------------------------------------

test('AC2 review-preflight: orphaned recorded SHA passes when a [#733] commit exists', async () => {
  const r = await runReviewPreflight({
    issueNumber: '733',
    repo: 'o/r',
    projectDir: '/repo',
    deps: {
      gitStatus: async () => '',
      gitHeadSha: async () => 'abc0000dead',
      // Trail records a SHA that a rebase/reset orphaned — irrelevant now.
      findTrailComment: async () => ({ body: TRAIL(['orphaned111']) }),
      hasAttributingCommit: async () => true, // the [#733] token still exists
      getIssueBody: async () => '',
    },
  });
  assert.equal(r.ok, true, r.reasons.join('\n'));
});

test('AC2 commit-trace (engine): unreachable SHA does not stop attribution existence', async () => {
  // The grep found the commit even though its SHA is not an ancestor of HEAD.
  const stdout = logRow('cccc333', '[#733] feat: work on an orphaned commit') + '\n';
  assert.equal(
    await hasAttributingCommit(733, {
      cwd: '/x',
      pexec: fakePexec(stdout),
      isReachable: async () => false, // never an ancestor of HEAD
    }),
    true
  );
});

// ---------------------------------------------------------------------------
// AC3 — a feature-branch deliverable (its own SHA unreachable from trunk/HEAD)
// is accepted once its [#N] token is present in the relevant scope.
// ---------------------------------------------------------------------------

test('AC3 close: token present in trunkRef scope → gate passes', async () => {
  const sink = {};
  const r = await commitsOnTrunkGate({
    cfg: { repo: 'o/r', trunkRef: 'trunk' },
    issueNumber: '733',
    projectDir: '/repo',
    deps: {
      listComments: async () => [{ body: TRAIL(['beef1119999']) }], // stranded branch SHA
      resolveTrunkRef: async () => 'trunk',
      attributingCommits: async (issue, opts) => {
        sink.issue = issue;
        sink.refs = opts.refs;
        // Token rode onto trunk via merge/cherry-pick → attributed on trunk.
        return opts.refs.includes('trunk')
          ? [{ sha: 'f00dbeef', subject: '[#733] feat', ts: 't' }]
          : [];
      },
    },
  });
  assert.equal(r.ok, true);
  assert.equal(r.trunkRef, 'trunk');
  // The close gate MUST scope to trunkRef, never --all.
  assert.deepEqual(sink.refs, ['trunk']);
});

test('AC3 review-preflight: feature-branch deliverable accepted via --all message scope', async () => {
  // review-preflight uses hasAttributingCommit with the default --all scope, so a
  // commit that lives only on an unmerged feature branch still attributes.
  const r = await runReviewPreflight({
    issueNumber: '733',
    repo: 'o/r',
    projectDir: '/repo',
    deps: {
      gitStatus: async () => '',
      gitHeadSha: async () => 'dad0000beef',
      findTrailComment: async () => ({ body: TRAIL(['cafe1feed1']) }),
      hasAttributingCommit: async () => true, // found across --all
      getIssueBody: async () => '',
    },
  });
  assert.equal(r.ok, true, r.reasons.join('\n'));
});

// ---------------------------------------------------------------------------
// Negative cases — the gates still FAIL when NO [#N] commit exists in scope.
// ---------------------------------------------------------------------------

test('NEG review-preflight: trail records commits but no [#733] token anywhere → fail', async () => {
  const r = await runReviewPreflight({
    issueNumber: '733',
    repo: 'o/r',
    projectDir: '/repo',
    deps: {
      gitStatus: async () => '',
      gitHeadSha: async () => 'abc0000dead',
      findTrailComment: async () => ({ body: TRAIL(['aaaa0000bbb']) }),
      hasAttributingCommit: async () => false,
      getIssueBody: async () => '',
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.reasons.join('\n'), /no commit message references `\[#733\]`/);
  assert.doesNotMatch(r.reasons.join('\n'), /not reachable from current HEAD/);
});

test('NEG close: no [#733] commit on trunkRef → blocker with message-based code', async () => {
  const r = await commitsOnTrunkGate({
    cfg: { repo: 'o/r', trunkRef: 'trunk' },
    issueNumber: '733',
    projectDir: '/repo',
    deps: {
      listComments: async () => [{ body: TRAIL(['beef1119999']) }],
      resolveTrunkRef: async () => 'trunk',
      attributingCommits: async () => [], // never merged to trunk
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.blocker, /close-no-attributed-commit-on-trunk/);
  assert.match(r.blocker, /\[#733\]/);
  assert.match(r.blocker, /trunk/);
});

// ---------------------------------------------------------------------------
// AC3 end-to-end — a REAL throwaway git repo proves the trunk-scoped invariant:
//   (a) the feature-branch SHA is unreachable from trunk,
//   (b) trunk-scoped attribution FAILS before a merge,
//   (c) after merging the token onto trunk, trunk-scoped attribution PASSES.
// No network, no gh.
// ---------------------------------------------------------------------------

test('AC3 integration: trunk-scoped attribution flips false→true across a merge', async () => {
  const dir = mkdtempOutsideRepo('aitm-733-');
  const git = (args) => pexec('git', args, { cwd: dir, timeout: 10000 });
  try {
    await git(['init', '-q', '-b', 'trunk']);
    await git(['config', 'user.email', 'test@example.com']);
    await git(['config', 'user.name', 'Test']);
    await git(['config', 'commit.gpgsign', 'false']);
    await git(['commit', '--allow-empty', '-q', '-m', 'chore: seed trunk']);

    // Branch off trunk and commit the [#733] deliverable ON THE BRANCH only.
    await git(['checkout', '-q', '-b', 'feat/733']);
    await git([
      'commit',
      '--allow-empty',
      '-q',
      '-m',
      '[#733] feat: deliverable on a feature branch',
    ]);
    const branchSha = (await git(['rev-parse', 'HEAD'])).stdout.trim();

    // (a) The branch SHA is NOT reachable from trunk.
    await assert.rejects(
      () => git(['merge-base', '--is-ancestor', branchSha, 'trunk']),
      'branch SHA must be unreachable from trunk before a merge'
    );

    // (b) Trunk-scoped attribution FAILS before the merge.
    const beforeTrunk = await attributingCommits(733, { cwd: dir, refs: ['trunk'] });
    assert.equal(beforeTrunk.length, 0, 'no [#733] commit on trunk before merge');
    // Sanity: --all DOES see it (it lives on the branch).
    const beforeAll = await attributingCommits(733, { cwd: dir, refs: ['--all'] });
    assert.equal(beforeAll.length, 1, '--all sees the branch commit');

    // (c) Merge the branch (fast-forward the token onto trunk), then trunk-scoped
    // attribution PASSES — which is exactly what commitsOnTrunkGate asserts.
    await git(['checkout', '-q', 'trunk']);
    await git(['merge', '-q', '--no-ff', '-m', '[#733] merge feat/733', 'feat/733']);
    const afterTrunk = await attributingCommits(733, { cwd: dir, refs: ['trunk'] });
    assert.ok(afterTrunk.length >= 1, 'a [#733] commit is on trunk after merge');

    // And the real close gate (with default attributingCommits) now passes.
    const gate = await commitsOnTrunkGate({
      cfg: { repo: 'o/r', trunkRef: 'trunk' },
      issueNumber: '733',
      projectDir: dir,
      deps: {
        listComments: async () => [{ body: TRAIL([branchSha]) }],
        resolveTrunkRef: async () => 'trunk',
        // default attributingCommits (real git) used intentionally
      },
    });
    assert.equal(gate.ok, true, gate.blocker);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
