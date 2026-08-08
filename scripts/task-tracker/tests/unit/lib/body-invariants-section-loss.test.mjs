// @story #725
// #725 — regression coverage for the generic unbounded-deletion guardrail.
//
// Verifies `findUnexpectedSectionLoss` / `UnexpectedSectionLossError` and their
// wiring into `mutateIssueBody`'s `guardedMutate`, including a synthetic
// reproduction of the #718/#724 boundary-regex bug that silently deleted five
// unrelated `## ` sections.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findUnexpectedSectionLoss,
  UnexpectedSectionLossError,
  collectLevel2Headings,
} from '../../../lib/body-invariants.mjs';
import { mutateIssueBody } from '../../../lib/issue-body-mutate.mjs';

const BASE = [
  '## User Story',
  'As an agent I want a guardrail.',
  '',
  '## Acceptance Criteria',
  '- [ ] the guard fires',
  '',
  '## What I want',
  'Protection against silent deletion.',
  '',
  '## Why it matters',
  'The #724 incident deleted five sections.',
  '',
  '## Notes',
  'Some notes here.',
  '',
  '## Environment',
  'node 18+',
  '',
  '<!-- aitm-fields: {"schema":1,"values":{}} -->',
  '<!-- aitm-body-version version="1" -->',
].join('\n');

test('collectLevel2Headings enumerates only level-2 headings', () => {
  const titles = collectLevel2Headings('## A\n### B\n## C\ntext\n#Nope');
  assert.deepEqual(titles, ['A', 'C']);
});

test('heading-loss: dropping a pre-existing ## section is a loss', () => {
  const next = BASE.replace('## Notes\nSome notes here.\n\n', '');
  const loss = findUnexpectedSectionLoss(BASE, next);
  assert.ok(loss, 'expected a loss descriptor');
  assert.deepEqual(loss.removedHeadings, ['Notes']);
});

test('heading-loss: no loss when nothing is removed', () => {
  const next = `${BASE}\n\n## Appendix\nAdded content.`;
  assert.equal(findUnexpectedSectionLoss(BASE, next), null);
});

test('allowlist: a declared removed heading is permitted', () => {
  const next = BASE.replace('## Notes\nSome notes here.\n\n', '');
  const loss = findUnexpectedSectionLoss(BASE, next, {
    expectedRemovedHeadings: ['Notes'],
  });
  assert.equal(loss, null);
});

test('allowlist: accepts both "## Foo" and "Foo" forms', () => {
  const next = BASE.replace('## Notes\nSome notes here.\n\n', '');
  assert.equal(
    findUnexpectedSectionLoss(BASE, next, { expectedRemovedHeadings: ['## Notes'] }),
    null
  );
});

test('large-shrink: >40% byte drop is a loss unless allowed', () => {
  // Remove enough content to exceed 40% while keeping all headings present, so
  // the shrink signal is exercised independently of heading loss.
  const padded = `${BASE}\n${'x'.repeat(2000)}`;
  const next = BASE; // dropping the 2000-char pad from `padded`
  const loss = findUnexpectedSectionLoss(padded, next);
  assert.ok(loss, 'expected a shrink loss');
  assert.equal(loss.shrinkExceeded, true);
  assert.equal(findUnexpectedSectionLoss(padded, next, { allowLargeShrink: true }), null);
});

