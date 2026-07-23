#!/usr/bin/env node
// @story #109
import { strict as assert } from 'node:assert';
import { runReviewPreflight } from '../../../lib/review-preflight.mjs';
import { NON_DEMONSTRABLE_TAG_RE } from '../../../lib/body-invariants.mjs';

// Shared clean-gate deps: empty worktree, valid commit trail, [#N]-attributed
// commit present. Lets the AC-evidence tests below isolate the only varying
// input (the body). #733: attribution is message-based, not SHA reachability.
const cleanGateDeps = (getIssueBody) => ({
  gitStatus: async () => '',
  gitHeadSha: async () => SHA,
  findTrailComment: async () => ({ body: TRAIL }),
  hasAttributingCommit: async () => true,
  getIssueBody,
});

const SHA = 'abcdef1234567890';
const TRAIL = [
  '### 🔗 Commits',
  '',
  '<!-- aitm-commits: abcdef1234567890 -->',
  '',
  '| SHA | Subject | Author | When |',
  '|---|---|---|---|',
  '| [`abcdef1`](https://github.com/o/r/commit/abcdef1234567890) | s | a | t |',
].join('\n');

// HEAD itself is in the trail and a [#N]-attributed commit exists → pass.
{
  const r = await runReviewPreflight({
    issueNumber: '109',
    repo: 'o/r',
    projectDir: '/repo',
    deps: {
      gitStatus: async () => '',
      gitHeadSha: async () => SHA,
      findTrailComment: async () => ({ body: TRAIL }),
      hasAttributingCommit: async () => true,
      getIssueBody: async () => '',
    },
  });
  assert.equal(r.ok, true);
}

// #733 — Parked-then-resumed / rewritten-SHA: the trailed SHA is NOT reachable
// from HEAD (a rebase/reset/squash moved it), but a [#N]-attributed commit
// exists somewhere across --all. Message-based attribution accepts it — no
// deadlock, where the old SHA-reachability loop would have failed.
{
  const r = await runReviewPreflight({
    issueNumber: '374',
    repo: 'o/r',
    projectDir: '/repo',
    deps: {
      gitStatus: async () => '',
      gitHeadSha: async () => 'e7a7400b0b0b0b0b',
      findTrailComment: async () => ({
        body: ['### 🔗 Commits', '', '<!-- aitm-commits: eabe08f1111111111 -->'].join('\n'),
      }),
      // The recorded SHA is irrelevant now; attribution keys on the message.
      hasAttributingCommit: async () => true,
      getIssueBody: async () => '',
    },
  });
  assert.equal(r.ok, true, r.reasons.join('\n'));
}

