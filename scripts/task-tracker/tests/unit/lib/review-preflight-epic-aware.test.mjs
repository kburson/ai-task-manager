// @story #885
// #885 (parent epic #883) — make `runReviewPreflight` epic-aware.
//
// An epic has no commit of its own, so the unconditional `### 🔗 Commits`
// requirement refused every epic at Test→Review no matter how complete its
// children were (reproduced live on #860). The fix is a BRANCH, not a skip:
// an epic's trail is derived from its children (#884), not absent. AC 3 pins
// that the non-epic path is byte-for-byte unchanged.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runReviewPreflight } from '../../../lib/review-preflight.mjs';
import { buildEpicDerivedTrail } from '../../../lib/epic-derived-commit-trail.mjs';
import { filterDodForKind } from '../../../lib/dod-kind-filter.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = { issueNumber: 860, repo: 'o/r', projectDir: '/tmp/x' };

const EPIC_BODY = [
  '## AITM Progress Markers',
  '',
  '<!-- aitm-issue-kind kind="epic" -->',
  '<!-- aitm-deliverable-posted ts="2026-07-19T00:00:00Z" -->',
  '',
  '## Acceptance Criteria',
  '',
  '- [x] All children delivered. <!-- aitm-ac-waived -->',
].join('\n');

const CODE_BODY = [
  '## AITM Progress Markers',
  '',
  '<!-- aitm-issue-kind kind="code" -->',
  '',
  '## Acceptance Criteria',
  '',
].join('\n');

const CHILDREN = [
  { number: 861, title: 'child one' },
  { number: 862, title: 'child two' },
];

const EPIC_COMMITS = [
  {
    sha: 'aaaaaa1111111111',
    subject: '[#861] feat: one',
    author: 'kb',
    ts: '2026-07-19T10:00:00Z',
  },
  {
    sha: 'bbbbbb2222222222',
    subject: '[#862] feat: two',
    author: 'kb',
    ts: '2026-07-19T11:00:00Z',
  },
];

function deps(overrides = {}) {
  return {
    gitStatus: async () => '',
    gitHeadSha: async () => 'abc1234',
    findTrailComment: async () => null,
    hasAttributingCommit: async () => true,
    getIssueBody: async () => EPIC_BODY,
    fetchEpicChildren: async () => CHILDREN,
    epicCommits: async () => EPIC_COMMITS,
    ...overrides,
  };
}

// AC 1 — an epic with a posted deliverable and all children merged passes with
// no hand-authored trail comment.
test('an epic with all children reachable passes without a direct commit trail', async () => {
  const res = await runReviewPreflight({ ...BASE, deps: deps() });
  assert.deepEqual(res.reasons, []);
  assert.equal(res.ok, true);
});

test('the passing epic reports the derived trail it accepted', async () => {
  const res = await runReviewPreflight({ ...BASE, deps: deps() });
  assert.equal(
    res.derivedTrail,
    buildEpicDerivedTrail({ epicNumber: 860, children: CHILDREN, commits: EPIC_COMMITS })
  );
});

// AC 2 — refused, naming the child, when one child is unreachable.
test('an epic is refused and the unreachable child is named', async () => {
  const res = await runReviewPreflight({
    ...BASE,
    deps: deps({ epicCommits: async () => EPIC_COMMITS.filter((c) => c.subject.includes('#861')) }),
  });
  assert.equal(res.ok, false);
  assert.equal(res.reasons.length, 1);
  assert.match(res.reasons[0], /#862/);
  assert.ok(!res.reasons[0].includes('#861'), 'a reachable child is not named in the refusal');
});

test('every unreachable child is named in a single refusal', async () => {
  const res = await runReviewPreflight({ ...BASE, deps: deps({ epicCommits: async () => [] }) });
  assert.equal(res.ok, false);
  assert.match(res.reasons[0], /#861/);
  assert.match(res.reasons[0], /#862/);
});

// AC 3 — the non-epic path is unchanged.
test('a code issue with no trail comment is still refused for the missing trail', async () => {
  const res = await runReviewPreflight({
    ...BASE,
    deps: deps({ getIssueBody: async () => CODE_BODY }),
  });
  assert.equal(res.ok, false);
  assert.ok(
    res.reasons.some((r) => /missing canonical/.test(r)),
    'the direct-trail requirement still applies to a code issue'
  );
});

test('a code issue with a well-formed trail and attribution still passes', async () => {
  const trail = ['### 🔗 Commits', '', '<!-- aitm-commits shas="aaaaaa1111111111" -->'].join('\n');
  const res = await runReviewPreflight({
    ...BASE,
    deps: deps({
      getIssueBody: async () => CODE_BODY,
      findTrailComment: async () => ({ body: trail }),
    }),
  });
  assert.deepEqual(res.reasons, []);
});

test('a code issue never consults the epic child/commit sources', async () => {
  let consulted = false;
  await runReviewPreflight({
    ...BASE,
    deps: deps({
      getIssueBody: async () => CODE_BODY,
      fetchEpicChildren: async () => {
        consulted = true;
        return [];
      },
    }),
  });
  assert.equal(consulted, false);
});

// AC 4 — kind-aware `commits` DoD text.
const DOD_TEMPLATE = readFileSync(
  fileURLToPath(
    new URL('../../../../../.ai-task-manager/templates/definition-of-done.md', import.meta.url)
  ),
  'utf8'
);

function commitsItems(kind) {
  return filterDodForKind(DOD_TEMPLATE, kind)
    .split('\n')
    .filter((l) => l.includes('dod:functional:commits'));
}

test('exactly one commits DoD item renders for each kind', () => {
  assert.equal(commitsItems('epic').length, 1);
  assert.equal(commitsItems('code').length, 1);
});

test('the commits DoD item renders epic-specific text for an epic', () => {
  assert.match(commitsItems('epic')[0], /all children's commits are present on this branch/i);
});

test('the commits DoD item renders the standard text for a code issue', () => {
  assert.match(commitsItems('code')[0], /All changes committed/i);
  assert.notEqual(commitsItems('code')[0], commitsItems('epic')[0]);
});