test('#724 synthetic repro: boundary walk-past deletion fires the guard', () => {
  // A deep-dive section followed by unrelated `## ` sections and a distant
  // marker. The old `DEEP_DIVE_SECTION_END_RE` walked from just after the
  // deep-dive heading all the way to the `aitm-entered-develop` marker,
  // deleting every `## ` section in between. Reproduce that deletion.
  const body = [
    '## Deep-Dive Analysis (2026-07-07)',
    'Findings prose.',
    '',
    '## Acceptance Criteria',
    '- [ ] ac one',
    '',
    '## What I want',
    'text',
    '',
    '## Why it matters',
    'text',
    '',
    '## Notes',
    'text',
    '',
    '## Environment',
    'text',
    '',
    '<!-- aitm-entered-develop ts="2026-07-07T00:00:00.000Z" -->',
  ].join('\n');
  const buggyNext = [
    '## Deep-Dive Analysis (2026-07-07)',
    'Revised findings prose.',
    '',
    '<!-- aitm-entered-develop ts="2026-07-07T00:00:00.000Z" -->',
  ].join('\n');

  const loss = findUnexpectedSectionLoss(body, buggyNext);
  assert.ok(loss, 'expected the walk-past deletion to be caught');
  assert.deepEqual(loss.removedHeadings.sort(), [
    'Acceptance Criteria',
    'Environment',
    'Notes',
    'What I want',
    'Why it matters',
  ]);

  // With the allowlist NOT passed, the guard fires. With every eaten heading
  // declared AND the large-shrink override set (exactly what `ensureDeepDive`
  // passes), it would pass — proving the escape hatch is the only way through.
  assert.equal(
    findUnexpectedSectionLoss(body, buggyNext, {
      expectedRemovedHeadings: [
        'Acceptance Criteria',
        'What I want',
        'Why it matters',
        'Notes',
        'Environment',
      ],
      allowLargeShrink: true,
    }),
    null
  );
});

test('UnexpectedSectionLossError carries the removed headings', () => {
  const err = new UnexpectedSectionLossError(725, {
    removedHeadings: ['Notes', 'Environment'],
    shrinkRatio: 0.5,
    shrinkExceeded: true,
  });
  assert.equal(err.name, 'UnexpectedSectionLossError');
  assert.deepEqual(err.removedHeadings, ['Notes', 'Environment']);
  assert.match(err.message, /Notes, Environment/);
  assert.match(err.message, /allowLargeShrink/);
});

// Stateful in-memory GitHub stub matching versionedWriteBody's dep contract:
// fetchBody(repo, issueNumber) → body string; pushBody(repo, issueNumber, body).
function makeFakeDeps(initialBody) {
  let remote = initialBody;
  const pushes = [];
  return {
    deps: {
      fetchBody: async () => remote,
      pushBody: async (_repo, _issue, body) => {
        remote = body;
        pushes.push(body);
      },
    },
    pushes,
  };
}

test('mutateIssueBody throws UnexpectedSectionLossError on silent section drop', async () => {
  const { deps } = makeFakeDeps(BASE);
  await assert.rejects(
    () =>
      mutateIssueBody({
        issueNumber: 725,
        repo: 'owner/repo',
        deps,
        mutate: (base) => base.replace('## Notes\nSome notes here.\n\n', ''),
      }),
    (err) => {
      assert.equal(err.name, 'UnexpectedSectionLossError');
      assert.deepEqual(err.removedHeadings, ['Notes']);
      return true;
    }
  );
});

test('mutateIssueBody: allowMarkerLoss blanket-override also bypasses the section-loss guard', async () => {
  // An intentional reset (allowMarkerLoss) drops markers AND shrinks past the
  // threshold; the section-loss guard must not double-block it. Regression for
  // the #725 wiring that broke the pre-existing allowMarkerLoss reset test.
  const { deps, pushes } = makeFakeDeps(BASE);
  const res = await mutateIssueBody({
    issueNumber: 725,
    repo: 'owner/repo',
    deps,
    allowMarkerLoss: true,
    mutate: () => '## Acceptance Criteria\nintentional reset\n',
  });
  assert.equal(res.status, 'ok');
  assert.equal(pushes.length, 1);
});

test('mutateIssueBody permits the drop when the heading is declared', async () => {
  const { deps, pushes } = makeFakeDeps(BASE);
  const res = await mutateIssueBody({
    issueNumber: 725,
    repo: 'owner/repo',
    deps,
    expectedRemovedHeadings: ['Notes'],
    mutate: (base) => base.replace('## Notes\nSome notes here.\n\n', ''),
  });
  assert.equal(res.status, 'ok');
  assert.equal(pushes.length, 1);
  assert.ok(!pushes[0].includes('## Notes'));
});
