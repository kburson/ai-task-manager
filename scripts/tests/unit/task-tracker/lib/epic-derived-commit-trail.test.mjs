// @story #884
// #884 (parent epic #883) — derived epic commit trail.
//
// The builder is a pure function of (epic number, children, commits), so these
// tests need no network, no live board, and no fixture repo.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EPIC_TRAIL_LOG_FORMAT,
  UnreachableChildrenError,
  buildEpicDerivedTrail,
  epicTrailLogArgs,
  groupCommitsByChild,
  parseEpicTrailIssueIds,
  parseEpicTrailLog,
} from '../../../../task-tracker/lib/epic-derived-commit-trail.mjs';
import {
  TRAIL_HEADING,
  hasCanonicalCommitTrace,
  parseMarker,
} from '../../../../task-tracker/lib/commit-trail.mjs';

// `assert.throws` returns undefined, so capture the error directly.
function caught(fn) {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new assert.AssertionError({ message: 'expected the builder to refuse, but it returned' });
}

const CHILDREN = [
  { number: 884, title: 'Derived epic commit trail' },
  { number: 885, title: 'Epic-aware review-preflight' },
];

const REACHABLE = [
  {
    sha: 'aaaaaa1111111111',
    subject: '[#884] feat(trail): build the derived trail',
    author: 'kb',
    ts: '2026-07-19T10:00:00Z',
  },
  {
    sha: 'bbbbbb2222222222',
    subject: '[#884] test(trail): cover the refusal path',
    author: 'kb',
    ts: '2026-07-19T11:00:00Z',
  },
  {
    sha: 'cccccc3333333333',
    subject: '[#885] fix(preflight): consume the derived trail',
    author: 'kb',
    ts: '2026-07-19T12:00:00Z',
  },
];

test('epicTrailLogArgs scopes the log to the epic HEAD, not --all', () => {
  const args = epicTrailLogArgs('epic/883-epic-gating');
  assert.deepEqual(args, ['log', 'epic/883-epic-gating', `--format=${EPIC_TRAIL_LOG_FORMAT}`]);
  assert.ok(!args.includes('--all'), 'the epic trail must never widen to --all');
});

test('parseEpicTrailLog reads the separated log format and skips blank lines', () => {
  const stdout = [
    'aaaaaa1111111111\x1f[#884] feat: a\x1fkb\x1f2026-07-19T10:00:00Z',
    '',
    'bbbbbb2222222222\x1f[#885] fix: b\x1fkb\x1f2026-07-19T11:00:00Z',
  ].join('\n');
  assert.deepEqual(parseEpicTrailLog(stdout), [
    {
      sha: 'aaaaaa1111111111',
      subject: '[#884] feat: a',
      author: 'kb',
      ts: '2026-07-19T10:00:00Z',
    },
    { sha: 'bbbbbb2222222222', subject: '[#885] fix: b', author: 'kb', ts: '2026-07-19T11:00:00Z' },
  ]);
});

// #1177 — historical #1067 children used the retired trailing token convention.
test('epic trail reads canonical leading attribution and exact historical trailing attribution', () => {
  assert.deepEqual(parseEpicTrailIssueIds('[#1177] fix(epic): canonical subject'), [1177]);
  assert.deepEqual(
    parseEpicTrailIssueIds('feat(github-records): add authority locator [#1068]'),
    [1068]
  );
});

test('canonical leading attribution wins over a trailing token', () => {
  assert.deepEqual(
    parseEpicTrailIssueIds('[#1177] fix(epic): do not adopt trailing identity [#1068]'),
    [1177]
  );
});

test('epic compatibility ignores incidental, malformed, and non-terminal references', () => {
  assert.deepEqual(parseEpicTrailIssueIds('fix(epic): mention [#1068] in prose'), []);
  assert.deepEqual(parseEpicTrailIssueIds('fix(epic): malformed [#abc]'), []);
  assert.deepEqual(parseEpicTrailIssueIds('fix(epic): malformed [#1068'), []);
  assert.deepEqual(parseEpicTrailIssueIds('fix(epic): doubled [#1068] [#1069]'), []);
});

test('groups #1067 historical trailing subjects without widening reachability', () => {
  const groups = groupCommitsByChild({
    children: [
      { number: 1068, title: 'Authority locator' },
      { number: 1088, title: 'Final integration' },
    ],
    commits: [
      {
        sha: 'legacy1068',
        subject: 'feat(github-records): add authority locator [#1068]',
        author: 'kb',
        ts: '2026-08-01T06:51:32Z',
      },
    ],
  });

  assert.deepEqual(
    groups.map((group) => [group.number, group.commits.map((commit) => commit.sha)]),
    [
      [1068, ['legacy1068']],
      [1088, []],
    ]
  );
});

// AC 1 — every child's commits appear, grouped under that child.
test('groups every reachable child commit under its child', () => {
  const groups = groupCommitsByChild({ children: CHILDREN, commits: REACHABLE });
  assert.deepEqual(
    groups.map((g) => [g.number, g.commits.map((c) => c.sha)]),
    [
      [884, ['aaaaaa1111111111', 'bbbbbb2222222222']],
      [885, ['cccccc3333333333']],
    ]
  );
});