// #733 — negative: the trail records ≥1 commit but NO commit message references
// [#N] anywhere → fail with a message-based reason (not "unreachable").
{
  const r = await runReviewPreflight({
    issueNumber: '109',
    repo: 'o/r',
    projectDir: '/repo',
    deps: {
      gitStatus: async () => '',
      gitHeadSha: async () => SHA,
      findTrailComment: async () => ({
        body: ['### 🔗 Commits', '', '<!-- aitm-commits: def4561234567890 -->'].join('\n'),
      }),
      hasAttributingCommit: async () => false,
      getIssueBody: async () => '',
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.reasons.join('\n'), /no commit message references `\[#109\]`/);
  // And it is NOT the retired reachability wording.
  assert.doesNotMatch(r.reasons.join('\n'), /not reachable from current HEAD/);
}

// Empty trail: heading present but the marker records no commits → fail.
{
  const r = await runReviewPreflight({
    issueNumber: '109',
    repo: 'o/r',
    projectDir: '/repo',
    deps: {
      gitStatus: async () => '',
      gitHeadSha: async () => SHA,
      findTrailComment: async () => ({
        body: ['### 🔗 Commits', '', '<!-- aitm-commits:  -->'].join('\n'),
      }),
      hasAttributingCommit: async () => true,
      getIssueBody: async () => '',
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.reasons.join('\n'), /records no commits/);
}

// Regression: uncommitted tracked changes still fail.
{
  const r = await runReviewPreflight({
    issueNumber: '109',
    repo: 'o/r',
    projectDir: '/repo',
    deps: {
      gitStatus: async () => ' M scripts/x.mjs\n',
      gitHeadSha: async () => SHA,
      findTrailComment: async () => ({ body: TRAIL }),
      hasAttributingCommit: async () => true,
      getIssueBody: async () => '',
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.reasons.join('\n'), /tracked worktree changes/);
}

// Regression: a missing canonical Commits comment still fails.
{
  const r = await runReviewPreflight({
    issueNumber: '109',
    repo: 'o/r',
    projectDir: '/repo',
    deps: {
      gitStatus: async () => '',
      gitHeadSha: async () => SHA,
      findTrailComment: async () => null,
      hasAttributingCommit: async () => true,
      getIssueBody: async () => '',
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.reasons.join('\n'), /canonical `### 🔗 Commits` comment/);
}

// Regression: a comment with the wrong heading is treated as malformed.
{
  const r = await runReviewPreflight({
    issueNumber: '109',
    repo: 'o/r',
    projectDir: '/repo',
    deps: {
      gitStatus: async () => '',
      gitHeadSha: async () => SHA,
      findTrailComment: async () => ({
        body: ['### 🔗 Related commit', '', '<!-- aitm-commits: abcdef1234567890 -->'].join('\n'),
      }),
      hasAttributingCommit: async () => true,
      getIssueBody: async () => '',
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.reasons.join('\n'), /canonical `### 🔗 Commits` comment/);
}

// #537 — the review-exit evidence gate must honor the same honest
// `invalid — non-demonstrable` opt-out the Refine→Plan gate already honors
// (single source of truth: `NON_DEMONSTRABLE_TAG_RE`). Otherwise an AC accepted
// as honestly non-demonstrable at refine is rejected at review-exit, the only
// remaining pressure to fabricate a verifier.

// (1) A verifier-less AC tagged `invalid — non-demonstrable` is NOT a blocking
//     reason — the review gate passes it, matching the refine gate.
{
  const body = [
    '## Acceptance Criteria',
    '',
    '- [ ] This child is sequenced after the secured siblings — tagged `invalid — non-demonstrable` (board/sequencing fact, no runnable verifier).',
  ].join('\n');
  const r = await runReviewPreflight({
    issueNumber: '537',
    repo: 'o/r',
    projectDir: '/repo',
    deps: cleanGateDeps(async () => body),
  });
  assert.equal(r.ok, true, r.reasons.join('\n'));
  assert.doesNotMatch(r.reasons.join('\n'), /missing `aitm-verified/);
}

// (2) No regression — a verifier-less AC WITHOUT the tag still blocks.
{
  const body = [
    '## Acceptance Criteria',
    '',
    '- [ ] A genuinely undocumented criterion with no verifier and no honest tag.',
  ].join('\n');
  const r = await runReviewPreflight({
    issueNumber: '537',
    repo: 'o/r',
    projectDir: '/repo',
    deps: cleanGateDeps(async () => body),
  });
  assert.equal(r.ok, false);
  assert.match(r.reasons.join('\n'), /missing `aitm-verified/);
}

// (3) Single source of truth — the exemption is driven by the exact
//     `NON_DEMONSTRABLE_TAG_RE` exported from body-invariants.mjs that the
//     refine gate uses. Exercise the literal tag text through both: the tag
//     string the review gate exempts MUST be one the shared regex matches, and
//     a near-miss the regex rejects MUST still block.
{
  const exemptTag = 'invalid — non-demonstrable';
  assert.match(exemptTag, NON_DEMONSTRABLE_TAG_RE);

  const exemptBody = [
    '## Acceptance Criteria',
    '',
    `- [ ] Sequencing fact — tagged \`${exemptTag}\` (no verifier).`,
  ].join('\n');
  const exempt = await runReviewPreflight({
    issueNumber: '537',
    repo: 'o/r',
    projectDir: '/repo',
    deps: cleanGateDeps(async () => exemptBody),
  });
  assert.equal(exempt.ok, true, exempt.reasons.join('\n'));

  // A label the shared regex does NOT match is not exempt — it still blocks.
  const nearMiss = 'invalid but demonstrable later';
  assert.doesNotMatch(nearMiss, NON_DEMONSTRABLE_TAG_RE);
  const nearMissBody = [
    '## Acceptance Criteria',
    '',
    `- [ ] Something — ${nearMiss} (no verifier).`,
  ].join('\n');
  const blocked = await runReviewPreflight({
    issueNumber: '537',
    repo: 'o/r',
    projectDir: '/repo',
    deps: cleanGateDeps(async () => nearMissBody),
  });
  assert.equal(blocked.ok, false);
  assert.match(blocked.reasons.join('\n'), /missing `aitm-verified/);
}

// (4) #836 — honor the epic no-commit-lane `aitm-ac-waived` waiver, mirroring the
//     sibling Develop→Test gate (`code-complete-gate.mjs:295`). A waived AC on a
//     no-commit kind must NOT raise the missing-evidence reason; the same waiver on
//     a commit kind (and a non-waived AC on any kind) MUST still raise it.
{
  const WAIVED_AC =
    '- [x] All five children are closed and merged. <!-- aitm-ac-waived reason="epic no-commit lane" -->';
  const PLAIN_AC = '- [x] Some demonstrable behavior holds.';
  const withKind = (kind, acLine) =>
    [
      '## Acceptance Criteria',
      '',
      acLine,
      '',
      '## AITM Progress Markers',
      '',
      kind ? `<!-- aitm-issue-kind kind="${kind}" -->` : '',
    ].join('\n');

  // (a) no-commit kind (epic) + waived AC → no evidence reason.
  const waivedEpic = await runReviewPreflight({
    issueNumber: '836',
    repo: 'o/r',
    projectDir: '/repo',
    deps: cleanGateDeps(async () => withKind('epic', WAIVED_AC)),
  });
  assert.doesNotMatch(
    waivedEpic.reasons.join('\n'),
    /missing `aitm-verified/,
    waivedEpic.reasons.join('\n')
  );

  // (b) commit kind (no kind marker = code) + same waiver → still blocks.
  const waivedCode = await runReviewPreflight({
    issueNumber: '836',
    repo: 'o/r',
    projectDir: '/repo',
    deps: cleanGateDeps(async () => withKind(null, WAIVED_AC)),
  });
  assert.match(waivedCode.reasons.join('\n'), /missing `aitm-verified/);

  // (c) no-commit kind + non-waived, verifier-less AC → still blocks.
  const plainEpic = await runReviewPreflight({
    issueNumber: '836',
    repo: 'o/r',
    projectDir: '/repo',
    deps: cleanGateDeps(async () => withKind('epic', PLAIN_AC)),
  });
  assert.match(plainEpic.reasons.join('\n'), /missing `aitm-verified/);
}

console.log('review-preflight.test.mjs: all passed');
