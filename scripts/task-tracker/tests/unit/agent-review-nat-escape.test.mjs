// @story #944
// NAT-gate escape: honest "no new tests — guarded by a pre-existing test"
// declaration. Proves the fail-closed reader, the mutateIssueBody-routed writer,
// and the Agent Review V2 gate integration.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { hasNoNewTestsDeclaration } from '../../lib/issue-kind.mjs';
import { upsertNoNewTestsMarker, declareNoNewTests } from '../../lib/no-new-tests-declaration.mjs';
import { validate as validateRequiredComments } from '../../lib/agent-review/validators/required-comments.mjs';

const MARKER = (reason, guardedBy) =>
  `<!-- aitm-no-new-tests reason="${reason}"${guardedBy ? ` guarded-by="${guardedBy}"` : ''} -->`;

const NAT_FAILURE = "required comment 'New Automated Tests' is missing";

// The other required comments are irrelevant to these cases; a bare body fails all
// of them. We assert only on the presence/absence of the NAT failure.
function natRequired(body) {
  const { failures } = validateRequiredComments({ comments: [], body });
  return failures.includes(NAT_FAILURE);
}

describe('hasNoNewTestsDeclaration — fail-closed reader (#944)', () => {
  it('true when the marker carries a non-empty reason', () => {
    assert.equal(hasNoNewTestsDeclaration(`x ${MARKER('greens quality-config.test.mjs')} y`), true);
  });

  it('true with both reason and guarded-by present', () => {
    assert.equal(
      hasNoNewTestsDeclaration(MARKER('dedupe fix', 'scripts/x/quality-config.test.mjs')),
      true
    );
  });

  it('false when the marker is absent', () => {
    assert.equal(hasNoNewTestsDeclaration('a body with no marker at all'), false);
  });

  it('false when reason is empty (default-deny)', () => {
    assert.equal(hasNoNewTestsDeclaration(MARKER('')), false);
  });

  it('false when reason is whitespace-only (default-deny)', () => {
    assert.equal(hasNoNewTestsDeclaration(MARKER('   ')), false);
  });

  it('false when the marker has no reason attribute', () => {
    assert.equal(hasNoNewTestsDeclaration('<!-- aitm-no-new-tests -->'), false);
    assert.equal(
      hasNoNewTestsDeclaration('<!-- aitm-no-new-tests guarded-by="foo.test.mjs" -->'),
      false
    );
  });

  it('tolerates null/undefined bodies', () => {
    assert.equal(hasNoNewTestsDeclaration(null), false);
    assert.equal(hasNoNewTestsDeclaration(undefined), false);
  });
});

describe('upsertNoNewTestsMarker — idempotent writer (#944)', () => {
  it('throws when reason is empty or whitespace', () => {
    assert.throws(() => upsertNoNewTestsMarker('body', { reason: '' }), /reason must be/);
    assert.throws(() => upsertNoNewTestsMarker('body', { reason: '   ' }), /reason must be/);
    assert.throws(() => upsertNoNewTestsMarker('body', {}), /reason must be/);
  });

  it('inserts a marker the reader accepts', () => {
    const out = upsertNoNewTestsMarker('## Scope\n\ntext\n', {
      reason: 'greens a pre-existing test',
    });
    assert.equal(hasNoNewTestsDeclaration(out), true);
  });

  it('is idempotent — a second call leaves exactly one marker', () => {
    let body = 'base body\n';
    body = upsertNoNewTestsMarker(body, { reason: 'r1', guardedBy: 'a.test.mjs' });
    body = upsertNoNewTestsMarker(body, { reason: 'r2', guardedBy: 'b.test.mjs' });
    const count = (body.match(/aitm-no-new-tests/g) || []).length;
    assert.equal(count, 1);
    assert.equal(hasNoNewTestsDeclaration(body), true);
    assert.match(body, /reason="r2"/);
    assert.doesNotMatch(body, /reason="r1"/);
  });

  it('places the marker under the AITM Progress Markers block when present', () => {
    const body = 'text\n\n## AITM Progress Markers\n\n<!-- aitm-entered-develop ts="x" -->\n';
    const out = upsertNoNewTestsMarker(body, { reason: 'guarded' });
    const idxHeading = out.indexOf('## AITM Progress Markers');
    const idxMarker = out.indexOf('aitm-no-new-tests');
    assert.ok(idxHeading >= 0 && idxMarker > idxHeading, 'marker sits under the progress block');
  });

  it('escapes an embedded double-quote in the reason', () => {
    const out = upsertNoNewTestsMarker('b', { reason: 'the "pre-existing" test' });
    assert.match(out, /&quot;pre-existing&quot;/);
    assert.equal(hasNoNewTestsDeclaration(out), true);
  });
});