test('the built trail lists every child with a grouping row above its commits', () => {
  const body = buildEpicDerivedTrail({ epicNumber: 883, children: CHILDREN, commits: REACHABLE });
  const lines = body.split('\n');

  const g884 = lines.findIndex((l) => l.includes('**#884'));
  const g885 = lines.findIndex((l) => l.includes('**#885'));
  // Match the table row, not the marker line — the marker also lists the shas.
  const c884 = lines.findIndex((l) => l.startsWith('| `aaaaaa'));
  const c885 = lines.findIndex((l) => l.startsWith('| `cccccc'));

  assert.ok(g884 !== -1 && g885 !== -1, 'both children get a grouping row');
  assert.ok(g884 < c884 && c884 < g885, "#884's commits sit under #884's grouping row");
  assert.ok(g885 < c885, "#885's commits sit under #885's grouping row");
});

// AC 2 — short SHA + subject on every rendered commit line.
test('each commit line carries its short SHA and subject', () => {
  const body = buildEpicDerivedTrail({ epicNumber: 883, children: CHILDREN, commits: REACHABLE });
  for (const commit of REACHABLE) {
    const row = body.split('\n').find((l) => l.includes(`\`${commit.sha.slice(0, 6)}\``));
    assert.ok(row, `a row renders the short sha for ${commit.sha}`);
    assert.ok(row.includes(commit.subject), 'the row carries the commit subject');
    assert.ok(!row.includes(commit.sha), 'the visible column is trimmed to the short sha');
  }
});

// AC 3 — refusal names the child.
test('refuses and names the child when it has no reachable commit', () => {
  const err = caught(() =>
    buildEpicDerivedTrail({
      epicNumber: 883,
      children: CHILDREN,
      commits: REACHABLE.filter((c) => c.subject.includes('[#884]')),
    })
  );
  assert.ok(err instanceof UnreachableChildrenError);
  assert.match(err.message, /#885/);
  assert.deepEqual(
    err.unreachable.map((c) => c.number),
    [885]
  );
});

test('the refusal names every unreachable child, not just the first', () => {
  const err = caught(() =>
    buildEpicDerivedTrail({ epicNumber: 883, children: CHILDREN, commits: [] })
  );
  assert.deepEqual(
    err.unreachable.map((c) => c.number),
    [884, 885]
  );
  assert.match(err.message, /#884/);
  assert.match(err.message, /#885/);
});

test('non-delivery children are excluded while completed children still require commits', () => {
  const children = [
    { number: 884, title: 'replaced child', closeReason: 'not_planned' },
    { number: 885, title: 'delivered child', closeReason: 'completed' },
  ];
  const commits = REACHABLE.filter((c) => c.subject.includes('[#885]'));

  const body = buildEpicDerivedTrail({ epicNumber: 883, children, commits });

  assert.match(body, /aitm-epic-derived-trail children="885" excluded="884"/);
  assert.doesNotMatch(body, /\*\*#884/);
  assert.match(body, /\*\*#885/);
});

test('an absent or unfamiliar close reason remains fail-closed', () => {
  const children = [
    { number: 884, title: 'missing reason' },
    { number: 885, title: 'unknown reason', closeReason: 'discarded' },
  ];

  const err = caught(() => buildEpicDerivedTrail({ epicNumber: 883, children, commits: [] }));

  assert.deepEqual(
    err.unreachable.map((c) => c.number),
    [884, 885]
  );
});

test('an epic with only non-delivery children emits an auditable canonical empty trail', () => {
  const children = [
    { number: 884, title: 'replaced child', closeReason: 'not_planned' },
    { number: 885, title: 'discarded child', closeReason: 'not_planned' },
  ];

  const body = buildEpicDerivedTrail({ epicNumber: 883, children, commits: [] });

  assert.match(body, /aitm-epic-derived-trail children="" excluded="884,885"/);
  assert.deepEqual([...parseMarker(body).shas], []);
});

// AC 4 — commits that exist elsewhere but are not reachable from the epic HEAD
// are unreachable. The builder only ever sees the epic-HEAD-scoped log, so a
// sibling-branch commit is simply absent from `commits` and must still refuse.
test('a child whose commits live only on an unmerged sibling branch is unreachable', () => {
  // The sibling-branch commit exists in the repo (`git log --all` would find
  // it) but never appears in a log scoped to the epic HEAD.
  const epicHeadLog = REACHABLE.filter((c) => c.subject.includes('[#884]'));
  const err = caught(() =>
    buildEpicDerivedTrail({ epicNumber: 883, children: CHILDREN, commits: epicHeadLog })
  );
  assert.deepEqual(
    err.unreachable.map((c) => c.number),
    [885]
  );

  // Sanity: the same child WOULD be reachable under an --all-style log, which
  // is exactly the semantic difference this module exists to enforce.
  assert.doesNotThrow(() =>
    buildEpicDerivedTrail({ epicNumber: 883, children: CHILDREN, commits: REACHABLE })
  );
});

// AC 5 — the existing consumer parses it unmodified.
test('the derived trail parses with the unmodified ### Commits consumer', () => {
  const body = buildEpicDerivedTrail({ epicNumber: 883, children: CHILDREN, commits: REACHABLE });

  assert.ok(body.startsWith(TRAIL_HEADING), 'starts with the canonical trail heading');

  const parsed = parseMarker(body);
  assert.notEqual(parsed.index, -1, 'the commits marker is present and parseable');
  assert.deepEqual(
    [...parsed.shas].sort(),
    REACHABLE.map((c) => c.sha).sort(),
    'every grouped commit sha is recorded in the marker'
  );

  for (const commit of REACHABLE) {
    assert.ok(
      hasCanonicalCommitTrace(body, commit.sha),
      `hasCanonicalCommitTrace accepts ${commit.sha}`
    );
  }
  assert.ok(!hasCanonicalCommitTrace(body, 'ffffff9999999999'), 'rejects an unrecorded sha');
});
