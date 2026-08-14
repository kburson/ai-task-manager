// @story #886
// #886 (parent epic #883) — epic AC evidence by commit citation.
//
// Before this, an epic's delegation ACs could only be tagged
// `invalid — non-demonstrable`, leaving the epic with no independent acceptance
// at all. An AC may now cite the child commits that delivered it. The citation
// is NOT a license to relax the aggregate gates — AC 5 pins that explicitly.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  parseAcCommitCitation,
  findAcCommitCitations,
  verifyAcCommitCitations,
} from '../../../../task-tracker/lib/epic-ac-commit-citation.mjs';
import { findAcsWithoutVerifierOrInvalidTag } from '../../../../task-tracker/lib/body-invariants.mjs';
import { runReviewPreflight } from '../../../../task-tracker/lib/review-preflight.mjs';
import { filterDodForKind } from '../../../../task-tracker/lib/dod-kind-filter.mjs';

const CHILDREN = [
  { number: 872, title: 'child one' },
  { number: 873, title: 'child two' },
];

const COMMITS = [
  { sha: 'd9d614f0000000000000', subject: '[#872] feat: one', author: 'kb', ts: 'T1' },
  { sha: 'd645e3d0000000000000', subject: '[#873] feat: two', author: 'kb', ts: 'T2' },
  { sha: 'facade00000000000000', subject: '[#999] feat: stranger', author: 'kb', ts: 'T3' },
  { sha: 'decade00000000000000', subject: 'chore: untagged', author: 'kb', ts: 'T4' },
];

function body(acLines) {
  return [
    '## AITM Progress Markers',
    '',
    '<!-- aitm-issue-kind kind="epic" -->',
    '',
    '## Acceptance Criteria',
    '',
    ...acLines,
  ].join('\n');
}

// ---------------------------------------------------------------- AC 1

test('AC 1 — a commit-citing AC satisfies the evidence requirement with no non-demonstrable tag', () => {
  const src = body([
    '- [ ] Child #872 delivered the parser. <!-- aitm-verified commits="d9d614f" -->',
  ]);
  assert.ok(!/non-demonstrable/i.test(src), 'fixture carries no opt-out tag');
  assert.deepEqual(
    findAcsWithoutVerifierOrInvalidTag(src),
    [],
    'the demonstrable-AC gate accepts the citation'
  );
});

test('AC 1 — the citation parses to its cited shas and is hidden from the visible label', () => {
  const line =
    '- [ ] Child #872 delivered the parser. <!-- aitm-verified commits="d9d614f abc1234" -->';
  assert.deepEqual(parseAcCommitCitation(line), ['d9d614f', 'abc1234']);
  const found = findAcCommitCitations(body([line]));
  assert.equal(found.length, 1);
  assert.equal(found[0].label, 'Child #872 delivered the parser.');
});

test('AC 1 — a `commits` value with no well-formed sha is NOT a citation', () => {
  // Otherwise `commits="tbd"` would satisfy the gate with nothing behind it.
  const src = body(['- [ ] Vague. <!-- aitm-verified commits="tbd" -->']);
  assert.equal(parseAcCommitCitation('<!-- aitm-verified commits="tbd" -->'), null);
  assert.deepEqual(
    findAcsWithoutVerifierOrInvalidTag(src).map((o) => o.reason),
    ['no-verifier']
  );
});

test('AC 1 — a plain AC with neither citation nor verifier is still an offender', () => {
  assert.deepEqual(
    findAcsWithoutVerifierOrInvalidTag(body(['- [ ] Nothing backs this.'])).map((o) => o.reason),
    ['no-verifier']
  );
});

// ---------------------------------------------------------------- AC 2