describe('declareNoNewTests — mutateIssueBody-routed (#944)', () => {
  it('routes the write through the injected mutateIssueBody and stamps the marker', async () => {
    let captured = null;
    const fakeMutate = async ({ issueNumber, repo, mutate }) => {
      captured = { issueNumber, repo };
      const base = '## Scope\n\nbody\n';
      return { status: 'ok', body: mutate(base) };
    };
    const res = await declareNoNewTests({
      issueNumber: 942,
      repo: 'kburson/ai-task-manager',
      reason: 'cspell dedupe greens quality-config.test.mjs',
      guardedBy: 'scripts/task-tracker/tests/quality-config.test.mjs',
      deps: { mutateIssueBody: fakeMutate },
    });
    assert.deepEqual(captured, { issueNumber: 942, repo: 'kburson/ai-task-manager' });
    assert.equal(hasNoNewTestsDeclaration(res.body), true);
  });

  it('rejects a missing issueNumber / repo', async () => {
    await assert.rejects(() => declareNoNewTests({ repo: 'x', reason: 'r' }), /issueNumber/);
    await assert.rejects(() => declareNoNewTests({ issueNumber: 1, reason: 'r' }), /repo/);
  });
});

describe('required-comments V2 — NAT row escape integration (#944)', () => {
  it('code body with no declaration still REQUIRES the NAT comment', () => {
    assert.equal(natRequired('a plain code-kind body'), true);
  });

  it('code body with a valid declaration SKIPS the NAT requirement', () => {
    assert.equal(natRequired(`code body\n${MARKER('greens a pre-existing test')}`), false);
  });

  it('code body with an empty-reason declaration still REQUIRES the NAT comment', () => {
    assert.equal(natRequired(`code body\n${MARKER('')}`), true);
  });

  it('docs-only body with a proven docs-only diff skips NAT (#940 diff-aware)', () => {
    const body = 'body\n<!-- aitm-issue-kind kind="docs-only" -->';
    const { failures } = validateRequiredComments({
      comments: [],
      body,
      changedPaths: ['docs/readme.md', 'README.md'],
    });
    assert.equal(failures.includes(NAT_FAILURE), false);
  });

  it('docs-only body with no diff info now REQUIRES NAT (#940 default-deny)', () => {
    // Pre-#940 a docs-only body skipped NAT unconditionally (kind-only). Post-#940
    // the diff decides: an empty/unclassifiable changed-path set is default-deny,
    // so the NAT requirement is kept until a docs-only diff is proven.
    assert.equal(natRequired('body\n<!-- aitm-issue-kind kind="docs-only" -->'), true);
  });

  it('epic body is unchanged — NAT already skipped', () => {
    assert.equal(natRequired('body\n<!-- aitm-issue-kind kind="epic" -->'), false);
  });

  it('a present NAT comment satisfies the row regardless of declaration', () => {
    const { failures } = validateRequiredComments({
      comments: [{ body: '## New Automated Tests\n\n- `a.test.mjs`\n  - t1\n' }],
      body: 'a plain code-kind body',
    });
    assert.ok(!failures.includes(NAT_FAILURE));
  });
});