test('AC 2 — a citation naming an unreachable commit is refused, naming the citation', () => {
  const reasons = verifyAcCommitCitations({
    epicNumber: 883,
    children: CHILDREN,
    commits: COMMITS,
    body: body(['- [ ] Child #872 delivered X. <!-- aitm-verified commits="0badc0d" -->']),
  });
  assert.equal(reasons.length, 1);
  assert.match(reasons[0], /0badc0d/);
  assert.match(reasons[0], /not reachable from the epic HEAD/);
  assert.match(reasons[0], /Child #872 delivered X\./);
});

test('AC 2 — every offending citation is collected, not just the first', () => {
  const reasons = verifyAcCommitCitations({
    epicNumber: 883,
    children: CHILDREN,
    commits: COMMITS,
    body: body([
      '- [ ] One. <!-- aitm-verified commits="0badc0d" -->',
      '- [ ] Two. <!-- aitm-verified commits="d9d614f 1111111" -->',
    ]),
  });
  assert.equal(reasons.length, 2, 'both bad citations surface in one pass');
  assert.ok(reasons.some((r) => /0badc0d/.test(r)));
  assert.ok(reasons.some((r) => /1111111/.test(r)));
});

test('AC 2 — an abbreviated citation resolves against the full sha in the log', () => {
  assert.deepEqual(
    verifyAcCommitCitations({
      epicNumber: 883,
      children: CHILDREN,
      commits: COMMITS,
      body: body(['- [ ] Ok. <!-- aitm-verified commits="d9d614f d645e3d" -->']),
    }),
    []
  );
});

// ---------------------------------------------------------------- AC 3

test('AC 3 — a resolvable commit attributable to no child of this epic is refused', () => {
  const reasons = verifyAcCommitCitations({
    epicNumber: 883,
    children: CHILDREN,
    commits: COMMITS,
    body: body(['- [ ] Borrowed. <!-- aitm-verified commits="facade0" -->']),
  });
  assert.equal(reasons.length, 1);
  assert.match(reasons[0], /not attributable to any child of this epic/);
  assert.match(reasons[0], /#999/, 'the refusal names the ids the commit actually carries');
});

test('AC 3 — a resolvable commit carrying no [#N] token at all is refused', () => {
  const reasons = verifyAcCommitCitations({
    epicNumber: 883,
    children: CHILDREN,
    commits: COMMITS,
    body: body(['- [ ] Untagged. <!-- aitm-verified commits="decade0" -->']),
  });
  assert.equal(reasons.length, 1);
  assert.match(reasons[0], /no \[#N\] token/);
});

test('AC 3 — runReviewPreflight surfaces citation refusals on the epic branch', async () => {
  const res = await runReviewPreflight({
    issueNumber: 883,
    repo: 'o/r',
    projectDir: '/tmp/x',
    deps: {
      gitStatus: async () => '',
      gitHeadSha: async () => 'abc1234',
      findTrailComment: async () => null,
      hasAttributingCommit: async () => true,
      getIssueBody: async () => body(['- [ ] Borrowed. <!-- aitm-verified commits="facade0" -->']),
      fetchEpicChildren: async () => CHILDREN,
      epicCommits: async () => COMMITS,
    },
  });
  assert.equal(res.ok, false);
  assert.ok(
    res.reasons.some((r) => /not attributable to any child of this epic/.test(r)),
    `expected a citation refusal, got: ${JSON.stringify(res.reasons)}`
  );
});

test('AC 3 — a clean epic with valid citations still passes preflight', async () => {
  const res = await runReviewPreflight({
    issueNumber: 883,
    repo: 'o/r',
    projectDir: '/tmp/x',
    deps: {
      gitStatus: async () => '',
      gitHeadSha: async () => 'abc1234',
      findTrailComment: async () => null,
      hasAttributingCommit: async () => true,
      getIssueBody: async () =>
        body([
          '- [ ] Child #872 delivered X. <!-- aitm-verified commits="d9d614f" -->',
          '- [ ] Child #873 delivered Y. <!-- aitm-verified commits="d645e3d" -->',
        ]),
      fetchEpicChildren: async () => CHILDREN,
      epicCommits: async () => COMMITS,
    },
  });
  assert.deepEqual(res.reasons, []);
  assert.equal(res.ok, true);
});

// ---------------------------------------------------------------- AC 4

test('AC 4 — the existing `cmd` evidence form is unaffected by the citation path', () => {
  const cmdOnly = body([
    '- [ ] Backed by a probe. <!-- aitm-verified cmd="`node --test scripts/x.test.mjs`" -->',
  ]);
  assert.deepEqual(findAcsWithoutVerifierOrInvalidTag(cmdOnly), []);
  assert.equal(parseAcCommitCitation(cmdOnly), null, 'a cmd-only AC is not a citation');

  // `npm run test:all` alone is still rejected as the regression FLOOR, not an
  // AC verifier — the citation path must not have widened this hole.
  const testAllOnly = body(['- [ ] Floor only. <!-- aitm-verified cmd="`npm run test:all`" -->']);
  assert.deepEqual(
    findAcsWithoutVerifierOrInvalidTag(testAllOnly).map((o) => o.reason),
    ['test-all-verifier']
  );
});

test('AC 4 — an AC carrying BOTH a citation and a cmd keeps its command declaration', () => {
  const line =
    '- [ ] Both. <!-- aitm-verified cmd="`node --test scripts/x.test.mjs`" commits="d9d614f" -->';
  assert.deepEqual(findAcsWithoutVerifierOrInvalidTag(body([line])), []);
  assert.deepEqual(parseAcCommitCitation(line), ['d9d614f']);
});

test('AC 4 — the non-demonstrable opt-out still short-circuits ahead of the citation check', () => {
  const src = body([
    '- [ ] Subjective goal — invalid — non-demonstrable <!-- aitm-non-demonstrable -->',
  ]);
  assert.deepEqual(findAcsWithoutVerifierOrInvalidTag(src), []);
});

// ---------------------------------------------------------------- AC 5

const DOD_TEMPLATE = readFileSync(
  fileURLToPath(new URL('../../../../../templates/definition-of-done.md', import.meta.url)),
  'utf8'
);

test('AC 5 — the aggregate quality gates remain in the epic Definition of Done', () => {
  const epicDod = filterDodForKind(DOD_TEMPLATE, 'epic');
  assert.match(epicDod, /dod:functional:tests/, 'the test-suite DoD item renders for an epic');
  assert.match(epicDod, /dod:functional:lint/, 'the lint DoD item renders for an epic');
  assert.match(epicDod, /npm run test:all/);
  assert.match(epicDod, /npm run lint/);
  assert.match(epicDod, /npm run format:check/);
});

test('AC 5 — an epic whose every AC is commit-cited still carries the aggregate gates', () => {
  // The citation mechanism must not become a reason to relax the gates: a
  // citation proves work HAPPENED, the aggregate run proves it WORKS.
  const allCited = body([
    '- [ ] Child #872 delivered X. <!-- aitm-verified commits="d9d614f" -->',
    '- [ ] Child #873 delivered Y. <!-- aitm-verified commits="d645e3d" -->',
  ]);
  assert.deepEqual(findAcsWithoutVerifierOrInvalidTag(allCited), []);
  assert.equal(findAcCommitCitations(allCited).length, 2, 'every AC is citation-backed');

  const epicDod = filterDodForKind(DOD_TEMPLATE, 'epic');
  for (const gate of ['npm run test:all', 'npm run lint', 'npm run format:check']) {
    assert.ok(epicDod.includes(gate), `${gate} is still required at the epic level`);
  }
});
